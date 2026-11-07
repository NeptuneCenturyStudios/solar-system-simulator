import * as THREE from 'three';
import { Body } from '../bodies/body';
import { BlackHole } from '../bodies/black-hole';
import { Star } from '../bodies/star';
import { Spaceship } from '../bodies/ships/spaceship';
import {
    COLLISION_DAMAGE_PER_ENERGY,
    COLLISION_MIN_DAMAGE_FRACTION,
    COLLISION_RESTITUTION,
    COLLISION_SEPARATION_FACTOR,
    SHIP_LANDING_BOUNCE_RESTITUTION,
    SHIP_LANDING_BOUNCE_SPEED,
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

function safeMass(body: Body): number {
    return Math.max(0, body?.mass || 0);
}

/**
 * Whether either side of a contact is a ship. Ships are the one body class with their own impact
 * rules: they do not ricochet (see {@link contactRestitution}) and they are exempt from the
 * minimum-damage floor (see {@link computeCollisionDamage}).
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
 * HP damage dealt to EACH body by an impact.
 *
 * Both bodies take the same damage: the kinetic energy of their relative motion in the
 * centre-of-mass frame, ½·μ·v_rel² with μ = m₁m₂ / (m₁ + m₂), scaled by
 * COLLISION_DAMAGE_PER_ENERGY.
 *
 * For every body except a ship that damage never drops below COLLISION_MIN_DAMAGE_FRACTION of the
 * lighter body's max HP, so even a gentle contact wears the lighter body down and nothing can
 * survive indefinitely against something heavier.
 *
 * A ship is exempt from that floor, and the exemption is what makes landing possible. A landed
 * ship keeps touching the ground every frame, so the floor would drain a quarter of its HP per
 * frame and kill it in about four frames while it just sits there. Without the floor the damage is
 * exactly the impact energy: the touchdown frame hurts (the relative speed is real), and every
 * frame after it costs nothing because the contact has already cancelled the closing speed. See
 * {@link contactRestitution}.
 */
export function computeCollisionDamage(b1: Body, b2: Body): number {
    const m1 = safeMass(b1);
    const m2 = safeMass(b2);
    const totalMass = m1 + m2;
    const reducedMass = totalMass > 0 ? (m1 * m2) / totalMass : 0;
    const relSpeedSq = _damageRelVel.subVectors(b1.velocity, b2.velocity).lengthSq();
    const damage = 0.5 * reducedMass * relSpeedSq * COLLISION_DAMAGE_PER_ENERGY;

    if (involvesShip(b1, b2)) return damage;

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

/** Push overlapping bodies apart along the normal; the heavier body moves less. */
function pushApart(b1: Body, b2: Body, normal: THREE.Vector3, distance: number): void {
    const penetration = (b1.radius + b2.radius) * COLLISION_SEPARATION_FACTOR - distance;
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
 * Restitution (the fraction of the closing speed handed back) for one contact.
 *
 * Ordinary bodies use COLLISION_RESTITUTION — they genuinely bounce off each other. A ship does
 * not: it lands. Its contact returns the smaller of
 *
 *   SHIP_LANDING_BOUNCE_RESTITUTION × closing speed   (the settle term — energy lost per bounce)
 *   SHIP_LANDING_BOUNCE_SPEED                         (the cap — a fixed, tiny hop)
 *
 * Because the cap is a speed rather than a fraction of the impact, a fall from orbit and a gentle
 * touchdown both rebound at the same few metres per second, and gravity turns that speed into a
 * height: ~1.5 m on Earth, ~9 m on the Moon, ~0.6 m on Jupiter. The settle term is what makes the
 * hop shrink instead of repeating forever — the second bounce leaves at a fraction of the cap, the
 * third at a fraction of that, and the ship is resting on the ground after a bounce or two.
 *
 * @param normalSpeed Closing speed along the normal, (v₁ − v₂)·n — negative while approaching.
 */
function contactRestitution(b1: Body, b2: Body, normalSpeed: number): number {
    if (!involvesShip(b1, b2)) return COLLISION_RESTITUTION;

    const closingSpeed = Math.abs(normalSpeed);
    if (!(closingSpeed > 0)) return 0;

    const reboundSpeed = Math.min(
        closingSpeed * SHIP_LANDING_BOUNCE_RESTITUTION,
        SHIP_LANDING_BOUNCE_SPEED
    );

    return reboundSpeed / closingSpeed;
}

/**
 * Bounce two surviving bodies off each other: a momentum-conserving impulse along the contact
 * normal with the contact's restitution (see {@link contactRestitution}), then separation so they
 * don't re-contact next frame.
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
        const restitution = contactRestitution(b1, b2, normalSpeed);
        const impulse = -(1 + restitution) * normalSpeed * reducedMass;
        b1.velocity.addScaledVector(normal, impulse / m1);
        b2.velocity.addScaledVector(normal, -impulse / m2);
    }

    pushApart(b1, b2, normal, distance);
}

/**
 * Resolve a contact between two overlapping bodies.
 *
 * Black holes and stars swallow whatever they touch without taking damage. Every other
 * contact damages both bodies equally (see {@link computeCollisionDamage}): a body whose HP
 * drops to ≤ 0 is destroyed and, if the other survives, claimed by it; if both survive they
 * bounce apart. Damage is applied here, but deaths are left to the caller via the outcome.
 */
export function resolveCollision(b1: Body, b2: Body): CollisionOutcome {
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

    _relVel.subVectors(b1.velocity, b2.velocity);
    const distance = computeContactNormal(b1, b2, _relVel, _normal);
    const normalSpeed = _relVel.dot(_normal);

    // Already separating (e.g. right after a bounce): clear the overlap, but it's not a new impact.
    if (normalSpeed > 0) {
        pushApart(b1, b2, _normal, distance);
        return { type: 'none' };
    }

    const damage = computeCollisionDamage(b1, b2);
    // A resting ship contacts its landing site every frame at ~zero closing speed, which is worth
    // no damage at all — skip the whole block so it neither takes nor logs a hit.
    if (damage > 0) {
        b1.takeDamage(damage);
        b2.takeDamage(damage);
        console.info('[body:collision]', `${b1.name} ↔ ${b2.name}: ${damage.toFixed(2)} HP each`);
    }

    const alive1 = b1.healthPoints > 0;
    const alive2 = b2.healthPoints > 0;

    if (!alive1 && !alive2) return { type: 'destroy-both', victims: [b1, b2] };
    if (alive1 && !alive2) return claimVictim(b1, b2);
    if (alive2 && !alive1) return claimVictim(b2, b1);

    bounceApart(b1, b2, _normal, normalSpeed, distance);
    return { type: 'bounce' };
}
