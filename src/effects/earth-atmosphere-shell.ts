import * as THREE from 'three';

type EarthAtmosphereShellUniforms = {
    uSunDir: { value: THREE.Vector3 };
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
    update: (opts: { sunDirWorld: THREE.Vector3; cameraPosWorld: THREE.Vector3 }) => void;
    setVisible: (visible: boolean) => void;
};

/**
 * Thin, shader-based Earth atmosphere "haze shell".
 *
 * Renders from both inside and outside (DoubleSide).
 * Uses:
 * - dayFactor from dot(normalWS, sunDir)
 * - limb brightening from a Fresnel term using view direction
 *
 * Designed to sit slightly outside the cloud sphere.
 */
export function createEarthAtmosphereShell(
    scene: THREE.Scene,
    radius: number,
    tint: THREE.Color | number = 0x5599ff,
    parent: THREE.Object3D | null = null
): EarthAtmosphereShellHandle {
    const geometry = new THREE.SphereGeometry(radius, 48, 24);

    const uniforms: EarthAtmosphereShellUniforms = {
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
        uCameraPosWorld: { value: new THREE.Vector3() },
        uTint: { value: tint instanceof THREE.Color ? tint : new THREE.Color(tint) },
        // Warm sunset tint (orange-peach) near the terminator/horizon.
        uSunsetTint: { value: new THREE.Color(0xffc38a) },
        // How quickly it transitions from mostly transparent to visible on day side.
        // Widen + shift negative to keep haze visible past the terminator (thicker twilight).
        uAlphaDayMin: { value: -0.30 },
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
            uniform vec3 uSunDir;
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
                vec3 L = normalize(uSunDir);

                // Day side factor: use unclamped ndotl so twilight can extend past the terminator.
                float ndotlRaw = dot(N, L);

                // dayT drives the overall fade into twilight.
                float dayT = smoothstep(uAlphaDayMin, uAlphaDayMax, ndotlRaw);

                // Bias toward longer twilight (less early cutoff).
                dayT = pow(dayT, 0.60);

                // View direction (from fragment to camera).
                vec3 V = normalize(uCameraPosWorld - vWorldPos);

                // Fresnel / limb glow: strongest near the horizon.
                float fres = pow(1.0 - max(dot(N, V), 0.0), uFresnelPower);

                // Final alpha: twilight * limb boost, capped.
                float alpha = dayT * (0.22 + 1.05 * fres);
                alpha = clamp(alpha, 0.0, uAlphaMax);

                // Brightness: slightly stronger on twilight and limb.
                float strength = mix(0.40, 1.0, dayT) * (0.65 + 0.85 * fres);

                // Sunset tint: strongest near horizon and when ndotlRaw is small (around terminator).
                // ndotlRaw ~ 0 => boundary between day/night.
                float sunsetEdge = 1.0 - smoothstep(0.05, 0.22, ndotlRaw);
                float warmFactor = clamp(sunsetEdge * pow(fres, 1.15), 0.0, 1.0);

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

    // Attach to parent if provided; otherwise add to the scene.
    if (parent) {
        parent.add(mesh);
    } else {
        scene.add(mesh);
    }

    return {
        mesh,
        update: ({ sunDirWorld, cameraPosWorld }) => {
            uniforms.uSunDir.value.copy(sunDirWorld).normalize();
            uniforms.uCameraPosWorld.value.copy(cameraPosWorld);
        },
        setVisible: (visible: boolean) => {
            mesh.visible = visible;
        },
    };
}
