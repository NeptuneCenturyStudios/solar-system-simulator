import * as THREE from 'three';
import { GridHelperManager } from './grid-helper';
import { CoordinateGizmo } from './coordinate-gizmo';

/**
 * Manages the Y-axis position indicator (red) and velocity-tip indicator (green)
 * that are shown during body drag / velocity-drag operations.
 *
 * Depends on GridHelperManager so that show() / hide() can coordinate grid visibility
 * and gridState without reaching back into index.ts globals.
 */
export class PositionIndicatorManager {
    // ── Red indicator — body position ────────────────────────────────────────
    yAxisIndicator: THREE.Line | null = null;
    yAxisRing: THREE.Mesh | null = null;

    // ── Green indicator — velocity arrow tip ─────────────────────────────────
    velocityTipIndicator: THREE.Line | null = null;
    velocityTipRing: THREE.Mesh | null = null;

    private scene: THREE.Scene;
    private gridHelperManager: GridHelperManager;
    private gizmo: CoordinateGizmo;

    constructor(scene: THREE.Scene, gridHelperManager: GridHelperManager, gizmo: CoordinateGizmo) {
        this.scene = scene;
        this.gridHelperManager = gridHelperManager;
        this.gizmo = gizmo;
    }

    // ── Initialisation ────────────────────────────────────────────────────────

    /** Create both indicator pairs and add them to the scene. Must be called once after construction. */
    init(): void {
        const red = this._createIndicator(0xff0000);
        this.yAxisIndicator = red.line;
        this.yAxisRing = red.ring;

        const green = this._createIndicator(0x00ff00);
        this.velocityTipIndicator = green.line;
        this.velocityTipRing = green.ring;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Update the geometry of a line/ring pair so the line runs from y=0 up to `position`.
     * Safe to call with nulls — does nothing.
     */
    updateIndicator(
        line: THREE.Line | null,
        ring: THREE.Mesh | null,
        position: THREE.Vector3 | null
    ): void {
        if (!line || !ring || !position) return;

        const gridY = 0;
        const newGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(position.x, gridY, position.z),
            new THREE.Vector3(position.x, position.y, position.z),
        ]);
        line.geometry.dispose();
        line.geometry = newGeometry;

        ring.position.set(position.x, gridY, position.z);
    }

    /** Toggle red/green indicator visibility based on the current interaction mode. */
    setMode(mode: string): void {
        const showRed = mode === 'position' || mode === 'both';
        const showGreen = mode === 'velocity' || mode === 'both';

        if (this.yAxisIndicator) this.yAxisIndicator.visible = showRed;
        if (this.yAxisRing) this.yAxisRing.visible = showRed;
        if (this.velocityTipIndicator) this.velocityTipIndicator.visible = showGreen;
        if (this.velocityTipRing) this.velocityTipRing.visible = showGreen;
    }

    /**
     * Called when a drag starts. Captures the drag-anchor and cell size from the gizmo
     * target, freezes grid divisions, shows the grid, and sets indicator visibility.
     */
    show(mode = 'position'): void {
        const ghm = this.gridHelperManager;

        // Capture drag-start anchor and fixed cell size from the gizmo target.
        if (this.gizmo?.target?.mesh) {
            ghm.gridState.dragAnchor.copy(this.gizmo.target.mesh.position);
            const r = Math.max(0, this.gizmo.target.radius || 0);
            ghm.gridState.dragCellSize = Math.max(0.05, Math.min(20000, r || 1));
        } else {
            ghm.gridState.dragAnchor.set(0, 0, 0);
            ghm.gridState.dragCellSize = 10;
        }

        // Freeze divisions during drag to prevent the "shimmering" / perceived-grid-motion effect.
        ghm.gridState.freezeDivisions = true;
        ghm.ensure(this.gizmo?.target ?? null, true);

        // Defensive re-add in case anything removed these from the scene.
        const gridHelper = ghm.gridHelper;
        if (gridHelper && !gridHelper.parent) this.scene.add(gridHelper);
        if (this.yAxisIndicator && !this.yAxisIndicator.parent) this.scene.add(this.yAxisIndicator);
        if (this.yAxisRing && !this.yAxisRing.parent) this.scene.add(this.yAxisRing);
        if (this.velocityTipIndicator && !this.velocityTipIndicator.parent) this.scene.add(this.velocityTipIndicator);
        if (this.velocityTipRing && !this.velocityTipRing.parent) this.scene.add(this.velocityTipRing);

        if (gridHelper) gridHelper.visible = true;
        this.setMode(mode);

        if ((mode === 'position' || mode === 'both') && this.gizmo?.target?.mesh) {
            this.updateIndicator(this.yAxisIndicator, this.yAxisRing, this.gizmo.target.mesh.position);
        }
    }

    /** Called when a drag ends. Unfreezes grid state and hides all indicators + grid. */
    hide(): void {
        const ghm = this.gridHelperManager;
        ghm.gridState.freezeDivisions = false;
        ghm.gridState.dragCellSize = null;
        this.setMode('none');
        if (ghm.gridHelper) ghm.gridHelper.visible = false;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _createIndicator(color: number): { line: THREE.Line; ring: THREE.Mesh } {
        const lineMaterial = new THREE.LineBasicMaterial({ color, linewidth: 2 });
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, 100, 0),
        ]);
        const line = new THREE.Line(lineGeometry, lineMaterial);
        line.visible = false;
        this.scene.add(line);

        const ringGeometry = new THREE.RingGeometry(8, 10, 32);
        const ringMaterial = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2; // Lie flat on XZ plane
        ring.visible = false;
        this.scene.add(ring);

        return { line, ring };
    }
}
