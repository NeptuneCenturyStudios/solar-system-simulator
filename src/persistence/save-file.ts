import type {
    BodyTypeKeyEnum,
    MoonTypeEnum,
    OrbitTypeEnum,
    PlanetTypeEnum,
    PresetBodyKeyEnum,
} from '../bodies/body-enums';
import type { IAtmosphereProfile } from '../procedural/atmosphere-profile';
import type { IMagneticFieldOptions } from '../interfaces';
import { SimulationStartMode } from '../utilities/consts';

/** Identifies a file as a solar system save, so arbitrary JSON is rejected on open. */
export const SAVE_FILE_FORMAT = 'solar-system-simulator-save';
/** Bump when the layout changes, and migrate older versions in `parseSaveFile`. */
export const SAVE_FILE_SCHEMA_VERSION = 1;
/** File extension (without the dot) used for saved systems. */
export const SAVE_FILE_EXTENSION = 'ssim';

/** Systems that can be saved. Scenarios are never saved. */
export type SaveableStartMode =
    | SimulationStartMode.Default
    | SimulationStartMode.Empty
    | SimulationStartMode.Procedural;

export function isSaveableMode(mode: SimulationStartMode): mode is SaveableStartMode {
    return (
        mode === SimulationStartMode.Default ||
        mode === SimulationStartMode.Empty ||
        mode === SimulationStartMode.Procedural
    );
}

export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];

/** How a body that is not part of the base system came to exist, so it can be rebuilt. */
export enum CreationKind {
    /** Added from the preset list (Sun, Earth, Io, ...). */
    Preset = 'preset',
    /** Added from the custom form. */
    Custom = 'custom',
    /** Formed by a star's death. */
    Remnant = 'remnant',
}

export enum RemnantKind {
    WhiteDwarf = 'whiteDwarf',
    Pulsar = 'pulsar',
    BlackHole = 'blackHole',
}

/** The custom form's options in plain-data form (the orbit parent is stored by id). */
export interface ISavedCustomOptions {
    bodyType: BodyTypeKeyEnum;
    planetType?: PlanetTypeEnum | MoonTypeEnum;
    orbitType?: OrbitTypeEnum;
    inclination?: number;
    atmosphere?: IAtmosphereProfile | null;
    hasRings?: boolean;
    customMass?: number | null;
    customTemperature?: number | null;
    customLightIntensity?: number | null;
    customRadius?: number | null;
    orbitParentId?: string | null;
    createTilt?: number | null;
    createAzimuth?: number | null;
    tailColor?: string | null;
    magneticField?: IMagneticFieldOptions | null;
    customName?: string | null;
    orbitSystemBarycenter?: boolean;
}

export type ISavedCreation =
    | { kind: CreationKind.Preset; presetKey: PresetBodyKeyEnum }
    | { kind: CreationKind.Custom; options: ISavedCustomOptions }
    | { kind: CreationKind.Remnant; remnant: RemnantKind };

/** Fuel and evolution state of a fuel-burning star. */
export interface ISavedStarEvolution {
    fuel: number | null;
    maxFuel: number | null;
    initialMass: number;
    initialRadius: number;
    redGiantExpansionFactor: number;
    isBrownDwarf: boolean;
}

/**
 * Everything needed to put one body back the way it was. Physical quantities are stored
 * unscaled (km, km/s, kg) so a change to DIST_SCALE / MASS_SCALE / RADIUS_SCALE does not
 * invalidate saves.
 */
export interface ISavedBody {
    /** The body's id when it was saved. Only used to resolve references inside this file. */
    id: string;
    /** Index in the base system's generated body list, or null for bodies added later. */
    baseIndex: number | null;
    /** How to rebuild a body that is not part of the base system. */
    creation?: ISavedCreation;
    name: string;
    massKg: number;
    radiusKm: number;
    posKm: Vec3Tuple;
    velKmS: Vec3Tuple;
    quaternion: QuatTuple;
    rotation?: { tilt: number; speed: number; azimuth: number };
    star?: { temperature: number; lightIntensity: number; evolution?: ISavedStarEvolution };
    /** Existing atmosphere's size and pressure; omitted for airless bodies. */
    atmosphere?: IAtmosphereProfile;
    magneticField?: IMagneticFieldOptions | null;
    /** Comet tail color as `#rrggbb`. */
    tailColor?: string;
    orbitParentId?: string | null;
    binaryPartnerId?: string | null;
    orbitsSystemBarycenter?: boolean;
    /** Wormholes: the id of the linked partner (null = unlinked). */
    linkedWormholeId?: string | null;
}

export interface ISavedShip {
    shipTypeId: string;
    posKm: Vec3Tuple;
    velKmS: Vec3Tuple;
    quaternion: QuatTuple;
}

/** Where the camera was and where it was looking. */
export interface ISavedCamera {
    posKm: Vec3Tuple;
    quaternion: QuatTuple;
    /** The orbit controls' pivot point. */
    targetKm: Vec3Tuple;
}

export interface ISystemSaveFile {
    format: typeof SAVE_FILE_FORMAT;
    schemaVersion: number;
    /** ISO-8601 timestamp of when the file was written. */
    savedAt: string;
    base: { mode: SaveableStartMode; seed: string | null };
    sim: {
        timeScale: number;
        savedTimeScale: number;
        isPaused: boolean;
        gMultiplier: number;
        spaceTextureFilename: string | null;
        focusedBodyId: string | null;
        /** Optional: saves made before the camera was saved have none. */
        camera?: ISavedCamera;
    };
    bodies: ISavedBody[];
    playerShip: ISavedShip | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function isNumberTuple(v: unknown, length: number): boolean {
    return Array.isArray(v) && v.length === length && v.every(isFiniteNumber);
}

function isSavedBody(v: unknown): v is ISavedBody {
    if (!isRecord(v)) return false;
    return (
        typeof v.id === 'string' &&
        (v.baseIndex === null || isFiniteNumber(v.baseIndex)) &&
        typeof v.name === 'string' &&
        isFiniteNumber(v.massKg) &&
        isFiniteNumber(v.radiusKm) &&
        isNumberTuple(v.posKm, 3) &&
        isNumberTuple(v.velKmS, 3) &&
        isNumberTuple(v.quaternion, 4) &&
        (v.baseIndex !== null || isRecord(v.creation))
    );
}

function isSavedCamera(v: unknown): v is ISavedCamera {
    return (
        isRecord(v) &&
        isNumberTuple(v.posKm, 3) &&
        isNumberTuple(v.quaternion, 4) &&
        isNumberTuple(v.targetKm, 3)
    );
}

function isSavedShip(v: unknown): v is ISavedShip {
    return (
        isRecord(v) &&
        typeof v.shipTypeId === 'string' &&
        isNumberTuple(v.posKm, 3) &&
        isNumberTuple(v.velKmS, 3) &&
        isNumberTuple(v.quaternion, 4)
    );
}

/** Thrown when a file can't be read as a solar system save. The message is user-facing. */
export class SaveFileError extends Error {}

/** Parses and validates a save file's text. Throws `SaveFileError` when it is not usable. */
export function parseSaveFile(text: string): ISystemSaveFile {
    let data: unknown;
    try {
        data = JSON.parse(text);
    } catch {
        throw new SaveFileError('The file is not a valid solar system save.');
    }
    if (!isRecord(data) || data.format !== SAVE_FILE_FORMAT) {
        throw new SaveFileError('The file is not a solar system save.');
    }
    if (!isFiniteNumber(data.schemaVersion) || data.schemaVersion > SAVE_FILE_SCHEMA_VERSION) {
        throw new SaveFileError('This save was made by a newer version of the simulator.');
    }

    const base = data.base;
    const sim = data.sim;
    if (
        !isRecord(base) ||
        !isFiniteNumber(base.mode) ||
        !isSaveableMode(base.mode) ||
        !(base.seed === null || typeof base.seed === 'string') ||
        !isRecord(sim) ||
        !isFiniteNumber(sim.timeScale) ||
        !isFiniteNumber(sim.gMultiplier) ||
        !(sim.camera === undefined || isSavedCamera(sim.camera)) ||
        !Array.isArray(data.bodies) ||
        !data.bodies.every(isSavedBody) ||
        !(data.playerShip === null || isSavedShip(data.playerShip))
    ) {
        throw new SaveFileError('The save file is damaged or incomplete.');
    }

    return data as unknown as ISystemSaveFile;
}

/** Default file name for a save: "<system name> <yyyy-mm-dd hh-mm>.ssim". */
export function defaultSaveFileName(systemLabel: string, now = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}-${pad(now.getMinutes())}`;
    const safeLabel = systemLabel.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Solar System';
    return `${safeLabel} ${stamp}.${SAVE_FILE_EXTENSION}`;
}
