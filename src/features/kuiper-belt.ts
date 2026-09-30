import * as THREE from 'three';
import { SolarSystemFeature } from './solar-system-feature';
import {
    KUIPER_BELT_COUNT,
    KUIPER_BELT_INNER_DIST,
    KUIPER_BELT_OUTER_DIST,
    KUIPER_BELT_VERTICAL_SPREAD,
} from '../utilities/consts';

/**
 * Kuiper Belt - distant icy objects in a donut/disc shape beyond Neptune.
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
            opacity: 0.4,
            depthTest: true,
            depthWrite: false,
        });

        this.attach(new THREE.Points(geometry, material));
    }
}
