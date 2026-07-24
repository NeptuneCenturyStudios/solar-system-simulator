import * as THREE from 'three';
import { Body } from './body';
import { IAtmosphereOptions, IDeathOptions, IRotation } from '../interfaces';
import { ParticleExplosion } from '../effects/particle-explosion';
import { SeededRandom } from '../utilities/prng';
import { triggerScreenFlash } from '../effects/screen-flash';
import { C, DIST_SCALE } from '../utilities/consts';
import { createTextTexture } from '../drawing/text-texture';
import { IStateDependencies } from '../interfaces';
import { NotificationType } from '../event-log/event-log';
import { BodyTypeEnum } from './body-enums';
import { AtmosphereShellHandle, createAtmosphereShell } from '../effects/atmosphere-shell';
import { loadSrgbTexture } from '../drawing/textures';

// Reusable Y-axis constant — avoids allocating a new Vector3 on every rotation substep.
const _Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * Tidal locking options
 */
export interface ITidalLockOptions {
    target: CelestialBody;
    spinAxisWorld: THREE.Vector3;
    faceAxisLocal: THREE.Vector3;
    angularSpeed: number;
}

/**
 * This class represents a celestial body with physical properties, rendering capabilities,
 * and optional features like rings, clouds, and tidal locking.
 */
export class CelestialBody extends Body {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    color: number;
    rotation: IRotation;
    baseColor: THREE.Color;
    maxTrail: number;
    /** Ring buffer storing raw world-space trail positions (maxTrail * 3 floats). */
    _trailRing: Float32Array;
    /** Write head — next slot to overwrite; also points to oldest entry when ring is full. */
    _trailHead: number;
    /** Number of valid samples currently in the ring (capped at maxTrail). */
    _trailCount: number;
    trailGeo: THREE.BufferGeometry;
    trailPositions: Float32Array;
    trail: THREE.Line | null;
    rings: THREE.Points | null = null;
    clouds: THREE.Mesh | null = null;
    cloudRotationSpeed: number = 0;
    atmosphereShell: AtmosphereShellHandle | null = null;

    // Tidal lock properties
    tidalLockEnabled: boolean;
    tidalLockTarget: CelestialBody | null;
    tidalLockSpinAxis: THREE.Vector3;
    tidalLockFaceAxisLocal: THREE.Vector3;
    tidalLockAngularSpeed: number;
    _tidalLockConfigured: boolean;
    _tidalLockOmegaInitialized: boolean = false;

    rotationSpeed!: number;
    rotationAxis!: THREE.Vector3;

    /** Deterministic seed from which procedural features (textures, etc.) are derived. */
    readonly seed!: string | undefined;

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
        mesh?: THREE.Mesh,
        tidalLock?: ITidalLockOptions,
        seed?: string,
        atmosphere?: IAtmosphereOptions
        ) {
        // Create a simple material if one isn't provided
        if (!mesh) {
            mesh = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 32, 32),
                new THREE.MeshStandardMaterial({
                    color: color,
                    emissive: 0x000000,
                    emissiveIntensity: 0,
                    roughness: 0.7,
                    metalness: 0.7,
                })
            );
        }

        super(dependencies, scene, mass, radius, pos, vel, mesh, id, name, bodyType);
        this.seed = seed;

        this.dependencies = dependencies;
        this.scene = scene;
        this.radius = radius;
        this.mass = mass;
        this.color = color;
        this.bodyType = bodyType;
        this.rotation = rotation;

        // Create the atmosphere shell if atmosphere options were provided
        if (atmosphere) {
            this.atmosphereShell = createAtmosphereShell(scene, atmosphere.radius, atmosphere.tint, mesh);
        }

        this.setRotation(rotation);

        // Tidal lock behavior
        this.tidalLockEnabled = false;
        this.tidalLockTarget = null;
        this.tidalLockSpinAxis = new THREE.Vector3(0, 1, 0); // world axis
        this.tidalLockFaceAxisLocal = new THREE.Vector3(0, 0, 1); // local face axis (+Z)
        this.tidalLockAngularSpeed = 0; // radians/s
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

        this.baseColor = new THREE.Color(color);

        this.maxTrail = maxTrail;
        this._trailRing = new Float32Array(maxTrail * 3);
        this._trailHead = 0;
        this._trailCount = 0;
        this.trailGeo = new THREE.BufferGeometry();

        // Preallocate a fixed-size trail position buffer
        this.trailPositions = new Float32Array(this.maxTrail * 3);
        this.trailGeo.setAttribute('position', new THREE.BufferAttribute(this.trailPositions, 3));
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

        // Deterministic rings (PRNG from body id)
        if (hasRings) {
            const ringCount = 300000 / DIST_SCALE;
            const ringRng = new SeededRandom(`${name}|rings`);

            const ringGeo = new THREE.BufferGeometry();
            const ringPos = new Float32Array(ringCount * 3);

            for (let i = 0; i < ringCount; i++) {
                const r = radius * 1.6 + ringRng.next() * radius * 1.2;
                const theta = ringRng.next() * Math.PI * 2;

                ringPos[i * 3] = Math.cos(theta) * r;
                ringPos[i * 3 + 1] = (ringRng.next() - 0.5) * (radius * 0.08);
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

            // Orient rings to match planet orientation (tilt + azimuth) exactly.
            // Rings must follow the full mesh quaternion, otherwise the ring plane can drift.
            this.rings.quaternion.copy(this.mesh.quaternion);

            scene.add(this.rings);
        }
    }

    die(deathOptions?: IDeathOptions) {
        if (this._isDisposed) return;

        super.die(deathOptions);

        if (typeof this.dependencies.addEvent !== 'undefined') {
            this.dependencies.addEvent({
                message: `${this.name} destroyed`,
                notificationType: NotificationType.Alert,
            });
        }

        if (!deathOptions || !deathOptions.skipExplosion) {
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

        // Atmosphere shell
        if (this.atmosphereShell) {
            try {
                this.atmosphereShell.dispose();
            } catch {
                // ignore cleanup errors
            }
            this.atmosphereShell = null;
        }

        // Clouds
        if (this.clouds) {
            this.scene.remove(this.clouds);
            this.clouds.geometry.dispose();
            if (Array.isArray(this.clouds.material)) {
                this.clouds.material.forEach((mat) => mat.dispose());
            } else {
                this.clouds.material.dispose();
            }
        }

        // Trail
        if (this.trail) {
            this.scene.remove(this.trail);
            this.trailGeo.dispose();
            if (Array.isArray(this.trail.material)) {
                this.trail.material.forEach((mat) => mat.dispose());
            } else {
                this.trail.material.dispose();
            }
        }

        // Rings
        if (this.rings) {
            this.scene.remove(this.rings);
            this.rings.geometry.dispose();
            if (Array.isArray(this.rings.material)) {
                this.rings.material.forEach((mat) => mat.dispose());
            } else {
                this.rings.material.dispose();
            }
        }

        // Hide labels
        try {
            if (this.label) this.label.visible = false;
            if (this.labelLine) this.labelLine.visible = false;
        } catch {
            // ignore
        }

        // Hide gizmo if selected
        try {
            if (this.dependencies?.gizmo?.target === this) {
                this.dependencies.gizmo.attach(null);
            }
        } catch {
            // ignore
        }
    }

    setRotation(rotation: IRotation) {
        const tiltRad = (rotation.tilt * Math.PI) / 180;
        const azimuthRad = ((rotation.azimuth ?? 0) * Math.PI) / 180;

        const spinAxis = new THREE.Vector3(0, Math.cos(tiltRad), Math.sin(tiltRad)); // YZ plane
        const up = new THREE.Vector3(0, 1, 0);

        this.mesh.quaternion.setFromUnitVectors(up, spinAxis);

        if (azimuthRad !== 0) {
            const azimuthQuat = new THREE.Quaternion().setFromAxisAngle(
                new THREE.Vector3(0, 1, 0),
                azimuthRad
            );
            this.mesh.quaternion.premultiply(azimuthQuat);
        }

        this.rotationAxis = new THREE.Vector3(0, 1, 0);
        this.rotationSpeed = rotation.speed;
    }

    updateRotation(spinAxis: THREE.Vector3, speed: number) {
        const up = new THREE.Vector3(0, 1, 0);
        this.mesh.quaternion.setFromUnitVectors(up, spinAxis);
        this.rotationAxis = new THREE.Vector3(0, 1, 0);
        this.rotationSpeed = speed;
    }

    setRadius(newRadius: number) {
        const oldRadius = this.radius || 1;

        this.radius = newRadius;

        try {
            if (this.mesh && this.mesh.geometry) {
                this.mesh.geometry.dispose();
                this.mesh.geometry = new THREE.SphereGeometry(newRadius, 32, 32);
            }
        } catch (e) {
            console.error('Error updating body geometry radius:', e);
        }

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

        if (
            this.tidalLockEnabled &&
            this._tidalLockConfigured &&
            this.tidalLockTarget &&
            !this.tidalLockTarget._isDisposed &&
            this.tidalLockTarget.mesh
        ) {
            const spinAxis = this.tidalLockSpinAxis.clone().normalize();

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

                    // Prevent violent snap/oscillation when other transforms (e.g. user-applied
                    // tilt/azimuth) temporarily put the body far from its desired tidal-locked
                    // orientation. We cap the per-update correction angle.
                    const maxCorrectionRad = 0.25;
                    const correctionAngle = Math.max(
                        -maxCorrectionRad,
                        Math.min(maxCorrectionRad, angle)
                    );

                    this.mesh.rotateOnAxis(spinAxis, correctionAngle);
                }
            }
        } else {
            if (this.rotationSpeed !== 0) {
                this.mesh.rotateOnAxis(_Y_AXIS, this.rotationSpeed * dt);
            }
        }
    }

    /**
     * Update purely visual properties that don't affect physics.
     * Called once per rendered frame (after all substeps) rather than per substep.
     * @param dtTotal Total elapsed simulation time for this frame (sum of all substep dts).
     * @param cameraPos Camera world position (used for atmosphere shell fresnel calculation).
     */
    updateVisuals(dtTotal: number, _cameraPos?: THREE.Vector3) {
        if (this._isDisposed) return;

        if (this.clouds && typeof this.cloudRotationSpeed === 'number') {
            this.clouds.rotation.y += this.cloudRotationSpeed * dtTotal;
        }

        if (this.rings) {
            this.rings.position.copy(this.mesh.position);
            this.rings.quaternion.copy(this.mesh.quaternion);
        }
    }

    updateTrail(cameraPos: THREE.Vector3) {
        if (this._isDisposed) return;

        // Write new world-space position into the ring buffer — no Vector3 allocation, no Array.shift().
        const h3 = this._trailHead * 3;
        this._trailRing[h3] = this.mesh.position.x;
        this._trailRing[h3 + 1] = this.mesh.position.y;
        this._trailRing[h3 + 2] = this.mesh.position.z;
        this._trailHead = (this._trailHead + 1) % this.maxTrail;
        if (this._trailCount < this.maxTrail) this._trailCount++;

        if (this.trail) this.trail.position.copy(cameraPos);

        const cx = cameraPos.x;
        const cy = cameraPos.y;
        const cz = cameraPos.z;
        const count = this._trailCount;
        const maxT = this.maxTrail;

        if (count < maxT) {
            // Ring not yet full — elements are stored in order starting at index 0.
            for (let i = 0; i < count; i++) {
                const s = i * 3;
                this.trailPositions[s] = this._trailRing[s] - cx;
                this.trailPositions[s + 1] = this._trailRing[s + 1] - cy;
                this.trailPositions[s + 2] = this._trailRing[s + 2] - cz;
            }
        } else {
            // Ring is full — oldest sample is at _trailHead.
            // Copy in two contiguous segments to avoid per-element modulo arithmetic.
            const head = this._trailHead;
            const tail = maxT - head; // elements from head..maxT-1 (oldest first)
            for (let i = 0; i < tail; i++) {
                const src = (head + i) * 3;
                const dst = i * 3;
                this.trailPositions[dst] = this._trailRing[src] - cx;
                this.trailPositions[dst + 1] = this._trailRing[src + 1] - cy;
                this.trailPositions[dst + 2] = this._trailRing[src + 2] - cz;
            }
            for (let i = 0; i < head; i++) {
                const src = i * 3;
                const dst = (tail + i) * 3;
                this.trailPositions[dst] = this._trailRing[src] - cx;
                this.trailPositions[dst + 1] = this._trailRing[src + 1] - cy;
                this.trailPositions[dst + 2] = this._trailRing[src + 2] - cz;
            }
        }

        this.trailGeo.attributes.position.needsUpdate = true;
        this.trailGeo.setDrawRange(0, count);
    }

    updateLabel(newName: string) {
        this.name = newName;

        if (this.label) {
            const labelTexture = createTextTexture(newName);
            this.label.material.map = labelTexture;
            this.label.material.needsUpdate = true;
        }
    }

    /**
     * Converts a 2k texture URL to its 8k equivalent by replacing "2k/" with "8k/".
     * Returns null if the path doesn't contain "2k/".
     */
    static to8kUrl(url: string): string | null {
        if (url.includes('2k/')) {
            return url.replace('2k/', '8k/');
        }
        return null;
    }

    /**
     * Texture path slots for quality-based reloading.
     * Each slot maps to a material property on the mesh.
     */
    protected _texturePaths: Partial<Record<'map' | 'emissiveMap' | 'nightMap' | 'cloudMap', string>> = {};

    /**
     * Register a 2k texture path for a given slot. The path is used to derive
     * the 8k URL when the user switches to high-quality mode.
     */
    setTexturePath(slot: keyof typeof CelestialBody.prototype._texturePaths, path2k: string): void {
        this._texturePaths[slot] = path2k;
    }

    /**
     * Reload all registered textures at the specified quality level.
     * If a body has no 8k asset for a slot, the 2k texture is kept (silent fallback).
     * @param use8k Whether to attempt loading 8k textures.
     */
    reloadTextures(use8k: boolean): void {
        if (this._isDisposed) return;
        if (!this.mesh) return;

        const mat = this.mesh.material as THREE.MeshStandardMaterial | THREE.MeshPhongMaterial;
        if (!mat) return;

        const resolve = (slot: keyof typeof this._texturePaths): string | undefined => {
            const path2k = this._texturePaths[slot];
            if (!path2k) return undefined;
            if (use8k) {
                const url8k = CelestialBody.to8kUrl(path2k);
                // Only use 8k if a replacement was actually possible
                if (url8k) return url8k;
            }
            return path2k;
        };

        // Reload main diffuse map
        const mapUrl = resolve('map');
        if (mapUrl) {
            const newMap = loadSrgbTexture(mapUrl);
            if (mat.map) {
                mat.map.dispose();
            }
            mat.map = newMap;
        }

        // Reload emissive map
        const emissiveUrl = resolve('emissiveMap');
        if (emissiveUrl) {
            const newMap = loadSrgbTexture(emissiveUrl);
            if (mat.emissiveMap) {
                mat.emissiveMap.dispose();
            }
            mat.emissiveMap = newMap;
        }

        // Reload cloud texture if we have a separate cloud mesh
        const cloudUrl = resolve('cloudMap');
        if (cloudUrl && this.clouds) {
            const cloudMat = this.clouds.material as THREE.MeshStandardMaterial;
            if (cloudMat) {
                const newCloudMap = loadSrgbTexture(cloudUrl);
                if (cloudMat.map) cloudMat.map.dispose();
                cloudMat.map = newCloudMap;
                cloudMat.needsUpdate = true;
            }
        }

        mat.needsUpdate = true;
    }

    temperatureToColor(temp: number) {
        let r: number, g: number, b: number;

        if (temp >= 6000) {
            r = 1.0;
            g = 0.9 + (temp - 6000) / 40000;
            b = 1.0;
        } else if (temp >= 5000) {
            r = 1.0;
            g = 0.8 + ((temp - 5000) / 5000) * 0.1;
            b = 0.6 + ((temp - 5000) / 5000) * 0.4;
        } else if (temp >= 3500) {
            r = 1.0;
            g = 0.5 + ((temp - 3500) / 1500) * 0.3;
            b = 0.1 + ((temp - 3500) / 1500) * 0.5;
        } else {
            r = 1.0;
            g = Math.max(0.2, (temp / 3500) * 0.5);
            b = 0.0;
        }

        return new THREE.Color(r, g, b);
    }
}
