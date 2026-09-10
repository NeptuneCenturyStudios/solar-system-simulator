import { CelestialBody } from './celestial-body';

/**
 * Base class for bodies that exist in the simulation but take no part in gravity physics:
 * they are never accelerated by other bodies' gravity and (via zero mass) exert none of
 * their own. Position only changes from an explicitly-set velocity (e.g. via the gizmo).
 * Used by Wormhole today; Kuiper-belt objects are expected to extend this later.
 */
export abstract class StaticBody extends CelestialBody {
    /**
     * Static bodies spin about their own `rotationAxis` and are never tidally locked, so this
     * replaces CelestialBody's tidal-lock/Y-axis rotation rather than adding to it.
     *
     * Constant-velocity drift still happens in the n-body integrator: the store tags these
     * bodies FLAG_STATIC, which zeroes their gravitational acceleration while leaving the
     * drift step untouched — the same net motion the old `update` produced.
     */
    protected override advanceRotation(dtTotal: number) {
        if (this._isDisposed) return;

        if (this.rotationSpeed) {
            this.mesh.rotateOnAxis(this.rotationAxis, this.rotationSpeed * dtTotal);
        }
    }
}
