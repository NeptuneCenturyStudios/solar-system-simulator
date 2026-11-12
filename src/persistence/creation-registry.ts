import type { Body } from '../bodies/body';
import type { ISavedCreation } from './save-file';

/**
 * How each body that was added after its system launched came to exist (preset, custom form,
 * star remnant). Saves use it to rebuild those bodies; bodies from the base system have no
 * entry. Weakly keyed, so disposed bodies drop out on their own.
 */
const creations = new WeakMap<Body, ISavedCreation>();

export function recordCreation(body: Body, creation: ISavedCreation): void {
    creations.set(body, creation);
}

export function getCreation(body: Body): ISavedCreation | undefined {
    return creations.get(body);
}
