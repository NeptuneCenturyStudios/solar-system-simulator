import * as THREE from 'three';
import { createTextTexture } from '../drawing/text-texture.js';
import { BodyTypeEnum } from './body-enums.js';
import { HP_MASS_MULTIPLIER } from '../utilities/consts.js';
import { SoundEffect, playSoundEffect } from '../utilities/audio.js';
import { IDeathOptions } from '../interfaces.js';
import { EntryFlameEffect } from '../effects/entry-flame.js';

/**
 * This class represents the basic body that has gravitational properties, update, and die methods.
 */
export class Body {
    readonly scene: THREE.Scene;
    readonly id: string;
    name: string;
    mass: number;
    radius: number;
    velocity: THREE.Vector3;
    _isDisposed = false;
    mesh: THREE.Mesh;
    label: THREE.Sprite;
    labelLine: THREE.Line | null = null;
    bodyType: BodyTypeEnum;
    /** When true, UI overlays (name panels, off-screen markers) render this body in red to flag it as a threat. */
    isThreat = false;
    /** Current hit-points.  Initialised from mass × HP_MASS_MULTIPLIER.
     *  Reduced by weapon impacts and collisions; reaching ≤ 0 triggers body.die(). */
    healthPoints: number;
    /** Maximum hit-points at spawn (same initial value as healthPoints).
     *  Use healthPoints / maxHealthPoints for a [0–1] health percentage. */
    readonly maxHealthPoints: number;
    protected labelHeight = 0;
    tempAcc?: THREE.Vector3;
    /** Backward-streaming atmospheric-entry flame, or null when this body isn't currently inside an atmosphere. */
    entryFlame: EntryFlameEffect | null = null;

    /**
     * Constructs a new Body with physical and visual properties.
     * @param dependencies External dependencies for the body.
     * @param scene The THREE.Scene to which the body belongs.
     * @param mass The mass of the body.
     * @param radius The radius of the body.
     * @param position The initial position of the body.
     * @param velocity The initial velocity of the body.
     * @param geometry The geometry used for rendering.
     * @param material The material used for rendering.
     * @param id Unique identifier for the body.
     * @param name Name of the body.
     * @param bodyType The type of the body (enum).
     */
    constructor(
        _dependencies: object,
        scene: THREE.Scene,
        mass: number,
        radius: number,
        position: THREE.Vector3,
        velocity: THREE.Vector3,
        mesh: THREE.Mesh,
        id: string,
        name: string,
        bodyType: BodyTypeEnum
    ) {
        this.scene = scene;
        this.mass = mass;
        this.radius = radius;
        this.velocity = new THREE.Vector3(...velocity);
        this.id = id;
        this.name = name;
        this.bodyType = bodyType;
        this.healthPoints = mass * HP_MASS_MULTIPLIER;
        this.maxHealthPoints = this.healthPoints;
        this.mesh = mesh;

        if (position instanceof THREE.Vector3) {
            this.mesh.position.copy(position);
        } else if (Array.isArray(position) && (position as Array<number>).length === 3) {
            this.mesh.position.set(position[0], position[1], position[2]);
        } else {
            this.mesh.position.set(0, 0, 0);
        }

        this.mesh.userData = { parentBody: this };

        this.label = this.createLabel(this.name);
        if (this.label) this.mesh.add(this.label);
        if (this.labelLine) this.mesh.add(this.labelLine);

        scene.add(this.mesh);
    }

    protected getLabelHeight() {
        return this.labelHeight || 10;
    }

    protected createLabel(_name: string) {
        // Old text labels are replaced by PlanetNameIndicator (autopilot-style panels).
        // Create a placeholder sprite that is always invisible so the body still has a
        // `label` reference for `updateLabel()` (used by the management panel).
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const labelTexture = new THREE.CanvasTexture(canvas);
        const labelMaterial = new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });

        const label = new THREE.Sprite(labelMaterial);
        label.scale.set(1, 1, 1);
        label.position.set(0, this.getLabelHeight(), 0);
        label.visible = false;

        // Keep labelLine as a stub too.
        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 3)
        );
        this.labelLine = new THREE.Line(
            lineGeometry,
            new THREE.LineBasicMaterial({
                color: 0x00ffcc,
                transparent: true,
                opacity: 0,
                depthTest: false,
            })
        );
        this.labelLine.visible = false;

        return label;
    }

    /**
     * Advance purely visual state by one rendered frame.
     *
     * Integration no longer happens here. Position and velocity are advanced in bulk by the
     * n-body engine (src/physics/nbody), which mirrors every body into flat typed arrays,
     * runs all substeps there, and writes the result back to `mesh.position` once per frame.
     * Subclasses override this to drive effects, and are called once per frame rather than
     * once per substep — so anything here must scale with `dtTotal`, not a substep dt.
     *
     * @param _dtTotal Total elapsed simulation time for this frame (sum of all substep dts).
     */
    updateVisuals(_dtTotal: number) {
        // Base bodies have no per-frame visual state; subclasses override.
    }

    updateLabel(newName: string) {
        this.name = newName;
        if (this.label?.material) {
            const labelTexture = createTextTexture(newName);
            this.label.material.map = labelTexture;
            this.label.material.needsUpdate = true;
        }
    }

    setMass(mass: number) {
        this.mass = mass;
    }

    die(deathOptions?: IDeathOptions) {
        if (this._isDisposed) return;

        this._isDisposed = true;

        if (this.entryFlame) {
            this.entryFlame.dispose();
            this.entryFlame = null;
        }

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
                            console.info(`Disposing material for ${child.name || child.id}`);
                            child.material.dispose();
                        }
                    }
                }
            });

            // Remove the mesh from the scene
            this.scene.remove(this.mesh);

            if (!deathOptions || !deathOptions.skipImpactSound) {
                playSoundEffect(SoundEffect.WeaponImpact);
            }
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
