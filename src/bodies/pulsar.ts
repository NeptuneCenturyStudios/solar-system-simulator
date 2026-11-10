import * as THREE from 'three';
import { Star } from './star';
import {
    IStateDependencies,
    ISiphonTarget,
    IMassTransferBody,
    IDeathOptions,
    IMagneticFieldOptions,
    IPulsarCreationOptions,
    IRotation,
} from '../interfaces';
import { SUN_MASS, EARTH_DIST, DIST_SCALE } from '../utilities/consts';
import { rollMagneticField, computeMagneticAxis } from '../procedural/magnetic-field';
import { SeededRandom } from '../utilities/prng';
import { spinPoleDirection } from '../utilities/spin-pole';
import { PulsarBeam } from '../effects/pulsar-beam';
import { AccretionDiskEffect, PULSAR_DISK_COLORS } from '../effects/accretion-disk';
import { PulsarMagneticField } from '../effects/pulsar-magnetic-field';
import { MassSiphonEffect } from '../effects/mass-siphon';
import { IPipelineFeedEffect } from '../effects/effect-base';
import { NotificationType } from '../event-log/event-log';
import { BodyTypeEnum } from './body-enums';

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
const PULSAR_BASE_RADIUS = 10 / DIST_SCALE;

/**
 * Computes the radius of a neutron star for a given mass.
 * Inverse-cubic-root relationship: more massive → slightly smaller (degenerate matter).
 */
function massToNeutronStarRadius(mass: number): number {
    return PULSAR_BASE_RADIUS * Math.pow(SUN_MASS / mass, 1 / 3);
}

const PULSAR_TEMPERATURE = 1_000_000;
const PULSAR_LIGHT_INTENSITY = 1_000_000_000;
const PULSAR_LIGHT_DISTANCE = 100_000_000 / DIST_SCALE; // ~100 million units, scaled to solar system size

/** How far each radiation beam reaches from the pulsar's centre. */
const PULSAR_BEAM_LENGTH = (radius: number): number =>
    Math.max((100_000_000 / DIST_SCALE) * radius, radius * 50);

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
 *
 * The surface (neutron-star style, with polar hot spots) and its tight halo come from {@link Star}.
 */
export class Pulsar extends Star implements IMassTransferBody {
    /** The twin radiation beams (children of the mesh, swept by its spin). */
    private beam: PulsarBeam | null;
    /** The rendered dipole field-line effect. Named to avoid colliding with
     *  `CelestialBody.magneticField`, which is the attribute-only field data. */
    private magneticFieldEffect: PulsarMagneticField;
    accretionDisk: AccretionDiskEffect;
    siphonEffects: Map<string, IPipelineFeedEffect> = new Map();

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IPulsarCreationOptions
    ) {
        const { id, mass, pos, rotation: progenitorRotation } = options;
        const pulsarRadius = massToNeutronStarRadius(mass);

        // Angular momentum conservation: I * ω = const, I ∝ R²
        // ω_new = ω_old * (R_old / R_new)²
        const rawSpinUp =
            progenitorRotation.speed * Math.pow(options.progenitorRadius / pulsarRadius, 2);
        const newSpeed = Math.max(PULSAR_MIN_SPIN, Math.min(PULSAR_MAX_SPIN, rawSpinUp));
        // Inherit tilt from progenitor
        const newRotation: IRotation = {
            tilt: progenitorRotation.tilt,
            speed: newSpeed,
        };

        // Inherit the progenitor star's magnetic field (neutron-star formation compresses
        // and amplifies the pre-existing field via flux freezing, it doesn't randomize a new
        // one). Falls back to a fresh seeded roll only if the progenitor somehow has none.
        const magneticField: IMagneticFieldOptions =
            options.magneticField ??
            rollMagneticField(new SeededRandom(`${id}|magnetic-field`), 'star')!;

        // Procedural surface in the neutron-star style: smooth, ~10^6 K violet-white, with hot
        // spots at the magnetic poles (aimed below, once the mesh's tilt is known).
        super(dependencies, scene, {
            pos,
            vel: options.vel.clone(),
            mass,
            radius: pulsarRadius,
            id,
            name: options.name,
            temperature: PULSAR_TEMPERATURE,
            lightIntensity: PULSAR_LIGHT_INTENSITY,
            lightDistance: PULSAR_LIGHT_DISTANCE,
            rotation: newRotation,
            magneticField,
            bodyType: BodyTypeEnum.Pulsar,
            surfaceStyle: 'pulsar',
            haloWisps: 0,
        });

        // World spin axis, built exactly as CelestialBody.setRotation orients the mesh.
        const spinAxis = spinPoleDirection(newRotation.tilt, newRotation.azimuth ?? 0);

        // Magnetic axis from the real per-body field (tilt/azimuth relative to the spin axis),
        // taken into the mesh's object space. The hot spots, beams and field loops are all
        // built around this one axis and parented to the mesh, so the sim's spin and tilt
        // sweep them together and they can never drift apart.
        const magneticAxisObj = computeMagneticAxis(spinAxis, magneticField).applyQuaternion(
            this.mesh.quaternion.clone().invert()
        );

        const surface = this.surfaceMaterial;
        surface?.setPoleAxis(magneticAxisObj);

        // The beam streaks run on the surface clock.
        this.beam = surface
            ? new PulsarBeam(
                  this.mesh,
                  pulsarRadius,
                  PULSAR_BEAM_LENGTH(pulsarRadius),
                  magneticAxisObj,
                  surface.surfaceUniforms.uSsTime
              )
            : null;

        // Magnetic field dipole loops around the same axis.
        this.magneticFieldEffect = new PulsarMagneticField(
            dependencies,
            this.mesh,
            pulsarRadius,
            magneticAxisObj
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
            () => {
                /* no-op: beam sweeps handle the pole visual */
            }
        );
    }

    enqueueAccretionParticle(angle: number): void {
        this.accretionDisk.enqueueAccretionParticle(angle);
    }

    override updateVisuals(dtTotal: number, cameraPos?: THREE.Vector3): void {
        super.updateVisuals(dtTotal, cameraPos);

        if (this._isDisposed) return;

        // (Star advances the surface clock, which also drives the beam streaks.)
        this.magneticFieldEffect.update(dtTotal);
        this.accretionDisk.setPosition(this.mesh.position);
        this.accretionDisk.update(dtTotal);
        this._updateSiphon(dtTotal);
    }

    /**
     * Checks all living, non-compact stars within EARTH_DIST.
     * Creates / maintains / removes MassSiphonEffect instances and transfers
     * mass from each in-range star into this pulsar's accretion disk.
     */
    private _updateSiphon(dt: number): void {
        if (dt === 0 || this._isDisposed) return;

        const absDt = Math.abs(dt);
        const bodies = this.dependencies.getBodies();

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
                    this.dependencies,
                    this.scene,
                    star,
                    this,
                    (angle) => this.enqueueAccretionParticle(angle),
                    // Pulsar disk arrival color: light blue outer edge
                    { r: 0.5, g: 0.85, b: 1.0 }
                );
                this.siphonEffects.set(star.id, effect);
                this.dependencies.addEvent({
                    message: `${this.name} is siphoning mass from ${star.name}`,
                    notificationType: NotificationType.Info,
                });
            }

            const distSafe = Math.max(dist, 1);
            const transfer =
                ((this.dependencies.getG() * this.mass * star.mass) / (distSafe * distSafe)) *
                SIPHON_MASS_TRANSFER_SCALE *
                absDt;

            const wouldBeDepleted =
                star.mass - transfer > 0 && star.mass - transfer < SUN_MASS * 0.01;
            const wouldBeGone = star.mass - transfer <= 0;

            if (!wouldBeDepleted && !wouldBeGone) {
                star.setMass(Math.max(0, star.mass - transfer));
                totalTransfer += transfer;
                if (star.fuel !== null) {
                    star.fuel = Math.max(0, star.fuel - transfer * 100000);
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
                    this.dependencies.addEvent({
                        message: `${star.name} siphoned into a brown dwarf remnant`,
                        notificationType: NotificationType.Alert,
                    });
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

    override die(deathOptions?: IDeathOptions): void {
        try {
            this.beam?.dispose();
            this.beam = null;
        } catch {
            // ignore
        }
        try {
            this.magneticFieldEffect?.dispose();
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
        super.die(deathOptions);
    }
}
