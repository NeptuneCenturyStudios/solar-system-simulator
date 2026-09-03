import * as THREE from 'three';
import { flightState, simulationState } from '../simulation/simulation';
import { NPC_FOLLOW_DISTANCE } from '../utilities/consts';

/**
 * Debug visualisation for ship-AI obstacle avoidance.
 *
 * Draws, for every AI-piloted ship: the corridor it is testing ahead of itself, the hazard
 * sphere of whatever it currently considers the worst obstacle, and the heading its controller
 * settled on. Without this the avoidance tuning is guesswork — a ship that misses a star could
 * be steering correctly or could simply have been lucky, and the two look identical from
 * outside.
 *
 * Colour says which state the controller is in:
 *   green  — path clear, flying straight at whatever it wants
 *   amber  — steering the tangent past an obstacle
 *   red    — fleeing: impact imminent, or already inside the hazard sphere
 *
 * Everything is depth-test-free so it stays readable when the corridor passes through the body
 * being avoided, which is exactly the moment you want to see it.
 */

/** Colour per avoidance state. */
const COLOR_CLEAR = 0x44dd88;
const COLOR_AVOIDING = 0xffaa00;
const COLOR_FLEEING = 0xff3344;

/** Unit-sphere wireframe segment counts. Coarse on purpose — it's a debug hull, not a body. */
const SPHERE_WIDTH_SEGMENTS = 24;
const SPHERE_HEIGHT_SEGMENTS = 16;

/** Head size of the heading arrow, as a fraction of its length. */
const ARROW_HEAD_FRACTION = 0.08;

/** One ship's worth of debug geometry. Pooled and reused; never rebuilt per frame. */
interface IGizmoEntry {
    corridor: THREE.Line;
    corridorPositions: Float32Array;
    corridorMaterial: THREE.LineBasicMaterial;
    heading: THREE.ArrowHelper;
    /** Unit sphere, scaled to the hazard radius — so the geometry is built once. */
    hull: THREE.Mesh;
    hullMaterial: THREE.MeshBasicMaterial;
}

// Scratch vectors — reused every frame to keep the gizmo allocation-free like the AI it watches.
const _end = new THREE.Vector3();

export class AiAvoidanceGizmo {
    private readonly group: THREE.Group;
    private readonly entries: IGizmoEntry[] = [];

    constructor(scene: THREE.Scene) {
        this.group = new THREE.Group();
        this.group.visible = false;
        scene.add(this.group);
    }

    /** Show or hide the whole overlay. Hidden is free — `update()` returns immediately. */
    setVisible(visible: boolean): void {
        this.group.visible = visible;
        if (!visible) {
            for (const entry of this.entries) this.hide(entry);
        }
    }

    get visible(): boolean {
        return this.group.visible;
    }

    /** Build one pooled entry's worth of geometry. */
    private createEntry(): IGizmoEntry {
        const corridorPositions = new Float32Array(6);
        const corridorGeometry = new THREE.BufferGeometry();
        corridorGeometry.setAttribute('position', new THREE.BufferAttribute(corridorPositions, 3));
        const corridorMaterial = new THREE.LineBasicMaterial({
            color: COLOR_CLEAR,
            transparent: true,
            opacity: 0.7,
            depthTest: false,
        });
        const corridor = new THREE.Line(corridorGeometry, corridorMaterial);
        corridor.renderOrder = 999;
        corridor.frustumCulled = false;

        const heading = new THREE.ArrowHelper(
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(),
            1,
            COLOR_CLEAR
        );
        heading.renderOrder = 999;
        (heading.line.material as THREE.Material).depthTest = false;
        (heading.cone.material as THREE.Material).depthTest = false;
        heading.line.frustumCulled = false;
        heading.cone.frustumCulled = false;

        const hullMaterial = new THREE.MeshBasicMaterial({
            color: COLOR_AVOIDING,
            wireframe: true,
            transparent: true,
            opacity: 0.25,
            depthTest: false,
        });
        const hull = new THREE.Mesh(
            new THREE.SphereGeometry(1, SPHERE_WIDTH_SEGMENTS, SPHERE_HEIGHT_SEGMENTS),
            hullMaterial
        );
        hull.renderOrder = 998;
        hull.frustumCulled = false;

        const entry: IGizmoEntry = {
            corridor,
            corridorPositions,
            corridorMaterial,
            heading,
            hull,
            hullMaterial,
        };

        this.group.add(corridor, heading, hull);
        this.hide(entry);
        return entry;
    }

    private hide(entry: IGizmoEntry): void {
        entry.corridor.visible = false;
        entry.heading.visible = false;
        entry.hull.visible = false;
    }

    /**
     * Refresh the overlay from each NPC's most recent avoidance result.
     *
     * Call after `stepNpcShips()`, so what's drawn is the decision the ship is actually flying
     * this frame rather than the previous one's.
     */
    update(): void {
        if (!this.group.visible) return;

        let used = 0;

        for (const ship of simulationState.npcShips) {
            if (!ship || ship._isDisposed || !ship.mesh || !ship.ai) continue;
            // The controller stands down when the player or the autopilot has the ship, so its
            // last result is stale — don't draw a decision nothing is acting on.
            if (ship === flightState.activeShip || ship.autopilotActive) continue;

            const avoid = ship.ai.avoidance.last;
            const entry = this.entries[used] ?? this.createEntry();
            if (!this.entries[used]) this.entries.push(entry);
            used++;

            const color = avoid.flee ? COLOR_FLEEING : avoid.hazard ? COLOR_AVOIDING : COLOR_CLEAR;

            // A parked ship has no lookahead at all (it scales with speed), so floor the drawn
            // length at the follow distance — otherwise the overlay vanishes exactly when you
            // are trying to work out why the ship isn't moving.
            const drawLength = Math.max(avoid.lookahead, NPC_FOLLOW_DISTANCE);
            const origin = ship.mesh.position;

            // Corridor: from the ship along the direction the scan was run.
            _end.copy(origin).addScaledVector(avoid.travelDir, drawLength);
            const p = entry.corridorPositions;
            p[0] = origin.x;
            p[1] = origin.y;
            p[2] = origin.z;
            p[3] = _end.x;
            p[4] = _end.y;
            p[5] = _end.z;
            entry.corridor.geometry.attributes.position.needsUpdate = true;
            entry.corridor.geometry.computeBoundingSphere();
            entry.corridorMaterial.color.setHex(color);
            entry.corridor.visible = true;

            // Heading: what the controller actually decided to steer toward.
            entry.heading.position.copy(origin);
            entry.heading.setDirection(avoid.heading);
            entry.heading.setLength(
                drawLength,
                drawLength * ARROW_HEAD_FRACTION,
                drawLength * ARROW_HEAD_FRACTION * 0.5
            );
            entry.heading.setColor(color);
            entry.heading.visible = true;

            // Hazard hull: the padded sphere the ship is steering around, not the body's own
            // surface — the gap between the two is the safety margin doing its job.
            if (avoid.hazard && avoid.hazard.mesh && avoid.hazardRadius > 0) {
                entry.hull.position.copy(avoid.hazard.mesh.position);
                entry.hull.scale.setScalar(avoid.hazardRadius);
                entry.hullMaterial.color.setHex(color);
                entry.hull.visible = true;
            } else {
                entry.hull.visible = false;
            }
        }

        // Ships that died or were taken over leave their entries behind for reuse.
        for (let i = used; i < this.entries.length; i++) this.hide(this.entries[i]);
    }

    /** Release every pooled buffer. Called on teardown. */
    dispose(): void {
        for (const entry of this.entries) {
            entry.corridor.geometry.dispose();
            entry.corridorMaterial.dispose();
            entry.hull.geometry.dispose();
            entry.hullMaterial.dispose();
            entry.heading.dispose();
        }
        this.entries.length = 0;
        this.group.clear();
        this.group.removeFromParent();
    }
}
