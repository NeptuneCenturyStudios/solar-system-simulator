import * as THREE from 'three';
import { Body } from './body';
import { BodyTypeEnum } from './body-enums';
import { PLAYER_MASS, PLAYER_RADIUS } from '../utilities/consts';

/**
 * The player on foot (surface mode): a person-sized body moved by the same n-body integrator as
 * ships, so gravity, the rotating ground frame and time warp act on it exactly as they act on
 * everything else.
 *
 * `mesh.position` is the player's **feet** — the point that touches the ground. The camera sits
 * PLAYER_EYE_HEIGHT above it (see SurfaceCameraManager).
 *
 * The rig is deliberately not in `simulationState.bodies`: physics.ts appends it to the
 * integrator's list while it is active (see physics/player-rig-physics.ts). The collision pass,
 * UI lists, HUD markers, orbit prediction and AI all iterate that list, and none of them should see
 * a 0.3 m human (the generic collision pass would have the planet absorb it).
 */
export class PlayerRig extends Body {
    /** The body the player stands on: its centre defines "up", its surface the ground. */
    readonly homeBody: Body;

    /** Feet within PLAYER_GROUND_TOLERANCE of the ground (set every physics substep). */
    isGrounded = true;

    /**
     * Parked spot: the feet's offset from the home body's centre with the body's rotation removed,
     * or null while moving. While parked the feet are carried rigidly with the ground, so standing
     * still is stable at any time warp.
     */
    anchorLocal: THREE.Vector3 | null = null;

    /** Desired walking direction (world-space unit tangent), or zero for no input. */
    readonly moveDir = new THREE.Vector3();
    /** Desired ground speed along moveDir (sim units / s). */
    moveSpeed = 0;
    /** A jump requested by the player, carried out at the next grounded substep. */
    jumpQueued = false;

    /** Fraction of the home body's radius at which its drawn surface lies under the feet. */
    reachFactor = 1;

    /**
     * Speed (into the ground) removed by the most recent touchdown, for the camera's landing dip.
     * The camera reads and clears it.
     */
    lastImpactSpeed = 0;

    constructor(scene: THREE.Scene, homeBody: Body, feet: THREE.Vector3, velocity: THREE.Vector3) {
        const material = new THREE.MeshBasicMaterial({ visible: false });
        const mesh = new THREE.Mesh(new THREE.SphereGeometry(PLAYER_RADIUS, 6, 4), material);
        // Never pickable: clicks and hover rays pass straight through the player.
        mesh.raycast = () => {};
        mesh.frustumCulled = false;

        super(
            {},
            scene,
            PLAYER_MASS,
            PLAYER_RADIUS,
            feet,
            velocity,
            mesh,
            'player-rig',
            'Player',
            BodyTypeEnum.Player
        );
        this.homeBody = homeBody;
    }

    /** Whether the player is asking to move this frame. */
    get hasMoveInput(): boolean {
        return this.moveSpeed > 0 && this.moveDir.lengthSq() > 0;
    }

    /**
     * Remove the rig from the scene. Unlike die(), this is silent: no explosion sound and no
     * `body:dead` event — leaving surface mode is not a death.
     */
    dispose(): void {
        if (this._isDisposed) return;
        this._isDisposed = true;
        this.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        const material = this.mesh.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
        this.label.material.map?.dispose();
        this.label.material.dispose();
    }
}
