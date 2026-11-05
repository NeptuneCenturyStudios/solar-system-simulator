import * as THREE from 'three';
import {
    ATMOSPHERE_ABSORPTION_ZENITH_DEPTH,
    ATMOSPHERE_MIE_ZENITH_DEPTH,
    ATMOSPHERE_RAYLEIGH_ZENITH_DEPTH,
    ATMOSPHERE_VISUAL_PRESSURE_KNEE_BAR,
    MAX_LIGHTING_STARS,
} from '../utilities/consts';
import type { IStarLightingSet } from './star-illumination';

/** Samples along each view ray through the shell. Lower is cheaper; the dither hides banding. */
const ATMO_STEPS = 8;

/** Rayleigh / Mie scale heights as fractions of the shell's thickness. */
const RAYLEIGH_SCALE_HEIGHT = 0.2;
const MIE_SCALE_HEIGHT = 0.08;

/** Mie forward-scattering asymmetry (Henyey-Greenstein g): the glare around the sun. */
const MIE_G = 0.76;

/** Mie extinction over scattering (a little haze absorption). */
const MIE_EXTINCTION_RATIO = 1.1;

/**
 * View rays stop at a sphere this fraction of the body's radius: inscribed in the body's faceted
 * mesh (64 × 128 segments sag up to ~0.13% below the true radius), not the true sphere. If the
 * ray clipped at the true radius, the analytic horizon would sit above the drawn one, and from
 * the surface the sky would end in a dark gap above the ground. With an inscribed clip, every ray
 * the shader ends at "ground" really hits the mesh, whose depth hides the sky behind it.
 */
const GROUND_CLIP_FACTOR = 0.998;

/**
 * Width of the planet-shadow penumbra, as a fraction of the shell's thickness, measured as how
 * far the ray toward a star dips into the planet. Larger values give a wider twilight band.
 */
const SHADOW_SOFTNESS = 0.1;

/** Geometry resolution. Shading is per pixel, so this only shapes the silhouette. */
const SHELL_WIDTH_SEGMENTS = 64;
const SHELL_HEIGHT_SEGMENTS = 32;

export type AtmosphereShellHandle = {
    dispose: () => void;
    /** Feeds this frame's star lighting (world-space, from gatherStarLighting). */
    update: (lights: IStarLightingSet) => void;
    setVisible: (visible: boolean) => void;
};

/**
 * Visual optical-depth multiplier for a surface pressure: log-compressed and normalised to 1 at
 * 1 bar, so thin atmospheres stay faint and Venus-like ones saturate instead of blowing out.
 */
export function atmosphereVisualDepthScale(pressureBar: number): number {
    const p = Math.max(0, pressureBar);
    const knee = ATMOSPHERE_VISUAL_PRESSURE_KNEE_BAR;
    return Math.log1p(p / knee) / Math.log1p(1 / knee);
}

type ShellUniforms = {
    uAtCamObj: THREE.IUniform<THREE.Vector3>;
    uAtPlanetR: THREE.IUniform<number>;
    uAtHeights: THREE.IUniform<THREE.Vector3>;
    uAtBetaR: THREE.IUniform<THREE.Vector3>;
    uAtBetaM: THREE.IUniform<number>;
    /** Absorption coefficients (extinction only, no scattering), following the Rayleigh density. */
    uAtBetaA: THREE.IUniform<THREE.Vector3>;
    uAtStarCount: THREE.IUniform<number>;
    uAtStarDir: THREE.IUniform<THREE.Vector3[]>;
    uAtStarLight: THREE.IUniform<THREE.Vector3[]>;
};

const _invWorld = new THREE.Matrix4();
const _camWorld = new THREE.Vector3();

/**
 * Physically-inspired atmosphere: single scattering integrated along each pixel's view ray
 * through the shell, lit by up to MAX_LIGHTING_STARS stars.
 *
 * - From space it gives a lit limb, a haze over the day side, a sunset-coloured band at the
 *   terminator and nothing at all on the night side (additive black is transparent).
 * - From inside it is the sky: blue overhead, paler at the horizon, sunrise/sunset colours
 *   toward a low star and a glare around it.
 *
 * Colour comes from the body's tint, which acts as the Rayleigh scattering spectrum. Light that
 * crosses a lot of air loses the tint's hue first, so a blue sky gets orange sunsets and a red
 * one blue sunsets, without a separate sunset colour. Pressure sets the optical depth. Each
 * star contributes the exact irradiance its point light gives this body (see
 * star-illumination.ts), the same light the surface receives, so the sky is physically tied to
 * the ground: a dim or distant star leaves it dark, a close bright one washes it out.
 *
 * Only one face is drawn: the front faces from outside (so the haze also covers the planet
 * disc), the back faces from inside (the sky dome). Drawing both was what layered the old
 * shell into "slices". All maths runs in the shell's unit object space (atmosphere radius = 1),
 * away from the large world coordinates that cost float precision.
 */
export function createAtmosphereShell(
    bodyRadius: number,
    atmosphereRadius: number,
    tint: THREE.Color,
    pressureBar: number,
    parent: THREE.Object3D
): AtmosphereShellHandle {
    const planetR = Math.min(bodyRadius / Math.max(atmosphereRadius, 1e-9), 0.9999);
    const thickness = 1 - planetR;
    const hr = RAYLEIGH_SCALE_HEIGHT * thickness;
    const hm = MIE_SCALE_HEIGHT * thickness;
    const depthScale = atmosphereVisualDepthScale(pressureBar);

    // The tint (normalised to its brightest channel) is the Rayleigh spectrum. Scattering
    // coefficients are per unit length, so divide the vertical optical depths by the scale height.
    const maxChannel = Math.max(tint.r, tint.g, tint.b, 1e-4);
    const betaR = new THREE.Vector3(tint.r, tint.g, tint.b).multiplyScalar(
        (ATMOSPHERE_RAYLEIGH_ZENITH_DEPTH * depthScale) / (maxChannel * hr)
    );
    const betaM = (ATMOSPHERE_MIE_ZENITH_DEPTH * depthScale) / hm;

    // Thick atmospheres also absorb the colours their tint lacks (the complement), spread like
    // the Rayleigh gas. It grows per decade of pressure above 1 bar (zero at or below, so
    // Earth-like and thinner skies are unchanged), independent of the visual depth curve.
    const absorbDepth =
        (ATMOSPHERE_ABSORPTION_ZENITH_DEPTH * Math.log10(Math.max(pressureBar, 1))) / hr;
    const betaA = new THREE.Vector3(
        1 - tint.r / maxChannel,
        1 - tint.g / maxChannel,
        1 - tint.b / maxChannel
    ).multiplyScalar(absorbDepth);

    const worldStarDirs: THREE.Vector3[] = [];
    const uniforms: ShellUniforms = {
        uAtCamObj: { value: new THREE.Vector3() },
        uAtPlanetR: { value: planetR },
        uAtHeights: { value: new THREE.Vector3(hr, hm, thickness) },
        uAtBetaR: { value: betaR },
        uAtBetaM: { value: betaM },
        uAtBetaA: { value: betaA },
        uAtStarCount: { value: 0 },
        uAtStarDir: { value: [] },
        uAtStarLight: { value: [] },
    };
    for (let i = 0; i < MAX_LIGHTING_STARS; i++) {
        worldStarDirs.push(new THREE.Vector3(1, 0, 0));
        uniforms.uAtStarDir.value.push(new THREE.Vector3(1, 0, 0));
        uniforms.uAtStarLight.value.push(new THREE.Vector3());
    }

    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.FrontSide,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
    });

    const f = (n: number) => n.toFixed(6);

    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                /* glsl */ `#include <common>
                varying vec3 vAtObjPos;`
            )
            .replace(
                '#include <project_vertex>',
                /* glsl */ `#include <project_vertex>
                vAtObjPos = position;`
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                /* glsl */ `#include <common>
                #define AT_STEPS ${ATMO_STEPS}
                #define AT_MAX_STARS ${MAX_LIGHTING_STARS}
                uniform vec3 uAtCamObj;
                uniform float uAtPlanetR;
                uniform vec3 uAtBetaR;
                uniform float uAtBetaM;
                uniform vec3 uAtBetaA;
                uniform int uAtStarCount;
                uniform vec3 uAtStarDir[AT_MAX_STARS];
                uniform vec3 uAtStarLight[AT_MAX_STARS];
                varying vec3 vAtObjPos;

                // Per-body values are uniforms, not baked constants: every shell shares one
                // compiled program (same cache key), so baked values would leak between bodies.
                uniform vec3 uAtHeights; // x: Rayleigh scale height, y: Mie, z: shell thickness
                #define AT_HR uAtHeights.x
                #define AT_HM uAtHeights.y
                #define AT_THICK uAtHeights.z
                const float AT_MIE_G = ${f(MIE_G)};
                const float AT_MIE_EXT = ${f(MIE_EXTINCTION_RATIO)};
                const float AT_GROUND_CLIP = ${f(GROUND_CLIP_FACTOR)};
                const float AT_SHADOW_SOFTNESS = ${f(SHADOW_SOFTNESS)};

                // Schüler's approximate Chapman function: optical depth of an exponential
                // atmosphere (in scale heights) from altitude h toward a direction at cos(zenith)
                // = mu, for a planet X scale heights in radius. Valid while the ray clears the
                // planet; the caller fades it out into the planet's shadow.
                float atChapman(float X, float h, float mu) {
                    float c = sqrt(X + h);
                    if (mu >= 0.0) {
                        return c / (c * mu + 1.0) * exp(-h);
                    }
                    float x0 = sqrt(max(1.0 - mu * mu, 0.0)) * (X + h);
                    float c0 = sqrt(x0);
                    return 2.0 * c0 * exp(min(X - x0, 20.0)) - c / (1.0 - c * mu) * exp(-h);
                }

                // Interleaved gradient noise: per-pixel jitter for the ray start.
                float atNoise(vec2 p) {
                    return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
                }`
            )
            .replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                /* glsl */ `
                vec3 atColor = vec3(0.0);
                {
                    // View ray. Start it from a point safely outside the shell along the ray,
                    // not from the camera, so a distant camera's huge coordinates don't swamp
                    // the intersection maths.
                    vec3 toFrag = vAtObjPos - uAtCamObj;
                    float camDist = length(toFrag);
                    vec3 rd = toFrag / max(camDist, 1e-6);
                    vec3 ro = vAtObjPos - rd * 2.0;
                    float tCam = 2.0 - camDist;

                    float b = dot(ro, rd);
                    float c = dot(ro, ro) - 1.0;
                    float disc = b * b - c;
                    if (disc > 0.0) {
                        float sq = sqrt(disc);
                        float tStart = max(-b - sq, tCam);
                        float tEnd = -b + sq;

                        // Stop at the ground (inscribed in the mesh, see GROUND_CLIP_FACTOR).
                        float groundR = uAtPlanetR * AT_GROUND_CLIP;
                        float cg = dot(ro, ro) - groundR * groundR;
                        float discG = b * b - cg;
                        if (discG > 0.0) {
                            float tg = -b - sqrt(discG);
                            if (tg > tStart) tEnd = min(tEnd, tg);
                        }

                        if (tEnd > tStart) {
                            float ds = (tEnd - tStart) / float(AT_STEPS);
                            float jitter = atNoise(gl_FragCoord.xy);
                            float Xr = uAtPlanetR / AT_HR;
                            float Xm = uAtPlanetR / AT_HM;
                            vec3 betaMExt = vec3(uAtBetaM * AT_MIE_EXT);
                            // Gas extinction: Rayleigh scattering plus absorption (same profile).
                            vec3 betaRExt = uAtBetaR + uAtBetaA;

                            vec3 viewDepth = vec3(0.0);
                            vec3 sumR[AT_MAX_STARS];
                            vec3 sumM[AT_MAX_STARS];
                            for (int s = 0; s < AT_MAX_STARS; s++) {
                                sumR[s] = vec3(0.0);
                                sumM[s] = vec3(0.0);
                            }

                            for (int i = 0; i < AT_STEPS; i++) {
                                vec3 p = ro + rd * (tStart + (float(i) + jitter) * ds);
                                float r = length(p);
                                float alt = max(r - uAtPlanetR, 0.0);
                                // Fade the density to 0 at the shell's edge so it never shows.
                                float edge = 1.0 - smoothstep(0.85, 1.0, alt / AT_THICK);
                                float rhoR = exp(-alt / AT_HR) * edge;
                                float rhoM = exp(-alt / AT_HM) * edge;

                                vec3 stepDepth = (betaRExt * rhoR + betaMExt * rhoM) * ds;
                                vec3 depthToSample = viewDepth + stepDepth * 0.5;
                                viewDepth += stepDepth;

                                vec3 up = p / max(r, 1e-6);
                                for (int s = 0; s < AT_MAX_STARS; s++) {
                                    if (s >= uAtStarCount) break;
                                    vec3 L = uAtStarDir[s];
                                    float mu = dot(up, L);

                                    // Planet shadow. The ray toward the star clears the planet by
                                    // perp - R. The soft band lies entirely below the geometric
                                    // edge (clearance <= 0), so the shadow is exactly 1 at mu = 0,
                                    // where the clearance equals the altitude, and the terminator
                                    // fades in instead of stepping. The reddening near it comes
                                    // from the long, grazing light path (atChapman).
                                    float shadow = 1.0;
                                    if (mu < 0.0) {
                                        float perp = r * sqrt(max(1.0 - mu * mu, 0.0));
                                        shadow = smoothstep(-AT_SHADOW_SOFTNESS * AT_THICK, 0.0, perp - uAtPlanetR);
                                    }
                                    if (shadow <= 0.0) continue;

                                    vec3 lightDepth =
                                        betaRExt * (AT_HR * atChapman(Xr, alt / AT_HR, mu)) +
                                        betaMExt * (AT_HM * atChapman(Xm, alt / AT_HM, mu));
                                    vec3 T = exp(-(depthToSample + lightDepth)) * shadow;
                                    sumR[s] += T * rhoR * ds;
                                    sumM[s] += T * rhoM * ds;
                                }
                            }

                            for (int s = 0; s < AT_MAX_STARS; s++) {
                                if (s >= uAtStarCount) break;
                                float cosT = dot(rd, uAtStarDir[s]);
                                float phaseR = 0.0596831 * (1.0 + cosT * cosT); // 3/(16pi)
                                float g = AT_MIE_G;
                                float g2 = g * g;
                                float phaseM = 0.0795775 * (1.0 - g2) /
                                    pow(max(1.0 + g2 - 2.0 * g * cosT, 1e-4), 1.5); // 1/(4pi)
                                atColor += uAtStarLight[s] *
                                    (sumR[s] * uAtBetaR * phaseR + sumM[s] * uAtBetaM * phaseM);
                            }
                        }
                    }
                }
                // Linear radiance, like the lit surfaces: no compression of its own, so a very
                // bright star can wash the sky out to white, exactly as it does the ground.
                vec4 diffuseColor = vec4(atColor, 1.0);
                `
            );
    };
    material.customProgramCacheKey = () => 'atmosphere-shell-v3';

    const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, SHELL_WIDTH_SEGMENTS, SHELL_HEIGHT_SEGMENTS),
        material
    );
    mesh.name = 'AtmosphereShell';
    mesh.scale.setScalar(atmosphereRadius);
    mesh.renderOrder = 1;
    // Purely visual: keep it out of click picking.
    mesh.raycast = () => {};

    // Camera and star directions in the shell's object space, refreshed right before each draw
    // (after three.js has updated the world matrices). Also picks the face to draw.
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
        _invWorld.copy(mesh.matrixWorld).invert();
        _camWorld.setFromMatrixPosition(camera.matrixWorld);
        const camObj = uniforms.uAtCamObj.value.copy(_camWorld).applyMatrix4(_invWorld);

        const side = camObj.lengthSq() < 1 ? THREE.BackSide : THREE.FrontSide;
        if (material.side !== side) material.side = side;

        const count = uniforms.uAtStarCount.value;
        for (let i = 0; i < count; i++) {
            uniforms.uAtStarDir.value[i].copy(worldStarDirs[i]).transformDirection(_invWorld);
        }
    };

    parent.add(mesh);

    return {
        dispose: () => {
            mesh.parent?.remove(mesh);
            mesh.geometry.dispose();
            material.dispose();
        },
        update: (lights) => {
            const count = Math.min(lights.count, MAX_LIGHTING_STARS);
            let active = 0;
            for (let i = 0; i < count; i++) {
                const light = lights.lights[i];
                if (!(light.irradiance > 0)) continue;
                worldStarDirs[active].copy(light.dir);
                // The same irradiance three.js lights the surface with: no exposure fudge, so
                // sky and ground brighten and dim together.
                const k = light.irradiance;
                uniforms.uAtStarLight.value[active].set(
                    light.color.r * k,
                    light.color.g * k,
                    light.color.b * k
                );
                active++;
            }
            uniforms.uAtStarCount.value = active;
        },
        setVisible: (visible) => {
            mesh.visible = visible;
        },
    };
}
