import * as THREE from 'three';
import { SHADOW_MAP_SIZE, SUN_MASS, SCALE_FACTOR } from '../utilities/consts.js';
import { BodyType, isBodyType } from '../utilities/utilities.js';
import { CelestialBody, ICelestialBodyCreationOptions } from './celestial-body.js';
import { BlackHole } from './black-hole.js';
import { triggerScreenFlash } from '../effects/screen-flash.js';
import { Corona } from '../effects/corona.js';
import { IStateDependencies } from '../interfaces.js';

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
 * - corona particle system
 * - glow sprite
 * - directional light + ambient light
 *
 * Note: This file intentionally does NOT import textures directly. They are injected via `textures`
 * so `main.js` remains the single place that loads texture assets.
 */
export class Star extends CelestialBody {
    fuel: number;
    maxFuel: number;

    /**
     * Hook for the app (main.js) to inject a supernova factory.
     * This avoids importing `Supernova` here (it currently lives in main.js).
     * @type {(scene: THREE.Scene, pos: THREE.Vector3, radius: number, shouldCollapse: boolean) => any}
     */
    static createSupernova = null;

    /**
     * Hook for the app (main.js) to inject the StarBirth effect factory.
     * This keeps Star decoupled from effect module imports.
     * @type {(scene: THREE.Scene, pos: THREE.Vector3, radius: number) => any}
     */
    static createStarBirth = null;
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
            sunTexture: THREE.Texture,
            redStarTexture: THREE.Texture,
            orangeStarTexture: THREE.Texture,
            whiteStarTexture: THREE.Texture,
            blueStarTexture: THREE.Texture,
            whiteDwarfTexture: THREE.Texture
        }
    ) {
        if (!textures) {
            throw new Error('Star requires textures to be injected');
        }

        const color = Star.temperatureToColor(options.temperature);

        const starMaterial = new THREE.MeshPhongMaterial({
            map: textures.sunTexture,
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveMap: textures.sunTexture,
            emissiveIntensity: 1.0,
            shininess: 10,
        });

        super(
            dependencies,
            scene,
            options.radius,
            color,
            options.pos,
            new THREE.Vector3(0, 0, 0),
            options.mass,
            options.id,
            options.name,
            BodyType.Star,
            0xffffff,
            500,
            false,
            { axis: [0, 1, 0], speed: 0.08 },
            null,
            starMaterial
        );

        this.dependencies = dependencies;
        this.textures = textures;

        this.lightIntensity = options.lightIntensity;
        this._lightIntensity = options.lightIntensity;

        this.initialMass = options.mass;
        this.initialRadius = options.radius;
        this.initialColor = new THREE.Color(color);
        this.temperature = options.temperature;

        this.maxFuel = options.mass * 100000 * SCALE_FACTOR;
        this.fuel = this.maxFuel;

        this.isBecomingWhiteDwarf = false;
        this.targetWhiteDwarfRadius = 8;
        this._pendingBlackHoleFormation = false;

        this.mesh.material.emissive.setHex(0xffffff);
        this.mesh.material.emissiveIntensity = 1.0;

        this.corona = new Corona(dependencies, scene, options.radius + 1, this.baseColor.getHex());
        this.sunGlow = this.createGlow(options.radius, this.baseColor.getHex());
        this.sunLight = this.createLight(
            options.pos,
            options.lightIntensity,
            options.lightDistance
        );

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
        scene.add(this.ambientLight);

        this.visualTime = 0;

        this.setTemperature(options.temperature);

        this.birthEffect = null;
        this.isBirthing = false;
        this._startBirthEffect();
    }

    static temperatureToColor(temp) {
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

    static temperatureToEmissiveIntensity(temp) {
        const minTemp = 2000;
        const maxTemp = 30000;
        const sunTemp = 5778;

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

        return Math.min(2.0, intensity);
    }

    createGlow(radius, glowHex = 0xffffcc) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        ctx.clearRect(0, 0, 128, 128);

        const c = new THREE.Color(glowHex);
        const r = Math.round(c.r * 255);
        const g = Math.round(c.g * 255);
        const b = Math.round(c.b * 255);

        const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
        grad.addColorStop(0.2, `rgba(${r}, ${g}, ${b}, 0.85)`);
        grad.addColorStop(0.6, `rgba(${r}, ${g}, ${b}, 0.22)`);
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 128, 128);

        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;

        const glowMat = new THREE.SpriteMaterial({
            map: tex,
            color: glowHex,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0.85,
            depthWrite: false,
            depthTest: true,
        });

        const glow = new THREE.Sprite(glowMat);
        glow.scale.set(radius * 5, radius * 5, 1);
        this.scene.add(glow);

        return glow;
    }

    createLight(pos, intensity, distance) {
        const light = new THREE.DirectionalLight(0xffffff, Math.max(1.0, intensity / 20000000));
        light.position.set(pos[0], pos[1], pos[2]);

        light.target = new THREE.Object3D();
        light.target.position.set(21850, 0, 0);
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

        this._updateBirthEffect(dt);

        this.visualTime += dt;

        const starDeathEnabled = document.getElementById('enableStarDeath')?.checked || false;
        if (starDeathEnabled && this.fuel !== null && this.fuel > 0) {
            const referenceMass = 1000;
            const massRatio = this.mass / referenceMass;
            const burnRate = Math.pow(massRatio, 2.5) * 0.001 * Math.abs(dt);
            this.fuel -= burnRate;

            const fuelPercent = this.fuel / this.maxFuel;
            const isMassiveStar = this.initialMass > SUN_MASS * 3.3;

            if (!isMassiveStar) {
                if (fuelPercent < 0.3 && fuelPercent > 0) {
                    const expansionProgress = 1 - fuelPercent / 0.3;
                    const STAR_MAX_RADIUS = 600000 * SCALE_FACTOR;

                    const targetRadiusUnclamped = this.initialRadius * (1 + expansionProgress * 99);
                    const targetRadius = Math.min(targetRadiusUnclamped, STAR_MAX_RADIUS);

                    if (dt !== 0) {
                        this.radius = this.radius + (targetRadius - this.radius) * 0.01;
                        this.setRadius(this.radius);
                    }

                    const targetMass = this.initialMass * (1 - expansionProgress * 0.5);
                    this.mass = this.mass + (targetMass - this.mass) * 0.01;

                    if (this.labelLine) {
                        const labelHeight = this.radius * 3.5;
                        const linePositions = this.labelLine.geometry.attributes.position.array;
                        linePositions[1] = this.radius;
                        linePositions[4] = labelHeight;
                        this.labelLine.geometry.attributes.position.needsUpdate = true;
                        this.label.position.y = labelHeight;
                    }

                    const targetTemp = 2200 + (fuelPercent / 0.3) * 3578;
                    this.temperature = targetTemp;

                    const redGiantColor = this.temperatureToColor(targetTemp);
                    this.mesh.material.color.lerp(redGiantColor, 0.01);
                    this.mesh.material.emissive.lerp(redGiantColor, 0.01);

                    const targetIntensity = Star.temperatureToEmissiveIntensity(targetTemp);
                    this.mesh.material.emissiveIntensity =
                        this.mesh.material.emissiveIntensity +
                        (targetIntensity - this.mesh.material.emissiveIntensity) * 0.01;
                }
            }

            if (this.fuel <= 0) {
                this.fuel = 0;
                this.triggerStarDeath(isMassiveStar);
            }
        }

        if (this.isBecomingWhiteDwarf && this.radius > this.targetWhiteDwarfRadius) {
            const shrinkRate = (this.radius - this.targetWhiteDwarfRadius) * 0.005;
            this.radius = Math.max(this.targetWhiteDwarfRadius, this.radius - shrinkRate);

            if (this.radius <= this.targetWhiteDwarfRadius) {
                this.radius = this.targetWhiteDwarfRadius;
                this.isBecomingWhiteDwarf = false;
            }

            this.mesh.scale.setScalar(this.radius / this.initialRadius);

            if (this.labelLine) {
                const meshScale = this.radius / this.initialRadius;
                const localLabelHeight = (this.radius * 3.5) / meshScale;

                const linePositions = this.labelLine.geometry.attributes.position.array;
                linePositions[1] = this.radius / meshScale;
                linePositions[4] = localLabelHeight;
                this.labelLine.geometry.attributes.position.needsUpdate = true;
                this.label.position.y = localLabelHeight;
            }
        }

        super.update(acc, dt);

        if (this.corona) {
            this.corona.update(dt);
        }

        if (this.sunGlow) {
            this.sunGlow.scale.setScalar(
                this.radius * 4.6 + Math.sin(this.visualTime * 0.0015 * 60) * (this.radius * 0.4)
            );
            this.sunGlow.position.copy(this.mesh.position);
        }

        if (this.corona?.points) {
            this.corona.points.position.copy(this.mesh.position);
        }

        if (this.sunLight) {
            this.sunLight.position.copy(this.mesh.position);
            if (this.sunLight.castShadow) {
                this.sunLight.shadow.needsUpdate = true;
            }
        }
    }

    triggerStarDeath(isMassiveStar) {
        if (isMassiveStar) {
            try {
                if (typeof Star.createSupernova === 'function') {
                    Star.createSupernova(this.scene, this.mesh.position.clone(), this.radius, true);
                }
            } catch {
                // ignore
            }

            try {
                triggerScreenFlash();
            } catch {
                // ignore
            }

            try {
                const blackHoleMass = this.mass * 0.9999;
                const uniqueBHId = `blackHole_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
                const newBlackHole = new BlackHole(
                    this.dependencies,
                    this.scene,
                    this.mesh.position.toArray(),
                    blackHoleMass,
                    uniqueBHId,
                    'Black Hole'
                );

                if (this.dependencies?.addBody) {
                    this.dependencies.addBody(newBlackHole);
                }

                if (this.dependencies?.addEvent) {
                    this.dependencies.addEvent(`Black Hole formed from ${this.name}!`);
                }
            } catch {
                // ignore
            }

            this.die(true);
        } else {
            this.isBecomingWhiteDwarf = true;

            this.mesh.material.map = this.textures.whiteDwarfTexture;
            this.mesh.material.emissiveMap = this.textures.whiteDwarfTexture;
            this.mesh.material.color.setHex(0xffffff);
            this.mesh.material.emissive.setHex(0xffffff);
            this.mesh.material.emissiveIntensity = 1.25;
            this.mesh.material.needsUpdate = true;

            this.temperature = 10000;
            this.name = this.name + ' (White Dwarf)';
            this.updateLabel(this.name);

            if (this.labelLine) {
                const meshScale = this.radius / this.initialRadius;
                const localLabelHeight = (this.radius * 3.5) / meshScale;

                const linePositions = this.labelLine.geometry.attributes.position.array;
                linePositions[1] = this.radius / meshScale;
                linePositions[4] = localLabelHeight;
                this.labelLine.geometry.attributes.position.needsUpdate = true;
                this.label.position.y = localLabelHeight;
            }

            if (this.corona?.points) {
                this.corona.points.visible = false;
                this.corona.dispose();
                this.corona = null;
            }

            if (this.sunGlow) {
                this.sunGlow.visible = false;
                this.scene.remove(this.sunGlow);
                this.sunGlow = null;
            }

            this.fuel = null;
            this.maxFuel = null;
            this.bodyType &= ~BodyType.Star;
        }
    }

    setShadowsEnabled(enabled) {
        this.sunLight.castShadow = enabled;
        if (enabled) {
            this.sunLight.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
            this.sunLight.shadow.bias = -0.00001;
            this.sunLight.shadow.normalBias = 0.01;
            const shadowSize = 5000;
            this.sunLight.shadow.camera.left = -shadowSize;
            this.sunLight.shadow.camera.right = shadowSize;
            this.sunLight.shadow.camera.top = shadowSize;
            this.sunLight.shadow.camera.bottom = -shadowSize;
            this.sunLight.shadow.camera.near = 1;
            this.sunLight.shadow.camera.far = 100000;
            this.sunLight.shadow.camera.updateProjectionMatrix();
        }
    }

    setLightIntensity(intensity) {
        this.lightIntensity = intensity;
        this._lightIntensity = intensity;
        this.sunLight.intensity = intensity / 100000000;
    }

    setTemperature(temp) {
        this.temperature = temp;

        if (!isBodyType(this, BodyType.Star)) {
            return;
        }

        let map = this.textures.sunTexture;
        let glowHex = 0xffffcc;

        if (temp <= 3000) {
            map = this.textures.redStarTexture;
            glowHex = 0xff6644;
        } else if (temp < 4000) {
            map = this.textures.orangeStarTexture;
            glowHex = 0xffaa55;
        } else if (temp < 10000) {
            map = this.textures.sunTexture;
            glowHex = 0xffffcc;
        } else if (temp < 25000) {
            map = this.textures.whiteStarTexture;
            glowHex = 0xffffff;
        } else {
            map = this.textures.blueStarTexture;
            glowHex = 0xaaccff;
        }

        this.mesh.material.map = map;
        this.mesh.material.emissiveMap = map;
        this.mesh.material.needsUpdate = true;

        this.mesh.material.emissive.setHex(0xffffff);
        this.mesh.material.emissiveIntensity = 1.0;

        this.baseColor.setHex(glowHex);

        if (this.sunGlow && this.sunGlow.material) {
            this.sunGlow.material.color.setHex(glowHex);

            try {
                const oldMap = this.sunGlow.material.map;
                if (oldMap && typeof oldMap.dispose === 'function') oldMap.dispose();

                const newGlow = this.createGlow(this.radius, glowHex);
                newGlow.position.copy(this.sunGlow.position);
                newGlow.scale.copy(this.sunGlow.scale);
                newGlow.visible = this.sunGlow.visible;

                this.scene.remove(this.sunGlow);
                this.sunGlow = newGlow;
            } catch {
                // ignore
            }
        }

        if (this.corona) {
            this.corona.setColor(glowHex);
        }

        if (this.sunLight) {
            this.sunLight.color.setHex(glowHex);
        }
    }

    _syncBaselineRadiusIfStable() {
        const fuelActive = this.fuel !== null && this.maxFuel !== null && this.maxFuel > 0;
        const fuelPercent = fuelActive ? this.fuel / this.maxFuel : 1;

        const inRedGiantPhase = fuelActive && fuelPercent < 0.3 && fuelPercent > 0;
        const inWhiteDwarfShrink = !!this.isBecomingWhiteDwarf;

        if (inRedGiantPhase || inWhiteDwarfShrink) return;

        this.initialRadius = this.radius;
        if (this.mesh) this.mesh.scale.setScalar(1);
    }

    setRadius(newRadius) {
        this.radius = newRadius;

        this._syncBaselineRadiusIfStable();

        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.SphereGeometry(newRadius, 32, 32);

        this.sunGlow.scale.setScalar(newRadius * 4.6);

        if (this.corona) {
            this.corona.setRadius(newRadius + 1);
        }
    }

    setLightDistance(distance) {
        this.sunLight.userData.distance = distance;
        if (this.sunLight.shadow && this.sunLight.shadow.camera) {
            this.sunLight.shadow.camera.far = Math.min(distance * 0.5, 500000);
            this.sunLight.shadow.camera.updateProjectionMatrix();
        }
    }

    die(skipExplosion = false) {
        if (this._isDisposed) return;

        try {
            if (this.birthEffect) {
                this.birthEffect.dispose();
                this.birthEffect = null;
            }
            this.isBirthing = false;
        } catch {
            // ignore
        }

        try {
            if (this.trail) {
                this.trail.visible = false;
                this.scene.remove(this.trail);

                this.trail.geometry?.dispose?.();
                this.trail.material?.dispose?.();
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
                this.mesh.material?.dispose?.();
                this.mesh = null;
            }
        } catch {
            // ignore
        }

        try {
            if (this.corona) {
                this.corona.dispose();
                this.corona = null;
            }
        } catch {
            // ignore
        }

        try {
            if (this.sunGlow) {
                this.sunGlow.visible = false;
                this.scene.remove(this.sunGlow);

                const map = this.sunGlow.material?.map;
                map?.dispose?.();
                this.sunGlow.material?.dispose?.();

                this.sunGlow = null;
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
                    this.sunLight.target = null;
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

    _setBirthVisibility(visible) {
        try {
            if (this.mesh) this.mesh.visible = visible;
            if (this.trail) this.trail.visible = visible;
            if (this.sunGlow) this.sunGlow.visible = visible;
            if (this.corona && this.corona.points) this.corona.points.visible = visible;
            if (this.sunLight) this.sunLight.visible = visible;
            if (this.ambientLight) this.ambientLight.visible = visible;
        } catch {
            // ignore
        }
    }

    _startBirthEffect() {
        if (typeof Star.createStarBirth !== 'function') {
            this._setBirthVisibility(true);
            this.isBirthing = false;
            this.birthEffect = null;
            return;
        }

        try {
            this._setBirthVisibility(false);

            const pos = this.mesh?.position?.clone?.() || new THREE.Vector3();
            const radius = this.radius || 1;
            this.birthEffect = Star.createStarBirth(this.scene, pos, radius);
            this.isBirthing = !!this.birthEffect;
        } catch {
            this.birthEffect = null;
            this.isBirthing = false;
            this._setBirthVisibility(true);
        }
    }

    _updateBirthEffect(dt) {
        if (!this.isBirthing || !this.birthEffect) return;

        try {
            this.birthEffect.update?.(dt);
        } catch {
            try {
                this.birthEffect.dispose();
            } catch {
                // ignore
            }
            this.birthEffect = null;
            this.isBirthing = false;
            this._setBirthVisibility(true);
            return;
        }

        if (this.birthEffect.isComplete) {
            this._setBirthVisibility(true);

            try {
                triggerScreenFlash();
            } catch {
                // ignore
            }

            try {
                this.birthEffect.dispose();
            } catch {
                // ignore
            }

            this.birthEffect = null;
            this.isBirthing = false;
        }
    }
}
