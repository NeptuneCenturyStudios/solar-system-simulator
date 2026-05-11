import * as THREE from 'three';
import { Body, IBodyCreationOptions } from './body';
import { moonTexture, fictionalTextures } from '../drawing/textures';
import { pickRandom, BodyTypeEnum, isBodyType } from '../utilities/utilities';
import { calculateTrajectory, IRotation } from '../physics/physics';
import { ParticleExplosion } from '../effects/particle-explosion';
import { triggerScreenFlash } from '../effects/screen-flash';
import { SCALE_FACTOR, C } from '../utilities/consts';
import { createTextTexture } from '../drawing/text-rendering';
import { IStateDependencies } from '../interfaces';

export interface ICelestialBodyCreationOptions extends IBodyCreationOptions {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    rotation: IRotation;
    trailColor?: number;
    maxTrail?: number;
}

export interface IMoonCreationOptions extends IBodyCreationOptions {
    distance: number;
    angle?: number; // optional initial angle for multiple moons
    yVariation?: number; // optional random Y variation for non-coplanar orbits
    trailColor?: number;
    maxTrail?: number;
}

export interface ITidalLockOptions {
    target: CelestialBody;
    spinAxisWorld: THREE.Vector3;
    faceAxisLocal: THREE.Vector3;
    angularSpeed: number;
}

/**
 * This class represents a celestial body with physical properties, rendering capabilities, and optional features like rings, atmosphere, and tidal locking.
 */
export class CelestialBody extends Body {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    color: number;
    rotation: IRotation;
    baseColor: THREE.Color;
    maxTrail: number;
    history: THREE.Vector3[];
    trailGeo: THREE.BufferGeometry;
    trailPositions: Float32Array;
    trail: THREE.Line | null;
    rings: THREE.Points | null = null;
    clouds: THREE.Mesh | null = null;
    cloudRotationSpeed: number = 0;
    // Tidal lock properties
    tidalLockEnabled: boolean;
    tidalLockTarget: CelestialBody | null;
    tidalLockSpinAxis: THREE.Vector3;
    tidalLockFaceAxisLocal: THREE.Vector3;
    tidalLockAngularSpeed: number;
    _tidalLockConfigured: boolean;
    _tidalLockOmegaInitialized: boolean = false;
    // Private properties for internal state management
    private rotationSpeed!: number;
    private rotationAxis!: THREE.Vector3;

    /**
     * Constructs a new CelestialBody with advanced features like trails, rings, clouds, and tidal locking.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which the body belongs.
     * @param mass The mass of the body.
     * @param radius The radius of the body.
     * @param pos The initial position of the body.
     * @param vel The initial velocity of the body.
     * @param geometry The geometry used for rendering.
     * @param material The material used for rendering.
     * @param id Unique identifier for the body.
     * @param name Name of the body.
     * @param bodyType The type of the body (enum).
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        radius: number,
        color: number,
        pos: THREE.Vector3,
        vel: THREE.Vector3,
        mass: number,
        id: string,
        name: string,
        bodyType: BodyTypeEnum,
        trailColor = 0xffffff,
        maxTrail = 500,
        hasRings = false,
        rotation: IRotation = { tilt: 0, speed: 0 },
        geometryFactory?: (radius: number) => THREE.BufferGeometry,
        material?: THREE.Material,
        tidalLock?: ITidalLockOptions
    ) {
        // Create a simple material if one isn't provided, using the specified color.
        if (!material) {
            material = new THREE.MeshStandardMaterial({
                color: color,
                emissive: 0x000000,
                emissiveIntensity: 0,
                roughness: 0.7,
                metalness: 0.7,
            });
        }

        // Default geometry is a sphere. Special bodies (e.g. Asteroids) can inject geometry via `geometryFactory`.
        const geometry =
            typeof geometryFactory === 'function'
                ? geometryFactory(radius)
                : new THREE.SphereGeometry(radius, 32, 32);

        super(dependencies, scene, mass, radius, pos, vel, geometry, material, id, name, bodyType);

        // Set dependencies
        this.dependencies = dependencies;
        this.scene = scene;
        this.radius = radius;
        this.mass = mass;
        this.color = color;
        this.bodyType = bodyType;
        this.rotation = rotation;

        // Se the rotation
        this.setRotation(rotation);

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
                if (Array.isArray(tidalLock.spinAxisWorld)) {
                    this.tidalLockSpinAxis = new THREE.Vector3(
                        ...tidalLock.spinAxisWorld
                    ).normalize();
                } else {
                    this.tidalLockSpinAxis = new THREE.Vector3(
                        tidalLock.spinAxisWorld.x,
                        tidalLock.spinAxisWorld.y,
                        tidalLock.spinAxisWorld.z
                    ).normalize();
                }
            }
            if (tidalLock.faceAxisLocal) {
                this.tidalLockFaceAxisLocal = new THREE.Vector3(
                    ...tidalLock.faceAxisLocal
                ).normalize();
            }
            this.tidalLockAngularSpeed = tidalLock.angularSpeed;
            this._tidalLockConfigured = true;
        }

        // Store base color for distance-based brightness adjustment
        this.baseColor = new THREE.Color(color);

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
            // Orient the rings to match the planet's tilt (YZ plane)
            if (rotation && typeof rotation.tilt === 'number') {
                const tiltRad = (rotation.tilt * Math.PI) / 180;
                // Rotate around X axis to match tilt (so rings are coplanar with equator)
                this.rings.rotation.x = tiltRad;
            }
            scene.add(this.rings);
        }
    }

    /**
     * Handles the death of the celestial body, including optional explosion effects.
     * @param skipExplosion Whether to skip the explosion effect.
     * @returns void
     */
    die(skipExplosion = false) {
        if (this._isDisposed) return;

        super.die();

        // Log the death event
        if (typeof this.dependencies.addEvent !== 'undefined') {
            this.dependencies.addEvent(`${this.name} destroyed`);
        }

        // Only create explosion if not skipped (sun uses supernova instead)
        if (!skipExplosion) {
            try {
                const exp = new ParticleExplosion(
                    this.dependencies,
                    this.scene,
                    this.mesh.position.clone(),
                    this.color,
                    this.radius
                );

                this.dependencies.addExplosion(exp);

                triggerScreenFlash();
            } catch {
                // ignore explosion failures
            }
        }

        // Dispose of any resources owned by this class
        if (this.clouds) {
            this.scene.remove(this.clouds);
            this.clouds.geometry.dispose();
            if (Array.isArray(this.clouds.material)) {
                this.clouds.material.forEach((mat) => mat.dispose());
            } else {
                this.clouds.material.dispose();
            }
        }

        // Remove trail
        if (this.trail) {
            this.scene.remove(this.trail);
            this.trailGeo.dispose();
            if (Array.isArray(this.trail.material)) {
                this.trail.material.forEach((mat) => mat.dispose());
            } else {
                this.trail.material.dispose();
            }
        }

        // Dispoose of rings
        if (this.rings) {
            this.scene.remove(this.rings);
            this.rings.geometry.dispose();
            if (Array.isArray(this.rings.material)) {
                this.rings.material.forEach((mat) => mat.dispose());
            } else {
                this.rings.material.dispose();
            }
        }

        // Trail
        // try {
        //     if (this.trail) {
        //         if (this.trail.parent) this.trail.parent.remove(this.trail);
        //         disposeObject3D(this.trail);
        //     }
        // } catch {
        //     // ignore
        // }

        // Ensure any label bits are hidden (they should be disposed via traverse above)
        try {
            if (this.label) this.label.visible = false;
            if (this.labelLine) this.labelLine.visible = false;
        } catch {
            // ignore
        }

        // Hide velocity arrow and gizmo if this body was selected
        try {
            if (this.dependencies?.gizmo?.target === this) {
                this.dependencies.gizmo.attach(null);
            }
        } catch {
            // ignore
        }
    }

    /**
     * Sets the rotation of the celestial body, including tilt and spin speed.
     * @param rotation The rotation parameters, including tilt and speed.
     */
    setRotation(rotation: IRotation) {
        // Orient the mesh so its texture "north" matches Saturn's spin axis
        const tiltRad = (rotation.tilt * Math.PI) / 180;
        const spinAxis = new THREE.Vector3(0, Math.cos(tiltRad), Math.sin(tiltRad)); // YZ plane
        // Orient the mesh so its texture "north" matches the provided spin axis
        const up = new THREE.Vector3(0, 1, 0);
        this.mesh.quaternion.setFromUnitVectors(up, spinAxis);
        // Set rotationAxis to local Y for correct spinning
        this.rotationAxis = new THREE.Vector3(0, 1, 0);
        // Set rotation speed and axis based on provided rotation info
        this.rotationSpeed = rotation.speed;
    }

    /**
     * Updates the rotation of the celestial body based on its rotation speed and optional tidal locking behavior.
     * @param spinAxis The axis around which the body should spin (in world coordinates).
     * @param speed The rotation speed of the body.
     */
    updateRotation(spinAxis: THREE.Vector3, speed: number) {
        // Orient the mesh so its texture "north" matches the provided spin axis
        const up = new THREE.Vector3(0, 1, 0);
        this.mesh.quaternion.setFromUnitVectors(up, spinAxis);
        // Set rotationAxis to local Y for correct spinning
        this.rotationAxis = new THREE.Vector3(0, 1, 0);
        // Set rotation speed based on provided speed
        this.rotationSpeed = speed;
    }

    /**
     * Sets the radius of the celestial body, updating its mesh geometry and related properties accordingly.
     * @param newRadius The new radius for the celestial body.
     */
    setRadius(newRadius: number) {
        const oldRadius = this.radius || 1;

        this.radius = newRadius;

        // Update mesh geometry
        try {
            if (this.mesh && this.mesh.geometry) {
                this.mesh.geometry.dispose();
                this.mesh.geometry = new THREE.SphereGeometry(newRadius, 32, 32);
            }
        } catch (e) {
            console.error('Error updating body geometry radius:', e);
        }

        // Update cast/receive shadow
        if (this.mesh) {
            const isBodyStar = isBodyType(this, BodyTypeEnum.Star);
            this.mesh.castShadow = !isBodyStar;
            this.mesh.receiveShadow = !isBodyStar;
        }

        // Update label position and label line
        try {
            if (this.label) {
                const labelHeight = newRadius * 3.5;
                this.label.position.set(0, labelHeight, 0);
            }

            if (this.labelLine && this.labelLine.geometry) {
                const posAttr = this.labelLine.geometry.attributes.position;
                if (posAttr && posAttr.array) {
                    posAttr.array[0] = 0;
                    posAttr.array[1] = newRadius;
                    posAttr.array[2] = 0;
                    posAttr.array[3] = 0;
                    posAttr.array[4] = newRadius * 3.5;
                    posAttr.array[5] = 0;
                    posAttr.needsUpdate = true;
                }
            }
        } catch (e) {
            console.error('Error updating body label or label line position:', e);
        }

        // Update cloud layer (if present) to follow new radius
        try {
            if (this.clouds && this.clouds.geometry) {
                try {
                    this.clouds.geometry.dispose();
                } catch (e) {
                    console.error('Error disposing old cloud geometry:', e);
                }
                const cloudFactor = 1.03;
                this.clouds.geometry = new THREE.SphereGeometry(newRadius * cloudFactor, 32, 32);
            }
        } catch (e) {
            console.error('Error updating cloud layer radius:', e);
        }

        // If rings exist, scale them to new radius
        try {
            if (this.rings) {
                const scaleFactor = newRadius / Math.max(oldRadius, 1);
                this.rings.scale.setScalar(scaleFactor);
            }
        } catch (e) {
            console.error('Error updating body rings scale:', e);
        }
    }

    private clampToLightSpeed(): void {
        const speed = this.velocity.length();
        if (speed >= C) {
            this.velocity.multiplyScalar((C * 0.9999) / speed);
        }
    }

    setVelocity(v: THREE.Vector3): void {
        this.velocity.copy(v);
        this.clampToLightSpeed();
    }

    update(acc: THREE.Vector3, dt: number) {
        super.update(acc, dt);
        this.clampToLightSpeed();

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
                this.mesh.rotateOnAxis(new THREE.Vector3(0, 1, 0), this.rotationSpeed * dt);
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
    }
    updateTrail(cameraPos: THREE.Vector3) {
        if (this._isDisposed) return;
        this.history.push(this.mesh.position.clone());
        if (this.history.length > this.maxTrail) this.history.shift();

        // Anchor the trail Line at cameraPos so vertices are stored as camera-relative
        // offsets. This keeps float32 values small regardless of world distance, eliminating
        // the stair-step precision artefact visible at large distances from the origin.
        if (this.trail) this.trail.position.copy(cameraPos);
        const cx = cameraPos.x,
            cy = cameraPos.y,
            cz = cameraPos.z;
        for (let i = 0; i < this.history.length; i++) {
            this.trailPositions[i * 3] = this.history[i].x - cx;
            this.trailPositions[i * 3 + 1] = this.history[i].y - cy;
            this.trailPositions[i * 3 + 2] = this.history[i].z - cz;
        }
        this.trailGeo.attributes.position.needsUpdate = true;
        this.trailGeo.setDrawRange(0, this.history.length);
    }

    createMoon(scene: THREE.Scene, config: IMoonCreationOptions) {
        // Calculate orbital trajectory based on parent's mass
        const trajectory = calculateTrajectory(
            this.dependencies.getG(),
            config.distance,
            this.mass
        );

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
            this.dependencies,
            scene,
            config.radius,
            0xffffff, // Color is determined by texture, so keep material color white
            new THREE.Vector3(posX, posY, posZ),
            new THREE.Vector3(velX, velY, velZ),
            config.mass,
            config.id,
            moonName,
            BodyTypeEnum.Moon,
            config.trailColor || 0xffffff,
            config.maxTrail || 1500,
            false,
            { tilt: 0, speed: 0.15 + Math.random() * 0.35 },
            undefined,
            moonMaterial,
            {
                target: this,
                spinAxisWorld: new THREE.Vector3(0, 1, 0),
                faceAxisLocal: new THREE.Vector3(0, 0, 1),
                angularSpeed: omega,
            }
        );

        // // Apply any additional properties
        // if (config.metalness !== undefined) {
        //     moon.mesh.material.metalness = config.metalness;
        // }

        return moon;
    }

    updateLabel(newName: string) {
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
    temperatureToColor(temp: number) {
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
