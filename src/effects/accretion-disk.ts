import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import { MIN_PARTICLE_ALPHA, MAX_PARTICLE_ALPHA, SCALE_FACTOR } from '../utilities/consts';
import { settingsStore } from '../settings/settings-store';

/** Color pair defining the gradient from the hot inner edge to the cool outer edge. */
export interface IAccretionDiskColors {
    /** Color at the innermost edge (hottest, brightest). */
    inner: { r: number; g: number; b: number };
    /** Color at the outermost edge (coolest, dimmest). */
    outer: { r: number; g: number; b: number };
}

/** Built-in color preset for a black hole accretion disk: dark red/orange outer → white-yellow inner. */
export const BLACK_HOLE_DISK_COLORS: IAccretionDiskColors = {
    inner: { r: 1.0, g: 0.95, b: 0.7 },
    outer: { r: 0.8, g: 0.2, b: 0.05 },
};

/** Built-in color preset for a pulsar accretion disk: light blue outer → bright white inner. */
export const PULSAR_DISK_COLORS: IAccretionDiskColors = {
    inner: { r: 1.0, g: 1.0, b: 1.0 },
    outer: { r: 0.5, g: 0.85, b: 1.0 },
};

const ACCRETION_DISK_POINT_SIZE = 4;

/**
 * Random interval range (in raw sim-time units) between successive queue injections.
 * At 1× timewarp, 1 sim-time unit ≈ 1 real second, so these defaults give roughly
 * a 0.25–0.75 s stagger between each new accretion particle appearance.
 */
const ACCRETION_INJECT_MIN_INTERVAL = 0.25;
const ACCRETION_INJECT_MAX_INTERVAL = 0.75;

interface IAccretionDiskState {
    points: THREE.Points;
    vels: { inward: number; orbital: number; radius: number }[];
    angularPositions: number[];
    opacities: Float32Array;
    /** 1 = slot is occupied by a live particle, 0 = slot is free. */
    activeFlags: Uint8Array;
    /** Angles waiting to be injected into the disk. */
    seedQueue: number[];
    /** Accumulated sim-time until the next particle is popped from the queue. */
    seedTimer: number;
}

/**
 * Reusable accretion disk particle effect that spirals particles inward from an outer
 * radius to an inner radius. Supports configurable particle colors and an injection
 * pipeline where particles are queued from external sources (siphon streams, collisions,
 * supernovae) and gradually injected one at a time.
 *
 * When `settingsStore.settings.particleEffectsEnabled` is false, renders a static spiral
 * line instead of particles.
 *
 * Ownership: the class creates and manages its own `THREE.Points` object in the scene.
 */
export class AccretionDiskEffect implements IEffect {
    dependencies: IStateDependencies;
    active: boolean = true;

    private scene: THREE.Scene;
    private _hostRadius: number;
    private _hostMass: number;
    private _colors: IAccretionDiskColors;

    /**
     * Called with `up` = +1 or -1 (pole direction) each time a particle is consumed by
     * the inner edge. Callers use this to fire jets or other secondary effects.
     */
    private _onParticleConsumed: (up: number) => void;

    /**
     * Optional callback invoked in spiral-line mode to determine the start angle of the
     * spiral. Return the angle (in radians) where the outermost spiral point should begin.
     * If omitted, the spiral starts at angle 0.
     */
    private _startAngleProvider: (() => number) | undefined;

    private _state: IAccretionDiskState | null = null;
    private _minRadius: number;
    private _maxRadius: number;
    private _position: THREE.Vector3;

    /** Spiral line shown in place of accretion disk particles when particle effects are disabled. */
    private _spiralLine: THREE.Line | null = null;
    private _spiralLineGeo: THREE.BufferGeometry | null = null;
    private _spiralLineMat: THREE.LineBasicMaterial | null = null;
    private _lastParticlesEnabled: boolean = true;

    // ── IAccretionTarget-compatible getters ───────────────────────────────────

    get maxRadius(): number {
        return this._maxRadius;
    }

    get minRadius(): number {
        return this._minRadius;
    }

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        hostRadius: number,
        hostMass: number,
        position: THREE.Vector3,
        colors: IAccretionDiskColors,
        onParticleConsumed: (up: number) => void,
        startAngleProvider?: () => number
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this._hostRadius = hostRadius;
        this._hostMass = hostMass;
        this._colors = colors;
        this._onParticleConsumed = onParticleConsumed;
        this._startAngleProvider = startAngleProvider;
        this._position = position.clone();

        this._minRadius = hostRadius * 2;
        this._maxRadius = this._minRadius * 64;

        this._state = this._createState();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    setPosition(pos: THREE.Vector3): void {
        this._position.copy(pos);
        if (this._state?.points) {
            this._state.points.position.copy(pos);
        }
        if (this._spiralLine) {
            this._spiralLine.position.copy(pos);
        }
    }

    setRadius(hostRadius: number, hostMass: number): void {
        this._hostRadius = hostRadius;
        this._hostMass = hostMass;
        const newMin = hostRadius * 2;
        const newMax = newMin * 64;
        this._minRadius = newMin;
        this._maxRadius = newMax;
        if (this._state) {
            const mat = this._state.points.material as THREE.PointsMaterial;
            mat.size = ACCRETION_DISK_POINT_SIZE * hostRadius;
        } else {
            this._minRadius = hostRadius * 2;
            this._maxRadius = this._minRadius * 64;
            this._state = this._createState();
        }
    }

    setMass(hostMass: number): void {
        this._hostMass = hostMass;
    }

    /**
     * Enqueues one particle angle for later injection into the accretion disk.
     * All sources (siphon, collision, supernova seed) funnel through here so the
     * disk always builds up gradually rather than all at once.
     */
    enqueueAccretionParticle(angle: number): void {
        if (!this._state) return;
        if (!settingsStore.settings.particleEffectsEnabled) return;
        this._state.seedQueue.push(angle);
    }

    /**
     * Floods the accretion disk with particles when a star is directly absorbed by collision
     * or a supernova occurs. Angles are pushed onto the seed queue and injected one per frame,
     * producing a spiral build-up rather than an instant ring.
     */
    seedAccretionDisk(count: number): void {
        if (!this._state) return;
        if (!settingsStore.settings.particleEffectsEnabled) return;
        const total = Math.round(count * this._hostRadius);
        for (let i = 0; i < total; i++) {
            this._state.seedQueue.push(Math.random() * 2 * Math.PI);
        }
    }

    update(dt: number): void {
        if (!this.active || !this._state) return;

        const particlesEnabled = settingsStore.settings.particleEffectsEnabled;

        // ── Handle toggling between particles and spiral line ─────────────────
        if (particlesEnabled !== this._lastParticlesEnabled) {
            this._lastParticlesEnabled = particlesEnabled;
            const mat = this._state.points.material as THREE.Material;
            if (!particlesEnabled) {
                mat.visible = false;
                this._buildSpiralLine();
            } else {
                mat.visible = true;
                this._removeSpiralLine();
            }
        }

        // ── Line mode: update spiral position and skip all particle work ──────
        if (!particlesEnabled) {
            this._buildSpiralLine();
            return;
        }

        const state = this._state;

        // Drain the seed queue: accumulate raw sim-time and inject one particle when the
        // timer fires.
        const queue = state.seedQueue;
        if (queue.length > 0) {
            state.seedTimer -= Math.abs(dt);
            if (state.seedTimer <= 0) {
                state.seedTimer =
                    ACCRETION_INJECT_MIN_INTERVAL +
                    Math.random() * (ACCRETION_INJECT_MAX_INTERVAL - ACCRETION_INJECT_MIN_INTERVAL);
                const freeSlot = state.activeFlags.indexOf(0);
                if (freeSlot !== -1) {
                    this._injectParticle(queue.shift()!);
                }
            }
        }

        const absDt = Math.abs(dt) / 10;

        const p = state.points.geometry.attributes.position.array;
        const opacities = state.opacities;
        const count = p.length / 3;
        const minRadius = this._minRadius;
        const maxRadius = this._maxRadius;
        const minOpacity = MIN_PARTICLE_ALPHA;
        const maxOpacity = MAX_PARTICLE_ALPHA;
        const colors = state.points.geometry.attributes.color.array;
        const inner = this._colors.inner;
        const outer = this._colors.outer;

        for (let i = 0; i < count; i++) {
            if (state.activeFlags[i] === 0) continue;

            const dx = p[i * 3];
            const dz = p[i * 3 + 2];
            const radius = Math.sqrt(dx * dx + dz * dz);

            const vel = state.vels[i];
            const inwardSpeed = vel.inward * (maxRadius / Math.max(radius, 1));
            const newRadius = radius - inwardSpeed * absDt;

            // Color/heat mapping: t=0 → inner (hot), t=1 → outer (cool)
            const t = (newRadius - minRadius) / (maxRadius - minRadius);
            const tClamped = Math.max(0, Math.min(1, t));
            colors[i * 3] = inner.r + (outer.r - inner.r) * tClamped;
            colors[i * 3 + 1] = inner.g + (outer.g - inner.g) * tClamped;
            colors[i * 3 + 2] = inner.b + (outer.b - inner.b) * tClamped;

            // If particle reaches the inner edge, hand off and deactivate.
            if (newRadius < this._hostRadius + 2 * SCALE_FACTOR) {
                const up = Math.random() < 0.5 ? 1 : -1;
                this._onParticleConsumed(up);
                state.activeFlags[i] = 0;
                opacities[i] = 0;
            } else {
                state.angularPositions[i] += vel.orbital * absDt;
                const angle = state.angularPositions[i];

                p[i * 3] = Math.cos(angle) * newRadius;
                p[i * 3 + 2] = Math.sin(angle) * newRadius;
                p[i * 3 + 1] = p[i * 3 + 1] * 0.98;

                state.vels[i].radius = newRadius;
                opacities[i] = maxOpacity + (minOpacity - maxOpacity) * tClamped;
            }
        }

        state.points.geometry.attributes.position.needsUpdate = true;
        state.points.geometry.attributes.alpha.needsUpdate = true;
        state.points.geometry.attributes.color.needsUpdate = true;
    }

    dispose(): void {
        this.active = false;
        this._removeSpiralLine();
        if (this._state) {
            this.scene.remove(this._state.points);
            this._state.points.geometry.dispose();
            const mat = this._state.points.material;
            if (!Array.isArray(mat)) mat.dispose();
            this._state = null;
        }
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private _createState(): IAccretionDiskState {
        const count = 200 * this._hostRadius;
        const geo = new THREE.BufferGeometry();
        const pArr = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const opacities = new Float32Array(count);
        const activeFlags = new Uint8Array(count);
        const vels: { inward: number; orbital: number; radius: number }[] = [];
        const angularPositions: number[] = [];

        const maxRadius = this._maxRadius;
        const outer = this._colors.outer;

        for (let i = 0; i < count; i++) {
            angularPositions.push(0);
            vels.push({ inward: 0, orbital: 0, radius: maxRadius });
            pArr[i * 3] = 0;
            pArr[i * 3 + 1] = 0;
            pArr[i * 3 + 2] = 0;
            colors[i * 3] = outer.r;
            colors[i * 3 + 1] = outer.g;
            colors[i * 3 + 2] = outer.b;
            opacities[i] = 0;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('alpha', new THREE.BufferAttribute(opacities, 1));

        const mat = new THREE.PointsMaterial({
            size: ACCRETION_DISK_POINT_SIZE * this._hostRadius,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
        });

        mat.onBeforeCompile = (shader) => {
            shader.uniforms.pointSize = {
                value: ACCRETION_DISK_POINT_SIZE * this._hostRadius,
            };

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
                'gl_FragColor = vec4( outgoingLight * 2.0, vAlpha * strength );'
            );
        };

        const points = new THREE.Points(geo, mat);
        points.renderOrder = 999;
        points.frustumCulled = false;
        points.position.copy(this._position);
        this.scene.add(points);

        const seedTimer =
            ACCRETION_INJECT_MIN_INTERVAL +
            Math.random() * (ACCRETION_INJECT_MAX_INTERVAL - ACCRETION_INJECT_MIN_INTERVAL);

        return {
            points,
            vels,
            angularPositions,
            opacities,
            activeFlags,
            seedQueue: [],
            seedTimer,
        };
    }

    private _injectParticle(angle: number): void {
        if (!this._state) return;

        let slot = -1;
        for (let i = 0; i < this._state.activeFlags.length; i++) {
            if (this._state.activeFlags[i] === 0) {
                slot = i;
                break;
            }
        }
        if (slot === -1) return;

        const maxRadius = this._maxRadius;
        const { vels, angularPositions, opacities } = this._state;
        const p = this._state.points.geometry.attributes.position.array as Float32Array;
        const colors = this._state.points.geometry.attributes.color.array as Float32Array;
        const outer = this._colors.outer;
        const verticalSpread = (Math.random() - 0.5) * this._hostRadius * 0.75;

        p[slot * 3] = Math.cos(angle) * maxRadius;
        p[slot * 3 + 1] = verticalSpread;
        p[slot * 3 + 2] = Math.sin(angle) * maxRadius;

        angularPositions[slot] = angle;

        const inwardSpeed = (2 + Math.random() * 0.1) * SCALE_FACTOR;
        const orbitalSpeed = Math.sqrt(this._hostMass / maxRadius) * 0.005;
        vels[slot] = { inward: inwardSpeed, orbital: orbitalSpeed, radius: maxRadius };

        // Outer-edge color (cool) — lerp ramps toward inner as particle spirals in
        colors[slot * 3] = outer.r;
        colors[slot * 3 + 1] = outer.g;
        colors[slot * 3 + 2] = outer.b;
        opacities[slot] = 0.2;

        this._state.activeFlags[slot] = 1;

        this._state.points.geometry.attributes.position.needsUpdate = true;
        this._state.points.geometry.attributes.color.needsUpdate = true;
        this._state.points.geometry.attributes.alpha.needsUpdate = true;
    }

    // ── Spiral line helpers (particle-effects-off fallback) ───────────────────

    private _buildSpiralLine(): void {
        const startAngle = this._startAngleProvider ? this._startAngleProvider() : 0;
        const minRadius = this._minRadius;
        const maxRadius = this._maxRadius;

        const TURNS = 6;
        const STEPS = 240;
        const totalAngle = TURNS * 2 * Math.PI;
        const vertCount = STEPS + 1;
        const inner = this._colors.inner;
        const outer = this._colors.outer;

        if (!this._spiralLine) {
            const positions = new Float32Array(vertCount * 3);
            const colors = new Float32Array(vertCount * 3);

            for (let i = 0; i < vertCount; i++) {
                const t = i / STEPS;
                const theta = startAngle + totalAngle * t;
                const r = maxRadius * (1 - t) + minRadius * t;
                positions[i * 3] = Math.cos(theta) * r;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = Math.sin(theta) * r;
                // t=0 → outer (cool edge), t=1 → inner (hot center)
                colors[i * 3] = outer.r + (inner.r - outer.r) * t;
                colors[i * 3 + 1] = outer.g + (inner.g - outer.g) * t;
                colors[i * 3 + 2] = outer.b + (inner.b - outer.b) * t;
            }

            this._spiralLineGeo = new THREE.BufferGeometry();
            this._spiralLineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            this._spiralLineGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
            this._spiralLineMat = new THREE.LineBasicMaterial({
                vertexColors: true,
                transparent: true,
                opacity: 0.85,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
            });
            this._spiralLine = new THREE.Line(this._spiralLineGeo, this._spiralLineMat);
            this._spiralLine.frustumCulled = false;
            this._spiralLine.renderOrder = 999;
            this._spiralLine.position.copy(this._position);
            this.scene.add(this._spiralLine);
        } else {
            // Rewrite positions in-place so the spiral follows the moving host
            const posAttr = this._spiralLineGeo!.attributes.position as THREE.BufferAttribute;
            const posArr = posAttr.array as Float32Array;
            for (let i = 0; i < vertCount; i++) {
                const t = i / STEPS;
                const theta = startAngle + totalAngle * t;
                const r = maxRadius * (1 - t) + minRadius * t;
                posArr[i * 3] = Math.cos(theta) * r;
                posArr[i * 3 + 1] = 0;
                posArr[i * 3 + 2] = Math.sin(theta) * r;
            }
            posAttr.needsUpdate = true;
        }

        this._spiralLine!.position.copy(this._position);
    }

    private _removeSpiralLine(): void {
        if (this._spiralLine) {
            this.scene.remove(this._spiralLine);
            this._spiralLineGeo?.dispose();
            this._spiralLineMat?.dispose();
            this._spiralLine = null;
            this._spiralLineGeo = null;
            this._spiralLineMat = null;
        }
    }
}
