import * as THREE from 'three';
import { DIST_SCALE } from '../utilities/consts.js';

type EarthAtmosphereSkyUniforms = {
    uSunDir: { value: THREE.Vector3 };
    uUp: { value: THREE.Vector3 };
    uSkyColor: { value: THREE.Color };
    uSunsetTint: { value: THREE.Color };
    uDayAlphaMin: { value: number };
    uDayAlphaMax: { value: number };
};

export type EarthAtmosphereSkyHandle = {
    mesh: THREE.Mesh;
    update: (opts: { sunDirWorld: THREE.Vector3; upWorld: THREE.Vector3 }) => void;
    setVisible: (visible: boolean) => void;
};

/**
 * Camera-centered "atmosphere sky" dome for Earth surface-cam.
 *
 * Goal:
 * - Keep existing skydome stars visible on the night side.
 * - Add a flat blue sky on the day side, blended by a simple day-factor shader.
 *
 * Implementation:
 * - Dome is centered at the camera by caller (update position every frame).
 * - Fragment alpha is dayAlpha = smoothstep(min,max, dot(viewDir, sunDir)).
 * - Uses camera/surface gravity-up direction to loosely shape the brightness.
 */
export function createEarthAtmosphereSky(scene: THREE.Scene): EarthAtmosphereSkyHandle {
    const radius = 2_500_000_000 / DIST_SCALE; // matches scale of existing skydome-ish

    const geometry = new THREE.SphereGeometry(radius, 48, 24);

    const uniforms: EarthAtmosphereSkyUniforms = {
        uSunDir: { value: new THREE.Vector3(1, 0, 0) },
        uUp: { value: new THREE.Vector3(0, 1, 0) },
        uSkyColor: { value: new THREE.Color(0.35, 0.62, 1.0) }, // flat, no gradient
        uSunsetTint: { value: new THREE.Color(0xffc38a) },
        // Extend twilight further so it doesn’t become “fully night” too early on the far side.
        uDayAlphaMin: { value: -0.18 },
        uDayAlphaMax: { value: 0.40 },
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
            uniform vec3 uSunDir;
            uniform vec3 uUp;
            uniform vec3 uSkyColor;
            uniform vec3 uSunsetTint;
            uniform float uDayAlphaMin;
            uniform float uDayAlphaMax;

            varying vec3 vDir;

            void main() {
                vec3 dir = normalize(vDir);

                // sunAlign is [-1..1] where 1 means the ray points at the sun.
                float sunAlign = dot(dir, normalize(uSunDir));
                float dayT = smoothstep(uDayAlphaMin, uDayAlphaMax, sunAlign);

                // Make twilight fade smoother and a bit more “extended”.
                dayT = pow(dayT, 0.50);

                // Stars fade into sky on the night side too (but very lightly).
                float skyAlpha = mix(0.02, 1.0, dayT);

                // Brightness shaping: zenith is brighter than horizon.
                float upAlign = clamp(dot(dir, normalize(uUp)), 0.0, 1.0);
                float zenith = pow(upAlign, 1.6);

                // Sunset tint near the horizon/terminator:
                // - zenith small => closer to horizon
                // - dayT moderate => around twilight band
                float horizon = pow(1.0 - upAlign, 1.2);
                float sunsetEdge = (1.0 - dayT);
                float warmFactor = clamp(horizon * sunsetEdge * 2.0, 0.0, 1.0);

                // Twilight brightness; also tie brightness to dayT.
                float skyStrength = mix(0.10, 1.0, zenith) * mix(0.22, 1.0, dayT);

                vec3 colBlue = uSkyColor * skyStrength;
                vec3 colWarm = uSunsetTint * skyStrength * 1.08;

                vec3 skyColor = mix(colWarm, colBlue, zenith); // warm near horizon

                // Add additional warm bias right at the edge of twilight.
                skyColor = mix(skyColor, colWarm, warmFactor * 0.65);

                gl_FragColor = vec4(skyColor, skyAlpha);
            }
        `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = -999; // after the star skydome (which uses -1000), but still depth-tested
    mesh.frustumCulled = false;
    mesh.visible = false;

    // Start hidden; caller toggles.
    scene.add(mesh);

    const handle: EarthAtmosphereSkyHandle = {
        mesh,
        update: ({ sunDirWorld, upWorld }) => {
            uniforms.uSunDir.value.copy(sunDirWorld).normalize();
            uniforms.uUp.value.copy(upWorld).normalize();
        },
        setVisible: (visible: boolean) => {
            mesh.visible = visible;
        },
    };

    return handle;
}
