import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Spaceship } from '../bodies/ships/spaceship';
import type { Body } from '../bodies/body';
import { BodyTypeEnum } from '../bodies/body-enums';
import type { IFlightState } from '../interfaces';
import { CockpitDashboard, ICockpitTelemetry } from '../drawing/cockpit-dashboard';
import { CockpitGlass } from './cockpit-glass';
import { AU } from '../utilities/consts';

/**
 * The shared cockpit interior. Authored in metres, +Z forward, +Y up. The pilot's eye is the
 * node named {@link COCKPIT_EYE_NODE}; without one, the model origin is used as the eye.
 */
export const COCKPIT_MODEL_URL = './assets/models/cockpit/cockpit.glb';
export const COCKPIT_EYE_NODE = 'Eye';

/** Clip planes of the cockpit camera, in metres (the cockpit's own units). */
const COCKPIT_NEAR = 0.02;
const COCKPIT_FAR = 50;
/** Seconds between dashboard redraws. Canvas uploads are not free; 10 Hz reads as live. */
const DASHBOARD_REFRESH_INTERVAL = 0.1;
/** Directional "starlight" through the canopy at 1 AU; scaled by inverse square, clamped. */
const STARLIGHT_INTENSITY = 2.6;
const STARLIGHT_MIN_FACTOR = 0.08;
const STARLIGHT_MAX_FACTOR = 1.6;
/** Interior fill from the room environment so the cockpit is never pitch black. */
const INTERIOR_ENV_INTENSITY = 0.35;
/**
 * The model's blinking shield warning lamp. The clip loops while the shield is below
 * {@link SHIELD_WARNING_FRACTION} of max; stopping it restores the lamp's rest pose (off).
 * Every other clip in the model loops all the time.
 */
const SHIELD_WARNING_CLIP = 'ShieldWarning';
const SHIELD_WARNING_FRACTION = 0.05;

const STAR_TYPES =
    BodyTypeEnum.Star | BodyTypeEnum.WhiteDwarf | BodyTypeEnum.Pulsar | BodyTypeEnum.BrownDwarf;
/** Bodies that don't count as "nearest body" for the altitude readout. */
const NAV_EXCLUDED_TYPES = BodyTypeEnum.SpaceShip | BodyTypeEnum.Probe;

/** Turns the cockpit camera (which looks down -Z) to face the model's +Z forward. */
const FACE_FORWARD = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);

const _look = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _invShip = new THREE.Quaternion();
const _tmp = new THREE.Vector3();

/**
 * First-person cockpit interior, drawn as an overlay pass on top of the world.
 *
 * The cockpit lives in its own scene, in metres, with the camera at the pilot's eye. It is
 * rendered after the world with the depth buffer cleared, the same way a game draws a
 * first-person weapon. That sidesteps two problems with putting a ~1 m dashboard into the
 * world scene: the world camera's near plane (1 m) would clip it, and at heliocentric
 * coordinates float precision would make it shimmer.
 *
 * Because the cockpit is rigid with the ship, the overlay camera only ever needs the free-look
 * (ALT orbit) offset; the ship's own orientation only matters for lighting, where it turns the
 * direction to the nearest star into cockpit space.
 */
export class CockpitView {
    readonly scene = new THREE.Scene();
    readonly camera = new THREE.PerspectiveCamera(60, 1, COCKPIT_NEAR, COCKPIT_FAR);

    private readonly dashboard = new CockpitDashboard();
    private readonly glass: CockpitGlass;
    private readonly starLight = new THREE.DirectionalLight(0xfff4e0, STARLIGHT_INTENSITY);
    private mixer: THREE.AnimationMixer | null = null;
    private shieldWarning: THREE.AnimationAction | null = null;
    private model: THREE.Object3D | null = null;
    private loadFailed = false;

    /** True when the overlay should be drawn this frame. */
    private visible = false;
    /** The ship whose exterior hull is hidden while we sit inside it. */
    private hiddenHullShip: Spaceship | null = null;
    private dashboardTimer = DASHBOARD_REFRESH_INTERVAL;

    constructor(
        renderer: THREE.WebGLRenderer,
        private readonly flightState: IFlightState,
        private readonly getBodies: () => Body[]
    ) {
        const pmrem = new THREE.PMREMGenerator(renderer);
        this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        this.scene.environmentIntensity = INTERIOR_ENV_INTENSITY;
        pmrem.dispose();

        this.scene.add(this.starLight, this.starLight.target);
        this.glass = new CockpitGlass(this.scene);
        this.camera.quaternion.copy(FACE_FORWARD);
        this.load();
    }

    private load(): void {
        new GLTFLoader()
            .loadAsync(COCKPIT_MODEL_URL)
            .then((gltf) => {
                this.model = gltf.scene;
                // The overlay camera stays at the origin; shift the model so its eye node lands there.
                const eye = gltf.scene.getObjectByName(COCKPIT_EYE_NODE);
                if (eye) {
                    gltf.scene.updateMatrixWorld(true);
                    gltf.scene.position.copy(eye.getWorldPosition(new THREE.Vector3())).negate();
                }
                this.scene.add(gltf.scene);
                this.dashboard.bind(gltf.scene);
                this.glass.bind(gltf.scene);
                if (gltf.animations.length > 0) {
                    this.mixer = new THREE.AnimationMixer(gltf.scene);
                    for (const clip of gltf.animations) {
                        const action = this.mixer.clipAction(clip);
                        if (clip.name === SHIELD_WARNING_CLIP) this.shieldWarning = action;
                        else action.play();
                    }
                }
            })
            .catch((e: unknown) => {
                this.loadFailed = true;
                console.warn(`Cockpit model failed to load from ${COCKPIT_MODEL_URL}`, e);
            });
    }

    /**
     * Per-frame update. Call after the flight camera has been placed.
     * @param active     Flight mode is on and the player is in cockpit view.
     * @param mainCamera The world camera, whose FOV/aspect the overlay mirrors.
     * @param wallDt     Real seconds since last frame (animations and dashboard refresh).
     */
    update(active: boolean, mainCamera: THREE.PerspectiveCamera, wallDt: number): void {
        const ship = active ? this.flightState.activeShip : null;
        const usable = !!ship && !ship._isDisposed && !!ship.mesh && !this.loadFailed;
        this.syncHullVisibility(usable ? ship : null);
        this.visible = usable && this.model !== null;
        if (!this.visible || !ship) return;

        // Mirror the world camera's projection so the canopy lines up with the view.
        if (this.camera.fov !== mainCamera.fov || this.camera.aspect !== mainCamera.aspect) {
            this.camera.fov = mainCamera.fov;
            this.camera.aspect = mainCamera.aspect;
            this.camera.updateProjectionMatrix();
        }

        // Free look: same Euler the world camera applies on top of the ship frame.
        _euler.set(this.flightState.altOrbitPitch, this.flightState.altOrbitYaw, 0, 'YXZ');
        _look.setFromEuler(_euler);
        this.camera.quaternion.copy(_look).multiply(FACE_FORWARD);

        this.updateStarlight(ship);
        this.updateWarningLamps(ship);
        this.mixer?.update(wallDt);
        this.glass.tick(wallDt);

        this.dashboardTimer += wallDt;
        if (this.dashboardTimer >= DASHBOARD_REFRESH_INTERVAL) {
            this.dashboardTimer = 0;
            this.dashboard.paint(this.gatherTelemetry(ship));
        }
    }

    /** Draw the cockpit over whatever is already in the framebuffer. */
    render(renderer: THREE.WebGLRenderer): void {
        if (!this.visible) return;
        // Before autoClear is switched off below, so the reflection cube faces get cleared.
        this.glass.captureReflection(renderer, this.scene);
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(this.scene, this.camera);
        renderer.autoClear = autoClear;
    }

    /** Hide the exterior of the ship we're sitting in; restore it when we leave or switch. */
    private syncHullVisibility(ship: Spaceship | null): void {
        if (this.hiddenHullShip === ship) return;
        if (this.hiddenHullShip && !this.hiddenHullShip._isDisposed) {
            this.hiddenHullShip.setHullVisible(true);
        }
        this.hiddenHullShip = ship;
        ship?.setHullVisible(false);
    }

    /** Start or stop the warning lamp clips to match the ship's state. */
    private updateWarningLamps(ship: Spaceship): void {
        const warning = this.shieldWarning;
        if (!warning) return;
        const shieldsDown =
            ship.maxShieldPoints > 0 &&
            ship.shieldPoints < ship.maxShieldPoints * SHIELD_WARNING_FRACTION;
        // reset() so each warning starts at the top of the cycle (the clip opens on "off").
        if (shieldsDown && !warning.isRunning()) warning.reset().play();
        else if (!shieldsDown && warning.isRunning()) warning.stop();
    }

    /** Point the directional light from the brightest-looking star, in cockpit space. */
    private updateStarlight(ship: Spaceship): void {
        let best: Body | null = null;
        let bestScore = 0;
        let bestDistSq = 0;
        for (const body of this.getBodies()) {
            if (!body || body._isDisposed || !(body.bodyType & STAR_TYPES)) continue;
            const dSq = body.mesh.position.distanceToSquared(ship.mesh.position);
            const score = body.mass / Math.max(dSq, 1e-12);
            if (score > bestScore) {
                bestScore = score;
                best = body;
                bestDistSq = dSq;
            }
        }
        if (!best) {
            this.starLight.visible = false;
            return;
        }
        this.starLight.visible = true;
        _invShip.copy(ship.mesh.quaternion).invert();
        _tmp.subVectors(best.mesh.position, ship.mesh.position)
            .normalize()
            .applyQuaternion(_invShip);
        this.starLight.position.copy(_tmp).multiplyScalar(10);
        const factor = THREE.MathUtils.clamp(
            (AU * AU) / Math.max(bestDistSq, 1e-12),
            STARLIGHT_MIN_FACTOR,
            STARLIGHT_MAX_FACTOR
        );
        this.starLight.intensity = STARLIGHT_INTENSITY * factor;
    }

    private gatherTelemetry(ship: Spaceship): ICockpitTelemetry {
        const h = ship.handling;
        // currentSpeed is the signed speed along the nose: negative while drifting backwards.
        const forwardSpeed = this.flightState.currentSpeed;
        const speed = Math.abs(forwardSpeed);
        // The regime label follows the drive (what the pilot is doing), not the speed: coasting
        // fast in a gravity well is still cruise. The gauge scale follows the speed, so it
        // switches to the boost range once you're past normal top speed for any reason.
        let regime = 'CRUISE';
        let gaugeMax = h.flightMaxSpeed;
        if (ship.warpActive) {
            regime = 'WARP';
            gaugeMax = h.flightWarpSpeed;
        } else if (ship.warpCharging) {
            regime = 'WARP CHG';
        } else {
            if (ship.controlInput.boost) regime = 'BOOST';
            if (ship.controlInput.boost || speed > h.flightMaxSpeed * 1.001) {
                gaugeMax = h.flightBoostMaxSpeed;
            }
        }

        // Nearest body by surface distance.
        let nearest: Body | null = null;
        let nearestAlt = Infinity;
        for (const body of this.getBodies()) {
            if (!body || body === ship || body._isDisposed || !body.mesh) continue;
            if (body.bodyType & NAV_EXCLUDED_TYPES) continue;
            const alt = body.mesh.position.distanceTo(ship.mesh.position) - body.radius;
            if (alt < nearestAlt) {
                nearestAlt = alt;
                nearest = body;
            }
        }
        const relSpeed = nearest ? _tmp.subVectors(ship.velocity, nearest.velocity).length() : 0;

        // Locked target: distance and closing rate.
        const target = this.flightState.selectedTarget;
        let targetDistance = 0;
        let targetClosing = 0;
        const targetAlive = !!target && !target._isDisposed && !!target.mesh;
        if (target && targetAlive) {
            _tmp.subVectors(target.mesh.position, ship.mesh.position);
            targetDistance = _tmp.length();
            if (targetDistance > 0) {
                const dir = _tmp.divideScalar(targetDistance);
                const relVx = ship.velocity.x - target.velocity.x;
                const relVy = ship.velocity.y - target.velocity.y;
                const relVz = ship.velocity.z - target.velocity.z;
                targetClosing = relVx * dir.x + relVy * dir.y + relVz * dir.z;
            }
        }

        // Autopilot destination: distance to its surface, like the nav altitude readout.
        const apTarget =
            ship.autopilotActive && ship.autopilotTarget && !ship.autopilotTarget._isDisposed
                ? ship.autopilotTarget
                : null;
        const apDistance = apTarget
            ? apTarget.mesh.position.distanceTo(ship.mesh.position) - apTarget.radius
            : 0;

        const weapon = ship.activeWeaponGroup;
        const warpChargeTime = h.flightWarpChargeTime;
        return {
            shipName: ship.name,
            speed,
            reversing: forwardSpeed < 0,
            speedGaugeMax: gaugeMax,
            regime,
            speedTier: ship.highSpeedMode ? 'HIGH' : 'LOW',
            guidance: ship.guidanceStatus,
            guidanceBodyName: ship.guidanceRefBody ? ship.guidanceRefBody.name : null,
            warpCharge:
                ship.warpCharging && warpChargeTime > 0
                    ? Math.min(1, ship.warpChargeTimer / warpChargeTime)
                    : 0,
            shieldFraction: ship.maxShieldPoints > 0 ? ship.shieldPoints / ship.maxShieldPoints : 0,
            hullFraction: ship.maxHealthPoints > 0 ? ship.healthPoints / ship.maxHealthPoints : 0,
            weaponName: weapon ? weapon.displayName : null,
            weaponHeat: weapon ? weapon.thermalLoad : 0,
            weaponOverheated: weapon ? weapon.isOverheated : false,
            position: ship.mesh.position,
            nearestName: nearest ? nearest.name : null,
            nearestAltitude: nearestAlt,
            nearestRelSpeed: relSpeed,
            targetName: targetAlive && target ? target.name : null,
            targetDistance,
            targetClosing,
            autopilotTargetName: apTarget ? apTarget.name : null,
            autopilotTargetDistance: apDistance,
        };
    }

    dispose(): void {
        this.syncHullVisibility(null);
        this.dashboard.dispose();
        this.glass.dispose();
        this.scene.environment?.dispose();
    }
}
