import * as THREE from 'three';
import { SCALE_FACTOR, SUN_MASS, EARTH_DIST, G } from '../utilities/consts.js';
import { BodyTypeEnum } from '../utilities/utilities.js';
import { CelestialBody } from './celestial-body.js';
import { IRotation } from '../physics/physics.js';
import { IStateDependencies, ISiphonTarget } from '../interfaces.js';
import { IPipelineFeedEffect } from '../effects/effect-base.js';
import { MassSiphonEffect } from '../effects/mass-siphon.js';

interface IAccretionDiskState {
    points: THREE.Points;
    vels: { inward: number; orbital: number; radius: number }[];
    angularPositions: number[];
    minRadius: number;
    maxRadius: number;
    opacities: Float32Array; // Per-particle opacity
    /** 1 = slot is occupied by a live particle, 0 = slot is free. */
    activeFlags: Uint8Array;
}

declare module './black-hole.js' {
    interface BlackHole {
        accretion: IAccretionDiskState | null;
        accretionGlow: THREE.Sprite | null;
    }
}

const BLACK_HOLE_JET_POINT_SIZE = 4;
const BLACK_HOLE_JET_SPEED_BASE = 120; // Base speed for jet particles, scaled by radius
const BLACK_HOLE_ACCRETION_DISK_POINT_SIZE = 4;
/** How many jet particles are injected for each accretion-disk particle that reaches the event horizon.
 *  >1 reflects the energy amplification of relativistic jets vs. the infalling matter stream. */
const JET_PARTICLES_PER_ACCRETION = 10;

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
        activeFlags: Uint8Array;
    } | null = null;
    dependencies: IStateDependencies;
    accretion: IAccretionDiskState | null = null;
    accretionGlow: THREE.Sprite | null = null;
    /** Active siphon stream effects, keyed by the source star's id. */
    siphonEffects: Map<string, IPipelineFeedEffect> = new Map();

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
        rotation: IRotation,
        spawnedFromSupernova = false
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
            BodyTypeEnum.BlackHole,
            0xffffff,
            500,
            false,
            rotation,
            undefined,
            new THREE.MeshBasicMaterial({ color: 0x000000 })
        );

        this.dependencies = dependencies;

        // Create accretion disk glow (orange ring around black hole) - Keep for now since we may use it for performance options
        //this.createAccretionGlow();

        // Create continuous particle accretion animation
        this.accretion = this.createAccretionDisk();

        // Create continuous jet effect
        this.jet = this.createJet();

        // Seed the accretion disk with remnant particles when born from a supernova.
        // These represent the collapsing stellar envelope — they spiral inward and eject
        // through the jet naturally, giving the newborn black hole immediate visual activity.
        if (spawnedFromSupernova) {
            const SEED_COUNT = 400;
            for (let i = 0; i < SEED_COUNT; i++) {
                const angle = i * ((2 * Math.PI) / SEED_COUNT);
                this.injectIntoAccretionDisk(angle);
            }
        }
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
        const count = 800;
        const geo = new THREE.BufferGeometry();
        const pArr = new Float32Array(count * 3);
        const colors = new Float32Array(count * 3);
        const opacities = new Float32Array(count); // Per-particle opacity — all start at 0
        const activeFlags = new Uint8Array(count); // all 0 = all inactive
        const vels = [];
        const angularPositions = []; // Track angle for spiral motion

        const minRadius = this.radius * 2;
        const maxRadius = minRadius * 32;

        for (let i = 0; i < count; i++) {
            // All slots start inactive — placed at origin, invisible. They are activated via
            // injectIntoAccretionDisk() once particles arrive from the siphon stream.
            angularPositions.push(0);
            vels.push({ inward: 0, orbital: 0, radius: maxRadius });
            pArr[i * 3] = 0;
            pArr[i * 3 + 1] = 0;
            pArr[i * 3 + 2] = 0;
            colors[i * 3] = 0.8;
            colors[i * 3 + 1] = 0.2;
            colors[i * 3 + 2] = 0.05;
            opacities[i] = 0;
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
            // Replace the include directive (the expanded gl_FragColor line doesn't exist in onBeforeCompile)
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                'gl_FragColor = vec4( outgoingLight, vAlpha * strength );'
            );
        };

        const points = new THREE.Points(geo, mat);
        points.renderOrder = 999;
        points.frustumCulled = false;
        this.scene.add(points);

        return { points, vels, angularPositions, minRadius, maxRadius, opacities, activeFlags };
    }

    /**
     * Injects one particle into the accretion disk at the given angle on the outer edge.
     * Called by the siphon stream callback when a siphon particle completes its path.
     */
    injectIntoAccretionDisk(angle: number): void {
        if (!this.accretion) return;

        // Find a free slot.
        let slot = -1;
        for (let i = 0; i < this.accretion.activeFlags.length; i++) {
            if (this.accretion.activeFlags[i] === 0) { slot = i; break; }
        }
        if (slot === -1) return; // pool full — drop silently

        const { maxRadius, vels, angularPositions, opacities } = this.accretion;
        const p = this.accretion.points.geometry.attributes.position.array as Float32Array;
        const colors = this.accretion.points.geometry.attributes.color.array as Float32Array;
        const verticalSpread = (Math.random() - 0.5) * this.radius * 0.75;

        p[slot * 3]     = Math.cos(angle) * maxRadius;
        p[slot * 3 + 1] = verticalSpread;
        p[slot * 3 + 2] = Math.sin(angle) * maxRadius;

        angularPositions[slot] = angle;

        const inwardSpeed = (0.12 + Math.random() * 0.1) * SCALE_FACTOR;
        const orbitalSpeed = Math.sqrt(this.mass / maxRadius) * 0.005;
        vels[slot] = { inward: inwardSpeed, orbital: orbitalSpeed, radius: maxRadius };

        // Outer-edge colour (dim orange/red) and opacity.
        // Particles always enter at maxRadius (t=1), so opacity starts at its minimum (most transparent).
        colors[slot * 3]     = 0.8;
        colors[slot * 3 + 1] = 0.2;
        colors[slot * 3 + 2] = 0.05;
        opacities[slot] = 0.2; // outer-edge minimum — updateAccretion() ramps this up as it spirals in

        this.accretion.activeFlags[slot] = 1;

        this.accretion.points.geometry.attributes.position.needsUpdate = true;
        this.accretion.points.geometry.attributes.color.needsUpdate = true;
        this.accretion.points.geometry.attributes.alpha.needsUpdate = true;
    }

    createJet() {
        const jetCount = 200;
        const velocities = new Float32Array(jetCount * 3);
        const ages = new Float32Array(jetCount);
        const origins = new Float32Array(jetCount * 3);
        const activeFlags = new Uint8Array(jetCount); // all 0 = all inactive
        const maxAge = 0.7; // seconds
        const r = this.radius;
        // Initialise all slots as inactive — particles are injected via injectIntoJet().
        for (let i = 0; i < jetCount; i++) {
            ages[i] = maxAge + 1; // mark as "past max age" so they are never rendered
            origins[i * 3]     = this.mesh.position.x;
            origins[i * 3 + 1] = this.mesh.position.y;
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
        // Opacity: all start at 0 (invisible until activated)
        const opacities = new Float32Array(jetCount);
        for (let i = 0; i < jetCount; i++) opacities[i] = 0;
        geo.setAttribute('alpha', new THREE.BufferAttribute(opacities, 1));
        const mat = new THREE.PointsMaterial({
            size: BLACK_HOLE_JET_POINT_SIZE * r,
            sizeAttenuation: true,
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
        });

        mat.onBeforeCompile = (shader) => {
            // Vertex: pass alpha attribute through to fragment
            shader.vertexShader =
                `
                attribute float alpha;
                varying float vAlpha;
            ` + shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
                vAlpha = alpha;`
            );

            // Fragment: circular discard + per-particle alpha
            shader.fragmentShader =
                `
                varying float vAlpha;
            ` + shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                float jetAlpha = vAlpha * smoothstep(0.5, 0.1, dist);`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                'gl_FragColor = vec4( outgoingLight, jetAlpha );'
            );
        };
        const points = new THREE.Points(geo, mat);
        points.frustumCulled = false;
        this.scene.add(points);
        return { points, positions, velocities, ages, origins, maxAge, activeFlags };
    }

    /**
     * Injects one particle into the jet from the pole chosen by `up` (1 = north, -1 = south).
     * If `up` is omitted a pole is chosen at random. Called from updateAccretion() when an
     * accretion-disk particle reaches the inner edge.
     */
    injectIntoJet(up?: number): void {
        if (!this.jet) return;

        // Find a free slot.
        let slot = -1;
        for (let i = 0; i < this.jet.activeFlags.length; i++) {
            if (this.jet.activeFlags[i] === 0) { slot = i; break; }
        }
        if (slot === -1) return; // pool full — drop silently

        const r = this.radius;
        const direction = up !== undefined ? up : (Math.random() < 0.5 ? 1 : -1);
        const speed = BLACK_HOLE_JET_SPEED_BASE * r;
        const spread = 0.08;
        this.jet.velocities[slot * 3]     = (Math.random() - 0.5) * spread * speed;
        this.jet.velocities[slot * 3 + 1] = direction * speed;
        this.jet.velocities[slot * 3 + 2] = (Math.random() - 0.5) * spread * speed;
        this.jet.ages[slot] = 0;
        this.jet.origins[slot * 3]     = this.mesh.position.x;
        this.jet.origins[slot * 3 + 1] = this.mesh.position.y + direction * r;
        this.jet.origins[slot * 3 + 2] = this.mesh.position.z;
        this.jet.activeFlags[slot] = 1;
    }

    setRadius(newRadius: number) {
        super.setRadius(newRadius);

        if (this.accretionGlow) {
            this.accretionGlow.scale.setScalar(newRadius * 10);
        }

        if (this.jet) {
            const mat = this.jet.points.material as THREE.PointsMaterial;
            mat.size = BLACK_HOLE_JET_POINT_SIZE * newRadius;
        }

        // Update accretion disk radii and point size in-place so that in-flight particles
        // are preserved. Recreating the disk would destroy every particle currently spiraling in.
        if (this.accretion) {
            const mat = this.accretion.points.material as THREE.PointsMaterial;
            mat.size = BLACK_HOLE_ACCRETION_DISK_POINT_SIZE * newRadius;
            this.accretion.minRadius = newRadius * 2;
            this.accretion.maxRadius = newRadius * 2 * 32;
        } else {
            this.accretion = this.createAccretionDisk();
        }
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
            if (this.accretion.activeFlags[i] === 0) continue; // skip inactive slots

            // Get current position relative to black hole
            const dx = p[i * 3];
            const dz = p[i * 3 + 2];
            const radius = Math.sqrt(dx * dx + dz * dz); // Distance in XZ plane

            // Spiral inward
            const vel = this.accretion.vels[i];
            // Inward speed increases as radius decreases (proportional to 1/r)
            const inwardSpeed = vel.inward * (maxRadius / Math.max(radius, 1));
            const newRadius = radius - inwardSpeed * absDt;

            // Color/heat mapping: t=0 (inner) is white/yellow, t=1 (outer) is dim red/orange
            const t = (newRadius - minRadius) / (maxRadius - minRadius);
            const r = 0.8 + (1.0 - 0.8) * (1 - t);
            const g = 0.2 + (0.95 - 0.2) * (1 - t);
            const b = 0.05 + (0.7 - 0.05) * (1 - t);
            colors[i * 3]     = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;

            // If particle reaches the inner edge, hand off to the jet and deactivate.
            if (newRadius < this.radius + 2 * SCALE_FACTOR) {
                // Inject multiple jet particles per accretion arrival, alternating poles.
                for (let j = 0; j < JET_PARTICLES_PER_ACCRETION; j++) {
                    this.injectIntoJet(j % 2 === 0 ? 1 : -1);
                }
                this.accretion.activeFlags[i] = 0;
                opacities[i] = 0;
            } else {
                // Update orbital position (spiral motion)
                this.accretion.angularPositions[i] += vel.orbital * absDt;
                const angle = this.accretion.angularPositions[i];

                p[i * 3]     = Math.cos(angle) * newRadius;
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
            // Update point size to match current radius
            const r = this.radius;
            const mat = this.jet.points.material as THREE.PointsMaterial;
            if (mat.size !== BLACK_HOLE_JET_POINT_SIZE * r) {
                mat.size = BLACK_HOLE_JET_POINT_SIZE * r;
            }
            if (absDt > 0) {
                const { points, velocities, ages, origins, maxAge, activeFlags } = this.jet;
                const posAttr = points.geometry.attributes.position;
                const alphaAttr = points.geometry.attributes.alpha;
                for (let i = 0; i < velocities.length / 3; i++) {
                    if (activeFlags[i] === 0) continue; // skip inactive slots

                    ages[i] += absDt;
                    if (ages[i] > maxAge) {
                        // Particle has completed its flight — deactivate permanently.
                        activeFlags[i] = 0;
                        alphaAttr.array[i] = 0;
                        continue;
                    }
                    // Fade out with age
                    alphaAttr.array[i] = 1.0 - ages[i] / maxAge;
                    // Compute world position: origin + velocity * age
                    posAttr.array[i * 3]     = origins[i * 3]     + velocities[i * 3]     * ages[i];
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

        // Filter to active, non-white-dwarf, non-brown-dwarf stars.
        const stars = bodies.filter(
            (b): b is typeof b & ISiphonTarget =>
                !b._isDisposed &&
                !!(b.bodyType & BodyTypeEnum.Star) &&
                !(b.bodyType & BodyTypeEnum.WhiteDwarf) &&
                !(b.bodyType & BodyTypeEnum.BrownDwarf) &&
                'triggerStarDeath' in b
        ) as unknown as ISiphonTarget[];

        const inRangeIds = new Set<string>();
        let totalTransfer = 0;

        for (const star of stars) {
            const dist = star.mesh.position.distanceTo(this.mesh.position);
            if (dist > EARTH_DIST) continue;

            inRangeIds.add(star.id);

            // Start a new siphon stream if one does not already exist.
            if (!this.siphonEffects.has(star.id)) {
                const effect = new MassSiphonEffect(
                    this.dependencies,
                    this.scene,
                    star,
                    this,
                    (angle) => this.injectIntoAccretionDisk(angle)
                );
                this.siphonEffects.set(star.id, effect);
                this.dependencies.addEvent(`${this.name} is siphoning mass from ${star.name}`);
            }

            // Gravitational mass-transfer: proportional to G·M_bh·M_star / r².
            const distSafe = Math.max(dist, 1);
            const transfer =
                ((G * this.mass * star.mass) / (distSafe * distSafe)) *
                SIPHON_MASS_TRANSFER_SCALE *
                absDt;

            // Check depletion threshold BEFORE applying the transfer so the frame
            // that crosses 0.01 M☉ also stops the mass drain.
            const wouldBeDepleted = star.mass - transfer > 0 && star.mass - transfer < SUN_MASS * 0.01;
            const wouldBeGone = star.mass - transfer <= 0;

            if (!wouldBeDepleted && !wouldBeGone) {
                star.setMass(Math.max(0, star.mass - transfer));
                totalTransfer += transfer;

                // Fuel drain uses the same ratio as Star's initial fuel assignment:
                //   maxFuel = mass * 100000 * SCALE_FACTOR
                if (star.fuel !== null) {
                    star.fuel = Math.max(0, star.fuel - transfer * 100000 * SCALE_FACTOR);
                }
            }

            // Stop siphoning when the star has been depleted to brown-dwarf mass —
            // it becomes a brown dwarf remnant at this point and the siphon ends.
            const depleted = wouldBeDepleted || (star.mass > 0 && star.mass < SUN_MASS * 0.01);

            // Trigger star death when mass or fuel is fully depleted by the siphon.
            const massGone = wouldBeGone || star.mass <= 0;
            const fuelGone = star.fuel !== null && star.fuel <= 0;
            if (massGone || fuelGone || depleted) {
                if (massGone) {
                    star.mass = 0;
                    if (star.fuel !== null) star.fuel = 0;
                    const isMassiveStar = star.initialMass > SUN_MASS * 3.3;
                    star.triggerStarDeath(isMassiveStar);
                }
                // Stop spawning for this star's siphon — in-flight particles continue draining.
                this.siphonEffects.get(star.id)?.stopSpawning();
                inRangeIds.delete(star.id);
                if (depleted && !massGone) {
                    this.dependencies.addEvent(`${star.name} siphoned into a brown dwarf remnant`);
                }
            }
        }

        // Grow the black hole by the total mass siphoned this frame.
        if (totalTransfer > 0) {
            this.mass += totalTransfer;
            const newRadius = BlackHole.massToEventHorizonRadius(this.mass);
            if (Math.abs(newRadius - this.radius) / this.radius > 0.005) {
                this.setRadius(newRadius);
            }
        }

        // ── Loop 2: update ALL effects (both actively spawning and draining). ───────
        // Effects for out-of-range/depleted stars have already had stopSpawning() called
        // above; we let them continue updating until all in-flight particles drain out,
        // at which point active becomes false and we dispose.
        for (const [starId, effect] of Array.from(this.siphonEffects.entries())) {
            if (!inRangeIds.has(starId)) {
                // Star is no longer in range — stop spawning if not already stopped.
                effect.stopSpawning();
            }
            effect.update(dt);
            if (!effect.active) {
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
