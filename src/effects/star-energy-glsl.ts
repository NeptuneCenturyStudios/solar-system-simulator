import type { StarQuality } from '../settings/settings-store';

/**
 * Shader tier compiled into star materials as `STAR_QUALITY`. `minimal` samples the baked cubemap;
 * the others run {@link STAR_ENERGY_GLSL} live with progressively more noise layers.
 */
export const STAR_QUALITY_TIER: Readonly<Record<StarQuality, number>> = {
    minimal: 0,
    low: 1,
    medium: 2,
    high: 3,
};

/**
 * Upper bound of the surface energy (before relief, rim and pole terms) the baked cubemap stores:
 * (base + granules + hot spots) x grain x fuzz peaks just above 4. The bake stores
 * sqrt(energy / scale), so dark convection lanes keep their precision in an 8-bit texture.
 */
export const STAR_ENERGY_SCALE = 4.5;

/**
 * The greyscale structure of a star surface — granules, dark lanes, hot spots, grain and fuzz —
 * shared by the live surface shader and the cubemap bake, so the two can never drift apart.
 *
 * Needs STAR_NOISE_GLSL, the `uSs*` structure uniforms and a `STAR_QUALITY` define (1–3) in scope:
 *  - 1 (low):    no domain or flow warp, 3 cell octaves, 2 lane octaves, no hot spots or fuzz.
 *  - 2 (medium): warps and hot spots, 3 lane octaves, 2 fuzz octaves.
 *  - 3 (high):   everything, as authored.
 * The cell octave cap is the `uSsOctaves` uniform. Octaves smaller than a pixel are dropped through
 * `fwidth`, which in the bake measures the cubemap's own texels.
 */
export const STAR_ENERGY_GLSL = /* glsl */ `
struct SsSurface {
    float energy;   // brightness before relief, rim and pole terms
    float granules; // 0..1 bright-granule mask (feeds the rim)
    float height;   // relief height field for the emboss
};

SsSurface ss_surface(vec3 q, float w) {
#if STAR_QUALITY >= 2
    // Low-frequency domain warp (Blender's noise "Distortion"): bends the convection cells
    // into organic shapes without breaking them up.
    vec3 warp = vec3(
        ss_snoise4(vec4(q * 6.0, w * 6.0)),
        ss_snoise4(vec4(q * 6.0 + 19.1, w * 6.0)),
        ss_snoise4(vec4(q * 6.0 + 41.7, w * 6.0))
    );
    vec3 qw = q + warp * uSsWarp;
#else
    vec3 qw = q;
#endif

    // Drop octaves that would be smaller than a pixel: they only alias into sparkle when the
    // star is small on screen, and skipping them is free speed.
    vec3 cellCoord = qw * 30.0;
    float footprint = max(length(fwidth(cellCoord)), 1e-6);
    float octaves = clamp(log2(0.5 / footprint) + 1.0, 1.0, uSsOctaves);
    float cells = ss_fbm(vec4(cellCoord, w * 30.0), octaves, 0.825);

#if STAR_QUALITY >= 2
    // Dark lanes: a medium-scale field dragged through a strong, slow flow warp, so its low
    // values join up into connected, river-like dark channels instead of isolated dots.
    vec3 flow = vec3(
        ss_snoise4(vec4(q * 3.0, w * 3.0 + 5.0)),
        ss_snoise4(vec4(q * 3.0 + 23.4, w * 3.0)),
        ss_snoise4(vec4(q * 3.0 + 51.2, w * 3.0))
    );
    vec3 qf = q + flow * uSsFlowWarp;
#if STAR_QUALITY >= 3
    float laneField = ss_fbm(vec4(qf * uSsLaneScale, w * uSsLaneScale), 4.0, 0.55);
#else
    float laneField = ss_fbm(vec4(qf * uSsLaneScale, w * uSsLaneScale), 3.0, 0.55);
#endif
#else
    float laneField = ss_fbm(vec4(q * uSsLaneScale, w * uSsLaneScale), 2.0, 0.55);
#endif
    // Ridged: the field's mid-level contour is a connected network of lines. A second,
    // coarser field widens it in places into darker pools.
    float pools = smoothstep(uSsLaneLo, uSsLaneHi, 1.0 - laneField);
    float lanes = max(
        1.0 - smoothstep(0.0, 0.09 + 0.1 * pools, abs(laneField - 0.5)),
        pools * 0.75
    );

    vec3 grainCoord = q * 300.0;
    float grainFade = 1.0 - smoothstep(0.35, 0.7, length(fwidth(grainCoord)));
    float grain = mix(0.5, ss_snoise4(vec4(grainCoord, 3.1)) * 0.5 + 0.5, grainFade);

    // Dark intergranular lanes -> bright granules, plus sparse hot spots where the coarse
    // field peaks inside a bright granule.
    float granules = smoothstep(uSsCellLo, uSsCellHi, cells);
    float hot = 0.0;
#if STAR_QUALITY >= 2
    // The spot field only matters inside bright granules, so it is skipped (2 noise calls)
    // everywhere else. Nothing takes its derivative.
    if (cells > 0.6) {
        float spots = ss_fbm(vec4(qw * 15.7 + 7.3, w * 15.7), 2.0, 0.783);
        hot = smoothstep(0.6, 0.76, cells) * smoothstep(0.5, 0.68, spots);
    }
#endif

#if STAR_QUALITY >= 2
    // Fine fuzz: the very high octaves of the Blender noise (Detail ~16) that 'cells' doesn't
    // reach. Faded out once it would be sub-pixel.
    vec3 fuzzCoord = qw * 120.0;
    float fuzzFade = 1.0 - smoothstep(0.3, 0.6, length(fwidth(fuzzCoord)));
#if STAR_QUALITY >= 3
    float fuzz = fuzzFade > 0.0 ? ss_fbm(vec4(fuzzCoord, w * 120.0), 3.0, 0.7) : 0.5;
#else
    float fuzz = fuzzFade > 0.0 ? ss_fbm(vec4(fuzzCoord, w * 120.0), 2.0, 0.7) : 0.5;
#endif
    fuzz = mix(0.5, fuzz, fuzzFade);
#else
    float fuzz = 0.5;
#endif

    SsSurface s;
    s.energy = (uSsBase + granules * 0.7 + hot * 1.6)
             * (1.0 - lanes * uSsLaneDepth)
             * (0.75 + 0.5 * grain)
             * (0.7 + 0.6 * fuzz);
    s.granules = granules;
    // Bright granules and fuzz stand up, dark lanes are crevices.
    s.height = cells * 0.55 + fuzz * 0.45 - lanes * 0.35;
    return s;
}
`;
