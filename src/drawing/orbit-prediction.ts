import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { Body } from '../bodies/body';
import { BodyTypeEnum } from '../bodies/body-enums';
import {
    G,
    ORBIT_PREDICTION_BASE_SEGMENTS,
    ORBIT_PREDICTION_MAX_SEGMENTS,
    ORBIT_PREDICTION_HIGH_E_THRESHOLD,
    ORBIT_PREDICTION_LINEWIDTH_PX,
} from '../utilities/consts';

/** Color for the orbit prediction line (distinct from the trail color). */
const ORBIT_PREDICTION_COLOR = 0x44aaff;

/** Opacity of the orbit prediction line. */
const ORBIT_PREDICTION_OPACITY = 0.35;

/**
 * Manages orbit prediction lines for all bodies in the simulation.
 * Computes a 2-body Keplerian orbit for each body relative to its
 * strongest gravitational influencer and draws the full orbital path.
 */
export class OrbitPredictionManager {
    private scene: THREE.Scene;
    /** Map from body.id -> line object for quick lookups and updates. */
    private lines: Map<string, Line2> = new Map();
    private _visible = false;
    private viewportWidth = 1;
    private viewportHeight = 1;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        this.resize(window.innerWidth, window.innerHeight);
    }

    /** Show/hide all prediction lines. */
    set visible(v: boolean) {
        this._visible = v;
        for (const line of this.lines.values()) {
            line.visible = v;
        }
    }

    get visible(): boolean {
        return this._visible;
    }

    /** Update fat-line material resolution after a window resize. */
    resize(width: number, height: number): void {
        this.viewportWidth = Math.max(1, width);
        this.viewportHeight = Math.max(1, height);

        for (const line of this.lines.values()) {
            const mat = line.material as LineMaterial;
            mat.resolution.set(this.viewportWidth, this.viewportHeight);
        }
    }

    /**
     * Find the strongest gravitational influencer for a given body.
     * Returns the body with the largest gravitational pull (GM/r^2) on body.
     */
    private findPrimary(body: Body, allBodies: Body[]): Body | null {
        if (!body.mesh || body._isDisposed) return null;

        let best: Body | null = null;
        let bestAccel = -1;

        for (const other of allBodies) {
            if (other === body || other._isDisposed || !other.mesh) continue;
            const diff = new THREE.Vector3().subVectors(other.mesh.position, body.mesh.position);
            const r = diff.length();
            if (r < 0.01) continue; // too close, skip to avoid division by near-zero
            const accel = (G * other.mass) / (r * r);
            if (accel > bestAccel) {
                bestAccel = accel;
                best = other;
            }
        }

        return best;
    }

    private buildPerifocalAxes(
        r: THREE.Vector3,
        orbitNormal: THREE.Vector3,
        eVec: THREE.Vector3,
        e: number
    ): { xPeri: THREE.Vector3; yPeri: THREE.Vector3; zPeri: THREE.Vector3 } {
        let xPeri: THREE.Vector3;

        if (e >= 1e-8) {
            xPeri = eVec.clone().normalize();
        } else {
            xPeri = r.clone().projectOnPlane(orbitNormal);
            if (xPeri.lengthSq() < 1e-12) {
                const ref =
                    Math.abs(orbitNormal.y) < 0.99
                        ? new THREE.Vector3(0, 1, 0)
                        : new THREE.Vector3(1, 0, 0);
                xPeri = new THREE.Vector3().crossVectors(ref, orbitNormal);
            }
            xPeri.normalize();
        }

        const zPeri = orbitNormal.clone();
        const yPeri = new THREE.Vector3().crossVectors(zPeri, xPeri).normalize();

        return { xPeri, yPeri, zPeri };
    }

    private getAdaptiveSegments(e: number): number {
        if (e <= ORBIT_PREDICTION_HIGH_E_THRESHOLD) {
            return ORBIT_PREDICTION_BASE_SEGMENTS;
        }

        const span = Math.max(1e-6, 1 - ORBIT_PREDICTION_HIGH_E_THRESHOLD);
        const boost = (e - ORBIT_PREDICTION_HIGH_E_THRESHOLD) / span;
        const target = Math.round(ORBIT_PREDICTION_BASE_SEGMENTS * (1 + 2 * boost));

        return THREE.MathUtils.clamp(
            target,
            ORBIT_PREDICTION_BASE_SEGMENTS,
            ORBIT_PREDICTION_MAX_SEGMENTS
        );
    }

    /**
     * Compute orbital prediction points for a body relative to its primary.
     * Uses two-body Keplerian orbital mechanics from the current state vector.
     * Returns an array of THREE.Vector3 points forming the orbit curve, or
     * null if a prediction cannot be computed (e.g. unbound trajectory).
     */
    private computeOrbitPoints(
        body: Body,
        primary: Body,
        gMultiplier: number
    ): THREE.Vector3[] | null {
        const r = new THREE.Vector3().subVectors(body.mesh.position, primary.mesh.position);
        const v = body.velocity.clone().sub(primary.velocity);

        const rLen = r.length();
        const vLen = v.length();

        if (rLen < 1e-10 || vLen < 1e-10) return null;

        // Standard gravitational parameter (scaled units), matching the physics engine.
        const mu = G * gMultiplier * primary.mass;
        if (mu <= 0) return null;

        // Specific angular momentum: h = r x v
        const h = new THREE.Vector3().crossVectors(r, v);
        const hLen = h.length();
        if (hLen < 1e-20) return null; // degenerate orbit (collinear r and v)

        // Eccentricity vector: e = (v x h) / mu - r_hat
        const vCrossH = new THREE.Vector3().crossVectors(v, h);
        const rHat = r.clone().normalize();
        const eVec = vCrossH.divideScalar(mu).sub(rHat);
        const e = eVec.length();

        // Semi-major axis from vis-viva: v^2 = mu(2/r - 1/a)
        const invA = 2 / rLen - (vLen * vLen) / mu;
        if (Math.abs(invA) < 1e-20) return null; // parabolic, treat as unbound

        const a = 1 / invA;
        const orbitNormal = h.clone().normalize();
        const { xPeri, yPeri } = this.buildPerifocalAxes(r, orbitNormal, eVec, e);

        // For hyperbolic trajectories (a < 0), draw a partial arc inside asymptotes.
        if (a <= 0) {
            if (e <= 1) return null; // impossible, but guard anyway

            const nuMax = Math.acos(-1 / e) * 0.97;
            const hyperPoints: THREE.Vector3[] = [];
            const segs = ORBIT_PREDICTION_BASE_SEGMENTS;
            const p = -a * (e * e - 1); // semi-latus rectum (positive for a<0 and e>1)

            for (let i = 0; i <= segs; i++) {
                const nu = -nuMax + (i / segs) * 2 * nuMax;
                const denom = 1 + e * Math.cos(nu);
                if (denom <= 1e-10) continue;

                const radius = p / denom;
                const xP = radius * Math.cos(nu);
                const yP = radius * Math.sin(nu);

                hyperPoints.push(
                    new THREE.Vector3()
                        .addScaledVector(xPeri, xP)
                        .addScaledVector(yPeri, yP)
                        .add(primary.mesh.position)
                );
            }

            return hyperPoints.length >= 3 ? hyperPoints : null;
        }

        const effectiveE = e < 1e-8 ? 0 : e;
        const points: THREE.Vector3[] = [];
        const segments = this.getAdaptiveSegments(effectiveE);

        // Sample in true anomaly to naturally densify near periapsis.
        for (let i = 0; i <= segments; i++) {
            const nu = (i / segments) * Math.PI * 2;
            const cosNu = Math.cos(nu);
            const sinNu = Math.sin(nu);
            const denom = 1 + effectiveE * cosNu;
            if (denom <= 1e-10) continue;

            const radius = (a * (1 - effectiveE * effectiveE)) / denom;
            const xP = radius * cosNu;
            const yP = radius * sinNu;

            points.push(
                new THREE.Vector3()
                    .addScaledVector(xPeri, xP)
                    .addScaledVector(yPeri, yP)
                    .add(primary.mesh.position)
            );
        }

        return points;
    }

    private createLine(): Line2 {
        const geo = new LineGeometry();
        geo.setPositions([0, 0, 0, 0, 0, 0]);

        const mat = new LineMaterial({
            color: ORBIT_PREDICTION_COLOR,
            transparent: true,
            opacity: ORBIT_PREDICTION_OPACITY,
            linewidth: ORBIT_PREDICTION_LINEWIDTH_PX,
            depthTest: true,
            depthWrite: false,
        });
        mat.resolution.set(this.viewportWidth, this.viewportHeight);

        const line = new Line2(geo, mat);
        line.computeLineDistances();
        line.frustumCulled = false;
        line.renderOrder = 5;
        line.visible = this._visible;

        return line;
    }

    /**
     * Update all orbit prediction lines. Called once per frame.
     * @param bodies All bodies in the simulation.
     * @param gMultiplier Current gravity multiplier (to match actual physics).
     */
    update(bodies: Body[], gMultiplier = 1): void {
        if (!this._visible) {
            for (const line of this.lines.values()) {
                if (line.visible) line.visible = false;
            }
            return;
        }

        const activeIds = new Set<string>();

        for (const body of bodies) {
            if (!body || body._isDisposed || !body.mesh) continue;

            // Skip stars, they are the primaries, not orbiters.
            if (body.bodyType & BodyTypeEnum.Star) continue;

            const primary = this.findPrimary(body, bodies);
            if (!primary) continue;

            const points = this.computeOrbitPoints(body, primary, gMultiplier);
            if (!points || points.length < 3) continue;

            activeIds.add(body.id);

            let line = this.lines.get(body.id);
            if (!line) {
                line = this.createLine();
                this.scene.add(line);
                this.lines.set(body.id, line);
            }

            const positions = new Array<number>(points.length * 3);
            for (let i = 0; i < points.length; i++) {
                const p = points[i];
                positions[i * 3] = p.x;
                positions[i * 3 + 1] = p.y;
                positions[i * 3 + 2] = p.z;
            }

            const lineGeometry = line.geometry as LineGeometry;
            lineGeometry.setPositions(positions);
            lineGeometry.computeBoundingSphere();
            line.visible = true;
        }

        // Remove lines for bodies that no longer exist or have no valid orbit.
        for (const [id, line] of this.lines.entries()) {
            if (!activeIds.has(id)) {
                this.scene.remove(line);
                line.geometry.dispose();
                (line.material as LineMaterial).dispose();
                this.lines.delete(id);
            }
        }
    }

    /** Clean up all prediction lines. */
    dispose(): void {
        for (const [, line] of this.lines.entries()) {
            this.scene.remove(line);
            line.geometry.dispose();
            (line.material as LineMaterial).dispose();
        }
        this.lines.clear();
    }
}
