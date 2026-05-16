import * as THREE from 'three';

const MAX_STARS = 8;

type EarthAtmosphereShellUniforms = {
    uStarDirs: { value: THREE.Vector3[] };
    uNumStars: { value: number };
    uCameraPosWorld: { value: THREE.Vector3 };
    uTint: { value: THREE.Color };
    uSunsetTint: { value: THREE.Color };
    uAlphaDayMin: { value: number };
    uAlphaDayMax: { value: number };
    uFresnelPower: { value: number };
    uAlphaMax: { value: number };
};

export type EarthAtmosphereShellHandle = {
    mesh: THREE.Mesh;
    update: (opts: {
        starDirsWorld: THREE.Vector3[];
        numStars: number;
        cameraPosWorld: THREE.Vector3;
    }) => void;
    setVisible: (visible: boolean) => void;
};

/**
 * Thin, shader-based Earth atmosphere "haze shell".
 *
 * Renders from both inside and outside (DoubleSide).
 *
 * Multi-star support:
 * - dayFactor uses MAX(dot(N, L_i)) across up to MAX_STARS star directions,
 *   so the atmosphere blue glow appears on any star-lit side.
 */
export function createEarthAtmosphereShell(
    scene: THREE.Scene,
    radius: number,
    tint: THREE.Color | number = 0x5599ff,
    parent: THREE.Object3D | null = null
): EarthAtmosphereShellHandle {
    const geometry = new THREE.SphereGeometry(radius, 48, 24);

    const starDirs = Array.from({ length: MAX_STARS }, () => new THREE.Vector3(1, 0, 0));

    const uniforms: EarthAtmosphereShellUniforms = {
        uStarDirs: { value: starDirs },
        uNumStars: { value: 0 },
        uCameraPosWorld: { value: new THREE.Vector3() },
        uTint: { value: tint instanceof THREE.Color ? tint : new THREE.Color(tint) },
        // Warm sunset tint (orange-peach) near the terminator/horizon.
        uSunsetTint: { value: new THREE.Color(0xffc38a) },
        // How quickly it transitions from mostly transparent to visible on day side.
        // Widen + shift negative to keep haze visible past the terminator (thicker twilight).
        // Start twilight much earlier on the sunset side.
        uAlphaDayMin: { value: -0.48 },
        uAlphaDayMax: { value: 0.35 },
        // Lower = wider rim; keep it smooth.
        uFresnelPower: { value: 1.75 },
        // Cap overall shell opacity (slightly lighter).
        uAlphaMax: { value: 0.76 },
    };

    const material = new THREE.ShaderMaterial({
        uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        vertexShader: `
            varying vec3 vNormalWS;
            varying vec3 vWorldPos;

            void main() {
                vec4 worldPos4 = modelMatrix * vec4(position, 1.0);
                vWorldPos = worldPos4.xyz;

                // Convert normal to world-space with inverse-transpose baked-in via mat3(modelMatrix)
                vNormalWS = normalize(mat3(modelMatrix) * normal);

                gl_Position = projectionMatrix * viewMatrix * worldPos4;
            }
        `,
        fragmentShader: `
            uniform vec3 uStarDirs[${MAX_STARS}];
            uniform int uNumStars;

            uniform vec3 uCameraPosWorld;
            uniform vec3 uTint;
            uniform vec3 uSunsetTint;
            uniform float uAlphaDayMin;
            uniform float uAlphaDayMax;
            uniform float uFresnelPower;
            uniform float uAlphaMax;

            varying vec3 vNormalWS;
            varying vec3 vWorldPos;

            void main() {
                vec3 N = normalize(vNormalWS);

                // Multi-star day factor: strongest alignment wins.
                float maxLight = -1.0;
                for (int i = 0; i < ${MAX_STARS}; i++) {
                    if (i >= uNumStars) break;
                    vec3 L = normalize(uStarDirs[i]);
                    maxLight = max(maxLight, dot(N, L));
                }

                // Drive the overall fade into twilight with the multi-star maxLight.
                float dayT = smoothstep(uAlphaDayMin, uAlphaDayMax, maxLight);
                // Lower exponent => haze ramps in earlier (stronger early warm).
                dayT = pow(dayT, 0.42);

                // View direction (from fragment to camera).
                vec3 V = normalize(uCameraPosWorld - vWorldPos);

                // Fresnel / limb glow: strongest near the horizon.
                float fres = pow(1.0 - max(dot(N, V), 0.0), uFresnelPower);

                // Final alpha: twilight * limb boost, capped.
                float alpha = dayT * (0.22 + 1.05 * fres);
                alpha = clamp(alpha, 0.0, uAlphaMax);

                // Brightness: slightly stronger on twilight and limb.
                float strength = mix(0.40, 1.0, dayT) * (0.65 + 0.85 * fres);

                // Sunset tint: strongest near terminator/horizon for whichever star is dominating.
                // Extend warm tint deeper into the bright (day) side while keeping it
                // strongest near the terminator. This balances warm extension vs night.
                // Extend warm deeper into the bright/day side (broader maxLight range).
                // Slightly extend warm deeper into the bright/day side ("just a tad more").
                float sunsetEdge = 1.0 - smoothstep(0.08, 0.46, maxLight);
                float warmFactor = clamp(sunsetEdge * pow(fres, 1.0), 0.0, 1.0);

                vec3 colBlue = uTint * strength;
                vec3 colWarm = uSunsetTint * strength * 1.08;

                vec3 col = mix(colBlue, colWarm, warmFactor);

                gl_FragColor = vec4(col, alpha);
            }
        `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;

    // Start hidden; Earth will decide visibility (usually always visible).
    mesh.visible = true;

    // Put behind clouds by renderOrder (clouds in Earth are set to renderOrder=2).
    // If clouds are absent, it still works.
    mesh.renderOrder = 1;

    if (parent) parent.add(mesh);
    else scene.add(mesh);

    return {
        mesh,
        update: ({ starDirsWorld, numStars, cameraPosWorld }) => {
            const count = Math.min(MAX_STARS, Math.max(0, numStars));
            uniforms.uNumStars.value = count;

            for (let i = 0; i < MAX_STARS; i++) {
                if (i < count && starDirsWorld[i]) {
                    uniforms.uStarDirs.value[i].copy(starDirsWorld[i]).normalize();
                } else {
                    uniforms.uStarDirs.value[i].set(1, 0, 0);
                }
            }

            uniforms.uCameraPosWorld.value.copy(cameraPosWorld);
        },
        setVisible: (visible: boolean) => {
            mesh.visible = visible;
        },
    };
}
