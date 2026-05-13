import * as THREE from 'three';
import { SHADOW_MAP_SIZE, SUN_MASS, SUN_RADIUS } from '../utilities/consts';
import { BodyTypeEnum, isBodyType } from '../utilities/utilities';
import { CelestialBody, ICelestialBodyCreationOptions } from './celestial-body';
import { triggerScreenFlash } from '../effects/screen-flash';
import { IStateDependencies } from '../interfaces';

/**
 * Options for creating a Star. Used to keep constructor parameter list manageable and allow future expansion without breaking changes.
 */
export interface IStarCreationOptions extends ICelestialBodyCreationOptions {
    temperature: number;
    lightIntensity: number;
    lightDistance: number;
}

/**
 * Star (e.g. Sun). Owns star-only visuals:
 * - emissive surface material with temperature-based texture bins
 * - directional light + ambient light
 *
 * Note: This file intentionally does NOT import textures directly. They are injected via `textures`
 * so `main.js` remains the single place that loads texture assets.
 *
 * Main-sequence-specific visuals (glow, corona, solar flares, birth effect) live in MainSequenceStar.
 */
/**
 * Represents a star (e.g. Sun) in the simulation, including visuals like corona, glow, and light.
 * Handles star-specific physics, rendering, and lifecycle events.
 */
export class Star extends CelestialBody {
    textures: {
        sunTexture: THREE.Texture;
        redStarTexture: THREE.Texture | null;
        orangeStarTexture: THREE.Texture | null;
        whiteStarTexture: THREE.Texture | null;
        blueStarTexture: THREE.Texture | null;
        whiteDwarfTexture: THREE.Texture | null;
        brownDwarfTexture: THREE.Texture | null;
    };

    temperature: number;

    // Lighting effects
    lightIntensity: number;
    ambientLight: THREE.AmbientLight | null;
    sunLight: THREE.DirectionalLight | null;

    /**
     * @param {object} dependencies - same deps passed to CelestialBody (gizmo, addEvent, addExplosion, etc.)
     * @param {THREE.Scene} scene
     * @param {object} options
     * @param {number} options.radius
     * @param {number[]} options.pos
     * @param {number} options.mass
     * @param {string|null} [options.id]
     * @param {string} [options.name]
     * @param {number} [options.temperature]
     * @param {number} [options.lightIntensity]
     * @param {number} [options.lightDistance]
     * @param {object} textures
     * @param {THREE.Texture} textures.sunTexture
     * @param {THREE.Texture} textures.redStarTexture
     * @param {THREE.Texture} textures.orangeStarTexture
     * @param {THREE.Texture} textures.whiteStarTexture
     * @param {THREE.Texture} textures.blueStarTexture
     * @param {THREE.Texture} textures.whiteDwarfTexture
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IStarCreationOptions,

        textures: {
            sunTexture: THREE.Texture;
            redStarTexture: THREE.Texture | null;
            orangeStarTexture: THREE.Texture | null;
            whiteStarTexture: THREE.Texture | null;
            blueStarTexture: THREE.Texture | null;
            whiteDwarfTexture: THREE.Texture | null;
            brownDwarfTexture: THREE.Texture | null;
        }
    ) {
        if (!textures) {
            throw new Error('Star requires textures to be injected');
        }

        const color = Star.temperatureToColor(options.temperature);

        // TODO: Move mesh creation to MainSequenceStar and other derived classes.
        if (!options.mesh) {
            const geometry = new THREE.SphereGeometry(options.radius, 64, 64);
            const starMaterial = new THREE.MeshPhongMaterial({
                map: textures.sunTexture,
                color: 0xffffff,
                emissive: 0xffffff,
                emissiveMap: textures.sunTexture,
                emissiveIntensity: 1.0,
                shininess: 10,
            });
            options.mesh = new THREE.Mesh(geometry, starMaterial);
        }

        super(
            dependencies,
            scene,
            options.radius,
            color,
            options.pos,
            options.vel ?? new THREE.Vector3(0, 0, 0),
            options.mass,
            options.id,
            options.name,
            BodyTypeEnum.Star,
            0xffffff,
            500,
            false,
            options.rotation,
            options.mesh
        );

        this.textures = textures;
        this.lightIntensity = options.lightIntensity;

        this.temperature = options.temperature;

        if (this.mesh.material instanceof THREE.MeshPhongMaterial) {
            this.mesh.material.emissive.setHex(0xffffff);
            this.mesh.material.emissiveIntensity = 1.0;
        }

        this.sunLight = this.createLight(
            options.pos,
            options.lightIntensity,
            options.lightDistance
        );

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
        scene.add(this.ambientLight);

        this.setTemperature(options.temperature);
    }

    /** Computes the expected radius for a star of the given mass using a mass-radius power law (R ∝ M^0.8). */
    static massToRadius(mass: number): number {
        return SUN_RADIUS * Math.pow(Math.max(0, mass) / SUN_MASS, 0.8);
    }

    /**
     * Calculates the RGB color corresponding to a given surface temperature using an approximation of blackbody radiation.
     * @param temp The surface temperature of the star in Kelvin.
     * @returns The RGB color as a hexadecimal number.
     */
    static temperatureToColor(temp: number) {
        temp = Math.max(1000, Math.min(40000, temp));

        temp = temp / 100;

        let red, green, blue;

        if (temp <= 66) {
            red = 255;
        } else {
            red = temp - 60;
            red = 329.698727446 * Math.pow(red, -0.1332047592);
            red = Math.max(0, Math.min(255, red));

            if (temp > 80) {
                const redReduction = (temp - 80) / 320;
                red = red * (1 - redReduction * 0.5);
            }
        }

        if (temp <= 66) {
            green = temp;
            green = 99.4708025861 * Math.log(green) - 161.1195681661;
            green = Math.max(0, Math.min(255, green));

            if (temp < 40) {
                const greenReduction = (40 - temp) / 40;
                green = green * (1 - greenReduction * 0.7);
            }
        } else {
            green = temp - 60;
            green = 288.1221695283 * Math.pow(green, -0.0755148492);
            green = Math.max(0, Math.min(255, green));

            if (temp > 80) {
                const greenReduction = (temp - 80) / 320;
                green = green * (1 - greenReduction * 0.6);
            }
        }

        if (temp >= 66) {
            blue = 255;
        } else if (temp <= 19) {
            blue = 0;
        } else {
            blue = temp - 10;
            blue = 138.5177312231 * Math.log(blue) - 305.0447927307;
            blue = Math.max(0, Math.min(255, blue));

            if (temp < 40) {
                const blueReduction = (40 - temp) / 40;
                blue = blue * (1 - blueReduction * 0.5);
            }
        }

        red = Math.round(red);
        green = Math.round(green);
        blue = Math.round(blue);

        return (red << 16) | (green << 8) | blue;
    }

    static temperatureToEmissiveIntensity(temp: number) {
        const minTemp = 1000;
        const maxTemp = 30000;
        const sunTemp = 5778;

        temp = Math.max(minTemp, Math.min(maxTemp, temp));

        const lowTempIntensity = 1;
        const midTempIntensity = 10;
        const highTempIntensity = 1;

        let intensity;

        if (temp <= sunTemp) {
            const progress = (temp - minTemp) / (sunTemp - minTemp);
            intensity = lowTempIntensity + progress * (midTempIntensity - lowTempIntensity);
        } else {
            const progress = (temp - sunTemp) / (maxTemp - sunTemp);
            intensity = midTempIntensity - progress * (midTempIntensity - highTempIntensity);
        }

        return Math.max(0, Math.min(2.0, intensity));
    }

    createLight(pos: THREE.Vector3, intensity: number, distance: number) {
        const light = new THREE.DirectionalLight(0xffffff, Math.max(1.0, intensity / 20000000));
        light.position.set(pos.x, pos.y, pos.z);

        light.target = new THREE.Object3D();
        light.target.position.set(0, 0, 0); //21850
        this.scene.add(light.target);

        light.castShadow = true;
        light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
        light.shadow.bias = -0.00001;
        light.shadow.normalBias = 0.01;

        const shadowSize = 5000;
        light.shadow.camera.left = -shadowSize;
        light.shadow.camera.right = shadowSize;
        light.shadow.camera.top = shadowSize;
        light.shadow.camera.bottom = -shadowSize;
        light.shadow.camera.near = 1;
        light.shadow.camera.far = 100000;
        light.shadow.camera.updateProjectionMatrix();

        light.userData.distance = distance;

        this.scene.add(light);
        return light;
    }

    update(acc: THREE.Vector3, dt: number) {
        if (this._isDisposed) return;

        super.update(acc, dt);

        if (this.sunLight) {
            this.sunLight.position.copy(this.mesh.position);
            if (this.sunLight.castShadow) {
                this.sunLight.shadow.needsUpdate = true;
            }
        }
    }

    setShadowsEnabled(enabled: boolean) {
        if (!this.sunLight) return;
        this.sunLight.castShadow = enabled;
        if (enabled) {
            this.sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
            this.sunLight.shadow.bias = -0.00001;
            this.sunLight.shadow.normalBias = 0.01;
            // Shadow frustum is managed dynamically per-body each frame.
            this.sunLight.shadow.needsUpdate = true;
        }
    }

    setLightIntensity(intensity: number) {
        this.lightIntensity = intensity;
        if (this.sunLight) {
            this.sunLight.intensity = intensity / 20000000;
        }
    }

    setTemperature(temp: number) {
        if (!isBodyType(this, BodyTypeEnum.Star)) {
            this.temperature = temp;
            return;
        }

        // Brown dwarfs manage their own fixed visual state; ignore temperature overrides.
        if (this.bodyType & BodyTypeEnum.BrownDwarf) {
            return;
        }

        this.temperature = temp;

        let glowHex: number;
        if (temp <= 2000) glowHex = 0x8b3a0a;
        else if (temp <= 3000) glowHex = 0xff6644;
        else if (temp < 4000) glowHex = 0xffaa55;
        else if (temp < 10000) glowHex = 0xffffee;
        else if (temp < 25000) glowHex = 0xffffff;
        else if (temp < 40000) glowHex = 0xaaccff;
        else glowHex = 0xd6f0ff;

        const material = this.mesh.material as THREE.MeshPhongMaterial;
        material.emissive.setHex(0xffffff);
        material.emissiveIntensity = Star.temperatureToEmissiveIntensity(temp);
        material.needsUpdate = true;

        this.baseColor.setHex(glowHex);

        if (this.sunLight) {
            this.sunLight.color.setHex(glowHex);
        }
    }

    setRadius(newRadius: number) {
        super.setRadius(newRadius);
    }

    setLightDistance(distance: number) {
        if (!this.sunLight) return;
        this.sunLight.userData.distance = distance;
        if (this.sunLight.shadow && this.sunLight.shadow.camera) {
            this.sunLight.shadow.camera.far = Math.min(distance * 0.5, 500000);
            this.sunLight.shadow.camera.updateProjectionMatrix();
        }
    }

    /**
     * Dynamically tunes the directional light's orthographic shadow frustum to tightly
     * wrap the given body. Called every frame by syncAllStarLightTargets() when a valid
     * non-star body is in focus, so shadows work correctly at any scale or orbital distance.
     */
    updateShadowFrustumForBody(body: CelestialBody) {
        if (!this.sunLight) return;
        const dist = this.mesh.position.distanceTo(body.mesh.position);
        const size = body.radius * 4;
        this.sunLight.shadow.camera.left = -size;
        this.sunLight.shadow.camera.right = size;
        this.sunLight.shadow.camera.top = size;
        this.sunLight.shadow.camera.bottom = -size;
        this.sunLight.shadow.camera.near = 1;
        // Ensure far always exceeds the ortho frustum width to avoid near==far edge cases.
        this.sunLight.shadow.camera.far = Math.max(dist * 1.2, size * 2);
        this.sunLight.shadow.camera.updateProjectionMatrix();
        this.sunLight.shadow.needsUpdate = true;
    }

    die(skipExplosion = false) {
        if (this._isDisposed) return;

        try {
            if (this.trail) {
                this.trail.visible = false;
                this.scene.remove(this.trail);

                this.trail.geometry?.dispose?.();
                (this.trail.material as THREE.Material)?.dispose?.();
                this.trail = null;
            }
        } catch {
            // ignore
        }

        try {
            if (this.mesh) {
                this.mesh.visible = false;
                this.scene.remove(this.mesh);

                this.mesh.geometry?.dispose?.();
                (this.mesh.material as THREE.Material)?.dispose?.();
                //this.mesh = null;
            }
        } catch {
            // ignore
        }

        try {
            if (this.sunLight) {
                this.sunLight.visible = false;
                this.scene.remove(this.sunLight);

                if (this.sunLight.target) {
                    this.scene.remove(this.sunLight.target);
                    //this.sunLight.target = null;
                }

                try {
                    this.sunLight.shadow?.map?.dispose?.();
                } catch {
                    // ignore
                }

                this.sunLight = null;
            }
        } catch {
            // ignore
        }

        try {
            if (this.ambientLight) {
                this.ambientLight.visible = false;
                this.scene.remove(this.ambientLight);
                this.ambientLight = null;
            }
        } catch {
            // ignore
        }

        if (!skipExplosion) {
            try {
                triggerScreenFlash();
            } catch {
                // ignore
            }
        }

        super.die(true);
    }
}
