import { CelestialBody } from '../bodies/celestial-body';
import { ATMOSPHERE_DENSITY_SCALE_HEIGHT_FRACTION } from '../utilities/consts';

/**
 * Atmospheric density at `distance` from `planet`'s centre.
 *
 * Falls off exponentially with altitude above the surface (the barometric-formula shape real
 * atmospheres follow), not linearly with distance to `atmosphereRadius` — see
 * ATMOSPHERE_DENSITY_SCALE_HEIGHT_FRACTION for why. `atmosphereRadius` still acts as a hard
 * outer cutoff (density is exactly 0 beyond it, matching the visual shell/containment check in
 * checkAtmosphericEntry), but density itself typically becomes negligible well before that
 * boundary is reached.
 *
 * Returns 0 when the planet has no atmosphere (`atmosphereRadius == null`) or `distance` is at
 * or beyond `atmosphereRadius`.
 */
export function computeAtmosphericDensity(distance: number, planet: CelestialBody): number {
    const atmosphereRadius = planet.atmosphereRadius;
    if (atmosphereRadius == null || atmosphereRadius <= planet.radius) return 0;
    if (distance >= atmosphereRadius) return 0;

    const altitude = Math.max(0, distance - planet.radius);
    const scaleHeight = planet.radius * ATMOSPHERE_DENSITY_SCALE_HEIGHT_FRACTION;
    return planet.atmosphereSurfaceDensity * Math.exp(-altitude / scaleHeight);
}
