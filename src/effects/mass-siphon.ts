import * as THREE from 'three';

// Global scaling factor for siphon stream speed (tweak for visual pacing)
const SIPHON_SPEED_SCALE = 8;
import { IPipelineFeedEffect } from './effect-base';
import { IStateDependencies, ISiphonTarget, IAccretionTarget } from '../interfaces';
import { MIN_PARTICLE_ALPHA, MAX_PARTICLE_ALPHA, performanceSettings } from '../utilities/consts';

/** Maximum number of simultaneously in-flight siphon particles per stream. */
const PARTICLE_COUNT = 800;

/** Particles spawned per simulation-second while the siphon is active. */
const SIPHON_SPAWN_RATE = 20;
/** Maximum particles spawned in a single update() call regardless of dt (guards against high time-scale bursts). */
const SIPHON_MAX_SPAWN_PER_FRAME = 5;

/** Default accretion disk arrival colour (dark orange/red for black holes). */
const DEFAULT_ARRIVAL_COLOR = { r: 0.8, g: 0.2, b: 0.05 };

/**
 * Renders a curved particle stream flowing from a star to a black hole's accretion disk.
 * One instance is created per (black hole, star) pair while the star is within siphon range.
 *
 * Path shape: quadratic Bézier with a perpendicular mid-point offset so the stream arcs
 * visually around the black hole (matching the tidal-stream look in the reference image).
 *
 * Particles spawn continuously at SIPHON_SPAWN_RATE per second while `isSpawning` is true.
 * When a particle reaches t = 1 (the accretion disk outer edge) it fires `onParticleArrived`
 * with the disk entry angle, then its slot is freed. No particle ever respawns on its own.
 *
 * Calling `stopSpawning()` halts new spawns; the effect sets `active = false` automatically
 * once every in-flight particle has been handed off downstream.
 *
 * Particle colour lerps from the star's corona/base colour (t=0) to the accretion disk
 * outer colour (t=1) so each stream naturally reflects its source star's temperature and
 * the consuming body's disk color preset.
 */
export class MassSiphonEffect implements IPipelineFeedEffect {
    dependencies: IStateDependencies;
    active: boolean;

    private _isSpawning: boolean = true;
    get isSpawning(): boolean {
        return this._isSpawning;
    }

    /** Stop spawning new particles. Existing in-flight particles continue draining. */
    stopSpawning(): void {
        this._isSpawning = false;
    }

    private scene: THREE.Scene;
    private star: ISiphonTarget;
    private consumer: IAccretionTarget;
    /** Arrival colour at the disk outer edge (t=1). Defaults to dark orange/red. */
    private arrivalColor: { r: number; g: number; b: number };

    private geometry: THREE.BufferGeometry;
    private material: THREE.PointsMaterial;
    private points: THREE.Points;
    private spawnDirs: THREE.Vector3[];

    /** Bézier line shown in place of particles when particle effects are disabled. */
    private _bezierLine: THREE.Line | null = null;
    private _bezierLineGeo: THREE.BufferGeometry | null = null;
    private _bezierLineMat: THREE.LineBasicMaterial | null = null;
    /** Tracks last-known particle effects state to detect toggling. */
    private _lastParticlesEnabled: boolean = true;

    /** Progress along the stream [0, 1] for each particle. */
    private tArr: Float32Array;
    /** Per-particle travel speed (units of t per simulation-second). */
    private speedArr: Float32Array;
    /** 1 = slot is occupied by a live particle, 0 = slot is free. */
    private activeFlags: Uint8Array;
    /** Accumulates fractional spawn tokens between frames. */
    private spawnAccumulator: number = 0;
    /**
     * Called with the disk-entry angle (radians) whenever a siphon particle reaches the
     * accretion disk outer edge. Provided by the BlackHole that owns this effect.
     */
    private onParticleArrived: (angle: number) => void;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        star: ISiphonTarget,
        consumer: IAccretionTarget,
        onParticleArrived: (angle: number) => void,
        /** Optional override for the arrival colour at the disk outer edge. */
        diskArrivalColor?: { r: number; g: number; b: number }
    ) {
        this.dependencies = dependencies;
        this.active = true;
        this.scene = scene;
        this.star = star;
        this.consumer = consumer;
        this.arrivalColor = diskArrivalColor ?? DEFAULT_ARRIVAL_COLOR;
        this.onParticleArrived = onParticleArrived;

        this.tArr = new Float32Array(PARTICLE_COUNT);
        this.speedArr = new Float32Array(PARTICLE_COUNT);
        this.activeFlags = new Uint8Array(PARTICLE_COUNT); // all 0 = all inactive
        this.spawnDirs = [];

        // Derive the target speed at the accretion disk outer edge from Keplerian physics.
        // The vels-based approach is no longer valid because all accretion slots are
        // initialised to { orbital: 0 } under the pipeline model and are only populated
        // when particles are injected — so reading from vels would always give 0.
        const accretionMaxRadius =
            consumer.accretionDisk && consumer.accretionDisk.maxRadius
                ? consumer.accretionDisk.maxRadius
                : consumer.radius * 2 * 32;
        const bhMass = consumer.mass || 1;
        const diskOrbitalSpeed = Math.sqrt(bhMass / accretionMaxRadius) * 0.005;

        // Pre-compute per-slot spawn direction and speed (path length for speed normalisation).
        for (let i = 0; i < PARTICLE_COUNT; i++) {
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
                consumer.accretionDisk && consumer.accretionDisk.maxRadius
                    ? consumer.accretionDisk.maxRadius
                    : consumer.radius * 2 * 32;
            const bhCenter = consumer.mesh.position;
            // Direction from star to black hole
            const toBH = new THREE.Vector3().subVectors(bhCenter, starCenter).normalize();
            // Disk normal (rotation axis)
            const diskNormal = consumer.rotationAxis
                ? consumer.rotationAxis.clone().normalize()
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
            this.speedArr[i] =
                SIPHON_SPEED_SCALE * (diskOrbitalSpeed / pathLen) * (0.5 + Math.random() * 1.0);
        }

        const positions = new Float32Array(PARTICLE_COUNT * 3);
        const colors = new Float32Array(PARTICLE_COUNT * 3);
        const alphas = new Float32Array(PARTICLE_COUNT); // per-particle alpha — all start at 0

        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        this.geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1));
        // Add per-particle t attribute for progress along the stream
        const tVals = new Float32Array(PARTICLE_COUNT);
        this.geometry.setAttribute('tval', new THREE.BufferAttribute(tVals, 1));

        this.material = new THREE.PointsMaterial({
            sizeAttenuation: true, // Sizes scale with depth so particles grow when zoomed in
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            vertexColors: true,
        });

        this.material.onBeforeCompile = (shader) => {
            // 1. Add your custom uniforms
            shader.uniforms.pointSize = { value: 2 * consumer.radius };
            shader.uniforms.sizeNearStar = { value: 8 * consumer.radius };
            shader.uniforms.BRIGHTNESS = { value: 2.0 };

            // 2. Vertex Shader: Custom Size & Alpha Injection
            shader.vertexShader =
                `
                attribute float alpha;
                attribute float tval;
                varying float vAlpha;
                uniform float pointSize;
                uniform float sizeNearStar;
            ` + shader.vertexShader;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                vAlpha = alpha;`
            );

            // Replace the default size logic with your mix() logic
            shader.vertexShader = shader.vertexShader.replace(
                'gl_PointSize = size;',
                'gl_PointSize = mix(sizeNearStar, pointSize, tval);'
            );

            // 3. Fragment Shader: The "Square Killer" & Alpha Gradient
            shader.fragmentShader =
                `
                varying float vAlpha;
                uniform float BRIGHTNESS;
            ` + shader.fragmentShader;

            // Use a regex-style replace to ensure we hit the right main() block
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    if (dist > 0.5) discard; // This KILLS the squares seen in image_823d61.jpg
                    float mask = 1.0 - smoothstep(0.4, 0.5, dist);`
            );

            // Force the final color to use your brightness and the CPU-sent alpha gradient.
            // This version of Three.js uses #include <opaque_fragment> (not <output_fragment>).
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                'gl_FragColor = vec4( outgoingLight * BRIGHTNESS, vAlpha * mask );'
            );
        };

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        this.points.renderOrder = 20; // render after the star (higher value)
        scene.add(this.points);
    }

    // ── Bézier line helpers (particle-effects-off fallback) ──────────────────

    private _buildBezierPoints(): THREE.Vector3[] {
        const starCenter = this.star.mesh.position;
        const starRadius = this.star.radius;
        const bhCenter = this.consumer.mesh.position;
        const diskNormal = this.consumer.rotationAxis
            ? this.consumer.rotationAxis.clone().normalize()
            : new THREE.Vector3(0, 1, 0);
        const accretionMaxRadius =
            this.consumer.accretionDisk && this.consumer.accretionDisk.maxRadius
                ? this.consumer.accretionDisk.maxRadius
                : this.consumer.radius * 2 * 32;
        const toBH = new THREE.Vector3().subVectors(bhCenter, starCenter).normalize();
        const toBH_proj = toBH
            .clone()
            .sub(diskNormal.clone().multiplyScalar(toBH.dot(diskNormal)))
            .normalize();
        const DISK_ROTATION_OFFSET = Math.PI / 2;
        const offsetDir = toBH_proj
            .clone()
            .applyAxisAngle(diskNormal, DISK_ROTATION_OFFSET)
            .normalize();

        const start = starCenter.clone().addScaledVector(toBH, starRadius);
        const end = bhCenter.clone().addScaledVector(offsetDir, accretionMaxRadius);
        const dir = new THREE.Vector3().subVectors(end, start);
        const dist = dir.length();
        const diskTangent = new THREE.Vector3().crossVectors(diskNormal, offsetDir).normalize();
        const mergeFrac = 0.7;
        const tangentStrength = dist * 0.5;
        const midBase = new THREE.Vector3().lerpVectors(start, end, mergeFrac);
        const mid = midBase.clone().addScaledVector(diskTangent, tangentStrength);

        const STEPS = 48;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= STEPS; i++) {
            const t = i / STEPS;
            const s = 1 - t;
            pts.push(
                new THREE.Vector3(
                    s * s * start.x + 2 * s * t * mid.x + t * t * end.x,
                    s * s * start.y + 2 * s * t * mid.y + t * t * end.y,
                    s * s * start.z + 2 * s * t * mid.z + t * t * end.z
                )
            );
        }
        return pts;
    }

    private _showBezierLine(): void {
        if (!this._bezierLine) {
            const pts = this._buildBezierPoints();
            this._bezierLineGeo = new THREE.BufferGeometry().setFromPoints(pts);
            this._bezierLineMat = new THREE.LineBasicMaterial({
                color: new THREE.Color(
                    this.star.baseColor.r * 0.8 + this.arrivalColor.r * 0.2,
                    this.star.baseColor.g * 0.8 + this.arrivalColor.g * 0.2,
                    this.star.baseColor.b * 0.8 + this.arrivalColor.b * 0.2
                ),
                transparent: true,
                opacity: 0.75,
                depthWrite: false,
                blending: THREE.AdditiveBlending,
            });
            this._bezierLine = new THREE.Line(this._bezierLineGeo, this._bezierLineMat);
            this._bezierLine.frustumCulled = false;
            this._bezierLine.renderOrder = 20;
            this.scene.add(this._bezierLine);
        } else {
            // Update existing line to follow moving bodies
            const pts = this._buildBezierPoints();
            this._bezierLineGeo!.setFromPoints(pts);
        }
    }

    private _removeBezierLine(): void {
        if (this._bezierLine) {
            this.scene.remove(this._bezierLine);
            this._bezierLineGeo?.dispose();
            this._bezierLineMat?.dispose();
            this._bezierLine = null;
            this._bezierLineGeo = null;
            this._bezierLineMat = null;
        }
    }

    // ── Private slot helpers ──────────────────────────────────────────────────

    /** Returns the index of the first free slot, or -1 if the pool is full. */
    private getAvailableSlot(): number {
        for (let i = 0; i < PARTICLE_COUNT; i++) {
            if (this.activeFlags[i] === 0) return i;
        }
        return -1;
    }

    /** Activates slot `i` at a small random t offset with a fresh random spawn direction. */
    private activateParticle(i: number): void {
        this.activeFlags[i] = 1;
        // Spread newly spawned particles across a wider initial t range so back-to-back
        // spawns don't all clump together at the star surface.
        this.tArr[i] = Math.random() * 0.25;
        const theta = Math.random() * 2 * Math.PI;
        const phi = Math.acos(2 * Math.random() - 1);
        this.spawnDirs[i] = new THREE.Vector3(
            Math.sin(phi) * Math.cos(theta),
            Math.cos(phi),
            Math.sin(phi) * Math.sin(theta)
        );
    }

    /** Deactivates slot `i` and hides its particle. */
    private deactivateParticle(i: number): void {
        this.activeFlags[i] = 0;
        (this.geometry.attributes.alpha.array as Float32Array)[i] = 0;
    }

    // ─────────────────────────────────────────────────────────────────────────

    update(dt: number): void {
        if (this.star._isDisposed || this.consumer._isDisposed) {
            this.active = false;
            return;
        }

        const particlesEnabled = performanceSettings.particleEffectsEnabled;

        // ── Handle toggling between particles and line ────────────────────────
        if (particlesEnabled !== this._lastParticlesEnabled) {
            this._lastParticlesEnabled = particlesEnabled;
            if (!particlesEnabled) {
                // Switching to line mode: hide particle mesh
                this.material.visible = false;
                this._showBezierLine();
            } else {
                // Switching back to particle mode
                this.material.visible = true;
                this._removeBezierLine();
            }
        }

        // ── Line mode: update line position each frame and skip particles ─────
        if (!particlesEnabled) {
            this._showBezierLine();
            // Still run drain logic so the effect deactivates when stopSpawning() is called
            if (!this._isSpawning) {
                this.active = false;
            }
            return;
        }

        const absDt = Math.abs(dt);

        // ── Spawn new particles ───────────────────────────────────────────────
        if (this._isSpawning && absDt > 0) {
            this.spawnAccumulator += SIPHON_SPAWN_RATE * absDt;
            // Cap how many can actually spawn this frame to avoid time-scale bursts.
            const spawnThisFrame = Math.min(
                Math.floor(this.spawnAccumulator),
                SIPHON_MAX_SPAWN_PER_FRAME
            );
            this.spawnAccumulator -= spawnThisFrame;
            for (let s = 0; s < spawnThisFrame; s++) {
                const slot = this.getAvailableSlot();
                if (slot !== -1) this.activateParticle(slot);
            }
        }

        // ── Check for full drain (no spawning + nothing alive) ────────────────
        if (!this._isSpawning) {
            let anyActive = false;
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                if (this.activeFlags[i] === 1) {
                    anyActive = true;
                    break;
                }
            }
            if (!anyActive) {
                this.active = false;
                return;
            }
        }

        // ── Per-particle update ───────────────────────────────────────────────
        const starR = this.star.baseColor.r;
        const starG = this.star.baseColor.g;
        const starB = this.star.baseColor.b;

        const DISK_ROTATION_OFFSET = Math.PI / 2;
        const posArr = this.geometry.attributes.position.array as Float32Array;
        const colArr = this.geometry.attributes.color.array as Float32Array;
        const alphaArr = this.geometry.attributes.alpha.array as Float32Array;
        const tValArr = this.geometry.attributes.tval.array as Float32Array;

        for (let i = 0; i < PARTICLE_COUNT; i++) {
            if (this.activeFlags[i] === 0) continue; // skip inactive slots

            this.tArr[i] += this.speedArr[i] * absDt;

            if (this.tArr[i] >= 1.0) {
                // ── Hand off to accretion disk ────────────────────────────────
                // Compute the disk-entry angle so the accretion disk places the
                // incoming particle at the correct position on its outer ring.
                const starCenter = this.star.mesh.position;
                const bhCenter = this.consumer.mesh.position;
                const toBH = new THREE.Vector3().subVectors(bhCenter, starCenter).normalize();
                const diskNormal = this.consumer.rotationAxis
                    ? this.consumer.rotationAxis.clone().normalize()
                    : new THREE.Vector3(0, 1, 0);
                const toBH_proj = toBH
                    .clone()
                    .sub(diskNormal.clone().multiplyScalar(toBH.dot(diskNormal)))
                    .normalize();
                const offsetDir = toBH_proj
                    .clone()
                    .applyAxisAngle(diskNormal, DISK_ROTATION_OFFSET)
                    .normalize();
                const angle = Math.atan2(offsetDir.z, offsetDir.x);

                // Add a small random angular spread so successive arrivals don't all
                // stack at the exact same point on the disk outer ring.
                const angleJitter = (Math.random() - 0.5) * 0.6; // ±0.3 rad (~±17°)
                this.onParticleArrived(angle + angleJitter);
                this.deactivateParticle(i);
                tValArr[i] = 0;
                continue;
            }

            // ── Recompute Bézier path geometry ────────────────────────────────
            const starCenter = this.star.mesh.position;
            const starRadius = this.star.radius;
            const spawnDir = this.spawnDirs[i];
            const start = new THREE.Vector3()
                .copy(starCenter)
                .addScaledVector(spawnDir, starRadius);

            const accretionMaxRadius =
                this.consumer.accretionDisk && this.consumer.accretionDisk.maxRadius
                    ? this.consumer.accretionDisk.maxRadius
                    : this.consumer.radius * 2 * 32;
            const bhCenter = this.consumer.mesh.position;
            const toBH = new THREE.Vector3().subVectors(bhCenter, starCenter).normalize();
            const diskNormal = this.consumer.rotationAxis
                ? this.consumer.rotationAxis.clone().normalize()
                : new THREE.Vector3(0, 1, 0);
            const toBH_proj = toBH
                .clone()
                .sub(diskNormal.clone().multiplyScalar(toBH.dot(diskNormal)))
                .normalize();
            const offsetDir = toBH_proj
                .clone()
                .applyAxisAngle(diskNormal, DISK_ROTATION_OFFSET)
                .normalize();
            const end = new THREE.Vector3()
                .copy(bhCenter)
                .addScaledVector(offsetDir, accretionMaxRadius);

            const dir = new THREE.Vector3().subVectors(end, start);
            const dist = dir.length();
            const diskTangent = new THREE.Vector3().crossVectors(diskNormal, offsetDir).normalize();
            const mergeFrac = 0.7;
            const tangentStrength = dist * 0.5;
            const midBase = new THREE.Vector3().lerpVectors(start, end, mergeFrac);
            const mid = midBase.clone().addScaledVector(diskTangent, tangentStrength);

            const t = this.tArr[i];
            const s = 1.0 - t;
            tValArr[i] = t;

            // Quadratic Bézier: P = s²·start + 2·s·t·mid + t²·end
            posArr[i * 3] = s * s * start.x + 2 * s * t * mid.x + t * t * end.x;
            posArr[i * 3 + 1] = s * s * start.y + 2 * s * t * mid.y + t * t * end.y;
            posArr[i * 3 + 2] = s * s * start.z + 2 * s * t * mid.z + t * t * end.z;

            // Colour: star base colour → disk arrival colour.
            colArr[i * 3] = starR + (this.arrivalColor.r - starR) * t;
            colArr[i * 3 + 1] = starG + (this.arrivalColor.g - starG) * t;
            colArr[i * 3 + 2] = starB + (this.arrivalColor.b - starB) * t;

            // Opacity: MAX_PARTICLE_ALPHA (star) → MIN_PARTICLE_ALPHA (disk)
            alphaArr[i] = MAX_PARTICLE_ALPHA + (MIN_PARTICLE_ALPHA - MAX_PARTICLE_ALPHA) * t;
        }

        this.geometry.attributes.alpha.needsUpdate = true;
        this.geometry.attributes.tval.needsUpdate = true;
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
    }

    dispose(): void {
        this._removeBezierLine();
        this.scene.remove(this.points);
        this.geometry.dispose();
        this.material.dispose();
        this.active = false;
    }
}
