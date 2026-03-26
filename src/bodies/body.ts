import * as THREE from 'three';

/**
 * This class represents the basic body that has gravitational properties, update, and die methods
 */
export class Body {
    mass: number;
    velocity: THREE.Vector3;
    _isDisposed: boolean = false;
    mesh: THREE.Mesh;

    constructor(
        dependencies: any,
        scene: THREE.Scene,
        mass: number,
        position: THREE.Vector3 = new THREE.Vector3(),
        velocity: THREE.Vector3 = new THREE.Vector3(),
        geometry: THREE.BufferGeometry,
        material: THREE.Material
    ) {
        // Initialize basic properties
        this.mass = mass;
        this.velocity = velocity;

        // Create mesh from geometry and material
        this.mesh = new THREE.Mesh(geometry, material);
        // Set initial position
        this.mesh.position.set(position.x, position.y, position.z);
        this.mesh.userData = { parentBody: this }; // Link mesh back to class for raycasting
        // Add mesh to the scene
        scene.add(this.mesh);
    }

    /**
     * Applies the most basic physics update to the body using the given acceleration and time step.
     * Uses Velocity Verlet integration for updating position and velocity.
     * @param acc The acceleration vector to apply to the body.
     * @param dt The time step for the update.
     * @returns void
     */
    update(acc: THREE.Vector3, dt: number) {
        // Move basic update logic here
        if (this._isDisposed) return;

        // Defensive: some callers may invoke update without acceleration.
        // Treat missing/invalid acceleration as zero so simulation doesn't crash.
        if (
            !acc ||
            typeof acc.x !== 'number' ||
            typeof acc.y !== 'number' ||
            typeof acc.z !== 'number'
        ) {
            acc = new THREE.Vector3(0, 0, 0);
        }

        // Velocity Verlet integration
        // v(t + dt/2) = v(t) + a(t) * dt/2
        // x(t + dt) = x(t) + v(t + dt/2) * dt
        // v(t + dt) = v(t + dt/2) + a(t) * dt * 0.5

        // Update velocity by half step
        this.velocity.x += acc.x * dt * 0.5;
        this.velocity.y += acc.y * dt * 0.5;
        this.velocity.z += acc.z * dt * 0.5;

        // Update position
        this.mesh.position.x += this.velocity.x * dt;
        this.mesh.position.y += this.velocity.y * dt;
        this.mesh.position.z += this.velocity.z * dt;

        // Update velocity by another half step (will use same acceleration)
        this.velocity.x += acc.x * dt * 0.5;
        this.velocity.y += acc.y * dt * 0.5;
        this.velocity.z += acc.z * dt * 0.5;
    }

    die() {
        // Move basic die logic here. No animations. Only remove the body from the simulation.
    }
}
