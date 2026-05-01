import * as THREE from 'three';

// Global scaling factor for siphon stream speed (tweak for visual pacing)
const SIPHON_SPEED_SCALE = 8;
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
    private blackHole: {
        mesh: THREE.Mesh;
        radius: number;
        _isDisposed: boolean;
        rotationAxis: THREE.Vector3;
        accretion?: { maxRadius: number } | null;
    };

    private geometry: THREE.BufferGeometry;
    private material: THREE.PointsMaterial;
    private points: THREE.Points;
    private spawnDirs: THREE.Vector3[];

    /** Progress along the stream [0, 1] for each particle. */
    private tArr: Float32Array;
    /** Per-particle travel speed (units of t per simulation-second). */
    private speedArr: Float32Array;

    // Accept accretion disk info if present
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        star: ISiphonTarget,
        blackHole: {
            mesh: THREE.Mesh;
            mass: number;
            radius: number;
            _isDisposed: boolean;
            rotationAxis: THREE.Vector3;
            accretion?: { maxRadius: number; vels: { radius: number; orbital: number }[] } | null;
        }
    ) {
        this.dependencies = dependencies;
        this.active = true;
        this.scene = scene;
        this.star = star;
        this.blackHole = blackHole;

        // Stagger particles across the full stream length from the start.
        this.tArr = new Float32Array(PARTICLE_COUNT);
        this.speedArr = new Float32Array(PARTICLE_COUNT);
        this.spawnDirs = [];

        // Use the actual orbital speed at the accretion disk's outer edge if available
        let diskOrbitalSpeed; // fallback default
        if (
            blackHole.accretion &&
            blackHole.accretion.vels &&
            blackHole.accretion.vels.length > 0
        ) {
            // Find the vels entry with the largest radius
            let max = blackHole.accretion.vels[0];
            for (const v of blackHole.accretion.vels) {
                if (v.radius > max.radius) max = v;
            }
            diskOrbitalSpeed = max.orbital;
        } else {
            // Fallback to previous calculation
            const accretionMaxRadius =
                blackHole.accretion && blackHole.accretion.maxRadius
                    ? blackHole.accretion.maxRadius
                    : blackHole.radius * 2 * 32;
            const bhMass = blackHole.mass || 1;
            diskOrbitalSpeed = Math.sqrt(bhMass / accretionMaxRadius) * 0.005;
        }

        // Precompute geometry for each particle to get path length for speed normalization
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            this.tArr[i] = Math.random();
            // Random direction on unit sphere for star surface
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);
            this.spawnDirs[i] = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );

            // --- Compute Bézier path length for this particle ---
            // Start: star surface
            const starCenter = star.mesh.position;
            const starRadius = star.radius;
            const spawnDir = this.spawnDirs[i];
            const start = new THREE.Vector3()
                .copy(starCenter)
                .addScaledVector(spawnDir, starRadius);

            // End: offset point on accretion disk outer edge in direction of rotation (in disk plane)
            const accretionMaxRadius =
                blackHole.accretion && blackHole.accretion.maxRadius
                    ? blackHole.accretion.maxRadius
                    : blackHole.radius * 2 * 32;
            const bhCenter = blackHole.mesh.position;
            // Direction from star to black hole
            const toBH = new THREE.Vector3().subVectors(bhCenter, starCenter).normalize();
            // Disk normal (rotation axis)
            const diskNormal = blackHole.rotationAxis
                ? blackHole.rotationAxis.clone().normalize()
                : new THREE.Vector3(0, 1, 0);
            // Project toBH onto the disk plane
            const toBH_proj = toBH
                .clone()
                .sub(diskNormal.clone().multiplyScalar(toBH.dot(diskNormal)))
                .normalize();
            // Rotate the projected vector around the disk normal by the offset angle
            const DISK_ROTATION_OFFSET = Math.PI / 2;
            const offsetDir = toBH_proj
                .clone()
                .applyAxisAngle(diskNormal, DISK_ROTATION_OFFSET)
                .normalize();
            const end = new THREE.Vector3()
                .copy(bhCenter)
                .addScaledVector(offsetDir, accretionMaxRadius);

            // Bézier mid-point: curve to merge with disk tangent at entry
            const dir = new THREE.Vector3().subVectors(end, start);
            const dist = dir.length();
            const diskTangent = new THREE.Vector3().crossVectors(diskNormal, offsetDir).normalize();
            const mergeFrac = 0.7;
            const tangentStrength = dist * 0.5;
            const midBase = new THREE.Vector3().lerpVectors(start, end, mergeFrac);
            const mid = midBase.clone().addScaledVector(diskTangent, tangentStrength);

            // Approximate Bézier curve length by sampling points
            let pathLen = 0;
            let prev = start.clone();
            const steps = 10;
            for (let j = 1; j <= steps; j++) {
                const t = j / steps;
                const s = 1.0 - t;
                const pt = new THREE.Vector3(
                    s * s * start.x + 2 * s * t * mid.x + t * t * end.x,
                    s * s * start.y + 2 * s * t * mid.y + t * t * end.y,
                    s * s * start.z + 2 * s * t * mid.z + t * t * end.z
                );
                pathLen += pt.distanceTo(prev);
                prev = pt;
            }
            // Set stream speed to match disk orbital speed visually
            this.speedArr[i] = SIPHON_SPEED_SCALE * (diskOrbitalSpeed / pathLen) * (0.95 + Math.random() * 0.1);
        }

        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        this.material = new THREE.PointsMaterial({
            size: 4 * blackHole.radius,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0.95,
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
        // We'll compute start/end/mid for each particle

        // Star corona colour (source end of the stream).
        const starR = this.star.baseColor.r;
        const starG = this.star.baseColor.g;
        const starB = this.star.baseColor.b;

        // Angle offset in radians for disk rotation (clockwise = negative)
        const DISK_ROTATION_OFFSET = Math.PI / 2; // 90 degrees, adjust as needed
        const posArr = this.geometry.attributes.position.array as Float32Array;
        const colArr = this.geometry.attributes.color.array as Float32Array;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            this.tArr[i] += this.speedArr[i] * absDt;
            if (this.tArr[i] >= 1.0) {
                // Respawn just beyond the star so the stream is continuous.
                this.tArr[i] = Math.random() * 0.05;
                // New random direction for next spawn
                const theta = Math.random() * 2 * Math.PI;
                const phi = Math.acos(2 * Math.random() - 1);
                this.spawnDirs[i] = new THREE.Vector3(
                    Math.sin(phi) * Math.cos(theta),
                    Math.cos(phi),
                    Math.sin(phi) * Math.sin(theta)
                );
            }

            // Start: star surface
            const starCenter = this.star.mesh.position;
            const starRadius = this.star.radius;
            const spawnDir = this.spawnDirs[i];
            const start = new THREE.Vector3()
                .copy(starCenter)
                .addScaledVector(spawnDir, starRadius);

            // End: offset point on accretion disk outer edge in direction of rotation (in disk plane)
            const accretionMaxRadius =
                this.blackHole.accretion && this.blackHole.accretion.maxRadius
                    ? this.blackHole.accretion.maxRadius
                    : this.blackHole.radius * 2 * 32;
            const bhCenter = this.blackHole.mesh.position;
            // Direction from star to black hole
            const toBH = new THREE.Vector3().subVectors(bhCenter, starCenter).normalize();
            // Disk normal (rotation axis)
            const diskNormal = this.blackHole.rotationAxis
                ? this.blackHole.rotationAxis.clone().normalize()
                : new THREE.Vector3(0, 1, 0);
            // Project toBH onto the disk plane
            const toBH_proj = toBH
                .clone()
                .sub(diskNormal.clone().multiplyScalar(toBH.dot(diskNormal)))
                .normalize();
            // Rotate the projected vector around the disk normal by the offset angle
            const offsetDir = toBH_proj
                .clone()
                .applyAxisAngle(diskNormal, DISK_ROTATION_OFFSET)
                .normalize();
            const end = new THREE.Vector3()
                .copy(bhCenter)
                .addScaledVector(offsetDir, accretionMaxRadius);

            // Bézier mid-point: curve to merge with disk tangent at entry
            const dir = new THREE.Vector3().subVectors(end, start);
            const dist = dir.length();
            // Disk tangent at entry: cross(diskNormal, offsetDir) (direction of disk rotation)
            const diskTangent = new THREE.Vector3().crossVectors(diskNormal, offsetDir).normalize();
            // Place mid-point closer to the disk, offset along the tangent for a smooth merge
            const mergeFrac = 0.7; // 0 = at start, 1 = at end; closer to disk for sharper merge
            const tangentStrength = dist * 0.5; // adjust for more/less curve
            const midBase = new THREE.Vector3().lerpVectors(start, end, mergeFrac);
            const mid = midBase.clone().addScaledVector(diskTangent, tangentStrength);

            const t = this.tArr[i];
            const s = 1.0 - t;

            // Quadratic Bézier: P = s²·start + 2·s·t·mid + t²·end
            posArr[i * 3] = s * s * start.x + 2 * s * t * mid.x + t * t * end.x;
            posArr[i * 3 + 1] = s * s * start.y + 2 * s * t * mid.y + t * t * end.y;
            posArr[i * 3 + 2] = s * s * start.z + 2 * s * t * mid.z + t * t * end.z;

            // Colour: star base colour → BH accretion outer orange/red.
            colArr[i * 3] = starR + (BH_R - starR) * t;
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
