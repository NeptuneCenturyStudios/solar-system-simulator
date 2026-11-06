import * as THREE from 'three';
import { SeededRandom } from '../utilities/prng';

/**
 * Tiling 3D noise shared by every cloud layer (see effects/cloud-coverage-glsl.ts).
 *
 * - R: Perlin-Worley. Smooth, billowy fbm whose low end is carved by Worley cells, the shape
 *      the coverage map is thresholded from.
 * - G/B/A: Worley fbm at three rising frequencies, used by the volumetric tiers to erode the
 *      edges of the clouds into puffs.
 *
 * Every channel tiles with period 1, so the shader can sample it at any scale with
 * RepeatWrapping and never see a seam. Built once, lazily, on the first cloud layer, from a
 * fixed seed so every run (and every machine) gets the same clouds for the same body seed.
 */

/** Voxels along each edge. 64³ RGBA8 is 1 MiB of GPU memory. */
const SIZE = 64;
/** Lattice period of the lowest Perlin octave (features per texture repeat). */
const PERLIN_BASE_PERIOD = 4;
const PERLIN_OCTAVES = 4;
/**
 * Worley cell counts per repeat. Each channel's fbm uses three consecutive octaves of this list:
 * R and G start at 4, B at 8, A at 16. Every frequency is evaluated once per voxel and shared.
 */
const WORLEY_CELLS = [4, 8, 16, 32, 64] as const;
const NOISE_SEED = 'cloud-noise-v1';

let _texture: THREE.Data3DTexture | null = null;

/** The shared cloud noise volume, built on first call. */
export function getCloudNoiseTexture(): THREE.Data3DTexture {
    if (_texture) return _texture;

    const rng = new SeededRandom(NOISE_SEED);
    const perlin = new TilingPerlin(rng);
    const worley = WORLEY_CELLS.map((cells) => new TilingWorley(cells, rng));
    const w = new Float32Array(WORLEY_CELLS.length);
    /** Three-octave Worley fbm starting at WORLEY_CELLS[first], from this voxel's samples. */
    const worleyFbm = (first: number): number =>
        w[first] * 0.625 + w[first + 1] * 0.25 + w[first + 2] * 0.125;

    const count = SIZE * SIZE * SIZE;
    const r = new Float32Array(count);
    const g = new Float32Array(count);
    const b = new Float32Array(count);
    const a = new Float32Array(count);

    let i = 0;
    for (let zi = 0; zi < SIZE; zi++) {
        const z = (zi + 0.5) / SIZE;
        for (let yi = 0; yi < SIZE; yi++) {
            const y = (yi + 0.5) / SIZE;
            for (let xi = 0; xi < SIZE; xi++, i++) {
                const x = (xi + 0.5) / SIZE;

                // Perlin fbm, roughly 0..1.
                let p = 0;
                let amp = 0.5;
                let norm = 0;
                let period = PERLIN_BASE_PERIOD;
                for (let o = 0; o < PERLIN_OCTAVES; o++) {
                    p += perlin.sample(x * period, y * period, z * period, period) * amp;
                    norm += amp;
                    amp *= 0.5;
                    period *= 2;
                }
                p = (p / norm) * 0.5 + 0.5;

                // Perlin-Worley: the Worley fbm lifts the floor the Perlin is remapped from,
                // carving round billows into the soft Perlin shapes.
                for (let k = 0; k < worley.length; k++) w[k] = worley[k].sample(x, y, z);
                const wc = worleyFbm(0);
                r[i] = remap(p, wc - 1, 1, 0, 1);

                g[i] = wc;
                b[i] = worleyFbm(1);
                a[i] = worleyFbm(2);
            }
        }
    }

    const data = new Uint8Array(count * 4);

    // R is histogram-equalised (uniform over 0..1), so a coverage fraction maps to a predictable
    // threshold in the shader: covering 60% of the globe means thresholding near the 40th
    // percentile, whatever shape the raw Perlin-Worley distribution had.
    const order = new Uint32Array(count);
    for (let k = 0; k < count; k++) order[k] = k;
    order.sort((x, y) => r[x] - r[y]);
    for (let rank = 0; rank < count; rank++) {
        data[order[rank] * 4] = Math.round((rank / (count - 1)) * 255);
    }

    // The detail channels only need their full 0..1 range.
    const channels = [r, g, b, a];
    for (let c = 1; c < 4; c++) {
        const src = channels[c];
        let min = Infinity;
        let max = -Infinity;
        for (let k = 0; k < count; k++) {
            if (src[k] < min) min = src[k];
            if (src[k] > max) max = src[k];
        }
        const scale = max > min ? 255 / (max - min) : 0;
        for (let k = 0; k < count; k++) {
            data[k * 4 + c] = Math.round((src[k] - min) * scale);
        }
    }

    const texture = new THREE.Data3DTexture(data, SIZE, SIZE, SIZE);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.wrapR = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    _texture = texture;
    return texture;
}

function remap(v: number, lo: number, hi: number, newLo: number, newHi: number): number {
    return newLo + ((v - lo) / (hi - lo)) * (newHi - newLo);
}

/** Inverted cellular noise (1 at a feature point, falling to 0 a cell away), tiling over 0..1. */
class TilingWorley {
    private readonly cells: number;
    /** Feature point per cell, in cell-local 0..1 coordinates. */
    private readonly points: Float32Array;

    constructor(cells: number, rng: SeededRandom) {
        this.cells = cells;
        this.points = new Float32Array(cells * cells * cells * 3);
        for (let k = 0; k < this.points.length; k++) this.points[k] = rng.next();
    }

    sample(x: number, y: number, z: number): number {
        const n = this.cells;
        const px = x * n;
        const py = y * n;
        const pz = z * n;
        const cx = Math.floor(px);
        const cy = Math.floor(py);
        const cz = Math.floor(pz);
        let best = Infinity;
        for (let dz = -1; dz <= 1; dz++) {
            const zz = cz + dz;
            const wz = ((zz % n) + n) % n;
            for (let dy = -1; dy <= 1; dy++) {
                const yy = cy + dy;
                const wy = ((yy % n) + n) % n;
                for (let dx = -1; dx <= 1; dx++) {
                    const xx = cx + dx;
                    const wx = ((xx % n) + n) % n;
                    const idx = ((wz * n + wy) * n + wx) * 3;
                    const fx = xx + this.points[idx] - px;
                    const fy = yy + this.points[idx + 1] - py;
                    const fz = zz + this.points[idx + 2] - pz;
                    const d = fx * fx + fy * fy + fz * fz;
                    if (d < best) best = d;
                }
            }
        }
        return 1 - Math.min(Math.sqrt(best), 1);
    }
}

/** Gradient noise whose lattice wraps at `period`, so it tiles. Output roughly -1..1. */
class TilingPerlin {
    private readonly perm: Uint16Array;
    private readonly grads: Float32Array;

    constructor(rng: SeededRandom) {
        const n = 256;
        const p = new Uint16Array(n);
        for (let k = 0; k < n; k++) p[k] = k;
        for (let k = n - 1; k > 0; k--) {
            const j = Math.floor(rng.next() * (k + 1));
            const t = p[k];
            p[k] = p[j];
            p[j] = t;
        }
        this.perm = new Uint16Array(n * 2);
        for (let k = 0; k < n * 2; k++) this.perm[k] = p[k & 255];

        // Random unit gradients.
        this.grads = new Float32Array(n * 3);
        for (let k = 0; k < n; k++) {
            const theta = rng.next() * Math.PI * 2;
            const u = rng.next() * 2 - 1;
            const s = Math.sqrt(1 - u * u);
            this.grads[k * 3] = s * Math.cos(theta);
            this.grads[k * 3 + 1] = s * Math.sin(theta);
            this.grads[k * 3 + 2] = u;
        }
    }

    private dotGrad(
        ix: number,
        iy: number,
        iz: number,
        period: number,
        fx: number,
        fy: number,
        fz: number
    ): number {
        const x = ((ix % period) + period) % period;
        const y = ((iy % period) + period) % period;
        const z = ((iz % period) + period) % period;
        const h = this.perm[this.perm[this.perm[x & 255] + (y & 255)] + (z & 255)] * 3;
        return this.grads[h] * fx + this.grads[h + 1] * fy + this.grads[h + 2] * fz;
    }

    sample(x: number, y: number, z: number, period: number): number {
        const ix = Math.floor(x);
        const iy = Math.floor(y);
        const iz = Math.floor(z);
        const fx = x - ix;
        const fy = y - iy;
        const fz = z - iz;
        const u = fade(fx);
        const v = fade(fy);
        const w = fade(fz);

        const n000 = this.dotGrad(ix, iy, iz, period, fx, fy, fz);
        const n100 = this.dotGrad(ix + 1, iy, iz, period, fx - 1, fy, fz);
        const n010 = this.dotGrad(ix, iy + 1, iz, period, fx, fy - 1, fz);
        const n110 = this.dotGrad(ix + 1, iy + 1, iz, period, fx - 1, fy - 1, fz);
        const n001 = this.dotGrad(ix, iy, iz + 1, period, fx, fy, fz - 1);
        const n101 = this.dotGrad(ix + 1, iy, iz + 1, period, fx - 1, fy, fz - 1);
        const n011 = this.dotGrad(ix, iy + 1, iz + 1, period, fx, fy - 1, fz - 1);
        const n111 = this.dotGrad(ix + 1, iy + 1, iz + 1, period, fx - 1, fy - 1, fz - 1);

        const x00 = lerp(n000, n100, u);
        const x10 = lerp(n010, n110, u);
        const x01 = lerp(n001, n101, u);
        const x11 = lerp(n011, n111, u);
        return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 1.5;
    }
}

function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}
