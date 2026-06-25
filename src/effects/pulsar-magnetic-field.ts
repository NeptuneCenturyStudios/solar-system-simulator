import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import { settingsStore } from '../settings/settings-store';

/**
 * Number of azimuthal loops evenly spaced around the magnetic axis.
 * Each loop traces one closed dipole field line at a different azimuthal angle.
 */
const FIELD_LOOP_COUNT = 8;

/**
 * Number of θ steps used to sample each dipole field line for geometry.
 * θ ∈ [0, π] maps from north pole → equatorial bulge → south pole.
 */
const FIELD_LINE_STEPS = 64;

/** Total particle pool size distributed across all loops. */
const FIELD_PARTICLE_COUNT = 320;

/** How quickly particles travel along their field line (θ radians per sim-second). */
const FIELD_PARTICLE_SPEED = 0.8;

/**
 * Multiplier applied to the host radius to derive the equatorial max radius of the
 * field loops. A larger value makes the dipole reach further from the pulsar.
 */
const FIELD_LOOP_RADIUS_MULT = 20;

/**
 * Renders the closed dipole magnetic field lines of a pulsar.
 *
 * Each field line follows the ideal dipole curve r(θ) = R_max · sin²(θ),
 * where θ runs from 0 (north pole) to π (south pole) and R_max is the
 * equatorial maximum reach. Multiple lines are placed at evenly-spaced
 * azimuthal angles around the magnetic axis.
 *
 * The magnetic axis shares the same orientation logic as PulsarBeam:
 *  - Offset 10–45° from the spin (rotation) axis
 *  - Precesses (spins) around the rotation axis as the pulsar rotates
 *
 * **Particles mode** (settingsStore.settings.particleEffectsEnabled = true):
 *  Small particles travel continuously along each field line, with colour
 *  lerping from blue at the equatorial bulge to near-white at the poles.
 *
 * **Lines fallback** (particleEffectsEnabled = false):
 *  A set of BufferGeometry line curves, rewritten in-place each frame so
 *  they follow the spinning magnetic axis without allocation.
 */
export class PulsarMagneticField implements IEffect {
    dependencies: IStateDependencies;
    active: boolean = true;

    private scene: THREE.Scene;
    private position: THREE.Vector3;
    private radius: number;
    private rotationAxis: THREE.Vector3;
    private rotationSpeed: number;

    /** Magnetic axis in its initial orientation (before any spin phase is applied). */
    private magneticAxisBase: THREE.Vector3;

    /** Accumulates spin angle over time (radians). */
    private spinPhase: number = 0;

    /** Maximum equatorial radius of field loops. */
    private fieldLoopRadius: number;

    // ── Particle mode ─────────────────────────────────────────────────────────
    private _particlePoints: THREE.Points | null = null;
    private _particleGeo: THREE.BufferGeometry | null = null;
    private _particleMat: THREE.PointsMaterial | null = null;
    /** θ position along field line [0, π] for each particle. */
    private _particleTheta: Float32Array = new Float32Array(0);
    /** Index of the azimuthal loop each particle belongs to [0, FIELD_LOOP_COUNT). */
    private _particleLoop: Uint8Array = new Uint8Array(0);

    // ── Line fallback mode ────────────────────────────────────────────────────
    private _lineObjects: {
        line: THREE.Line;
        geo: THREE.BufferGeometry;
        mat: THREE.LineBasicMaterial;
    }[] = [];
    private _linesBuilt: boolean = false;

    private _lastParticlesEnabled: boolean = true;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        position: THREE.Vector3,
        radius: number,
        rotationAxis: THREE.Vector3,
        rotationSpeed: number,
        magneticAxisBase: THREE.Vector3
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this.position = position.clone();
        this.radius = radius;
        this.rotationAxis = rotationAxis.clone().normalize();
        this.rotationSpeed = rotationSpeed;
        this.fieldLoopRadius = radius * FIELD_LOOP_RADIUS_MULT;
        this.magneticAxisBase = magneticAxisBase.clone().normalize();

        this._buildParticles();
    }

    // ── IEffect ───────────────────────────────────────────────────────────────

    update(dt: number): void {
        if (!this.active) return;

        const absDt = Math.abs(dt);
        this.spinPhase += this.rotationSpeed * absDt;

        const particlesEnabled = settingsStore.settings.particleEffectsEnabled;

        // Handle mode toggle
        if (particlesEnabled !== this._lastParticlesEnabled) {
            this._lastParticlesEnabled = particlesEnabled;
            if (!particlesEnabled) {
                this._setParticlesVisible(false);
                this._buildLines();
            } else {
                this._setParticlesVisible(true);
                this._removeLines();
            }
        }

        if (particlesEnabled) {
            this._updateParticles(absDt);
        } else {
            this._updateLines();
        }
    }

    setPosition(pos: THREE.Vector3): void {
        this.position.copy(pos);
    }

    dispose(): void {
        this.active = false;
        if (this._particlePoints) {
            this.scene.remove(this._particlePoints);
            this._particleGeo?.dispose();
            this._particleMat?.dispose();
            this._particlePoints = null;
            this._particleGeo = null;
            this._particleMat = null;
        }
        this._removeLines();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private _buildPerpendicular(v: THREE.Vector3): THREE.Vector3 {
        const perp = Math.abs(v.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
        return perp.clone().cross(v).normalize();
    }

    /** Returns the current magnetic axis direction after applying accumulated spin. */
    private _currentMagAxis(): THREE.Vector3 {
        const q = new THREE.Quaternion().setFromAxisAngle(this.rotationAxis, this.spinPhase);
        return this.magneticAxisBase.clone().applyQuaternion(q);
    }

    /**
     * Computes the world-space position of a point on a dipole field line.
     *
     * @param theta  Polar angle along the field line, θ ∈ [0, π].
     * @param loopIndex  Azimuthal loop index [0, FIELD_LOOP_COUNT).
     * @param magAxis  Current magnetic axis unit vector.
     * @param perp1  A unit vector perpendicular to magAxis.
     * @param perp2  A second unit vector perpendicular to both magAxis and perp1.
     */
    private _fieldPoint(
        theta: number,
        loopIndex: number,
        magAxis: THREE.Vector3,
        perp1: THREE.Vector3,
        perp2: THREE.Vector3,
        out: THREE.Vector3
    ): void {
        // Dipole curve: r = R_max * sin²(θ) in spherical coords aligned with magAxis
        const r = this.fieldLoopRadius * Math.sin(theta) * Math.sin(theta);
        // Azimuthal angle for this loop
        const phi = (loopIndex / FIELD_LOOP_COUNT) * 2 * Math.PI;
        // Convert (r, θ, φ) → Cartesian in the magnetic frame, then map to world axes
        // θ is polar (from magAxis), φ is azimuthal (around magAxis)
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);
        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);

        // Cartesian in magnetic frame: z = along magAxis, x = perp1, y = perp2
        const localX = r * sinTheta * cosPhi;
        const localY = r * sinTheta * sinPhi;
        const localZ = r * cosTheta;

        out.set(
            this.position.x + localX * perp1.x + localY * perp2.x + localZ * magAxis.x,
            this.position.y + localX * perp1.y + localY * perp2.y + localZ * magAxis.y,
            this.position.z + localX * perp1.z + localY * perp2.z + localZ * magAxis.z
        );
    }

    // ── Particle mode ─────────────────────────────────────────────────────────

    private _buildParticles(): void {
        const count = FIELD_PARTICLE_COUNT;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const alphas = new Float32Array(count);

        // Distribute particles evenly across loops and spread θ randomly
        this._particleTheta = new Float32Array(count);
        this._particleLoop = new Uint8Array(count);
        for (let i = 0; i < count; i++) {
            this._particleLoop[i] = i % FIELD_LOOP_COUNT;
            this._particleTheta[i] = Math.random() * Math.PI;
            alphas[i] = 0.8;
        }

        this._particleGeo = new THREE.BufferGeometry();
        this._particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this._particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this._particleGeo.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));

        this._particleMat = new THREE.PointsMaterial({
            size: this.radius * 0.6,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
        });

        this._particleMat.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
         attribute float alpha;
         varying float vAlpha;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                `void main() {
         vAlpha = alpha;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
         varying float vAlpha;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `void main() {
         float dist = length(gl_PointCoord - vec2(0.5));
         if (dist > 0.5) discard;
         float strength = smoothstep(0.5, 0.1, dist);`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                'gl_FragColor = vec4( outgoingLight, vAlpha * strength );'
            );
        };

        this._particlePoints = new THREE.Points(this._particleGeo, this._particleMat);
        this._particlePoints.frustumCulled = false;
        this._particlePoints.renderOrder = 998;
        this.scene.add(this._particlePoints);
    }

    private _setParticlesVisible(visible: boolean): void {
        if (this._particlePoints) {
            this._particlePoints.visible = visible;
        }
    }

    private _updateParticles(absDt: number): void {
        if (!this._particlePoints || !this._particleGeo) return;

        const magAxis = this._currentMagAxis();
        const perp1 = this._buildPerpendicular(magAxis);
        const perp2 = new THREE.Vector3().crossVectors(magAxis, perp1).normalize();

        const posArr = this._particleGeo.attributes.position.array as Float32Array;
        const colorArr = this._particleGeo.attributes.color.array as Float32Array;
        const alphaArr = this._particleGeo.attributes.alpha.array as Float32Array;

        const pt = new THREE.Vector3();

        for (let i = 0; i < FIELD_PARTICLE_COUNT; i++) {
            // Advance θ along the field line; wrap from π back to 0 for continuous loops
            this._particleTheta[i] += FIELD_PARTICLE_SPEED * absDt;
            if (this._particleTheta[i] > Math.PI) {
                this._particleTheta[i] -= Math.PI;
            }

            const theta = this._particleTheta[i];
            this._fieldPoint(theta, this._particleLoop[i], magAxis, perp1, perp2, pt);

            posArr[i * 3] = pt.x;
            posArr[i * 3 + 1] = pt.y;
            posArr[i * 3 + 2] = pt.z;

            // Color: blue (equator, theta≈π/2) → near-white (poles, theta≈0 or π)
            // |cos(θ)| = 0 at equator, 1 at poles
            const poleBlend = Math.abs(Math.cos(theta));
            // equatorial color: (0.27, 0.67, 1.0) | pole color: (0.84, 0.94, 1.0)
            colorArr[i * 3] = 0.27 + (0.84 - 0.27) * poleBlend;
            colorArr[i * 3 + 1] = 0.67 + (0.94 - 0.67) * poleBlend;
            colorArr[i * 3 + 2] = 1.0;
            alphaArr[i] = 0.7 + 0.3 * poleBlend;
        }

        (this._particleGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (this._particleGeo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
        (this._particleGeo.attributes.alpha as THREE.BufferAttribute).needsUpdate = true;
    }

    // ── Line fallback mode ────────────────────────────────────────────────────

    private _buildLines(): void {
        if (this._linesBuilt) return;
        this._linesBuilt = true;

        const vertCount = FIELD_LINE_STEPS + 1;
        const positions = new Float32Array(vertCount * 3);
        const colors = new Float32Array(vertCount * 3);

        for (let loopIdx = 0; loopIdx < FIELD_LOOP_COUNT; loopIdx++) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(positions.slice(), 3));
            geo.setAttribute('color', new THREE.BufferAttribute(colors.slice(), 3));

            const mat = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.65,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });

            const line = new THREE.Line(geo, mat);
            line.frustumCulled = false;
            line.renderOrder = 997;
            this.scene.add(line);
            this._lineObjects.push({ line, geo, mat });
        }
    }

    private _updateLines(): void {
        if (!this._linesBuilt) {
            this._buildLines();
        }

        const magAxis = this._currentMagAxis();
        const perp1 = this._buildPerpendicular(magAxis);
        const perp2 = new THREE.Vector3().crossVectors(magAxis, perp1).normalize();
        const vertCount = FIELD_LINE_STEPS + 1;
        const pt = new THREE.Vector3();

        for (let loopIdx = 0; loopIdx < FIELD_LOOP_COUNT; loopIdx++) {
            const obj = this._lineObjects[loopIdx];
            if (!obj) continue;
            const posArr = obj.geo.attributes.position.array as Float32Array;
            const colArr = obj.geo.attributes.color.array as Float32Array;

            for (let step = 0; step < vertCount; step++) {
                const theta = (step / FIELD_LINE_STEPS) * Math.PI;
                this._fieldPoint(theta, loopIdx, magAxis, perp1, perp2, pt);

                posArr[step * 3] = pt.x;
                posArr[step * 3 + 1] = pt.y;
                posArr[step * 3 + 2] = pt.z;

                const poleBlend = Math.abs(Math.cos(theta));
                colArr[step * 3] = 0.27 + (0.84 - 0.27) * poleBlend;
                colArr[step * 3 + 1] = 0.67 + (0.94 - 0.67) * poleBlend;
                colArr[step * 3 + 2] = 1.0;
            }

            (obj.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
            (obj.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
        }
    }

    private _removeLines(): void {
        for (const obj of this._lineObjects) {
            this.scene.remove(obj.line);
            obj.geo.dispose();
            obj.mat.dispose();
        }
        this._lineObjects = [];
        this._linesBuilt = false;
    }
}
