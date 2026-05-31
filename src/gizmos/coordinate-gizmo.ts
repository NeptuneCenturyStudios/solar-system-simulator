import * as THREE from 'three';
import { GIZMO_TUNING, GRAV_ARROW_SCALE } from '../utilities/consts.js';
import { Body } from '../bodies/body.js';

export class CoordinateGizmo {
    group: THREE.Group;
    arrows: THREE.ArrowHelper[];
    velocityArrow: THREE.ArrowHelper;
    gravityArrow: THREE.ArrowHelper;
    target: Body | null; // The body this gizmo is attached to
    velocityHeadLength: number;
    velocityHeadWidth: number;
    gravityHeadLength: number;
    gravityHeadWidth: number;
    tiltRing: THREE.Mesh;
    tiltKnob: THREE.Mesh;
    azimuthRing: THREE.Mesh;
    azimuthKnob: THREE.Mesh;
    /** Scaled main radius of the tilt ring; used to position tiltKnob in update(). */
    _tiltRingRadius: number;
    /** Scaled main radius of the azimuth ring; used to position azimuthKnob in update(). */
    _azimuthRingRadius: number;

    constructor(scene: THREE.Scene) {
        this.group = new THREE.Group();
        this.arrows = [];
        this.group.visible = false;
        this.target = null;
        scene.add(this.group);

        // Arrow configuration: [direction vector, color, axis name]
        const arrowConfigs = [
            { dir: new THREE.Vector3(1, 0, 0), col: 0xff0000, axis: 'x' }, // +X
            { dir: new THREE.Vector3(-1, 0, 0), col: 0xff0000, axis: 'x' }, // -X
            { dir: new THREE.Vector3(0, 0, 1), col: 0x0000ff, axis: 'z' }, // +Z
            { dir: new THREE.Vector3(0, 0, -1), col: 0x0000ff, axis: 'z' }, // -Z
            { dir: new THREE.Vector3(0, 1, 0), col: 0x00ff00, axis: 'y' }, // +Y
            { dir: new THREE.Vector3(0, -1, 0), col: 0x00ff00, axis: 'y' }, // -Y
        ];

        arrowConfigs.forEach((config) => {
            const arrowLength = 60;
            const headLength = 15;
            const headWidth = 10;

            const arrow = new THREE.ArrowHelper(
                config.dir,
                new THREE.Vector3(0, 0, 0),
                arrowLength,
                config.col,
                headLength,
                headWidth
            );

            // Make the "grab" area easier to hit
            arrow.line.scale.set(3, 1, 3); // Thicker lines for raycasting
            arrow.cone.scale.set(2, 2, 2); // Larger heads for raycasting

            arrow.line.userData = { isGizmo: true, axis: config.axis, dir: config.dir };
            arrow.cone.userData = { isGizmo: true, axis: config.axis, dir: config.dir };
            this.group.add(arrow);
            this.arrows.push(arrow);
        });

        // Velocity arrow (part of the gizmo group so selection visibility is unified)
        this.velocityHeadLength = 15;
        this.velocityHeadWidth = 8;
        this.gravityHeadLength = 12;
        this.gravityHeadWidth = 6;

        this.velocityArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            1,
            0xffff00,
            this.velocityHeadLength,
            this.velocityHeadWidth
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
            this.gravityHeadLength,
            this.gravityHeadWidth
        );
        this.gravityArrow.visible = false;
        this.gravityArrow.line.userData = { isGravityGizmo: true };
        this.gravityArrow.cone.userData = { isGravityGizmo: true };
        this.group.add(this.gravityArrow);

        // --- Gimbal rings ---
        // Tilt ring — lies in the YZ plane (normal = X-axis). Thin tube for clean look.
        // Dragging maps the mouse ray onto the YZ plane; atan2(z, y) = axial tilt.
        const tiltRingMat = new THREE.MeshPhongMaterial({
            color: 0xff8800,
            emissive: new THREE.Color(0xff8800).multiplyScalar(0.25),
            specular: new THREE.Color(0xffffff),
            shininess: 80,
            side: THREE.FrontSide,
        });
        this.tiltRing = new THREE.Mesh(new THREE.TorusGeometry(80, 1.5, 16, 48), tiltRingMat);
        this.tiltRing.rotation.y = Math.PI / 2; // default XY → YZ plane
        this.tiltRing.userData = { isTiltGizmo: true };
        this.tiltRing.renderOrder = 0;
        this.tiltRing.visible = false;
        this.group.add(this.tiltRing);

        // Tilt knob — small sphere marking the current tilt angle on the ring.
        this.tiltKnob = new THREE.Mesh(
            new THREE.SphereGeometry(6, 16, 16),
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
        this.azimuthRing = new THREE.Mesh(new THREE.TorusGeometry(70, 1.5, 16, 48), azimuthRingMat);
        this.azimuthRing.rotation.x = Math.PI / 2; // default XY → XZ plane
        this.azimuthRing.userData = { isAzimuthGizmo: true };
        this.azimuthRing.renderOrder = 0;
        this.azimuthRing.visible = false;
        this.group.add(this.azimuthRing);

        // Azimuth knob — small sphere marking the current azimuth direction on the ring.
        this.azimuthKnob = new THREE.Mesh(
            new THREE.SphereGeometry(6, 16, 16),
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

        this._tiltRingRadius = 80;
        this._azimuthRingRadius = 70;
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

        // Scale arrows based on body size (allow scaling DOWN as well)
        // Keep a small floor so the gizmo doesn't become impossible to click.
        const scaleFactor = Math.max(body.radius / 10, 0.25);
        this.arrows.forEach((arrow) => {
            arrow.setLength(60 * scaleFactor, 15 * scaleFactor, 10 * scaleFactor);
        });

        // Scale velocity arrow similarly so it's clickable on small bodies
        this.velocityHeadLength = 15 * scaleFactor;
        this.velocityHeadWidth = 8 * scaleFactor;
        this.velocityArrow.setLength(1, this.velocityHeadLength, this.velocityHeadWidth);
        this.velocityArrow.line.scale.set(3, 1, 3);
        this.velocityArrow.cone.scale.set(2, 2, 2);

        // Scale gravity arrow similarly for consistency (not for raycasting, just visuals)
        this.gravityHeadLength = 12 * scaleFactor;
        this.gravityHeadWidth = 6 * scaleFactor;
        this.gravityArrow.setLength(1, this.gravityHeadLength, this.gravityHeadWidth);
        this.gravityArrow.line.scale.set(3, 1, 3);
        this.gravityArrow.cone.scale.set(2, 2, 2);

        // Tilt ring: only shown for bodies that have axial tilt (CelestialBody subclasses).
        // Duck-type check avoids a circular import (gizmo ← celestial-body ← star ← …).
        if ('rotation' in body && (body as { rotation: { tilt: number } }).rotation?.tilt !== undefined) {
            this.tiltRing.visible = true;
            this.tiltKnob.visible = true;
            this.azimuthRing.visible = true;
            this.azimuthKnob.visible = true;
            // Rings scale with the body so they clear its surface.
            // Knobs use a capped scale so they stay small and don't dominate on large bodies.
            // Rebuild ring geometry with the correct orbit radius. Tube radius is kept at a
            // fixed ~2% of the ring radius so the ring always looks like a thin wire at any scale.
            const tiltRadius = 80 * scaleFactor;
            const azRadius   = 70 * scaleFactor;
            const TUBE_RADIUS = Math.max(tiltRadius * 0.022, 0.5);
            const AZ_TUBE_RADIUS = Math.max(azRadius * 0.022, 0.5);
            this.tiltRing.geometry.dispose();
            this.tiltRing.geometry = new THREE.TorusGeometry(tiltRadius, TUBE_RADIUS, 16, 64);
            this.tiltRing.scale.setScalar(1);
            this.azimuthRing.geometry.dispose();
            this.azimuthRing.geometry = new THREE.TorusGeometry(azRadius, AZ_TUBE_RADIUS, 16, 64);
            this.azimuthRing.scale.setScalar(1);
            // Knobs: sized to sit clearly on the tube surface
            const KNOB_RADIUS = Math.max(TUBE_RADIUS * 3.5, 0.8);
            const AZ_KNOB_RADIUS = Math.max(AZ_TUBE_RADIUS * 3.5, 0.8);
            this.tiltKnob.geometry.dispose();
            this.tiltKnob.geometry = new THREE.SphereGeometry(KNOB_RADIUS, 16, 16);
            this.tiltKnob.scale.setScalar(1);
            this.azimuthKnob.geometry.dispose();
            this.azimuthKnob.geometry = new THREE.SphereGeometry(AZ_KNOB_RADIUS, 16, 16);
            this.azimuthKnob.scale.setScalar(1);
            this._tiltRingRadius = tiltRadius;
            this._azimuthRingRadius = azRadius;
        } else {
            this.tiltRing.visible = false;
            this.tiltKnob.visible = false;
            this.azimuthRing.visible = false;
            this.azimuthKnob.visible = false;
        }
    }

    updateVelocityArrow() {
        if (!this.velocityArrow || !this.target || this.target._isDisposed) return;

        const speed = this.target.velocity.length();
        const arrowScale = GIZMO_TUNING.VELOCITY_ARROW_SCALE;

        // Avoid NaNs on zero velocity
        const direction =
            speed > 0 ? this.target.velocity.clone().normalize() : new THREE.Vector3(1, 0, 0);

        this.velocityArrow.setDirection(direction);
        this.velocityArrow.setLength(
            Math.max(speed * arrowScale, 0.1),
            this.velocityHeadLength,
            this.velocityHeadWidth
        );
    }

    updateGravityArrow() {
        if (!this.gravityArrow || !this.target || this.target._isDisposed) return;

        const acc = this.target.tempAcc;
        if (!acc) {
            this.gravityArrow.visible = false;
            return;
        }

        const accMag = acc.length();

        // Avoid NaNs on zero acceleration
        const direction = accMag > 0 ? acc.clone().normalize() : new THREE.Vector3(1, 0, 0);

        // Scale for visibility; clamp to avoid extreme spikes when very close to a massive body.
        const minLen = Math.max((this.target.radius || 0) * 2.0, 0.1); // keep visible even far away; extend beyond body
        const maxLen = 3000;

        const len = THREE.MathUtils.clamp(accMag * GRAV_ARROW_SCALE, minLen, maxLen);

        this.gravityArrow.visible = true;
        this.gravityArrow.setDirection(direction);
        this.gravityArrow.setLength(len, this.gravityHeadLength, this.gravityHeadWidth);
    }

    update() {
        if (this.group.visible && this.target && !this.target._isDisposed) {
            this.group.position.copy(this.target.mesh.position);
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
        const TUBE_R = Rt * 0.022;
        const AZ_TUBE_R = Ra * 0.022;
        const sinAz = Math.sin(azimuthRad);
        const cosAz = Math.cos(azimuthRad);
        const sinTilt = Math.sin(tiltRad);
        const cosTilt = Math.cos(tiltRad);
        // Radial unit vector on the tilt ring at the knob position
        const tiltRadialX = sinTilt * sinAz;
        const tiltRadialY = cosTilt;
        const tiltRadialZ = sinTilt * cosAz;
        this.tiltKnob.position.set(
            Rt * tiltRadialX,
            Rt * tiltRadialY,
            Rt * tiltRadialZ
        );

        // Azimuth knob: centered on the ring tube centerline in the XZ plane.
        const azRadialX = sinAz;
        const azRadialZ = cosAz;
        this.azimuthKnob.position.set(Ra * azRadialX, 0, Ra * azRadialZ);
    }
}
