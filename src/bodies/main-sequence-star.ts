import * as THREE from 'three';
import { Star } from './star';
import { IStarCreationOptions, IStateDependencies } from '../interfaces';
import { NotificationType } from '../event-log/event-log';
import { createUniqueId } from '../utilities/utilities';
import { recordCreation } from '../persistence/creation-registry';
import { CreationKind, RemnantKind } from '../persistence/save-file';
import {
    PLUTO_DIST,
    BROWN_DWARF_MASS_THRESHOLD,
    MIN_BLACK_HOLE_MASS,
    MIN_NEUTRON_STAR_MASS,
    RED_GIANT_MIN_EXPANSION,
    RED_GIANT_MAX_EXPANSION,
    STAR_LIGHT_EXPOSURE,
} from '../utilities/consts';
import { BlackHole } from './black-hole';
import { WhiteDwarf } from './white-dwarf';
import { Pulsar } from './pulsar';
import { Supernova } from '../effects/supernova';
import { PlanetaryNebula } from '../effects/planetary-nebula';
import { triggerScreenFlash } from '../effects/screen-flash';
import { BodyTypeEnum } from './body-enums';
import { environmentState } from '../simulation/environment-state';

/**
 * How quickly a red giant's radius, mass and surface colour ease toward their fuel-driven
 * targets, per sim second. Each frame blends by `1 - exp(-rate * |dtTotal|)`, so the easing
 * runs on sim time: the same at any frame rate, faster under time warp, frozen while paused.
 *
 * Matches the speed the transition was originally tuned at: a 0.01 lerp per physics substep,
 * 64 substeps per 0.016 s, gives `-ln(0.99) * 64 / 0.016 ≈ 40` per second.
 */
const RED_GIANT_EASE_RATE = 40;

/** Smallest relative radius change (0.01%) that rebuilds the red giant's geometry. */
const RED_GIANT_RESIZE_STEP = 0.0001;

// Star death is a shared environment setting (toggled from either UI layer);
// reading it from the state singleton avoids DOM coupling in body classes.
function _isStarDeathEnabled(): boolean {
    return environmentState.starDeathEnabled;
}

/**
 * A fuel-burning star. Burns fuel while star death is enabled, swells into a red giant as it
 * runs low, and finally dies as a white dwarf (with a planetary nebula), a pulsar or a black
 * hole depending on its initial mass. Drops to a brown dwarf if its mass falls too low.
 *
 * The procedural surface and limb halo come from {@link Star}.
 */
export class MainSequenceStar extends Star {
    fuel: number | null;
    maxFuel: number | null;
    initialMass: number;
    initialRadius: number;
    initialColor: THREE.Color;
    /**
     * How many times its pre-expansion radius this star swells to as a red giant, rolled once per
     * star in [RED_GIANT_MIN_EXPANSION, RED_GIANT_MAX_EXPANSION] so the target stays stable
     * from frame to frame.
     */
    redGiantExpansionFactor: number;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IStarCreationOptions
    ) {
        super(dependencies, scene, options);

        this.initialMass = options.mass;
        this.initialRadius = options.radius;
        this.initialColor = this.baseColor.clone();
        this.redGiantExpansionFactor =
            RED_GIANT_MIN_EXPANSION +
            Math.random() * (RED_GIANT_MAX_EXPANSION - RED_GIANT_MIN_EXPANSION);

        this.maxFuel = options.mass * 100000;
        this.fuel = this.maxFuel;

        this.setMass(this.mass);
    }

    /** Current fuel as a percentage of max, or null when this star has no fuel model. */
    getFuelPercentRemaining(): number | null {
        if (this.fuel === null || this.maxFuel === null || this.maxFuel <= 0) return null;
        return (this.fuel / this.maxFuel) * 100;
    }

    /** getFuelPercentRemaining(), gated by this star's fuelPercentRemaining discovery flag. */
    getDiscoveredFuelPercentRemaining(): number | null {
        return this.attributes?.fuelPercentRemaining?.discovered
            ? this.getFuelPercentRemaining()
            : null;
    }

    /**
     * Drives the star's evolution once per rendered frame.
     *
     * This previously ran inside the physics substep loop — 64 times per frame by default —
     * including material colour lerps and label-line geometry rewrites. None of it affects the
     * gravity solution, and fuel burn is linear in dt, so running it once per frame with the
     * frame's total elapsed time is equivalent and vastly cheaper.
     */
    override updateVisuals(dtTotal: number, cameraPos?: THREE.Vector3) {
        super.updateVisuals(dtTotal, cameraPos);

        if (this._isDisposed) return;

        const starDeathEnabled = _isStarDeathEnabled();
        if (starDeathEnabled && this.fuel !== null && this.fuel > 0) {
            const referenceMass = 1000;
            const massRatio = this.mass / referenceMass;
            const burnRate = Math.pow(massRatio, 2.5) * 0.001 * Math.abs(dtTotal);
            this.fuel -= burnRate;

            const fuelPercent = this.maxFuel !== null ? this.fuel / this.maxFuel : 0;

            // Check if star should start expanding into a red giant (only for stars that won't become neutron stars or black holes)
            if (this.initialMass < MIN_NEUTRON_STAR_MASS) {
                // Once fuel drops below 30%, start expanding and cooling into a red giant,
                // reaching redGiantExpansionFactor (200-250x) times its initial radius at 0% fuel.
                if (fuelPercent < 0.3 && fuelPercent > 0) {
                    const expansionProgress = 1 - fuelPercent / 0.3;
                    const STAR_MAX_RADIUS = PLUTO_DIST;

                    const targetRadiusUnclamped =
                        this.initialRadius *
                        (1 + expansionProgress * (this.redGiantExpansionFactor - 1));
                    const targetRadius = Math.min(targetRadiusUnclamped, STAR_MAX_RADIUS);

                    // Sim-time easing (see RED_GIANT_EASE_RATE); 0 while paused.
                    const blend = 1 - Math.exp(-RED_GIANT_EASE_RATE * Math.abs(dtTotal));

                    // setRadius rebuilds the whole sphere geometry (and moves the label and
                    // halo with it), so only resize once the change is big enough to see. A
                    // slow-burning star would otherwise rebuild a ~8k-vertex sphere every frame
                    // for a sub-pixel change, for as long as its red-giant phase lasts.
                    const nextRadius = this.radius + (targetRadius - this.radius) * blend;
                    if (Math.abs(nextRadius - this.radius) > this.radius * RED_GIANT_RESIZE_STEP) {
                        this.setRadius(nextRadius);
                    }

                    const targetMass = this.initialMass * (1 - expansionProgress * 0.5);
                    this.mass = this.mass + (targetMass - this.mass) * blend;

                    const targetTemp = 2200 + (fuelPercent / 0.3) * 3578;
                    this.temperature = targetTemp;

                    // Cool the surface (eased) and the light toward red. The halo shares the
                    // surface uniforms, so it follows.
                    this.surfaceMaterial?.setTemperature(targetTemp, blend);
                    this.applyLightColor(targetTemp);
                }
            }

            // Finally, if fuel is completely depleted, trigger star death.
            if (this.fuel <= 0) {
                this.fuel = 0;
                this.triggerStarDeath();
            }
        }
    }

    override setRadius(newRadius: number) {
        super.setRadius(newRadius);
        this._syncBaselineRadiusIfStable();
    }

    override setMass(mass: number) {
        super.setMass(mass);

        if (mass > 0 && mass < BROWN_DWARF_MASS_THRESHOLD) {
            this.transitionToBrownDwarf();
        } else if (mass >= BROWN_DWARF_MASS_THRESHOLD && this.bodyType & BodyTypeEnum.BrownDwarf) {
            this.transitionToMainSequence();
            // Fallback temperature for non-edit paths (e.g. black hole siphon).
            // applyEdit always calls setTemperature(sliderTemp) after setMass, which overrides this.
            this.setTemperature(3000);
        }

        // Keep radius in sync with mass whenever not in a special transition phase.
        if (
            !this.isInRedGiantPhase &&
            !(this.bodyType & BodyTypeEnum.BrownDwarf) &&
            !(this.bodyType & BodyTypeEnum.WhiteDwarf)
        ) {
            const newRadius = Star.massToRadius(mass);
            if (
                newRadius > 0 &&
                Math.abs(newRadius - this.radius) / Math.max(this.radius, 1) > 0.005
            ) {
                this.setRadius(newRadius);
            }
        }
    }

    get isInRedGiantPhase(): boolean {
        const fuelActive = this.fuel !== null && this.maxFuel !== null && this.maxFuel > 0;
        const fuelPercent =
            fuelActive && this.maxFuel !== null && this.fuel !== null
                ? this.fuel / this.maxFuel
                : 1;
        return fuelActive && fuelPercent < 0.3 && fuelPercent > 0;
    }

    _syncBaselineRadiusIfStable() {
        if (this.isInRedGiantPhase) return;

        this.initialRadius = this.radius;
        if (this.mesh) this.mesh.scale.setScalar(1);
    }

    createSupernova(pos: THREE.Vector3, radius: number) {
        const supernova = new Supernova(this.dependencies, this.scene, pos, radius);
        this.dependencies.addSupernova(supernova);
        return supernova;
    }

    triggerStarDeath() {
        if (this.initialMass > MIN_NEUTRON_STAR_MASS) {
            try {
                this.createSupernova(this.mesh.position.clone(), this.radius);
            } catch (e) {
                console.error('Error creating supernova:', e);
            }

            try {
                triggerScreenFlash();
            } catch (e) {
                console.error('Error triggering screen flash:', e);
            }
        }

        // Every remnant keeps the progenitor's position and motion.
        const pos = this.mesh.position.clone();
        const vel = this.velocity;

        if (this.initialMass > MIN_NEUTRON_STAR_MASS && this.initialMass < MIN_BLACK_HOLE_MASS) {
            try {
                const pulsar = new Pulsar(this.dependencies, this.scene, {
                    pos,
                    vel,
                    mass: this.mass,
                    id: createUniqueId('pulsar'),
                    name: this.name + ' (Pulsar)',
                    rotation: this.rotation,
                    magneticField: this.magneticField,
                    progenitorRadius: this.initialRadius,
                });

                recordCreation(pulsar, { kind: CreationKind.Remnant, remnant: RemnantKind.Pulsar });
                if (this.dependencies?.addBody) {
                    this.dependencies.addBody(pulsar);
                }

                if (this.dependencies?.addEvent) {
                    this.dependencies.addEvent({
                        message: `Pulsar formed from ${this.name}!`,
                        notificationType: NotificationType.Success,
                    });
                }
            } catch (e) {
                console.error('Error creating pulsar:', e);
            }

            this.die({ skipExplosion: true, skipImpactSound: true });
        } else if (this.initialMass >= MIN_BLACK_HOLE_MASS) {
            try {
                const newBlackHole = new BlackHole(this.dependencies, this.scene, {
                    pos,
                    vel,
                    mass: this.mass * 0.9999,
                    id: createUniqueId('blackhole'),
                    name: 'Black Hole',
                    rotation: this.rotation,
                    spawnedFromSupernova: true,
                });

                recordCreation(newBlackHole, {
                    kind: CreationKind.Remnant,
                    remnant: RemnantKind.BlackHole,
                });
                if (this.dependencies?.addBody) {
                    this.dependencies.addBody(newBlackHole);
                }

                if (this.dependencies?.addEvent) {
                    this.dependencies.addEvent({
                        message: `Black Hole formed from ${this.name}!`,
                        notificationType: NotificationType.Alert,
                    });
                }
            } catch (e) {
                console.error('Error creating black hole:', e);
            }

            this.die({ skipExplosion: true, skipImpactSound: true });
        } else {
            try {
                // The exposed core keeps the star's spin and field too.
                const newWhiteDwarf = new WhiteDwarf(this.dependencies, this.scene, {
                    pos,
                    vel,
                    mass: this.mass,
                    id: createUniqueId('whitedwarf'),
                    name: this.name + ' (White Dwarf)',
                    rotation: this.rotation,
                    magneticField: this.magneticField ?? undefined,
                });

                recordCreation(newWhiteDwarf, {
                    kind: CreationKind.Remnant,
                    remnant: RemnantKind.WhiteDwarf,
                });
                if (this.dependencies?.addBody) {
                    this.dependencies.addBody(newWhiteDwarf);
                }

                if (this.dependencies?.addEvent) {
                    this.dependencies.addEvent({
                        message: `White Dwarf formed from ${this.name}!`,
                        notificationType: NotificationType.Warning,
                    });
                }
            } catch (e) {
                console.error('Error creating white dwarf:', e);
            }

            try {
                const nebula = new PlanetaryNebula(
                    this.dependencies,
                    this.scene,
                    this.mesh.position.clone(),
                    this.radius,
                    this.initialMass
                );
                this.dependencies.addPlanetaryNebula(nebula);
            } catch (e) {
                console.error('Error creating planetary nebula:', e);
            }

            this.die({ skipExplosion: true, skipImpactSound: true });
        }
    }

    /** Transitions this star into a brown dwarf: a dim, deep-red surface with no halo, flare or fuel. */
    transitionToBrownDwarf() {
        if (this.bodyType & BodyTypeEnum.BrownDwarf) return; // already transitioned

        // Call before setting the BrownDwarf flag so the guard in setTemperature doesn't block it.
        this.setTemperature(1000);

        this.bodyType |= BodyTypeEnum.BrownDwarf;

        // A brown dwarf barely glows: keep the dim, deep-red surface but drop the limb halo.
        // (During construction the halo doesn't exist yet; Star hides it when it is built.)
        this.halo?.setVisible(false);

        if (this.sunLight) {
            this.sunLight.intensity = 0.002 * STAR_LIGHT_EXPOSURE;
            this.sunLight.color.setHex(0xff6020);
        }

        this.fuel = null;
        this.maxFuel = null;

        if (!this.name.includes('(Brown Dwarf)')) {
            this.name = this.name + ' (Brown Dwarf)';
            this.updateLabel(this.name);
        }
    }

    /** Reverts a brown dwarf back to a main-sequence star. Temperature must be set by the caller afterwards. */
    transitionToMainSequence() {
        if (!(this.bodyType & BodyTypeEnum.BrownDwarf)) return; // not a brown dwarf

        // Clear the flag before any setTemperature call so the guard won't block it.
        this.bodyType &= ~BodyTypeEnum.BrownDwarf;

        // Restore fuel proportional to current mass.
        this.maxFuel = this.mass * 100000;
        this.fuel = this.maxFuel;

        // Restore the limb halo.
        this.halo?.setVisible(true);

        // Restore the light the star had before it dimmed (transitionToBrownDwarf only changed
        // the light itself, not `lightIntensity`).
        this.setLightIntensity(this.lightIntensity);

        // Strip the suffix from the name if present.
        if (this.name.includes(' (Brown Dwarf)')) {
            this.name = this.name.replace(' (Brown Dwarf)', '');
            this.updateLabel(this.name);
        }
    }
}
