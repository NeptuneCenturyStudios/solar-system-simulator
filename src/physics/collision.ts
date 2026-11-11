import * as THREE from 'three';
import { Body } from '../bodies/body';
import { BlackHole } from '../bodies/black-hole';
import { CelestialBody } from '../bodies/celestial-body';
import { Star } from '../bodies/star';
import { Spaceship } from '../bodies/ships/spaceship';
import { computeAtmosphereFrameVelocity } from './atmosphere-frame';
import { surfaceReach } from './body-surface';
import { findShipHullContact, type ShipMeshContact } from './ship-mesh-collision';
import { settingsStore } from '../settings/settings-store';
import {
    COLLISION_DAMAGE_PER_ENERGY,
    COLLISION_MIN_DAMAGE_FRACTION,
    COLLISION_RESTITUTION,
    COLLISION_SEPARATION_FACTOR,
    G,
    SHIP_CONTACT_SEPARATION_FACTOR,
    SHIP_GROUND_STICK_SPEED,
    SHIP_LANDING_BOUNCE_RESTITUTION,
    SHIP_LANDING_BOUNCE_SPEED,
    SHIP_LANDING_REST_SPEED,
    SHIP_SURFACE_FRICTION,
} from '../utilities/consts';

/**
 * 'absorb': winner merges every victim's mass/radius (black holes, stars, and a surviving
 *   celestial body after its impact destroyed the other).
 * 'destroy': winner survives and all victims are removed, but no mass/radius is transferred
 *   (spaceships can claim a kill without ever "absorbing" anything).
 * 'destroy-both': the impact destroyed both bodies — no winner.
 * 'bounce': both bodies survived the impact; their velocities and positions have already been
 *   updated to bounce them apart.
 * 'none': the bodies overlap but are already moving apart (e.g. just after a bounce), so they
 *   were only pushed out of overlap and took no damage.
 */
export type CollisionOutcome =
    | { type: 'absorb'; winner: Body; victims: Body[] }
    | { type: 'destroy'; winner: Body; victims: Body[] }
    | { type: 'destroy-both'; victims: Body[] }
    | { type: 'bounce' }
    | { type: 'none' };

/** Scratch vectors so the per-pair collision pass never allocates. */
const _normal = new THREE.Vector3();
const _relVel = new THREE.Vector3();
const _damageRelVel = new THREE.Vector3();
const _contactPoint = new THREE.Vector3();
const _surfaceVel1 = new THREE.Vector3();
const _surfaceVel2 = new THREE.Vector3();
const _tangent = new THREE.Vector3();
const _deltaRelVel = new THREE.Vector3();
const _rewind = new THREE.Vector3();
const _separation = new THREE.Vector3();
const _meshContact: ShipMeshContact = {
    normal: new THREE.Vector3(),
    point: new THREE.Vector3(),
    penetration: 0,
    rewind: new THREE.Vector3(),
};

/** Damage below this (HP) is still applied but not logged — keeps a skidding ship from spamming. */
const MIN_LOGGED_DAMAGE = 0.01;

function safeMass(body: Body): number {
    return Math.max(0, body?.mass || 0);
}

/**
 * Whether either side of a contact is a ship. Ships are the one body class with their own contact
 * model — they land rather than ricochet, with friction against the surface — see
 * {@link resolveShipContact}.
 */
function involvesShip(b1: Body, b2: Body): boolean {
    return b1 instanceof Spaceship || b2 instanceof Spaceship;
}

function collisionScoreEscapeVelocity(body: Body) {
    // Winner heuristic: compare escape velocity (constants cancel):
    //   v_esc = sqrt(2GM/R)  => ordering is equivalent to M/R
    const m = safeMass(body);
    const r = Math.max(
        1e-6,
        typeof body?.radius === 'number' && isFinite(body.radius) && body.radius > 0
            ? body.radius
            : 0
    );

    return m / r;
}

function resolveByEscapeVelocity(b1: Body, b2: Body): { winner: Body; victim: Body } {
    const s1 = collisionScoreEscapeVelocity(b1);
    const s2 = collisionScoreEscapeVelocity(b2);

    if (s1 > s2) return { winner: b1, victim: b2 };
    if (s2 > s1) return { winner: b2, victim: b1 };

    // Stable-ish tie breakers (avoid random flip-flops on exact ties)
    const m1 = safeMass(b1);
    const m2 = safeMass(b2);
    if (m1 > m2) return { winner: b1, victim: b2 };
    if (m2 > m1) return { winner: b2, victim: b1 };

    const n1 = String(b1?.name || '');
    const n2 = String(b2?.name || '');
    if (n1 >= n2) return { winner: b1, victim: b2 };
    return { winner: b2, victim: b1 };
}

/** Winner takes the victim — spaceships never absorb mass, they can only claim a kill. */
function claimVictim(winner: Body, victim: Body): CollisionOutcome {
    if (winner instanceof Spaceship || victim instanceof Spaceship) {
        return { type: 'destroy', winner, victims: [victim] };
    }
    return { type: 'absorb', winner, victims: [victim] };
}

/**
 * HP damage dealt to EACH body by an impact between two non-ship bodies.
 *
 * Both bodies take the same damage: the kinetic energy of their relative motion in the
 * centre-of-mass frame, ½·μ·v_rel² with μ = m₁m₂ / (m₁ + m₂), scaled by
 * COLLISION_DAMAGE_PER_ENERGY — but never less than COLLISION_MIN_DAMAGE_FRACTION of the lighter
 * body's max HP, so even a gentle contact wears the lighter body down and nothing can survive
 * indefinitely against something heavier.
 *
 * Ship contacts do not use this: a landed ship touches the ground every frame, so that floor would
 * kill it in about four frames. They take damage from the energy their contact actually dissipates
 * instead — see {@link resolveShipContact}.
 */
export function computeCollisionDamage(b1: Body, b2: Body): number {
    const m1 = safeMass(b1);
    const m2 = safeMass(b2);
    const totalMass = m1 + m2;
    const reducedMass = totalMass > 0 ? (m1 * m2) / totalMass : 0;
    const relSpeedSq = _damageRelVel.subVectors(b1.velocity, b2.velocity).lengthSq();
    const damage = 0.5 * reducedMass * relSpeedSq * COLLISION_DAMAGE_PER_ENERGY;

    const lighter = m1 <= m2 ? b1 : b2;
    const minDamage = COLLISION_MIN_DAMAGE_FRACTION * Math.max(0, lighter.maxHealthPoints);

    return Math.max(damage, minDamage);
}

/**
 * Writes the unit contact normal (pointing from b2 toward b1) into `out` and returns the
 * centre distance. Coincident centres fall back to the direction b1 arrived from, else +Y.
 */
function computeContactNormal(
    b1: Body,
    b2: Body,
    relVel: THREE.Vector3,
    out: THREE.Vector3
): number {
    out.subVectors(b1.mesh.position, b2.mesh.position);
    const distance = out.length();

    if (distance > 1e-9) {
        out.divideScalar(distance);
    } else if (relVel.lengthSq() > 0) {
        out.copy(relVel).normalize().negate();
    } else {
        out.set(0, 1, 0);
    }

    return distance;
}

/**
 * Push overlapping bodies apart along the normal until their centres are `targetDistance` apart
 * (default (r₁ + r₂) × COLLISION_SEPARATION_FACTOR); the heavier body moves less.
 */
function pushApart(
    b1: Body,
    b2: Body,
    normal: THREE.Vector3,
    distance: number,
    targetDistance: number = (b1.radius + b2.radius) * COLLISION_SEPARATION_FACTOR
): void {
    const penetration = targetDistance - distance;
    if (penetration <= 0) return;

    const m1 = safeMass(b1);
    const m2 = safeMass(b2);
    const totalMass = m1 + m2;
    // Each body moves by the other's share of the total mass.
    const share1 = totalMass > 0 ? m2 / totalMass : 0.5;

    b1.mesh.position.addScaledVector(normal, penetration * share1);
    b2.mesh.position.addScaledVector(normal, -penetration * (1 - share1));
}

/**
 * Move a ship contact's bodies to exactly touching: b1 is displaced relative to b2 by `rewind`
 * (non-zero only when a fast pass was caught by the mesh CCD sweep) plus `penetration` along
 * `normal`, split by mass so the heavier body moves less and the centre of mass stays put.
 */
function separateShipContact(
    b1: Body,
    b2: Body,
    normal: THREE.Vector3,
    penetration: number,
    rewind: THREE.Vector3
): void {
    _separation.copy(rewind).addScaledVector(normal, Math.max(0, penetration));
    if (_separation.lengthSq() === 0) return;

    const m1 = safeMass(b1);
    const m2 = safeMass(b2);
    const totalMass = m1 + m2;
    const share1 = totalMass > 0 ? m2 / totalMass : 0.5;

    b1.mesh.position.addScaledVector(_separation, share1);
    b2.mesh.position.addScaledVector(_separation, -(1 - share1));
}

/**
 * Bounce two surviving non-ship bodies off each other: a momentum-conserving impulse along the
 * contact normal with COLLISION_RESTITUTION, then separation so they don't re-contact next frame.
 * @param normalSpeed Closing speed along the normal, (v₁ − v₂)·n — negative while approaching.
 */
function bounceApart(
    b1: Body,
    b2: Body,
    normal: THREE.Vector3,
    normalSpeed: number,
    distance: number
): void {
    const m1 = safeMass(b1);
    const m2 = safeMass(b2);

    if (m1 > 0 && m2 > 0) {
        const reducedMass = (m1 * m2) / (m1 + m2);
        const impulse = -(1 + COLLISION_RESTITUTION) * normalSpeed * reducedMass;
        b1.velocity.addScaledVector(normal, impulse / m1);
        b2.velocity.addScaledVector(normal, -impulse / m2);
    }

    pushApart(b1, b2, normal, distance);
}

/**
 * Velocity of `body`'s material at world-space `point`. A celestial body's surface is carried
 * around by its spin as well as its translation (v + ω × r) — the same co-rotating frame its
 * atmosphere uses, so ground and air agree on what "standing still" means. Anything else (a ship)
 * is treated as a point moving with its centre.
 */
export function surfaceVelocityAt(
    body: Body,
    point: THREE.Vector3,
    out: THREE.Vector3
): THREE.Vector3 {
    if (body instanceof CelestialBody) return computeAtmosphereFrameVelocity(body, point, out);
    return out.copy(body.velocity);
}

/**
 * How far `body` reaches from its centre toward world unit direction `dir` for contact purposes:
 * a ship's actual hull extent that way (see Spaceship.hullExtentAlong); anything else its drawn
 * surface that way (see surfaceReach) — the facet of a sphere mesh, or the ray-cast rock of a model
 * body. Otherwise a ship rests on the bounding sphere: kilometres above a large planet's flat
 * facets, and visibly floating over an irregular asteroid.
 */
function contactReach(body: Body, dir: THREE.Vector3): number {
    if (body instanceof Spaceship) return body.hullExtentAlong(dir);
    return surfaceReach(body, dir);
}

const _clearanceDir = new THREE.Vector3();
const _clearanceDirNeg = new THREE.Vector3();

/**
 * Gap between `ship`'s hull and `body`'s drawn surface, in sim units, measured exactly the way ship
 * contact is (see {@link resolveShipContact}): 0 (or a hair below, from the frame's gravity
 * sinking in before the next push-out) while the ship is resting on the ground.
 */
export function surfaceClearance(ship: Spaceship, body: Body): number {
    _clearanceDir.subVectors(ship.mesh.position, body.mesh.position);
    const distance = _clearanceDir.length();
    if (distance > 1e-12) _clearanceDir.divideScalar(distance);
    else _clearanceDir.set(0, 1, 0);
    _clearanceDirNeg.copy(_clearanceDir).negate();
    return distance - contactReach(ship, _clearanceDirNeg) - contactReach(body, _clearanceDir);
}

/**
 * Distance from world-space `point` (e.g. the camera) to `body`'s drawn surface, in sim units,
 * using the same surface model as {@link surfaceClearance} — the faceted sphere mesh for planets
 * and moons, the hull for ships — so a HUD readout measured from a point agrees with the altimeter.
 * Clamped at 0 for a point inside the body.
 */
export function surfaceDistanceFromPoint(point: THREE.Vector3, body: Body): number {
    _clearanceDir.subVectors(point, body.mesh.position);
    const distance = _clearanceDir.length();
    if (distance > 1e-12) _clearanceDir.divideScalar(distance);
    else _clearanceDir.set(0, 1, 0);
    return Math.max(0, distance - contactReach(body, _clearanceDir));
}

/**
 * Contact model for anything touching a ship: a landing with friction rather than a ricochet.
 *
 * Everything is measured at the contact point, relative to the *surface* there, so a spinning
 * planet's ground carries a grounded ship around with it instead of turning underneath it. The
 * relative velocity splits into a closing speed along the normal and a sliding speed along the
 * surface, and one impulse handles both:
 *
 * - **Normal.** The ship rebounds at the smaller of SHIP_LANDING_BOUNCE_RESTITUTION × closing speed
 *   and the fixed SHIP_LANDING_BOUNCE_SPEED hop, so a fall from orbit and a gentle touchdown both
 *   leave the ground at a few m/s and successive hops shrink geometrically. At or below the rest
 *   speed (the larger of SHIP_LANDING_REST_SPEED and twice the speed gravity adds this frame) there
 *   is no rebound at all: that is resting contact, and it keeps a grounded ship from jittering —
 *   including under time warp, where one frame of gravity is a lot of speed. Two ships never
 *   rebound off each other: the closing speed is cancelled and they slide or stick instead.
 * - **Tangential.** Coulomb friction: the sliding speed removed is capped at
 *   SHIP_SURFACE_FRICTION × the normal speed change. A steep crash (big normal impulse) is stopped
 *   almost dead; a shallow skid decelerates at μ·g while gravity keeps pressing the ship down.
 *   At or below SHIP_GROUND_STICK_SPEED the ship simply sticks.
 *
 * Damage is the kinetic energy the contact actually dissipates, ½·μ·(|v_rel|² − |v_rel'|²) in the
 * centre-of-mass frame, applied equally to both bodies. A crash pays for its impact, a skid pays as
 * it slows, and a ship resting on the ground — or riding a spinning planet, whose centre-relative
 * speed is far from zero — costs nothing.
 *
 * Ship-on-ship contact tests the hulls' actual triangles, or their oriented bounding boxes if the
 * Ship Collision setting is `box` (see findShipHullContact), taking its normal, contact point and
 * depth from where the hulls cross. Until both models have loaded, and for anything else touching a ship, contact uses the
 * ship's hull extent toward the other body (see {@link contactReach}), not its
 * radius: the radius is the model's longest dimension, so it would hold a flat-bellied ship most of
 * a radius above the ground. Separation is to exactly touching (SHIP_CONTACT_SEPARATION_FACTOR):
 * the general relative factor would lift the ship kilometres off an Earth-sized body on every
 * contact.
 *
 * Damage is decided before any velocity changes, so a body destroyed by the contact keeps its
 * pre-impact velocity for the caller's death effects.
 *
 * @param dt Sim seconds covered by this collision pass, used to scale the resting threshold.
 * @param frameStartPositions Each body's position (by id) before this frame's physics step, for the
 *   ship-vs-ship sweep that catches fast ships passing through each other.
 */
function resolveShipContact(
    b1: Body,
    b2: Body,
    dt: number,
    frameStartPositions?: ReadonlyMap<string, THREE.Vector3>
): CollisionOutcome {
    let distance: number;
    // How far b1 must move along _normal (relative to b2) to be exactly touching.
    let penetration: number;
    _rewind.set(0, 0, 0);

    if (b1 instanceof Spaceship && b2 instanceof Spaceship && b1.hasHullModel && b2.hasHullModel) {
        // Ship on ship: test the hull triangles (or oriented boxes, per the Ship Collision setting).
        const mode = settingsStore.settings.shipCollisionMode;
        const start1 = frameStartPositions?.get(b1.id);
        const start2 = frameStartPositions?.get(b2.id);
        if (!findShipHullContact(b1, b2, start1, start2, mode, _meshContact)) {
            return { type: 'none' };
        }
        _normal.copy(_meshContact.normal);
        _contactPoint.copy(_meshContact.point);
        _rewind.copy(_meshContact.rewind);
        penetration = _meshContact.penetration;
        distance = b1.mesh.position.distanceTo(b2.mesh.position);
    } else {
        _relVel.subVectors(b1.velocity, b2.velocity);
        distance = computeContactNormal(b1, b2, _relVel, _normal);

        // The caller's sphere test used the full radii; a ship's hull is much smaller than its
        // radius, so the real contact distance uses its hull extent facing the other body.
        // (_normal points from b2 toward b1, so b1's contact face is along −n and b2's along +n.)
        _tangent.copy(_normal).negate();
        const reach1 = contactReach(b1, _tangent);
        const reach2 = contactReach(b2, _normal);
        const contactDistance = reach1 + reach2;

        // Spheres overlap but the hull hasn't reached the surface yet — not touching.
        if (distance >= contactDistance) return { type: 'none' };

        // Touching: tell the ship what it is standing on, for orientation (see
        // ground-alignment.ts). Ship-on-ship contact is not ground.
        if (b1 instanceof Spaceship && !(b2 instanceof Spaceship)) b1.groundContactBody = b2;
        else if (b2 instanceof Spaceship && !(b1 instanceof Spaceship)) b2.groundContactBody = b1;

        // Contact point on the line of centres, split in proportion to the reaches.
        const split = contactDistance > 0 ? reach2 / contactDistance : 0.5;
        _contactPoint.copy(b2.mesh.position).addScaledVector(_normal, distance * split);
        penetration = contactDistance * SHIP_CONTACT_SEPARATION_FACTOR - distance;
    }

    surfaceVelocityAt(b1, _contactPoint, _surfaceVel1);
    surfaceVelocityAt(b2, _contactPoint, _surfaceVel2);
    _relVel.subVectors(_surfaceVel1, _surfaceVel2);
    const normalSpeed = _relVel.dot(_normal);

    // Already separating (taking off, or mid-hop): clear the overlap, but it's not an impact.
    if (normalSpeed > 0) {
        separateShipContact(b1, b2, _normal, penetration, _rewind);
        return { type: 'none' };
    }

    const m1 = safeMass(b1);
    const m2 = safeMass(b2);
    const totalMass = m1 + m2;
    const reducedMass = m1 > 0 && m2 > 0 ? (m1 * m2) / totalMass : 0;

    // ── Normal: a small landing hop, or nothing at all for resting contact ──
    // Ship on ship never rebounds: the closing speed is cancelled and the hulls stay in contact,
    // sliding (or sticking) against each other instead of bumping apart.
    const isShipOnShip = b1 instanceof Spaceship && b2 instanceof Spaceship;
    const closingSpeed = -normalSpeed;
    const gravity = (G * totalMass) / Math.max(distance * distance, 1e-12);
    const restSpeed = Math.max(SHIP_LANDING_REST_SPEED, 2 * gravity * Math.max(0, dt));
    const isResting = closingSpeed <= restSpeed;
    const reboundSpeed =
        isResting || isShipOnShip
            ? 0
            : Math.min(closingSpeed * SHIP_LANDING_BOUNCE_RESTITUTION, SHIP_LANDING_BOUNCE_SPEED);
    const normalDelta = closingSpeed + reboundSpeed;

    // ── Tangential: Coulomb friction, sticking once slow enough ──
    _tangent.copy(_relVel).addScaledVector(_normal, -normalSpeed);
    const slideSpeed = _tangent.length();
    let slideDelta = 0;
    if (slideSpeed > 0) {
        _tangent.divideScalar(slideSpeed);
        slideDelta =
            slideSpeed <= SHIP_GROUND_STICK_SPEED
                ? slideSpeed
                : Math.min(slideSpeed, SHIP_SURFACE_FRICTION * normalDelta);
    }

    // ── Damage: the energy this contact dissipates (none once the ship has settled) ──
    const isSettled = isResting && slideSpeed <= SHIP_GROUND_STICK_SPEED;
    if (!isSettled && reducedMass > 0) {
        const remainingSlide = slideSpeed - slideDelta;
        const dissipatedSq =
            closingSpeed * closingSpeed +
            slideSpeed * slideSpeed -
            reboundSpeed * reboundSpeed -
            remainingSlide * remainingSlide;
        const damage = 0.5 * reducedMass * Math.max(0, dissipatedSq) * COLLISION_DAMAGE_PER_ENERGY;
        if (damage > 0) {
            b1.takeDamage(damage);
            b2.takeDamage(damage);
            if (damage >= MIN_LOGGED_DAMAGE) {
                console.info(
                    '[body:collision]',
                    `${b1.name} ↔ ${b2.name}: ${damage.toFixed(2)} HP each`
                );
            }
        }
    }

    const alive1 = b1.healthPoints > 0;
    const alive2 = b2.healthPoints > 0;
    if (!alive1 && !alive2) return { type: 'destroy-both', victims: [b1, b2] };
    if (alive1 && !alive2) return claimVictim(b1, b2);
    if (alive2 && !alive1) return claimVictim(b2, b1);

    // ── Apply Δv_rel = n·normalDelta − t̂·slideDelta, split by mass (momentum-conserving) ──
    if (reducedMass > 0) {
        _deltaRelVel.copy(_normal).multiplyScalar(normalDelta);
        if (slideDelta > 0) _deltaRelVel.addScaledVector(_tangent, -slideDelta);
        b1.velocity.addScaledVector(_deltaRelVel, reducedMass / m1);
        b2.velocity.addScaledVector(_deltaRelVel, -reducedMass / m2);
    }

    separateShipContact(b1, b2, _normal, penetration, _rewind);
    return { type: 'bounce' };
}

/**
 * Resolve a contact between two overlapping bodies.
 *
 * Black holes and stars swallow whatever they touch without taking damage. Contacts involving a
 * ship use {@link resolveShipContact}. Every other contact damages both bodies equally (see
 * {@link computeCollisionDamage}): a body whose HP drops to ≤ 0 is destroyed and, if the other
 * survives, claimed by it; if both survive they bounce apart. Damage is applied here, but deaths
 * are left to the caller via the outcome.
 *
 * @param dt Sim seconds covered by this collision pass (only ship contacts use it).
 * @param frameStartPositions Each body's position (by id) before this frame's physics step. Only
 *   ship-vs-ship contacts use it, to catch fast ships passing through each other.
 */
export function resolveCollision(
    b1: Body,
    b2: Body,
    dt: number = 0,
    frameStartPositions?: ReadonlyMap<string, THREE.Vector3>
): CollisionOutcome {
    const isBH1 = b1 instanceof BlackHole;
    const isBH2 = b2 instanceof BlackHole;

    // Black holes dominate everything except another (bigger) black hole.
    if (isBH1 && !isBH2) return { type: 'absorb', winner: b1, victims: [b2] };
    if (isBH2 && !isBH1) return { type: 'absorb', winner: b2, victims: [b1] };

    const isStar1 = b1 instanceof Star;
    const isStar2 = b2 instanceof Star;

    // Two black holes or two stars: keep the original escape-velocity ordering — always absorb.
    if ((isBH1 && isBH2) || (isStar1 && isStar2)) {
        const { winner, victim } = resolveByEscapeVelocity(b1, b2);
        return { type: 'absorb', winner, victims: [victim] };
    }

    // Stars are fluid: anything else plunging in is swallowed rather than bouncing off.
    if (isStar1) return claimVictim(b1, b2);
    if (isStar2) return claimVictim(b2, b1);

    // Ships land, with friction, rather than ricochet.
    if (involvesShip(b1, b2)) return resolveShipContact(b1, b2, dt, frameStartPositions);

    _relVel.subVectors(b1.velocity, b2.velocity);
    const distance = computeContactNormal(b1, b2, _relVel, _normal);
    const normalSpeed = _relVel.dot(_normal);

    // Already separating (e.g. right after a bounce): clear the overlap, but it's not a new impact.
    if (normalSpeed > 0) {
        pushApart(b1, b2, _normal, distance);
        return { type: 'none' };
    }

    const damage = computeCollisionDamage(b1, b2);
    b1.takeDamage(damage);
    b2.takeDamage(damage);
    console.info('[body:collision]', `${b1.name} ↔ ${b2.name}: ${damage.toFixed(2)} HP each`);

    const alive1 = b1.healthPoints > 0;
    const alive2 = b2.healthPoints > 0;

    if (!alive1 && !alive2) return { type: 'destroy-both', victims: [b1, b2] };
    if (alive1 && !alive2) return claimVictim(b1, b2);
    if (alive2 && !alive1) return claimVictim(b2, b1);

    bounceApart(b1, b2, _normal, normalSpeed, distance);
    return { type: 'bounce' };
}
