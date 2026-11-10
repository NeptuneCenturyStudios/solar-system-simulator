import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Body } from './body';
import { BodyTypeEnum } from './body-enums';
import {
    PLAYER_MASS,
    PLAYER_RADIUS,
    PLAYER_SHADOW_DEPTH,
    PLAYER_SHADOW_HEAD_RADIUS,
    PLAYER_SHADOW_HEIGHT,
    PLAYER_SHADOW_WIDTH,
    SHADOW_CASTER_LAYER,
} from '../utilities/consts';

/** Scratch, so the per-frame calls never allocate. */
const _basis = new THREE.Matrix4();
const _back = new THREE.Vector3();
const _right = new THREE.Vector3();
const _parentInv = new THREE.Quaternion();

/**
 * A stylised standing figure, feet at the origin and head along +Y, facing −Z: a body capsule
 * (flattened front to back) topped by a head sphere. Only its silhouette matters — it is drawn
 * into the shadow atlas and nowhere else.
 */
function createShadowFigureGeometry(): THREE.BufferGeometry {
    const head = PLAYER_SHADOW_HEAD_RADIUS;
    const bodyHeight = PLAYER_SHADOW_HEIGHT - 2 * head;
    const bodyRadius = PLAYER_SHADOW_WIDTH / 2;

    const body = new THREE.CapsuleGeometry(bodyRadius, bodyHeight - 2 * bodyRadius, 4, 12);
    body.scale(1, 1, PLAYER_SHADOW_DEPTH / PLAYER_SHADOW_WIDTH);
    body.translate(0, bodyHeight / 2, 0);

    const headGeometry = new THREE.SphereGeometry(head, 12, 8);
    headGeometry.translate(0, PLAYER_SHADOW_HEIGHT - head, 0);

    const merged = mergeGeometries([body, headGeometry]);
    body.dispose();
    headGeometry.dispose();
    if (!merged) throw new Error('PlayerRig: could not build the shadow figure.');
    return merged;
}

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

    /**
     * Bounding radius of the shadow figure about its middle ({@link getShadowCenter}). The shadow
     * system sizes the player's atlas tile from it.
     */
    readonly shadowRadius = PLAYER_SHADOW_HEIGHT * 0.55;

    /**
     * The figure the player's shadow is cast by. It lives only on SHADOW_CASTER_LAYER, so the
     * shadow cameras draw it but the main camera — which sits inside it, at eye height — never
     * does.
     */
    private readonly shadowFigure: THREE.Mesh;

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

        // A visible material: three.js skips any object whose own material is invisible, even when
        // the shadow pass draws with an override material.
        const figure = new THREE.Mesh(
            createShadowFigureGeometry(),
            new THREE.MeshBasicMaterial({ colorWrite: false })
        );
        figure.layers.set(SHADOW_CASTER_LAYER);
        figure.raycast = () => {};
        figure.frustumCulled = false;
        mesh.add(figure);
        this.shadowFigure = figure;
    }

    /** Whether the player is asking to move this frame. */
    get hasMoveInput(): boolean {
        return this.moveSpeed > 0 && this.moveDir.lengthSq() > 0;
    }

    /**
     * Stand the shadow figure up along `up` and turn it to face `forward` (both world-space unit
     * vectors, `forward` on the ground plane), so its silhouette matches the player's heading.
     */
    orientShadow(up: THREE.Vector3, forward: THREE.Vector3): void {
        _right.crossVectors(forward, up).normalize();
        _back.copy(forward).negate();
        _basis.makeBasis(_right, up, _back);
        this.shadowFigure.quaternion
            .setFromRotationMatrix(_basis)
            .premultiply(_parentInv.copy(this.mesh.quaternion).invert());
    }

    /**
     * The middle of the shadow figure in world space (half its height above the feet, along the
     * home body's local up), written into `out`.
     */
    getShadowCenter(out: THREE.Vector3): THREE.Vector3 {
        out.subVectors(this.mesh.position, this.homeBody.mesh.position);
        if (out.lengthSq() < 1e-24) out.set(0, 1, 0);
        return out
            .normalize()
            .multiplyScalar(PLAYER_SHADOW_HEIGHT / 2)
            .add(this.mesh.position);
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
        this.shadowFigure.geometry.dispose();
        (this.shadowFigure.material as THREE.Material).dispose();
        this.label.material.map?.dispose();
        this.label.material.dispose();
    }
}
