import * as THREE from 'three';
import { Body } from './bodies/body';
import { ParticleExplosion } from './effects/particle-explosion';
import { Supernova } from './effects/supernova';
import { PlanetaryNebula } from './effects/planetary-nebula';
import { CoordinateGizmo } from './gizmos/coordinate-gizmo';
import { IPipelineFeedEffect } from './effects/effect-base';
import { NotificationType } from './event-log/event-log';
import { BodyTypeEnum, MoonTypeEnum, PlanetTypeEnum } from './bodies/body-enums';
import { ITidalLockOptions } from './bodies/celestial-body';

/**
 * Represents the rotation of a body in 3D space
 */
export interface IRotation {
    // axis: THREE.Vector3;
    tilt: number; // in degrees
    speed: number; // in degrees per second
    azimuth?: number; // in degrees — rotates the tilt direction around the world Y axis (default 0)
}

export interface IBodyCreationOptions {
    mass: number;
    radius: number;
    id: string;
    name: string;
}

export interface IOrbitalBodyCreationOptions extends IBodyCreationOptions {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    rotation: IRotation;
    trailColor?: number;
    maxTrail?: number;
}

export interface ICelestialBodyCreationOptions extends IOrbitalBodyCreationOptions {
    mesh?: THREE.Mesh;
}

export interface ISatelliteBasicCreationOptions extends IBodyCreationOptions {
    distance: number;
    angle?: number; // optional initial angle for multiple moons
    inclinationDeg?: number;
    yVariation?: number; // optional random Y variation for non-coplanar orbits
    trailColor?: number;
    maxTrail?: number;

    /** Optional moon subtype to drive the moon texture (matches planet subtypes). */
    moonType?: MoonTypeEnum;
}

export interface ISatelliteCreationOptions extends ICelestialBodyCreationOptions {
    distance: number;
    angle: number;
    yVariation: number;
    tidalLock: ITidalLockOptions;
}

export interface IMoonCreationOptions extends ISatelliteCreationOptions {
    moonType: MoonTypeEnum;
}

export interface IPlanetCreationOptions extends ICelestialBodyCreationOptions {
    hasRings?: boolean;
    bodySubtype: PlanetTypeEnum;
}


export interface IStateDependencies {
    addEvent: (event: { message: string; notificationType: NotificationType }) => void;
    addExplosion: (explosion: ParticleExplosion) => void;
    addSupernova: (supernova: Supernova) => void;
    addPlanetaryNebula: (nebula: PlanetaryNebula) => void;
    addBody: (body: Body) => void;
    gizmo: CoordinateGizmo;
    getBodies: () => Body[];
    getG: () => number;
}

/**
 * Structural interface for a star that can be siphoned by a black hole.
 * Avoids a circular import between black-hole.ts and star.ts.
 */
export interface ISiphonTarget {
    id: string;
    name: string;
    mass: number;
    fuel: number | null;
    maxFuel: number | null;
    initialMass: number;
    radius: number;
    mesh: THREE.Mesh;
    bodyType: BodyTypeEnum;
    baseColor: THREE.Color;
    _isDisposed: boolean;
    setMass(mass: number): void;
    triggerStarDeath(isMassiveStar: boolean): void;
}

/**
 * Structural interface for a body that can consume mass via an accretion disk.
 * Used by MassSiphonEffect to avoid circular imports.
 */
export interface IAccretionTarget {
    mesh: THREE.Mesh;
    mass: number;
    radius: number;
    _isDisposed: boolean;
    rotationAxis: THREE.Vector3;
    /** The accretion disk's outer radius; null when no disk is active. */
    accretionDisk: { maxRadius: number } | null;
}

/**
 * Extends IAccretionTarget for bodies that actively manage siphon streams and
 * queue incoming particles into their accretion disk. Implemented by BlackHole
 * and Pulsar.
 */
export interface IMassTransferBody extends IAccretionTarget {
    siphonEffects: Map<string, IPipelineFeedEffect>;
    enqueueAccretionParticle(angle: number): void;
}
