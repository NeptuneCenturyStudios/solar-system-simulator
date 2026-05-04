import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';

/**
 * Renders the twin electromagnetic beams emitted by a pulsar along its magnetic axis.
 *
 * The magnetic axis is offset from the rotation (spin) axis by a random angle (10–45°),
 * causing the beam to sweep a cone as the pulsar spins — the classic "lighthouse" effect.
 *
 * Each arm is a tapered open cone (thin at the star, wide at the tip) built from
 * MeshBasicMaterial + onBeforeCompile injections (same pattern as Corona), so Three.js
 * handles depth sorting and the pulsar mesh renders correctly on top.
 */
export class PulsarBeam implements IEffect {
    dependencies: IStateDependencies;
    active: boolean = true;

    private scene: THREE.Scene;
    private position: THREE.Vector3;
    private rotationAxis: THREE.Vector3;
    private rotationSpeed: number;

    /** Magnetic axis in its initial orientation (before any spin phase is applied). */
    private magneticAxisBase: THREE.Vector3;

    /** Accumulates spin angle over time (radians). */
    private spinPhase: number = 0;

    /** How far each beam tip reaches from the pulsar centre (simulation units). */
    private beamLength: number;

    // Two tapered arm meshes: thin at the star, widening toward the tip
    private beamMeshNorth: THREE.Mesh | null = null;
    private beamMeshSouth: THREE.Mesh | null = null;
    private beamMatNorth: THREE.MeshBasicMaterial | null = null;
    private beamMatSouth: THREE.MeshBasicMaterial | null = null;

    /** Holds live shader references so we can update uTime each frame. */
    private _shaderNorth: THREE.WebGLProgramParametersWithUniforms | null = null;
    private _shaderSouth: THREE.WebGLProgramParametersWithUniforms | null = null;

    /** Accumulates wall-clock time (ms) for the uTime uniform. */
    private _visualTime: number = 0;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        position: THREE.Vector3,
        radius: number,
        rotationAxis: THREE.Vector3,
        rotationSpeed: number
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this.position = position.clone();
        this.rotationAxis = rotationAxis.clone().normalize();
        this.rotationSpeed = rotationSpeed;

        this.beamLength = Math.max(3000 * radius, radius * 50);

        // Build a random magnetic axis offset 10–45° from the spin axis.
        const offsetAngle = (10 + Math.random() * 35) * (Math.PI / 180);
        const perp = this._buildPerpendicular(this.rotationAxis);
        const tiltQuat = new THREE.Quaternion().setFromAxisAngle(perp, offsetAngle);
        this.magneticAxisBase = this.rotationAxis.clone().applyQuaternion(tiltQuat).normalize();

        this._buildBeamArms();
    }

    // ─── helpers ───────────────────────────────────────────────────────────────

    private _buildPerpendicular(v: THREE.Vector3): THREE.Vector3 {
        const perp = Math.abs(v.x) < 0.9
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0);
        return perp.clone().cross(v).normalize();
    }

    private _currentMagAxis(): THREE.Vector3 {
        const q = new THREE.Quaternion().setFromAxisAngle(this.rotationAxis, this.spinPhase);
        return this.magneticAxisBase.clone().applyQuaternion(q);
    }

    // ─── build ─────────────────────────────────────────────────────────────────

    /**
     * Creates a MeshBasicMaterial with onBeforeCompile injections for:
     *  - vBeamFrac (uv.y passed from vertex → fragment)
     *  - uTime uniform (pulsing sweep)
     *  - rim-glow (Fresnel), tip fade-out (smoothstep), length fade-in
     *
     * Stores the live shader ref in `shaderRef` (via userData) for uniform updates.
     */
    private _makeMaterial(shaderSlot: 'north' | 'south'): THREE.MeshBasicMaterial {
        const mat = new THREE.MeshBasicMaterial({
            color:       0xd6f0ff, // brighter blue-white
            transparent: true,
            blending:    THREE.AdditiveBlending,
            depthWrite:  false,
            side:        THREE.DoubleSide,
        });

        mat.onBeforeCompile = (shader) => {
            // Add uTime uniform and vBeamFrac / vViewDir varyings
            shader.uniforms.uTime = { value: 0 };

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
uniform float uTime;
varying float vBeamFrac;
varying vec3  vViewDir;
varying vec3  vNorm;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                `// Rim glow: bright at silhouette edges, transparent at face centre
float rim   = 1.0 - abs(dot(normalize(vNorm), normalize(vViewDir)));
rim = max(0.5, pow(rim, 1.4));

// Fade: tiny ramp-in at star end, smooth fade-out over last 30% at tip
float fade  = smoothstep(0.00, 0.01, vBeamFrac) * smoothstep(1.0, 0.70, vBeamFrac);

// Pulsing sweep along the beam
float pulse = 0.82 + 0.18 * sin(uTime * 5.0 + vBeamFrac * 12.566);

float alpha = clamp(rim * fade * pulse * 1.4, 0.0, 1.0);
gl_FragColor = vec4(outgoingLight * alpha, alpha);`
            );

            // Store the live shader ref so update() can write uTime
            if (shaderSlot === 'north') this._shaderNorth = shader;
            else                        this._shaderSouth = shader;
        };

        return mat;
    }

    /**
     * Creates two tapered cone arm meshes using MeshBasicMaterial + onBeforeCompile,
     * matching the pattern used by Corona to avoid ShaderMaterial render-order issues.
     */
    private _buildBeamArms(): void {
        // Shared geometry: bottom (uv.y=0) = thin star end, top (uv.y=1) = wide tip
        const geo = new THREE.CylinderGeometry(
            this.beamLength * 0.040,  // radiusTop  — wide tip
            this.beamLength * 0.0004,  // radiusBottom — thin star end
            this.beamLength,          // height = one arm length
            24, 1,
            true,
        );

        const axis = this._currentMagAxis();

        this.beamMatNorth = this._makeMaterial('north');
        this.beamMeshNorth = new THREE.Mesh(geo, this.beamMatNorth);
        this.beamMeshNorth.frustumCulled = false;
        this.scene.add(this.beamMeshNorth);

        this.beamMatSouth = this._makeMaterial('south');
        this.beamMeshSouth = new THREE.Mesh(geo, this.beamMatSouth);
        this.beamMeshSouth.frustumCulled = false;
        this.scene.add(this.beamMeshSouth);

        this._orientBeamArms(axis);
    }

    private _orientBeamArms(axis: THREE.Vector3): void {
        const Y    = new THREE.Vector3(0, 1, 0);
        const half = this.beamLength / 2;

        if (this.beamMeshNorth) {
            const qN = new THREE.Quaternion();
            if (axis.dot(Y) < -0.9999) {
                qN.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
            } else if (axis.dot(Y) < 0.9999) {
                qN.setFromUnitVectors(Y, axis);
            }
            this.beamMeshNorth.setRotationFromQuaternion(qN);
            this.beamMeshNorth.position.copy(
                this.position.clone().addScaledVector(axis, half)
            );
        }

        if (this.beamMeshSouth) {
            const negAxis = axis.clone().negate();
            const qS = new THREE.Quaternion();
            if (negAxis.dot(Y) < -0.9999) {
                qS.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
            } else if (negAxis.dot(Y) < 0.9999) {
                qS.setFromUnitVectors(Y, negAxis);
            }
            this.beamMeshSouth.setRotationFromQuaternion(qS);
            this.beamMeshSouth.position.copy(
                this.position.clone().addScaledVector(axis, -half)
            );
        }
    }

    // ─── IEffect ───────────────────────────────────────────────────────────────

    update(dt: number): void {
        if (!this.active || !dt) return;

        this._visualTime += Math.abs(dt);
        this.spinPhase   += this.rotationSpeed * Math.abs(dt);

        const axis = this._currentMagAxis();
        this._orientBeamArms(axis);

        const t = this._visualTime * 0.001;
        if (this._shaderNorth) this._shaderNorth.uniforms.uTime.value = t;
        if (this._shaderSouth) this._shaderSouth.uniforms.uTime.value = t;
    }

    setPosition(pos: THREE.Vector3): void {
        this.position.copy(pos);
    }

    dispose(): void {
        this.active = false;

        if (this.beamMeshNorth) {
            this.scene.remove(this.beamMeshNorth);
            this.beamMeshNorth.geometry.dispose();
            this.beamMatNorth?.dispose();
            this.beamMeshNorth = null;
            this.beamMatNorth  = null;
        }
        if (this.beamMeshSouth) {
            this.scene.remove(this.beamMeshSouth);
            this.beamMeshSouth.geometry.dispose();
            this.beamMatSouth?.dispose();
            this.beamMeshSouth = null;
            this.beamMatSouth  = null;
        }
        this._shaderNorth = null;
        this._shaderSouth = null;
    }
}
