import { Body } from "./bodies/body";
import { ParticleExplosion } from "./effects/particle-explosion";

export interface IStateDependencies {
    addEvent: (message: string) => void;
    addExplosion: (explosion: ParticleExplosion) => void;
    addBody: (body: Body) => void;
    gizmo: {
        target: Body | null;
        attach: (body: Body | null) => void;
    };
    getBodies: () => Body[];
}
