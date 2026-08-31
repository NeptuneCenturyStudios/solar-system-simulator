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
    private _heatUniform: { value: number } | null = null;
    private particlesComplete: boolean;

    opacity: number;

    /** Debris chunks (small meshes) */
    private debris: THREE.Mesh[] = [];
    private debrisVelocities: THREE.Vector3[] = [];
    private debrisOpacity: number = 1.0;
    private debrisCount: number = 32;
    private debrisComplete: boolean;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        pos: THREE.Vector3,
        color: number,
        radius = 10
    ) {
        this.dependencies = dependencies;
        this.count = Math.min(2000, radius * 50);
        this.geometry = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.count * 3);
        this.worldPositions = new Float64Array(this.count * 3);
        this.velocities = [];
        this.active = true;
        this.opacity = 1.0;
        this.scene = scene;
        this.particlesComplete = false;
        this.debrisComplete = false;

        const maxSpeed = dependencies.getC() / 2; // 50% of C for visual effect

        for (let i = 0; i < this.count; i++) {
            // Spawn particles on the planet's surface
            const dir = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            );

            if (dir.lengthSq() < 1e-12) {
                dir.set(1, 0, 0);
            } else {
                dir.normalize();
            }

            const surfacePos = pos.clone().addScaledVector(dir, radius);

            this.worldPositions[i * 3] = surfacePos.x;
            this.worldPositions[i * 3 + 1] = surfacePos.y;
            this.worldPositions[i * 3 + 2] = surfacePos.z;

            // Outward velocity bias
            const spreadScale = Math.max(5, radius * 0.004);
            const v = dir.clone().multiplyScalar((Math.random() * 0.8 + 0.2) * spreadScale);

            if (v.length() > maxSpeed) {
                v.setLength(maxSpeed);
            }

            if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) {
                v.set(0, 0, 0);
            }

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
            shader.uniforms.uHeat = { value: 1.0 }; // 1.0 = hottest, 0.0 = fully cooled
            this._heatUniform = shader.uniforms.uHeat;

            shader.fragmentShader = `uniform float uHeat;` + shader.fragmentShader;

            shader.fragmentShader = shader.fragmentShader.replace(
                'outgoingLight = diffuseColor.rgb;',
                `outgoingLight = diffuseColor.rgb;

                float _d  = length(gl_PointCoord - vec2(0.5));
                if (_d > 0.5) discard;

                float _r = _d * 2.0;

                // --- Glow falloff ---
                float _glow = pow(1.0 - _r, 1.2);
                diffuseColor.a *= _glow;

                // --- Temperature curve (molten metal) ---
                // heat = 1.0 at center → 0.0 at edge
                float heat = pow(1.0 - _r, 1.5);

                // Apply global cooling factor
                heat *= uHeat;

                // Color stops
                vec3 hot  = vec3(1.0, 0.65, 0.10);
                vec3 warm = vec3(1.0, 0.30, 0.05);
                vec3 cool = vec3(0.55, 0.10, 0.05);

                // Blend hot → warm → cool
                vec3 tempColor = mix(warm, hot, heat);
                tempColor = mix(cool, tempColor, heat);

                outgoingLight = mix(outgoingLight, tempColor, heat);

                // --- Red-hot core ---
                vec3 hotCore = vec3(1.0, 0.25, 0.05);
                outgoingLight = mix(outgoingLight, hotCore,
                                    pow(max(0.0, 1.0 - _r * 1.2), 2.0) * uHeat);

                // --- Warm glow tint ---
                vec3 warmTint = vec3(1.0, 0.15, 0.05);
                outgoingLight = mix(outgoingLight, warmTint, _glow * 0.6 * uHeat);
                `
            );
        };
        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        this.points.renderOrder = 1;
        scene.add(this.points);

        // --- Debris Chunks ---
        this.debris = [];
        this.debrisVelocities = [];
        this.debrisOpacity = 1.0;
        this.debrisCount = 32;

        const debrisGeo = new THREE.IcosahedronGeometry(radius * 0.12, 0);

        for (let i = 0; i < this.debrisCount; i++) {
            const dir = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5
            ).normalize();

            const surfacePos = pos.clone().addScaledVector(dir, radius);

            const debrisMat = new THREE.MeshStandardMaterial({
                color: 0x888888,
                emissive: 0x222222,
                transparent: true,
                opacity: 1.0,
            });

            const chunk = new THREE.Mesh(debrisGeo, debrisMat);
            chunk.position.copy(surfacePos);
            this.scene.add(chunk);
            this.debris.push(chunk);

            // Debris velocity (slower than particles)
            const spreadScale = Math.max(5, radius * 0.004);
            const dv = dir.clone().multiplyScalar((Math.random() * 0.4 + 0.1) * spreadScale);

            if (dv.length() > maxSpeed) dv.setLength(maxSpeed);

            this.debrisVelocities.push(dv);
        }

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

        if (this._heatUniform) {
            const base = 0.003 * (dt * 60);
            const outwardBoost = Math.min(1.0, this.opacity); // Fades as explosion fades
            this._heatUniform.value = Math.max(
                0,
                this._heatUniform.value - base * (1.0 + outwardBoost)
            );
        }

        // --- Debris update ---
        this.debrisOpacity -= 0.0008 * (dt * 60);
        const debrisFade = Math.max(0, this.debrisOpacity);

        for (let i = 0; i < this.debris.length; i++) {
            const chunk = this.debris[i];
            const dv = this.debrisVelocities[i];

            chunk.position.x += dv.x * (dt * 60);
            chunk.position.y += dv.y * (dt * 60);
            chunk.position.z += dv.z * (dt * 60);

            (chunk.material as THREE.MeshStandardMaterial).opacity = debrisFade;

            // Slight rotation for visual interest
            chunk.rotation.x += 0.01 * (dt * 60);
            chunk.rotation.y += 0.008 * (dt * 60);
        }

        if (debrisFade <= 0) {
            this.debrisComplete = true;
            for (const chunk of this.debris) {
                this.scene.remove(chunk);
                chunk.geometry.dispose();
                (chunk.material as THREE.MeshStandardMaterial).dispose();
            }
            this.debris.length = 0;
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
            this.particlesComplete = true;
            this.scene.remove(this.points);

            // flashSphere may already be cleaned up above
            if (this.flashSphere) {
                this.scene.remove(this.flashSphere);
                this.flashSphere.geometry.dispose();
                (this.flashSphere.material as THREE.MeshBasicMaterial).dispose();
                this.flashSphere = null;
            }

            // Proper cleanup
            this.geometry.dispose();
            this.material.dispose();
        }

        if (this.particlesComplete && this.debrisComplete) {
            this.active = false;
        }
    }

    dispose() {
        // Be robust: spawn/relaunch cleanup may call dispose even if update() never ran to completion.
        this.active = false;

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
