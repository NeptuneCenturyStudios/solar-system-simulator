import * as THREE from 'three';

/**
 * Base class for a solar system feature: a non-body part of a generated system
 * (e.g. a Kuiper belt) that a generator returns alongside its bodies.
 *
 * A feature attaches itself to the scene through {@link attach} and is torn down
 * with {@link dispose}, which removes everything it attached and frees the GPU resources.
 */
export abstract class SolarSystemFeature {
    /** Display name, used for logging. */
    abstract readonly name: string;

    protected readonly attached: THREE.Object3D[] = [];

    constructor(protected readonly scene: THREE.Scene) {}

    /** Adds an object to the scene and tracks it so {@link dispose} can remove it. */
    protected attach(object: THREE.Object3D): void {
        this.scene.add(object);
        this.attached.push(object);
    }

    /** Removes every attached object from the scene and disposes its geometries and materials. */
    dispose(): void {
        for (const root of this.attached) {
            this.scene.remove(root);
            root.traverse((child) => {
                if (!(child instanceof THREE.Mesh || child instanceof THREE.Points)) return;
                child.geometry.dispose();
                const material: THREE.Material | THREE.Material[] = child.material;
                if (Array.isArray(material)) {
                    for (const m of material) m.dispose();
                } else {
                    material.dispose();
                }
            });
        }
        this.attached.length = 0;
    }
}
