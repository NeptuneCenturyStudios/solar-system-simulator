export type Vec3 = { x: number; y: number; z: number };

export function clamp01(v: number): number {
    return Math.max(0, Math.min(1, v));
}

export function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}

export function fade(t: number): number {
    // Perlin fade curve
    return t * t * t * (t * (t * 6 - 15) + 10);
}

// FNV-1a for seed -> u32
export function hashStringToU32(seed: string): number {
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

export function valueNoise3D(x: number, y: number, z: number, seedU32: number): number {
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

export function fbm3D(x: number, y: number, z: number, octaves: number, seedU32: number): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;

    for (let i = 0; i < octaves; i++) {
        const nx = x * freq;
        const ny = y * freq;
        const nz = z * freq;
        const n = valueNoise3D(nx, ny, nz, seedU32) * 2 - 1; // [-1..1]
        sum += amp * n;
        amp *= 0.5;
        freq *= 2;
    }

    return sum;
}

export function dot(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function normalizeSafe(v: Vec3): Vec3 {
    const l = Math.hypot(v.x, v.y, v.z);
    if (l < 1e-12) return { x: 0, y: 0, z: 1 };
    return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function mix3(a: Vec3, b: Vec3, t: number): Vec3 {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}
