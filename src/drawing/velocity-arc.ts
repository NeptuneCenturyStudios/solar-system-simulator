import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { Body } from '../bodies/body';
import {
    GIZMO_TUNING,
    VEL_ARC_SEGMENTS,
    VEL_ARC_COLOR,
    VEL_ARC_OPACITY,
    VEL_ARC_ACTIVE_OPACITY,
    VEL_ARC_LINEWIDTH_PX,
    VEL_ARC_TIP_RADIUS_MIN,
    VEL_ARC_TIP_RADIUS_MAX,
} from '../utilities/consts';
import { CoordinateGizmo } from '../gizmos/coordinate-gizmo';

export class VelocityArcManager {
    // Public so index.ts can set .visible = false directly where needed
    arcXZ: Line2;
    arcY: Line2;

    private scene: THREE.Scene;
    private gizmo: CoordinateGizmo;
    private interactionState: { isChangingVelocity: boolean; isMiddleMouseVelocity: boolean; velocityEditMode: string };

    constructor(
        scene: THREE.Scene,
        gizmo: CoordinateGizmo,
        interactionState: { isChangingVelocity: boolean; isMiddleMouseVelocity: boolean; velocityEditMode: string }
    ) {
        this.scene = scene;
        this.gizmo = gizmo;
        this.interactionState = interactionState;

        this.arcXZ = this._createArcLine();
        this.arcY = this._createArcLine();
        scene.add(this.arcXZ);
        scene.add(this.arcY);
    }

    // NOTE: We use Line2 (fat lines) because LineBasicMaterial.linewidth is ignored on most WebGL platforms.
    // Arc is centered on the VELOCITY TIP (not the body), and its radius is based on body radius.
    // This creates a "mouse path preview" near where the tip will sweep as you drag.
    private _createArcLine(segments = VEL_ARC_SEGMENTS, color = VEL_ARC_COLOR): Line2 {
        // Authored in the XZ plane around origin and later positioned/rotated/scaled.
        const positions = [];
        const span = (Math.PI * 2) / 3; // 120° visible arc
        const start = -span / 2;
        const end = span / 2;

        for (let i = 0; i <= segments; i++) {
            const u = i / segments;
            const t = start + (end - start) * u;
            positions.push(Math.cos(t), 0, Math.sin(t));
        }

        const geo = new LineGeometry();
        geo.setPositions(positions);

        const mat = new LineMaterial({
            color,
            transparent: true,
            opacity: VEL_ARC_OPACITY,
            linewidth: VEL_ARC_LINEWIDTH_PX, // in pixels (requires setting resolution)
            depthTest: false,
            depthWrite: false,
        });
        mat.resolution.set(window.innerWidth, window.innerHeight);

        const line = new Line2(geo, mat);
        line.computeLineDistances();
        line.frustumCulled = false;
        line.renderOrder = 999; // keep on top of most scene elements
        line.visible = false;
        return line;
    }

    /** Update LineMaterial resolution after a window resize. */
    resize(width: number, height: number): void {
        if (this.arcXZ?.material?.resolution) this.arcXZ.material.resolution.set(width, height);
        if (this.arcY?.material?.resolution) this.arcY.material.resolution.set(width, height);
    }

    /** Hide both arcs immediately. */
    hideAll(): void {
        this.arcXZ.visible = false;
        this.arcY.visible = false;
    }

    private _calcVelArcRadius(body: Body): number {
        // Arc radius should match the velocity arrow length (treat arrow as circle radius).
        // velocityArrow length = speed * ARROW_SCALE
        const speed = body?.velocity?.length?.() ? body.velocity.length() : 0;
        const arrowLen = Math.max(speed * GIZMO_TUNING.VELOCITY_ARROW_SCALE, 0.1);

        // Keep within sane limits so it stays visible and not enormous.
        return THREE.MathUtils.clamp(arrowLen, VEL_ARC_TIP_RADIUS_MIN, VEL_ARC_TIP_RADIUS_MAX);
    }

    /** Update arc positions, rotations and visibility each frame. */
    update(): void {
        const draggingVel =
            this.interactionState.isChangingVelocity ||
            this.interactionState.isMiddleMouseVelocity;

        if (!this.gizmo?.target || this.gizmo.target._isDisposed || !this.gizmo.target.mesh || !draggingVel) {
            this.arcXZ.visible = false;
            this.arcY.visible = false;
            return;
        }

        // Force visibility while dragging so the user gets immediate "hit" feedback.
        this.arcXZ.visible = true;
        this.arcY.visible = true;

        const body = this.gizmo.target;
        const origin = body.mesh.position;
        const arcR = this._calcVelArcRadius(body);

        // Current velocity direction in world space
        const v = body.velocity.clone();
        const speed = v.length();
        const handleDir = speed > 1e-10 ? v.normalize() : new THREE.Vector3(1, 0, 0);

        // Center arc at the VELOCITY TIP (what the mouse is effectively dragging around).
        const tipPos = origin
            .clone()
            .addScaledVector(handleDir, speed * GIZMO_TUNING.VELOCITY_ARROW_SCALE);

        // Center arcs on the ARROW TIP, but the arc should be a segment of the circle
        // whose radius is the arrow length.
        const arcCenterXZ = tipPos
            .clone()
            .addScaledVector(new THREE.Vector3(handleDir.x, 0, handleDir.z).normalize(), -arcR);
        arcCenterXZ.y = tipPos.y;

        const arcCenterY = tipPos.clone().addScaledVector(handleDir, -arcR);

        this.arcXZ.position.copy(arcCenterXZ);
        this.arcY.position.copy(arcCenterY);

        // XZ arc: rotate to match heading, keep flat in XZ plane.
        const h = new THREE.Vector3(handleDir.x, 0, handleDir.z);
        if (h.lengthSq() < 1e-10) h.set(1, 0, 0);
        h.normalize();

        const yaw = -Math.atan2(h.z, h.x);
        this.arcXZ.rotation.set(0, yaw, 0);
        this.arcXZ.scale.set(arcR, arcR, arcR);

        // Y arc: tilt with the current velocity vector.
        const up = new THREE.Vector3(0, 1, 0);
        const xAxis = handleDir.clone();
        const ref = Math.abs(xAxis.dot(up)) > 0.999 ? new THREE.Vector3(1, 0, 0) : up;

        const yAxis = ref.clone().sub(xAxis.clone().multiplyScalar(ref.dot(xAxis)));
        if (yAxis.lengthSq() < 1e-10) yAxis.set(0, 0, 1);
        yAxis.normalize();

        const zAxis = new THREE.Vector3().crossVectors(xAxis, yAxis).normalize();

        const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
        const arcAdjust = new THREE.Matrix4().makeRotationX(Math.PI / 2);
        const m = new THREE.Matrix4().multiplyMatrices(basis, arcAdjust);

        this.arcY.setRotationFromMatrix(m);
        this.arcY.scale.set(arcR, arcR, arcR);

        // Visibility by mode
        if (this.interactionState.velocityEditMode === 'xz') {
            this.arcXZ.visible = true;
            this.arcY.visible = false;
        } else {
            this.arcXZ.visible = false;
            this.arcY.visible = true;
        }

        // Thicken + brighten the active arc during the drag
        const activeArc =
            this.interactionState.velocityEditMode === 'xz' ? this.arcXZ : this.arcY;
        if (activeArc && activeArc.material) {
            activeArc.material.opacity = VEL_ARC_ACTIVE_OPACITY;
        }
    }
}
