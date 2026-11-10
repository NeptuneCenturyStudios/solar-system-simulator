import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Body } from '../bodies/body';
import { BlackHole } from '../bodies/black-hole';
import { isBodyType } from '../utilities/utilities';
import { FlightHUD } from '../drawing/flight-hud';
import { BodyTypeEnum } from '../bodies/body-enums';
import { DIST_SCALE } from '../utilities/consts';
import { surfaceReachFactor } from '../physics/body-surface';

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
    BodyTypeEnum.Wormhole;

export interface SurfaceCameraState {
    isActive: boolean;
    body: Body | null;
    anchorLocalDir: THREE.Vector3;
    /** Heading (tangent to the surface at the anchor) in the body's local frame. */
    anchorLocalNorth: THREE.Vector3;
    yaw: number;
    pitch: number;
    prevCameraUp: THREE.Vector3;
    /** Height of the eye above the drawn (faceted) ground, in sim units. */
    eyeHeight: number;
    lookSensitivity: number;
}

export class SurfaceCameraManager {
    readonly state: SurfaceCameraState = {
        isActive: false,
        body: null,
        anchorLocalDir: new THREE.Vector3(0, 1, 0),
        anchorLocalNorth: new THREE.Vector3(0, 0, 1),
        yaw: 0,
        pitch: 0,
        prevCameraUp: new THREE.Vector3(0, 1, 0),
        eyeHeight: 0.0019 / DIST_SCALE,
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

    constructor(
        camera: THREE.PerspectiveCamera,
        controls: OrbitControls,
        renderer: THREE.WebGLRenderer,
        simulationState: { bodies: Body[] },
        flightHUD: FlightHUD,
        cameraState: { isFreeCameraMode: boolean; isLookAtMode: boolean },
        onFreeCameraModeExit: () => void
    ) {
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
     * exitSurfaceCameraToLookAt in index.ts.
     */
    exit(): void {
        this.camera.up.copy(this.state.prevCameraUp);

        this.state.isActive = false;
        this.state.body = null;

        this.controls.enabled = true;

        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }

        this.flightHUD.forceHintRefresh();
    }

    /**
     * Enters surface mode on `body`.
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

        const bodyCenter = body.mesh!.position.clone();
        const fromBodyToCam = new THREE.Vector3()
            .subVectors(options.worldPoint ?? this.camera.position, bodyCenter)
            .normalize();
        const surfaceNormalWorld = fromBodyToCam.clone().normalize();
        const invQ = body.mesh!.quaternion.clone().invert();
        this.state.anchorLocalDir = surfaceNormalWorld.clone().applyQuaternion(invQ).normalize();

        // Pick the starting heading from world axes once, then store it in the body's frame so
        // the view stays fixed to the surface as the body spins and tilts.
        const northWorld = this.initialHeading(surfaceNormalWorld, options.faceToward);
        this.state.anchorLocalNorth = northWorld.applyQuaternion(invQ).normalize();

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

    updateTransform(): void {
        const s = this.state;
        if (
            !s.isActive ||
            !s.body ||
            !this.simulationState.bodies.includes(s.body) ||
            s.body._isDisposed
        )
            return;

        const b = s.body;
        const center = b.mesh!.position;

        const gravityUp = s.anchorLocalDir.clone().applyQuaternion(b.mesh!.quaternion).normalize();

        // Stand on the drawn ground under the anchor, not the true sphere: a UV sphere's flat
        // facets sag inward between vertices (~8 km on Earth), and a model body (asteroid, comet
        // nucleus) is an irregular rock inside its bounding radius.
        const groundRadius =
            (b.radius || 0) * (b.mesh?.scale?.x || 1) * surfaceReachFactor(b, gravityUp);

        const surfacePoint = center
            .clone()
            .add(gravityUp.clone().multiplyScalar(groundRadius + s.eyeHeight));

        // Heading is carried in the body's frame like the anchor, so it never drifts against the
        // surface. Re-orthogonalize against gravityUp to absorb numeric drift.
        const north = s.anchorLocalNorth
            .clone()
            .applyQuaternion(b.mesh!.quaternion)
            .projectOnPlane(gravityUp)
            .normalize();

        const yawQuat = new THREE.Quaternion().setFromAxisAngle(gravityUp, s.yaw);
        const forwardYawed = north.clone().applyQuaternion(yawQuat).normalize();

        const right = new THREE.Vector3().crossVectors(forwardYawed, gravityUp).normalize();
        const pitchQuat = new THREE.Quaternion().setFromAxisAngle(right, s.pitch);
        const forward = forwardYawed.clone().applyQuaternion(pitchQuat).normalize();

        const lookAtTarget = surfacePoint.clone().add(forward.multiplyScalar(1000));

        this.camera.position.copy(surfacePoint);
        this.camera.up.copy(gravityUp);
        this.camera.lookAt(lookAtTarget);
    }

    onMouseMove = (event: MouseEvent): void => {
        if (!this.state.isActive) return;

        const rmbDown = (event.buttons & 2) === 2;
        if (!rmbDown) return;
        if (document.pointerLockElement === this.renderer.domElement) return;

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
