import * as THREE from 'three';
import { Body, IBodyCreationOptions } from './body.js';
import { moonTexture, fictionalTextures } from '../drawing/textures.js';
import { isBodyType, BodyType, pickRandom } from '../utilities/utilities.js';
import { calculateTrajectory, IRotation } from '../physics/physics.js';
import { ParticleExplosion } from '../effects/particle-explosion.js';
import { triggerScreenFlash } from '../effects/screen-flash.js';
import { SCALE_FACTOR } from '../utilities/consts.js';


export interface ICelestialBodyCreationOptions extends IBodyCreationOptions {
    radius: number;
}

/**
 * This class represents a celestial body with physical properties, rendering capabilities, and optional features like rings, atmosphere, and tidal locking.
 */
export class CelestialBody extends Body {

    constructor(
        deps = {},
        scene,
        radius,
        color,
        pos: THREE.Vector3,
        vel: THREE.Vector3,
        mass,
        id,
        name,
        bodyType = BodyType.None,
        trailColor = 0xffffff,
        maxTrail = 500,
        hasRings = false,
        hasAtmosphere = false,
        hasTail = false,
        rotation: IRotation = { axis: [0, 1, 0], speed: 0 },
        geometryFactory: (radius: number) => THREE.BufferGeometry,
        material: THREE.Material,
        tidalLock = null
    ) {
        const defaultMaterial = new THREE.MeshStandardMaterial({
            color: color,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.7,
        });

        // Default geometry is a sphere. Special bodies (e.g. Asteroids) can inject geometry via `geometryFactory`.
        const geometry =
            typeof geometryFactory === 'function'
                ? geometryFactory(radius)
                : new THREE.SphereGeometry(radius, 32, 32);

        super(deps, scene, mass, pos, vel, geometry, material ?? defaultMaterial, id, name);

        // Set dependencies
        this.deps = deps || {};
        this.scene = scene;
        this.radius = radius;
        this.mass = mass;
        this.color = color;
        this.bodyType = bodyType;
        //this.velocity = new THREE.Vector3(...vel);
        this.hasTail = hasTail;

        // Axial rotation (spin). Uses simulation dt so it follows timeScale and reverses when time runs backwards.
        // rotation.speed is in radians per simulated second.
        this.rotationAxis = new THREE.Vector3(...(rotation?.axis || [0, 1, 0])).normalize();
        this.rotationSpeed = typeof rotation?.speed === 'number' ? rotation.speed : 0;

        // Optional: tidal-lock behavior (compute spin speed at spawn; do not re-compute later).
        // If the moon's orbit is changed later, it keeps rotating at the spawn speed.
        this.tidalLockEnabled = false;
        this.tidalLockTarget = null;
        this.tidalLockSpinAxis = new THREE.Vector3(0, 1, 0); // world axis
        this.tidalLockFaceAxisLocal = new THREE.Vector3(0, 0, 1); // local axis that should face target (+Z by default)
        this.tidalLockAngularSpeed = 0; // radians / simulated second
        this._tidalLockConfigured = false;

        if (tidalLock && tidalLock.target) {
            this.tidalLockEnabled = true;
            this.tidalLockTarget = tidalLock.target;
            if (tidalLock.spinAxisWorld) {
                this.tidalLockSpinAxis = new THREE.Vector3(...tidalLock.spinAxisWorld).normalize();
            }
            if (tidalLock.faceAxisLocal) {
                this.tidalLockFaceAxisLocal = new THREE.Vector3(
                    ...tidalLock.faceAxisLocal
                ).normalize();
            }
            if (typeof tidalLock.angularSpeed === 'number') {
                this.tidalLockAngularSpeed = tidalLock.angularSpeed;
            }
            this._tidalLockConfigured = true;
        }

        // Store base color for distance-based brightness adjustment
        this.baseColor = new THREE.Color(color);

        // Atmosphere (old halo effect) removed.
        // Keep `hasAtmosphere` constructor flag for future use (e.g., manager-created planets).
        this.atmo = null;

        this.maxTrail = maxTrail;
        this.history = [];
        this.trailGeo = new THREE.BufferGeometry();
        // Preallocate a fixed-size position buffer to avoid repeatedly recreating
        // the attribute and to prevent BufferGeometry size-mismatch warnings.
        this.trailPositions = new Float32Array(this.maxTrail * 3);
        this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
        // Start with zero draw range; we'll expand as history grows.
        this.trailGeo.setDrawRange(0, 0);
        this.trail = new THREE.Line(
            this.trailGeo,
            new THREE.LineBasicMaterial({
                color: trailColor,
                transparent: true,
                opacity: 0.5,
                linewidth: 2,
                depthTest: true,
            })
        );
        this.trail.frustumCulled = false;
        scene.add(this.trail);

        if (hasRings) {
            const ringCount = 3000 * SCALE_FACTOR;
            const ringGeo = new THREE.BufferGeometry();
            const ringPos = new Float32Array(ringCount * 3);
            for (let i = 0; i < ringCount; i++) {
                const r = radius * 1.6 + Math.random() * radius * 1.2;
                const theta = Math.random() * Math.PI * 2;
                ringPos[i * 3] = Math.cos(theta) * r;
                ringPos[i * 3 + 1] = (Math.random() - 0.5) * (radius * 0.08);
                ringPos[i * 3 + 2] = Math.sin(theta) * r;
            }
            ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
            this.rings = new THREE.Points(
                ringGeo,
                new THREE.PointsMaterial({
                    color: 0xe6cc80,
                    size: 1.2,
                    transparent: true,
                    opacity: 0.3,
                })
            );
            scene.add(this.rings);
        }

        // Comet tail
        if (hasTail) {
            this.tailCount = 800;
            this.tailGeo = new THREE.BufferGeometry();
            this.tailPos = new Float32Array(this.tailCount * 3);
            this.tailOpacities = new Float32Array(this.tailCount);
            this.tailVelocities = [];

            // Direction away from sun for initial tail positioning
            const awayFromSun = new THREE.Vector3(pos[0], pos[1], pos[2]).normalize();

            for (let i = 0; i < this.tailCount; i++) {
                // Initialize with random life values like corona does
                const life = Math.random();

                // Create velocity vector
                const velVec = awayFromSun
                    .clone()
                    .multiplyScalar(0.3 + Math.random() * 0.4)
                    .add(
                        new THREE.Vector3(
                            (Math.random() - 0.5) * 0.2,
                            (Math.random() - 0.5) * 0.2,
                            (Math.random() - 0.5) * 0.2
                        )
                    );

                // Position particle along tail based on its life value
                // Simulate where it would be if it had been traveling
                const travelDistance = life * 200; // Approximate distance based on life
                this.tailPos[i * 3] = pos[0] + velVec.x * travelDistance;
                this.tailPos[i * 3 + 1] = pos[1] + velVec.y * travelDistance;
                this.tailPos[i * 3 + 2] = pos[2] + velVec.z * travelDistance;

                this.tailOpacities[i] = (1 - life) * 0.5; // Initial fade
                this.tailVelocities[i] = { life: life, lifeIncrement: 0.001, vel: velVec };
            }

            this.tailGeo.setAttribute('position', new THREE.BufferAttribute(this.tailPos, 3));
            this.tailMat = new THREE.PointsMaterial({
                color: 0xffffff,
                size: 2.5,
                transparent: true,
                opacity: 0.8,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                depthTest: true,
            });
            this.tailParticles = new THREE.Points(this.tailGeo, this.tailMat);
            this.tailParticles.frustumCulled = false;
            scene.add(this.tailParticles);
            this.tailIndex = 0;
        } else {
            this.tailParticles = null;
        }
    }
    die(skipExplosion = false) {
        if (this._isDisposed) return;
        

        super.die();

        // Log the death event
        if (typeof this.deps.addEvent !== 'undefined') {
            this.deps.addEvent(`${this.name} destroyed`);
        }

        // Only create explosion if not skipped (sun uses supernova instead)
        if (!skipExplosion) {
            try {
                const exp = new ParticleExplosion(
                    this.scene,
                    this.mesh.position.clone(),
                    this.color,
                    this.radius
                );

                // Prefer dependency-injected explosion hook (main.js uses this)
                if (this.deps && typeof this.deps.addExplosion === 'function') {
                    this.deps.addExplosion(exp);
                } else if (typeof explosions !== 'undefined' && Array.isArray(explosions)) {
                    // Back-compat fallback if a global exists
                    explosions.push(exp);
                }

                triggerScreenFlash();
            } catch {
                // ignore explosion failures
            }
        }

        const disposeMaterial = (mat) => {
            if (!mat) return;
            const disposeTex = (t) => {
                try {
                    if (t && typeof t.dispose === 'function') t.dispose();
                } catch {
                    // ignore
                }
            };

            // Common texture slots we use in this project
            disposeTex(mat.map);
            disposeTex(mat.emissiveMap);
            disposeTex(mat.alphaMap);
            disposeTex(mat.roughnessMap);
            disposeTex(mat.metalnessMap);
            disposeTex(mat.normalMap);
            disposeTex(mat.bumpMap);
            disposeTex(mat.aoMap);

            try {
                if (typeof mat.dispose === 'function') mat.dispose();
            } catch {
                // ignore
            }
        };

        const disposeObject3D = (obj) => {
            if (!obj) return;
            obj.traverse((child) => {
                if (child.geometry && typeof child.geometry.dispose === 'function') {
                    try {
                        child.geometry.dispose();
                    } catch {
                        // ignore
                    }
                }

                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(disposeMaterial);
                    else disposeMaterial(child.material);
                }
            });
        };

        // Remove + dispose main mesh (and any child meshes like clouds/labels/lines)
        try {
            if (this.mesh) {
                if (this.mesh.parent) this.mesh.parent.remove(this.mesh);
                disposeObject3D(this.mesh);
            }
        } catch {
            // ignore
        }

        // Rings
        try {
            if (this.rings) {
                if (this.rings.parent) this.rings.parent.remove(this.rings);
                disposeObject3D(this.rings);
            }
        } catch {
            // ignore
        }

        // Trail
        try {
            if (this.trail) {
                if (this.trail.parent) this.trail.parent.remove(this.trail);
                disposeObject3D(this.trail);
            }
        } catch {
            // ignore
        }

        // Tail particles
        try {
            if (this.tailParticles) {
                if (this.tailParticles.parent) this.tailParticles.parent.remove(this.tailParticles);
                disposeObject3D(this.tailParticles);
            }
        } catch {
            // ignore
        }

        // Ensure any label bits are hidden (they should be disposed via traverse above)
        try {
            if (this.label) this.label.visible = false;
            if (this.labelLine) this.labelLine.visible = false;
        } catch {
            // ignore
        }

        // Hide velocity arrow and gizmo if this body was selected
        try {
            if (this.deps?.gizmo?.target === this) {
                this.deps.gizmo.attach(null);
            }
        } catch {
            // ignore
        }
    }
    update(acc: THREE.Vector3, dt: number) {
        super.update(acc, dt);

        if (this._isDisposed) return;
        
        // Tidal lock: keep the same face pointed at the target (no orbit assumptions).
        // We still keep a "spawn angular speed" for when tidal lock isn't available later, but while enabled,
        // we correct orientation directly each frame to avoid visible drift.
        if (
            this.tidalLockEnabled &&
            this._tidalLockConfigured &&
            this.tidalLockTarget &&
            !this.tidalLockTarget._isDisposed &&
            this.tidalLockTarget.mesh
        ) {
            const spinAxis = this.tidalLockSpinAxis.clone().normalize();

            // If no angular speed was provided, compute it once at runtime (still "spawn speed" behavior)
            // using the body's current relative state the first time we run.
            if (!this._tidalLockOmegaInitialized && this.tidalLockAngularSpeed === 0) {
                const r0 = new THREE.Vector3().subVectors(
                    this.mesh.position,
                    this.tidalLockTarget.mesh.position
                );
                const vrel0 = this.velocity
                    .clone()
                    .sub(this.tidalLockTarget.velocity || new THREE.Vector3());
                const rLenSq = Math.max(1e-12, r0.lengthSq());
                this.tidalLockAngularSpeed = r0.clone().cross(vrel0).length() / rLenSq;
                this._tidalLockOmegaInitialized = true;
            }

            // Rotate about spin axis so the chosen local face axis points at the target in the spin plane.
            const toTargetWorld = new THREE.Vector3().subVectors(
                this.tidalLockTarget.mesh.position,
                this.mesh.position
            );
            const toTargetPlanar = toTargetWorld.clone().projectOnPlane(spinAxis);

            if (toTargetPlanar.lengthSq() > 1e-12) {
                toTargetPlanar.normalize();

                const faceWorld = this.tidalLockFaceAxisLocal
                    .clone()
                    .applyQuaternion(this.mesh.quaternion)
                    .projectOnPlane(spinAxis);

                if (faceWorld.lengthSq() > 1e-12) {
                    faceWorld.normalize();

                    const cross = new THREE.Vector3().crossVectors(faceWorld, toTargetPlanar);
                    const sign = Math.sign(cross.dot(spinAxis)) || 1;
                    const angle =
                        Math.acos(THREE.MathUtils.clamp(faceWorld.dot(toTargetPlanar), -1, 1)) *
                        sign;

                    // Direct correction each frame removes tiny ω mismatches / integration drift.
                    this.mesh.rotateOnAxis(spinAxis, angle);
                }
            }
        } else {
            // Axial rotation (spin) - tied to sim time (dt includes timeScale and can be negative).
            if (this.rotationSpeed !== 0) {
                this.mesh.rotateOnAxis(this.rotationAxis, this.rotationSpeed * dt);
            }
        }

        // Optional cloud layer (Earth): rotate slightly faster than the surface
        if (this.clouds && typeof this.cloudRotationSpeed === 'number') {
            this.clouds.rotation.y += this.cloudRotationSpeed * dt;
        }

        // Rings follow
        if (this.rings) {
            this.rings.position.copy(this.mesh.position);
            this.rings.rotation.y += 0.001 * (dt * 60);
        }

        // Update tail particles
        if (this.tailParticles) {
            // Calculate distance to sun (optimized with squared distance)
            const distToSunSq =
                this.mesh.position.x ** 2 + this.mesh.position.y ** 2 + this.mesh.position.z ** 2;
            const distToSun = Math.sqrt(distToSunSq);

            // Calculate comet's velocity magnitude (cached)
            const cometSpeed = this.velocity.length();

            // Scale tail intensity based on distance (closer = brighter/longer)
            const maxDist = 25000; // Distance where tail is minimal (comet's aphelion)
            const minDist = 3500; // Distance where tail is maximal (comet's perihelion)
            let tailIntensity = Math.max(
                0,
                Math.min(1, (maxDist - distToSun) / (maxDist - minDist))
            );

            // Apply stronger falloff curve for more dramatic effect (computed once)
            tailIntensity = tailIntensity * tailIntensity * Math.sqrt(tailIntensity); // Optimized pow(2.5)

            // Direction away from sun (normalized once)
            const invDistToSun = 1 / distToSun;
            const awayFromSunX = this.mesh.position.x * invDistToSun;
            const awayFromSunY = this.mesh.position.y * invDistToSun;
            const awayFromSunZ = this.mesh.position.z * invDistToSun;

            // Calculate desired tail length based on comet state (precompute constants)
            const baseTailLength = 100;
            const intensityBonus = tailIntensity * 400;
            const velocityBonus = cometSpeed * 100;
            const targetTailLength = baseTailLength + intensityBonus + velocityBonus;

            // Convert tail length to life increment
            const avgParticleSpeed = 0.35;
            const lifeIncrement = (avgParticleSpeed * 60) / targetTailLength;

            const dtScaled = dt * 60;
            const spread = this.radius * 0.5;

            // Update all particles
            for (let i = 0; i < this.tailCount; i++) {
                const vel = this.tailVelocities[i];

                // Increment life using the current lifeIncrement
                vel.life += vel.lifeIncrement * dt;

                // Move particle
                const idx = i * 3;
                this.tailPos[idx] += vel.vel.x * dtScaled;
                this.tailPos[idx + 1] += vel.vel.y * dtScaled;
                this.tailPos[idx + 2] += vel.vel.z * dtScaled;

                // If particle dies, reset it with NEW lifeIncrement (works in forward or reverse time)
                if (vel.life >= 1.0 || vel.life <= 0.0) {
                    this.tailPos[idx] = this.mesh.position.x + (Math.random() - 0.5) * spread;
                    this.tailPos[idx + 1] = this.mesh.position.y + (Math.random() - 0.5) * spread;
                    this.tailPos[idx + 2] = this.mesh.position.z + (Math.random() - 0.5) * spread;
                    vel.life = vel.life >= 1.0 ? 0 : 1; // Reset to opposite end based on direction
                    // Add randomness to lifeIncrement so particles don't all die at once
                    vel.lifeIncrement = lifeIncrement * (0.7 + Math.random() * 0.6); // ±30% variation

                    // Reuse awayFromSun calculation
                    const baseSpeed = 0.3 + Math.random() * 0.4;
                    vel.vel.x = awayFromSunX * baseSpeed + (Math.random() - 0.5) * 0.2;
                    vel.vel.y = awayFromSunY * baseSpeed + (Math.random() - 0.5) * 0.2;
                    vel.vel.z = awayFromSunZ * baseSpeed + (Math.random() - 0.5) * 0.2;
                }

                // Fade based on life ratio and intensity
                this.tailOpacities[i] = (1 - vel.life) * tailIntensity;
            }

            this.tailGeo.attributes.position.needsUpdate = true;
            // Make material opacity and size scale with distance
            this.tailMat.opacity = 0.2 + tailIntensity * 0.8;
            // Larger particles when closer to sun for denser appearance
            this.tailMat.size = 2.5 + tailIntensity * 3.5;
        }
    }
    updateTrail() {
        if (this._isDisposed) return;
        this.history.push(this.mesh.position.clone());
        if (this.history.length > this.maxTrail) this.history.shift();

        // Copy history into the preallocated buffer and update draw range.
        for (let i = 0; i < this.history.length; i++) {
            this.trailPositions[i * 3] = this.history[i].x;
            this.trailPositions[i * 3 + 1] = this.history[i].y;
            this.trailPositions[i * 3 + 2] = this.history[i].z;
        }
        this.trailGeo.attributes.position.needsUpdate = true;
        this.trailGeo.setDrawRange(0, this.history.length);
    }

    createMoon(scene, config) {
        // Calculate orbital trajectory based on parent's mass
        const trajectory = calculateTrajectory(config.distance, this.mass);

        // Default angle is 0, but can be specified for multiple moons
        const angle = config.angle !== undefined ? config.angle : 0;

        // Calculate position relative to parent body
        const posX = this.mesh.position.x + Math.cos(angle) * config.distance;
        const posY =
            config.yVariation !== undefined ? (Math.random() - 0.5) * config.yVariation : 0;
        const posZ = this.mesh.position.z + Math.sin(angle) * config.distance;

        // Calculate velocity relative to parent body
        // Moon inherits parent's velocity plus its own orbital velocity
        const velX = this.velocity.x - Math.sin(angle) * trajectory.vel.z;
        const velY = 0;
        const velZ = this.velocity.z + Math.cos(angle) * trajectory.vel.z;

        // Create the moon
        const moonName = config.name || 'Moon';

        const moonMaterial =
            moonName === 'Moon'
                ? new THREE.MeshStandardMaterial({
                      map: moonTexture,
                      color: 0xffffff,
                      emissive: 0x000000,
                      emissiveIntensity: 0,
                      roughness: 0.7,
                      metalness: 0.7,
                  })
                : new THREE.MeshStandardMaterial({
                      map: pickRandom(fictionalTextures),
                      color: 0xffffff, // keep texture untinted
                      emissive: 0x000000,
                      emissiveIntensity: 0,
                      roughness: 0.7,
                      metalness: 0.7,
                  });

        // Compute initial orbital angular speed about parent (instantaneous, based on spawn r and vrel).
        // ω = |r × v| / |r|²
        const r0 = new THREE.Vector3(posX, posY, posZ).sub(this.mesh.position);
        const vrel0 = new THREE.Vector3(velX, velY, velZ).sub(this.velocity);
        const rLenSq = Math.max(1e-12, r0.lengthSq());
        // For perfect-looking locking, we will correct orientation each frame (see update()).
        // Still store ω at spawn so if tidalLock is disabled later, it continues spinning at its spawn rate.
        const omega = r0.clone().cross(vrel0).length() / rLenSq;

        const moon = new CelestialBody(
            this.deps,
            scene,
            config.radius,
            config.color,
            [posX, posY, posZ],
            [velX, velY, velZ],
            config.mass,
            config.id,
            moonName,
            BodyType.Moon,
            config.trailColor || 0xffffff,
            config.maxTrail || 1500,
            false,
            false,
            false,
            { axis: [0, 1, 0], speed: 0.15 + Math.random() * 0.35 },
            null,
            moonMaterial,
            {
                target: this,
                spinAxisWorld: [0, 1, 0],
                faceAxisLocal: [0, 0, 1],
                angularSpeed: omega,
            }
        );

        // Apply any additional properties
        if (config.metalness !== undefined) {
            moon.mesh.material.metalness = config.metalness;
        }

        return moon;
    }

    updateLabel(newName) {
        // Update the body's name
        this.name = newName;

        // Recreate the label texture with the new name
        if (this.label) {
            const labelTexture = createTextTexture(newName);
            this.label.material.map = labelTexture;
            this.label.material.needsUpdate = true;
        }
    }

    // Convert temperature (Kelvin) to RGB color using simplified blackbody radiation
    temperatureToColor(temp) {
        // Simplified color temperature conversion
        // Real stars: O(30000K-blue) B(10000K-blue-white) A(7500K-white) F(6000K-yellow-white)
        //             G(5500K-yellow) K(4000K-orange) M(3000K-red)
        let r, g, b;

        if (temp >= 6000) {
            // Hot: white to blue-white
            r = 1.0;
            g = 0.9 + (temp - 6000) / 40000;
            b = 1.0;
        } else if (temp >= 5000) {
            // Sun-like: yellow-white to white
            r = 1.0;
            g = 0.8 + ((temp - 5000) / 5000) * 0.1;
            b = 0.6 + ((temp - 5000) / 5000) * 0.4;
        } else if (temp >= 3500) {
            // Cooling: yellow to orange
            r = 1.0;
            g = 0.5 + ((temp - 3500) / 1500) * 0.3;
            b = 0.1 + ((temp - 3500) / 1500) * 0.5;
        } else {
            // Red giant: orange to deep red
            r = 1.0;
            g = Math.max(0.2, (temp / 3500) * 0.5);
            b = 0.0;
        }

        return new THREE.Color(r, g, b);
    }
}
