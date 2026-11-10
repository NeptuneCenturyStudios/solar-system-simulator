import * as THREE from 'three';
import { STAR_NOISE_GLSL } from './star-noise-glsl';
import {
    STAR_HDR_GAMMA,
    STAR_SURFACE_HDR_SCALE,
    starSurfaceExposure,
    starSurfaceTint,
} from './star-tint';

/**
 * Most fBm octaves the granulation uses. Octaves smaller than a pixel are dropped in the shader
 * (see the footprint test), so the top ones only cost anything when the camera is close to the
 * surface. Not tied to any setting: texture quality is about asset size, not shader cost.
 */
const STAR_SURFACE_OCTAVES = 6;

/**
 * Largest per-frame advance of a star's animation clock, in sim seconds. Boiling follows sim
 * time (it freezes when the sim is paused), but at high time scales a frame can advance hours of
 * sim time; capping the step keeps the surface churning instead of turning into flicker. Other
 * star-attached animations (the pulsar field flow) use the same cap.
 */
export const MAX_STAR_CLOCK_STEP = 0.25;

/**
 * Surface looks:
 *  - `mainSequence`: the Blender "Stylized Sun" — boiling granules, dark lanes, hot spots.
 *  - `whiteDwarf`: a compact remnant. No convection, so a smooth, brilliant surface with only
 *    faint, slow mottling, little relief and a strong limb.
 *  - `pulsar`: a neutron star. Smoother still, with two hot spots at the magnetic poles
 *    (see {@link StarSurfaceMaterial.setPoleAxis}).
 */
export type StarSurfaceStyle = 'mainSequence' | 'whiteDwarf' | 'pulsar';

/** Tunables for {@link StarSurfaceMaterial}. All have defaults matched to the Blender model. */
export interface IStarSurfaceOptions {
    temperature: number;
    /** Default `mainSequence`. */
    style?: StarSurfaceStyle;
}

/** Per-style overrides of the `mainSequence` uniform defaults. */
const STYLE_OVERRIDES: Record<StarSurfaceStyle, Partial<Record<NumericSurfaceUniform, number>>> = {
    mainSequence: {},
    whiteDwarf: {
        uSsBoilRate: 0.0015,
        uSsCellLo: 0.15,
        uSsCellHi: 0.95,
        uSsBase: 0.65,
        uSsLaneScale: 4.0,
        uSsLaneDepth: 0.22,
        uSsRim: 2.4,
        uSsBump: 0.1,
    },
    pulsar: {
        uSsBoilRate: 0.001,
        uSsCellLo: 0.1,
        uSsCellHi: 0.95,
        uSsBase: 0.7,
        uSsLaneScale: 3.0,
        uSsLaneDepth: 0.15,
        uSsRim: 2.6,
        uSsBump: 0.05,
        uSsPoleStrength: 2.5,
    },
};

type StarSurfaceUniforms = {
    uSsTime: THREE.IUniform<number>;
    uSsTint: THREE.IUniform<THREE.Color>;
    uSsExposure: THREE.IUniform<number>;
    uSsOctaves: THREE.IUniform<number>;
    uSsBoilRate: THREE.IUniform<number>;
    uSsWarp: THREE.IUniform<number>;
    uSsCellLo: THREE.IUniform<number>;
    uSsCellHi: THREE.IUniform<number>;
    uSsRim: THREE.IUniform<number>;
    uSsBase: THREE.IUniform<number>;
    uSsFlowWarp: THREE.IUniform<number>;
    uSsLaneScale: THREE.IUniform<number>;
    uSsLaneLo: THREE.IUniform<number>;
    uSsLaneHi: THREE.IUniform<number>;
    uSsLaneDepth: THREE.IUniform<number>;
    uSsBump: THREE.IUniform<number>;
    /** Magnetic axis in the mesh's object space (unit). */
    uSsPoleAxis: THREE.IUniform<THREE.Vector3>;
    /** Brightness of the polar hot spots (0 = none). */
    uSsPoleStrength: THREE.IUniform<number>;
};

/** The uniforms that hold a plain number (the ones a style can override). */
type NumericSurfaceUniform = {
    [K in keyof StarSurfaceUniforms]: StarSurfaceUniforms[K] extends THREE.IUniform<number>
        ? K
        : never;
}[keyof StarSurfaceUniforms];

/**
 * Procedural, animated star surface — a port of the "Stylized Sun" Blender material.
 *
 * The Blender original is a sphere whose look comes entirely from shader nodes: two animated 4D
 * noise fields thresholded through colour ramps (dark convection lanes, bright granules and
 * sparse hot spots), a Fresnel rim, fine grain, and a single "Color"-blend node that sets the
 * hue. That last node is what makes the model recolourable: the structure is a greyscale
 * energy field and the hue is one input, here `uSsTint`, driven by the star's temperature.
 *
 * Built as a `MeshBasicMaterial` patched through `onBeforeCompile` (the pattern the rest of
 * the codebase uses) so three.js still supplies the logarithmic-depth-buffer chunks.
 *
 * The noise is sampled from the mesh's *object-space direction*, so the pattern:
 *  - turns with the mesh — rotation and axial tilt stay entirely under the sim's control;
 *  - is independent of radius — red-giant expansion just scales the same surface up.
 */
export class StarSurfaceMaterial extends THREE.MeshBasicMaterial {
    readonly surfaceUniforms: StarSurfaceUniforms;

    private readonly _targetTint = new THREE.Color();
    private _targetExposure: number;

    constructor(options: IStarSurfaceOptions) {
        super({ color: 0xffffff });

        const tint = starSurfaceTint(options.temperature, new THREE.Color());
        this._targetTint.copy(tint);
        this._targetExposure = starSurfaceExposure(options.temperature);

        this.surfaceUniforms = {
            // Random start so neighbouring stars don't boil in lockstep.
            uSsTime: { value: Math.random() * 1000 },
            uSsTint: { value: tint },
            uSsExposure: { value: this._targetExposure },
            // Max fBm octaves for the granulation; follows the texture-quality setting.
            uSsOctaves: { value: STAR_SURFACE_OCTAVES },
            uSsBoilRate: { value: 0.0045 },
            uSsWarp: { value: 0.012 },
            uSsCellLo: { value: 0.3 },
            uSsCellHi: { value: 0.72 },
            uSsRim: { value: 1.6 },
            uSsBase: { value: 0.25 },
            uSsFlowWarp: { value: 0.07 },
            uSsLaneScale: { value: 6.0 },
            uSsLaneLo: { value: 0.55 },
            uSsLaneHi: { value: 0.7 },
            uSsLaneDepth: { value: 0.7 },
            // Emboss strength for the surface relief (0 = flat).
            uSsBump: { value: 0.35 },
            uSsPoleAxis: { value: new THREE.Vector3(0, 1, 0) },
            uSsPoleStrength: { value: 0 },
        };

        const overrides = STYLE_OVERRIDES[options.style ?? 'mainSequence'];
        for (const key of Object.keys(overrides) as NumericSurfaceUniform[]) {
            const value = overrides[key];
            if (value !== undefined) this.surfaceUniforms[key].value = value;
        }

        this.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this.surfaceUniforms);

            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    /* glsl */ `#include <common>
                    varying vec3 vSsObjPos;
                    varying vec3 vSsViewPos;
                    varying vec3 vSsViewNormal;`
                )
                .replace(
                    '#include <project_vertex>',
                    /* glsl */ `#include <project_vertex>
                    vSsObjPos = position;
                    vSsViewPos = mvPosition.xyz;
                    vSsViewNormal = normalize(normalMatrix * normal);`
                );

            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    /* glsl */ `#include <common>
                    uniform float uSsTime;
                    uniform vec3 uSsTint;
                    uniform float uSsExposure;
                    uniform float uSsOctaves;
                    uniform float uSsBoilRate;
                    uniform float uSsWarp;
                    uniform float uSsCellLo;
                    uniform float uSsCellHi;
                    uniform float uSsRim;
                    uniform float uSsBase;
                    uniform float uSsFlowWarp;
                    uniform float uSsLaneScale;
                    uniform float uSsLaneLo;
                    uniform float uSsLaneHi;
                    uniform float uSsLaneDepth;
                    uniform float uSsBump;
                    uniform vec3 uSsPoleAxis;
                    uniform float uSsPoleStrength;
                    varying vec3 vSsObjPos;
                    varying vec3 vSsViewPos;
                    varying vec3 vSsViewNormal;
                    ${STAR_NOISE_GLSL}`
                )
                .replace(
                    'vec4 diffuseColor = vec4( diffuse, opacity );',
                    /* glsl */ `
                    // Blender "Generated" texture coordinates: the unit cube around the sphere.
                    vec3 q = normalize(vSsObjPos) * 0.5 + 0.5;
                    float w = uSsTime * uSsBoilRate;

                    // Low-frequency domain warp (Blender's noise "Distortion"): bends the
                    // convection cells into organic shapes without breaking them up.
                    vec3 warp = vec3(
                        ss_snoise4(vec4(q * 6.0, w * 6.0)),
                        ss_snoise4(vec4(q * 6.0 + 19.1, w * 6.0)),
                        ss_snoise4(vec4(q * 6.0 + 41.7, w * 6.0))
                    );
                    vec3 qw = q + warp * uSsWarp;

                    // Drop octaves that would be smaller than a pixel: they only alias into
                    // sparkle when the star is small on screen, and skipping them is free speed.
                    vec3 cellCoord = qw * 30.0;
                    float footprint = max(length(fwidth(cellCoord)), 1e-6);
                    float octaves = clamp(log2(0.5 / footprint) + 1.0, 1.0, uSsOctaves);

                    float cells = ss_fbm(vec4(cellCoord, w * 30.0), octaves, 0.825);

                    // Dark lanes: a medium-scale field dragged through a strong, slow flow warp,
                    // so its low values join up into the connected, river-like dark channels of
                    // the model's preview renders instead of isolated dots.
                    vec3 flow = vec3(
                        ss_snoise4(vec4(q * 3.0, w * 3.0 + 5.0)),
                        ss_snoise4(vec4(q * 3.0 + 23.4, w * 3.0)),
                        ss_snoise4(vec4(q * 3.0 + 51.2, w * 3.0))
                    );
                    vec3 qf = q + flow * uSsFlowWarp;
                    float laneField = ss_fbm(vec4(qf * uSsLaneScale, w * uSsLaneScale), 4.0, 0.55);
                    // Ridged: the field's mid-level contour is a connected network of lines.
                    // A second, coarser field widens it in places into darker pools.
                    float pools = smoothstep(uSsLaneLo, uSsLaneHi, 1.0 - laneField);
                    float lanes = max(
                        1.0 - smoothstep(0.0, 0.09 + 0.1 * pools, abs(laneField - 0.5)),
                        pools * 0.75
                    );

                    vec3 grainCoord = q * 300.0;
                    float grainFade = 1.0 - smoothstep(0.35, 0.7, length(fwidth(grainCoord)));
                    float grain = mix(0.5, ss_snoise4(vec4(grainCoord, 3.1)) * 0.5 + 0.5, grainFade);

                    // Dark intergranular lanes -> bright granules, plus sparse hot spots where
                    // the coarse field peaks inside a bright granule.
                    float granules = smoothstep(uSsCellLo, uSsCellHi, cells);
                    // The spot field only matters inside bright granules, so it is skipped
                    // (2 noise calls) everywhere else. Nothing below takes its derivative.
                    float hot = 0.0;
                    if (cells > 0.6) {
                        float spots = ss_fbm(vec4(qw * 15.7 + 7.3, w * 15.7), 2.0, 0.783);
                        hot = smoothstep(0.6, 0.76, cells) * smoothstep(0.5, 0.68, spots);
                    }

                    // Fine fuzz: the very high octaves of the Blender noise (Detail ~16) that we
                    // don't reach with 'cells'. Faded out once it would be sub-pixel.
                    vec3 fuzzCoord = qw * 120.0;
                    float fuzzFade = 1.0 - smoothstep(0.3, 0.6, length(fwidth(fuzzCoord)));
                    float fuzz = fuzzFade > 0.0
                        ? ss_fbm(vec4(fuzzCoord, w * 120.0), 3.0, 0.7)
                        : 0.5;
                    fuzz = mix(0.5, fuzz, fuzzFade);

                    // Relief (emboss). The surface is emissive, so bumps can't really be lit;
                    // instead the slope of a height field — bright granules and fuzz stand up,
                    // dark lanes are crevices — brightens faces tilted toward a fixed light
                    // direction and darkens the rest. The slope comes from screen-space
                    // derivatives of the noise alone (not the mesh), so the sphere's triangle
                    // facets never show, and dividing by the noise footprint keeps the relief
                    // the same strength at any zoom.
                    float height = cells * 0.55 + fuzz * 0.45 - lanes * 0.35;
                    float perUnit = max(length(fwidth(cellCoord)), 1e-5);
                    vec2 slope = vec2(dFdx(height), dFdy(height)) / perUnit;
                    float emboss = dot(slope, vec2(-0.6, 0.8));
                    // Fade the relief as the star shrinks on screen: derivative bumps alias.
                    float bumpFade = 1.0 - smoothstep(0.35, 0.7, perUnit);
                    float relief = 1.0 + clamp(emboss * uSsBump, -0.6, 0.6) * bumpFade;

                    // Limb brightening: the Blender model's Fresnel rim.
                    float facing = abs(dot(normalize(vSsViewNormal), normalize(-vSsViewPos)));
                    float rim = pow(1.0 - facing, 3.0);

                    float energy = (uSsBase + granules * 0.7 + hot * 1.6)
                                 * (1.0 - lanes * uSsLaneDepth)
                                 * (0.75 + 0.5 * grain)
                                 * (0.7 + 0.6 * fuzz)
                                 * relief;
                    energy += rim * uSsRim * (0.6 + 0.4 * granules);

                    // Polar hot spots (pulsars): the magnetic poles, heated by the field.
                    float poleAlign = abs(dot(normalize(vSsObjPos), uSsPoleAxis));
                    energy += uSsPoleStrength
                            * (pow(poleAlign, 60.0) * 2.0 + pow(poleAlign, 8.0) * 0.35);

                    // Linear HDR radiance: the tint sets the hue, and the energy, raised to the
                    // display-to-linear power, sets the brightness. Convection lanes keep their
                    // contrast after the sRGB encode while hot spots go well above 1, and the
                    // output pass's tone curve rolls those toward yellow and white, as Blender's
                    // Filmic view did.
                    float lum = pow(max(energy * uSsExposure * ${STAR_SURFACE_HDR_SCALE.toFixed(3)}, 0.0), ${STAR_HDR_GAMMA.toFixed(2)});
                    vec3 surface = uSsTint * lum;
                    vec4 diffuseColor = vec4(surface, opacity);
                    `
                );
        };

        // All instances share one program; the uniforms are per-instance objects.
        this.customProgramCacheKey = () => 'star-surface-v6';
    }

    /** Retints the surface for a new temperature. Pass `blend` < 1 to ease toward it. */
    setTemperature(temperature: number, blend = 1): void {
        starSurfaceTint(temperature, this._targetTint);
        this._targetExposure = starSurfaceExposure(temperature);

        const u = this.surfaceUniforms;
        u.uSsTint.value.lerp(this._targetTint, blend);
        u.uSsExposure.value += (this._targetExposure - u.uSsExposure.value) * blend;
    }

    /** Advances the boiling animation by `dt` sim seconds. */
    update(dt: number): void {
        this.surfaceUniforms.uSsTime.value += Math.min(Math.abs(dt), MAX_STAR_CLOCK_STEP);
    }

    /** Sets the magnetic axis (object space) the polar hot spots sit on. */
    setPoleAxis(axis: THREE.Vector3): void {
        this.surfaceUniforms.uSsPoleAxis.value.copy(axis).normalize();
    }
}
