import * as THREE from 'three';
import { Body } from '../bodies/body';

interface GridState {
    size: number;
    divisions: number;
    /** XZ anchor position captured at drag-start; grid does not move after this. */
    dragAnchor: THREE.Vector3;
    /** Fixed cell size for the drag session, derived from body radius at drag-start. */
    dragCellSize: number | null;
    /** While true, divisions are kept stable to prevent the "grid shifting" effect. */
    freezeDivisions: boolean;
}

/**
 * Manages a THREE.GridHelper that dynamically resizes during body drag operations.
 *
 * UX goal: the grid feels "world anchored" (does not move with the body) but
 * expands/contracts to encompass the dragged target plus a buffer.
 */
export class GridHelperManager {
    /** The current grid helper mesh, or null when not yet created / disposed. */
    gridHelper: THREE.GridHelper | null = null;

    /** Mutable drag-session state. Exposed so PositionIndicatorManager can read/write it. */
    gridState: GridState = {
        size: 0,
        divisions: 0,
        dragAnchor: new THREE.Vector3(),
        dragCellSize: null,
        freezeDivisions: false,
    };

    private scene: THREE.Scene;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Remove, dispose, and null out the current grid helper. */
    dispose(): void {
        if (!this.gridHelper) return;
        this.scene.remove(this.gridHelper);
        this.gridHelper.geometry?.dispose?.();
        (this.gridHelper.material as THREE.Material)?.dispose?.();
        this.gridHelper = null;
        this.gridState.size = 0;
        this.gridState.divisions = 0;
    }

    /** Recreate the grid helper at the given size/divisions/center. */
    create({
        size,
        divisions,
        center,
    }: {
        size: number;
        divisions: number;
        center: THREE.Vector3 | null;
    }): void {
        // GridHelper doesn't support resizing — dispose and recreate.
        this.dispose();

        this.gridHelper = new THREE.GridHelper(size, divisions, 0x888888, 0x444444);
        if (center) {
            this.gridHelper.position.set(center.x, 0, center.z);
        } else {
            this.gridHelper.position.set(0, 0, 0);
        }
        this.gridHelper.visible = false;
        this.scene.add(this.gridHelper);

        this.gridState.size = size;
        this.gridState.divisions = divisions;
    }

    /** Compute the required size, divisions, and center for the given target body. */
    calcRequired(targetBody: Body | null): {
        size: number;
        divisions: number;
        center: THREE.Vector3;
    } {
        if (!targetBody || targetBody._isDisposed || !targetBody.mesh) {
            return {
                size: 12000,
                divisions: 200,
                center: new THREE.Vector3(0, 0, 0),
            };
        }

        // Grid anchor: where the body was when the drag started.
        const anchor = this.gridState.dragAnchor || new THREE.Vector3(0, 0, 0);

        // How far the body has moved from the drag-start anchor (XZ only)
        const p = targetBody.mesh.position;
        const dx = p.x - anchor.x;
        const dz = p.z - anchor.z;
        const rXZ = Math.sqrt(dx * dx + dz * dz);

        const radius = Math.max(0, targetBody.radius || 0);

        // Buffer: keep initial grid small; expand only as body moves away from anchor.
        const buffer = Math.max(25, radius * 4);
        const baseHalfExtent = Math.max(radius + buffer, 120);
        const halfExtent = baseHalfExtent + rXZ;

        const size = THREE.MathUtils.clamp(halfExtent * 2, 500, 4000000);

        // Cell size is FIXED for the drag session to prevent perceived grid motion.
        const cell = this.gridState.dragCellSize ?? Math.max(0.05, Math.min(20000, radius || 1));

        let divisions = Math.round(size / cell);
        divisions = THREE.MathUtils.clamp(divisions, 2, 20000);
        if (divisions % 2 !== 0) divisions += 1;

        return { size, divisions, center: anchor };
    }

    /**
     * Rebuild the grid only when the required size differs meaningfully from the current one,
     * then re-anchor it and make it visible during drag operations.
     *
     * @param targetBody The body currently being dragged.
     * @param isDragging Whether a drag (reposition or velocity change) is currently active.
     */
    ensure(targetBody: Body | null, isDragging = false): void {
        const {
            size: requiredSize,
            divisions: requiredDivisions,
            center,
        } = this.calcRequired(targetBody);

        const currentSize = this.gridState.size || 0;
        const currentDivisions = this.gridState.divisions || 0;

        const sizeChangedEnough =
            !this.gridHelper || Math.abs(requiredSize - currentSize) > currentSize * 0.05;

        const divisionsToUse = requiredDivisions;
        const divisionsChanged = divisionsToUse !== currentDivisions;

        const shouldRebuild =
            sizeChangedEnough ||
            (!this.gridState.freezeDivisions && divisionsChanged) ||
            (this.gridState.freezeDivisions && sizeChangedEnough);

        if (shouldRebuild) {
            this.create({ size: requiredSize, divisions: divisionsToUse, center });
        }

        // Keep the grid anchored at drag-start center (XZ).
        if (this.gridHelper && center) {
            this.gridHelper.position.set(center.x, 0, center.z);
            if (isDragging) {
                this.gridHelper.visible = true;
            }
        }
    }

    /** Initialize with a default grid sized for an empty scene. */
    init(): void {
        this.create(this.calcRequired(null));
    }
}
