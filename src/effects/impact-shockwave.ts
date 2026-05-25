import * as THREE from 'three';
import { IEffect } from './effect-base.js';
import { IStateDependencies } from '../interfaces.js';

/**
 * Bright blue-white flash ball spawned at the point where a weapon bolt hits
 * a body.  Implemented as a single camera-facing Points sprite so the
 * round+glow shader used by other effects applies naturally.
 *
 * The ball starts at bodyRadius × 0.3 world units, expands to 3× that, and
 * fades out over ~50 normalised frames (~0.8 s at 60 fps).
 */
export class ImpactShockwave implements IEffect {
    dependencies: IStateDependencies;
    active: boolean;

    private scene: THREE.Scene;
    private points: THREE.Points;
    private geometry: THREE.BufferGeometry;
    private material: THREE.PointsMaterial;
    /** Float64 world-space impact centre — keeps GPU values small. */
    private worldPos: THREE.Vector3;
    private age: number;
    private readonly maxAge = 50; // normalised frames
    private readonly baseSize: number;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        pos: THREE.Vector3,
        bodyRadius: number
    ) {
        this.dependencies = dependencies;
        this.active = true;
        this.scene = scene;
        this.worldPos = pos.clone();
        this.age = 0;
        this.baseSize = Math.max(20, bodyRadius * 0.3);

        // Single point at the camera-relative origin; repositioned every frame.
        this.geometry = new THREE.BufferGeometry();
        this.geometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3)
        );

        this.material = new THREE.PointsMaterial({
            color: 0x44bbff,          // bright cyan-blue
            size: this.baseSize,
            sizeAttenuation: true,
            transparent: true,
            opacity: 3.0,             // over-bright for additive bloom
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        });

        // Round glowing orb — same injection point as weapon bolts / explosion
        // particles.  White-hot centre, radial blue glow, hard clip at r = 0.5.
        this.material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
                'outgoingLight = diffuseColor.rgb;',
                `outgoingLight = diffuseColor.rgb;
                float _d = length(gl_PointCoord - vec2(0.5));
                if (_d > 0.5) discard;
                float _r    = _d * 2.0;
                float _glow = pow(1.0 - _r, 0.7);
                // White-hot core fading to blue
                outgoingLight = mix(outgoingLight, vec3(1.0),
                                    pow(max(0.0, 1.0 - _r * 1.1), 2.0));
                diffuseColor.a *= _glow;`
            );
        };

        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        this.points.renderOrder = 1; // draw after planets but before ship
        // Initial world-space position (overwritten each frame with camera-relative value)
        this.points.position.copy(pos);
        scene.add(this.points);
    }

    update(dt: number, cameraPosition?: THREE.Vector3) {
        dt = Math.abs(dt);
        this.age += dt * 60;

        const progress = Math.min(this.age / this.maxAge, 1.0);
        // Sharp initial flash, quick fade
        this.material.opacity = Math.max(0, 3.0 * Math.pow(1.0 - progress, 1.8));
        // Expand outward as it fades
        this.material.size = this.baseSize * (1.0 + progress * 2.0);

        // Camera-relative upload: keeps GPU float32 accurate at any distance.
        const buf = this.geometry.attributes.position.array as Float32Array;
        if (cameraPosition) {
            buf[0] = this.worldPos.x - cameraPosition.x;
            buf[1] = this.worldPos.y - cameraPosition.y;
            buf[2] = this.worldPos.z - cameraPosition.z;
            this.points.position.copy(cameraPosition);
        } else {
            buf[0] = this.worldPos.x;
            buf[1] = this.worldPos.y;
            buf[2] = this.worldPos.z;
        }
        this.geometry.attributes.position.needsUpdate = true;

        if (progress >= 1.0) {
            this.active = false;
            this.dispose();
        }
    }

    dispose() {
        this.scene.remove(this.points);
        this.geometry.dispose();
        this.material.dispose();
    }
}
