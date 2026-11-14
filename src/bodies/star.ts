import * as THREE from 'three';
import {
    SUN_MASS,
    SUN_RADIUS,
    STAR_LIGHT_INTENSITY_MIN,
    STAR_LIGHT_INTENSITY_MAX,
    STAR_LIGHT_DECAY,
    STAR_LIGHT_EXPOSURE,
    STAR_AMBIENT_INTENSITY,
} from '../utilities/consts';
import { buildBodySphereGeometry } from '../utilities/utilities';
import { CelestialBody } from './celestial-body';
import { triggerScreenFlash } from '../effects/screen-flash';
import { StarSurfaceMaterial, StarSurfaceStyle } from '../effects/star-surface-material';
import { StarHalo } from '../effects/star-halo';
import { starLightColor } from '../effects/star-tint';
import { IDeathOptions, IStarCreationOptions, IStateDependencies } from '../interfaces';
import { BodyTypeEnum } from './body-enums';
import { settingsStore, type StarQuality } from '../settings/settings-store';

/** Builds the procedural, animated star surface mesh. */
function buildStarSurfaceMesh(
    radius: number,
    temperature: number,
    style: StarSurfaceStyle | undefined
): THREE.Mesh {
    return new THREE.Mesh(
        buildBodySphereGeometry(radius),
        new StarSurfaceMaterial({ temperature, style })
    );
}

/**
 * A star (e.g. the Sun). Owns what every star shares:
 *  - the procedural surface ({@link StarSurfaceMaterial}, in the style the subclass asks for)
 *    and the limb {@link StarHalo} that shares its tint, exposure and clock;
 *  - the point light (coloured by temperature) and the ambient light. The lens flare is a
 *    screen-space pass (`effects/lens-flare.ts`) that reads `baseColor`, so it follows too.
 *
 * Subclasses add their own behaviour: fuel and evolution (MainSequenceStar), cooling
 * (WhiteDwarf), beams, field and accretion (Pulsar).
 */
export class Star extends CelestialBody {
    temperature: number;

    // Lighting effects
    lightIntensity: number;
    /** See {@link IStarCreationOptions.unclampedLightIntensity}. */
    unclampedLightIntensity: boolean;
    ambientLight: THREE.AmbientLight | null;
    sunLight: THREE.PointLight | null;

    /** Limb glow around the procedural surface. Null if a custom mesh was supplied. */
    halo: StarHalo | null;

    /** Star quality last applied to the surface and halo; null forces the next apply. */
    private _appliedStarQuality: StarQuality | null = null;

    /**
     * @param dependencies Same deps passed to CelestialBody (gizmo, addEvent, addExplosion, etc.)
     * @param scene        The scene the star (and its lights) are added to.
     * @param options      Creation options. Without `options.mesh` the procedural surface is built.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IStarCreationOptions
    ) {
        super(
            dependencies,
            scene,
            {
                radius: options.radius,
                pos: options.pos,
                vel: options.vel ?? new THREE.Vector3(0, 0, 0),
                mass: options.mass,
                id: options.id,
                name: options.name,
                trailColor: 0xffffff,
                maxTrail: 500,
                rotation: options.rotation,
                mesh:
                    options.mesh ??
                    buildStarSurfaceMesh(options.radius, options.temperature, options.surfaceStyle),
                magneticField: options.magneticField,
                attributes: options.attributes,
            },
            BodyTypeEnum.Star | (options.bodyType ?? BodyTypeEnum.None)
        );

        this.unclampedLightIntensity = options.unclampedLightIntensity ?? false;
        this.lightIntensity = this._clampLightIntensity(options.lightIntensity);
        this.temperature = options.temperature;

        this.sunLight = this.createLight(options.pos, this.lightIntensity, options.lightDistance);

        this.ambientLight = new THREE.AmbientLight(0xffffff, STAR_AMBIENT_INTENSITY);
        scene.add(this.ambientLight);

        this.setTemperature(options.temperature);

        const surface = this.surfaceMaterial;
        this.halo = surface
            ? new StarHalo(this.mesh, options.radius, surface, options.haloWisps ?? 1)
            : null;
        // A brown dwarf barely glows. (The flag may already be set if the mass was applied
        // during construction.)
        this.halo?.setVisible(!(this.bodyType & BodyTypeEnum.BrownDwarf));
        this._applyStarQuality();
    }

    /**
     * Pushes the star-quality setting to the surface and halo when it has changed. Polled every
     * frame, the same contract the other settings use; a change recompiles both in place.
     */
    private _applyStarQuality(): void {
        const wanted = settingsStore.settings.starQuality;
        if (wanted === this._appliedStarQuality && !this.surfaceMaterial?.awaitingBake) return;
        this._appliedStarQuality = wanted;
        this.surfaceMaterial?.setQuality(wanted);
        this.halo?.setQuality(wanted);
    }

    /** Computes the expected radius for a star of the given mass using a mass-radius power law (R ∝ M^0.8). */
    static massToRadius(mass: number): number {
        return SUN_RADIUS * Math.pow(Math.max(0, mass) / SUN_MASS, 0.8);
    }

    /** The procedural surface material, or null if a custom mesh was supplied. */
    get surfaceMaterial(): StarSurfaceMaterial | null {
        return this.mesh?.material instanceof StarSurfaceMaterial ? this.mesh.material : null;
    }

    createLight(pos: THREE.Vector3, intensity: number, distance: number) {
        // `intensity` is the star's own value; the point light carries it at the HDR exposure.
        const light = new THREE.PointLight(0xffffff, intensity * STAR_LIGHT_EXPOSURE, distance);
        light.position.copy(pos);
        light.decay = STAR_LIGHT_DECAY;
        light.userData.distance = distance;

        this.scene.add(light);
        return light;
    }

    /**
     * Per-rendered-frame visual update. Advances the surface animation and keeps the star's
     * light source on the star.
     */
    override updateVisuals(dtTotal: number, cameraPos?: THREE.Vector3) {
        super.updateVisuals(dtTotal, cameraPos);

        if (this._isDisposed) return;

        this._applyStarQuality();
        this.surfaceMaterial?.update(dtTotal);

        if (this.sunLight) {
            this.sunLight.position.copy(this.mesh.position);
        }
    }

    private _clampLightIntensity(intensity: number): number {
        return this.unclampedLightIntensity
            ? intensity
            : Math.max(STAR_LIGHT_INTENSITY_MIN, Math.min(STAR_LIGHT_INTENSITY_MAX, intensity));
    }

    setLightIntensity(intensity: number) {
        this.lightIntensity = this._clampLightIntensity(intensity);
        if (this.sunLight) {
            this.sunLight.intensity = this.lightIntensity * STAR_LIGHT_EXPOSURE;
        }
    }

    /**
     * Sets the surface temperature: retints the surface (the halo follows, as it shares the
     * surface uniforms) and recolours the light. Brown dwarfs ignore it.
     */
    setTemperature(temp: number) {
        // Brown dwarfs manage their own fixed visual state; ignore temperature overrides.
        if (this.bodyType & BodyTypeEnum.BrownDwarf) {
            return;
        }

        this.temperature = temp;
        this.surfaceMaterial?.setTemperature(temp);
        this.applyLightColor(temp);
    }

    /** Colours the base colour (which the lens flare reads) and point light for the temperature. */
    protected applyLightColor(temp: number) {
        starLightColor(temp, this.baseColor);
        this.sunLight?.color.copy(this.baseColor);
    }

    override setRadius(newRadius: number) {
        super.setRadius(newRadius);
        this.halo?.setRadius(newRadius);
    }

    die(deathOptions?: IDeathOptions) {
        if (this._isDisposed) return;

        // The halo is a child of the mesh: dispose it before the mesh goes.
        try {
            if (this.halo) {
                this.halo.dispose();
                this.halo = null;
            }
        } catch {
            // ignore
        }

        try {
            if (this.trail) {
                this.trail.visible = false;
                this.scene.remove(this.trail);

                this.trail.geometry?.dispose?.();
                (this.trail.material as THREE.Material)?.dispose?.();
                this.trail = null;
            }
        } catch {
            // ignore
        }

        try {
            if (this.mesh) {
                this.mesh.visible = false;
                this.scene.remove(this.mesh);

                this.mesh.geometry?.dispose?.();
                (this.mesh.material as THREE.Material)?.dispose?.();
            }
        } catch {
            // ignore
        }

        try {
            if (this.sunLight) {
                this.sunLight.visible = false;
                this.scene.remove(this.sunLight);
                this.sunLight = null;
            }
        } catch {
            // ignore
        }

        try {
            if (this.ambientLight) {
                this.ambientLight.visible = false;
                this.scene.remove(this.ambientLight);
                this.ambientLight = null;
            }
        } catch {
            // ignore
        }

        if (!deathOptions?.skipExplosion) {
            try {
                triggerScreenFlash();
            } catch {
                // ignore
            }
        }

        super.die(deathOptions);
    }
}
