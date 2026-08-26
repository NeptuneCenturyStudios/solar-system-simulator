import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import { settingsStore } from '../settings/settings-store';
import { WORMHOLE_FUNNEL_LENGTH_FACTOR, WORMHOLE_FUNNEL_PARTICLE_COUNT } from '../utilities/consts';

/** Warm/warning palette shown while a wormhole has no linked exit (destroys anything that enters). */
const UNLINKED_COLOR = new THREE.Color(0xff5522);
/** Cool/stable palette shown once a wormhole is linked to a partner (safe passage). */
const LINKED_COLOR = new THREE.Color(0x33e0ff);
/** Bright white core particles near the deep tip of the funnel. */
const INSIDE_COLOR = new THREE.Color(0xffffff);
/** Outer rim color for a linked (stable) funnel — purple/magenta, matching the reference image. */
const LINKED_OUTER = new THREE.Color(0xcc33ff);
/** Outer rim color for an unlinked (destructive) funnel — hot magenta, keeping the warm "danger" cue. */
const UNLINKED_OUTER = new THREE.Color(0xff3366);
/** Fade-to color at the mouth rim for a linked funnel. */
const LINKED_FADE = new THREE.Color(0x001133);
/** Fade-to color at the mouth rim for an unlinked funnel. */
const UNLINKED_FADE = new THREE.Color(0x110008);

/** Total spiral twist (radians) a particle travels over the full funnel length — matches the reference demo. */
const TOTAL_TWIST = 10;
/** Slow angular speed (rad/s) the whole particle cloud spins around the entrance normal. */
const SPIN_SPEED = 0.2;

/**
 * Swirling spiral funnel visual for a Wormhole, ported from the standalone spiraling-wormhole demo.
 * Particles are laid out once in a static funnel (wide mouth at local y=0 tapering to a bright point
 * at local y=-tailLength) with a color gradient per depth and a per-particle size attribute. The whole
 * cloud rotates around local +Y (the entrance normal) for the swirling effect.
 *
 * Uses THREE.PointsMaterial with onBeforeCompile (the same pattern as the Comet tail) so the ShaderMaterial
 * from the demo is replaced by the standard points material with a custom per-particle size and a soft-disc
 * fragment. Parented to the wormhole's mesh, so it inherits the body's position and orientation.
 */
export class WormholeFunnelEffect implements IEffect {
    dependencies: IStateDependencies;
    active = true;

    private _mouthRadius: number;
    private _tailLength: number;
    private _points: THREE.Points | null = null;
    private _fallbackMesh: THREE.Group | null = null;
    private _spinPhase = 0;
    private _linked = false;
    private _lastParticlesEnabled = true;

    private _particleT: Float32Array = new Float32Array(0);

    private _colorScratch = new THREE.Color();

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
        const sizes = new Float32Array(count);

        this._particleT = new Float32Array(count);

        const twistFactor = TOTAL_TWIST / this._tailLength;

        for (let i = 0; i < count; i++) {
            const t = Math.random();
            const angle0 = Math.random() * Math.PI * 2;
            const radiusBias = Math.random() - 0.5;

            this._particleT[i] = t;

            // Funnel: wide at the mouth (y=0) tapering to a bright point deep along -Y.
            const y = (t - 1) * this._tailLength;
            const radiusBase = Math.pow(t, 2.5) * this._mouthRadius;
            // Scatter proportional to the demo's spread so the cloud has thickness, not a thin shell.
            const spread = t * this._mouthRadius * 0.19 + this._mouthRadius * 0.03;
            const radius = radiusBase + radiusBias * spread;
            const angle = angle0 + y * twistFactor;

            positions[i * 3] = Math.cos(angle) * radius;
            positions[i * 3 + 1] = y;
            positions[i * 3 + 2] = Math.sin(angle) * radius;

            // Larger particles toward the wide mouth, smaller near the tip like the demo.
            sizes[i] = Math.random() * (t * 2 + 0.5);
        }

        this._writeParticleColors(colors);

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            size: Math.max(this._mouthRadius * 0.02, 0.02),
            vertexColors: true,
            transparent: true,
            opacity: 1.0, // per-fragment alpha comes from the shader
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
        });

        // Inject GLSL to turn each point into a soft circular disc, scaled per-particle by aSize.
        // `size` (PointsMaterial uniform) is the base world size; `aSize` scales it per particle.
        mat.onBeforeCompile = (shader) => {
            // Vertex: forward aSize to gl_PointSize (built-in size-attenuation still applies after).
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
attribute float aSize;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                'gl_PointSize = size;',
                'gl_PointSize = size * aSize;'
            );
            // Fragment: circular soft disc with radial falloff (same look as the demo shader).
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `void main() {
float dist = length(gl_PointCoord - vec2(0.5));
if (dist > 0.5) discard;
float strength = smoothstep(0.5, 0.1, dist);`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                'gl_FragColor = vec4(outgoingLight, strength);'
            );
        };

        this._points = new THREE.Points(geo, mat);
        this._points.frustumCulled = false;
        parentMesh.add(this._points);
    }

    private _buildFallbackMesh(parentMesh: THREE.Object3D): void {
        // Cheap static cone shown in place of particles when particle effects are disabled.
        // Wide at the mouth (y=0) tapering to a point at y=-tailLength, matching the particle funnel.
        const geo = new THREE.CylinderGeometry(this._mouthRadius, 0, this._tailLength, 24, 1, true);
        const mat = new THREE.MeshBasicMaterial({
            color: UNLINKED_COLOR,
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const cone = new THREE.Mesh(geo, mat);
        cone.position.y = -this._tailLength / 2;

        this._fallbackMesh = new THREE.Group();
        this._fallbackMesh.add(cone);
        parentMesh.add(this._fallbackMesh);
        this._fallbackMesh.visible = false;
    }

    setLinkedState(linked: boolean): void {
        this._linked = linked;
        if (this._points) {
            const colors = this._points.geometry.attributes.color.array as Float32Array;
            this._writeParticleColors(colors);
        }
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

    private _writeParticleColors(colors: Float32Array): void {
        const mid = this._linked ? LINKED_COLOR : UNLINKED_COLOR;
        const outer = this._linked ? LINKED_OUTER : UNLINKED_OUTER;
        const fade = this._linked ? LINKED_FADE : UNLINKED_FADE;
        const scratch = this._colorScratch;

        for (let i = 0; i < this._particleT.length; i++) {
            const t = this._particleT[i];
            if (t < 0.2) {
                scratch.lerpColors(INSIDE_COLOR, mid, t / 0.2);
            } else if (t < 0.7) {
                scratch.lerpColors(mid, outer, (t - 0.2) / 0.5);
            } else {
                scratch.lerpColors(outer, fade, (t - 0.7) / 0.3);
            }
            // Small per-particle jitter so the cloud feels organic rather than a rigid gradient.
            scratch.r += (Math.random() - 0.5) * 0.2;
            scratch.g += (Math.random() - 0.5) * 0.2;
            scratch.b += (Math.random() - 0.5) * 0.2;

            colors[i * 3] = scratch.r;
            colors[i * 3 + 1] = scratch.g;
            colors[i * 3 + 2] = scratch.b;
        }

        if (this._points) {
            this._points.geometry.attributes.color.needsUpdate = true;
        }
    }

    update(dt: number): void {
        if (!this.active) return;

        const particlesEnabled = settingsStore.settings.particleEffectsEnabled;
        if (particlesEnabled !== this._lastParticlesEnabled) {
            this._lastParticlesEnabled = particlesEnabled;
            this._applyMode();
        }
        if (!particlesEnabled) return;

        // Rotate the whole cloud around the entrance normal for the swirling spiral effect.
        this._spinPhase += Math.abs(dt) * SPIN_SPEED;
        if (this._points) {
            this._points.rotation.y = this._spinPhase;
        }
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
