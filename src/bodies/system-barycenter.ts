import type { Body } from './body';
import { BodyTypeEnum } from './body-enums';
import {
    computeBarycenter,
    type IBarycenter,
    type IBarycenterMass,
} from '../procedural/orbital-math';

/** Body types whose mass anchors the system barycenter. */
const BARYCENTER_ANCHOR_TYPES = BodyTypeEnum.Star | BodyTypeEnum.BlackHole;

/**
 * The live bodies that define the system barycenter: every non-disposed star and black hole.
 * Black holes count because in black-hole systems the barycenter is the hole plus its star.
 */
export function systemBarycenterMembers(bodies: readonly Body[]): IBarycenterMass[] {
    const members: IBarycenterMass[] = [];
    for (const b of bodies) {
        if (!b || b._isDisposed || !(b.bodyType & BARYCENTER_ANCHOR_TYPES)) continue;
        members.push({ mass: b.mass, pos: b.mesh.position, vel: b.velocity });
    }
    return members;
}

/** The live system barycenter, or null when the system has no stars or black holes. */
export function computeSystemBarycenter(bodies: readonly Body[]): IBarycenter | null {
    return computeBarycenter(systemBarycenterMembers(bodies));
}
