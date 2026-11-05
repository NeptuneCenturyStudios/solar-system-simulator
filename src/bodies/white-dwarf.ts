import * as THREE from 'three';
import { Star } from './star';
import { IDeathOptions, IMagneticFieldOptions, IRotation, IStateDependencies } from '../interfaces';
import { EARTH_RADIUS, SUN_LIGHT_INTENSITY, SUN_MASS } from '../utilities/consts';
import { BodyTypeEnum } from './body-enums';
import { buildBodySphereGeometry } from '../utilities/utilities';
import { StarSurfaceMaterial, starSurfaceOctaves } from '../effects/star-surface-material';
import { StarHalo } from '../effects/star-halo';
import { environmentState } from '../simulation/environment-state';

const WHITE_DWARF_RADIUS = EARTH_RADIUS;

/**
 * Radius of a white dwarf of the given mass. White dwarfs shrink as they get heavier
 * (electron-degenerate matter): R = WHITE_DWARF_RADIUS * (SUN_MASS / mass)^(1/3). Not clamped.
 */
function massToWhiteDwarfRadius(mass: number): number {
    return WHITE_DWARF_RADIUS * Math.pow(SUN_MASS / mass, 1 / 3);
}

/** Surface temperature (K) of a newly exposed core: blue-white hot. */
const WHITE_DWARF_BIRTH_TEMPERATURE = 40000;

/** Temperature (K) a white dwarf cools toward: a dull orange ember. */
const WHITE_DWARF_FINAL_TEMPERATURE = 4000;

/**
 * Cooling e-folding time, in sim seconds. A Sun-mass star burns its fuel in about 17 sim
 * seconds with star death on, so this keeps the remnant's fade on the same visible scale:
 * blue-white to white within a minute or so, then a long slide toward orange.
 */
const WHITE_DWARF_COOLING_TIME = 60;

/** Light at birth: white dwarfs are far dimmer than main-sequence stars. */
const WHITE_DWARF_LIGHT_INTENSITY = SUN_LIGHT_INTENSITY * 0.0001;

/** The light never fades below this fraction of its birth intensity. */
const WHITE_DWARF_MIN_LIGHT_FRACTION = 0.02;

/** Light falloff distance, scaled so the dimmer light still reaches a sensible range. */
const WHITE_DWARF_LIGHT_DISTANCE = (SUN_LIGHT_INTENSITY / WHITE_DWARF_LIGHT_INTENSITY) * 1000;

/** Only retint/relight when cooling has moved the temperature by at least this much (K). */
const RETINT_STEP_K = 25;

/** Options for creating a white dwarf. */
export interface IWhiteDwarfOptions {
    pos: THREE.Vector3;
    /** Inherited from the progenitor so the remnant keeps its orbit. */
    vel?: THREE.Vector3;
    mass: number;
    id: string;
    name: string;
    rotation: IRotation;
    magneticField?: IMagneticFieldOptions;
    /** Default: {@link WHITE_DWARF_BIRTH_TEMPERATURE}. */
    temperature?: number;
}

/**
 * White dwarf — the Earth-sized, electron-degenerate core a red giant leaves behind once it
 * sheds its envelope (as a planetary nebula).
 *
 * Shares the procedural star surface and limb halo with main-sequence stars, in a compact
 * style: no convection, so a smooth, brilliant surface with faint mottling and a strong limb,
 * and a clean glow without flame wisps.
 *
 * It has no fuel, so it only cools: born blue-white (~40000 K), it fades exponentially toward
 * a dull orange, and its colour, halo and light all follow the temperature. Cooling runs only
 * while star evolution (star death) is enabled.
 */
export class WhiteDwarf extends Star {
    /** Limb glow around the surface. */
    halo: StarHalo | null;

    /** Light intensity at birth temperature; the light scales down from this as it cools. */
    private readonly _birthLightIntensity = WHITE_DWARF_LIGHT_INTENSITY;
    private readonly _birthTemperature: number;
    /** Temperature the surface/light were last retinted for. */
    private _shownTemperature: number;

    constructor(dependencies: IStateDependencies, scene: THREE.Scene, options: IWhiteDwarfOptions) {
        const radius = massToWhiteDwarfRadius(options.mass);
        const temperature = options.temperature ?? WHITE_DWARF_BIRTH_TEMPERATURE;

        const mesh = new THREE.Mesh(
            buildBodySphereGeometry(radius),
            new StarSurfaceMaterial({
                temperature,
                octaves: starSurfaceOctaves(),
                style: 'whiteDwarf',
            })
        );

        super(dependencies, scene, {
            pos: options.pos,
            vel: options.vel?.clone() ?? new THREE.Vector3(0, 0, 0),
            mass: options.mass,
            radius,
            id: options.id,
            name: options.name,
            temperature,
            lightIntensity: WHITE_DWARF_LIGHT_INTENSITY,
            lightDistance: WHITE_DWARF_LIGHT_DISTANCE,
            rotation: options.rotation,
            magneticField: options.magneticField,
            mesh,
            bodyType: BodyTypeEnum.WhiteDwarf,
            // Far dimmer than the main-sequence minimum, by design.
            unclampedLightIntensity: true,
        });

        this._birthTemperature = Math.max(temperature, WHITE_DWARF_FINAL_TEMPERATURE + 1);
        this._shownTemperature = temperature;

        const surface = this.surfaceMaterial;
        this.halo = surface
            ? new StarHalo(
                  this.mesh,
                  radius,
                  surface.tint,
                  surface.exposure,
                  surface.surfaceUniforms.uSsTime,
                  0
              )
            : null;

        this._applyCoolingLight();
    }

    /** The procedural surface material. */
    get surfaceMaterial(): StarSurfaceMaterial | null {
        return this.mesh?.material instanceof StarSurfaceMaterial ? this.mesh.material : null;
    }

    override updateVisuals(dtTotal: number, cameraPos?: THREE.Vector3) {
        super.updateVisuals(dtTotal, cameraPos);
        if (this._isDisposed) return;

        this.surfaceMaterial?.update(dtTotal);

        if (environmentState.starDeathEnabled && dtTotal > 0) {
            this._cool(dtTotal);
        }
    }

    /** Exponential (Newtonian) cooling toward the final temperature. */
    private _cool(dt: number): void {
        const excess = this.temperature - WHITE_DWARF_FINAL_TEMPERATURE;
        if (excess <= 0) return;

        this.temperature =
            WHITE_DWARF_FINAL_TEMPERATURE + excess * Math.exp(-dt / WHITE_DWARF_COOLING_TIME);

        if (Math.abs(this._shownTemperature - this.temperature) >= RETINT_STEP_K) {
            this.setTemperature(this.temperature);
        }
    }

    override setTemperature(temp: number) {
        super.setTemperature(temp);
        this._shownTemperature = temp;

        // Called from inside Star's constructor too, before `halo` exists.
        const surface = this.surfaceMaterial;
        if (surface) {
            surface.setTemperature(temp);
            this.halo?.setExposure(surface.exposure);
        }

        this._applyCoolingLight();
    }

    /**
     * Light output follows the Stefan–Boltzmann law (L ∝ T⁴ at fixed radius), floored so a
     * cold remnant still faintly lights its system.
     */
    private _applyCoolingLight(): void {
        // Runs from setTemperature during Star's constructor, before the fields below exist.
        if (this._birthTemperature === undefined || !this.sunLight) return;

        const ratio = Math.pow(this.temperature / this._birthTemperature, 4);
        const fraction = Math.max(WHITE_DWARF_MIN_LIGHT_FRACTION, Math.min(1, ratio));
        this.setLightIntensity(this._birthLightIntensity * fraction);
    }

    override setRadius(newRadius: number) {
        super.setRadius(newRadius);
        this.halo?.setRadius(newRadius);
    }

    override die(deathOptions?: IDeathOptions) {
        try {
            this.halo?.dispose();
            this.halo = null;
        } catch {
            // ignore
        }
        super.die(deathOptions);
    }
}
