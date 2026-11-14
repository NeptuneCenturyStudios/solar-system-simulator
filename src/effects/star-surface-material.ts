import * as THREE from 'three';
import type { StarQuality } from '../settings/settings-store';
import { STAR_NOISE_GLSL } from './star-noise-glsl';
import { STAR_ENERGY_GLSL, STAR_ENERGY_SCALE, STAR_QUALITY_TIER } from './star-energy-glsl';
import {
    getStarEnergyCube,
    STAR_BAKE_HEIGHT_MIN,
    STAR_BAKE_HEIGHT_RANGE,
} from './star-surface-bake';
import {
    STAR_HDR_GAMMA,
    STAR_SURFACE_HDR_SCALE,
    starSurfaceExposure,
    starSurfaceTint,
} from './star-tint';

/**
 * Most fBm octaves the granulation uses at each live quality tier. Octaves smaller than a pixel
 * are dropped in the shader (see the footprint test), so the top ones only cost anything when the
 * camera is close to the surface. Minimal samples the bake and runs no noise at all.
 */
const STAR_SURFACE_OCTAVES: Readonly<Record<StarQuality, number>> = {
    minimal: 0,
    low: 3,
    medium: 4,
    high: 6,
};

/**
 * Minimal tier: radians the two baked copies drift per unit of boil time (sim time x boil rate),
 * and how fast they cross-fade. A granule is ~0.07 rad across, so at the main-sequence boil rate
 * one drifts past in a few seconds of 1x sim time and the fade cycles in about 20.
 */
const BAKE_DRIFT_RATE = 0.3;
const BAKE_FADE_RATE = 4.0;

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
    /** Baked surface for the Minimal tier (see star-surface-bake.ts); null at the live tiers. */
    uSsEnergyCube: THREE.IUniform<THREE.CubeTexture | null>;
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
    private readonly _style: StarSurfaceStyle;
    private _quality: StarQuality = 'high';
    /** STAR_QUALITY compiled into the current program; -1 until the first setQuality. */
    private _tier = -1;

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
            // Max fBm octaves for the granulation; follows the star-quality setting.
            uSsOctaves: { value: STAR_SURFACE_OCTAVES.high },
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
            uSsEnergyCube: { value: null },
        };

        this._style = options.style ?? 'mainSequence';
        const overrides = STYLE_OVERRIDES[this._style];
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
                #if STAR_QUALITY == 0
                    uniform samplerCube uSsEnergyCube;
                #endif
                    varying vec3 vSsObjPos;
                    varying vec3 vSsViewPos;
                    varying vec3 vSsViewNormal;
                #if STAR_QUALITY > 0
                    ${STAR_NOISE_GLSL}
                    ${STAR_ENERGY_GLSL}
                #endif`
                )
                .replace(
                    'vec4 diffuseColor = vec4( diffuse, opacity );',
                    /* glsl */ `
                    // Blender "Generated" texture coordinates: the unit cube around the sphere.
                    vec3 q = normalize(vSsObjPos) * 0.5 + 0.5;
                    float w = uSsTime * uSsBoilRate;
                    vec3 cellCoord = q * 30.0;

                #if STAR_QUALITY == 0
                    // Baked: two copies of the stored surface drifting against each other and
                    // cross-fading slowly stand in for the boiling. Two texture taps, no noise.
                    vec3 dir = normalize(vSsObjPos);
                    float drift = w * ${BAKE_DRIFT_RATE.toFixed(2)};
                    float ca = cos(drift);
                    float sa = sin(drift);
                    vec3 dirA = vec3(ca * dir.x + sa * dir.z, dir.y, -sa * dir.x + ca * dir.z);
                    vec3 dirB = vec3(dir.x, ca * dir.y - sa * dir.z, sa * dir.y + ca * dir.z).zxy;
                    vec3 baked = mix(
                        textureCube(uSsEnergyCube, dirA).rgb,
                        textureCube(uSsEnergyCube, dirB).rgb,
                        0.5 + 0.5 * sin(w * ${BAKE_FADE_RATE.toFixed(2)})
                    );
                    float energy = baked.r * baked.r * ${STAR_ENERGY_SCALE.toFixed(2)};
                    float granules = baked.g;
                    float height = baked.b * ${STAR_BAKE_HEIGHT_RANGE.toFixed(2)} + (${STAR_BAKE_HEIGHT_MIN.toFixed(2)});
                #else
                    SsSurface surf = ss_surface(q, w);
                    float energy = surf.energy;
                    float granules = surf.granules;
                    float height = surf.height;
                #endif

                    // Relief (emboss). The surface is emissive, so bumps can't really be lit;
                    // instead the slope of the height field brightens faces tilted toward a fixed
                    // light direction and darkens the rest. The slope comes from screen-space
                    // derivatives of the height alone (not the mesh), so the sphere's triangle
                    // facets never show, and dividing by the cell footprint keeps the relief the
                    // same strength at any zoom.
                    float perUnit = max(length(fwidth(cellCoord)), 1e-5);
                    vec2 slope = vec2(dFdx(height), dFdy(height)) / perUnit;
                    float emboss = dot(slope, vec2(-0.6, 0.8));
                    // Fade the relief as the star shrinks on screen: derivative bumps alias.
                    float bumpFade = 1.0 - smoothstep(0.35, 0.7, perUnit);
                    energy *= 1.0 + clamp(emboss * uSsBump, -0.6, 0.6) * bumpFade;

                    // Limb brightening: the Blender model's Fresnel rim.
                    float facing = abs(dot(normalize(vSsViewNormal), normalize(-vSsViewPos)));
                    float rim = pow(1.0 - facing, 3.0);
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

        this.setQuality('high');
        // Instances at the same tier share one program; the uniforms are per-instance objects.
        this.customProgramCacheKey = () => `star-surface-v7-q${this._tier}`;
    }

    /** The quality last applied (Minimal stays requested even while falling back to Low). */
    get quality(): StarQuality {
        return this._quality;
    }

    /** True while Minimal is requested but drawn at Low because the bake has no renderer yet. */
    get awaitingBake(): boolean {
        return this._quality === 'minimal' && this.surfaceUniforms.uSsEnergyCube.value === null;
    }

    /**
     * Switches the shader tier. Recompiles in place on the next draw; uniforms, geometry and the
     * animation clock are untouched. Minimal falls back to Low until the bake has a renderer.
     */
    setQuality(quality: StarQuality): void {
        this._quality = quality;
        let effective = quality;
        const u = this.surfaceUniforms;
        if (quality === 'minimal') {
            u.uSsEnergyCube.value = getStarEnergyCube(this._style, {
                warp: u.uSsWarp.value,
                flowWarp: u.uSsFlowWarp.value,
                cellLo: u.uSsCellLo.value,
                cellHi: u.uSsCellHi.value,
                base: u.uSsBase.value,
                laneScale: u.uSsLaneScale.value,
                laneLo: u.uSsLaneLo.value,
                laneHi: u.uSsLaneHi.value,
                laneDepth: u.uSsLaneDepth.value,
            });
            if (!u.uSsEnergyCube.value) effective = 'low';
        } else {
            u.uSsEnergyCube.value = null;
        }

        const tier = STAR_QUALITY_TIER[effective];
        u.uSsOctaves.value = STAR_SURFACE_OCTAVES[effective];
        if (tier === this._tier) return;
        this._tier = tier;
        this.defines = { STAR_QUALITY: tier };
        this.needsUpdate = true;
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
