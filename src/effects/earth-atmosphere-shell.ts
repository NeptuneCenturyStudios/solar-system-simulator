import * as THREE from 'three';

type AtmosphereShellUniforms = {
    uCameraPosWorld: { value: THREE.Vector3 };
    uTint: { value: THREE.Color };
    uFresnelPower: { value: number };
    uAlphaMax: { value: number };
};

export type AtmosphereShellHandle = {
    mesh: THREE.Mesh;
    update: (opts: {
        cameraPosWorld: THREE.Vector3;
    }) => void;
    setVisible: (visible: boolean) => void;
};

/**
 * Thin, shader-based atmosphere "haze shell".
 *
 * Renders from both inside and outside (DoubleSide).
 * Simple fresnel-based glow with a base tint color — no star lighting.
 */
export function createAtmosphereShell(
    scene: THREE.Scene,
    radius: number,
    tint: THREE.Color | number = 0x5599ff,
    parent: THREE.Object3D | null = null
): AtmosphereShellHandle {
    const geometry = new THREE.SphereGeometry(radius, 48, 24);

    const uniforms: AtmosphereShellUniforms = {
        uCameraPosWorld: { value: new THREE.Vector3() },
        uTint: { value: tint instanceof THREE.Color ? tint : new THREE.Color(tint) },
        uFresnelPower: { value: 1.75 },
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
            uniform vec3 uCameraPosWorld;
            uniform vec3 uTint;
            uniform float uFresnelPower;
            uniform float uAlphaMax;

            varying vec3 vNormalWS;
            varying vec3 vWorldPos;

            void main() {
                vec3 N = normalize(vNormalWS);

                // View direction (from fragment to camera).
                vec3 V = normalize(uCameraPosWorld - vWorldPos);

                // Fresnel / limb glow: strongest near the horizon.
                float fres = pow(1.0 - max(dot(N, V), 0.0), uFresnelPower);

                // Alpha: limb glow capped by max opacity.
                float alpha = clamp(fres, 0.0, uAlphaMax);

                // Color: tint scaled by fresnel strength.
                vec3 col = uTint * (0.65 + 0.85 * fres);

                gl_FragColor = vec4(col, alpha);
            }
        `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.visible = true;
    mesh.renderOrder = 1;

    if (parent) parent.add(mesh);
    else scene.add(mesh);

    return {
        mesh,
        update: ({ cameraPosWorld }) => {
            uniforms.uCameraPosWorld.value.copy(cameraPosWorld);
        },
        setVisible: (visible: boolean) => {
            mesh.visible = visible;
        },
    };
}
