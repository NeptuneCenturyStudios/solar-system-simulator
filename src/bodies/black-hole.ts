import * as THREE from 'three';
import { SCALE_FACTOR, SUN_MASS, EARTH_DIST, G } from '../utilities/consts.js';
import { BodyType, BodyTypeEnum } from '../utilities/utilities.js';
import { CelestialBody } from './celestial-body.js';
import { IRotation } from '../physics/physics.js';
import { IStateDependencies, ISiphonTarget } from '../interfaces.js';
import { MassSiphonEffect } from '../effects/mass-siphon.js';

interface IAccretionDiskState {
    points: THREE.Points;
    vels: { inward: number; orbital: number; radius: number }[];
    angularPositions: number[];
    minRadius: number;
    maxRadius: number;
    opacities: Float32Array; // Per-particle opacity
}

declare module './black-hole.js' {
    interface BlackHole {
        accretion: IAccretionDiskState | null;
        accretionGlow: THREE.Sprite | null;
    }
}

const BLACK_HOLE_JET_POINT_SIZE = 4;
const BLACK_HOLE_JET_SPEED_BASE = 2000; // Base speed for jet particles, scaled by radius
const BLACK_HOLE_ACCRETION_DISK_POINT_SIZE = 4; // Angular spread for jet particles (as a fraction of speed)

/** Multiplier for the gravitational mass-transfer formula. Tune to taste. */
const SIPHON_MASS_TRANSFER_SCALE = 0.001;

export class BlackHole extends CelestialBody {
    jet: {
        points: THREE.Points;
        positions: Float32Array;
        velocities: Float32Array;
        ages: Float32Array;
        origins: Float32Array;
        maxAge: number;
    } | null = null;
    dependencies: IStateDependencies;
    accretion: IAccretionDiskState | null = null;
    accretionGlow: THREE.Sprite | null = null;
    /** Active siphon stream effects, keyed by the source star's id. */
    siphonEffects: Map<string, MassSiphonEffect> = new Map();

    static massToEventHorizonRadius(mass: number) {
        // "Compress" a star's mass into a tiny sphere.
        // Baseline: at 3 solar masses, radius ~= 1 (much smaller than Earth in our sim units).
        const BASE_MASS = 3 * SUN_MASS;
        const BASE_RADIUS = 1 * SCALE_FACTOR;

        // Constant-density approximation: radius scales with the cube root of mass.
        // This keeps black holes visually small while still allowing growth via absorption.
        const r = BASE_RADIUS * Math.cbrt(Math.max(0, mass) / BASE_MASS);

        // Clamp to avoid degenerate geometry / rendering issues.
        return Math.max(0.25 * SCALE_FACTOR, r);
    }

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        pos: THREE.Vector3,
        mass: number,
        id = 'blackHole',
        name = 'Black Hole',
        rotation: IRotation
    ) {
        const EVENT_HORIZON_RADIUS = BlackHole.massToEventHorizonRadius(mass);
        const BLACK_HOLE_COLOR = 0x000000; // Pure black

        super(
            dependencies,
            scene,
            EVENT_HORIZON_RADIUS,
            BLACK_HOLE_COLOR,
            pos,
            new THREE.Vector3(0, 0, 0),
            mass,
            id,
            name,
            BodyType.BlackHole,
            0xffffff,
            500,
            false,
            rotation
        );

        this.dependencies = dependencies;

        // Make mesh pitch black and emissive
        const blackHoleMaterial = this.mesh.material as THREE.MeshStandardMaterial;
        blackHoleMaterial.color.setHex(0x000000);
        blackHoleMaterial.emissive.setHex(0x000000);
        blackHoleMaterial.emissiveIntensity = 0;
        blackHoleMaterial.metalness = 1;
        blackHoleMaterial.roughness = 0;

        // Create accretion disk glow (orange ring around black hole)
        this.createAccretionGlow();

        // Create continuous particle accretion animation
        this.accretion = this.createAccretionDisk();

        // Create continuous jet effect
        this.jet = this.createJet();
    }

    createAccretionGlow() {
        // Glowing ring at event horizon edge
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 256;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

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
        this.accretionGlow.scale.setScalar(this.radius * 10);
        this.accretionGlow.position.copy(this.mesh.position);
        this.scene.add(this.accretionGlow);
    }

    createAccretionDisk() {
        const count = 400;
        const geo = new THREE.BufferGeometry();
        const pArr = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const opacities = new Float32Array(count); // Per-particle opacity
        const vels = [];
        const angularPositions = []; // Track angle for spiral motion

        const minRadius = this.radius * 2;
        const maxRadius = minRadius * 32;

        // Opacity: more opaque near center, more transparent at outer edge
        const minOpacity = 0.05;
        const maxOpacity = 1.0;

        for (let i = 0; i < count; i++) {
            // Start particles in a disk around black hole
            const angle = Math.random() * Math.PI * 2;
            const radius = minRadius + Math.random() * (maxRadius - minRadius);
            const verticalSpread = (Math.random() - 0.5) * this.radius * 0.75;

            pArr[i * 3] = Math.cos(angle) * radius;
            pArr[i * 3 + 1] = verticalSpread;
            pArr[i * 3 + 2] = Math.sin(angle) * radius;

            // Store angular position for spiral motion
            angularPositions.push(angle);

            // Velocity: spiral inward + orbital motion
            const inwardSpeed = (0.12 + Math.random() * 0.1) * SCALE_FACTOR;
            const orbitalSpeed = Math.sqrt(this.mass / radius) * 0.005; // Keplerian orbital velocity

            vels.push({
                inward: inwardSpeed,
                orbital: orbitalSpeed,
                radius: radius,
            });

            // Color: white-hot to orange gradient
            const t = (radius - minRadius) / (maxRadius - minRadius);
            // Outer: dark orange/red (e.g., RGB 0.8, 0.2, 0.05), Inner: white (1.0, 1.0, 0.95)
            const r = 1.0; // Red
            const g = 1.0; // Green
            const b = 0.95; // Blue
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;

            // Opacity: more opaque near center, more transparent at outer edge
            opacities[i] = maxOpacity - t * (maxOpacity - minOpacity);
        }

        geo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.setAttribute('alpha', new THREE.BufferAttribute(opacities, 1));

        // Custom ShaderMaterial for per-particle color and alpha

        const mat = new THREE.PointsMaterial({
            size: BLACK_HOLE_ACCRETION_DISK_POINT_SIZE * this.radius,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false, // Prevents particles from cutting "holes" in each other
            depthTest: true, // Allows the black hole sphere to hide particles behind it
        });

        // Inject your custom shader logic
        mat.onBeforeCompile = (shader) => {
            // 1. Add your uniforms
            shader.uniforms.pointSize = {
                value: BLACK_HOLE_ACCRETION_DISK_POINT_SIZE * this.radius,
            };

            // 2. Vertex Shader: Inject size attenuation or custom logic
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
         attribute float alpha; // If you still want to use your custom attributes
         varying float vAlpha;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                `void main() {
         vAlpha = alpha;`
            );

            // 3. Fragment Shader: Fix the "Squares" (Circular Discard)
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
         varying float vAlpha;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `void main() {
         float dist = length(gl_PointCoord - vec2(0.5));
         if (dist > 0.5) discard; // Hard-kills the square corners
         float strength = smoothstep(0.5, 0.1, dist);`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
                'gl_FragColor = vec4( outgoingLight, vAlpha * strength );'
            );
        };

        const points = new THREE.Points(geo, mat);
        points.renderOrder = 999;
        points.frustumCulled = false;
        this.scene.add(points);

        return { points, vels, angularPositions, minRadius, maxRadius, opacities };
    }

    createJet() {
        const jetCount = 100;
        const velocities = new Float32Array(jetCount * 3);
        const ages = new Float32Array(jetCount);
        const origins = new Float32Array(jetCount * 3); // Store spawn origin for each particle
        const maxAge = 0.7; // seconds (shorter lifetime for straighter jet)
        const r = this.radius;
        for (let i = 0; i < jetCount; i++) {
            // Alternate between top and bottom pole
            const up = i % 2 === 0 ? 1 : -1;
            // Jet velocity: mostly along Y, with slight random XZ spread, scaled by radius
            const speed = BLACK_HOLE_JET_SPEED_BASE * r;
            const spread = 0.08; // constant angular fraction — keeps jet narrow at all radii
            velocities[i * 3] = (Math.random() - 0.5) * spread * speed;
            velocities[i * 3 + 1] = up * speed;
            velocities[i * 3 + 2] = (Math.random() - 0.5) * spread * speed;
            ages[i] = Math.random() * maxAge;
            // Spawn at pole offset by radius
            origins[i * 3] = this.mesh.position.x;
            origins[i * 3 + 1] = this.mesh.position.y + up * r;
            origins[i * 3 + 2] = this.mesh.position.z;
        }
        const geo = new THREE.BufferGeometry();
        // We'll fill the position attribute each frame
        const positions = new Float32Array(jetCount * 3);
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        // Jet color: white-hot
        const colors = new Float32Array(jetCount * 3);
        for (let i = 0; i < jetCount; i++) {
            colors[i * 3] = 0.85; // R
            colors[i * 3 + 1] = 0.95; // G
            colors[i * 3 + 2] = 1.0; // B (more blue)
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        // Opacity: fade out with age
        const opacities = new Float32Array(jetCount);
        for (let i = 0; i < jetCount; i++) opacities[i] = 1.0;
        geo.setAttribute('alpha', new THREE.BufferAttribute(opacities, 1));
        const mat = new THREE.ShaderMaterial({
            uniforms: {
                pointSize: { value: BLACK_HOLE_JET_POINT_SIZE * r },
            },
            vertexShader: `
                precision mediump float;
                attribute vec3 color;
                attribute float alpha;
                varying vec3 vColor;
                varying float vAlpha;
                uniform float pointSize;
                void main() {
                    vColor = color;
                    vAlpha = alpha;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    gl_PointSize = pointSize * (300.0 / -mvPosition.z);
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                precision mediump float;
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    float dist = length(gl_PointCoord - vec2(0.5));
                    float alpha = vAlpha * smoothstep(0.5, 0.48, 0.5 - dist);
                    gl_FragColor = vec4(vColor, alpha);
                    if (gl_FragColor.a < 0.01) discard;
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        this.scene.add(points);
        return { points, positions, velocities, ages, origins, maxAge };
    }

    setRadius(newRadius: number) {
        super.setRadius(newRadius);

        if (this.accretionGlow) {
            this.accretionGlow.scale.setScalar(newRadius * 10);
        }

        if (this.jet) {
            const mat = this.jet.points.material as THREE.ShaderMaterial;
            mat.uniforms.pointSize.value = BLACK_HOLE_JET_POINT_SIZE * newRadius;
        }

        // Recreate accretion disk so particle count and radii match the new size
        this.disposeAccretionDisk();
        this.accretion = this.createAccretionDisk();
    }

    disposeAccretionDisk() {
        if (this.accretion && this.accretion.points) {
            this.scene.remove(this.accretion.points);
            this.accretion.points.geometry.dispose();
            const mat = this.accretion.points.material;
            if (!Array.isArray(mat)) mat.dispose();
        }
        this.accretion = null;
    }

    updateAccretion(dt: number) {
        if (!this.accretion) return;

        const absDt = Math.abs(dt) / 10;

        const p = this.accretion.points.geometry.attributes.position.array;
        const opacities = this.accretion.opacities;
        const count = p.length / 3;
        const minRadius = this.accretion.minRadius;
        const maxRadius = this.accretion.maxRadius;
        const minOpacity = 0.2;
        const maxOpacity = 0.9;
        const colors = this.accretion.points.geometry.attributes.color.array;

        for (let i = 0; i < count; i++) {
            // Get current position relative to black hole
            const dx = p[i * 3];
            const dz = p[i * 3 + 2];
            const radius = Math.sqrt(dx * dx + dz * dz); // Distance in XZ plane

            // Spiral inward
            const vel = this.accretion.vels[i];
            // Inward speed increases as radius decreases (e.g., proportional to 1/r)
            const inwardSpeed = vel.inward * (maxRadius / Math.max(radius, 1));
            const newRadius = radius - inwardSpeed * absDt;

            // Color/heat mapping: t=0 (inner) is white/yellow, t=1 (outer) is dim red/orange
            const t = (newRadius - minRadius) / (maxRadius - minRadius);
            // Outer: dark orange/red (e.g., RGB 0.8, 0.2, 0.05), Inner: white/yellow (1.0, 0.95, 0.7)
            const r = 0.8 + (1.0 - 0.8) * (1 - t); // 0.8→1.0
            const g = 0.2 + (0.95 - 0.2) * (1 - t); // 0.2→0.95
            const b = 0.05 + (0.7 - 0.05) * (1 - t); // 0.05→0.7
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;

            // If particle reaches the inner buffer, respawn at outer edge
            if (newRadius < this.radius + 2 * SCALE_FACTOR) {
                // Respawn at outer edge
                const angle = Math.random() * Math.PI * 2;
                const respawnRadius = maxRadius;
                p[i * 3] = Math.cos(angle) * respawnRadius;
                p[i * 3 + 1] = (Math.random() - 0.5) * this.radius * 0.75;
                p[i * 3 + 2] = Math.sin(angle) * respawnRadius;
                this.accretion.angularPositions[i] = angle;
                // Reset velocity to match initial spawn logic
                const inwardSpeed0 = (0.12 + Math.random() * 0.1) * SCALE_FACTOR;
                const orbitalSpeed = Math.sqrt(this.mass / respawnRadius) * 0.005;
                this.accretion.vels[i] = {
                    inward: inwardSpeed0,
                    orbital: orbitalSpeed,
                    radius: respawnRadius,
                };
                // Reset opacity to min at respawn (most transparent at outer edge)
                opacities[i] = minOpacity;
                // Reset color to outer color
                colors[i * 3] = 0.8;
                colors[i * 3 + 1] = 0.2;
                colors[i * 3 + 2] = 0.05;
            } else {
                // Update orbital position (spiral motion)
                this.accretion.angularPositions[i] += vel.orbital * absDt;
                const angle = this.accretion.angularPositions[i];

                p[i * 3] = Math.cos(angle) * newRadius;
                p[i * 3 + 2] = Math.sin(angle) * newRadius;
                // Y stays roughly the same but flatten toward disk as it approaches
                p[i * 3 + 1] = p[i * 3 + 1] * 0.98;

                this.accretion.vels[i].radius = newRadius;

                // Update opacity based on new radius (more opaque near center)
                opacities[i] = maxOpacity - t * (maxOpacity - minOpacity);
            }
        }

        // TODO: Jet effect - add/update jet particle system here

        this.accretion.points.geometry.attributes.position.needsUpdate = true;
        this.accretion.points.geometry.attributes.alpha.needsUpdate = true;
        this.accretion.points.geometry.attributes.color.needsUpdate = true;

        // Update glow position
        if (this.accretionGlow) {
            this.accretionGlow.position.copy(this.mesh.position);
        }
    }

    update(acc: THREE.Vector3, dt: number) {
        // Call parent update for physics
        super.update(acc, dt);

        // Update accretion disk animation
        this.updateAccretion(dt);

        // Update jet
        if (this.jet) {
            const absDt = Math.abs(dt);
            // Update point size uniform to match current radius
            const r = this.radius;
            const mat = this.jet.points.material as THREE.ShaderMaterial;
            if (mat.uniforms.pointSize.value !== BLACK_HOLE_JET_POINT_SIZE * r) {
                mat.uniforms.pointSize.value = BLACK_HOLE_JET_POINT_SIZE * r;
            }
            if (absDt > 0) {
                const { points, velocities, ages, origins, maxAge } = this.jet;
                const posAttr = points.geometry.attributes.position;
                const alphaAttr = points.geometry.attributes.alpha;
                for (let i = 0; i < velocities.length / 3; i++) {
                    ages[i] += absDt;
                    if (ages[i] > maxAge) {
                        // Respawn at pole, offset by radius
                        const up = i % 2 === 0 ? 1 : -1;
                        const speed = 120 * r;
                        const spread = 0.08; // constant angular fraction — keeps jet narrow at all radii
                        velocities[i * 3] = (Math.random() - 0.5) * spread * speed;
                        velocities[i * 3 + 1] = up * speed;
                        velocities[i * 3 + 2] = (Math.random() - 0.5) * spread * speed;
                        ages[i] = 0;
                        // Store new origin at current black hole position, offset by radius
                        origins[i * 3] = this.mesh.position.x;
                        origins[i * 3 + 1] = this.mesh.position.y + up * r;
                        origins[i * 3 + 2] = this.mesh.position.z;
                    }
                    // Fade out with age
                    alphaAttr.array[i] = 1.0 - ages[i] / maxAge;
                    // Compute world position: origin + velocity * age
                    posAttr.array[i * 3] = origins[i * 3] + velocities[i * 3] * ages[i];
                    posAttr.array[i * 3 + 1] = origins[i * 3 + 1] + velocities[i * 3 + 1] * ages[i];
                    posAttr.array[i * 3 + 2] = origins[i * 3 + 2] + velocities[i * 3 + 2] * ages[i];
                }
                posAttr.needsUpdate = true;
                alphaAttr.needsUpdate = true;
            }
        }

        // Keep accretion disk centered on black hole
        if (this.accretion && this.accretion.points) {
            this.accretion.points.position.copy(this.mesh.position);
        }

        // Keep halo sized to current black hole radius (black holes can grow via absorption)
        if (this.accretionGlow) {
            this.accretionGlow.scale.setScalar(this.radius * 10);
        }

        this.updateSiphon(dt);
    }

    /**
     * Checks all living, non-white-dwarf stars within EARTH_DIST (1 AU).
     * Creates / maintains / removes MassSiphonEffect instances and transfers
     * mass (and fuel) from each in-range star to this black hole.
     */
    private updateSiphon(dt: number): void {
        if (dt === 0 || this._isDisposed) return;

        const absDt = Math.abs(dt);
        const bodies = this.dependencies.getBodies();

        // Filter to active, non-white-dwarf stars.
        const stars = bodies.filter(
            (b): b is typeof b & ISiphonTarget =>
                !b._isDisposed &&
                !!(b.bodyType & BodyTypeEnum.Star) &&
                !(b.bodyType & BodyTypeEnum.WhiteDwarf) &&
                'triggerStarDeath' in b
        ) as unknown as ISiphonTarget[];

        const inRangeIds = new Set<string>();

        for (const star of stars) {
            const dist = star.mesh.position.distanceTo(this.mesh.position);
            if (dist > EARTH_DIST) continue;

            inRangeIds.add(star.id);

            // Start a new siphon stream if one does not already exist.
            if (!this.siphonEffects.has(star.id)) {
                const effect = new MassSiphonEffect(this.dependencies, this.scene, star, this);
                this.siphonEffects.set(star.id, effect);
                this.dependencies.addEvent(`${this.name} is siphoning mass from ${star.name}`);
            }

            // Advance the particle animation each frame.
            this.siphonEffects.get(star.id)?.update(dt);

            // Gravitational mass-transfer: proportional to G·M_bh·M_star / r².
            const distSafe = Math.max(dist, 1);
            const transfer =
                ((G * this.mass * star.mass) / (distSafe * distSafe)) *
                SIPHON_MASS_TRANSFER_SCALE *
                absDt;

            star.mass = Math.max(0, star.mass - transfer);

            // Fuel drain uses the same ratio as Star's initial fuel assignment:
            //   maxFuel = mass * 100000 * SCALE_FACTOR
            if (star.fuel !== null) {
                star.fuel = Math.max(0, star.fuel - transfer * 100000 * SCALE_FACTOR);
            }

            // Trigger star death when mass or fuel is fully depleted by the siphon.
            const massGone = star.mass <= 0;
            const fuelGone = star.fuel !== null && star.fuel <= 0;
            if (massGone || fuelGone) {
                star.mass = 0;
                if (star.fuel !== null) star.fuel = 0;

                const isMassiveStar = star.initialMass > SUN_MASS * 3.3;
                star.triggerStarDeath(isMassiveStar);

                const effect = this.siphonEffects.get(star.id);
                if (effect) {
                    effect.dispose();
                    this.siphonEffects.delete(star.id);
                }
                inRangeIds.delete(star.id);
            }
        }

        // Clean up effects for stars that moved out of range or were disposed externally.
        for (const [starId, effect] of Array.from(this.siphonEffects.entries())) {
            if (!inRangeIds.has(starId)) {
                effect.dispose();
                this.siphonEffects.delete(starId);
            }
        }
    }

    die() {
        // Clean up jet
        if (this.jet) {
            this.scene.remove(this.jet.points);
            this.jet.points.geometry.dispose();
            const jetMat = this.jet.points.material;
            if (!Array.isArray(jetMat)) jetMat.dispose();
            this.jet = null;
        }

        // Clean up accretion disk
        this.disposeAccretionDisk();

        // Clean up glow
        if (this.accretionGlow) {
            this.scene.remove(this.accretionGlow);
        }

        // Clean up all active siphon streams.
        for (const effect of this.siphonEffects.values()) {
            effect.dispose();
        }
        this.siphonEffects.clear();

        // Call parent die (no explosion for black hole)
        super.die(true);
    }
}
