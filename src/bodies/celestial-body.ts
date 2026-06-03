import * as THREE from 'three';
import { Body } from './body';
import { isBodyType } from '../utilities/utilities';
import { IRotation } from '../interfaces';
import { ParticleExplosion } from '../effects/particle-explosion';
import { SeededRandom } from '../utilities/prng';
import { triggerScreenFlash } from '../effects/screen-flash';
import { C, DIST_SCALE } from '../utilities/consts';
import { createTextTexture } from '../drawing/text-texture';
import { IStateDependencies } from '../interfaces';
import { NotificationType } from '../event-log/event-log';
import { BodyTypeEnum } from './body-enums';

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

    rotationSpeed!: number;
    rotationAxis!: THREE.Vector3;

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
        tidalLock?: ITidalLockOptions
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

        this.dependencies = dependencies;
        this.scene = scene;
        this.radius = radius;
        this.mass = mass;
        this.color = color;
        this.bodyType = bodyType;
        this.rotation = rotation;

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
                    this.tidalLockSpinAxis = new THREE.Vector3(...tidalLock.spinAxisWorld).normalize();
                } else {
                    this.tidalLockSpinAxis = new THREE.Vector3(
                        tidalLock.spinAxisWorld.x,
                        tidalLock.spinAxisWorld.y,
                        tidalLock.spinAxisWorld.z
                    ).normalize();
                }
            }

            if (tidalLock.faceAxisLocal) {
                this.tidalLockFaceAxisLocal = new THREE.Vector3(...tidalLock.faceAxisLocal).normalize();
            }

            this.tidalLockAngularSpeed = tidalLock.angularSpeed;
            this._tidalLockConfigured = true;
        }

        this.baseColor = new THREE.Color(color);

        this.maxTrail = maxTrail;
        this.history = [];
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
            const ringCount = 3000000 / DIST_SCALE;
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

    die(skipExplosion = false) {
        if (this._isDisposed) return;

        super.die();

        if (typeof this.dependencies.addEvent !== 'undefined') {
            this.dependencies.addEvent({
                message: `${this.name} destroyed`,
                notificationType: NotificationType.Alert,
            });
        }

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

        if (this.mesh) {
            const isBodyStar = isBodyType(this, BodyTypeEnum.Star);
            this.mesh.castShadow = !isBodyStar;
            this.mesh.receiveShadow = !isBodyStar;
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
                const r0 = new THREE.Vector3().subVectors(this.mesh.position, this.tidalLockTarget.mesh.position);
                const vrel0 = this.velocity.clone().sub(this.tidalLockTarget.velocity || new THREE.Vector3());
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
                    const angle = Math.acos(
                        THREE.MathUtils.clamp(faceWorld.dot(toTargetPlanar), -1, 1)
                    ) * sign;

                    // Prevent violent snap/oscillation when other transforms (e.g. user-applied
                    // tilt/azimuth) temporarily put the body far from its desired tidal-locked
                    // orientation. We cap the per-update correction angle.
                    const maxCorrectionRad = 0.25;
                    const correctionAngle = Math.max(-maxCorrectionRad, Math.min(maxCorrectionRad, angle));

                    this.mesh.rotateOnAxis(spinAxis, correctionAngle);
                }
            }
        } else {
            if (this.rotationSpeed !== 0) {
                this.mesh.rotateOnAxis(new THREE.Vector3(0, 1, 0), this.rotationSpeed * dt);
            }
        }

        if (this.clouds && typeof this.cloudRotationSpeed === 'number') {
            this.clouds.rotation.y += this.cloudRotationSpeed * dt;
        }

        if (this.rings) {
            this.rings.position.copy(this.mesh.position);
            this.rings.quaternion.copy(this.mesh.quaternion);
        }
    }

    updateTrail(cameraPos: THREE.Vector3) {
        if (this._isDisposed) return;
        this.history.push(this.mesh.position.clone());
        if (this.history.length > this.maxTrail) this.history.shift();

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


    updateLabel(newName: string) {
        this.name = newName;

        if (this.label) {
            const labelTexture = createTextTexture(newName);
            this.label.material.map = labelTexture;
            this.label.material.needsUpdate = true;
        }
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

