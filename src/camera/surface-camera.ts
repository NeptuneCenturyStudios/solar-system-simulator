import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Body } from '../bodies/body';
import { BlackHole } from '../bodies/black-hole';
import { isBodyType } from '../utilities/utilities';
import { FlightHUD } from '../drawing/flight-hud';
import { BodyTypeEnum } from '../bodies/body-enums';
import { PLAYER_EYE_HEIGHT, PLAYER_SPRINT_SPEED, PLAYER_WALK_SPEED } from '../utilities/consts';
import { surfaceReachFactor } from '../physics/body-surface';
import { surfaceVelocityAt } from '../physics/collision';
import { PlayerRig } from '../bodies/player-rig';
import { setActivePlayerRig } from '../physics/player-rig-physics';
import { HeadBob } from './head-bob';
import { Headlamp } from './headlamp';

/**
 * Bodies the player rig can never stand on: stellar remnants (stars themselves are excluded
 * separately, and deferred), and craft or portals rather than ground.
 */
const SURFACE_CAM_EXCLUDED_TYPES =
    BodyTypeEnum.WhiteDwarf |
    BodyTypeEnum.BrownDwarf |
    BodyTypeEnum.Pulsar |
    BodyTypeEnum.BlackHole |
    BodyTypeEnum.SpaceShip |
    BodyTypeEnum.Probe |
    BodyTypeEnum.Satellite |
    BodyTypeEnum.Wormhole |
    BodyTypeEnum.Player;

/** Keys the player rig reads (a view of the animation loop's keyboard state). */
export interface PlayerMoveKeys {
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
    space: boolean;
    shift: boolean;
}

export interface SurfaceCameraState {
    isActive: boolean;
    body: Body | null;
    /** The player on foot while surface mode is active (moved by the physics). */
    rig: PlayerRig | null;
    /**
     * Heading reference (tangent to the surface under the player) in the body's local frame.
     * Parallel-transported every frame as the player walks, so the view never skews.
     */
    anchorLocalNorth: THREE.Vector3;
    yaw: number;
    pitch: number;
    prevCameraUp: THREE.Vector3;
    lookSensitivity: number;
}

/**
 * Surface mode: the player on foot. Owns the {@link PlayerRig} (a physics body the n-body
 * integrator moves — see physics/player-rig-physics.ts), turns WASD / Shift / Space into its walk
 * and jump requests, and places the camera at its eye with head bob.
 */
export class SurfaceCameraManager {
    readonly state: SurfaceCameraState = {
        isActive: false,
        body: null,
        rig: null,
        anchorLocalNorth: new THREE.Vector3(0, 0, 1),
        yaw: 0,
        pitch: 0,
        prevCameraUp: new THREE.Vector3(0, 1, 0),
        lookSensitivity: 0.002,
    };

    get isActive() {
        return this.state.isActive;
    }

    private readonly camera: THREE.PerspectiveCamera;
    private readonly controls: OrbitControls;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly simulationState: { bodies: Body[] };
    private readonly flightHUD: FlightHUD;
    private readonly cameraState: { isFreeCameraMode: boolean; isLookAtMode: boolean };
    private readonly onFreeCameraModeExit: () => void;

    private readonly headBob = new HeadBob();
    /** The player's torch (T). Follows the view, head bob included; off when leaving surface mode. */
    private readonly headlamp: Headlamp;
    /** Space held last frame, so a jump fires once per press. */
    private prevSpace = false;

    /** Scratch, so the per-frame update never allocates. */
    private readonly _up = new THREE.Vector3();
    private readonly _north = new THREE.Vector3();
    private readonly _forward = new THREE.Vector3();
    private readonly _right = new THREE.Vector3();
    private readonly _groundVel = new THREE.Vector3();
    private readonly _lookAt = new THREE.Vector3();
    private readonly _quat = new THREE.Quaternion();

    constructor(
        camera: THREE.PerspectiveCamera,
        controls: OrbitControls,
        renderer: THREE.WebGLRenderer,
        simulationState: { bodies: Body[] },
        flightHUD: FlightHUD,
        cameraState: { isFreeCameraMode: boolean; isLookAtMode: boolean },
        onFreeCameraModeExit: () => void,
        scene: THREE.Scene
    ) {
        this.headlamp = new Headlamp(scene);
        this.camera = camera;
        this.controls = controls;
        this.renderer = renderer;
        this.simulationState = simulationState;
        this.flightHUD = flightHUD;
        this.cameraState = cameraState;
        this.onFreeCameraModeExit = onFreeCameraModeExit;
    }

    isEligibleBody(body: Body | null): boolean {
        if (!body || !this.simulationState.bodies.includes(body) || body._isDisposed || !body.mesh)
            return false;
        if (isBodyType(body, BodyTypeEnum.Star)) return false;
        if (body instanceof BlackHole) return false;
        if ((body.bodyType & SURFACE_CAM_EXCLUDED_TYPES) !== 0) return false;
        return (body.radius || 0) > 0;
    }

    updateButtonEnabled(): void {
        // Button enable/disable is now handled by the Vue System Explorer
        // which reads isEligibleBody via the sim bridge.
    }

    /**
     * Leaves surface mode. The camera is left where it stood (only its up vector is restored, so
     * OrbitControls rotation works again); the caller decides what to frame next — see
     * exitSurfaceCameraToLookAt in index.ts. The player rig is removed from the physics.
     */
    exit(): void {
        this.camera.up.copy(this.state.prevCameraUp);

        this.state.isActive = false;
        this.state.body = null;
        this.removeRig();
        this.headlamp.setOn(false);

        this.controls.enabled = true;

        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }

        this.flightHUD.forceHintRefresh();
    }

    /**
     * Enters surface mode on `body`: the player rig is stood on the ground there, at rest.
     *
     * @param options.worldPoint Stand on the ground under this world point (default: under the
     *   camera).
     * @param options.faceToward Start facing this world point (default: world-axis "north").
     */
    enter(
        body: Body | null,
        options: { worldPoint?: THREE.Vector3; faceToward?: THREE.Vector3 } = {}
    ): void {
        if (!body) return;
        if (!this.isEligibleBody(body)) return;

        this.state.prevCameraUp.copy(this.camera.up);

        if (this.cameraState.isFreeCameraMode) {
            this.cameraState.isFreeCameraMode = false;
            this.onFreeCameraModeExit();
        }
        if (this.cameraState.isLookAtMode) {
            this.cameraState.isLookAtMode = false;
        }

        this.controls.enabled = false;

        this.state.isActive = true;
        this.state.body = body;
        this.state.yaw = 0;
        this.state.pitch = 0;

        const bodyCenter = body.mesh.position.clone();
        const surfaceNormalWorld = new THREE.Vector3()
            .subVectors(options.worldPoint ?? this.camera.position, bodyCenter)
            .normalize();
        const invQ = body.mesh.quaternion.clone().invert();

        // Pick the starting heading from world axes once, then store it in the body's frame so
        // the view stays fixed to the surface as the body spins and tilts.
        const northWorld = this.initialHeading(surfaceNormalWorld, options.faceToward);
        this.state.anchorLocalNorth = northWorld.applyQuaternion(invQ).normalize();

        // Stand on the drawn ground under that point, not the true sphere: a UV sphere's flat
        // facets sag inward between vertices (~8 km on Earth), and a model body (asteroid, comet
        // nucleus) is an irregular rock inside its bounding radius.
        const reach = surfaceReachFactor(body, surfaceNormalWorld);
        const groundRadius = (body.radius || 0) * (body.mesh.scale.x || 1) * reach;
        const feet = bodyCenter.clone().addScaledVector(surfaceNormalWorld, groundRadius);
        const velocity = surfaceVelocityAt(body, feet, new THREE.Vector3());

        this.removeRig();
        const rig = new PlayerRig(body.scene, body, feet, velocity);
        rig.reachFactor = reach;
        // Start parked: standing still exactly where we arrived until a key is pressed.
        rig.anchorLocal = feet.clone().sub(bodyCenter).applyQuaternion(invQ);
        this.state.rig = rig;
        setActivePlayerRig(rig);
        this.headBob.reset();
        this.prevSpace = false;

        this.updateTransform();

        this.flightHUD.forceHintRefresh();
    }

    /**
     * Starting heading at the given surface normal: toward `faceToward` when given, otherwise
     * world-space "north" (world +Y, or +Z near the poles); projected onto the tangent plane.
     */
    private initialHeading(
        surfaceNormal: THREE.Vector3,
        faceToward?: THREE.Vector3
    ): THREE.Vector3 {
        if (faceToward && this.state.body?.mesh) {
            const standPoint = this.state.body.mesh.position
                .clone()
                .addScaledVector(surfaceNormal, this.state.body.radius);
            const toward = faceToward.clone().sub(standPoint).projectOnPlane(surfaceNormal);
            if (toward.lengthSq() > 1e-20) return toward.normalize();
        }
        const north = new THREE.Vector3(0, 1, 0).projectOnPlane(surfaceNormal);
        if (north.lengthSq() < 1e-10) {
            north.set(0, 0, 1).projectOnPlane(surfaceNormal);
        }
        return north.normalize();
    }

    /** Remove the player rig from the physics and the scene. */
    private removeRig(): void {
        const rig = this.state.rig;
        if (!rig) return;
        setActivePlayerRig(null);
        rig.dispose();
        this.state.rig = null;
    }

    /** The rig, while it and the ground under it are still usable. */
    private liveRig(): PlayerRig | null {
        const s = this.state;
        const rig = s.rig;
        if (!s.isActive || !s.body || !rig || rig._isDisposed) return null;
        if (!this.simulationState.bodies.includes(s.body) || s.body._isDisposed || !s.body.mesh) {
            return null;
        }
        return rig;
    }

    /**
     * Writes the unit local up at the rig's feet into `_up`, and the heading reference — parallel-
     * transported onto the current tangent plane and stored back in the body's frame — into
     * `_north`.
     */
    private updateFrame(rig: PlayerRig, body: Body): void {
        this._up.subVectors(rig.mesh.position, body.mesh.position);
        if (this._up.lengthSq() < 1e-24) this._up.set(0, 1, 0);
        this._up.normalize();

        this._north
            .copy(this.state.anchorLocalNorth)
            .applyQuaternion(body.mesh.quaternion)
            .projectOnPlane(this._up);
        if (this._north.lengthSq() < 1e-20) {
            // Degenerate (heading straight up): fall back to any tangent.
            this._north.set(0, 1, 0).projectOnPlane(this._up);
            if (this._north.lengthSq() < 1e-20) this._north.set(0, 0, 1).projectOnPlane(this._up);
        }
        this._north.normalize();
        this.state.anchorLocalNorth
            .copy(this._north)
            .applyQuaternion(this._quat.copy(body.mesh.quaternion).invert());
    }

    /** Yawed heading on the ground plane into `_forward`, its right-hand side into `_right`. */
    private updateHeading(): void {
        this._forward.copy(this._north).applyAxisAngle(this._up, this.state.yaw).normalize();
        this._right.crossVectors(this._forward, this._up).normalize();
    }

    /**
     * Feed this frame's WASD / Shift / Space to the player rig, before the physics step. Movement
     * follows the yaw only: looking up or down never changes where or how fast you walk.
     */
    updateInput(keys: PlayerMoveKeys): void {
        const rig = this.liveRig();
        const body = this.state.body;
        if (!rig || !body) return;
        this.updateFrame(rig, body);
        this.updateHeading();

        rig.moveDir.set(0, 0, 0);
        if (keys.w) rig.moveDir.add(this._forward);
        if (keys.s) rig.moveDir.sub(this._forward);
        if (keys.d) rig.moveDir.add(this._right);
        if (keys.a) rig.moveDir.sub(this._right);
        if (rig.moveDir.lengthSq() > 1e-12) {
            rig.moveDir.normalize();
            rig.moveSpeed = keys.shift ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED;
        } else {
            rig.moveDir.set(0, 0, 0);
            rig.moveSpeed = 0;
        }

        if (keys.space && !this.prevSpace && rig.isGrounded) rig.jumpQueued = true;
        this.prevSpace = keys.space;
    }

    /**
     * Place the camera at the player's eye, after the physics step — so it uses the body's and the
     * rig's end-of-frame transforms, the exact ones the renderer draws — with head bob applied.
     *
     * @param simDt Sim seconds this frame covered (0 while paused).
     * @param wallDt Wall-clock seconds this frame took.
     */
    updateTransform(simDt = 0, wallDt = 0): void {
        const rig = this.liveRig();
        const body = this.state.body;
        if (!rig || !body) return;
        this.updateFrame(rig, body);
        this.updateHeading();
        const up = this._up;

        // Ground speed for the sway: velocity relative to the surface, along the ground.
        surfaceVelocityAt(body, rig.mesh.position, this._groundVel);
        this._groundVel.subVectors(rig.velocity, this._groundVel);
        this._groundVel.addScaledVector(up, -this._groundVel.dot(up));
        const groundSpeed = rig.anchorLocal ? 0 : this._groundVel.length();

        if (rig.lastImpactSpeed > 0) {
            this.headBob.land(rig.lastImpactSpeed);
            rig.lastImpactSpeed = 0;
        }
        const bob = this.headBob.update(groundSpeed, rig.isGrounded, simDt, wallDt);

        const right = this._right;
        this.camera.position
            .copy(rig.mesh.position)
            .addScaledVector(up, PLAYER_EYE_HEIGHT + bob.vertical)
            .addScaledVector(right, bob.lateral);

        // Pitch tilts the view only; _forward is reused as the view direction from here on.
        const forward = this._forward.applyAxisAngle(right, this.state.pitch).normalize();
        this._lookAt.copy(this.camera.position).addScaledVector(forward, 1000);

        // Roll: tilt the camera's up about the view direction.
        this.camera.up.copy(up);
        if (bob.roll !== 0) this.camera.up.applyAxisAngle(forward, bob.roll);
        this.camera.lookAt(this._lookAt);

        this.headlamp.update(this.camera.position, forward, this.camera.up);
    }

    /** Switch the head lamp on or off (T). Does nothing outside surface mode. */
    toggleHeadlamp(): void {
        if (!this.state.isActive) return;
        this.headlamp.toggle();
        this.flightHUD.forceHintRefresh();
    }

    /**
     * Controls hint for the HUD while on foot, or null when not in surface mode. Until the mouse is
     * captured it says what a left-click does; once captured, the walking controls.
     */
    getHintLines(): string[] | null {
        if (!this.state.isActive) return null;
        const lamp = `[T] Headlamp ${this.headlamp.isOn ? 'off' : 'on'}`;
        if (document.pointerLockElement !== this.renderer.domElement) {
            return [
                'LMB: capture the mouse to look and steer (Esc releases it)',
                `WASD Walk | Shift Sprint | Space Jump | ${lamp} | Hold RMB to look without capturing`,
            ];
        }
        return [
            `WASD Walk | Shift Sprint | Space Jump | ${lamp} | Mouse Look / Steer`,
            '[F] Board ship | [Esc] Release mouse',
        ];
    }

    onMouseMove = (event: MouseEvent): void => {
        if (!this.state.isActive) return;

        // Pointer locked (click to capture): the mouse always aims. Otherwise hold RMB to look.
        const locked = document.pointerLockElement === this.renderer.domElement;
        const rmbDown = (event.buttons & 2) === 2;
        if (!locked && !rmbDown) return;

        const dx = event.movementX || 0;
        const dy = event.movementY || 0;

        this.state.yaw -= dx * this.state.lookSensitivity;
        this.state.pitch -= dy * this.state.lookSensitivity;
        this.state.pitch = THREE.MathUtils.clamp(
            this.state.pitch,
            -Math.PI / 2 + 0.01,
            Math.PI / 2 - 0.01
        );
    };
}
