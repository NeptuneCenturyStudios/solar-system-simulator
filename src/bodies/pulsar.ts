import * as THREE from 'three';
import { Star, IStarCreationOptions } from './star';
import { IStateDependencies } from '../interfaces';
import { loadSrgbTexture } from '../drawing/textures';
import { BodyTypeEnum } from '../utilities/utilities';
import { IRotation } from '../physics/physics';
import { SCALE_FACTOR, SUN_MASS } from '../utilities/consts';
import { PulsarBeam } from '../effects/pulsar-beam';
import { StarGlow } from '../effects/star-glow';

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

const PULSAR_TEMPERATURE      = 1_000_000;
const PULSAR_LIGHT_INTENSITY  = 50_000_000;
const PULSAR_LIGHT_DISTANCE   = 800;

/**
 * Minimum / maximum spin rates for visual clarity (radians per sim-second).
 * The physically correct value from angular momentum conservation would be many
 * orders of magnitude faster; we clamp to a lighthouse-sweep range instead.
 */
const PULSAR_MIN_SPIN = Math.PI * 2;        // 1 rotation / sim-sec
const PULSAR_MAX_SPIN = Math.PI * 10;       // 5 rotations / sim-sec

/**
 * A pulsar: a rapidly spinning neutron star that emits narrow beams of electromagnetic
 * radiation from its magnetic poles, which are offset from its rotation axis.
 *
 * Physics implemented:
 *  - Mass compressed via neutron-star degenerate-matter radius formula
 *  - Spin-up via angular momentum conservation: ω_new = ω_old × (R_progenitor / R_pulsar)²
 *  - Rotating magnetic-axis beam effect (PulsarBeam)
 */
export class Pulsar extends Star {
    private beam: PulsarBeam;
    private glow: StarGlow;

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
        const pulsarRadius  = massToNeutronStarRadius(mass);

        // Angular momentum conservation: I * ω = const, I ∝ R²
        // ω_new = ω_old * (R_old / R_new)²
        const rawSpinUp   = progenitorRotation.speed * Math.pow(progenitorRadius / pulsarRadius, 2);
        const newSpeed    = Math.max(PULSAR_MIN_SPIN, Math.min(PULSAR_MAX_SPIN, rawSpinUp));
        const newRotation: IRotation = {
            axis:  progenitorRotation.axis.clone(),
            speed: newSpeed,
        };

        const options: IStarCreationOptions = {
            pos,
            vel:           new THREE.Vector3(0, 0, 0),
            mass,
            radius:        pulsarRadius,
            id,
            name,
            temperature:   PULSAR_TEMPERATURE,
            lightIntensity: PULSAR_LIGHT_INTENSITY,
            lightDistance:  PULSAR_LIGHT_DISTANCE,
            rotation:      newRotation,
        };

        const textures = {
            sunTexture:        pulsarTexture,
            redStarTexture:    null,
            orangeStarTexture: null,
            whiteStarTexture:  null,
            blueStarTexture:   null,
            whiteDwarfTexture: null,
            brownDwarfTexture: null,
        };

        super(dependencies, scene, options, textures);

        this.bodyType = BodyTypeEnum.Pulsar | BodyTypeEnum.Star;

        this.beam = new PulsarBeam(
            dependencies,
            scene,
            this.mesh.position.clone(),
            pulsarRadius,
            newRotation.axis,
            newSpeed
        );

        // Glow: use the temperature-derived colour from the star base class.
        // Use a large scale multiplier (20×) so the glow is visible at solar-system
        // zoom levels despite the pulsar's tiny physical radius (~3-4 units).
        // Pulse amplitude is very subtle — pulsars are compact and stable.
        this.glow = new StarGlow(
            dependencies,
            scene,
            pulsarRadius,
            this.baseColor.getHex(),
            this.mesh.position.clone(),
            0.05,
            20
        );
    }

    override update(acc: THREE.Vector3, dt: number): void {
        if (this._isDisposed) return;
        super.update(acc, dt);
        this.beam.setPosition(this.mesh.position);
        this.beam.update(dt);
        this.glow.setPosition(this.mesh.position);
        this.glow.update(dt);
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
        super.die(skipExplosion);
    }
}

