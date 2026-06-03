import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Body } from '../bodies/body';
import { BlackHole } from '../bodies/black-hole';
import { isBodyType } from '../utilities/utilities';
import { UIManager } from '../ui/ui-manager';
import { FlightHUD } from '../drawing/flight-hud';
import { BodyTypeEnum } from '../bodies/body-enums';

export interface SurfaceCameraState {
    isActive: boolean;
    body: Body | null;
    anchorLocalDir: THREE.Vector3;
    yaw: number;
    pitch: number;
    prevCameraPos: THREE.Vector3;
    prevCameraQuat: THREE.Quaternion;
    prevCameraUp: THREE.Vector3;
    prevControlsTarget: THREE.Vector3;
    eyeHeight: number;
    lookSensitivity: number;
}

export class SurfaceCameraManager {
    readonly state: SurfaceCameraState = {
        isActive: false,
        body: null,
        anchorLocalDir: new THREE.Vector3(0, 1, 0),
        yaw: 0,
        pitch: 0,
        prevCameraPos: new THREE.Vector3(),
        prevCameraQuat: new THREE.Quaternion(),
        prevCameraUp: new THREE.Vector3(0, 1, 0),
        prevControlsTarget: new THREE.Vector3(),
        eyeHeight: 0.2,
        lookSensitivity: 0.002,
    };

    get isActive() {
        return this.state.isActive;
    }

    private readonly camera: THREE.PerspectiveCamera;
    private readonly controls: OrbitControls;
    private readonly renderer: THREE.WebGLRenderer;
    private readonly simulationState: { bodies: Body[] };
    private readonly uiManager: UIManager;
    private readonly flightHUD: FlightHUD;
    private readonly cameraState: { isFreeCameraMode: boolean; isLookAtMode: boolean };
    private readonly getSelectedBody: () => Body | null;
    private readonly getManuallySelectedBody: () => Body | null;
    private readonly onFreeCameraModeExit: () => void;

    constructor(
        camera: THREE.PerspectiveCamera,
        controls: OrbitControls,
        renderer: THREE.WebGLRenderer,
        simulationState: { bodies: Body[] },
        uiManager: UIManager,
        flightHUD: FlightHUD,
        cameraState: { isFreeCameraMode: boolean; isLookAtMode: boolean },
        getSelectedBody: () => Body | null,
        getManuallySelectedBody: () => Body | null,
        onFreeCameraModeExit: () => void
    ) {
        this.camera = camera;
        this.controls = controls;
        this.renderer = renderer;
        this.simulationState = simulationState;
        this.uiManager = uiManager;
        this.flightHUD = flightHUD;
        this.cameraState = cameraState;
        this.getSelectedBody = getSelectedBody;
        this.getManuallySelectedBody = getManuallySelectedBody;
        this.onFreeCameraModeExit = onFreeCameraModeExit;
    }

    isEligibleBody(body: Body | null): boolean {
        if (!body || !this.simulationState.bodies.includes(body) || body._isDisposed || !body.mesh)
            return false;
        if (isBodyType(body, BodyTypeEnum.Star)) return false;
        if (body instanceof BlackHole) return false;
        return (body.radius || 0) >= 1.0;
    }

    updateButtonEnabled(): void {
        const selectedBody = this.getSelectedBody();
        const manuallySelectedBody = this.getManuallySelectedBody();
        const selected =
            (selectedBody &&
            this.simulationState.bodies.includes(selectedBody) &&
            !selectedBody._isDisposed
                ? selectedBody
                : null) ||
            (manuallySelectedBody &&
            this.simulationState.bodies.includes(manuallySelectedBody) &&
            !manuallySelectedBody._isDisposed
                ? manuallySelectedBody
                : null);

        const isEnabled = this.isEligibleBody(selected);
        this.uiManager.mainPanel.setSurfaceCameraState({ isActive: this.state.isActive, isEnabled });
    }

    exit(): void {
        this.camera.position.copy(this.state.prevCameraPos);
        this.camera.quaternion.copy(this.state.prevCameraQuat);
        this.camera.up.copy(this.state.prevCameraUp);

        this.controls.target.copy(this.state.prevControlsTarget);
        this.controls.update();

        this.state.isActive = false;
        this.state.body = null;

        this.uiManager.mainPanel.setSurfaceCameraState({ isActive: false, isEnabled: true });

        this.controls.enabled = true;

        if (document.pointerLockElement === this.renderer.domElement) {
            document.exitPointerLock();
        }

        this.flightHUD.forceHintRefresh();
    }

    enter(body: Body | null): void {
        if (!body) return;
        if (!this.isEligibleBody(body)) return;

        this.state.prevCameraPos.copy(this.camera.position);
        this.state.prevCameraQuat.copy(this.camera.quaternion);
        this.state.prevCameraUp.copy(this.camera.up);
        this.state.prevControlsTarget.copy(this.controls.target);

        if (this.cameraState.isFreeCameraMode) {
            this.cameraState.isFreeCameraMode = false;
            this.onFreeCameraModeExit();
            this.uiManager.mainPanel.setFreeCameraState(false);
        }
        if (this.cameraState.isLookAtMode) {
            this.cameraState.isLookAtMode = false;
            this.uiManager.mainPanel.setLookAtState(false);
        }

        this.controls.enabled = false;

        this.state.isActive = true;
        this.state.body = body;
        this.state.yaw = 0;
        this.state.pitch = 0;

        const bodyCenter = body.mesh!.position.clone();
        const fromBodyToCam = new THREE.Vector3()
            .subVectors(this.camera.position, bodyCenter)
            .normalize();
        const surfaceNormalWorld = fromBodyToCam.clone().normalize();
        const invQ = body.mesh!.quaternion.clone().invert();
        this.state.anchorLocalDir = surfaceNormalWorld.clone().applyQuaternion(invQ).normalize();

        this.updateTransform();

        this.uiManager.mainPanel.setSurfaceCameraState({ isActive: true, isEnabled: true });
        this.flightHUD.forceHintRefresh();
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

        const gravityUp = s.anchorLocalDir
            .clone()
            .applyQuaternion(b.mesh!.quaternion)
            .normalize();

        const worldRadius = (b.radius || 0) * (b.mesh?.scale?.x || 1);
        const minEyeClearance = Math.max(worldRadius * 0.001, 0.05);
        const eyeOffset = Math.max(s.eyeHeight, minEyeClearance);

        const surfacePoint = center.clone().add(gravityUp.clone().multiplyScalar(worldRadius + eyeOffset));

        const worldRefA = new THREE.Vector3(0, 1, 0);
        const worldRefB = new THREE.Vector3(0, 0, 1);

        let north = worldRefA.clone().projectOnPlane(gravityUp);
        if (north.lengthSq() < 1e-10) {
            north = worldRefB.clone().projectOnPlane(gravityUp);
        }
        north.normalize();

        let east = new THREE.Vector3().crossVectors(gravityUp, north);
        if (east.lengthSq() < 1e-10) {
            east = new THREE.Vector3(1, 0, 0).projectOnPlane(gravityUp);
        }
        east.normalize();

        north = new THREE.Vector3().crossVectors(east, gravityUp).normalize();

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