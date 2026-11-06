import * as THREE from 'three';
import { SolarSystemFeature } from './solar-system-feature';
import {
    KUIPER_BELT_COUNT,
    KUIPER_BELT_FADE_END_DIST,
    KUIPER_BELT_FADE_START_DIST,
    KUIPER_BELT_INNER_DIST,
    KUIPER_BELT_OPACITY,
    KUIPER_BELT_OUTER_DIST,
    KUIPER_BELT_VERTICAL_SPREAD,
} from '../utilities/consts';

const _cameraWorldPos = new THREE.Vector3();
const _beltWorldPos = new THREE.Vector3();

/**
 * Kuiper Belt - distant icy objects in a donut/disc shape beyond Neptune.
 *
 * The belt's points use a fixed pixel size, so from inside the system they would show as a
 * scatter of dots across the whole sky. Real Kuiper belt objects are invisible from there, so the
 * belt fades in only once the camera is well outside it (see KUIPER_BELT_FADE_START_DIST).
 */
export class KuiperBelt extends SolarSystemFeature {
    readonly name = 'Kuiper Belt';

    constructor(scene: THREE.Scene) {
        super(scene);

        const positions = new Float32Array(KUIPER_BELT_COUNT * 3);
        for (let i = 0; i < KUIPER_BELT_COUNT; i++) {
            // Donut shape: from Neptune to beyond Pluto
            const r =
                KUIPER_BELT_INNER_DIST +
                Math.random() * (KUIPER_BELT_OUTER_DIST - KUIPER_BELT_INNER_DIST);
            const theta = Math.random() * Math.PI * 2;
            const verticalSpread = (Math.random() - 0.5) * KUIPER_BELT_VERTICAL_SPREAD; // Some thickness to the disc

            positions[i * 3] = r * Math.cos(theta);
            positions[i * 3 + 1] = verticalSpread;
            positions[i * 3 + 2] = r * Math.sin(theta);
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const material = new THREE.PointsMaterial({
            color: 0x888888,
            size: 1.3,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0,
            depthTest: true,
            depthWrite: false,
        });

        const points = new THREE.Points(geometry, material);
        // Runs for every camera that renders the scene (main view, cockpit view, ...), so the fade
        // always matches the viewpoint actually being drawn.
        points.onBeforeRender = (_renderer, _scene, camera): void => {
            camera.getWorldPosition(_cameraWorldPos);
            points.getWorldPosition(_beltWorldPos);
            const fade = THREE.MathUtils.smoothstep(
                _cameraWorldPos.distanceTo(_beltWorldPos),
                KUIPER_BELT_FADE_START_DIST,
                KUIPER_BELT_FADE_END_DIST
            );
            material.opacity = KUIPER_BELT_OPACITY * fade;
            // An empty draw range makes the renderer skip the draw call entirely while the belt is
            // invisible; onBeforeRender still runs each frame, so it re-enables itself on zoom-out.
            geometry.setDrawRange(0, fade > 0 ? Infinity : 0);
        };

        this.attach(points);
    }
}
