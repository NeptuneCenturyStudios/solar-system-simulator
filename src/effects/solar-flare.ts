import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import { performanceSettings } from '../utilities/consts';

export type SolarFlareType = 'small' | 'large';

/**
 * SolarFlare — randomised eruption effect that plays on a star's surface.
 *
 * Two types:
 *   'small' — 200-particle cone burst, particles travel outward from a random
 *             surface point within a ~45° half-angle cone. Duration ~3 s.
 *   'large' — 400-particle quadratic-bezier arc loop. Particles travel from
 *             surface point A, up through a raised control point, back down to
 *             surface point B (~60° away). Duration ~5 s.
 *
 * For 'large' flares the arc is stored in star-local space and reconstructed
 * each frame using the live `starMeshPosition` reference, so the arc correctly
 * tracks a moving star.
 */
export class SolarFlare implements IEffect {
    dependencies: IStateDependencies;
    active: boolean;

    private scene: THREE.Scene;
    private type: SolarFlareType;
    private age: number;
    private duration: number;
    private count: number;
    private geometry: THREE.BufferGeometry;
    private material: THREE.PointsMaterial;
    private points: THREE.Points;
    private positions: Float32Array;
    private colors: Float32Array;

    // per-particle life value (0→1), used by the shader for fade-in/out
    private lives: Float32Array = new Float32Array(0);

    // small-flare state
    private velocities: THREE.Vector3[] | null = null;

    // large-flare state — arc points in star-local space
    private starPosRef: THREE.Vector3 | null = null;
    private arcA_local: THREE.Vector3 | null = null;
    private arcB_local: THREE.Vector3 | null = null;
    private arcC_local: THREE.Vector3 | null = null;
    private speeds: Float32Array | null = null;
    // per-particle world-space scatter offset (applied × sin(t*PI) in update)
    private arcOffsets: Float32Array | null = null;

    // corona color components (extracted from colorHex at construction)
    private _cr: number;
    private _cg: number;
    private _cb: number;

    // reusable temporaries (avoids per-frame allocations)
    private readonly _wA = new THREE.Vector3();
    private readonly _wB = new THREE.Vector3();
    private readonly _wC = new THREE.Vector3();

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        /** Pass `star.mesh.position` directly so the large arc tracks a moving star. */
        starMeshPosition: THREE.Vector3,
        starRadius: number,
        type: SolarFlareType,
        colorHex: number
    ) {
        this.dependencies = dependencies;
        this.active = true;
        this.scene = scene;
        this.type = type;
        this.age = 0;

        const _c = new THREE.Color(colorHex);
        this._cr = _c.r;
        this._cg = _c.g;
        this._cb = _c.b;

        const scaleFactor = starRadius / 80;
        // snapshot of star position at construction time (used to convert arc to local space)
        const starPosSnap = starMeshPosition.clone();

        // ── SMALL FLARE ─────────────────────────────────────────────────────────
        if (type === 'small') {
            this.count = 200;
            this.duration = 3.0;
            this.positions = new Float32Array(this.count * 3);
            this.colors = new Float32Array(this.count * 3);
            this.lives = new Float32Array(this.count);
            this.velocities = [];

            const nTheta = Math.random() * Math.PI * 2;
            const nPhi = Math.acos(Math.random() * 2 - 1);
            const surfaceNormal = new THREE.Vector3(
                Math.sin(nPhi) * Math.cos(nTheta),
                Math.sin(nPhi) * Math.sin(nTheta),
                Math.cos(nPhi)
            );
            const surfacePoint = starPosSnap.clone().addScaledVector(surfaceNormal, starRadius);

            // perpendicular axes for cone sampling
            const perpA = new THREE.Vector3();
            if (Math.abs(surfaceNormal.x) < 0.9) {
                perpA.crossVectors(surfaceNormal, new THREE.Vector3(1, 0, 0)).normalize();
            } else {
                perpA.crossVectors(surfaceNormal, new THREE.Vector3(0, 1, 0)).normalize();
            }
            const perpB = new THREE.Vector3().crossVectors(surfaceNormal, perpA);

            for (let i = 0; i < this.count; i++) {
                this.positions[i * 3] = surfacePoint.x;
                this.positions[i * 3 + 1] = surfacePoint.y;
                this.positions[i * 3 + 2] = surfacePoint.z;

                // uniform distribution within 45° half-angle cone
                const coneAngle = (Math.PI / 4) * Math.sqrt(Math.random());
                const rotAngle = Math.random() * Math.PI * 2;
                const dir = surfaceNormal
                    .clone()
                    .multiplyScalar(Math.cos(coneAngle))
                    .addScaledVector(perpA, Math.sin(coneAngle) * Math.cos(rotAngle))
                    .addScaledVector(perpB, Math.sin(coneAngle) * Math.sin(rotAngle))
                    .normalize();

                const speed = scaleFactor * (0.5 + Math.random() * 0.5);
                this.velocities.push(dir.multiplyScalar(speed));

                // start white-hot; update() blends toward corona color
                this.colors[i * 3] = 1.0;
                this.colors[i * 3 + 1] = 1.0;
                this.colors[i * 3 + 2] = 1.0;
            }

            // ── LARGE ARC FLARE ─────────────────────────────────────────────────────
        } else {
            this.count = 400;
            this.duration = 5.0;
            this.positions = new Float32Array(this.count * 3);
            this.colors = new Float32Array(this.count * 3);
            this.lives = new Float32Array(this.count);
            this.speeds = new Float32Array(this.count);
            this.starPosRef = starMeshPosition; // live reference — not a clone

            // surface point A
            const thetaA = Math.random() * Math.PI * 2;
            const phiA = Math.acos(Math.random() * 2 - 1);
            const dirA = new THREE.Vector3(
                Math.sin(phiA) * Math.cos(thetaA),
                Math.sin(phiA) * Math.sin(thetaA),
                Math.cos(phiA)
            );
            const arcA_world = starPosSnap.clone().addScaledVector(dirA, starRadius);

            // perpendicular axes for dirA
            const perpA2 = new THREE.Vector3();
            if (Math.abs(dirA.x) < 0.9) {
                perpA2.crossVectors(dirA, new THREE.Vector3(1, 0, 0)).normalize();
            } else {
                perpA2.crossVectors(dirA, new THREE.Vector3(0, 1, 0)).normalize();
            }
            const perpB2 = new THREE.Vector3().crossVectors(dirA, perpA2);

            // surface point B — 45°–75° away from A on the sphere
            const sepAngle = Math.PI / 3 + (Math.random() - 0.5) * (Math.PI / 6);
            const rotAngleB = Math.random() * Math.PI * 2;
            const dirB = dirA
                .clone()
                .multiplyScalar(Math.cos(sepAngle))
                .addScaledVector(perpA2, Math.sin(sepAngle) * Math.cos(rotAngleB))
                .addScaledVector(perpB2, Math.sin(sepAngle) * Math.sin(rotAngleB))
                .normalize();
            const arcB_world = starPosSnap.clone().addScaledVector(dirB, starRadius);

            // control point C — above midpoint, 1.5×–2.5× radius above surface
            const midDir = dirA.clone().add(dirB).normalize();
            const arcHeight = starRadius * (1.5 + Math.random() * 1.0);
            const arcC_world = starPosSnap.clone().addScaledVector(midDir, starRadius + arcHeight);

            // store in local space so the arc follows a moving star
            this.arcA_local = arcA_world.sub(starPosSnap);
            this.arcB_local = arcB_world.sub(starPosSnap);
            this.arcC_local = arcC_world.sub(starPosSnap);

            // Two axes perpendicular to midDir for tube scatter
            const scatterAxis1 = new THREE.Vector3();
            if (Math.abs(midDir.x) < 0.9) {
                scatterAxis1.crossVectors(midDir, new THREE.Vector3(1, 0, 0)).normalize();
            } else {
                scatterAxis1.crossVectors(midDir, new THREE.Vector3(0, 1, 0)).normalize();
            }
            const scatterAxis2 = new THREE.Vector3().crossVectors(midDir, scatterAxis1);
            const scatterRadius = starRadius * 0.3;

            this.arcOffsets = new Float32Array(this.count * 3);
            for (let i = 0; i < this.count; i++) {
                const angle = Math.random() * Math.PI * 2;
                const r = Math.sqrt(Math.random()) * scatterRadius; // uniform disk distribution
                this.arcOffsets[i * 3] =
                    (scatterAxis1.x * Math.cos(angle) + scatterAxis2.x * Math.sin(angle)) * r;
                this.arcOffsets[i * 3 + 1] =
                    (scatterAxis1.y * Math.cos(angle) + scatterAxis2.y * Math.sin(angle)) * r;
                this.arcOffsets[i * 3 + 2] =
                    (scatterAxis1.z * Math.cos(angle) + scatterAxis2.z * Math.sin(angle)) * r;
            }

            for (let i = 0; i < this.count; i++) {
                const startPt = this.starPosRef.clone().add(this.arcA_local);
                this.positions[i * 3] = startPt.x;
                this.positions[i * 3 + 1] = startPt.y;
                this.positions[i * 3 + 2] = startPt.z;
                // stagger speeds so particles arrive at different times
                this.speeds[i] = 0.15 + Math.random() * 0.15;
                // start at corona color; update() brightens toward white at arc peak
                this.colors[i * 3] = this._cr;
                this.colors[i * 3 + 1] = this._cg;
                this.colors[i * 3 + 2] = this._cb;
            }
        }

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.geometry.setAttribute('life', new THREE.BufferAttribute(this.lives, 1));

        this.material = new THREE.PointsMaterial({
            size: (type === 'small' ? 3.5 : 5.0) * scaleFactor,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true,
        });

        this.material.onBeforeCompile = (shader) => {
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
        attribute float life;
        varying float vLife;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                `void main() {
        vLife = life;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
        varying float vLife;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `void main() {
        float dist = length(gl_PointCoord - vec2(0.5));
        if (dist > 0.5) discard;
        float strength = smoothstep(0.5, 0.0, dist);
        float lifeFade = sin(vLife * 3.14159265);`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                'gl_FragColor = vec4(outgoingLight, lifeFade * strength * 0.9);'
            );
        };

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        scene.add(this.points);
    }

    update(dt: number): void {
        if (!this.active) return;
        // Check if particles are enabled
        if (!performanceSettings.particleEffectsEnabled) {
            this.points.visible = false;
            return;
        } else {
            this.points.visible = true;
        }

        dt = Math.abs(dt);
        this.age += dt;

        const lifeFrac = this.age / this.duration;
        if (lifeFrac >= 1.0) {
            this.active = false;
            return;
        }

        const posAttr = this.geometry.attributes.position as THREE.BufferAttribute;
        const colAttr = this.geometry.attributes.color as THREE.BufferAttribute;
        const lifeAttr = this.geometry.attributes.life as THREE.BufferAttribute;
        const p = posAttr.array as Float32Array;
        const c = colAttr.array as Float32Array;
        const l = lifeAttr.array as Float32Array;

        if (this.type === 'small' && this.velocities) {
            for (let i = 0; i < this.count; i++) {
                p[i * 3] += this.velocities[i].x * (dt * 60);
                p[i * 3 + 1] += this.velocities[i].y * (dt * 60);
                p[i * 3 + 2] += this.velocities[i].z * (dt * 60);

                // life uniform across all particles — shader's sin(vLife*PI) fades in then out
                l[i] = lifeFrac;

                // white-hot at birth → corona color as it cools
                const blend = Math.min(1.0, lifeFrac * 2.5);
                c[i * 3] = 1.0 + blend * (this._cr - 1.0);
                c[i * 3 + 1] = 1.0 + blend * (this._cg - 1.0);
                c[i * 3 + 2] = 1.0 + blend * (this._cb - 1.0);
            }
        } else if (
            this.type === 'large' &&
            this.speeds &&
            this.starPosRef &&
            this.arcA_local &&
            this.arcB_local &&
            this.arcC_local
        ) {
            // world-space arc endpoints (track star movement via live ref)
            this._wA.addVectors(this.starPosRef, this.arcA_local);
            this._wB.addVectors(this.starPosRef, this.arcB_local);
            this._wC.addVectors(this.starPosRef, this.arcC_local);

            for (let i = 0; i < this.count; i++) {
                const t = Math.min(1.0, this.age * this.speeds[i]);
                const mt = 1 - t;

                // quadratic bezier: A → C → B, plus per-particle scatter (max at arc peak)
                const scatter = Math.sin(t * Math.PI);
                p[i * 3] =
                    mt * mt * this._wA.x +
                    2 * mt * t * this._wC.x +
                    t * t * this._wB.x +
                    this.arcOffsets![i * 3] * scatter;
                p[i * 3 + 1] =
                    mt * mt * this._wA.y +
                    2 * mt * t * this._wC.y +
                    t * t * this._wB.y +
                    this.arcOffsets![i * 3 + 1] * scatter;
                p[i * 3 + 2] =
                    mt * mt * this._wA.z +
                    2 * mt * t * this._wC.z +
                    t * t * this._wB.z +
                    this.arcOffsets![i * 3 + 2] * scatter;

                // per-particle life = t so each particle fades in as it departs and out as it arrives
                l[i] = t;

                // corona color near surface, white-hot at arc peak
                const arcFrac = Math.sin(t * Math.PI);
                c[i * 3] = this._cr + arcFrac * (1.0 - this._cr);
                c[i * 3 + 1] = this._cg + arcFrac * (1.0 - this._cg);
                c[i * 3 + 2] = this._cb + arcFrac * (1.0 - this._cb);
            }
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        lifeAttr.needsUpdate = true;
    }

    dispose(): void {
        this.scene.remove(this.points);
        this.geometry.dispose();
        this.material.dispose();
        this.active = false;
    }
}
