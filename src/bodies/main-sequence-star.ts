import * as THREE from 'three';
import { Star, IStarCreationOptions } from './star';
import { IDeathOptions, IStateDependencies } from '../interfaces';
import { NotificationType } from '../event-log/event-log';
import { buildBodySphereGeometry, createUniqueId } from '../utilities/utilities';
import {
    PLUTO_DIST,
    BROWN_DWARF_MASS_THRESHOLD,
    MIN_BLACK_HOLE_MASS,
    MIN_NEUTRON_STAR_MASS,
} from '../utilities/consts';
import { BlackHole } from './black-hole';
import { WhiteDwarf } from './white-dwarf';
import { Pulsar } from './pulsar';
import { Supernova } from '../effects/supernova';
import { PlanetaryNebula } from '../effects/planetary-nebula';
import { triggerScreenFlash } from '../effects/screen-flash';
import { StarLensflare } from '../effects/star-lensflare';
import { StarSurfaceMaterial, starSurfaceOctaves } from '../effects/star-surface-material';
import { StarHalo } from '../effects/star-halo';
import { BodyTypeEnum } from './body-enums';
import { environmentState } from '../simulation/environment-state';

/**
 * Blend factor for the red-giant expansion lerps (radius, mass, colour, emissive intensity).
 *
 * These used to apply a 0.01 lerp once per physics substep. At the default 64 substeps the
 * effective per-frame blend was `1 - 0.99^64 ≈ 0.47`, so applying that once per frame keeps
 * the transition running at the speed it always did. As a bonus it no longer silently
 * changes speed when the user adjusts the substep count.
 */
const RED_GIANT_BLEND = 0.47;

// Star death is a shared environment setting (toggled from either UI layer);
// reading it from the state singleton avoids DOM coupling in body classes.
function _isStarDeathEnabled(): boolean {
    return environmentState.starDeathEnabled;
}

export class MainSequenceStar extends Star {
    fuel: number | null;
    maxFuel: number | null;
    initialMass: number;
    initialRadius: number;
    initialColor: THREE.Color;
    /** Limb glow around the procedural surface. Hidden while the star is a brown dwarf. */
    halo: StarHalo | null;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IStarCreationOptions
    ) {
        // Procedural, animated surface (a port of the "Stylized Sun" Blender material).
        // Star requires each subclass to build its own surface.
        if (!options.mesh) {
            options.mesh = new THREE.Mesh(
                buildBodySphereGeometry(options.radius),
                new StarSurfaceMaterial({
                    temperature: options.temperature,
                    octaves: starSurfaceOctaves(),
                })
            );
        }

        super(dependencies, scene, options);

        const surface = this.surfaceMaterial;
        this.halo = surface
            ? new StarHalo(
                  this.mesh,
                  options.radius,
                  surface.tint,
                  surface.exposure,
                  surface.surfaceUniforms.uSsTime
              )
            : null;

        this.initialMass = options.mass;
        this.initialRadius = options.radius;
        this.initialColor = this.baseColor.clone();

        this.maxFuel = options.mass * 100000;
        this.fuel = this.maxFuel;

        this.setMass(this.mass);
    }

    /** The procedural surface material, or null if a custom mesh was supplied. */
    get surfaceMaterial(): StarSurfaceMaterial | null {
        return this.mesh?.material instanceof StarSurfaceMaterial ? this.mesh.material : null;
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
     * Drives the star's evolution and effects once per rendered frame.
     *
     * This previously ran inside the physics substep loop — 64 times per frame by default —
     * including corona particle updates, material colour lerps and label-line geometry
     * rewrites. None of it affects the gravity solution, and fuel burn is linear in dt, so
     * running it once per frame with the frame's total elapsed time is equivalent and vastly
     * cheaper.
     */
    override updateVisuals(dtTotal: number, cameraPos?: THREE.Vector3) {
        super.updateVisuals(dtTotal, cameraPos);

        if (this._isDisposed) return;

        this.surfaceMaterial?.update(dtTotal);

        const starDeathEnabled = _isStarDeathEnabled();
        if (starDeathEnabled && this.fuel !== null && this.fuel > 0) {
            const referenceMass = 1000;
            const massRatio = this.mass / referenceMass;
            const burnRate = Math.pow(massRatio, 2.5) * 0.001 * Math.abs(dtTotal);
            this.fuel -= burnRate;

            const fuelPercent = this.maxFuel !== null ? this.fuel / this.maxFuel : 0;

            // Check if star should start expanding into a red giant (only for stars that won't become neutron stars or black holes)
            if (this.initialMass < MIN_NEUTRON_STAR_MASS) {
                // Once fuel drops below 30%, start expanding and cooling into a red giant.
                if (fuelPercent < 0.3 && fuelPercent > 0) {
                    const expansionProgress = 1 - fuelPercent / 0.3;
                    const STAR_MAX_RADIUS = PLUTO_DIST;

                    const targetRadiusUnclamped = this.initialRadius * (1 + expansionProgress * 99);
                    const targetRadius = Math.min(targetRadiusUnclamped, STAR_MAX_RADIUS);

                    if (dtTotal !== 0) {
                        this.radius = this.radius + (targetRadius - this.radius) * RED_GIANT_BLEND;
                        this.setRadius(this.radius);
                    }

                    const targetMass = this.initialMass * (1 - expansionProgress * 0.5);
                    this.mass = this.mass + (targetMass - this.mass) * RED_GIANT_BLEND;

                    if (this.labelLine) {
                        const labelHeight = this.radius * 3.5;
                        const linePositions = this.labelLine.geometry.attributes.position.array;
                        linePositions[1] = this.radius;
                        linePositions[4] = labelHeight;
                        this.labelLine.geometry.attributes.position.needsUpdate = true;
                        this.label.position.y = labelHeight;
                    }

                    const targetTemp = 2200 + (fuelPercent / 0.3) * 3578;
                    this.temperature = targetTemp;

                    // Cool the surface toward red. The halo shares the surface tint, so it
                    // follows; only its exposure needs copying across.
                    const surface = this.surfaceMaterial;
                    if (surface) {
                        surface.setTemperature(targetTemp, RED_GIANT_BLEND);
                        this.halo?.setExposure(surface.exposure);
                    }
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
        this.halo?.setRadius(newRadius);
        this._syncBaselineRadiusIfStable();
    }

    override die(deathOptions?: IDeathOptions) {
        try {
            if (this.halo) {
                this.halo.dispose();
                this.halo = null;
            }
        } catch {
            // ignore
        }

        super.die(deathOptions);
    }

    override setTemperature(temp: number) {
        super.setTemperature(temp);

        if (this.bodyType & BodyTypeEnum.BrownDwarf) return;

        // Retint the procedural surface (continuous with temperature — no texture bins). This
        // also runs from inside Star's constructor, before `halo` exists, hence the `?.`.
        const surface = this.surfaceMaterial;
        if (surface) {
            surface.setTemperature(temp);
            this.halo?.setExposure(surface.exposure);
        }
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

        if (this.initialMass > MIN_NEUTRON_STAR_MASS && this.initialMass < MIN_BLACK_HOLE_MASS) {
            try {
                const pulsar = new Pulsar(
                    this.dependencies,
                    this.scene,
                    this.mesh.position.clone(),
                    this.mass,
                    createUniqueId('pulsar'),
                    this.name + ' (Pulsar)',
                    this.rotation,
                    this.initialRadius,
                    this.magneticField,
                    this.velocity
                );

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
                const blackHoleMass = this.mass * 0.9999;
                const newBlackHole = new BlackHole(
                    this.dependencies,
                    this.scene,
                    this.mesh.position.clone(),
                    blackHoleMass,
                    createUniqueId('blackhole'),
                    'Black Hole',
                    this.rotation,
                    true,
                    this.velocity
                );

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
                // The exposed core keeps the star's motion, spin and field.
                const newWhiteDwarf = new WhiteDwarf(this.dependencies, this.scene, {
                    pos: this.mesh.position.clone(),
                    vel: this.velocity,
                    mass: this.mass,
                    id: createUniqueId('whitedwarf'),
                    name: this.name + ' (White Dwarf)',
                    rotation: this.rotation,
                    magneticField: this.magneticField ?? undefined,
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

    /** Transitions this star into a brown dwarf, applying its texture and removing stellar effects. */
    transitionToBrownDwarf() {
        if (this.bodyType & BodyTypeEnum.BrownDwarf) return; // already transitioned

        // Call before setting the BrownDwarf flag so the guard in setTemperature doesn't block it.
        this.setTemperature(1000);

        this.bodyType |= BodyTypeEnum.BrownDwarf;

        // A brown dwarf barely glows: keep the dim, deep-red surface but drop the limb halo.
        this.halo?.setVisible(false);

        if (this.lensflare) {
            this.lensflare.dispose();
            this.lensflare = null;
        }

        if (this.sunLight) {
            this.sunLight.intensity = 0.002;
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

        // Restore lens flare.
        if (!this.lensflare && this.sunLight) {
            this.lensflare = new StarLensflare(this.sunLight, this.radius);
            // Base setTemperature() above doesn't reach here; tint the
            // recreated flare so resurrection isn't left white until the
            // caller happens to call setTemperature again.
            this.lensflare.setColor(this.baseColor.getHex());
        }

        // Restore light intensity.
        if (this.sunLight) {
            this.sunLight.intensity = Math.max(1.0, this.lightIntensity / 20000000);
            this.sunLight.color.setHex(0xffffff);
        }

        // Strip the suffix from the name if present.
        if (this.name.includes(' (Brown Dwarf)')) {
            this.name = this.name.replace(' (Brown Dwarf)', '');
            this.updateLabel(this.name);
        }
    }
}
