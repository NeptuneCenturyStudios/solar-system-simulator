import * as THREE from 'three';
import { SeededRandom } from '../../utilities/prng';

const TEXTURE_WIDTH = 2024;
const TEXTURE_HEIGHT = 1024;

const INTERNAL_WIDTH = TEXTURE_WIDTH;
const INTERNAL_HEIGHT = TEXTURE_HEIGHT;

// Noise tuning (tweakable)
const NOISE_DUNE_SCALE = 18.0;
const NOISE_DUNE_OCTAVES = 6;

const NOISE_OASIS_SCALE = 2.2;
const NOISE_OASIS_OCTAVES = 3;

// Normal-map tuning
// Lower strength so normals don't look like shiny foil; we rely on rough material for sandy feel.
const NORMAL_STRENGTH = 0.9;

// Subtle crater / impact micro-detail (for more “sandy realism”)
const NOISE_CRATER_SCALE = 40.0;
const NOISE_CRATER_OCTAVES = 4;
const CRATER_STRENGTH = 0.1;
const CRATER_MASK_EDGE0 = 0.62;
const CRATER_MASK_EDGE1 = 0.92;

// Crack / fractured crust detail (to match your reference more closely)
const NOISE_CRACK_SCALE = 80.0;
const NOISE_CRACK_OCTAVES = 3;
const CRACK_STRENGTH = 0.18;

// Flatten normal/height detail near poles to avoid “weird” polar shading artifacts.
const POLAR_FLAT_START = 0.65; // 0..1 (0=equator, 1=pole)
const POLAR_FLAT_END = 0.98; // higher => affects only the very top/bottom

type Vec3 = { x: number; y: number; z: number };

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function fade(t: number): number {
  // Perlin fade curve
  return t * t * t * (t * (t * 6 - 15) + 10);
}

// FNV-1a for seed -> u32
function hashStringToU32(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function hashU32(x: number, y: number, z: number, seedU32: number): number {
  let h = seedU32 ^ Math.imul(x, 0x9e3779b1);
  h ^= Math.imul(y, 0x85ebca77);
  h ^= Math.imul(z, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

function valueNoise3D(x: number, y: number, z: number, seedU32: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);

  const xf = x - xi;
  const yf = y - yi;
  const zf = z - zi;

  const u = fade(xf);
  const v = fade(yf);
  const w = fade(zf);

  const n000 = hashU32(xi, yi, zi, seedU32) / 4294967295;
  const n100 = hashU32(xi + 1, yi, zi, seedU32) / 4294967295;
  const n010 = hashU32(xi, yi + 1, zi, seedU32) / 4294967295;
  const n110 = hashU32(xi + 1, yi + 1, zi, seedU32) / 4294967295;

  const n001 = hashU32(xi, yi, zi + 1, seedU32) / 4294967295;
  const n101 = hashU32(xi + 1, yi, zi + 1, seedU32) / 4294967295;
  const n011 = hashU32(xi, yi + 1, zi + 1, seedU32) / 4294967295;
  const n111 = hashU32(xi + 1, yi + 1, zi + 1, seedU32) / 4294967295;

  const x00 = lerp(n000, n100, u);
  const x10 = lerp(n010, n110, u);
  const x01 = lerp(n001, n101, u);
  const x11 = lerp(n011, n111, u);

  const y0 = lerp(x00, x10, v);
  const y1 = lerp(x01, x11, v);

  return lerp(y0, y1, w);
}

function fbm3D(x: number, y: number, z: number, octaves: number, seedU32: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;

  for (let i = 0; i < octaves; i++) {
    const nx = x * freq;
    const ny = y * freq;
    const nz = z * freq;
    const n = valueNoise3D(nx, ny, nz, seedU32) * 2 - 1;
    sum += amp * n;
    amp *= 0.5;
    freq *= 2;
  }

  return sum;
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function normalizeSafe(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  if (l < 1e-12) return { x: 0, y: 0, z: 1 };
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

type DesertMaps = {
  color: THREE.Texture;
  normal: THREE.Texture;
};

const colorCache = new Map<string, THREE.Texture>();
const normalCache = new Map<string, THREE.Texture>();

function getOrCreateDesertMapsForSeed(seed: string): DesertMaps {
  const cacheKey = seed.trim();
  const cachedColor = colorCache.get(cacheKey);
  const cachedNormal = normalCache.get(cacheKey);
  if (cachedColor && cachedNormal) return { color: cachedColor, normal: cachedNormal };

  const seedU32 = hashStringToU32(cacheKey);

  // Deterministic climate axis:
  const climateRng = new SeededRandom(`${cacheKey}|climate-axis`);
  const yaw = climateRng.range(0, Math.PI * 2);

  const up: Vec3 = { x: 0, y: 1, z: 0 };
  const north: Vec3 = { x: Math.cos(yaw), y: 0, z: Math.sin(yaw) };
  const east: Vec3 = { x: -Math.sin(yaw), y: 0, z: Math.cos(yaw) };

  // Seeded offsets for noise so deserts vary between planets
  const ox = climateRng.range(-200, 200);
  const oy = climateRng.range(-200, 200);
  const oz = climateRng.range(-200, 200);

  const sandColor: Vec3 = { x: 0.86, y: 0.74, z: 0.53 };
  const darkSand: Vec3 = { x: 0.63, y: 0.52, z: 0.35 };
  const paleSand: Vec3 = { x: 0.97, y: 0.88, z: 0.65 };

  const rockColor: Vec3 = { x: 0.63, y: 0.6, z: 0.58 };
  const waterColor: Vec3 = { x: 0.26, y: 0.55, z: 0.6 };

  const canvas = document.createElement('canvas');
  canvas.width = INTERNAL_WIDTH;
  canvas.height = INTERNAL_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to create desert texture canvas');

  const img = ctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
  const data = img.data;

  const height = new Float32Array(INTERNAL_WIDTH * INTERNAL_HEIGHT);

  // Precompute lon for internal x
  const lonCos = new Float32Array(INTERNAL_WIDTH);
  const lonSin = new Float32Array(INTERNAL_WIDTH);
  for (let x = 0; x < INTERNAL_WIDTH; x++) {
    const u01 = x / Math.max(1, INTERNAL_WIDTH - 1);
    const lon = u01 * Math.PI * 2;
    lonCos[x] = Math.cos(lon);
    lonSin[x] = Math.sin(lon);
  }

  // Precompute lat sin/cos for internal y
  const latSin = new Float32Array(INTERNAL_HEIGHT);
  const latCos = new Float32Array(INTERNAL_HEIGHT);
  for (let y = 0; y < INTERNAL_HEIGHT; y++) {
    const v01 = y / Math.max(1, INTERNAL_HEIGHT - 1);
    const lat = (0.5 - v01) * Math.PI;
    latSin[y] = Math.sin(lat);
    latCos[y] = Math.cos(lat);
  }

  // We want uniform deserts (no distinctive “desert poles”), so mask is 1 everywhere.
  const hotMask = 1.0;

  for (let y = 0; y < INTERNAL_HEIGHT; y++) {
    const sLat = latSin[y]!;
    const cLat = latCos[y]!;

    const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
    const pole01 = Math.abs(v01Pole - 0.5) / 0.5; // 0..1
    const flatMask = 1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01);

    for (let x = 0; x < INTERNAL_WIDTH; x++) {
      const cLon = lonCos[x]!;
      const sLon = lonSin[x]!;

      // Direction on unit sphere from equirectangular coords.
      const dx = cLat * cLon;
      const dy = sLat;
      const dz = cLat * sLon;

      // Transform direction into climate local frame using dot products.
      const yLocal = dot({ x: dx, y: dy, z: dz }, up);
      const xLocal = dot({ x: dx, y: dy, z: dz }, east);
      const zLocal = dot({ x: dx, y: dy, z: dz }, north);

      const dunesN = fbm3D(
        xLocal * NOISE_DUNE_SCALE + ox,
        yLocal * NOISE_DUNE_SCALE + oy,
        zLocal * NOISE_DUNE_SCALE + oz,
        NOISE_DUNE_OCTAVES,
        seedU32
      );

      // Suppress detail near poles to avoid polar shading artifacts.
      const dunesNMasked = dunesN * flatMask;

      const crackN = fbm3D(
        xLocal * NOISE_CRACK_SCALE + (ox + 1234.56),
        yLocal * NOISE_CRACK_SCALE + (oy - 234.12),
        zLocal * NOISE_CRACK_SCALE + (oz + 98.76),
        NOISE_CRACK_OCTAVES,
        seedU32
      );
      const crackRidged = Math.abs(crackN);
      const crackMask = hotMask * flatMask * smoothstep(0.55, 0.78, crackRidged);

      const craterN = fbm3D(
        xLocal * NOISE_CRATER_SCALE + (ox + 999.13),
        yLocal * NOISE_CRATER_SCALE + (oy - 321.71),
        zLocal * NOISE_CRATER_SCALE + (oz + 77.77),
        NOISE_CRATER_OCTAVES,
        seedU32
      );
      const craterRidged = 1 - Math.abs(craterN);
      const craterMask = hotMask * flatMask * smoothstep(CRATER_MASK_EDGE0, CRATER_MASK_EDGE1, craterRidged);

      // Height drives both normals + some color micro-contrast.
      height[y * INTERNAL_WIDTH + x] =
        dunesNMasked + CRATER_STRENGTH * craterRidged * craterMask + CRACK_STRENGTH * crackRidged * crackMask;

      const dunesRidged = 1 - Math.abs(dunesNMasked);
      const dunesT = clamp01(0.5 + 0.65 * dunesRidged);

      const oasisN = fbm3D(
        xLocal * NOISE_OASIS_SCALE + (ox + 777.1),
        yLocal * NOISE_OASIS_SCALE + (oy - 133.7),
        zLocal * NOISE_OASIS_SCALE + (oz + 42.5),
        NOISE_OASIS_OCTAVES,
        seedU32
      );
      const oasisBlob = smoothstep(0.48, 0.78, oasisN * 0.5 + 0.5) * hotMask * flatMask;

      // Color
      const baseRock = rockColor;
      let col = mix3(baseRock, sandColor, hotMask);

      const duneLight = mix3(darkSand, paleSand, dunesT);
      col = mix3(col, duneLight, hotMask * 0.75);

      // Contrast (sandy relief)
      const contrast = 0.72 + 0.28 * dunesNMasked;
      col = { x: col.x * contrast, y: col.y * contrast, z: col.z * contrast };

      // Crust cracks (thin-ish)
      if (crackMask > 0) {
        const crackColor = mix3(darkSand, rockColor, 0.35);
        col = mix3(col, crackColor, crackMask * 0.45);
      }

      // Oases (subtle)
      if (oasisBlob > 0) {
        const oasisCol = mix3(waterColor, paleSand, 0.15 + 0.25 * dunesT);
        col = mix3(col, oasisCol, oasisBlob);
        // Keep halo sandy (not icy/polar)
        col = mix3(col, sandColor, oasisBlob * 0.7);
      }

      const r = Math.round(clamp01(col.x) * 255);
      const g = Math.round(clamp01(col.y) * 255);
      const b = Math.round(clamp01(col.z) * 255);

      const pIndex = (y * INTERNAL_WIDTH + x) * 4;
      data[pIndex] = r;
      data[pIndex + 1] = g;
      data[pIndex + 2] = b;
      data[pIndex + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);

  // Normal map from height (seam-safe because we wrap x)
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = INTERNAL_WIDTH;
  normalCanvas.height = INTERNAL_HEIGHT;

  const nctx = normalCanvas.getContext('2d');
  if (!nctx) throw new Error('Failed to create desert normal canvas');

  const nimg = nctx.createImageData(INTERNAL_WIDTH, INTERNAL_HEIGHT);
  const ndata = nimg.data;

  for (let y = 0; y < INTERNAL_HEIGHT; y++) {
    const yU = y > 0 ? y - 1 : 0;
    const yD = y + 1 < INTERNAL_HEIGHT ? y + 1 : INTERNAL_HEIGHT - 1;

    const v01Pole = y / Math.max(1, INTERNAL_HEIGHT - 1);
    const pole01 = Math.abs(v01Pole - 0.5) / 0.5; // 0..1
    const normalFlatMask = 1 - smoothstep(POLAR_FLAT_START, POLAR_FLAT_END, pole01);

    for (let x = 0; x < INTERNAL_WIDTH; x++) {
      const xL = x > 0 ? x - 1 : INTERNAL_WIDTH - 1;
      const xR = x + 1 < INTERNAL_WIDTH ? x + 1 : 0;

      const hL = height[y * INTERNAL_WIDTH + xL]!;
      const hR = height[y * INTERNAL_WIDTH + xR]!;
      const hU = height[yU * INTERNAL_WIDTH + x]!;
      const hD = height[yD * INTERNAL_WIDTH + x]!;
      const dxH = hR - hL;
      const dyH = hD - hU;

      // Tangent-space normal approximation.
      const nx = -dxH * NORMAL_STRENGTH * normalFlatMask;
      const ny = -dyH * NORMAL_STRENGTH * normalFlatMask;
      const nz = 1.0;

      const n = normalizeSafe({ x: nx, y: ny, z: nz });

      const out = (n.z * 0.5 + 0.5) * 255;
      const outX = (n.x * 0.5 + 0.5) * 255;
      // Invert Y (green) to match Three.js normal-map convention for this generated tangent basis.
      const outY = (1 - (n.y * 0.5 + 0.5)) * 255;

      const i = (y * INTERNAL_WIDTH + x) * 4;
      ndata[i] = Math.round(outX);
      ndata[i + 1] = Math.round(outY);
      ndata[i + 2] = Math.round(out);
      ndata[i + 3] = 255;
    }
  }

  nctx.putImageData(nimg, 0, 0);

  const colorTex = new THREE.CanvasTexture(canvas);
  colorTex.colorSpace = THREE.SRGBColorSpace;
  colorTex.wrapS = THREE.RepeatWrapping;
  colorTex.wrapT = THREE.ClampToEdgeWrapping;
  colorTex.generateMipmaps = false;
  colorTex.minFilter = THREE.NearestFilter;
  colorTex.magFilter = THREE.NearestFilter;
  colorTex.anisotropy = 16;
  colorTex.needsUpdate = true;

  const normalTex = new THREE.CanvasTexture(normalCanvas);
  normalTex.wrapS = THREE.RepeatWrapping;
  normalTex.wrapT = THREE.ClampToEdgeWrapping;
  normalTex.generateMipmaps = false;
  normalTex.minFilter = THREE.LinearFilter;
  normalTex.magFilter = THREE.LinearFilter;
  normalTex.anisotropy = 16;
  normalTex.needsUpdate = true;

  colorCache.set(cacheKey, colorTex);
  normalCache.set(cacheKey, normalTex);

  return { color: colorTex, normal: normalTex };
}

export function getDesertTexture(seed: string): THREE.Texture {
  return getOrCreateDesertMapsForSeed(seed).color;
}

export function getDesertNormalTexture(seed: string): THREE.Texture {
  return getOrCreateDesertMapsForSeed(seed).normal;
}
