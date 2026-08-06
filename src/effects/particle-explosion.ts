import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';

export class ParticleExplosion implements IEffect {
    dependencies: IStateDependencies;
    active: boolean;
    scene: THREE.Scene;
    points: THREE.Points;
    geometry: THREE.BufferGeometry;
    material: THREE.PointsMaterial;
    velocities: THREE.Vector3[];
    flashSphere: THREE.Mesh | null;
    flashOpacity: number;
    count: number;
    /** GPU-side float32 buffer — written each frame as camera-relative coords. */
    positions: Float32Array;
    /** Float64 world-space particle positions.  Avoids float32 precision loss at extreme distances. */
    private worldPositions: Float64Array;
    /** World-space centre of the flash sphere (float64). */
    private flashWorldPos: THREE.Vector3;
    opacity: number;
    /** Expanding shockwave ring perpendicular to a random tilt axis. */
    private shockwave: THREE.Mesh | null;
    private swCurrentRadius: number;
    private swStartRadius: number;
    private swMaxRadius: number;
    private swExpansionRate: number;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        pos: THREE.Vector3,
        color: number,
        radius = 10
    ) {
        this.dependencies = dependencies;
        this.count = 800; // 4x more particles
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.count * 3);
        this.worldPositions = new Float64Array(this.count * 3);
        this.flashWorldPos = pos.clone();
        this.velocities = [];
        this.active = true;
        this.opacity = 1.0;
        this.scene = scene;

        for (let i = 0; i < this.count; i++) {
            this.worldPositions[i * 3] = pos.x;
            this.worldPositions[i * 3 + 1] = pos.y;
            this.worldPositions[i * 3 + 2] = pos.z;
            // Velocity scales with body radius.  Much slower than before so
            // particles linger near the body when the camera is zoomed in.
            // Target: ~0.25–1× radius spread over the explosion lifetime (~330 frames).
            const spreadScale = Math.max(5, radius * 0.004);
            const v = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            )
                .normalize()
                .multiplyScalar((Math.random() * 0.8 + 0.2) * spreadScale);
            this.velocities.push(v);
        }
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        // Brighten the color by mixing it with white
        // More white-hot mixing so the particles read as hotter.
        const brightColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.75);
        this.material = new THREE.PointsMaterial({
            color: brightColor,
            // Larger particles so they're visible when zoomed in close.
            size: Math.max(10, radius * 0.02),
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 1.5,
            depthWrite: false,
            depthTest: true,
        });
        // Round glowing sprite — same shader pattern as weapon bolts
        this.material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
                'outgoingLight = diffuseColor.rgb;',
                `outgoingLight = diffuseColor.rgb;
                float _d  = length(gl_PointCoord - vec2(0.5));
                if (_d > 0.5) discard;
                float _r    = _d * 2.0;
                // Softer exponent = wider glow bloom
                float _glow = pow(1.0 - _r, 0.8);
                // Brighter, wider white-hot core
                outgoingLight = mix(outgoingLight, vec3(1.0),
                                    pow(max(0.0, 1.0 - _r * 1.2), 2.0));
                diffuseColor.a *= _glow;`
            );
        };
        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        this.points.renderOrder = 1;
        scene.add(this.points);

        // Create bright flash sphere at impact
        const flashGeo = new THREE.SphereGeometry(radius * 3, 16, 16);
        const flashMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
        });
        this.flashSphere = new THREE.Mesh(flashGeo, flashMat);
        this.flashSphere.renderOrder = 1;
        this.flashSphere.position.copy(pos);
        scene.add(this.flashSphere);
        this.flashOpacity = 1.0;

        // Shockwave ring — a flat ring oriented perpendicular to a random tilt axis,
        // expanding outward from the explosion centre.
        const tiltAxis = new THREE.Vector3(
            Math.random() - 0.5,
            Math.random() - 0.5,
            Math.random() - 0.5
        ).normalize();
        const swGeo = new THREE.RingGeometry(0.9, 1.0, 64);

        // Deterministic flame-like ring:
        // - Outer rim stays hot/brighter
        // - Inner edge is more translucent (fades toward center)
        // - Overall opacity fades out over the ring lifetime (set in update()).
        const swMat = new THREE.ShaderMaterial({
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            side: THREE.DoubleSide,
            uniforms: {
                uBaseColor: { value: brightColor.clone() },
                uWarm: { value: new THREE.Color(0xff8c1a) },
                uHot: { value: new THREE.Color(0xfff2cc) },
                uRingOpacity: { value: 1.5 },
            },
            vertexShader: `
                varying vec2 vUv;
                void main() {
                    vUv = uv;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                varying vec2 vUv;
                uniform vec3 uBaseColor;
                uniform vec3 uWarm;
                uniform vec3 uHot;
                uniform float uRingOpacity;

                void main() {
                    float t = clamp(vUv.y, 0.0, 1.0);

                    float rim = pow(t, 0.8);
                    float core = smoothstep(0.15, 1.0, t);
                    float flame = rim * core;

                    // Mostly translucent near inner edge
                    flame = mix(0.08, 1.0, flame);

                    // Warm → hot tint
                    vec3 warmMix = mix(uBaseColor, uWarm, 0.55 * flame);
                    vec3 hotMix  = mix(warmMix, uHot, 0.35 * flame);

                    float alpha = uRingOpacity * flame;

                    gl_FragColor = vec4(hotMix, alpha);
                }
            `,
        });

        this.shockwave = new THREE.Mesh(swGeo, swMat);
        this.shockwave.renderOrder = 1;
        this.shockwave.position.copy(pos);
        // RingGeometry lies in XY plane (normal = Z); rotate so normal = tiltAxis
        this.shockwave.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tiltAxis);
        this.swStartRadius = Math.max(5, radius);
        this.swCurrentRadius = this.swStartRadius;
        this.swMaxRadius = this.swStartRadius * 12;
        // Expand fully over ~300 normalised frames (~5 s at 60 fps)
        this.swExpansionRate = (this.swMaxRadius - this.swStartRadius) / 300;
        this.shockwave.scale.setScalar(this.swCurrentRadius);
        this.shockwave.frustumCulled = false;
        scene.add(this.shockwave);
    }

    update(dt: number, cameraPosition?: THREE.Vector3) {
        // Use absolute value of dt so explosion always plays forward regardless of time direction
        dt = Math.abs(dt);

        this.opacity -= 0.001 * (dt * 60); // Fade over ~1000 frames (~16 s at 60 fps)
        this.material.opacity = this.opacity;

        // Update flash sphere
        // IMPORTANT: clean up as soon as it fades out, so we never leave a lingering white sphere
        // if the explosion particles stop updating for any reason.
        if (this.flashSphere) {
            if (this.flashOpacity > 0) {
                this.flashOpacity -= 0.05 * (dt * 60);
                (this.flashSphere.material as THREE.MeshBasicMaterial).opacity = Math.max(
                    0,
                    this.flashOpacity
                );
                this.flashSphere.scale.setScalar(1 + (1 - this.flashOpacity) * 2); // Expand as it fades
            }

            if (this.flashOpacity <= 0) {
                this.scene.remove(this.flashSphere);
                this.flashSphere.geometry.dispose();
                (this.flashSphere.material as THREE.MeshBasicMaterial).dispose();
                this.flashSphere = null;
            }
        }

        // Shockwave ring
        if (this.shockwave) {
            this.swCurrentRadius += this.swExpansionRate * (dt * 60);

            const rawProgress =
                (this.swCurrentRadius - this.swStartRadius) /
                (this.swMaxRadius - this.swStartRadius);

            // Start fading immediately (right as it begins expanding),
            // but keep the fade smooth so it doesn't “blip”.
            const fadeStart = 0.0;
            const fadeEnd = 2.2; // longer fade window so it fades slower

            // Ring keeps expanding; no clamping.
            const scaleRadius =
                this.swStartRadius + rawProgress * (this.swMaxRadius - this.swStartRadius);

            const ringMat = this.shockwave.material as THREE.ShaderMaterial;

            const fadeProgress = Math.min(
                Math.max(0, rawProgress - fadeStart) / (fadeEnd - fadeStart),
                1.0
            );

            // Start very bright, then slowly fade (curved, not linear).
            const baseOpacity = 2.2;
            const fadeExponent = 1.25;
            ringMat.uniforms.uRingOpacity.value = Math.max(
                0,
                baseOpacity * Math.pow(1.0 - fadeProgress, fadeExponent)
            );

            this.shockwave.scale.setScalar(scaleRadius);
            this.shockwave.position.copy(this.flashWorldPos);

            // Remove when fade is complete.
            if (fadeProgress >= 1.0) {
                this.scene.remove(this.shockwave);
                this.shockwave.geometry.dispose();
                ringMat.dispose();
                this.shockwave = null;
            }
        }

        // Advance float64 world positions — keeps sub-km precision at any simulation distance.
        for (let i = 0; i < this.count; i++) {
            this.worldPositions[i * 3] += this.velocities[i].x * (dt * 60);
            this.worldPositions[i * 3 + 1] += this.velocities[i].y * (dt * 60);
            this.worldPositions[i * 3 + 2] += this.velocities[i].z * (dt * 60);
        }

        // Write camera-relative float32 values to the GPU buffer.
        // The Points mesh is placed at cameraPosition; vertices are (worldPos − cameraPos),
        // keeping the GPU floats small regardless of the simulation coordinate.
        if (cameraPosition) {
            const cpx = cameraPosition.x;
            const cpy = cameraPosition.y;
            const cpz = cameraPosition.z;
            for (let i = 0; i < this.count; i++) {
                this.positions[i * 3] = this.worldPositions[i * 3] - cpx;
                this.positions[i * 3 + 1] = this.worldPositions[i * 3 + 1] - cpy;
                this.positions[i * 3 + 2] = this.worldPositions[i * 3 + 2] - cpz;
            }
            this.points.position.copy(cameraPosition);
        } else {
            // Fallback: write world positions directly (no camera-relative correction)
            for (let i = 0; i < this.count; i++) {
                this.positions[i * 3] = this.worldPositions[i * 3];
                this.positions[i * 3 + 1] = this.worldPositions[i * 3 + 1];
                this.positions[i * 3 + 2] = this.worldPositions[i * 3 + 2];
            }
        }
        this.geometry.attributes.position.needsUpdate = true;

        if (this.opacity <= 0) {
            this.active = false;
            this.scene.remove(this.points);

            // flashSphere may already be cleaned up above
            if (this.flashSphere) {
                this.scene.remove(this.flashSphere);
                this.flashSphere.geometry.dispose();
                (this.flashSphere.material as THREE.MeshBasicMaterial).dispose();
                this.flashSphere = null;
            }

            // Shockwave may already be cleaned up above
            if (this.shockwave) {
                const ringMat = this.shockwave.material as THREE.ShaderMaterial;
                this.scene.remove(this.shockwave);
                this.shockwave.geometry.dispose();
                ringMat.dispose();
                this.shockwave = null;
            }

            // Proper cleanup
            this.geometry.dispose();
            this.material.dispose();
        }
    }

    dispose() {
        // Be robust: spawn/relaunch cleanup may call dispose even if update() never ran to completion.
        this.active = false;

        // Remove shockwave ring (this is the most likely "blast ring" leftover).
        if (this.shockwave) {
            const ringMat = this.shockwave.material as THREE.ShaderMaterial;
            this.scene.remove(this.shockwave);
            this.shockwave.geometry.dispose();
            ringMat.dispose();
            this.shockwave = null;
        }

        // Remove flash sphere.
        if (this.flashSphere) {
            this.scene.remove(this.flashSphere);
            this.flashSphere.geometry.dispose();
            (this.flashSphere.material as THREE.MeshBasicMaterial).dispose();
            this.flashSphere = null;
        }

        // Remove points system.
        if (this.points) {
            this.scene.remove(this.points);
        }

        // Dispose GPU resources.
        this.geometry?.dispose();
        this.material?.dispose();
    }
}
