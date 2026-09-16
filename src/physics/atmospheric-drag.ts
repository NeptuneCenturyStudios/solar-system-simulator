import * as THREE from 'three';
import { Body } from '../bodies/body';
import { CelestialBody } from '../bodies/celestial-body';
import {
    ATMOSPHERE_DAMAGE_COEFFICIENT,
    ATMOSPHERE_DRAG_COEFFICIENT,
    ATMOSPHERE_FULL_INTENSITY_SPEED,
    ATMOSPHERE_MIN_SPEED_FOR_EFFECT,
} from '../utilities/consts';

/** Scratch vectors so the per-pair atmospheric pass never allocates. */
const _relVel = new THREE.Vector3();
const _dragRelVel = new THREE.Vector3();

/**
 * HP lost this step to atmospheric heating/ablation. Pure function — mirrors
 * computeCollisionDamage's role in collision.ts.
 *
 * Scales with density × relSpeed³ × radius² (kinetic-energy flux through the body's
 * cross-section, the same ρv³A scaling real re-entry heating uses), gated to exactly 0 below
 * ATMOSPHERE_MIN_SPEED_FOR_EFFECT — the same speed threshold that governs when the entry-flame
 * effect is even visible, so a body too slow to show a flame takes no heat damage either. This
 * is deliberately not divided by mass: for bodies of similar material density,
 * maxHealthPoints ∝ mass ∝ radius³, so time-to-destroy = maxHP / damageRate ∝ radius³/radius²
 * = radius — burn-through time scales with the body's own size, matching "small bodies burn up
 * fast, large ones barely notice" without needing to reconcile wildly different mass scales by
 * hand.
 */
export function computeAtmosphericDamage(
    body: Body,
    planet: CelestialBody,
    density: number,
    dt: number
): number {
    if (density <= 0 || dt <= 0) return 0;

    const relSpeed = body.velocity.distanceTo(planet.velocity);
    if (relSpeed <= 0) return 0;

    const speedIntensity = THREE.MathUtils.smoothstep(
        relSpeed,
        ATMOSPHERE_MIN_SPEED_FOR_EFFECT,
        ATMOSPHERE_FULL_INTENSITY_SPEED
    );
    if (speedIntensity <= 0) return 0;

    const power = 0.5 * density * relSpeed ** 3 * body.radius * body.radius;
    return ATMOSPHERE_DAMAGE_COEFFICIENT * power * speedIntensity * dt;
}

/**
 * Reduces `body`'s speed relative to `planet`, never reversing its direction.
 *
 * Real quadratic drag is dv/dt = -k0*v^2, k0 = ATMOSPHERE_DRAG_COEFFICIENT * density *
 * radius^2 / mass (a ballistic-coefficient term — light bodies with proportionally large
 * cross-section, like ships/satellites, feel far more drag per unit mass than a dense
 * asteroid). Rather than an Euler step, which could overshoot and reverse the relative
 * velocity at high time-warp, this applies the closed-form solution
 * v(t) = v0 / (1 + k0*v0*t), which is exact for any dt, unconditionally stable, and by
 * construction can never cross zero — no clamping needed. Unlike damage, this is not gated by
 * speed: even faint residual density should sap a little speed every frame, which is what lets
 * a low, slow orbiter keep decaying its orbit gradually rather than seeing no effect at all.
 */
function applyAtmosphericDrag(
    body: Body,
    planet: CelestialBody,
    density: number,
    dt: number
): void {
    if (density <= 0 || dt <= 0) return;

    _relVel.subVectors(body.velocity, planet.velocity);
    const relSpeed = _relVel.length();
    if (relSpeed <= 1e-9) return;

    const mass = Math.max(body.mass, 1e-30);
    const k0 = (ATMOSPHERE_DRAG_COEFFICIENT * density * body.radius * body.radius) / mass;
    const newRelSpeed = relSpeed / (1 + k0 * relSpeed * dt);

    _dragRelVel.copy(_relVel).multiplyScalar(newRelSpeed / relSpeed);
    body.velocity.copy(planet.velocity).add(_dragRelVel);
}

/**
 * Applies one frame's worth of atmospheric drag and heat damage to `body`. Mutates
 * `body.velocity` directly and applies heat damage via `body.takeDamage()`; does NOT call `.die()` or touch the bodies
 * array — the caller (checkAtmosphericEntry in animation-loop.ts) does that, mirroring
 * resolveCollision's contract.
 *
 * @returns true when this step's damage brought healthPoints to <= 0.
 */
export function resolveAtmosphericPassage(
    body: Body,
    planet: CelestialBody,
    density: number,
    dt: number
): boolean {
    const damage = computeAtmosphericDamage(body, planet, density, dt);
    if (damage > 0) body.takeDamage(damage);

    applyAtmosphericDrag(body, planet, density, dt);

    return body.healthPoints <= 0;
}
