/**
 * 4D simplex noise and fBm for the star surface shader.
 *
 * `snoise4` is Stefan Gustavson / Ian McEwan's (Ashima Arts) webgl-noise, MIT licensed —
 * https://github.com/stegu/webgl-noise. Symbols are prefixed `ss_` so the chunk can be injected
 * into a built-in three.js shader without colliding with its own helpers.
 *
 * The fourth dimension is time: sliding `w` makes the pattern churn in place ("boiling")
 * instead of scrolling, which is what the Blender model's animated noise `W` input did.
 */
export const STAR_NOISE_GLSL = /* glsl */ `
vec4 ss_mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
float ss_mod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 ss_permute(vec4 x) { return ss_mod289(((x * 34.0) + 10.0) * x); }
float ss_permute(float x) { return ss_mod289(((x * 34.0) + 10.0) * x); }
vec4 ss_taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float ss_taylorInvSqrt(float r) { return 1.79284291400159 - 0.85373472095314 * r; }

vec4 ss_grad4(float j, vec4 ip) {
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p, s;
    p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
    return p;
}

float ss_snoise4(vec4 v) {
    const vec4 C = vec4(
        0.138196601125011,
        0.276393202250021,
        0.414589803375032,
        -0.447213595499958
    );
    vec4 i = floor(v + dot(v, vec4(0.309016994374947451)));
    vec4 x0 = v - i + dot(i, C.xxxx);

    vec4 i0;
    vec3 isX = step(x0.yzw, x0.xxx);
    vec3 isYZ = step(x0.zww, x0.yyz);
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;

    vec4 i3 = clamp(i0, 0.0, 1.0);
    vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
    vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;

    i = ss_mod289(i);
    float j0 = ss_permute(ss_permute(ss_permute(ss_permute(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = ss_permute(ss_permute(ss_permute(ss_permute(
                  i.w + vec4(i1.w, i2.w, i3.w, 1.0))
                + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
                + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
                + i.x + vec4(i1.x, i2.x, i3.x, 1.0));

    vec4 ip = vec4(1.0 / 294.0, 1.0 / 49.0, 1.0 / 7.0, 0.0);
    vec4 p0 = ss_grad4(j0, ip);
    vec4 p1 = ss_grad4(j1.x, ip);
    vec4 p2 = ss_grad4(j1.y, ip);
    vec4 p3 = ss_grad4(j1.z, ip);
    vec4 p4 = ss_grad4(j1.w, ip);

    vec4 norm = ss_taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    p4 *= ss_taylorInvSqrt(dot(p4, p4));

    vec3 m0 = max(0.6 - vec3(dot(x0, x0), dot(x1, x1), dot(x2, x2)), 0.0);
    vec2 m1 = max(0.6 - vec2(dot(x3, x3), dot(x4, x4)), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;
    return 49.0 * (dot(m0 * m0, vec3(dot(p0, x0), dot(p1, x1), dot(p2, x2)))
                 + dot(m1 * m1, vec2(dot(p3, x3), dot(p4, x4))));
}

// Normalised fBm in [0, 1] (mean 0.5), like Blender's Noise Texture with "Normalize" on.
// 'octaves' is a float so a fractional Detail value blends in the last octave smoothly.
float ss_fbm(vec4 p, float octaves, float roughness) {
    float sum = 0.0;
    float amp = 1.0;
    float maxAmp = 0.0;
    for (int i = 0; i < 8; i++) {
        float weight = clamp(octaves - float(i), 0.0, 1.0);
        if (weight <= 0.0) break;
        sum += ss_snoise4(p) * amp * weight;
        maxAmp += amp * weight;
        amp *= roughness;
        p *= 2.0;
    }
    return sum / maxAmp * 0.5 + 0.5;
}
`;
