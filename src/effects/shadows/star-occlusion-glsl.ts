/**
 * GLSL: fraction of a star's disc hidden by a spherical occluder, as seen from one point.
 *
 * `starDiscOcclusion(a, b, t)` takes the star's angular radius `a`, the occluder's angular radius
 * `b`, and the angle `t` between their centres, all in radians, and returns the overlap area of the
 * two discs over the star's area. That one function covers the umbra (the occluder hides the whole
 * star), the penumbra (partial overlap) and the antumbra (an occluder smaller than the star in the
 * sky, which can never hide all of it). It treats the sky patch as flat, which is accurate wherever
 * the star's disc is small; the edge itself sits at the exact angular radius of the occluder either
 * way.
 *
 * Shared by the planet rings (the planet shadowing its rings) and the eclipse shadows (any body
 * shadowing any lit surface). Expects three.js's `PI` from <common>.
 */
export const STAR_OCCLUSION_GLSL = /* glsl */ `
    float starDiscOcclusion(float a, float b, float t) {
        if (t >= a + b) return 0.0;
        if (t <= abs(b - a)) return min(1.0, (b * b) / (a * a));
        float a2 = a * a;
        float b2 = b * b;
        float t2 = t * t;
        float ca = clamp((t2 + a2 - b2) / (2.0 * t * a), -1.0, 1.0);
        float cb = clamp((t2 + b2 - a2) / (2.0 * t * b), -1.0, 1.0);
        float k = max((-t + a + b) * (t + a - b) * (t - a + b) * (t + a + b), 0.0);
        float area = a2 * acos(ca) + b2 * acos(cb) - 0.5 * sqrt(k);
        return clamp(area / (PI * a2), 0.0, 1.0);
    }
`;
