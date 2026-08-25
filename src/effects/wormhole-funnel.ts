import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import { settingsStore } from '../settings/settings-store';
import { WORMHOLE_FUNNEL_LENGTH_FACTOR, WORMHOLE_FUNNEL_PARTICLE_COUNT } from '../utilities/consts';

/** Warm/warning palette shown while a wormhole has no linked exit (destroys anything that enters). */
const UNLINKED_COLOR = new THREE.Color(0xff5522);
/** Cool/stable palette shown once a wormhole is linked to a partner (safe passage). */
const LINKED_COLOR = new THREE.Color(0x33e0ff);

const WIND_COUNT = 2.5; // extra spiral windings a particle completes over its lifetime

interface IFunnelParticle {
    angle0: number;
    speed: number;
    t: number;
}

/**
 * Swirling vortex/funnel visual for a Wormhole. Parented directly to the wormhole's mesh
 * so it automatically inherits the body's position and orientation (local +Y = entrance
 * normal). Particles spiral from the mouth's rim inward and taper off along local -Y,
 * giving a single funnel/tail "being sucked into the tunnel" look.
 */
export class WormholeFunnelEffect implements IEffect {
    dependencies: IStateDependencies;
    active = true;

    private _mouthRadius: number;
    private _tailLength: number;
    private _particles: IFunnelParticle[] = [];
    private _points: THREE.Points | null = null;
    private _fallbackMesh: THREE.Group | null = null;
    private _spinPhase = 0;
    private _linked = false;
    private _lastParticlesEnabled = true;

    constructor(dependencies: IStateDependencies, parentMesh: THREE.Object3D, mouthRadius: number) {
        this.dependencies = dependencies;
        this._mouthRadius = mouthRadius;
        this._tailLength = mouthRadius * WORMHOLE_FUNNEL_LENGTH_FACTOR;

        this._buildParticles(parentMesh);
        this._buildFallbackMesh(parentMesh);
        this._lastParticlesEnabled = settingsStore.settings.particleEffectsEnabled;
        this._applyMode();
    }

    private _buildParticles(parentMesh: THREE.Object3D): void {
        const count = WORMHOLE_FUNNEL_PARTICLE_COUNT;
        const positions = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);

        for (let i = 0; i < count; i++) {
            this._particles.push({
                angle0: Math.random() * Math.PI * 2,
                speed: 0.25 + Math.random() * 0.35,
                t: Math.random(),
            });
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: Math.max(this._mouthRadius * 0.05, 0.05),
            vertexColors: true,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        this._points = new THREE.Points(geo, mat);
        this._points.frustumCulled = false;
        parentMesh.add(this._points);

        this._writeParticlePositions();
    }

    private _buildFallbackMesh(parentMesh: THREE.Object3D): void {
        // Cheap static cone shown in place of particles when particle effects are disabled.
        const geo = new THREE.CylinderGeometry(0, this._mouthRadius, this._tailLength, 24, 1, true);
        const mat = new THREE.MeshBasicMaterial({
            color: UNLINKED_COLOR,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const cone = new THREE.Mesh(geo, mat);
        cone.position.y = -this._tailLength / 2;
        cone.rotation.x = Math.PI;

        this._fallbackMesh = new THREE.Group();
        this._fallbackMesh.add(cone);
        parentMesh.add(this._fallbackMesh);
        this._fallbackMesh.visible = false;
    }

    setLinkedState(linked: boolean): void {
        this._linked = linked;
        if (this._fallbackMesh) {
            const color = linked ? LINKED_COLOR : UNLINKED_COLOR;
            this._fallbackMesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    (child.material as THREE.MeshBasicMaterial).color.copy(color);
                }
            });
        }
    }

    private _applyMode(): void {
        const particlesEnabled = settingsStore.settings.particleEffectsEnabled;
        if (this._points) this._points.visible = particlesEnabled;
        if (this._fallbackMesh) this._fallbackMesh.visible = !particlesEnabled;
    }

    private _writeParticlePositions(): void {
        if (!this._points) return;
        const positions = this._points.geometry.attributes.position
            .array as Float32Array;
        const colors = this._points.geometry.attributes.color.array as Float32Array;
        const baseColor = this._linked ? LINKED_COLOR : UNLINKED_COLOR;

        for (let i = 0; i < this._particles.length; i++) {
            const p = this._particles[i];
            const angle = p.angle0 + p.t * WIND_COUNT * Math.PI * 2 + this._spinPhase;
            const radius = this._mouthRadius * (1 - p.t);
            const axial = -p.t * this._tailLength;

            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = axial;
            positions[i * 3 + 2] = Math.sin(angle) * radius;

            const brightness = 1 - p.t * 0.7;
            colors[i * 3] = baseColor.r * brightness;
            colors[i * 3 + 1] = baseColor.g * brightness;
            colors[i * 3 + 2] = baseColor.b * brightness;
        }

        this._points.geometry.attributes.position.needsUpdate = true;
        this._points.geometry.attributes.color.needsUpdate = true;
    }

    update(dt: number): void {
        if (!this.active) return;

        const particlesEnabled = settingsStore.settings.particleEffectsEnabled;
        if (particlesEnabled !== this._lastParticlesEnabled) {
            this._lastParticlesEnabled = particlesEnabled;
            this._applyMode();
        }
        if (!particlesEnabled) return;

        this._spinPhase += dt * 0.4;
        const absDt = Math.abs(dt);
        for (const p of this._particles) {
            p.t += p.speed * absDt * 0.3;
            if (p.t > 1) {
                p.t = 0;
                p.angle0 = Math.random() * Math.PI * 2;
            }
        }
        this._writeParticlePositions();
    }

    dispose(): void {
        this.active = false;
        if (this._points) {
            this._points.parent?.remove(this._points);
            this._points.geometry.dispose();
            (this._points.material as THREE.Material).dispose();
            this._points = null;
        }
        if (this._fallbackMesh) {
            this._fallbackMesh.parent?.remove(this._fallbackMesh);
            this._fallbackMesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry.dispose();
                    (child.material as THREE.Material).dispose();
                }
            });
            this._fallbackMesh = null;
        }
    }
}
