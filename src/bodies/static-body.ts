import * as THREE from 'three';
import { CelestialBody } from './celestial-body';

/**
 * Base class for bodies that exist in the simulation but take no part in gravity physics:
 * they are never accelerated by other bodies' gravity and (via zero mass) exert none of
 * their own. Position only changes from an explicitly-set velocity (e.g. via the gizmo).
 * Used by Wormhole today; Kuiper-belt objects are expected to extend this later.
 */
export abstract class StaticBody extends CelestialBody {
    /** Skips gravity integration entirely; only constant-velocity drift and spin apply. */
    update(_acc: THREE.Vector3, dt: number) {
        if (this._isDisposed) return;

        this.mesh.position.x += this.velocity.x * dt;
        this.mesh.position.y += this.velocity.y * dt;
        this.mesh.position.z += this.velocity.z * dt;

        if (this.rotationSpeed) {
            this.mesh.rotateOnAxis(this.rotationAxis, this.rotationSpeed * dt);
        }
    }
}
