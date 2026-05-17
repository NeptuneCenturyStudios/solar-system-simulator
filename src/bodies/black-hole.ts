import * as THREE from 'three';
import { SCALE_FACTOR, SUN_MASS, EARTH_DIST } from '../utilities/consts.js';
import { BodyTypeEnum } from '../utilities/utilities.js';
import { CelestialBody } from './celestial-body';
import { IRotation } from '../physics/physics.js';
import { IStateDependencies, ISiphonTarget, IMassTransferBody } from '../interfaces.js';
import { IPipelineFeedEffect } from '../effects/effect-base.js';
import { MassSiphonEffect } from '../effects/mass-siphon.js';
import { AccretionDiskEffect, BLACK_HOLE_DISK_COLORS } from '../effects/accretion-disk.js';
import { BlackHoleJetEffect } from '../effects/black-hole-jet.js';
import { NotificationType } from '../event-log/event-log.js';

/** Multiplier for the gravitational mass-transfer formula. Tune to taste. */
const SIPHON_MASS_TRANSFER_SCALE = 0.0001;

/**
 * Represents a black hole in the simulation, including accretion disk and jet effects.
 * Inherits from CelestialBody and adds black hole-specific physics and rendering.
 */
export class BlackHole extends CelestialBody implements IMassTransferBody {
    jet: BlackHoleJetEffect | null = null;
    dependencies: IStateDependencies;
    accretionDisk: AccretionDiskEffect | null = null;
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
        // The mesh is a simple sphere; the visual complexity comes from the accretion disk and jet effects.
        const geometry = new THREE.SphereGeometry(EVENT_HORIZON_RADIUS, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color: BLACK_HOLE_COLOR });
        const mesh = new THREE.Mesh(geometry, material);

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
            mesh
        );

        this.dependencies = dependencies;

        // Create accretion disk glow (orange ring around black hole) - Keep for now since we may use it for performance options
        //this.createAccretionGlow();

        // Create continuous particle accretion animation via AccretionDiskEffect.
        this.accretionDisk = new AccretionDiskEffect(
            dependencies,
            scene,
            EVENT_HORIZON_RADIUS,
            mass,
            pos,
            BLACK_HOLE_DISK_COLORS,
            () => this.injectIntoJet(),
            () => this._computeSpiralStartAngle()
        );

        // Create pooled flash-beam jet effect aligned on the rotation axis.
        this.jet = new BlackHoleJetEffect(
            dependencies,
            scene,
            pos,
            EVENT_HORIZON_RADIUS,
            this.rotationAxis
        );

        // Seed the accretion disk with remnant particles when born from a supernova.
        // These represent the collapsing stellar envelope — they spiral inward and eject
        // through the jet naturally, giving the newborn black hole immediate visual activity.
        if (spawnedFromSupernova) {
            this.accretionDisk.seedAccretionDisk(400);
        }
    }

    /**
     * Creates a glowing ring sprite at the event horizon edge to visually represent the accretion glow.
     * This is an optional visual effect for performance tuning.
     */
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

    /**
     * Enqueues one particle angle for later injection into the accretion disk.
     * Delegates to AccretionDiskEffect; all sources (siphon, collision, supernova seed)
     * funnel through here so the disk always builds up gradually.
     */
    enqueueAccretionParticle(angle: number): void {
        this.accretionDisk?.enqueueAccretionParticle(angle);
    }

    /**
     * Floods the accretion disk with particles when a star is directly absorbed.
     * Delegates to AccretionDiskEffect.
     */
    seedAccretionDisk(count: number): void {
        this.accretionDisk?.seedAccretionDisk(count);
    }

    /**
     * Computes the spiral start angle for the line-mode accretion disk fallback.
     * Derives the angle from the first active siphon stream so the spiral begins
     * where the Bézier siphon line terminates on the disk outer edge.
     */
    private _computeSpiralStartAngle(): number {
        if (this.siphonEffects.size === 0) return 0;
        const starId = this.siphonEffects.keys().next().value as string;
        const star = this.dependencies.getBodies().find((b) => b.id === starId && !b._isDisposed);
        if (!star?.mesh) return 0;
        const diskNormal = this.rotationAxis
            ? this.rotationAxis.clone().normalize()
            : new THREE.Vector3(0, 1, 0);
        const toBH = new THREE.Vector3()
            .subVectors(this.mesh.position, star.mesh.position)
            .normalize();
        const toBH_proj = toBH
            .clone()
            .sub(diskNormal.clone().multiplyScalar(toBH.dot(diskNormal)))
            .normalize();
        const offsetDir = toBH_proj
            .clone()
            .applyAxisAngle(diskNormal, Math.PI / 2)
            .normalize();
        return Math.atan2(offsetDir.z, offsetDir.x);
    }

    /**
     * Triggers one bilateral jet flash along the rotation axis.
     * Delegates entirely to BlackHoleJetEffect.flash().
     */
    injectIntoJet(): void {
        this.jet?.flash();
    }

    setRadius(newRadius: number) {
        super.setRadius(newRadius);

        if (this.accretionGlow) {
            this.accretionGlow.scale.setScalar(newRadius * 10);
        }

        // Update AccretionDiskEffect in-place to preserve in-flight particles.
        if (this.accretionDisk) {
            this.accretionDisk.setRadius(newRadius, this.mass);
        } else {
            this.accretionDisk = new AccretionDiskEffect(
                this.dependencies,
                this.scene,
                newRadius,
                this.mass,
                this.mesh.position,
                BLACK_HOLE_DISK_COLORS,
                () => this.injectIntoJet(),
                () => this._computeSpiralStartAngle()
            );
        }

        // Notify the jet effect so it can resize its cones to match.
        this.jet?.setRadius(newRadius);
    }

    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Updates the black hole's physics and all associated visual effects for the current simulation step.
     * Calls parent update, then updates accretion disk, jet, and siphon effects.
     *
     * @param {THREE.Vector3} acc - The acceleration vector.
     * @param {number} dt - The simulation time delta.
     */
    update(acc: THREE.Vector3, dt: number) {
        // Call parent update for physics
        super.update(acc, dt);

        // Update accretion disk animation and position
        this.accretionDisk?.update(dt);
        this.accretionDisk?.setPosition(this.mesh.position);

        // Update jet flash-beam effect
        this.jet?.update(dt);
        this.jet?.setPosition(this.mesh.position);

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
                    (angle) => this.enqueueAccretionParticle(angle)
                );
                this.siphonEffects.set(star.id, effect);
                this.dependencies.addEvent({
                    message: `${this.name} is siphoning mass from ${star.name}`,
                    notificationType: NotificationType.Info,
                });
            }

            // Gravitational mass-transfer: proportional to G·M_bh·M_star / r².
            const distSafe = Math.max(dist, 1);
            const transfer =
                ((this.dependencies.getG() * this.mass * star.mass) / (distSafe * distSafe)) *
                SIPHON_MASS_TRANSFER_SCALE *
                absDt;

            // Check depletion threshold BEFORE applying the transfer so the frame
            // that crosses 0.01 M☉ also stops the mass drain.
            const wouldBeDepleted =
                star.mass - transfer > 0 && star.mass - transfer < SUN_MASS * 0.01;
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
                    this.dependencies.addEvent({
                        message: `${star.name} siphoned into a brown dwarf remnant`,
                        notificationType: NotificationType.Alert,
                    });
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

    /**
     * Cleans up all resources and effects associated with the black hole before removal.
     * Disposes of jets, accretion disk, glow, and siphon streams, then calls parent die.
     */
    die() {
        // Clean up jet flash-beam effect
        this.jet?.dispose();
        this.jet = null;

        // Clean up accretion disk
        this.accretionDisk?.dispose();
        this.accretionDisk = null;

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
