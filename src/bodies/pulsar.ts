import * as THREE from 'three';
import { Star, IStarCreationOptions } from './star';
import { IStateDependencies, ISiphonTarget, IMassTransferBody } from '../interfaces';
import { loadSrgbTexture } from '../drawing/textures';
import { BodyTypeEnum } from '../utilities/utilities';
import { IRotation } from '../physics/physics';
import { SCALE_FACTOR, SUN_MASS, EARTH_DIST, G } from '../utilities/consts';
import { PulsarBeam } from '../effects/pulsar-beam';
import { StarGlow } from '../effects/star-glow';
import { AccretionDiskEffect, PULSAR_DISK_COLORS } from '../effects/accretion-disk';
import { PulsarMagneticField } from '../effects/pulsar-magnetic-field';
import { MassSiphonEffect } from '../effects/mass-siphon';
import { IPipelineFeedEffect } from '../effects/effect-base';

/**
 * Base radius constant used in the neutron-star mass-to-radius formula.
 *
 * The relationship R = PULSAR_BASE_RADIUS * (SUN_MASS / mass)^(1/3) yields:
 *   • 1.4 M☉  → ≈ 3.6 units
 *   • 3.0 M☉  → ≈ 2.8 units
 *
 * This is considerably more compressed than a white dwarf (base 8 × SCALE_FACTOR)
 * but still larger than a stellar black hole (~1 × SCALE_FACTOR).
 */
const PULSAR_BASE_RADIUS = 2 * SCALE_FACTOR;

/**
 * Computes the radius of a neutron star for a given mass.
 * Inverse-cubic-root relationship: more massive → slightly smaller (degenerate matter).
 */
function massToNeutronStarRadius(mass: number): number {
    return PULSAR_BASE_RADIUS * Math.pow(SUN_MASS / mass, 1 / 3);
}

const PULSAR_TEMPERATURE = 1_000_000;
const PULSAR_LIGHT_INTENSITY = 1_000_000_000;
const PULSAR_LIGHT_DISTANCE = 1_000_000 * SCALE_FACTOR;

/**
 * Minimum / maximum spin rates for visual clarity (radians per sim-second).
 * The physically correct value from angular momentum conservation would be many
 * orders of magnitude faster; we clamp to a lighthouse-sweep range instead.
 */
const PULSAR_MIN_SPIN = Math.PI * 2; // 1 rotation / sim-sec
const PULSAR_MAX_SPIN = Math.PI * 3.5; // max speed allowed to avoid weird looking beam

/** Multiplier for the gravitational mass-transfer formula (same as black hole). */
const SIPHON_MASS_TRANSFER_SCALE = 0.0001;

/**
 * A pulsar: a rapidly spinning neutron star that emits narrow beams of electromagnetic
 * radiation from its magnetic poles, which are offset from its rotation axis.
 *
 * Physics implemented:
 *  - Mass compressed via neutron-star degenerate-matter radius formula
 *  - Spin-up via angular momentum conservation: ω_new = ω_old × (R_progenitor / R_pulsar)²
 *  - Rotating magnetic-axis beam effect (PulsarBeam)
 *  - Dipole magnetic field loop effect (PulsarMagneticField)
 *  - Mass siphoning from nearby stars into an accretion disk (AccretionDiskEffect + MassSiphonEffect)
 */
export class Pulsar extends Star implements IMassTransferBody {
    private beam: PulsarBeam;
    private glow: StarGlow;
    private magneticField: PulsarMagneticField;
    accretionDisk: AccretionDiskEffect;
    siphonEffects: Map<string, IPipelineFeedEffect> = new Map();

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        pos: THREE.Vector3,
        mass: number,
        id: string,
        name: string,
        progenitorRotation: IRotation,
        progenitorRadius: number
    ) {
        const pulsarTexture = loadSrgbTexture('./assets/textures/pulsar.jpg');
        const pulsarRadius = massToNeutronStarRadius(mass);

        // Angular momentum conservation: I * ω = const, I ∝ R²
        // ω_new = ω_old * (R_old / R_new)²
        const rawSpinUp = progenitorRotation.speed * Math.pow(progenitorRadius / pulsarRadius, 2);
        const newSpeed = Math.max(PULSAR_MIN_SPIN, Math.min(PULSAR_MAX_SPIN, rawSpinUp));
        const newRotation: IRotation = {
            axis: progenitorRotation.axis.clone(),
            speed: newSpeed,
        };

        const options: IStarCreationOptions = {
            pos,
            vel: new THREE.Vector3(0, 0, 0),
            mass,
            radius: pulsarRadius,
            id,
            name,
            temperature: PULSAR_TEMPERATURE,
            lightIntensity: PULSAR_LIGHT_INTENSITY,
            lightDistance: PULSAR_LIGHT_DISTANCE,
            rotation: newRotation,
        };

        const textures = {
            sunTexture: pulsarTexture,
            redStarTexture: null,
            orangeStarTexture: null,
            whiteStarTexture: null,
            blueStarTexture: null,
            whiteDwarfTexture: null,
            brownDwarfTexture: null,
        };

        super(dependencies, scene, options, textures);

        this.bodyType = BodyTypeEnum.Pulsar | BodyTypeEnum.Star;

        // Compute a single shared magnetic axis offset 10–90° from the spin axis.
        // Both PulsarBeam and PulsarMagneticField must use the same axis so the
        // beam sweeps exactly through the field-line poles.
        const _magAxisPerp = new THREE.Vector3(
            Math.abs(newRotation.axis.x) < 0.9 ? 1 : 0,
            Math.abs(newRotation.axis.x) < 0.9 ? 0 : 1,
            0
        ).cross(newRotation.axis).normalize();
        const _magOffsetAngle = (10 + Math.random() * 80) * (Math.PI / 180);
        const magneticAxisBase = newRotation.axis.clone()
            .applyQuaternion(new THREE.Quaternion().setFromAxisAngle(_magAxisPerp, _magOffsetAngle))
            .normalize();

        this.beam = new PulsarBeam(
            dependencies,
            scene,
            this.mesh.position.clone(),
            pulsarRadius,
            newRotation.axis,
            newSpeed,
            magneticAxisBase
        );

        // Glow: Uses 0xd6f0ff (a bluish white).
        // Use a large scale multiplier (20×) so the glow is visible at solar-system
        // zoom levels despite the pulsar's tiny physical radius (~3-4 units).
        // Pulse amplitude is very subtle — pulsars are compact and stable.
        this.glow = new StarGlow(
            dependencies,
            scene,
            pulsarRadius * 1000,
            this.baseColor.getHex(),
            this.mesh.position.clone(),
            0.15,
            20
        );

        // Magnetic field dipole loops — shares the same magnetic axis as the beam
        this.magneticField = new PulsarMagneticField(
            dependencies,
            scene,
            this.mesh.position.clone(),
            pulsarRadius,
            newRotation.axis,
            newSpeed,
            magneticAxisBase
        );

        // Accretion disk with pulsar color preset (light blue outer → bright white inner).
        // onParticleConsumed is a no-op: the rotating beam already provides visual activity
        // at the poles; a secondary effect here would be visually redundant.
        this.accretionDisk = new AccretionDiskEffect(
            dependencies,
            scene,
            pulsarRadius,
            mass,
            pos,
            PULSAR_DISK_COLORS,
            () => { /* no-op: beam sweeps handle the pole visual */ }
        );
    }

    enqueueAccretionParticle(angle: number): void {
        this.accretionDisk.enqueueAccretionParticle(angle);
    }

    override update(acc: THREE.Vector3, dt: number): void {
        if (this._isDisposed) return;
        super.update(acc, dt);
        this.beam.setPosition(this.mesh.position);
        this.beam.update(dt);
        this.glow.setPosition(this.mesh.position);
        this.glow.update(dt);
        this.magneticField.setPosition(this.mesh.position);
        this.magneticField.update(dt);
        this.accretionDisk.setPosition(this.mesh.position);
        this.accretionDisk.update(dt);
        this._updateSiphon(dt);
    }

    /**
     * Checks all living, non-compact stars within EARTH_DIST.
     * Creates / maintains / removes MassSiphonEffect instances and transfers
     * mass from each in-range star into this pulsar's accretion disk.
     */
    private _updateSiphon(dt: number): void {
        if (dt === 0 || this._isDisposed) return;

        const absDt = Math.abs(dt);
        const bodies = this.deps.getBodies();

        const stars = bodies.filter(
            (b): b is typeof b & ISiphonTarget =>
                !b._isDisposed &&
                !!(b.bodyType & BodyTypeEnum.Star) &&
                !(b.bodyType & BodyTypeEnum.WhiteDwarf) &&
                !(b.bodyType & BodyTypeEnum.BrownDwarf) &&
                !(b.bodyType & BodyTypeEnum.Pulsar) &&
                b.id !== this.id &&
                'triggerStarDeath' in b
        ) as unknown as ISiphonTarget[];

        const inRangeIds = new Set<string>();
        let totalTransfer = 0;

        for (const star of stars) {
            const dist = star.mesh.position.distanceTo(this.mesh.position);
            if (dist > EARTH_DIST) continue;

            inRangeIds.add(star.id);

            if (!this.siphonEffects.has(star.id)) {
                const effect = new MassSiphonEffect(
                    this.deps,
                    this.scene,
                    star,
                    this,
                    (angle) => this.enqueueAccretionParticle(angle),
                    // Pulsar disk arrival color: light blue outer edge
                    { r: 0.5, g: 0.85, b: 1.0 }
                );
                this.siphonEffects.set(star.id, effect);
                this.deps.addEvent(`${this.name} is siphoning mass from ${star.name}`);
            }

            const distSafe = Math.max(dist, 1);
            const transfer =
                ((G * this.mass * star.mass) / (distSafe * distSafe)) *
                SIPHON_MASS_TRANSFER_SCALE *
                absDt;

            const wouldBeDepleted =
                star.mass - transfer > 0 && star.mass - transfer < SUN_MASS * 0.01;
            const wouldBeGone = star.mass - transfer <= 0;

            if (!wouldBeDepleted && !wouldBeGone) {
                star.setMass(Math.max(0, star.mass - transfer));
                totalTransfer += transfer;
                if (star.fuel !== null) {
                    star.fuel = Math.max(0, star.fuel - transfer * 100000 * SCALE_FACTOR);
                }
            }

            const depleted = wouldBeDepleted || (star.mass > 0 && star.mass < SUN_MASS * 0.01);
            const massGone = wouldBeGone || star.mass <= 0;
            const fuelGone = star.fuel !== null && star.fuel <= 0;

            if (massGone || fuelGone || depleted) {
                if (massGone) {
                    star.mass = 0;
                    if (star.fuel !== null) star.fuel = 0;
                    const isMassiveStar = star.initialMass > SUN_MASS * 3.3;
                    star.triggerStarDeath(isMassiveStar);
                }
                this.siphonEffects.get(star.id)?.stopSpawning();
                inRangeIds.delete(star.id);
                if (depleted && !massGone) {
                    this.deps.addEvent(`${star.name} siphoned into a brown dwarf remnant`);
                }
            }
        }

        // Neutron stars accrete mass but their radius is constrained by degenerate matter —
        // no setRadius() call here (unlike black holes which grow).
        if (totalTransfer > 0) {
            this.mass += totalTransfer;
        }

        for (const [starId, effect] of Array.from(this.siphonEffects.entries())) {
            if (!inRangeIds.has(starId)) {
                effect.stopSpawning();
            }
            effect.update(dt);
            if (!effect.active) {
                effect.dispose();
                this.siphonEffects.delete(starId);
            }
        }
    }

    override die(skipExplosion = false): void {
        try {
            this.beam?.dispose();
        } catch {
            // ignore
        }
        try {
            this.glow?.dispose();
        } catch {
            // ignore
        }
        try {
            this.magneticField?.dispose();
        } catch {
            // ignore
        }
        try {
            this.accretionDisk?.dispose();
        } catch {
            // ignore
        }
        for (const effect of this.siphonEffects.values()) {
            try {
                effect.dispose();
            } catch {
                // ignore
            }
        }
        this.siphonEffects.clear();
        super.die(skipExplosion);
    }
}
