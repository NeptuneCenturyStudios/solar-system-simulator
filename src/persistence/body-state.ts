import * as THREE from 'three';

import { Body } from '../bodies/body';
import { BodyTypeEnum } from '../bodies/body-enums';
import { CelestialBody } from '../bodies/celestial-body';
import { Comet } from '../bodies/comet';
import { MainSequenceStar } from '../bodies/main-sequence-star';
import { Star } from '../bodies/star';
import { Wormhole } from '../bodies/wormhole';
import { setBodyRadius } from '../physics/physics';
import { DIST_SCALE, MASS_SCALE, RADIUS_SCALE } from '../utilities/consts';
import type { ISavedBody, ISavedStarEvolution, QuatTuple, Vec3Tuple } from './save-file';

/** Scene position/velocity → km or km/s (velocity shares the DIST_SCALE divisor). */
export function toKmTuple(v: THREE.Vector3): Vec3Tuple {
    return [v.x * DIST_SCALE, v.y * DIST_SCALE, v.z * DIST_SCALE];
}

/** km or km/s → scene units, written into `out`. */
export function fromKmTuple(t: Vec3Tuple, out: THREE.Vector3): THREE.Vector3 {
    return out.set(t[0] / DIST_SCALE, t[1] / DIST_SCALE, t[2] / DIST_SCALE);
}

export function toQuatTuple(q: THREE.Quaternion): QuatTuple {
    return [q.x, q.y, q.z, q.w];
}

function captureEvolution(star: MainSequenceStar): ISavedStarEvolution {
    return {
        fuel: star.fuel,
        maxFuel: star.maxFuel,
        initialMass: star.initialMass * MASS_SCALE,
        initialRadius: star.initialRadius * RADIUS_SCALE,
        redGiantExpansionFactor: star.redGiantExpansionFactor,
        isBrownDwarf: !!(star.bodyType & BodyTypeEnum.BrownDwarf),
    };
}

/**
 * Plain-data snapshot of a body's live state. `baseIndex` and `creation` are filled in by the
 * caller, which knows how the body came to exist.
 */
export function captureBodyState(body: Body): ISavedBody {
    const saved: ISavedBody = {
        id: body.id,
        baseIndex: null,
        name: body.name,
        massKg: body.mass * MASS_SCALE,
        radiusKm: body.radius * RADIUS_SCALE,
        posKm: toKmTuple(body.mesh.position),
        velKmS: toKmTuple(body.velocity),
        quaternion: toQuatTuple(body.mesh.quaternion),
    };

    if (body instanceof CelestialBody) {
        if (body.rotation) {
            saved.rotation = {
                tilt: body.rotation.tilt ?? 0,
                speed: body.rotation.speed ?? 0,
                azimuth: body.rotation.azimuth ?? 0,
            };
        }
        if (body.atmosphereRadius !== null && body.radius > 0) {
            saved.atmosphere = {
                radiusFactor: body.atmosphereRadius / body.radius,
                surfacePressureBar: body.atmosphereSurfaceDensity,
            };
        }
        saved.magneticField = body.magneticField ? { ...body.magneticField } : null;
        saved.orbitParentId = body.orbitParent?.id ?? null;
        saved.binaryPartnerId = body.binaryPartner?.id ?? null;
        saved.orbitsSystemBarycenter = body.orbitsSystemBarycenter;
    }

    if (body instanceof Star) {
        saved.star = {
            temperature: body.temperature,
            lightIntensity: body.lightIntensity,
            evolution: body instanceof MainSequenceStar ? captureEvolution(body) : undefined,
        };
    }

    if (body instanceof Comet) {
        saved.tailColor = `#${body.tailColor.getHexString()}`;
    }

    if (body instanceof Wormhole) {
        saved.linkedWormholeId = body.linkedWormholeId;
    }

    return saved;
}

function restoreEvolution(star: MainSequenceStar, evo: ISavedStarEvolution): void {
    if (evo.isBrownDwarf) {
        star.transitionToBrownDwarf();
    } else if (star.bodyType & BodyTypeEnum.BrownDwarf) {
        star.transitionToMainSequence();
    }
    star.fuel = evo.fuel;
    star.maxFuel = evo.maxFuel;
    star.initialMass = evo.initialMass / MASS_SCALE;
    star.initialRadius = evo.initialRadius / RADIUS_SCALE;
    star.redGiantExpansionFactor = evo.redGiantExpansionFactor;
}

/**
 * Puts a live body into a saved state. Relations to other bodies (orbit parent, binary
 * partner, wormhole link) are applied separately by the loader, once every body exists.
 */
export function applyBodyState(body: Body, saved: ISavedBody): void {
    // Fuel first: whether a star is a red giant decides whether setMass also resizes it.
    if (body instanceof MainSequenceStar && saved.star?.evolution) {
        restoreEvolution(body, saved.star.evolution);
    }

    body.setMass(saved.massKg / MASS_SCALE);

    const radius = saved.radiusKm / RADIUS_SCALE;
    if (body instanceof CelestialBody && radius > 0 && Math.abs(radius - body.radius) > 1e-9) {
        setBodyRadius(body, radius);
    }

    if (body instanceof Star && saved.star) {
        body.setTemperature(saved.star.temperature);
        body.setLightIntensity(saved.star.lightIntensity);
    }

    if (body instanceof CelestialBody) {
        if (saved.atmosphere) {
            body.updateAtmosphere(
                body.radius * saved.atmosphere.radiusFactor,
                saved.atmosphere.surfacePressureBar
            );
        }
        if (saved.magneticField !== undefined) {
            body.magneticField = saved.magneticField ? { ...saved.magneticField } : null;
            body.refreshAurora();
        }
        if (saved.rotation && body.rotation) {
            body.rotation.tilt = saved.rotation.tilt;
            body.rotation.speed = saved.rotation.speed;
            body.rotation.azimuth = saved.rotation.azimuth;
        }
        if (saved.orbitsSystemBarycenter !== undefined) {
            body.orbitsSystemBarycenter = saved.orbitsSystemBarycenter;
        }
    }

    if (body instanceof Comet && saved.tailColor) {
        body.setTailColor(saved.tailColor);
    }

    fromKmTuple(saved.posKm, body.mesh.position);
    fromKmTuple(saved.velKmS, body.velocity);
    // The saved orientation already carries the spin pole and the current spin phase.
    const [qx, qy, qz, qw] = saved.quaternion;
    body.mesh.quaternion.set(qx, qy, qz, qw);

    // Last: the brown-dwarf transition above may have appended a suffix to the name.
    if (saved.name && saved.name !== body.name) {
        body.updateLabel(saved.name);
    }
}
