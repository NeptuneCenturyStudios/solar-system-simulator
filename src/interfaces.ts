import * as THREE from 'three';
import { Body } from "./bodies/body";
import { ParticleExplosion } from "./effects/particle-explosion";
import { Supernova } from "./effects/supernova";
import { CoordinateGizmo } from "./gizmos/coordinate-gizmo";
import { BodyTypeEnum } from "./utilities/utilities";

export interface IStateDependencies {
    addEvent: (message: string) => void;
    addExplosion: (explosion: ParticleExplosion) => void;
    addSupernova: (supernova: Supernova) => void;
    addBody: (body: Body) => void;
    gizmo: CoordinateGizmo
    getBodies: () => Body[];
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
    triggerStarDeath(isMassiveStar: boolean): void;
}
