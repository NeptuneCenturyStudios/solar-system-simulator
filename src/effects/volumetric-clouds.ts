import * as THREE from 'three';
import {
    CLOUD_LIGHT_STEPS_HIGH,
    CLOUD_LIGHT_STEPS_MEDIUM,
    CLOUD_MAX_STEPS_HIGH,
    CLOUD_MAX_STEPS_MEDIUM,
    CLOUD_SAMPLES_PER_THICKNESS,
    CLOUD_STEPS_HIGH,
    CLOUD_STEPS_MEDIUM,
} from '../utilities/consts';
import { CLOUD_COMMON_GLSL, syncCloudObjectSpace, type CloudUniforms } from './cloud-coverage-glsl';

export type VolumetricCloudTier = 'medium' | 'high';

/**
 * The march stops a hair inside the faceted body mesh (see atmosphere-shell GROUND_CLIP_FACTOR).
 * This only saves work: what actually hides cloud behind the ground is the depth test against
 * the depth this shader writes.
 */
const GROUND_CLIP = 0.998;

/**
 * Transmittance at which the march records the depth it writes: where the cloud along the ray
 * first becomes noticeably opaque.
 */
const DEPTH_TRANSMITTANCE = 0.9;

/** Width of the planet-shadow penumbra in object units. */
const SHADOW_SOFTNESS = 0.01;

function tierDefines(tier: VolumetricCloudTier): Record<string, string | number> {
    return tier === 'high'
        ? {
              CLOUD_STEPS: CLOUD_STEPS_HIGH,
              CLOUD_MAX_STEPS: CLOUD_MAX_STEPS_HIGH,
              CLOUD_LIGHT_STEPS: CLOUD_LIGHT_STEPS_HIGH,
              CLOUD_HQ: '',
          }
        : {
              CLOUD_STEPS: CLOUD_STEPS_MEDIUM,
              CLOUD_MAX_STEPS: CLOUD_MAX_STEPS_MEDIUM,
              CLOUD_LIGHT_STEPS: CLOUD_LIGHT_STEPS_MEDIUM,
          };
}

export interface IVolumetricCloudMesh {
    mesh: THREE.Mesh;
    /** Recompiles the material for another quality tier (one frame of shader compilation). */
    setTier: (tier: VolumetricCloudTier) => void;
    dispose: () => void;
}

const f = (n: number): string => n.toFixed(6);

/**
 * Medium/High-tier clouds: single-scattering ray march through the deck between CLOUD_BASE_R and
 * the unit cloud top, shaped by the shared coverage (so it matches the flat tier exactly) and
 * eroded into puffs by the detail noise.
 *
 * Lighting follows the atmosphere shell: each star's exact irradiance at the body, a short
 * march toward it for self-shadowing, the planet's own shadow, and a dual-lobe phase with a few
 * multiple-scattering octaves (Wrenninge 2013) so thick cloud isn't unnaturally dark.
 *
 * The shell's faces only start the rays: the shader writes the depth of the cloud it found
 * (where the ray first becomes noticeably opaque) and is depth-tested against that. So the
 * ground, terrain facets, ships and anything else in front of the cloud hide it, even from
 * inside the deck (surface camera), where the faces drawn are the far side of the shell.
 */
export function createVolumetricCloudMesh(
    uniforms: CloudUniforms,
    worldStarDirs: THREE.Vector3[],
    tier: VolumetricCloudTier
): IVolumetricCloudMesh {
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.FrontSide,
        transparent: true,
        depthWrite: false,
        depthTest: true,
    });
    material.defines = tierDefines(tier);

    const objScale: THREE.IUniform<number> = { value: 1 };

    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.uniforms.uCloudObjScale = objScale;

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                /* glsl */ `#include <common>
                varying vec3 vCloudObjPos;
                varying vec3 vCloudViewPos;`
            )
            .replace(
                '#include <project_vertex>',
                /* glsl */ `#include <project_vertex>
                vCloudObjPos = position;
                vCloudViewPos = mvPosition.xyz;`
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                /* glsl */ `#include <common>
                ${CLOUD_COMMON_GLSL}
                varying vec3 vCloudObjPos;
                varying vec3 vCloudViewPos;
                // World units per object unit (the shell's scale), to turn ray distances into depth.
                uniform float uCloudObjScale;
                const float CLOUD_GROUND_CLIP = ${f(GROUND_CLIP)};
                const float CLOUD_SHADOW_SOFT = ${f(SHADOW_SOFTNESS)};

                // cloudDensity is in CLOUD_COMMON_GLSL.`
            )
            .replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                /* glsl */ `
                // View ray, started from a point safely outside the deck rather than the camera,
                // so a distant camera's large coordinates don't swamp the intersection maths.
                // Fully replaced by the flat layer (LOD): skip the march.
                if (uCloudVolumetricFade <= 0.001) discard;
                vec3 toFrag = vCloudObjPos - uCloudCamObj;
                float camDist = length(toFrag);
                vec3 rd = toFrag / max(camDist, 1e-6);
                vec3 ro = vCloudObjPos - rd * 2.0;
                float tCam = 2.0 - camDist;

                float b = dot(ro, rd);
                float roLenSq = dot(ro, ro);
                float disc = b * b - (roLenSq - 1.0);
                if (disc <= 0.0) discard;
                float sq = sqrt(disc);
                float t0 = max(-b - sq, tCam);
                float t1 = -b + sq;

                // Stop at the ground.
                float groundR = CLOUD_PLANET_R * CLOUD_GROUND_CLIP;
                float discG = b * b - (roLenSq - groundR * groundR);
                if (discG > 0.0) {
                    float tg = -b - sqrt(discG);
                    if (tg > t0) t1 = min(t1, tg);
                }
                if (t1 <= t0) discard;

                // Skip the clear hole under the cloud base: march [t0, i0] and [i1, t1].
                float lenA = t1 - t0;
                float startB = t1;
                float lenB = 0.0;
                float discI = b * b - (roLenSq - CLOUD_BASE_R * CLOUD_BASE_R);
                if (discI > 0.0) {
                    float sqI = sqrt(discI);
                    float i0 = -b - sqI;
                    float i1 = -b + sqI;
                    lenA = max(min(t1, i0) - t0, 0.0);
                    startB = max(t0, i1);
                    lenB = max(t1 - startB, 0.0);
                }
                float total = lenA + lenB;
                if (total <= 0.0) discard;

                // Sample count scales with the length of deck crossed, so grazing rays don't take
                // steps longer than the clouds are tall (the cause of banding near the horizon).
                int steps = int(clamp(
                    ceil(total / CLOUD_THICK * ${f(CLOUD_SAMPLES_PER_THICKNESS)}),
                    float(CLOUD_STEPS), float(CLOUD_MAX_STEPS)));
                float ds = total / float(steps);
                float jitter = cloudJitter(gl_FragCoord.xy);
                float trans = 1.0;
                vec3 cCol = vec3(0.0);
                // Ray parameter where the cloud first turns noticeably opaque: the depth written.
                // Measured from the step's fixed start, not the jittered sample, and solved
                // exactly within the step: the jitter (up to a whole step, kilometres here) would
                // otherwise scatter the depth pixel by pixel, and anything sitting near that
                // depth (a ship in the cloud) would be speckled with cloud.
                float tDepth = -1.0;
                float tFirst = -1.0;

                for (int i = 0; i < CLOUD_MAX_STEPS; i++) {
                    if (i >= steps) break;
                    float sStart = float(i) * ds;
                    float sAlong = sStart + jitter * ds;
                    float t = sAlong < lenA ? t0 + sAlong : startB + (sAlong - lenA);
                    vec3 p = ro + rd * t;
                    float r = length(p);
                    float h = (r - CLOUD_BASE_R) / CLOUD_THICK;
                    if (h <= 0.0 || h >= 1.0) continue;
                    vec3 up = p / r;

                    vec2 field = cloudField(up);
                    float dens = cloudDensity(p, up, h, field, true);
                    if (dens <= 0.001) continue;
                    if (tFirst < 0.0) tFirst = sStart < lenA ? t0 + sStart : startB + (sStart - lenA);
                    float sigma = dens * CLOUD_SIGMA * uCloudDensityScale;

                    vec3 inScatter = vec3(0.0);
                    for (int s = 0; s < CLOUD_MAX_STARS; s++) {
                        if (s >= uCloudStarCount) break;
                        vec3 L = uCloudStarDir[s];
                        float mu = dot(up, L);

                        // The planet's own shadow.
                        float shadow = 1.0;
                        if (mu < 0.0) {
                            float perp = r * sqrt(max(1.0 - mu * mu, 0.0));
                            shadow = smoothstep(-CLOUD_SHADOW_SOFT, 0.0, perp - CLOUD_PLANET_R);
                        }
                        if (shadow <= 0.0) continue;

                        // Self-shadowing: optical depth toward the star, taps spaced
                        // quadratically so the near cloud is sampled finely.
                        float od = 0.0;
                        float prevD = 0.0;
                        for (int j = 0; j < CLOUD_LIGHT_STEPS; j++) {
                            float fj = (float(j) + 0.5) / float(CLOUD_LIGHT_STEPS);
                            float d = CLOUD_THICK * 1.2 * fj * fj;
                            vec3 q = p + L * d;
                            float hq = (length(q) - CLOUD_BASE_R) / CLOUD_THICK;
                            // Coverage reused from the sample: it barely changes over the
                            // march. The fine octave is skipped: shadows are soft anyway.
                            od += cloudDensity(q, up, hq, field, false) * (d - prevD);
                            prevD = d;
                        }
                        // The rest of the way out toward the star, past the march's reach. The
                        // deck is a thin shell, so with the star low the light crosses a long
                        // slanted path through it, up to ~10x its thickness: that is what dims
                        // the clouds toward the terminator. Flat-slab estimate (path above the
                        // sample over the star's elevation) at the column's average density.
                        float slant = (1.0 - h) * CLOUD_THICK / max(mu, 0.02);
                        float beyond = max(slant - CLOUD_THICK * 1.2, 0.0);
                        od += beyond * field.x * 0.5;
                        od *= CLOUD_SIGMA * uCloudDensityScale;

                        // Multiple-scattering octaves: each lets light further in with a
                        // broader phase and carries half the energy of the last.
                        float cosT = dot(rd, L);
                        float lum = cloudPhase(cosT, 1.0) * exp(-od)
                            + 0.5 * cloudPhase(cosT, 0.5) * exp(-0.5 * od)
                            + 0.25 * cloudPhase(cosT, 0.25) * exp(-0.25 * od);
                        #ifdef CLOUD_HQ
                        // Powder: just inside a lit edge, light hasn't yet scattered toward us.
                        lum *= mix(0.65, 1.0, 1.0 - exp(-2.0 * od));
                        #endif

                        inScatter += uCloudStarLight[s] * (lum * shadow + cloudAmbient(mu, h));
                    }
                    inScatter *= uCloudTint * cloudShade(field.y);

                    // Energy-conserving step integration (Hillaire 2015); albedo ~ 1.
                    float stepT = exp(-sigma * ds);
                    cCol += trans * inScatter * (1.0 - stepT);
                    if (tDepth < 0.0 && trans * stepT < ${f(DEPTH_TRANSMITTANCE)}) {
                        // Where in this step trans crosses the threshold (Beer-Lambert, with the
                        // step's density): trans * exp(-sigma * x) = threshold.
                        float frac = clamp(
                            log(trans / ${f(DEPTH_TRANSMITTANCE)}) / max(sigma * ds, 1e-6),
                            0.0, 1.0);
                        float sCross = sStart + frac * ds;
                        tDepth = sCross < lenA ? t0 + sCross : startB + (sCross - lenA);
                    }
                    trans *= stepT;
                    if (trans < 0.01) break;
                }

                // Fades in as the flat layer fades out (cloud-layer.ts LOD).
                float cAlpha = (1.0 - trans) * uCloudVolumetricFade;
                if (cAlpha < 0.002) discard;
                // Thin cloud that never got opaque: take the start of its first step.
                if (tDepth < 0.0) tDepth = tFirst;
                // Distance from the camera to that point, along the view ray, in view space.
                float cViewDist = max(tDepth - tCam, 0.0) * uCloudObjScale;
                float cViewW = -normalize(vCloudViewPos).z * cViewDist;
                // Straight alpha for normal blending: rgb * a + dst * (1 - a) = cCol + dst * T.
                vec4 diffuseColor = vec4(cCol / cAlpha, cAlpha);
                `
            );

        // Write the cloud's own depth instead of the shell face's (log depth buffer, as the
        // renderer uses; see logdepthbuf_fragment). Without one, the face depth stands.
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <logdepthbuf_fragment>',
            /* glsl */ `
            #if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
                gl_FragDepth = vIsPerspective == 0.0
                    ? gl_FragCoord.z
                    : log2(1.0 + max(cViewW, 1e-6)) * logDepthBufFC * 0.5;
            #endif
            `
        );
    };
    material.customProgramCacheKey = () => 'volumetric-clouds-v7';

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), material);
    mesh.name = 'VolumetricClouds';
    mesh.renderOrder = 2;
    // Picking goes through the flat layer, which is always present.
    mesh.raycast = () => {};

    mesh.onBeforeRender = (_renderer, _scene, camera) => {
        const inside = syncCloudObjectSpace(uniforms, worldStarDirs, mesh, camera) < 1;
        // Outside, the near faces start each ray; inside, the far ones (the ray starts at the
        // camera). Either way the depth test runs on the depth the shader writes.
        const side = inside ? THREE.BackSide : THREE.FrontSide;
        if (material.side !== side) material.side = side;
        objScale.value = mesh.matrixWorld.getMaxScaleOnAxis();
    };

    return {
        mesh,
        setTier: (next) => {
            material.defines = tierDefines(next);
            material.needsUpdate = true;
        },
        dispose: () => {
            mesh.parent?.remove(mesh);
            mesh.geometry.dispose();
            material.dispose();
        },
    };
}
