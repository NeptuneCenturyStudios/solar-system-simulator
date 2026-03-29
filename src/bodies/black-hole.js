import * as THREE from 'three';
import { SUN_MASS } from '../utilities/consts.js';
import { BodyType } from '../utilities/utilities.js';
import { CelestialBody } from './celestial-body.js';

export class BlackHole extends CelestialBody {
    static massToEventHorizonRadius(mass) {
        // "Compress" a star's mass into a tiny sphere.
        // Baseline: at 3 solar masses, radius ~= 1 (much smaller than Earth in our sim units).
        const BASE_MASS = 3 * SUN_MASS;
        const BASE_RADIUS = 1;

        // Constant-density approximation: radius scales with the cube root of mass.
        // This keeps black holes visually small while still allowing growth via absorption.
        const r = BASE_RADIUS * Math.cbrt(Math.max(0, mass) / BASE_MASS);

        // Clamp to avoid degenerate geometry / rendering issues.
        return Math.max(0.25, r);
    }

    constructor(dependencies, scene, pos, mass, id = 'blackHole', name = 'Black Hole') {
        const EVENT_HORIZON_RADIUS = BlackHole.massToEventHorizonRadius(mass);
        const BLACK_HOLE_COLOR = 0x000000; // Pure black

        super(
            dependencies,
            scene,
            EVENT_HORIZON_RADIUS,
            BLACK_HOLE_COLOR,
            pos,
            [0, 0, 0], // Black holes don't move initially
            mass,
            id,
            name,
            BodyType.BlackHole,
            0xffffff,
            500
        );

        this.isBlackHole = true;
        this.eventHorizonRadius = EVENT_HORIZON_RADIUS;

        // Make mesh pitch black and emissive
        this.mesh.material.color.setHex(0x000000);
        this.mesh.material.emissive.setHex(0x000000);
        this.mesh.material.emissiveIntensity = 0;
        this.mesh.material.metalness = 1;
        this.mesh.material.roughness = 0;

        // Create accretion disk glow (orange ring around black hole)
        this.createAccretionGlow();

        // Create continuous particle accretion animation
        this.accretion = this.createAccretionDisk();
    }

    createAccretionGlow() {
        // Glowing ring at event horizon edge
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');

        // Clear to fully transparent
        ctx.clearRect(0, 0, 256, 256);

        // Create radial gradient (bright orange/yellow at edge)
        const gradient = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
        gradient.addColorStop(0, 'rgba(255, 100, 0, 0)');
        gradient.addColorStop(0.7, 'rgba(255, 150, 50, 0.8)');
        gradient.addColorStop(0.85, 'rgba(255, 200, 100, 0.9)');
        gradient.addColorStop(1, 'rgba(255, 120, 0, 0)');

        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 256, 256);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({
            map: texture,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
        });

        this.accretionGlow = new THREE.Sprite(spriteMat);
        this.accretionGlow.scale.setScalar(this.eventHorizonRadius * 8);
        this.accretionGlow.position.copy(this.mesh.position);
        this.scene.add(this.accretionGlow);
    }

    createAccretionDisk() {
        const count = 3000;
        const geo = new THREE.BufferGeometry();
        const pArr = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const vels = [];
        const angularPositions = []; // Track angle for spiral motion

        const minRadius = this.eventHorizonRadius * 5;
        const maxRadius = this.eventHorizonRadius * 25;

        for (let i = 0; i < count; i++) {
            // Start particles in a disk around black hole
            const angle = Math.random() * Math.PI * 2;
            const radius = minRadius + Math.random() * (maxRadius - minRadius);
            const verticalSpread = (Math.random() - 0.5) * this.eventHorizonRadius * 2;

            pArr[i * 3] = Math.cos(angle) * radius;
            pArr[i * 3 + 1] = verticalSpread;
            pArr[i * 3 + 2] = Math.sin(angle) * radius;

            // Store angular position for spiral motion
            angularPositions.push(angle);

            // Velocity: spiral inward + orbital motion
            const inwardSpeed = 0.5 + Math.random() * 0.5;
            const orbitalSpeed = Math.sqrt(this.mass / radius) * 0.1; // Keplerian orbital velocity

            vels.push({
                inward: inwardSpeed,
                orbital: orbitalSpeed,
                radius: radius,
            });

            // Color: white-hot to orange gradient
            const heat = 1 - (radius - minRadius) / (maxRadius - minRadius);
            colors[i * 3] = 1.0; // Red
            colors[i * 3 + 1] = 0.5 + heat * 0.5; // Green (more at center)
            colors[i * 3 + 2] = heat * 0.3; // Blue (less overall)
        }

        geo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.PointsMaterial({
            size: 5,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0.9,
            depthWrite: false,
        });

        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        this.scene.add(points);

        return { points, vels, angularPositions, minRadius, maxRadius };
    }

    updateAccretion(dt) {
        if (!this.accretion) return;

        const p = this.accretion.points.geometry.attributes.position.array;
        const count = p.length / 3;

        for (let i = 0; i < count; i++) {
            // Get current position relative to black hole
            const dx = p[i * 3];
            const _dy = p[i * 3 + 1];
            const dz = p[i * 3 + 2];
            const radius = Math.sqrt(dx * dx + dz * dz); // Distance in XZ plane

            // Spiral inward
            const vel = this.accretion.vels[i];
            const newRadius = radius - vel.inward * (dt * 60);

            // If particle reaches event horizon, respawn at outer edge
            if (newRadius < this.eventHorizonRadius * 2) {
                // Respawn at outer edge
                const angle = Math.random() * Math.PI * 2;
                const respawnRadius = this.accretion.maxRadius;
                p[i * 3] = Math.cos(angle) * respawnRadius;
                p[i * 3 + 1] = (Math.random() - 0.5) * this.eventHorizonRadius * 2;
                p[i * 3 + 2] = Math.sin(angle) * respawnRadius;
                this.accretion.angularPositions[i] = angle;
                this.accretion.vels[i].radius = respawnRadius;
            } else {
                // Update orbital position (spiral motion)
                this.accretion.angularPositions[i] += vel.orbital * (dt * 60);
                const angle = this.accretion.angularPositions[i];

                p[i * 3] = Math.cos(angle) * newRadius;
                p[i * 3 + 2] = Math.sin(angle) * newRadius;
                // Y stays roughly the same but flatten toward disk as it approaches
                p[i * 3 + 1] = p[i * 3 + 1] * 0.98;

                this.accretion.vels[i].radius = newRadius;
            }
        }

        this.accretion.points.geometry.attributes.position.needsUpdate = true;

        // Update glow position
        if (this.accretionGlow) {
            this.accretionGlow.position.copy(this.mesh.position);
        }
    }

    update(acc, dt) {
        // Call parent update for physics
        super.update(acc, dt);

        // Update accretion disk animation
        this.updateAccretion(dt);

        // Keep accretion disk centered on black hole
        if (this.accretion && this.accretion.points) {
            this.accretion.points.position.copy(this.mesh.position);

            // Keep disk sized to current black hole radius (black holes can grow via absorption).
            // Base disk radii are authored relative to EVENT_HORIZON_RADIUS, so we scale by the
            // ratio of current radius to initial event horizon radius.
            const diskScale = Math.max(0.01, this.radius / this.eventHorizonRadius);
            this.accretion.points.scale.setScalar(diskScale);
        }

        // Keep halo sized to current black hole radius (black holes can grow via absorption)
        if (this.accretionGlow) {
            this.accretionGlow.scale.setScalar(this.radius * 8);
        }
    }

    die(_skipExplosion = true) {
        // Clean up accretion disk
        if (this.accretion && this.accretion.points) {
            this.scene.remove(this.accretion.points);
            this.accretion.points.geometry.dispose();
            this.accretion.points.material.dispose();
        }

        // Clean up glow
        if (this.accretionGlow) {
            this.scene.remove(this.accretionGlow);
            if (this.accretionGlow.material.map) {
                this.accretionGlow.material.map.dispose();
            }
            this.accretionGlow.material.dispose();
        }

        // Call parent die (no explosion for black hole)
        super.die(true);
    }
}
