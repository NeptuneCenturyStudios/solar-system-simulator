import * as THREE from 'three';
import {
    GIZMO_TUNING,
    GRAV_ARROW_SCALE,
    GRAV_ARROW_MAX_GIZMO_MULTIPLE,
} from '../utilities/consts.js';
import { Body } from '../bodies/body.js';

// ── Base (scale-1) dimensions ─────────────────────────────────────────────────
// Every dimension below is expressed for a gizmo scale factor of 1 and multiplied by the
// per-frame scale factor when the gizmo is applied, so one master number keeps the whole
// gizmo (arrows, heads, rings, knobs) in proportion.
/** Axis-arrow length at scale 1. */
const BASE_ARROW_LENGTH = 60;
/** Axis-arrow head length at scale 1. */
const BASE_HEAD_LENGTH = 15;
/** Axis-arrow head width at scale 1. */
const BASE_HEAD_WIDTH = 10;
/** Gravity-arrow head length at scale 1. */
const GRAVITY_HEAD_LENGTH = 12;
/** Gravity-arrow head width at scale 1. */
const GRAVITY_HEAD_WIDTH = 6;
/** Tilt-ring radius at scale 1 (lies in the YZ plane). */
const TILT_RING_BASE_RADIUS = 80;
/** Azimuth-ring radius at scale 1 (lies in the XZ plane). */
const AZIMUTH_RING_BASE_RADIUS = 70;
/** Ring tube radius as a fraction of the ring radius; kept small so the ring reads as a wire. */
const RING_TUBE_FRACTION = 0.022;
/** Knob radius as a fraction of the ring radius (3.5× the tube radius keeps knobs proud of the ring). */
const KNOB_RADIUS_FRACTION = RING_TUBE_FRACTION * 3.5;
/**
 * Velocity/gravity arrow heads are sized as a fraction of the arrow's own length (not of the
 * gizmo scale) so the shaft always reads as an arrow no matter how long or short the vector is.
 */
const VECTOR_HEAD_LENGTH_FRACTION = 0.18;
const VECTOR_HEAD_WIDTH_FRACTION = 0.1;
/** Minimum body radius used when a body reports radius 0, so the body term never collapses to 0. */
const MIN_BODY_RADIUS = 1e-6;
/** Gravity-arrow minimum length, as a multiple of the body radius (keeps it clear of the body). */
const GRAVITY_MIN_RADIUS_MULTIPLE = 2.0;

export class CoordinateGizmo {
    group: THREE.Group;
    arrows: THREE.ArrowHelper[];
    velocityArrow: THREE.ArrowHelper;
    gravityArrow: THREE.ArrowHelper;
    target: Body | null; // The body this gizmo is attached to
    tiltRing: THREE.Mesh;
    tiltKnob: THREE.Mesh;
    azimuthRing: THREE.Mesh;
    azimuthKnob: THREE.Mesh;
    /** Scaled main radius of the tilt ring; used to position tiltKnob in update(). */
    _tiltRingRadius: number;
    /** Scaled main radius of the azimuth ring; used to position azimuthKnob in update(). */
    _azimuthRingRadius: number;

    /** Camera used to size the gizmo to a sane on-screen fraction; set once by the host app. */
    private _camera: THREE.PerspectiveCamera | null = null;
    /** Master scale factor last applied (arrow length = BASE_ARROW_LENGTH × this). */
    private _scaleFactor = 1;

    constructor(scene: THREE.Scene) {
        this.group = new THREE.Group();
        this.arrows = [];
        this.group.visible = false;
        this.target = null;
        scene.add(this.group);

        // Axis-arrow configuration: [direction vector, color, axis name]
        const arrowConfigs = [
            { dir: new THREE.Vector3(1, 0, 0), col: 0xff0000, axis: 'x' }, // +X
            { dir: new THREE.Vector3(-1, 0, 0), col: 0xff0000, axis: 'x' }, // -X
            { dir: new THREE.Vector3(0, 0, 1), col: 0x0000ff, axis: 'z' }, // +Z
            { dir: new THREE.Vector3(0, 0, -1), col: 0x0000ff, axis: 'z' }, // -Z
            { dir: new THREE.Vector3(0, 1, 0), col: 0x00ff00, axis: 'y' }, // +Y
            { dir: new THREE.Vector3(0, -1, 0), col: 0x00ff00, axis: 'y' }, // -Y
        ];

        arrowConfigs.forEach((config) => {
            const arrow = new THREE.ArrowHelper(
                config.dir,
                new THREE.Vector3(0, 0, 0),
                BASE_ARROW_LENGTH,
                config.col,
                BASE_HEAD_LENGTH,
                BASE_HEAD_WIDTH
            );

            arrow.line.userData = { isGizmo: true, axis: config.axis, dir: config.dir };
            arrow.cone.userData = { isGizmo: true, axis: config.axis, dir: config.dir };
            this.group.add(arrow);
            this.arrows.push(arrow);
        });

        // Velocity arrow (part of the gizmo group so selection visibility is unified)
        this.velocityArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            1,
            0xffff00,
            VECTOR_HEAD_LENGTH_FRACTION,
            VECTOR_HEAD_WIDTH_FRACTION
        );
        this.velocityArrow.visible = false;
        this.velocityArrow.line.userData = { isVelocityGizmo: true };
        this.velocityArrow.cone.userData = { isVelocityGizmo: true };
        this.group.add(this.velocityArrow);

        // Gravity arrow (net gravitational acceleration acting ON the body)
        // Not interactable (no drag), purely informational.
        this.gravityArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            1,
            0xaaaaaa,
            GRAVITY_HEAD_LENGTH,
            GRAVITY_HEAD_WIDTH
        );
        this.gravityArrow.visible = false;
        this.gravityArrow.line.userData = { isGravityGizmo: true };
        this.gravityArrow.cone.userData = { isGravityGizmo: true };
        this.group.add(this.gravityArrow);

        // --- Gimbal rings ---
        // Built once as unit geometry and resized with mesh.scale, so the per-frame rescale is
        // free (rebuilding TorusGeometry every frame would churn GPU buffers continuously).
        // Tilt ring — lies in the YZ plane (normal = X-axis). Dragging maps the mouse ray onto
        // the YZ plane; atan2(z, y) = axial tilt.
        const tiltRingMat = new THREE.MeshPhongMaterial({
            color: 0xff8800,
            emissive: new THREE.Color(0xff8800).multiplyScalar(0.25),
            specular: new THREE.Color(0xffffff),
            shininess: 80,
            side: THREE.FrontSide,
        });
        this.tiltRing = new THREE.Mesh(
            new THREE.TorusGeometry(1, RING_TUBE_FRACTION, 16, 64),
            tiltRingMat
        );
        this.tiltRing.rotation.y = Math.PI / 2; // default XY → YZ plane
        this.tiltRing.userData = { isTiltGizmo: true };
        this.tiltRing.renderOrder = 0;
        this.tiltRing.visible = false;
        this.group.add(this.tiltRing);

        // Tilt knob — small sphere marking the current tilt angle on the ring.
        this.tiltKnob = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 16),
            new THREE.MeshPhongMaterial({
                color: 0xff8800,
                emissive: new THREE.Color(0xff8800).multiplyScalar(0.25),
                specular: new THREE.Color(0xffffff),
                shininess: 100,
            })
        );
        this.tiltKnob.userData = { isTiltGizmo: true };
        this.tiltKnob.renderOrder = 0;
        this.tiltKnob.visible = false;
        this.group.add(this.tiltKnob);

        // Azimuth ring — lies in the XZ plane (normal = Y-axis), slightly smaller radius.
        // Dragging maps the mouse ray onto the XZ plane; atan2(x, z) = azimuth direction.
        const azimuthRingMat = new THREE.MeshPhongMaterial({
            color: 0x00ccff,
            emissive: new THREE.Color(0x00ccff).multiplyScalar(0.2),
            specular: new THREE.Color(0xffffff),
            shininess: 80,
            side: THREE.FrontSide,
        });
        this.azimuthRing = new THREE.Mesh(
            new THREE.TorusGeometry(1, RING_TUBE_FRACTION, 16, 64),
            azimuthRingMat
        );
        this.azimuthRing.rotation.x = Math.PI / 2; // default XY → XZ plane
        this.azimuthRing.userData = { isAzimuthGizmo: true };
        this.azimuthRing.renderOrder = 0;
        this.azimuthRing.visible = false;
        this.group.add(this.azimuthRing);

        // Azimuth knob — small sphere marking the current azimuth direction on the ring.
        this.azimuthKnob = new THREE.Mesh(
            new THREE.SphereGeometry(1, 16, 16),
            new THREE.MeshPhongMaterial({
                color: 0x00ccff,
                emissive: new THREE.Color(0x00ccff).multiplyScalar(0.2),
                specular: new THREE.Color(0xffffff),
                shininess: 100,
            })
        );
        this.azimuthKnob.userData = { isAzimuthGizmo: true };
        this.azimuthKnob.renderOrder = 4;
        this.azimuthKnob.visible = false;
        this.group.add(this.azimuthKnob);

        this._tiltRingRadius = TILT_RING_BASE_RADIUS;
        this._azimuthRingRadius = AZIMUTH_RING_BASE_RADIUS;
    }

    /** Provide the camera so the gizmo can size itself to a sane on-screen fraction each frame. */
    setCamera(camera: THREE.PerspectiveCamera): void {
        this._camera = camera;
    }

    /**
     * Pick tolerance for the thin axis shafts, in world units. The raycaster's default line
     * threshold is a fixed 1 world unit, which is far larger than a small body's gizmo (making
     * every click ambiguous) and far smaller than a large body's (making the shaft nearly
     * unhittable). Scaling it with the current arrow length gives a roughly constant on-screen
     * grab tube at every zoom.
     */
    getPickTolerance(): number {
        return Math.max(
            BASE_ARROW_LENGTH * this._scaleFactor * GIZMO_TUNING.PICK_TOLERANCE_FRACTION,
            GIZMO_TUNING.PICK_TOLERANCE_FLOOR
        );
    }

    /** Height (world units) of the view frustum at the given distance from the camera. */
    private _viewportWorldHeight(distance: number): number {
        const cam = this._camera;
        if (!cam) return 0;
        const fovRad = THREE.MathUtils.degToRad(cam.fov);
        return 2 * Math.tan(fovRad / 2) * distance;
    }

    /**
     * Master gizmo scale for the current target and camera. Proportional to the body radius so
     * the gizmo wraps a satellite and a star alike, capped to a fraction of the viewport so it
     * never runs off-screen when zoomed in close, and floored above the body radius so the
     * arrows always clear the surface. See GIZMO_TUNING.
     */
    computeScaleFactor(): number {
        const body = this.target;
        if (!body) return 1;

        const radius = Math.max(body.radius || 0, MIN_BODY_RADIUS);
        const bodyLen = GIZMO_TUNING.BODY_SCALE * radius;
        const minLen = GIZMO_TUNING.MIN_PROTRUSION * radius;

        let arrowLen = bodyLen;
        if (this._camera && body.mesh) {
            const distance = this._camera.position.distanceTo(body.mesh.position);
            const viewportHeight = this._viewportWorldHeight(distance);
            arrowLen = Math.min(arrowLen, GIZMO_TUNING.MAX_SCREEN_FRACTION * viewportHeight);
        }
        arrowLen = Math.max(arrowLen, minLen);

        return arrowLen / BASE_ARROW_LENGTH;
    }

    /** Apply a master scale factor to every gizmo dimension. Cheap; safe to call every frame. */
    private applyScale(scaleFactor: number): void {
        this._scaleFactor = scaleFactor;

        const headLength = BASE_HEAD_LENGTH * scaleFactor;
        const headWidth = BASE_HEAD_WIDTH * scaleFactor;
        const arrowLength = BASE_ARROW_LENGTH * scaleFactor;
        this.arrows.forEach((arrow) => arrow.setLength(arrowLength, headLength, headWidth));

        // The gravity arrow's length and head are set every frame in updateGravityArrow (which
        // always runs before render), so there is nothing to apply for it here.

        if (this.tiltRing.visible) {
            const tiltRadius = TILT_RING_BASE_RADIUS * scaleFactor;
            const azRadius = AZIMUTH_RING_BASE_RADIUS * scaleFactor;
            this.tiltRing.scale.setScalar(tiltRadius);
            this.azimuthRing.scale.setScalar(azRadius);
            this.tiltKnob.scale.setScalar(tiltRadius * KNOB_RADIUS_FRACTION);
            this.azimuthKnob.scale.setScalar(azRadius * KNOB_RADIUS_FRACTION);
            this._tiltRingRadius = tiltRadius;
            this._azimuthRingRadius = azRadius;
        }
    }

    attach(body: Body | null) {
        if (!body) {
            this.target = null;
            this.group.visible = false;
            this.velocityArrow.visible = false;
            this.gravityArrow.visible = false;
            this.tiltRing.visible = false;
            this.tiltKnob.visible = false;
            this.azimuthRing.visible = false;
            this.azimuthKnob.visible = false;
            return;
        }

        this.group.visible = true;
        this.target = body;
        this.velocityArrow.visible = true;
        this.gravityArrow.visible = true;

        // Tilt ring: only shown for bodies that have axial tilt (CelestialBody subclasses).
        // Duck-type check avoids a circular import (gizmo ← celestial-body ← star ← …).
        const hasRotation =
            'rotation' in body &&
            (body as { rotation: { tilt: number } }).rotation?.tilt !== undefined;
        this.tiltRing.visible = hasRotation;
        this.tiltKnob.visible = hasRotation;
        this.azimuthRing.visible = hasRotation;
        this.azimuthKnob.visible = hasRotation;

        // Size everything for the current body/camera. update() keeps this current as the
        // camera zooms, but applying here makes the very first frame correct too.
        this.applyScale(this.computeScaleFactor());
    }

    private updateVelocityArrow() {
        if (!this.velocityArrow || !this.target || this.target._isDisposed) return;

        const speed = this.target.velocity.length();
        const arrowScale = GIZMO_TUNING.VELOCITY_ARROW_SCALE;

        // Avoid NaNs on zero velocity
        const direction =
            speed > 0 ? this.target.velocity.clone().normalize() : new THREE.Vector3(1, 0, 0);

        // The velocity arrow's length encodes speed (shared with the velocity-drag mapping), but
        // its head is sized from that length so it always looks like an arrow rather than a
        // vanishing point (small body) or a stub (huge speed).
        const length = Math.max(speed * arrowScale, 0.1);
        const headLength = length * VECTOR_HEAD_LENGTH_FRACTION;
        const headWidth = length * VECTOR_HEAD_WIDTH_FRACTION;

        this.velocityArrow.setDirection(direction);
        this.velocityArrow.setLength(length, headLength, headWidth);
    }

    private updateGravityArrow() {
        if (!this.gravityArrow || !this.target || this.target._isDisposed) return;

        const acc = this.target.tempAcc;
        if (!acc) {
            this.gravityArrow.visible = false;
            return;
        }

        const accMag = acc.length();

        // Avoid NaNs on zero acceleration
        const direction = accMag > 0 ? acc.clone().normalize() : new THREE.Vector3(1, 0, 0);

        // Keep it visible even far away and clear of the body, but cap it against the gizmo size
        // rather than the old fixed 3000-unit world cap (which dwarfed small bodies entirely).
        const radius = Math.max(this.target.radius || 0, MIN_BODY_RADIUS);
        const minLen = radius * GRAVITY_MIN_RADIUS_MULTIPLE;
        const maxLen = BASE_ARROW_LENGTH * this._scaleFactor * GRAV_ARROW_MAX_GIZMO_MULTIPLE;

        const len = THREE.MathUtils.clamp(accMag * GRAV_ARROW_SCALE, minLen, maxLen);

        this.gravityArrow.visible = true;
        this.gravityArrow.setDirection(direction);
        this.gravityArrow.setLength(
            len,
            GRAVITY_HEAD_LENGTH * this._scaleFactor,
            GRAVITY_HEAD_WIDTH * this._scaleFactor
        );
    }

    update() {
        if (this.group.visible && this.target && !this.target._isDisposed) {
            this.group.position.copy(this.target.mesh.position);
            // Rescale every frame so the gizmo tracks the camera as the user zooms.
            this.applyScale(this.computeScaleFactor());
            this.updateVelocityArrow();
            this.updateGravityArrow();
            this.updateGimbalKnobs();
        } else {
            this.group.visible = false;
            if (this.velocityArrow) this.velocityArrow.visible = false;
            if (this.gravityArrow) this.gravityArrow.visible = false;
        }
    }

    updateGimbalKnobs() {
        if (!this.target || !('rotation' in this.target)) return;
        const rot = (this.target as { rotation: { tilt: number; azimuth?: number } }).rotation;
        const tiltRad = THREE.MathUtils.degToRad(rot.tilt ?? 0);
        const azimuthRad = THREE.MathUtils.degToRad(rot.azimuth ?? 0);
        const Rt = this._tiltRingRadius;
        const Ra = this._azimuthRingRadius;

        // Keep the tilt ring aligned with the current azimuth so it always contains the spin axis.
        // TorusGeometry normal is local Z; after rotation.y = PI/2 it points along world X (YZ plane).
        // Adding azimuthRad swings it to the correct vertical plane.
        this.tiltRing.rotation.y = Math.PI / 2 + azimuthRad;

        // Tilt knob: position on the rotated tilt ring at the tilt angle.
        // Offset outward along the radial direction (away from body centre) by the tube
        // radius so the knob sits proud on the surface of the ring tube.
        const sinAz = Math.sin(azimuthRad);
        const cosAz = Math.cos(azimuthRad);
        const sinTilt = Math.sin(tiltRad);
        const cosTilt = Math.cos(tiltRad);
        // Radial unit vector on the tilt ring at the knob position
        const tiltRadialX = sinTilt * sinAz;
        const tiltRadialY = cosTilt;
        const tiltRadialZ = sinTilt * cosAz;
        this.tiltKnob.position.set(Rt * tiltRadialX, Rt * tiltRadialY, Rt * tiltRadialZ);

        // Azimuth knob: centered on the ring tube centerline in the XZ plane.
        const azRadialX = sinAz;
        const azRadialZ = cosAz;
        this.azimuthKnob.position.set(Ra * azRadialX, 0, Ra * azRadialZ);
    }
}
