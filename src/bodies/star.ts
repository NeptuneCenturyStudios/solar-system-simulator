import * as THREE from 'three';
import { SHADOW_MAP_SIZE, SUN_MASS, SCALE_FACTOR } from '../utilities/consts.js';
import { BodyType, isBodyType } from '../utilities/utilities.js';
import { CelestialBody } from './celestial-body.js';
import { BlackHole } from './black-hole.js';
import { triggerScreenFlash } from '../effects/screen-flash.js';

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
     * @param {object} opti ons
     * @param {number} options.radius
     * @param {THREE.Vector3} options.pos
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
        dependencies,
        scene,
        {
            radius,
            pos,
            mass,
            id = 'camSun',
            name = 'Sun',
            temperature = 5778,
            lightIntensity = 500000000,
            lightDistance = 524400,
        },
        textures
    ) {
        if (!textures) {
            throw new Error('Star requires textures to be injected');
        }

        // Surface color comes from temperature bins (used mostly for glow/light tint).
        const color = Star.temperatureToColor(temperature);

        // Star-specific material:
        // Use MeshPhongMaterial so emissive doesn't wash out map as aggressively as MeshStandardMaterial.
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
            radius,
            color,
            pos,
            new THREE.Vector3(0, 0, 0), // Stars start static; initial velocity is zero
            mass,
            id,
            name,
            BodyType.Star,
            0xffffff,
            500,
            false,
            false,
            false,
            { axis: [0, 1, 0], speed: 0.08 },
            null,
            starMaterial
        );

        // Keep references for death-effects that need to talk to the broader sim.
        this.dependencies = dependencies;
        this.textures = textures;

        // Preserve creation-time light intensity for edit-mode repopulation.
        this.lightIntensity = lightIntensity;
        this._lightIntensity = lightIntensity;

        // --- Stellar evolution (only stars) ---
        this.initialMass = mass;
        this.initialRadius = radius;
        this.initialColor = new THREE.Color(color);
        this.temperature = temperature;

        // Fuel system: larger stars get more fuel but burn it faster
        this.maxFuel = mass * 100000;
        this.fuel = this.maxFuel;

        // White dwarf transformation state
        this.isBecomingWhiteDwarf = false;
        this.targetWhiteDwarfRadius = 8; // Earth-sized
        this._pendingBlackHoleFormation = false;

        // Star surface is driven by emissiveMap, so keep it uniformly visible.
        this.mesh.material.emissive.setHex(0xffffff);
        this.mesh.material.emissiveIntensity = 1.0;

        // Create corona + glow + light (all scene-owned)
        this.corona = this.createCorona(radius + 1);
        this.sunGlow = this.createGlow(radius, this.baseColor.getHex());
        this.sunLight = this.createLight(pos, lightIntensity, lightDistance);

        // Add ambient light (only once per Star instance)
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.05);
        scene.add(this.ambientLight);

        // Visual time accumulator (simulation-time, affected by timeScale and pause)
        // Used for purely-visual animations that should obey time warp (e.g. glow pulsing).
        this.visualTime = 0;

        // Apply temperature binning after construction so map/glow/light match
        this.setTemperature(temperature);

        // Start "star birth" effect on every star creation (including initial Sun).
        this.birthEffect = null;
        this.isBirthing = false;
        this._startBirthEffect();
    }

    // --- Static helpers (ported from main.js) ---

    /**
     * Convert star temperature (Kelvin) to RGB color.
     * Based on black body radiation approximation with adjustments for dramatic effect.
     * @param {number} temp
     * @returns {number} hex
     */
    static temperatureToColor(temp) {
        // Clamp temperature to reasonable range
        temp = Math.max(1000, Math.min(40000, temp));

        // Divide by 100 for algorithm
        temp = temp / 100;

        let red, green, blue;

        // Calculate red
        if (temp <= 66) {
            red = 255;
        } else {
            red = temp - 60;
            red = 329.698727446 * Math.pow(red, -0.1332047592);
            red = Math.max(0, Math.min(255, red));

            // Reduce red at very high temperatures for bluer appearance
            if (temp > 80) {
                const redReduction = (temp - 80) / 320;
                red = red * (1 - redReduction * 0.5);
            }
        }

        // Calculate green - reduce for cooler temps to emphasize red
        if (temp <= 66) {
            green = temp;
            green = 99.4708025861 * Math.log(green) - 161.1195681661;
            green = Math.max(0, Math.min(255, green));

            // Dramatically reduce green at low temperatures for redder appearance
            if (temp < 40) {
                const greenReduction = (40 - temp) / 40;
                green = green * (1 - greenReduction * 0.7);
            }
        } else {
            green = temp - 60;
            green = 288.1221695283 * Math.pow(green, -0.0755148492);
            green = Math.max(0, Math.min(255, green));

            // Reduce green at very high temperatures for bluer appearance
            if (temp > 80) {
                const greenReduction = (temp - 80) / 320;
                green = green * (1 - greenReduction * 0.6);
            }
        }

        // Calculate blue - further reduce at low temps
        if (temp >= 66) {
            blue = 255;
        } else if (temp <= 19) {
            blue = 0;
        } else {
            blue = temp - 10;
            blue = 138.5177312231 * Math.log(blue) - 305.0447927307;
            blue = Math.max(0, Math.min(255, blue));

            // Reduce blue even more at low temperatures
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

    /**
     * Calculate emissive intensity based on temperature.
     * Creates a curve: low at cool temps, peaks at mid temps (sun), lower at hot temps.
     * @param {number} temp
     * @returns {number}
     */
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

    // --- Instance visuals ---

    createCorona(radius) {
        const count = 1500;
        const geo = new THREE.BufferGeometry();
        const pArr = new Float32Array(count * 3);
        const lives = new Float32Array(count);
        const lifeIncrements = new Float32Array(count);
        const vels = [];

        // Scale corona properties with Sun size (original Sun radius was 80)
        const scaleFactor = radius / 80;
        const particleSize = 3.5 * scaleFactor;
        const baseVelocity = 0.15 * scaleFactor;
        const velocityVariation = 0.25 * scaleFactor;

        // Create coronaObj first so resetParticle can reference it
        const coronaObj = {
            points: null,
            count,
            pArr,
            lives,
            lifeIncrements,
            vels,
            radius,
            baseVelocity,
            velocityVariation,
            resetParticle: null,
        };

        const resetParticle = (i) => {
            const phi = Math.random() * Math.PI * 2;
            const theta = Math.random() * Math.PI;

            const currentRadius = coronaObj.radius;
            const isReverse = lives[i] <= 0.0;

            if (isReverse) {
                const d = currentRadius * (1.2 + Math.random() * 0.8);
                pArr[i * 3] = d * Math.sin(theta) * Math.cos(phi);
                pArr[i * 3 + 1] = d * Math.sin(theta) * Math.sin(phi);
                pArr[i * 3 + 2] = d * Math.cos(theta);
                lives[i] = 1;
                lifeIncrements[i] = 0.007 * (0.7 + Math.random() * 0.6);

                const baseVel = coronaObj.baseVelocity || 0.15 * (currentRadius / 80);
                const velVar = coronaObj.velocityVariation || 0.25 * (currentRadius / 80);
                vels[i] = new THREE.Vector3(pArr[i * 3], pArr[i * 3 + 1], pArr[i * 3 + 2])
                    .normalize()
                    .multiplyScalar(baseVel + Math.random() * velVar);
            } else {
                const d = currentRadius * 0.98;
                pArr[i * 3] = d * Math.sin(theta) * Math.cos(phi);
                pArr[i * 3 + 1] = d * Math.sin(theta) * Math.sin(phi);
                pArr[i * 3 + 2] = d * Math.cos(theta);
                lives[i] = 0;
                lifeIncrements[i] = 0.007 * (0.7 + Math.random() * 0.6);

                const baseVel = coronaObj.baseVelocity || 0.15 * (currentRadius / 80);
                const velVar = coronaObj.velocityVariation || 0.25 * (currentRadius / 80);
                vels[i] = new THREE.Vector3(pArr[i * 3], pArr[i * 3 + 1], pArr[i * 3 + 2])
                    .normalize()
                    .multiplyScalar(baseVel + Math.random() * velVar);
            }
        };

        coronaObj.resetParticle = resetParticle;

        for (let i = 0; i < count; i++) {
            resetParticle(i);
            lives[i] = Math.random();
        }

        geo.setAttribute('position', new THREE.BufferAttribute(pArr, 3));

        const mat = new THREE.PointsMaterial({
            color: 0xfffff0,
            size: particleSize,
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 0.7,
        });
        const points = new THREE.Points(geo, mat);
        this.scene.add(points);

        coronaObj.points = points;
        return coronaObj;
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
        const light = new THREE.DirectionalLight(0xfffff0, Math.max(1.0, intensity / 100000000));
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

    updateCorona(dt) {
        // Corona motion should fully obey time warp:
        // - dt = 0 => frozen (including no particle resets)
        // - dt < 0 => reverse
        //
        // NOTE: dt might be a tiny non-zero value even when UI shows "paused"
        // due to floating point / stepping logic. Use timeScale as the source of truth.
        //
        // IMPORTANT: during collapse-to-black-hole we dispose corona/mesh/etc in `die()`.
        // The sim may still call `update()` for one more frame, so guard all corona access.
        if (!this.corona || !this.corona.points) return;

        const tScale = typeof window !== 'undefined' ? window.timeScale : 1;
        if (!dt || tScale === 0) return;

        const p = this.corona.points.geometry.attributes.position.array;
        for (let i = 0; i < this.corona.count; i++) {
            this.corona.lives[i] += this.corona.lifeIncrements[i] * (dt * 60);
            p[i * 3] += this.corona.vels[i].x * (dt * 60);
            p[i * 3 + 1] += this.corona.vels[i].y * (dt * 60);
            p[i * 3 + 2] += this.corona.vels[i].z * (dt * 60);
            if (this.corona.lives[i] >= 1.0 || this.corona.lives[i] <= 0.0) {
                this.corona.resetParticle(i);
            }
        }
        this.corona.points.geometry.attributes.position.needsUpdate = true;
    }

    update(acc, dt, _now) {
        if (this._isDisposed) return;

        // Star-birth effect is star-owned (created on construction).
        // Update it before other visuals so hidden state stays consistent.
        this._updateBirthEffect(dt);

        // Advance simulation-time visual clock (obeys timeScale and pause)
        // Note: keep signed dt so reverse time reverses the pulse phase too.
        this.visualTime += dt;

        // Natural star death system (stars only)
        const starDeathEnabled = document.getElementById('enableStarDeath')?.checked || false;
        if (starDeathEnabled && this.fuel !== null && this.fuel > 0) {
            const referenceMass = 1000;
            const massRatio = this.mass / referenceMass;
            const burnRate = Math.pow(massRatio, 2.5) * 0.001 * Math.abs(dt);
            this.fuel -= burnRate;

            const fuelPercent = this.fuel / this.maxFuel;
            const isMassiveStar = this.initialMass > SUN_MASS * 3.3;

            if (!isMassiveStar) {
                // Red giant phase
                if (fuelPercent < 0.3 && fuelPercent > 0) {
                    const expansionProgress = 1 - fuelPercent / 0.3;

                    // IMPORTANT:
                    // Star absorption can grow the star before it enters the red-giant window.
                    // Red-giant expansion is relative to `initialRadius`, so we must clamp the
                    // visual size to avoid screen-filling glitches at extreme scales.
                    //
                    // Clamp target radius to a "world sane" maximum. This matches the cap used in main.js
                    // (PLUTO_DIST + 300000), but we keep it local to Star to avoid const import cycles.
                    const STAR_MAX_RADIUS = 600000 * SCALE_FACTOR; // world units; tuned to stay within the playable system

                    const targetRadiusUnclamped = this.initialRadius * (1 + expansionProgress * 99);
                    const targetRadius = Math.min(targetRadiusUnclamped, STAR_MAX_RADIUS);

                    // During red-giant expansion we must update the *physics/collision* radius AND
                    // keep the rendered mesh in sync.
                    //
                    // Previously we only scaled the mesh, but collision detection uses `body.radius`,
                    // and absorption/`setRadius()` rebuilds geometry. Mixing "scale" + "geometry radius"
                    // causes mismatches (missed collisions) and also makes glow/corona look wrong.
                    //
                    // Fix: rebuild geometry via `setRadius()` so mesh+radius stay consistent.
                    //
                    // IMPORTANT: red-giant expansion must obey pause/timeScale.
                    // When dt === 0 (paused), do not change radius (otherwise corona appears to move
                    // due to radius-driven updates even if particle velocities are frozen).
                    if (dt !== 0) {
                        this.radius = this.radius + (targetRadius - this.radius) * 0.01;
                        this.setRadius(this.radius);
                    }

                    const targetMass = this.initialMass * (1 - expansionProgress * 0.5);
                    this.mass = this.mass + (targetMass - this.mass) * 0.01;

                    if (this.corona) {
                        this.corona.radius = this.radius;
                        const scaleFactor = this.radius / 80;
                        const particleSize = 3.5 * scaleFactor;
                        this.corona.baseVelocity = 0.15 * scaleFactor;
                        this.corona.velocityVariation = 0.25 * scaleFactor;
                        if (this.corona.points && this.corona.points.material) {
                            this.corona.points.material.size = particleSize;
                        }
                    }

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

        // Handle gradual white dwarf shrinking
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

        // Apply physics
        super.update(acc, dt);

        // Update corona + glow + light follow
        this.updateCorona(dt);

        // Keep glow size synced to the actual star radius (do not assume mesh.scale tricks).
        // Use simulation-time so the pulse obeys pause/timeScale/reverse.
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
            // Massive star: collapse -> black hole
            try {
                // Spawn collapse visual (if main.js injected it)
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

            // Spawn black hole
            try {
                const blackHoleMass = this.mass * 0.9999;
                const uniqueBHId = `blackHole_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
                const newBlackHole = new BlackHole(
                    this.dependencies,
                    this.scene,
                    this.mesh.position,
                    blackHoleMass,
                    uniqueBHId,
                    'Black Hole'
                );

                if (this.dependencies?.addBody) {
                    this.dependencies.addBody(newBlackHole);
                } else if (typeof window !== 'undefined' && Array.isArray(window.bodies)) {
                    // Fallback for older builds; prefer dependencies.addBody so the sim loop updates it.
                    window.bodies.push(newBlackHole);
                }

                if (this.dependencies?.addEvent) {
                    this.dependencies.addEvent(`Black Hole formed from ${this.name}!`);
                }
            } catch {
                // ignore
            }

            // Remove this star without triggering another explosion path.
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

            if (this.corona && this.corona.points) {
                this.corona.points.visible = false;
                this.scene.remove(this.corona.points);
            }

            if (this.sunGlow) {
                this.sunGlow.visible = false;
                this.scene.remove(this.sunGlow);
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

        // If this is no longer a star (e.g. it became a white dwarf remnant),
        // do not override its surface texture.
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

        if (this.corona && this.corona.points && this.corona.points.material) {
            this.corona.points.material.color.setHex(glowHex);
        }

        if (this.sunLight) {
            this.sunLight.color.setHex(glowHex);
        }
    }

    /**
     * Keep the "main-sequence baseline" radius in sync when external systems (absorption / UI edit)
     * change the star's radius.
     *
     * Red giant evolution expands relative to `initialRadius`, so if absorption grows the star but
     * `initialRadius` stays at its spawn value, the red giant multiplier can produce extreme / glitchy
     * visuals due to baseline mismatch.
     *
     * We only sync the baseline when the star is NOT already evolving (red giant or shrinking into
     * a white dwarf), so ongoing transitions remain smooth.
     */
    _syncBaselineRadiusIfStable() {
        // If fuel system is disabled for this star (fuel == null), treat it as stable.
        // If active, treat fuelPercent < 0.3 as the red-giant expansion window.
        const fuelActive = this.fuel !== null && this.maxFuel !== null && this.maxFuel > 0;
        const fuelPercent = fuelActive ? this.fuel / this.maxFuel : 1;

        const inRedGiantPhase = fuelActive && fuelPercent < 0.3 && fuelPercent > 0;
        const inWhiteDwarfShrink = !!this.isBecomingWhiteDwarf;

        if (inRedGiantPhase || inWhiteDwarfShrink) return;

        // Geometry will be rebuilt to match `this.radius`, so baseline should match as well,
        // and mesh scaling should be reset to identity.
        this.initialRadius = this.radius;
        if (this.mesh) this.mesh.scale.setScalar(1);
    }

    setRadius(newRadius) {
        this.radius = newRadius;

        // If we're being resized by absorption or UI while still in the stable main sequence,
        // update the baseline radius used by red-giant expansion.
        this._syncBaselineRadiusIfStable();

        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.SphereGeometry(newRadius, 32, 32);

        this.sunGlow.scale.setScalar(newRadius * 4.6);

        // Only remove/dispose the old corona points if we are about to rebuild it.
        // (Most radius changes should keep the existing corona so it doesn't "pop" out.)
        const prevCoronaPoints = this.corona?.points || null;
        const prevCoronaGeo = prevCoronaPoints?.geometry || null;
        const prevCoronaMat = prevCoronaPoints?.material || null;
        const shouldRebuildCorona = !this.corona || !this.corona.points;

        if (shouldRebuildCorona && prevCoronaPoints) {
            this.scene.remove(prevCoronaPoints);
            prevCoronaGeo?.dispose?.();
            prevCoronaMat?.dispose?.();
        }

        // IMPORTANT:
        // In red-giant phase we call setRadius() frequently. Recreating the corona each time resets all
        // particle positions/lives, which looks like it’s “moving” even when paused / slowed.
        //
        // Correct behavior:
        // - When dt is 0 (paused), particles must not drift.
        // - Time warp (including reverse) must scale particle motion.
        // - Red-giant resizing should not “re-randomize” the corona.
        //
        // Approach:
        // - Preserve the existing corona object when possible (fast path).
        // - Only rebuild if count changes or if the corona doesn't exist.
        if (this.corona && this.corona.points) {
            const prevRadius = this.corona.radius;
            this.corona.radius = newRadius + 1;

            // Update size/vel params to match new scale
            const scaleFactor = this.corona.radius / 80;
            this.corona.baseVelocity = 0.15 * scaleFactor;
            this.corona.velocityVariation = 0.25 * scaleFactor;
            if (this.corona.points.material) this.corona.points.material.size = 3.5 * scaleFactor;

            // Scale particle positions outward/inward so the corona grows with the star.
            // IMPORTANT:
            // - During red-giant phase we call setRadius() frequently even when paused (timeScale=0),
            //   because the red-giant expansion code is dt-independent.
            // - When paused, particles must freeze in place. So we must NOT rescale particle positions
            //   while timeScale is 0.
            //
            // We don't have dt available in setRadius(), so we use the global timeScale alias
            // (main.js exposes it via Object.defineProperty(window,'timeScale',...)).
            const tScale = typeof window !== 'undefined' ? window.timeScale : 1;
            if (tScale !== 0) {
                const s = this.corona.radius / prevRadius;
                if (Number.isFinite(s) && s > 0 && s !== 1) {
                    for (let i = 0; i < this.corona.count; i++) {
                        this.corona.pArr[i * 3] *= s;
                        this.corona.pArr[i * 3 + 1] *= s;
                        this.corona.pArr[i * 3 + 2] *= s;
                    }
                    this.corona.points.geometry.attributes.position.needsUpdate = true;
                }
            }
        } else {
            this.corona = this.createCorona(newRadius + 1);
        }
    }

    setLightDistance(distance) {
        this.sunLight.userData.distance = distance;
        if (this.sunLight.shadow && this.sunLight.shadow.camera) {
            this.sunLight.shadow.camera.far = Math.min(distance * 0.5, 500000);
            this.sunLight.shadow.camera.updateProjectionMatrix();
        }
    }

    /**
     * Note: star death visuals/black hole spawning remain in main.js.
     * This method only removes star-owned scene objects and then calls base die().
     */
    die(skipExplosion = false) {
        if (this._isDisposed) return;

        // If the star dies mid-birth, the star owns the effect and must clean it up.
        try {
            if (this.birthEffect) {
                this.birthEffect.cleanup?.();
                this.birthEffect = null;
            }
            this.isBirthing = false;
        } catch {
            // ignore
        }

        // Remove + dispose star-owned scene objects (single cleanup path)
        //
        // NOTE: do NOT dispose injected star surface textures (sunTexture/redStarTexture/etc).
        // Those are owned/loaded by main.js and may be shared across stars.
        try {
            if (this.trail) {
                this.trail.visible = false;
                this.scene.remove(this.trail);

                // Trails are created by CelestialBody; try to dispose safely (if it's not reused).
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

                // Dispose geometry/material; this star owns its MeshPhongMaterial instance.
                this.mesh.geometry?.dispose?.();
                this.mesh.material?.dispose?.();
                this.mesh = null;
            }
        } catch {
            // ignore
        }

        try {
            if (this.corona?.points) {
                this.corona.points.visible = false;
                this.scene.remove(this.corona.points);

                // Corona is star-owned.
                this.corona.points.geometry?.dispose?.();
                this.corona.points.material?.dispose?.();

                this.corona.points = null;
            }
        } catch {
            // ignore
        }

        // Corona object holds references to typed arrays/vels; release it for GC.
        try {
            if (this.corona) this.corona = null;
        } catch {
            // ignore
        }

        try {
            if (this.sunGlow) {
                this.sunGlow.visible = false;
                this.scene.remove(this.sunGlow);

                // Glow is star-owned. Dispose sprite material + the canvas texture map.
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

                // Light target is a separate Object3D that was added to the scene.
                if (this.sunLight.target) {
                    this.scene.remove(this.sunLight.target);
                    this.sunLight.target = null;
                }

                // Defensive: dispose shadow map resources if any exist (Three will recreate if needed).
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

        // We intentionally do NOT create explosion here; main.js handles supernova/black hole visuals.
        if (!skipExplosion) {
            try {
                triggerScreenFlash();
            } catch {
                // ignore
            }
        }

        super.die(true);
    }

    // --- Star birth effect ownership ---

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
        // Always run for every star creation.
        // If the factory isn't wired (older build), fall back to being visible.
        if (typeof Star.createStarBirth !== 'function') {
            this._setBirthVisibility(true);
            this.isBirthing = false;
            this.birthEffect = null;
            return;
        }

        try {
            this._setBirthVisibility(false);
            console.log(`Starting birth effect for star ${this.name}`);
            const pos = this.mesh?.position?.clone?.() || new THREE.Vector3(0,0,0);
            const radius = this.radius || 1;
            this.birthEffect = Star.createStarBirth(this.scene, pos, radius);
            this.isBirthing = !!this.birthEffect;
        } catch {
            // If anything fails, ensure the star remains visible
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
            // If the effect breaks, stop owning it and restore visibility.
            try {
                this.birthEffect.cleanup?.();
            } catch {
                // ignore
            }
            this.birthEffect = null;
            this.isBirthing = false;
            this._setBirthVisibility(true);
            return;
        }

        if (this.birthEffect.isComplete) {
            // Restore this star’s visuals
            this._setBirthVisibility(true);

            // Flash when star is born
            try {
                triggerScreenFlash();
            } catch {
                // ignore
            }

            try {
                this.birthEffect.cleanup?.();
            } catch {
                // ignore
            }

            this.birthEffect = null;
            this.isBirthing = false;
        }
    }
}
