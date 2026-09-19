import * as THREE from 'three';
import { IEffect } from './effect-base.js';
import { IStateDependencies } from '../interfaces.js';
import { buildBodySphereGeometry } from '../utilities/utilities.js';

/**
 * Blue-white expanding flash sphere spawned at a weapon impact point.
 * Uses MeshBasicMaterial with depthTest:false — same pattern as the working
 * flashSphere in ParticleExplosion — so it is always visible regardless of
 * impact angle or planet occlusion geometry.
 */
export class ImpactShockwave implements IEffect {
    dependencies: IStateDependencies;
    active: boolean;

    private scene: THREE.Scene;
    private sphere: THREE.Mesh;
    private mat: THREE.MeshBasicMaterial;
    private readonly worldPos: THREE.Vector3;
    private age: number;
    private readonly maxAge = 30; // frames (~0.5 s at 60 fps)
    private readonly baseRadius: number;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        hitPos: THREE.Vector3,
        bodyCenter: THREE.Vector3,
        bodyRadius: number
    ) {
        this.dependencies = dependencies;
        this.active = true;
        this.scene = scene;
        this.age = 0;
        // The 5-unit floor is sized for planets and asteroids, where it reads as a compact flash
        // on a huge surface. On a ship it is catastrophic: a 500 km sphere centred on a 37 m hull
        // swallows the camera, and because the material is front-faced the viewer then sees
        // nothing at all — which is why weapon hits on ships appeared to have no effect while the
        // same code looked right on a planet. Capping the flash to a few hull radii keeps small
        // targets legible and leaves anything bigger than ~170 km across exactly as it was.
        this.baseRadius = Math.min(Math.max(5, bodyRadius * 0.001), bodyRadius * 3);

        // Place the flash at the impact position on the planet surface.
        // Snap outward so the sphere is visually sitting on the surface.
        const outward = hitPos.clone().sub(bodyCenter);
        if (outward.lengthSq() > 0) outward.normalize();
        else outward.set(0, 1, 0);
        this.worldPos = bodyCenter.clone().addScaledVector(outward, bodyRadius);

        const geo = buildBodySphereGeometry(1);
        this.mat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(0x44bbff).lerp(new THREE.Color(0xffffff), 0.4),
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
        });

        this.sphere = new THREE.Mesh(geo, this.mat);
        this.sphere.position.copy(this.worldPos);
        this.sphere.scale.setScalar(this.baseRadius);
        this.sphere.frustumCulled = false;
        this.sphere.renderOrder = 1;
        scene.add(this.sphere);
    }

    update(dt: number) {
        dt = Math.abs(dt);
        this.age += dt * 60;

        const progress = Math.min(this.age / this.maxAge, 1.0);
        // Expand from 1× to 4× while fading out
        this.sphere.scale.setScalar(this.baseRadius * (1.0 + progress * 1.001));
        this.mat.opacity = Math.max(0, 2.0 * Math.pow(1.0 - progress, 1.5));

        if (progress >= 1.0) {
            this.active = false;
            this.dispose();
        }
    }

    dispose() {
        this.scene.remove(this.sphere);
        this.sphere.geometry.dispose();
        this.mat.dispose();
    }
}
