import * as THREE from 'three';
import { createTextTexture } from '../drawing/text-rendering.js';
import { BodyTypeEnum } from '../utilities/utilities.js';

export interface IBodyCreationOptions {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    mass: number;
    id: string;
    name: string;

}

/**
 * This class represents the basic body that has gravitational properties, update, and die methods.
 */
export class Body {
    readonly scene: THREE.Scene;
    readonly id: string;
    name: string;
    mass: number;
    velocity: THREE.Vector3;
    _isDisposed = false;
    mesh: THREE.Mesh;
    label: THREE.Sprite | null = null;
    labelLine: THREE.Line | null = null;
    bodyType: BodyTypeEnum;
    protected labelHeight = 0;

    constructor(
        dependencies: object,
        scene: THREE.Scene,
        mass: number,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        geometry: THREE.BufferGeometry,
        material: THREE.Material,
        id: string,
        name: string,
        bodyType: BodyTypeEnum
    ) {
        this.scene = scene;
        this.mass = mass;
        this.velocity = new THREE.Vector3(...velocity);
        this.id = id;
        this.name = name;
        this.bodyType = bodyType;

        this.mesh = new THREE.Mesh(geometry, material);

        if (position instanceof THREE.Vector3) {
            this.mesh.position.copy(position);
        } else if (Array.isArray(position) && (position as Array<number>).length === 3) {
            this.mesh.position.set(position[0], position[1], position[2]);
        } else {
            this.mesh.position.set(0, 0, 0);
        }

        this.mesh.userData = { parentBody: this };

        this.createLabel(this.name);
        if (this.label) this.mesh.add(this.label);
        if (this.labelLine) this.mesh.add(this.labelLine);

        scene.add(this.mesh);
    }

    protected getLabelHeight() {
        return this.labelHeight || 10;
    }

    protected createLabel(name: string) {
        const labelTexture = createTextTexture(name);
        const labelMaterial = new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        this.label = new THREE.Sprite(labelMaterial);
        this.label.scale.set(10, 4, 1);
        this.label.position.set(0, this.getLabelHeight(), 0);
        this.label.visible = false;

        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(
                new Float32Array([0, this.getLabelHeight(), 0, 0, this.getLabelHeight(), 0]),
                3
            )
        );

        this.labelLine = new THREE.Line(
            lineGeometry,
            new THREE.LineBasicMaterial({
                color: 0x00ffcc,
                transparent: true,
                opacity: 0.4,
                depthTest: false,
            })
        );
        this.labelLine.visible = false;
    }

    /**
     * Applies the most basic physics update to the body using the given acceleration and time step.
     * Uses Velocity Verlet integration for updating position and velocity.
     */
    update(acc: THREE.Vector3, dt: number) {
        if (this._isDisposed) return;

        if (
            !acc ||
            typeof acc.x !== 'number' ||
            typeof acc.y !== 'number' ||
            typeof acc.z !== 'number'
        ) {
            acc = new THREE.Vector3(0, 0, 0);
        }

        this.velocity.x += acc.x * dt * 0.5;
        this.velocity.y += acc.y * dt * 0.5;
        this.velocity.z += acc.z * dt * 0.5;

        this.mesh.position.x += this.velocity.x * dt;
        this.mesh.position.y += this.velocity.y * dt;
        this.mesh.position.z += this.velocity.z * dt;

        this.velocity.x += acc.x * dt * 0.5;
        this.velocity.y += acc.y * dt * 0.5;
        this.velocity.z += acc.z * dt * 0.5;
    }

    updateLabel(newName: string) {
        this.name = newName;
        if (this.label?.material) {
            const labelTexture = createTextTexture(newName);
            this.label.material.map = labelTexture;
            this.label.material.needsUpdate = true;
        }
    }

    die() {
        if (this._isDisposed) return;

        this._isDisposed = true;

        // Dispose of the mesh and its resources
        if (this.mesh) {
            this.mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    if (child.geometry) {
                        console.info(`Disposing geometry for ${child.name || child.id}`);
                        child.geometry.dispose();
                    }
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach((mat) => {
                                console.info(`Disposing material for ${child.name || child.id}`);
                                mat.dispose();
                            });
                        } else {
                            child.material.dispose();
                        }
                    }
                }
            });

            // Remove the mesh from the scene
            this.scene.remove(this.mesh);
        }


        try {
            window.dispatchEvent(
                new CustomEvent('body:dead', {
                    detail: { body: this, id: this.id, name: this.name },
                })
            );
        } catch {
            // ignore
        }
    }
}
