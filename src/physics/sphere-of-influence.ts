import * as THREE from 'three';
import { Body } from '../bodies/body';
import { CelestialBody } from '../bodies/celestial-body';
import { BodyTypeEnum } from '../bodies/body-enums';
import { isBodyType } from '../utilities/utilities';

/**
 * Hill-sphere based "sphere of influence" lookup, used by ship guidance to pick the body whose
 * velocity a ship's reference frame should track.
 *
 * A body's Hill sphere is the region where its own gravity dominates over its parent's tidal
 * pull:  r_H = a · ∛(m / 3M),  where a is the current distance to the orbit parent, m the
 * body's mass and M the parent's. Only the mass *ratio* matters, so the result is in scene
 * units with no scaling needed.
 *
 * Planets, moons, dwarf planets and asteroids qualify as reference bodies — stars are
 * deliberately excluded (inside a star's Hill sphere alone the ship just flies heliocentric high
 * mode), as are comets and satellites. Asteroids get a Hill sphere of their own but never act as
 * the parent of another body.
 */

/** Body types that may serve as a guidance reference frame. */
const REFERENCE_BODY_TYPES =
    BodyTypeEnum.Planet |
    BodyTypeEnum.Moon |
    BodyTypeEnum.DwarfPlanet |
    BodyTypeEnum.GasGiant |
    BodyTypeEnum.IceGiant |
    BodyTypeEnum.Asteroid;

interface IHillSphere {
    body: CelestialBody;
    radiusSq: number;
    radius: number;
}

/** Per-frame cache, rebuilt by updateHillSpheres(). */
const _spheres: IHillSphere[] = [];

/** Body types that may act as the parent a Hill sphere is measured against. */
const PARENT_BODY_TYPES =
    REFERENCE_BODY_TYPES |
    BodyTypeEnum.Star |
    BodyTypeEnum.BlackHole |
    BodyTypeEnum.WhiteDwarf |
    BodyTypeEnum.BrownDwarf |
    BodyTypeEnum.Pulsar;

/** Scratch: every possible parent / reference body this frame, heaviest first. */
const _ordered: CelestialBody[] = [];
/** Scratch: Hill radius per body this frame (Infinity for stars and other primaries). */
const _hill = new Map<CelestialBody, number>();

/** Hill radius of `body` about `parent` (its orbit parent), or 0 when there is none. */
export function hillRadius(body: CelestialBody, parent: CelestialBody | null): number {
    if (!parent || parent._isDisposed || !parent.mesh || !body.mesh) return 0;
    if (!(parent.mass > 0) || !(body.mass > 0)) return 0;
    const a = body.mesh.position.distanceTo(parent.mesh.position);
    return a * Math.cbrt(body.mass / (3 * parent.mass));
}

/**
 * Recompute every candidate body's Hill sphere. Call once per frame, before any
 * findReferenceBody() lookups that frame.
 *
 * Parents are resolved hierarchically, heaviest body first: a body's parent is its explicit
 * `orbitParent` when set, otherwise the smallest already-resolved Hill sphere (stars count as
 * infinite) that contains it. So the Moon resolves to Earth rather than to the Sun — whose pull
 * on it is actually stronger — and Uranus to the Sun even when Jupiter passes close by.
 */
export function updateHillSpheres(bodies: readonly Body[]): void {
    _spheres.length = 0;
    _ordered.length = 0;
    _hill.clear();
    for (const body of bodies) {
        if (body instanceof CelestialBody && !body._isDisposed && body.mesh) {
            if (isBodyType(body, PARENT_BODY_TYPES)) _ordered.push(body);
        }
    }
    _ordered.sort((a, b) => b.mass - a.mass);

    for (const body of _ordered) {
        const isReference =
            isBodyType(body, REFERENCE_BODY_TYPES) && !isBodyType(body, BodyTypeEnum.Star);
        if (!isReference) {
            // Stars and other primaries: everything around them is "inside".
            _hill.set(body, Infinity);
            continue;
        }

        let parent: CelestialBody | null = null;
        const explicit = body.orbitParent;
        if (explicit && !explicit._isDisposed && explicit.mesh && explicit !== body) {
            parent = explicit;
        } else {
            let parentHill = Infinity;
            let found = false;
            for (const candidate of _ordered) {
                if (candidate === body) break; // only heavier (already resolved) bodies
                // Asteroids are never parents; skipping them keeps a dense asteroid field cheap.
                if (isBodyType(candidate, BodyTypeEnum.Asteroid)) continue;
                const h = _hill.get(candidate) ?? 0;
                if (h <= 0) continue;
                const inside =
                    h === Infinity ||
                    candidate.mesh.position.distanceToSquared(body.mesh.position) < h * h;
                if (!inside) continue;
                if (!found || h < parentHill) {
                    parent = candidate;
                    parentHill = h;
                    found = true;
                }
            }
        }

        const radius = hillRadius(body, parent);
        _hill.set(body, radius);
        // A Hill sphere smaller than the body itself (a tiny moon hugging its planet) gives no
        // usable region outside the surface — skip it so the parent's frame applies instead.
        if (radius <= body.radius) continue;
        _spheres.push({ body, radius, radiusSq: radius * radius });
    }
}

/**
 * The innermost qualifying body whose Hill sphere contains `position` (a moon wins over its
 * planet), or null when the point lies only within a star's influence.
 */
export function findReferenceBody(position: THREE.Vector3): CelestialBody | null {
    let best: IHillSphere | null = null;
    for (const s of _spheres) {
        if (s.body._isDisposed) continue;
        if (position.distanceToSquared(s.body.mesh.position) > s.radiusSq) continue;
        if (!best || s.radius < best.radius) best = s;
    }
    return best ? best.body : null;
}
