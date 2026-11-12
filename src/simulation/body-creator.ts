import * as THREE from 'three';

import {
    BodyTypeEnum,
    BodyTypeKeyEnum,
    MoonTypeEnum,
    OrbitTypeEnum,
    PlanetTypeEnum,
    PresetBodyKeyEnum,
} from '../bodies/body-enums';
import { Body } from '../bodies/body';
import { CelestialBody } from '../bodies/celestial-body';
import { Star } from '../bodies/star';
import { Sun } from '../bodies/sun';
import { Mercury } from '../bodies/mercury';
import { Venus } from '../bodies/venus';
import { Earth } from '../bodies/earth';
import { Mars } from '../bodies/mars';
import { Jupiter } from '../bodies/jupiter';
import { Saturn } from '../bodies/saturn';
import { Uranus } from '../bodies/uranus';
import { Neptune } from '../bodies/neptune';
import { Pluto } from '../bodies/pluto';
import { Ceres } from '../bodies/ceres';
import { Halley } from '../bodies/halley';
import { Moon } from '../bodies/moon';
import { Asteroid } from '../bodies/asteroid';
import { BlackHole } from '../bodies/black-hole';
import { Wormhole } from '../bodies/wormhole';
import { createCometBody } from '../bodies/comet-variants';
import {
    getPendingWormholeLink,
    setPendingWormholeLink,
    clearPendingWormholeLink,
} from '../bodies/wormhole-link-state';
import {
    createCallistoBody,
    createCharonBody,
    createEarthMoonBody,
    createEuropaBody,
    createGanymedeBody,
    createHygieaBody,
    createIoBody,
    createIssBody,
    createPallasBody,
    createTitanBody,
    createVestaBody,
} from '../procedural/real-solar-system-bodies';
import { createMainSequenceStarFromParams } from '../procedural/star-factory';
import { createPlanetBodyFromProceduralCreation } from '../procedural/planet-factory';
import { pickMoonTextureForMoonType } from '../procedural/moon-factory';
import { upgradeProceduralTexture } from '../procedural/texture-upgrader';
import { rollMagneticField, type MagneticFieldKind } from '../procedural/magnetic-field';
import {
    type IAtmosphereProfile,
    resolveAtmosphereProfile,
    rollAtmosphereProfile,
    rollAtmosphereValues,
} from '../procedural/atmosphere-profile';
import { applyAtmosphereToBody } from '../procedural/atmosphere-factory';
import { computePlanetaryAttributes } from '../procedural/planet-attributes';
import { generateCustomBodyName } from '../procedural/custom-body-naming';
import { generateSeedString } from '../procedural/seed-utils';
import { createBridgeForPair } from '../effects/wormhole-link-bridge';
import { getRoughnessForMoonTexture, getMetalnessForMoonTexture } from '../drawing/textures';
import {
    computeBinaryVelocities,
    computeOrbitVelocityAtPos,
    systemBarycenterOrbitVelocity,
} from '../physics/spawn-orbit-velocity';
import { setBodyRadius } from '../physics/physics';
import {
    randomStarParams,
    randomBlackHoleParams,
    randomPlanetParams,
    randomMoonParams,
    randomCometParams,
    randomAsteroidParams,
    randomWormholeParams,
} from '../utilities/body-params';
import { DIST_SCALE, EARTH_RADIUS, SUN_MASS, WORMHOLE_DEFAULT_RADIUS } from '../utilities/consts';
import { createUniqueId, buildBodySphereGeometry } from '../utilities/utilities';
import { SeededRandom } from '../utilities/prng';
import { spinPoleQuaternion } from '../utilities/spin-pole';
import { NotificationType } from '../event-log/event-log';
import type { IMagneticFieldOptions, IStateDependencies } from '../interfaces';
import type { RandomizedCreateDefaults } from '../vue/sim-bridge';
import { cameraState, simulationState } from './simulation';
import { recordCreation } from '../persistence/creation-registry';
import { CreationKind, type ISavedCustomOptions } from '../persistence/save-file';

/** Everything the custom add form can set on a new body. Omitted fields are rolled. */
export interface ICreateCustomBodyOptions {
    bodyType: BodyTypeKeyEnum;
    /** Planet subtype for planets, moon subtype for moons; ignored otherwise. */
    planetType?: PlanetTypeEnum | MoonTypeEnum;
    orbitType?: OrbitTypeEnum;
    inclination?: number;
    /** Undefined rolls one procedurally; null means airless (ignored by subtypes that always
     *  have an atmosphere — Temperate and gas/ice giants). */
    atmosphere?: IAtmosphereProfile | null;
    hasRings?: boolean;
    customMass?: number | null;
    customTemperature?: number | null;
    customLightIntensity?: number | null;
    customRadius?: number | null;
    /** Body to orbit; the primary star when null (stars stay put, moons use the focused body). */
    orbitParent?: Body | null;
    createTilt?: number | null;
    createAzimuth?: number | null;
    /** Comet tail color as a `#rrggbb` string. */
    tailColor?: string | null;
    /** Undefined rolls one procedurally; null means "this body has no field". */
    magneticField?: IMagneticFieldOptions | null;
    /** Null/empty means "generate one procedurally from the new body's id". */
    customName?: string | null;
    /** Orbit the live system barycenter instead of `orbitParent` (stars, planets, asteroids,
     *  comets). Falls back to the parent path when the system has no stars or black holes. */
    orbitSystemBarycenter?: boolean;
}

/** `ICreateCustomBodyOptions` with every default filled in. */
type ResolvedCreateOptions = Required<
    Omit<ICreateCustomBodyOptions, 'atmosphere' | 'magneticField'>
> &
    Pick<ICreateCustomBodyOptions, 'atmosphere' | 'magneticField'>;

/**
 * Rebuilding a body from a save rather than for the user: the body keeps its saved id (so
 * id-seeded textures, rings and atmospheres come out identical), nothing is focused, and no
 * helper bodies (a guide star, a preset moon's parent) are created on the side.
 */
export interface IRestoreCreateOptions {
    id: string;
    /** Preset moons/satellites: the live parent to orbit. */
    orbitParent?: CelestialBody | null;
}

/** The custom form's options in plain-data form, for the creation registry. */
function toSavedCustomOptions(o: ICreateCustomBodyOptions): ISavedCustomOptions {
    const { orbitParent, ...rest } = o;
    return { ...rest, orbitParentId: orbitParent ? orbitParent.id : null };
}

/** Barycentric orbit velocity at `spawnPos`, or null to use the parent-based path. */
type BarycenterVelocityFn = (spawnPos: THREE.Vector3, eccentricity: number) => THREE.Vector3 | null;

export interface IBodyCreatorOptions {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    camera: THREE.Camera;
    /** The system's primary star, or null when it has none. */
    getPrimaryStar: () => Star | null;
    /** Select `body` and point the camera at it (index.ts's shared selection pipeline). */
    setFocusBody: (body: Body | null, options?: { zoom?: boolean }) => void;
}

/**
 * Parent each preset moon/satellite orbits, keyed by preset key. The parent is found by name
 * (or created from its own preset when missing) before the child is built around it.
 */
const PRESET_CHILD_BODIES: Partial<
    Record<
        PresetBodyKeyEnum,
        {
            parentName: string;
            parentPresetKey: PresetBodyKeyEnum;
            build: (parent: CelestialBody, scene: THREE.Scene, id: string) => Body;
        }
    >
> = {
    [PresetBodyKeyEnum.EarthMoon]: {
        parentName: 'Earth',
        parentPresetKey: PresetBodyKeyEnum.Earth,
        build: createEarthMoonBody,
    },
    [PresetBodyKeyEnum.Iss]: {
        parentName: 'Earth',
        parentPresetKey: PresetBodyKeyEnum.Earth,
        build: createIssBody,
    },
    [PresetBodyKeyEnum.Io]: {
        parentName: 'Jupiter',
        parentPresetKey: PresetBodyKeyEnum.Jupiter,
        build: createIoBody,
    },
    [PresetBodyKeyEnum.Europa]: {
        parentName: 'Jupiter',
        parentPresetKey: PresetBodyKeyEnum.Jupiter,
        build: createEuropaBody,
    },
    [PresetBodyKeyEnum.Ganymede]: {
        parentName: 'Jupiter',
        parentPresetKey: PresetBodyKeyEnum.Jupiter,
        build: createGanymedeBody,
    },
    [PresetBodyKeyEnum.Callisto]: {
        parentName: 'Jupiter',
        parentPresetKey: PresetBodyKeyEnum.Jupiter,
        build: createCallistoBody,
    },
    [PresetBodyKeyEnum.Titan]: {
        parentName: 'Saturn',
        parentPresetKey: PresetBodyKeyEnum.Saturn,
        build: createTitanBody,
    },
    [PresetBodyKeyEnum.Charon]: {
        parentName: 'Pluto',
        parentPresetKey: PresetBodyKeyEnum.Pluto,
        build: createCharonBody,
    },
};

/** `subtype` as a planet subtype, or Terrestrial when it is not one. */
function toPlanetType(subtype: string | null | undefined): PlanetTypeEnum {
    return Object.values(PlanetTypeEnum).find((t) => t === subtype) ?? PlanetTypeEnum.Terrestrial;
}

/** `subtype` as a moon subtype, or Terrestrial when it is not one. */
function toMoonType(subtype: string | null | undefined): MoonTypeEnum {
    return Object.values(MoonTypeEnum).find((t) => t === subtype) ?? MoonTypeEnum.Terrestrial;
}

/** A finite, positive radius override, or null. */
function validRadius(radius: number | null): number | null {
    return typeof radius === 'number' && isFinite(radius) && radius > 0 ? radius : null;
}

/**
 * Creates bodies from the Add/Edit Body panel: real solar system presets and custom bodies
 * built from the add form's values. New bodies spawn near the camera, are added to the
 * simulation, announced with `body:added`, and selected.
 */
export class BodyCreator {
    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly camera: THREE.Camera;
    private readonly getPrimaryStar: () => Star | null;
    private readonly setFocusBody: (body: Body | null, options?: { zoom?: boolean }) => void;
    /** Set while a body is being rebuilt from a save; see IRestoreCreateOptions. */
    private restore: IRestoreCreateOptions | null = null;

    constructor(options: IBodyCreatorOptions) {
        this.dependencies = options.dependencies;
        this.scene = options.scene;
        this.camera = options.camera;
        this.getPrimaryStar = options.getPrimaryStar;
        this.setFocusBody = options.setFocusBody;
    }

    /** A point `offset` ahead of the camera, where interactively created bodies appear. */
    getNearCameraSpawnPos(offset = 0.5 / DIST_SCALE): THREE.Vector3 {
        const dir = new THREE.Vector3();
        this.camera.getWorldDirection(dir);
        return this.camera.position.clone().add(dir.multiplyScalar(offset));
    }

    /** Creates a real solar system body by preset key. */
    createPreset(key: PresetBodyKeyEnum, restore?: IRestoreCreateOptions): Body | undefined {
        if (restore) {
            this.restore = restore;
            try {
                return this.createPresetInner(key);
            } finally {
                this.restore = null;
            }
        }
        return this.createPresetInner(key);
    }

    private createPresetInner(key: PresetBodyKeyEnum): Body | undefined {
        // Presets assume a star exists. If launching empty mode, guide the user by creating a small star.
        if (!this.restore && !this.getPrimaryStar() && key !== PresetBodyKeyEnum.Sun) {
            this.createCustom({ bodyType: BodyTypeKeyEnum.Star });
        }

        // Moons and satellites orbit a specific parent: reuse a live one with the right name, or
        // create it from its own preset first (which places it near the camera like any preset).
        const childSpec = PRESET_CHILD_BODIES[key];
        let newBody: Body | null;

        if (childSpec && this.restore) {
            // Restoring: orbit the saved parent; never create one on the side.
            const parent = this.restore.orbitParent;
            if (!parent || parent._isDisposed) return;
            newBody = childSpec.build(parent, this.scene, this.restore.id);
        } else if (childSpec) {
            const existing = simulationState.bodies.find(
                (b): b is CelestialBody =>
                    !!b &&
                    !b._isDisposed &&
                    b.name === childSpec.parentName &&
                    b instanceof CelestialBody
            );
            const created = existing ? null : this.createPreset(childSpec.parentPresetKey);
            const parent = existing ?? (created instanceof CelestialBody ? created : null);
            if (!parent) return;
            newBody = childSpec.build(parent, this.scene, createUniqueId(key));
        } else {
            newBody = this.buildPresetBody(key);
        }

        if (!newBody) return;

        // Reposition preset bodies near the camera (like custom bodies), so the user sees them
        // immediately rather than spawning at their preset orbital distance (e.g. Pluto at the
        // edge of the system). The Sun stays at the origin.
        // Moons and satellites keep the orbit they were built on around their parent.
        if (key !== PresetBodyKeyEnum.Sun && !childSpec && !this.restore) {
            const star = this.getPrimaryStar();
            if (star && star.mesh) {
                const spawnPos = this.getNearCameraSpawnPos();
                const spawnVel = computeOrbitVelocityAtPos(
                    spawnPos,
                    star.mesh.position,
                    star.mass,
                    OrbitTypeEnum.Circular,
                    0,
                    0,
                    simulationState.gMultiplier
                );
                newBody.mesh.position.copy(spawnPos);
                newBody.velocity.copy(spawnVel);
            }
        }

        recordCreation(newBody, { kind: CreationKind.Preset, presetKey: key });
        this.addToSimulation(newBody, newBody);
        return newBody;
    }

    /** Creates a custom body from the add form's values. Null when nothing was created. */
    createCustom(options: ICreateCustomBodyOptions, restore?: IRestoreCreateOptions): Body | null {
        if (restore) {
            this.restore = restore;
            try {
                return this.createCustomInner(options);
            } finally {
                this.restore = null;
            }
        }
        return this.createCustomInner(options);
    }

    private createCustomInner(options: ICreateCustomBodyOptions): Body | null {
        const o: ResolvedCreateOptions = {
            bodyType: options.bodyType,
            planetType: options.planetType ?? PlanetTypeEnum.Terrestrial,
            orbitType: options.orbitType ?? OrbitTypeEnum.Circular,
            inclination: options.inclination ?? 0,
            atmosphere: options.atmosphere,
            hasRings: options.hasRings ?? false,
            customMass: options.customMass ?? null,
            customTemperature: options.customTemperature ?? null,
            customLightIntensity: options.customLightIntensity ?? null,
            customRadius: options.customRadius ?? null,
            orbitParent: options.orbitParent ?? null,
            createTilt: options.createTilt ?? null,
            createAzimuth: options.createAzimuth ?? null,
            tailColor: options.tailColor ?? null,
            magneticField: options.magneticField,
            customName: options.customName ?? null,
            orbitSystemBarycenter: options.orbitSystemBarycenter ?? false,
        };

        let usedSystemBarycenter = false;
        const barycenterVelocity: BarycenterVelocityFn = (spawnPos, eccentricity) => {
            if (!o.orbitSystemBarycenter) return null;
            const vel = systemBarycenterOrbitVelocity(
                simulationState.bodies,
                spawnPos,
                o.orbitType,
                eccentricity,
                o.inclination,
                simulationState.gMultiplier
            );
            if (vel) usedSystemBarycenter = true;
            return vel;
        };

        // Moons keep selection/focus on their parent so the user can keep adding moons to the
        // same body without re-selecting it each time.
        let focusTarget: Body | null = null;
        let newBody: Body | null = null;

        switch (o.bodyType) {
            case BodyTypeKeyEnum.Star:
                newBody = this.createStar(o, barycenterVelocity);
                break;
            case BodyTypeKeyEnum.Planet:
                newBody = this.createPlanet(o, barycenterVelocity);
                break;
            case BodyTypeKeyEnum.Moon: {
                const parent = this.resolveMoonParent(o.orbitParent);
                if (!parent) {
                    console.log('Please select a body first to create a moon');
                    return null;
                }
                newBody = this.createMoon(o, parent);
                focusTarget = parent;
                break;
            }
            case BodyTypeKeyEnum.Asteroid:
                newBody = this.createAsteroid(o, barycenterVelocity);
                break;
            case BodyTypeKeyEnum.Comet:
                newBody = this.createComet(o, barycenterVelocity);
                break;
            case BodyTypeKeyEnum.BlackHole:
                newBody = this.createBlackHole(o);
                break;
            case BodyTypeKeyEnum.Wormhole:
                newBody = this.createWormhole(o);
                break;
            default:
                break;
        }

        if (!newBody) return null;

        if (usedSystemBarycenter && newBody instanceof CelestialBody) {
            newBody.orbitsSystemBarycenter = true;
        }

        // Apply axial tilt/azimuth from create sliders if the body supports rotation
        if (
            (o.createTilt !== null || o.createAzimuth !== null) &&
            newBody instanceof CelestialBody &&
            newBody.rotation
        ) {
            const tilt = o.createTilt !== null ? o.createTilt : (newBody.rotation.tilt ?? 0);
            const azimuth =
                o.createAzimuth !== null ? o.createAzimuth : (newBody.rotation.azimuth ?? 0);
            newBody.rotation.tilt = tilt;
            newBody.rotation.azimuth = azimuth;
            spinPoleQuaternion(tilt, azimuth, newBody.mesh.quaternion);
        }

        recordCreation(newBody, {
            kind: CreationKind.Custom,
            options: toSavedCustomOptions(options),
        });
        this.addToSimulation(newBody, focusTarget ?? newBody);
        console.log(`Created new ${o.bodyType}:`, newBody.name);

        return newBody._isDisposed ? null : newBody;
    }

    /**
     * Freshly randomized preview values for the add form. A `requestedSubtype` that is valid
     * for the body type is kept instead of rolling a random one.
     */
    getRandomizedDefaults(
        bodyType: BodyTypeKeyEnum,
        requestedSubtype?: string
    ): RandomizedCreateDefaults {
        const PLANET_TYPES = Object.values(PlanetTypeEnum);
        const MOON_TYPES = Object.values(MoonTypeEnum);
        const randBool = () => Math.random() < 0.5;
        // The panel's randomize button is unseeded, so feed the shared roll a throwaway seed.
        const rollField = (kind: MagneticFieldKind) =>
            rollMagneticField(new SeededRandom(generateSeedString()), kind);

        if (bodyType === BodyTypeKeyEnum.Star) {
            const star = randomStarParams();
            const tilt = Math.round(star.rotationTilt);
            return {
                mass: star.mass,
                radius: star.radius,
                temperature: star.temperature,
                lightIntensity: star.lightIntensity,
                tilt,
                azimuth: Math.round(star.rotationAzimuth),
                inclination: tilt,
                hasAtmosphere: false,
                atmosphere: null,
                hasRings: false,
                magneticField: rollField('star'),
                planetType: null,
                moonType: null,
            };
        }

        // Non-star bodies randomize inclination independently of tilt (matches the old panel's
        // `randomizeCreateBodyInputs`, which rolls this for every type except sun).
        const inclination = Math.round(Math.random() * 90);

        if (bodyType === BodyTypeKeyEnum.BlackHole) {
            const bh = randomBlackHoleParams();
            return {
                mass: bh.mass,
                radius: bh.radius,
                temperature: null,
                lightIntensity: null,
                tilt: null,
                azimuth: null,
                inclination,
                hasAtmosphere: false,
                atmosphere: null,
                hasRings: false,
                magneticField: null,
                planetType: null,
                moonType: null,
            };
        }

        if (bodyType === BodyTypeKeyEnum.Wormhole) {
            const wormhole = randomWormholeParams();
            return {
                mass: null,
                radius: wormhole.radius,
                temperature: null,
                lightIntensity: null,
                tilt: Math.round(wormhole.rotationTilt),
                azimuth: Math.round(wormhole.rotationAzimuth),
                inclination,
                hasAtmosphere: false,
                atmosphere: null,
                hasRings: false,
                magneticField: null,
                planetType: null,
                moonType: null,
            };
        }

        if (bodyType === BodyTypeKeyEnum.Planet) {
            // A caller-pinned subtype (the user just picked one in the dropdown) is kept;
            // otherwise roll one.
            const planetType =
                PLANET_TYPES.find((t) => t === requestedSubtype) ??
                PLANET_TYPES[Math.floor(Math.random() * PLANET_TYPES.length)];
            const params = randomPlanetParams(planetType);
            // Same odds as procedural generation; the values also pre-fill the controls when the
            // roll comes up airless, so checking "Has Atmosphere" still starts from sane numbers.
            const atmosphereRng = new SeededRandom(generateSeedString());
            const rolledAtmosphere = rollAtmosphereProfile(atmosphereRng, planetType, 'planet');
            return {
                mass: params.mass,
                radius: params.radius,
                temperature: null,
                lightIntensity: null,
                tilt: Math.round(params.rotationTilt),
                azimuth: Math.round(params.rotationAzimuth),
                inclination,
                hasAtmosphere: rolledAtmosphere !== null,
                atmosphere:
                    rolledAtmosphere ?? rollAtmosphereValues(atmosphereRng, planetType, 'planet'),
                hasRings: randBool(),
                magneticField: rollField(
                    planetType === PlanetTypeEnum.GasGiant
                        ? 'gasGiant'
                        : planetType === PlanetTypeEnum.IceGiant
                          ? 'iceGiant'
                          : 'solid'
                ),
                planetType,
                moonType: null,
            };
        }

        if (bodyType === BodyTypeKeyEnum.Moon) {
            const moonType =
                MOON_TYPES.find((t) => t === requestedSubtype) ??
                MOON_TYPES[Math.floor(Math.random() * MOON_TYPES.length)];
            const params = randomMoonParams(EARTH_RADIUS);
            const atmosphereRng = new SeededRandom(generateSeedString());
            const rolledAtmosphere = rollAtmosphereProfile(atmosphereRng, moonType, 'moon');
            return {
                mass: params.mass,
                radius: params.radius,
                temperature: null,
                lightIntensity: null,
                tilt: Math.round(params.rotationTilt),
                azimuth: Math.round(params.rotationAzimuth),
                inclination,
                hasAtmosphere: rolledAtmosphere !== null,
                atmosphere:
                    rolledAtmosphere ?? rollAtmosphereValues(atmosphereRng, moonType, 'moon'),
                hasRings: false,
                magneticField: rollField('moon'),
                planetType: null,
                moonType,
            };
        }

        // Asteroid/comet: no tilt preview, but mass/radius are editable in the add form, so
        // preview the same roll createCustom would have made.
        const smallBody =
            bodyType === BodyTypeKeyEnum.Comet ? randomCometParams() : randomAsteroidParams();
        return {
            mass: smallBody.mass,
            radius: smallBody.radius,
            temperature: null,
            lightIntensity: null,
            tilt: null,
            azimuth: null,
            inclination,
            hasAtmosphere: false,
            atmosphere: null,
            hasRings: false,
            magneticField: null,
            planetType: null,
            moonType: null,
        };
    }

    // ── Presets ─────────────────────────────────────────────────────────────

    /** Builds a preset that does not orbit a specific parent body. */
    private buildPresetBody(key: PresetBodyKeyEnum): Body | null {
        const deps = this.dependencies;
        const scene = this.scene;
        switch (key) {
            case PresetBodyKeyEnum.Sun:
                return new Sun(deps, scene);
            case PresetBodyKeyEnum.Mercury:
                return new Mercury(deps, scene);
            case PresetBodyKeyEnum.Venus:
                return new Venus(deps, scene);
            case PresetBodyKeyEnum.Earth:
                return new Earth(deps, scene);
            case PresetBodyKeyEnum.Mars:
                return new Mars(deps, scene);
            case PresetBodyKeyEnum.Jupiter:
                return new Jupiter(deps, scene);
            case PresetBodyKeyEnum.Saturn:
                return new Saturn(deps, scene);
            case PresetBodyKeyEnum.Uranus:
                return new Uranus(deps, scene);
            case PresetBodyKeyEnum.Neptune:
                return new Neptune(deps, scene);
            case PresetBodyKeyEnum.Pluto:
                return new Pluto(deps, scene);
            case PresetBodyKeyEnum.Ceres:
                return new Ceres(deps, scene);
            case PresetBodyKeyEnum.Vesta:
                return createVestaBody(deps, scene, this.getPrimaryStar(), this.makeId(key));
            case PresetBodyKeyEnum.Pallas:
                return createPallasBody(deps, scene, this.getPrimaryStar(), this.makeId(key));
            case PresetBodyKeyEnum.Hygiea:
                return createHygieaBody(deps, scene, this.getPrimaryStar(), this.makeId(key));
            case PresetBodyKeyEnum.Halley:
                return new Halley(deps, scene);
            default:
                console.warn('Unknown presetKey:', key);
                return null;
        }
    }

    // ── Custom bodies ───────────────────────────────────────────────────────

    /** The live orbit parent, or the primary star when there is none. */
    private resolveOrbitParent(orbitParent: Body | null): Body | null {
        return orbitParent && !orbitParent._isDisposed ? orbitParent : this.getPrimaryStar();
    }

    /** Spawn velocity orbiting the barycenter, else the parent (or a Sun-mass body at the origin). */
    private orbitVelocity(
        o: ResolvedCreateOptions,
        spawnPos: THREE.Vector3,
        eccentricity: number,
        barycenterVelocity: BarycenterVelocityFn
    ): THREE.Vector3 {
        const parent = this.resolveOrbitParent(o.orbitParent);
        const parentPos = parent ? parent.mesh.position.clone() : new THREE.Vector3(0, 0, 0);
        const parentMass = parent ? parent.mass : SUN_MASS;
        return (
            barycenterVelocity(spawnPos, eccentricity) ??
            computeOrbitVelocityAtPos(
                spawnPos,
                parentPos,
                parentMass,
                o.orbitType,
                eccentricity,
                o.inclination,
                simulationState.gMultiplier
            )
        );
    }

    private createStar(o: ResolvedCreateOptions, barycenterVelocity: BarycenterVelocityFn): Body {
        // Defaults are randomized around star-like values so the user can override them
        // in the creation UI before the body is actually created.
        // First star goes to world center; additional stars spawn near the camera.
        // Also treat an existing black hole as occupying the center.
        const hasCentralBody =
            !!this.getPrimaryStar() ||
            simulationState.bodies.some((b) => b && !b._isDisposed && b instanceof BlackHole);
        const starPos = hasCentralBody ? this.getNearCameraSpawnPos() : new THREE.Vector3(0, 0, 0);

        const id = this.makeId('star');
        const starParams = randomStarParams({
            // Seeded from the id, so a star rebuilt from a save keeps its look.
            seed: `${id}|star`,
            mass: o.customMass,
            radius: o.customRadius,
            temperature: o.customTemperature,
            lightIntensity: o.customLightIntensity,
        });
        const { rotationTilt, rotationSpeed } = starParams;

        const name = o.customName ?? generateCustomBodyName(BodyTypeKeyEnum.Star, id);

        const liveParent = o.orbitParent && !o.orbitParent._isDisposed ? o.orbitParent : null;
        const baryVel = barycenterVelocity(starPos, 0.3);
        const binary =
            !baryVel &&
            o.orbitType === OrbitTypeEnum.Binary &&
            liveParent instanceof CelestialBody &&
            !!(liveParent.bodyType & BodyTypeEnum.Star)
                ? computeBinaryVelocities(
                      liveParent,
                      starPos,
                      starParams.mass,
                      o.inclination,
                      simulationState.gMultiplier
                  )
                : null;

        let starVel: THREE.Vector3;
        if (baryVel) {
            starVel = baryVel;
        } else if (binary) {
            starVel = binary.newVel;
        } else if (liveParent) {
            starVel = computeOrbitVelocityAtPos(
                starPos,
                liveParent.mesh.position.clone(),
                liveParent.mass,
                o.orbitType,
                0.3,
                o.inclination,
                simulationState.gMultiplier
            );
        } else {
            starVel = new THREE.Vector3(0, 0, 0);
        }

        const star = createMainSequenceStarFromParams(this.dependencies, this.scene, starParams, {
            id,
            name,
            pos: starPos,
            vel: starVel,
            rotation: { tilt: rotationTilt, speed: rotationSpeed },
            magneticField: o.magneticField,
        });

        // Binary: the parent now swings around the shared barycenter too.
        if (binary && liveParent instanceof CelestialBody) {
            liveParent.velocity.copy(binary.parentVel);
            liveParent.binaryPartner = star;
            star.binaryPartner = liveParent;
        }

        return star;
    }

    private createPlanet(o: ResolvedCreateOptions, barycenterVelocity: BarycenterVelocityFn): Body {
        // Create a new planet near the camera with appropriate orbital velocity
        const spawnPos = this.getNearCameraSpawnPos();
        const spawnVel = this.orbitVelocity(o, spawnPos, 0.3, barycenterVelocity);

        // Custom mode: never create dwarfs (UI dropdown has only planet subtypes).
        const planetType = toPlanetType(o.planetType);

        const planetId = this.makeId('planet');
        const planetSeed = `${planetId}|custom|${planetType}`;

        const {
            mass: planetMass,
            radius: planetRadius,
            rotationSpeed: planetRotationSpeed,
            rotationTilt: planetRotationTilt,
            rotationAzimuth: planetRotationAzimuth,
            bodySubtype: planetBodySubtype,
        } = randomPlanetParams(planetType, {
            mass: o.customMass,
            radius: o.customRadius,
            seed: planetSeed,
        });

        const planet = createPlanetBodyFromProceduralCreation(this.dependencies, this.scene, {
            id: planetId,
            name: o.customName ?? generateCustomBodyName(BodyTypeKeyEnum.Planet, planetId),
            pos: spawnPos,
            vel: spawnVel,
            bodyType: BodyTypeEnum.Planet,
            bodySubtype: planetBodySubtype,
            radius: planetRadius,
            mass: planetMass,
            rotationSpeed: planetRotationSpeed,
            rotationTilt: planetRotationTilt,
            rotationAzimuth: planetRotationAzimuth,
            hasRings: o.hasRings,
            magneticField: o.magneticField,
            textureSeed: planetSeed,
            atmosphere: o.atmosphere,
        });

        // Ensure brightness scaling uses a neutral base when texture is present
        planet.baseColor = new THREE.Color(0xffffff);

        // Kick off background procedural texture upgrade (desert/ocean/frozen only)
        upgradeProceduralTexture(planet);
        return planet;
    }

    /** The body a new moon orbits (management panel selection takes priority), or null. */
    private resolveMoonParent(orbitParent: Body | null): Body | null {
        const candidate = orbitParent || cameraState.focusBody;
        return candidate && !candidate._isDisposed && simulationState.bodies.includes(candidate)
            ? candidate
            : null;
    }

    private createMoon(o: ResolvedCreateOptions, parent: Body): Body {
        // Step 1: get parent's world position and velocity
        const parentPos = parent.mesh.position.clone();
        const parentVel = parent.velocity.clone();

        // Step 2: size/spin params. Only the procedural generators use the rolled orbital
        // distance; a manually created moon goes where the camera is instead.
        const {
            mass: moonMass,
            radius: moonRadius,
            rotationSpeed: moonRotationSpeed,
        } = randomMoonParams(parent.radius, { mass: o.customMass, radius: o.customRadius });

        // Step 3: spawn at the camera (same as planets/asteroids), orbiting the parent from
        // wherever that puts the moon.
        const moonSpawnPos = this.getNearCameraSpawnPos();
        const toMoon = moonSpawnPos.clone().sub(parentPos);
        const moonDistance = toMoon.length();

        // Step 4: orbital velocity about the parent at that point, carried along with the
        // parent's own motion.
        const moonSpawnVel = parentVel
            .clone()
            .add(
                computeOrbitVelocityAtPos(
                    moonSpawnPos,
                    parentPos,
                    parent.mass,
                    o.orbitType,
                    0.3,
                    o.inclination,
                    simulationState.gMultiplier
                )
            );

        // In-plane angle of the spawn point about the parent (0 = +X, π/2 = +Z).
        const orbitAngle = Math.atan2(toMoon.z, toMoon.x);

        const moonId = this.makeId('moon');
        // Moons are named relative to their parent: "<Parent> <Roman numeral>".
        const moonName =
            o.customName ??
            generateCustomBodyName(BodyTypeKeyEnum.Moon, moonId, { parentName: parent.name });

        const geometry = buildBodySphereGeometry(moonRadius);

        // For moons, `planetType` carries the moon subtype. Map it to a texture that matches
        // the planet subtype visuals.
        const moonType = toMoonType(o.planetType);
        const moonTextureSeed = `${moonId}|moonTexture|${o.planetType}`;
        const rng = new SeededRandom(moonTextureSeed);
        const moonMap = pickMoonTextureForMoonType(moonType, rng);

        const moonMaterial = new THREE.MeshStandardMaterial({
            map: moonMap,
            color: 0xffffff, // keep texture untinted
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: getRoughnessForMoonTexture(moonType),
            metalness: getMetalnessForMoonTexture(moonType),
            transparent: false,
            depthTest: true,
            depthWrite: true,
        });
        const mesh = new THREE.Mesh(geometry, moonMaterial);

        const moonSeed = `${moonId}|custom|${moonType}`;

        // Resolve the atmosphere first — it decides the atmospheric composition.
        const moonAtmosphere = resolveAtmosphereProfile(o.atmosphere, moonId, moonType, 'moon');

        const moon = new Moon(this.dependencies, this.scene, {
            distance: moonDistance,
            angle: orbitAngle ?? 0,
            yVariation: 0,
            moonType,
            tidalLock: {
                target: parent as unknown as CelestialBody,
                spinAxisWorld: new THREE.Vector3(0, 1, 0),
                faceAxisLocal: new THREE.Vector3(0, 0, 1),
                // 0 triggers CelestialBody to compute derived omega on first update tick.
                angularSpeed: 0,
            },
            radius: moonRadius,
            pos: moonSpawnPos,
            vel: moonSpawnVel,
            mass: moonMass,
            id: moonId,
            name: moonName,
            trailColor: 0x666666,
            maxTrail: 1000,
            rotation: { tilt: 0, speed: moonRotationSpeed },
            mesh,
            seed: moonSeed,
            // Unlike the star and planet paths, this constructs the Moon directly
            // rather than going through moon-factory, so roll here when unspecified.
            magneticField:
                o.magneticField !== undefined
                    ? o.magneticField
                    : rollMagneticField(new SeededRandom(`${moonId}|magnetic-field`), 'moon'),
            attributes: computePlanetaryAttributes({
                id: moonId,
                subtype: moonType,
                isDwarf: false,
                distanceT01: 0.5,
                hasAtmosphere: moonAtmosphere !== null,
            }),
        });

        // Kick off background procedural texture upgrade (desert/ocean/frozen only)
        upgradeProceduralTexture(moon);

        // Atmosphere (shell + clouds) from the panel's values, or rolled when unspecified.
        applyAtmosphereToBody(moon, moonAtmosphere, moonType, moonSeed, moonRotationSpeed);

        // Ensure brightness scaling uses a neutral base when texture is present
        moon.baseColor = new THREE.Color(0xffffff);
        return moon;
    }

    private createAsteroid(
        o: ResolvedCreateOptions,
        barycenterVelocity: BarycenterVelocityFn
    ): Body {
        // Create an asteroid near the camera with appropriate orbital velocity
        const spawnPos = this.getNearCameraSpawnPos();
        const spawnVel = this.orbitVelocity(o, spawnPos, 0.3, barycenterVelocity);

        const { mass, radius } = randomAsteroidParams({
            mass: o.customMass,
            radius: o.customRadius,
        });

        const id = this.makeId('asteroid');
        return new Asteroid(this.dependencies, this.scene, {
            pos: spawnPos,
            vel: spawnVel,
            mass,
            radius,
            id,
            name: o.customName ?? generateCustomBodyName(BodyTypeKeyEnum.Asteroid, id),
        });
    }

    private createComet(o: ResolvedCreateOptions, barycenterVelocity: BarycenterVelocityFn): Body {
        // Create a comet near the camera with appropriate orbital velocity
        const spawnPos = this.getNearCameraSpawnPos();
        const spawnVel = this.orbitVelocity(o, spawnPos, 0.4, barycenterVelocity);

        const { mass, radius } = randomCometParams({
            mass: o.customMass,
            radius: o.customRadius,
        });

        const id = this.makeId('comet');
        // The manual flow uses the default variant rather than rerolling a nucleus.
        return createCometBody(this.dependencies, this.scene, {
            radius,
            pos: spawnPos,
            vel: spawnVel,
            mass,
            id,
            name: o.customName ?? generateCustomBodyName(BodyTypeKeyEnum.Comet, id),
            rotation: { tilt: 0, speed: 0.05 },
            tailColor:
                typeof o.tailColor === 'string' && o.tailColor.startsWith('#')
                    ? parseInt(o.tailColor.slice(1), 16)
                    : undefined,
        });
    }

    private createBlackHole(o: ResolvedCreateOptions): Body {
        const spawnPos = this.getNearCameraSpawnPos();
        const { mass } = randomBlackHoleParams({ mass: o.customMass });

        const id = this.makeId('black_hole');
        const blackHole = new BlackHole(this.dependencies, this.scene, {
            pos: spawnPos,
            vel: new THREE.Vector3(0, 0, 0),
            mass,
            id,
            name: o.customName ?? generateCustomBodyName(BodyTypeKeyEnum.BlackHole, id),
        });

        // Apply custom radius if the user overrode the slider
        const radius = validRadius(o.customRadius);
        if (radius !== null) {
            setBodyRadius(blackHole as unknown as CelestialBody, radius);
        }
        return blackHole;
    }

    private createWormhole(o: ResolvedCreateOptions): Body {
        const spawnPos = this.getNearCameraSpawnPos();
        const radius = validRadius(o.customRadius) ?? WORMHOLE_DEFAULT_RADIUS;

        const id = this.makeId('wormhole');
        const wormhole = new Wormhole(
            this.dependencies,
            this.scene,
            spawnPos,
            radius,
            id,
            o.customName ?? generateCustomBodyName(BodyTypeKeyEnum.Wormhole, id),
            { tilt: 0, speed: 0 }
        );

        // A restored wormhole is linked to its saved partner afterwards, by the loader.
        if (this.restore) return wormhole;

        // First wormhole created starts a pending pair; the next one links to it.
        const pendingLink = getPendingWormholeLink();
        if (pendingLink) {
            pendingLink.setLinkedWormhole(wormhole.id);
            wormhole.setLinkedWormhole(pendingLink.id);
            // Spawn the bezier particle bridge connecting the two funnels.
            createBridgeForPair(pendingLink, wormhole, this.scene);
            clearPendingWormholeLink();
            this.dependencies.addEvent({
                message: `${pendingLink.name} and ${wormhole.name} are now linked`,
                notificationType: NotificationType.Info,
            });
        } else {
            setPendingWormholeLink(wormhole);
        }
        return wormhole;
    }

    // ── Shared ──────────────────────────────────────────────────────────────

    /** The saved id while restoring, else a fresh unique id. */
    private makeId(prefix: string): string {
        return this.restore ? this.restore.id : createUniqueId(prefix);
    }

    /**
     * Adds `body` to the simulation, announces it with `body:added`, and selects `focusTarget`
     * (the new body, or a new moon's parent). The gizmo follows the Target toggle.
     */
    private addToSimulation(body: Body, focusTarget: Body): void {
        simulationState.bodies.push(body);

        // Notify UI / systems that track live bodies
        try {
            window.dispatchEvent(
                new CustomEvent('body:added', {
                    detail: { body, id: body.id, name: body.name },
                })
            );
        } catch (e) {
            console.error('Error dispatching body:added event after body creation:', e);
        }

        // A save being restored picks its own focus once every body is back.
        if (this.restore) return;

        this.dependencies.gizmo.attach(cameraState.isTargetMode ? body : null);

        this.setFocusBody(focusTarget, {
            zoom: focusTarget === body ? cameraState.isLookAtMode : false,
        });
    }
}
