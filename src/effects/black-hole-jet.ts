import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import { performanceSettings } from '../utilities/consts';

/** Number of simultaneous flash beam pairs in the pool. */
const JET_POOL_SIZE = 16;

/**
 * How long a single flash lasts (sim-seconds).
 * Short enough to look like a burst at normal timewarp; multiple overlapping
 * flashes stack additively to create bright pulses when the disk is active.
 */
const JET_FLASH_DURATION = 6.0;

/** Cone tip radius as a fraction of beam length. */
const JET_TIP_RADIUS_FRAC = 0.04;

/** Cone base radius (star end) as a fraction of body radius. */
const JET_BASE_RADIUS_FRAC = 0.5;

/** Beam hex color — same blue-white as PulsarBeam. */
const JET_BEAM_COLOR = 0xd6f0ff;

/** Alpha for the always-on persistent beam shown when particle effects are disabled. */
const JET_PERSISTENT_ALPHA = 0.8;

interface IJetSlot {
    meshNorth: THREE.Mesh;
    meshSouth: THREE.Mesh;
    matNorth: THREE.MeshBasicMaterial;
    matSouth: THREE.MeshBasicMaterial;
    age: number;
    active: boolean;
}

/**
 * Renders the relativistic jets of a black hole as pooled bilateral flash beams.
 *
 * Each call to `flash()` activates one slot from the pool: a pair of tapered
 * cone meshes (north + south arm) aligned exactly along the black hole's rotation
 * axis. The slot immediately appears at peak brightness and fades out over
 * JET_FLASH_DURATION sim-seconds. Multiple slots can be active simultaneously,
 * stacking additively for a bright pulsing effect when the accretion disk is busy.
 *
 * Visual style matches PulsarBeam: same color, same cone geometry, same rim-glow
 * shader. The key difference is that there is no lighthouse sweep — the beams are
 * locked to the rotation axis and driven purely by accretion events.
 *
 * When particle effects are disabled, slot 0 is held at a constant alpha as a
 * persistent always-on beam — same cone geometry and rim-glow shader, no flash.
 */
export class BlackHoleJetEffect implements IEffect {
    active = true;
    dependencies: IStateDependencies;

    private scene: THREE.Scene;
    private position: THREE.Vector3;
    private radius: number;
    private rotationAxis: THREE.Vector3;
    private beamLength: number;

    private _geo: THREE.CylinderGeometry | null = null;
    private _slots: IJetSlot[] = [];
    private _particlesWereEnabled = true;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        position: THREE.Vector3,
        radius: number,
        rotationAxis: THREE.Vector3 | null
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this.position = position.clone();
        this.radius = radius;
        this.rotationAxis = (rotationAxis ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
        this.beamLength = Math.max(300_000 * radius, radius * 50);

        this._buildPool();
    }

    // ── private helpers ───────────────────────────────────────────────────────

    /**
     * Creates one arm material with a rim-glow + fade-out shader.
     * `uAlpha` is stored in `mat.userData.uAlpha` so it can be updated without
     * keeping a raw shader reference — even when Three.js shares compiled programs.
     */
    private _makeMaterial(): THREE.MeshBasicMaterial {
        const uAlpha = { value: 0.0 };

        const mat = new THREE.MeshBasicMaterial({
            color: JET_BEAM_COLOR,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        mat.userData.uAlpha = uAlpha;

        mat.onBeforeCompile = (shader) => {
            // Bind this material's own uAlpha object so updates propagate automatically.
            shader.uniforms.uAlpha = uAlpha;

            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
varying float vBeamFrac;
varying vec3  vViewDir;
varying vec3  vNorm;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
vBeamFrac = uv.y;
vec4 _mv = modelViewMatrix * vec4(position, 1.0);
vViewDir = normalize(-_mv.xyz);
vNorm    = normalize(normalMatrix * normal);`
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
uniform float uAlpha;
varying float vBeamFrac;
varying vec3  vViewDir;
varying vec3  vNorm;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                `// Rim glow: bright at silhouette edges, transparent at face centre
float rim  = 1.0 - abs(dot(normalize(vNorm), normalize(vViewDir)));
rim = max(0.5, pow(rim, 1.4));

// Fade: small ramp-in at base, smooth fade-out over last 40% toward tip
float fade = smoothstep(0.00, 0.001, vBeamFrac) * smoothstep(1.0, 0.60, vBeamFrac);

float alpha = clamp(rim * fade * uAlpha * 1.4, 0.0, 1.0);
gl_FragColor = vec4(outgoingLight * alpha, alpha);`
            );
        };

        return mat;
    }

    private _buildPool(): void {
        this._geo = new THREE.CylinderGeometry(
            this.beamLength * JET_TIP_RADIUS_FRAC, // radiusTop  — wide tip
            this.radius * JET_BASE_RADIUS_FRAC, //    radiusBottom — thin star end
            this.beamLength,
            24,
            1,
            true
        );

        for (let i = 0; i < JET_POOL_SIZE; i++) {
            const matNorth = this._makeMaterial();
            const matSouth = this._makeMaterial();

            const meshNorth = new THREE.Mesh(this._geo, matNorth);
            const meshSouth = new THREE.Mesh(this._geo, matSouth);
            meshNorth.frustumCulled = false;
            meshSouth.frustumCulled = false;

            const slot: IJetSlot = { meshNorth, meshSouth, matNorth, matSouth, age: 0, active: false };
            this._slots.push(slot);

            this._orientSlot(slot);
            this.scene.add(meshNorth);
            this.scene.add(meshSouth);
        }
    }

    /** Positions and orients one slot's cone pair along the current rotation axis. */
    private _orientSlot(slot: IJetSlot): void {
        const Y = new THREE.Vector3(0, 1, 0);
        const axis = this.rotationAxis;
        const half = this.beamLength / 2;

        // North arm: base at BH centre, tip along +axis
        const qN = new THREE.Quaternion();
        if (axis.dot(Y) < -0.9999) {
            qN.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
        } else if (axis.dot(Y) < 0.9999) {
            qN.setFromUnitVectors(Y, axis);
        }
        slot.meshNorth.setRotationFromQuaternion(qN);
        slot.meshNorth.position.copy(this.position).addScaledVector(axis, half);

        // South arm: base at BH centre, tip along -axis
        const negAxis = axis.clone().negate();
        const qS = new THREE.Quaternion();
        if (negAxis.dot(Y) < -0.9999) {
            qS.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
        } else if (negAxis.dot(Y) < 0.9999) {
            qS.setFromUnitVectors(Y, negAxis);
        }
        slot.meshSouth.setRotationFromQuaternion(qS);
        slot.meshSouth.position.copy(this.position).addScaledVector(axis, -half);
    }

    private _setSlotAlpha(slot: IJetSlot, alpha: number): void {
        slot.matNorth.userData.uAlpha.value = alpha;
        slot.matSouth.userData.uAlpha.value = alpha;
    }

    /** Rebuilds cone geometry after a radius/beamLength change. */
    private _rebuildGeometry(): void {
        this._geo?.dispose();
        this._geo = new THREE.CylinderGeometry(
            this.beamLength * JET_TIP_RADIUS_FRAC,
            this.radius * JET_BASE_RADIUS_FRAC,
            this.beamLength,
            24,
            1,
            true
        );
        for (const slot of this._slots) {
            slot.meshNorth.geometry = this._geo;
            slot.meshSouth.geometry = this._geo;
            this._orientSlot(slot);
        }
    }

    // ── IEffect public API ────────────────────────────────────────────────────

    /**
     * Triggers one bilateral flash along the rotation axis.
     * Reuses an inactive pool slot; if all are active, steals the most-expired one.
     * The flash starts at peak brightness (additive overshoot) and fades over
     * JET_FLASH_DURATION sim-seconds. Multiple overlapping flashes stack additively.
     */
    flash(): void {
        if (!this.active) return;

        let slot = this._slots.find((s) => !s.active);
        if (!slot) {
            // All slots busy — steal the most-expired active one
            slot = this._slots.reduce((a, b) => (a.age > b.age ? a : b));
        }

        slot.age = 0;
        slot.active = true;
        this._orientSlot(slot);
        this._setSlotAlpha(slot, 1.5); // overshoot for additive over-exposure at birth
    }

    update(dt: number): void {
        if (!this.active) return;

        const particlesEnabled = performanceSettings.particleEffectsEnabled;

        if (particlesEnabled !== this._particlesWereEnabled) {
            this._particlesWereEnabled = particlesEnabled;
            if (!particlesEnabled) {
                // Switch to persistent mode: fade out all flash slots, hold slot 0 at constant alpha.
                for (const slot of this._slots) {
                    slot.active = false;
                    this._setSlotAlpha(slot, 0);
                }
                const staticSlot = this._slots[0];
                this._orientSlot(staticSlot);
                this._setSlotAlpha(staticSlot, JET_PERSISTENT_ALPHA);
            }
            // Switching back to particles: slot 0 will fade naturally once flash() picks it up.
        }

        if (!particlesEnabled) {
            // Keep the persistent slot oriented as the black hole moves.
            this._orientSlot(this._slots[0]);
            return;
        }

        const absDt = Math.abs(dt);
        if (absDt === 0) return;

        for (const slot of this._slots) {
            if (!slot.active) continue;
            slot.age += absDt;
            if (slot.age >= JET_FLASH_DURATION) {
                slot.active = false;
                this._setSlotAlpha(slot, 0);
                continue;
            }
            const t = slot.age / JET_FLASH_DURATION;
            // Smooth power-law decay: starts bright, fades rapidly
            const alpha = Math.pow(1 - t, 1.5) * 1.5;
            this._setSlotAlpha(slot, alpha);
        }
    }

    setPosition(pos: THREE.Vector3): void {
        this.position.copy(pos);
        for (const slot of this._slots) {
            this._orientSlot(slot);
        }
    }

    setRotationAxis(axis: THREE.Vector3): void {
        this.rotationAxis = axis.clone().normalize();
        for (const slot of this._slots) {
            this._orientSlot(slot);
        }
    }

    setRadius(radius: number): void {
        if (this.radius === radius) return;
        this.radius = radius;
        this.beamLength = Math.max(300_000 * radius, radius * 50);
        this._rebuildGeometry();
    }

    dispose(): void {
        this.active = false;
        for (const slot of this._slots) {
            this.scene.remove(slot.meshNorth);
            this.scene.remove(slot.meshSouth);
            slot.matNorth.dispose();
            slot.matSouth.dispose();
        }
        this._slots = [];
        this._geo?.dispose();
        this._geo = null;
    }
}
