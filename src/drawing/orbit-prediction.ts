import * as THREE from 'three';
import { Body } from '../bodies/body';
import { BodyTypeEnum } from '../bodies/body-enums';
import { G } from '../utilities/consts';

/** Number of points used to draw the full orbital prediction curve. */
const ORBIT_PREDICTION_SEGMENTS = 512;

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
    /** Map from body.id → line object for quick lookups and updates. */
    private lines: Map<string, THREE.Line> = new Map();
    private _visible = false;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
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

    /**
     * Find the strongest gravitational influencer for a given body.
     * Returns the body with the largest gravitational pull (GM/r²) on `body`.
     */
    private findPrimary(body: Body, allBodies: Body[]): Body | null {
        if (!body.mesh || body._isDisposed) return null;

        let best: Body | null = null;
        let bestAccel = -1;

        for (const other of allBodies) {
            if (other === body || other._isDisposed || !other.mesh) continue;
            const diff = new THREE.Vector3().subVectors(
                other.mesh.position,
                body.mesh.position
            );
            const r = diff.length();
            if (r < 0.01) continue; // too close – skip to avoid division by near-zero
            const accel = (G * other.mass) / (r * r);
            if (accel > bestAccel) {
                bestAccel = accel;
                best = other;
            }
        }

        return best;
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
        const r = new THREE.Vector3().subVectors(
            body.mesh.position,
            primary.mesh.position
        );
        const v = body.velocity.clone().sub(primary.velocity);

        const rLen = r.length();
        const vLen = v.length();

        if (rLen < 1e-10 || vLen < 1e-10) return null;

        // Standard gravitational parameter (scaled units) — match physics engine
        const mu = G * gMultiplier * primary.mass;

        // Avoid division by zero when G * gMultiplier is 0 (no gravity)
        if (mu <= 0) return null;

        // Specific angular momentum: h = r × v
        const h = new THREE.Vector3().crossVectors(r, v);
        const hLen = h.length();
        if (hLen < 1e-20) return null; // degenerate orbit (collinear r and v)

        // Eccentricity vector: e = (v × h) / μ - r̂
        const vCrossH = new THREE.Vector3().crossVectors(v, h);
        const rHat = r.clone().normalize();
        const eVec = vCrossH.divideScalar(mu).sub(rHat);
        const e = eVec.length();

        // Semi-major axis from vis-viva: v² = μ(2/r - 1/a)  =>  a = 1 / (2/r - v²/μ)
        const invA = (2 / rLen) - (vLen * vLen) / mu;
        if (Math.abs(invA) < 1e-20) return null; // parabolic – treat as unbound

        const a = 1 / invA;

        const orbitNormal = h.clone().normalize();

        // Build perifocal frame (needed for both elliptic and hyperbolic cases)
        const xPeri = eVec.clone().normalize();
        const zPeri = orbitNormal.clone();
        const yPeri = new THREE.Vector3().crossVectors(zPeri, xPeri).normalize();

        // For hyperbolic/near-parabolic trajectories (a < 0), draw a partial arc
        // spanning the visible portion instead of nothing.  The asymptotic true
        // anomaly is νmax = acos(-1/e); we cap slightly inside that.
        if (a <= 0) {
            if (e <= 1) return null; // mathematically impossible but guard anyway
            // Maximum true anomaly before asymptote (exclusive)
            const nuMax = Math.acos(-1 / e) * 0.97;
            const hyperPoints: THREE.Vector3[] = [];
            const segs = ORBIT_PREDICTION_SEGMENTS;
            const p = -a * (e * e - 1); // semi-latus rectum (positive since a<0 and e>1)
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

        // If eccentricity is very near 0, the eccentricity vector direction is
        // unreliable – fall back to a consistent reference direction in the orbit plane.
        const nearCircular = e < 1e-8;
        const effectiveE = nearCircular ? 0 : e;

        const points: THREE.Vector3[] = [];
        const segments = ORBIT_PREDICTION_SEGMENTS;

        // Sample uniformly in TRUE anomaly (ν) rather than mean anomaly.
        // This naturally places more points near periapsis (where angular speed is highest)
        // and fewer near apoapsis, producing smooth curves for high-eccentricity orbits.
        for (let i = 0; i <= segments; i++) {
            const nu = (i / segments) * Math.PI * 2; // true anomaly 0 → 2π

            // Radius from focus: r = a(1-e²)/(1+e·cos ν)
            const cosNu = Math.cos(nu);
            const sinNu = Math.sin(nu);
            const denom = 1 + effectiveE * cosNu;
            if (denom <= 1e-10) continue; // shouldn't happen for e<1
            const radius = a * (1 - effectiveE * effectiveE) / denom;

            // Perifocal coordinates
            const xP = radius * cosNu;
            const yP = radius * sinNu;

            // Transform from perifocal frame to world coordinates
            const pos = new THREE.Vector3()
                .addScaledVector(xPeri, xP)
                .addScaledVector(yPeri, yP)
                .add(primary.mesh.position);

            points.push(pos);
        }

        return points;
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

            // Skip stars – they are the primaries, not orbiters
            if (body.bodyType & BodyTypeEnum.Star) continue;

            const primary = this.findPrimary(body, bodies);
            if (!primary) continue;

            const points = this.computeOrbitPoints(body, primary, gMultiplier);
            if (!points || points.length < 3) continue;

            activeIds.add(body.id);

            let line = this.lines.get(body.id);

            if (!line) {
                // Create a new line with fixed-size buffer (ORBIT_PREDICTION_SEGMENTS+1 points)
                const bufLen = (ORBIT_PREDICTION_SEGMENTS + 1) * 3;
                const positions = new Float32Array(bufLen);
                const geo = new THREE.BufferGeometry();
                geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                geo.setDrawRange(0, 0);

                const mat = new THREE.LineBasicMaterial({
                    color: ORBIT_PREDICTION_COLOR,
                    transparent: true,
                    opacity: ORBIT_PREDICTION_OPACITY,
                    depthTest: false,
                    depthWrite: false,
                });

                line = new THREE.Line(geo, mat);
                line.frustumCulled = false;
                line.renderOrder = 5;
                line.visible = this._visible;
                this.scene.add(line);
                this.lines.set(body.id, line);
            }

            // Update geometry positions
            const posAttr = line.geometry.attributes.position;
            const array = posAttr.array as Float32Array;
            const count = points.length;

            for (let i = 0; i < count; i++) {
                const worldPos = points[i];
                array[i * 3] = worldPos.x;
                array[i * 3 + 1] = worldPos.y;
                array[i * 3 + 2] = worldPos.z;
            }

            posAttr.needsUpdate = true;
            line.geometry.setDrawRange(0, count);
            line.geometry.computeBoundingSphere();
            line.visible = true;
        }

        // Remove lines for bodies that no longer exist or have no valid orbit
        for (const [id, line] of this.lines.entries()) {
            if (!activeIds.has(id)) {
                this.scene.remove(line);
                line.geometry.dispose();
                const mat = line.material;
                if (mat && !Array.isArray(mat)) {
                    mat.dispose();
                }
                this.lines.delete(id);
            }
        }
    }

    /** Clean up all prediction lines. */
    dispose(): void {
        for (const [, line] of this.lines.entries()) {
            this.scene.remove(line);
            line.geometry.dispose();
            const mat = line.material;
            if (Array.isArray(mat)) {
                (mat as THREE.Material[]).forEach((m) => m.dispose());
            } else {
                (mat as THREE.Material).dispose();
            }
        }
        this.lines.clear();
    }
}
