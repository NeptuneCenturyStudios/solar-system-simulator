import * as THREE from 'three';
import { DIST_SCALE } from '../utilities/consts.js';

const MAX_STARS = 8;

type EarthAtmosphereSkyUniforms = {
    uStarDirs: { value: THREE.Vector3[] };
    uNumStars: { value: number };
    uUp: { value: THREE.Vector3 };
    uSkyColor: { value: THREE.Color };
    uSunsetTint: { value: THREE.Color };
    uDayAlphaMin: { value: number };
    uDayAlphaMax: { value: number };
};

export type EarthAtmosphereSkyHandle = {
    mesh: THREE.Mesh;
    update: (opts: {
        starDirsWorld: THREE.Vector3[];
        numStars: number;
        upWorld: THREE.Vector3;
    }) => void;
    setVisible: (visible: boolean) => void;
};

/**
 * Camera-centered "atmosphere sky" dome for Earth surface-cam.
 *
 * Blends a flat blue sky on the day side based on the max alignment
 * of the view direction with *all* contributing stars (up to MAX_STARS).
 */
export function createEarthAtmosphereSky(scene: THREE.Scene): EarthAtmosphereSkyHandle {
    const radius = 2_500_000_000 / DIST_SCALE; // matches scale of existing skydome-ish
    const geometry = new THREE.SphereGeometry(radius, 48, 24);

    const starDirs = Array.from({ length: MAX_STARS }, () => new THREE.Vector3(1, 0, 0));

    const uniforms: EarthAtmosphereSkyUniforms = {
        uStarDirs: { value: starDirs },
        uNumStars: { value: 0 },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uSkyColor: { value: new THREE.Color(0.35, 0.62, 1.0) }, // flat, no gradient
        uSunsetTint: { value: new THREE.Color(0xffc38a) },
        // Extend twilight further so it doesn’t become “fully night” too early on the far side.
        // Slightly tighter twilight band + smoother blend.
        // Start twilight a touch earlier on the sunset side.
        uDayAlphaMin: { value: -0.26 },
        uDayAlphaMax: { value: 0.36 },
    };

    const material = new THREE.ShaderMaterial({
        uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.BackSide,
        vertexShader: `
            varying vec3 vDir;
            void main() {
                vDir = normalize(position);
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uStarDirs[${MAX_STARS}];
            uniform int uNumStars;
            uniform vec3 uUp;
            uniform vec3 uSkyColor;
            uniform vec3 uSunsetTint;
            uniform float uDayAlphaMin;
            uniform float uDayAlphaMax;

            varying vec3 vDir;

            void main() {
                vec3 dir = normalize(vDir);

                float maxAlign = -1.0;
                for (int i = 0; i < ${MAX_STARS}; i++) {
                    if (i >= uNumStars) break;
                    vec3 L = normalize(uStarDirs[i]);
                    maxAlign = max(maxAlign, dot(dir, L));
                }

                float dayT = smoothstep(uDayAlphaMin, uDayAlphaMax, maxAlign);

                // Drop the day influence faster on the far side so midnight blue can appear.
                // Lower exponent => twilight crosses earlier (stronger early warm fade).
                dayT = pow(dayT, 0.55);

                // Stars fade into sky on the night side too (make baseline more visible for deep midnight blue).
                float skyAlpha = mix(0.22, 1.0, dayT);

                // Brightness shaping: zenith is brighter than horizon.
                float upAlign = clamp(dot(dir, normalize(uUp)), 0.0, 1.0);
                float zenith = pow(upAlign, 1.6);

                // Sunset tint near the horizon/terminator.
                // Lower exponent => warmth extends higher in the sky (earlier visually).
                float horizon = pow(1.0 - upAlign, 1.8);

                // Bandpass the warm/orange tint around the terminator (avoid drifting warm onto the far/night side).
                // With our current dayT shaping, this higher window should land the warmth on the sun-side glow.
                // Widen/shift warm band toward the brighter (sun) side by extending the upper dayT cutoff.
                float sunsetEdge = smoothstep(0.07, 0.22, dayT) * (1.0 - smoothstep(0.22, 0.44, dayT));

                // Warm intensity constrained by limb/horizon.
                // Slightly stronger near the terminator to start earlier visually.
                float warmFactor = clamp(horizon * sunsetEdge * 3.0, 0.0, 1.0);

                // Twilight brightness; also tie brightness to dayT.
                float skyStrength = mix(0.06, 1.0, zenith) * mix(0.14, 1.0, dayT);

                // Base blue (day-ish)
                vec3 colBlue = uSkyColor * skyStrength;

                // Deep midnight blue target for night side (much darker, and visible even when dayT is low).
                vec3 midnightBlue = vec3(0.012, 0.020, 0.075) * (0.65 + 0.85 * zenith) * (0.70 + 0.30 * dayT);

                // Blend blue->midnight based on dayT so the far side goes to deep blue even when dayT is very low.
                float blueToNightT = smoothstep(0.0, 0.12, dayT);
                vec3 colBlueFinal = mix(midnightBlue, colBlue, blueToNightT);

                // Warm/orange near terminator (stronger)
                vec3 colWarm = uSunsetTint * skyStrength * 1.25;

                // Finally mix warm into the blue band near the horizon (stronger warm dominance)
                vec3 skyColor = mix(colBlueFinal, colWarm, warmFactor * 0.90);

                gl_FragColor = vec4(skyColor, skyAlpha);
            }
        `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = -999; // after the star skydome (which uses -1000), but still depth-tested
    mesh.frustumCulled = false;
    mesh.visible = false;

    scene.add(mesh);

    return {
        mesh,
        update: ({ starDirsWorld, numStars, upWorld }) => {
            const count = Math.min(MAX_STARS, Math.max(0, numStars));
            uniforms.uNumStars.value = count;

            for (let i = 0; i < MAX_STARS; i++) {
                if (i < count && starDirsWorld[i]) {
                    uniforms.uStarDirs.value[i].copy(starDirsWorld[i]).normalize();
                } else {
                    uniforms.uStarDirs.value[i].set(1, 0, 0);
                }
            }

            uniforms.uUp.value.copy(upWorld).normalize();
        },
        setVisible: (visible: boolean) => {
            mesh.visible = visible;
        },
    };
}
