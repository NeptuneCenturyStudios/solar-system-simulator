import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies, ISiphonTarget } from '../interfaces';

const PARTICLE_COUNT = 300;

// Accretion disk outer colour — particles arriving at the black hole take this colour.
const BH_R = 0.8;
const BH_G = 0.2;
const BH_B = 0.05;

/**
 * Renders a curved particle stream flowing from a star to a black hole's accretion disk.
 * One instance is created per (black hole, star) pair while the star is within siphon range.
 *
 * Path shape: quadratic Bézier with a perpendicular mid-point offset so the stream arcs
 * visually around the black hole (matching the tidal-stream look in the reference image).
 *
 * Particle colour lerps from the star's corona/base colour (t=0) to the BH accretion
 * outer colour (t=1) so each stream naturally reflects its source star's temperature.
 */
export class MassSiphonEffect implements IEffect {
    dependencies: IStateDependencies;
    active: boolean;

    private scene: THREE.Scene;
    private star: ISiphonTarget;
    private blackHole: { mesh: THREE.Mesh; radius: number; _isDisposed: boolean };

    private geometry: THREE.BufferGeometry;
    private material: THREE.PointsMaterial;
    private points: THREE.Points;

    /** Progress along the stream [0, 1] for each particle. */
    private tArr: Float32Array;
    /** Per-particle travel speed (units of t per simulation-second). */
    private speedArr: Float32Array;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        star: ISiphonTarget,
        blackHole: { mesh: THREE.Mesh; radius: number; _isDisposed: boolean }
    ) {
        this.dependencies = dependencies;
        this.active = true;
        this.scene = scene;
        this.star = star;
        this.blackHole = blackHole;

        // Stagger particles across the full stream length from the start.
        this.tArr = new Float32Array(PARTICLE_COUNT);
        this.speedArr = new Float32Array(PARTICLE_COUNT);
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            this.tArr[i] = Math.random();
            // Stream travel time varies ~8–20 simulation-seconds to spread density.
            this.speedArr[i] = 0.05 + Math.random() * 0.095;
        }

        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        this.material = new THREE.PointsMaterial({
            size: 6,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0.85,
            sizeAttenuation: true,
            depthWrite: false,
        });

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        scene.add(this.points);
    }

    update(dt: number): void {
        if (this.star._isDisposed || this.blackHole._isDisposed) {
            this.active = false;
            return;
        }

        const absDt = Math.abs(dt);
        const startPos = this.star.mesh.position;
        const endPos = this.blackHole.mesh.position;

        // Bézier mid-point: perpendicular offset creates an arc like a tidal stream.
        const dir = new THREE.Vector3().subVectors(endPos, startPos);
        const dist = dir.length();
        const midBase = new THREE.Vector3()
            .addVectors(startPos, endPos)
            .multiplyScalar(0.5);

        // Perpendicular to the star→BH direction in the XZ plane (with Y fallback).
        const up = new THREE.Vector3(0, 1, 0);
        const perp = new THREE.Vector3().crossVectors(dir, up);
        if (perp.lengthSq() < 1e-6) {
            perp.set(1, 0, 0);
        } else {
            perp.normalize();
        }
        const midPos = midBase.clone().addScaledVector(perp, dist * 0.35);

        // Star corona colour (source end of the stream).
        const starR = this.star.baseColor.r;
        const starG = this.star.baseColor.g;
        const starB = this.star.baseColor.b;

        const posArr = this.geometry.attributes.position.array as Float32Array;
        const colArr = this.geometry.attributes.color.array as Float32Array;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            this.tArr[i] += this.speedArr[i] * absDt;
            if (this.tArr[i] >= 1.0) {
                // Respawn just beyond the star so the stream is continuous.
                this.tArr[i] = Math.random() * 0.05;
            }

            const t = this.tArr[i];
            const s = 1.0 - t;

            // Quadratic Bézier: P = s²·start + 2·s·t·mid + t²·end
            posArr[i * 3]     = s * s * startPos.x + 2 * s * t * midPos.x + t * t * endPos.x;
            posArr[i * 3 + 1] = s * s * startPos.y + 2 * s * t * midPos.y + t * t * endPos.y;
            posArr[i * 3 + 2] = s * s * startPos.z + 2 * s * t * midPos.z + t * t * endPos.z;

            // Colour: star base colour → BH accretion outer orange/red.
            colArr[i * 3]     = starR + (BH_R - starR) * t;
            colArr[i * 3 + 1] = starG + (BH_G - starG) * t;
            colArr[i * 3 + 2] = starB + (BH_B - starB) * t;
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
    }

    dispose(): void {
        this.scene.remove(this.points);
        this.geometry.dispose();
        this.material.dispose();
        this.active = false;
    }
}
