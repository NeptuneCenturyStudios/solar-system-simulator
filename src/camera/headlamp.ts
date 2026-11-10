import * as THREE from 'three';
import {
    HEADLAMP_ANGLE,
    HEADLAMP_COLOR,
    HEADLAMP_EYE_OFFSET,
    HEADLAMP_INTENSITY,
    HEADLAMP_PENUMBRA,
    HEADLAMP_RANGE,
} from '../utilities/consts';

/**
 * The player's head lamp (torch) on foot: a spotlight at the eye, aimed along the view.
 *
 * The light stays in the scene for the whole session and is switched by its intensity. Adding,
 * removing or hiding a light changes three.js's light count, which recompiles every lit material —
 * a visible hitch on the first press.
 */
export class Headlamp {
    private readonly scene: THREE.Scene;
    private readonly light: THREE.SpotLight;
    private on = false;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        // Decay 0: see HEADLAMP_RANGE for why the cutoff window does the falloff.
        this.light = new THREE.SpotLight(
            HEADLAMP_COLOR,
            0,
            HEADLAMP_RANGE,
            HEADLAMP_ANGLE,
            HEADLAMP_PENUMBRA,
            0
        );
        this.light.castShadow = false;
        this.light.name = 'player-headlamp';
        this.light.target.name = 'player-headlamp-target';
        scene.add(this.light);
        scene.add(this.light.target);
    }

    get isOn(): boolean {
        return this.on;
    }

    setOn(on: boolean): void {
        this.on = on;
        this.light.intensity = on ? HEADLAMP_INTENSITY : 0;
    }

    toggle(): boolean {
        this.setOn(!this.on);
        return this.on;
    }

    /**
     * Place the lamp just above the eye and aim it along the view.
     *
     * @param eye Camera position (head bob included).
     * @param forward Unit view direction.
     * @param up Camera up.
     */
    update(eye: THREE.Vector3, forward: THREE.Vector3, up: THREE.Vector3): void {
        this.light.position.copy(eye).addScaledVector(up, HEADLAMP_EYE_OFFSET);
        // Any point along the view works as a target; one beam-length out keeps it well-conditioned.
        this.light.target.position
            .copy(this.light.position)
            .addScaledVector(forward, HEADLAMP_RANGE);
        this.light.updateMatrixWorld();
        this.light.target.updateMatrixWorld();
    }

    dispose(): void {
        this.scene.remove(this.light);
        this.scene.remove(this.light.target);
        this.light.dispose();
    }
}
