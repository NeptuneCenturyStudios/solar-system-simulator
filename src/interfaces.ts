import { Body } from "./bodies/body";
import { ParticleExplosion } from "./effects/particle-explosion";
import { Supernova } from "./effects/supernova";
import { CoordinateGizmo } from "./gizmos/coordinate-gizmo";

export interface IStateDependencies {
    addEvent: (message: string) => void;
    addExplosion: (explosion: ParticleExplosion) => void;
    addSupernova: (supernova: Supernova) => void;
    addBody: (body: Body) => void;
    gizmo: CoordinateGizmo
    getBodies: () => Body[];
}
