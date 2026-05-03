
import * as THREE from 'three';
import { Star, IStarCreationOptions } from './star';
import { IStateDependencies } from '../interfaces';
import { loadSrgbTexture } from '../drawing/textures';
import { BodyTypeEnum, createUniqueId } from '../utilities/utilities';
import { SCALE_FACTOR, PLUTO_DIST, BROWN_DWARF_MASS_THRESHOLD, MIN_BLACK_HOLE_MASS, MIN_NEUTRON_STAR_MASS } from '../utilities/consts';
import { BlackHole } from './black-hole';
import { WhiteDwarf } from './white-dwarf';
//import { Pulsar } from './pulsar';
import { Supernova } from '../effects/supernova';
import { SolarFlare, SolarFlareType } from '../effects/solar-flare';
import { triggerScreenFlash } from '../effects/screen-flash';
import { Corona } from '../effects/corona';
import { StarBirth } from '../effects/star-birth';

export class MainSequenceStar extends Star {
    fuel: number | null;
    maxFuel: number | null;
    initialMass: number;
    initialRadius: number;
    initialColor: THREE.Color;
    isBecomingWhiteDwarf: boolean;
    targetWhiteDwarfRadius: number;
    _pendingBlackHoleFormation: boolean;
    activeSolarFlares: SolarFlare[];
    _solarFlareTimer: number;
    _nextFlareInterval: number;
    corona: Corona | null;
    sunGlow: THREE.Sprite<THREE.Object3DEventMap> | null;
    visualTime: number;
    isBirthing: boolean;
    birthEffect: StarBirth | null;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        options: IStarCreationOptions
    ) {
        const textures = {
            sunTexture: loadSrgbTexture('./assets/textures/sun.jpg'),
            redStarTexture: loadSrgbTexture('./assets/textures/red-star.jpg'),
            orangeStarTexture: loadSrgbTexture('./assets/textures/orange_star.jpg'),
            whiteStarTexture: loadSrgbTexture('./assets/textures/white_star.jpg'),
            blueStarTexture: loadSrgbTexture('./assets/textures/blue-star.jpg'),
            whiteDwarfTexture: loadSrgbTexture('./assets/textures/white_dwarf.jpg'),
            brownDwarfTexture: loadSrgbTexture('./assets/textures/brown_dwarf.jpg'),
        };
        super(dependencies, scene, options, textures);

        this.corona = new Corona(dependencies, scene, options.radius + 1, this.baseColor.getHex());
        this.sunGlow = this.createGlow(options.radius, this.baseColor.getHex());

        this.initialMass = options.mass;
        this.initialRadius = options.radius;
        this.initialColor = this.baseColor.clone();

        this.maxFuel = options.mass * 100000 * SCALE_FACTOR;
        this.fuel = this.maxFuel;

        this.isBecomingWhiteDwarf = false;
        this.targetWhiteDwarfRadius = 8;
        this._pendingBlackHoleFormation = false;

        this.activeSolarFlares = [];
        this._solarFlareTimer = 0;
        this._nextFlareInterval = 5 + Math.random() * 25;

        this.visualTime = 0;
        this.isBirthing = false;
        this.birthEffect = null;

        this._startBirthEffect();

        this.setMass(this.mass);
    }

    override update(acc: THREE.Vector3, dt: number) {
        if (this._isDisposed) return;

        this._updateBirthEffect(dt);
        this.visualTime += dt;

        if (this.corona) {
            this.corona.update(dt);
        }
        if (this.corona?.points) {
            this.corona.points.position.copy(this.mesh.position);
        }

        const starDeathEnabled =
            (document.getElementById('enableStarDeath') as HTMLInputElement)?.checked || false;
        if (starDeathEnabled && this.fuel !== null && this.fuel > 0) {
            const referenceMass = 1000;
            const massRatio = this.mass / referenceMass;
            const burnRate = Math.pow(massRatio, 2.5) * 0.001 * Math.abs(dt);
            this.fuel -= burnRate;

            const fuelPercent = this.maxFuel !== null ? this.fuel / this.maxFuel : 0;

            // Check if star should start expanding into a red giant (only for stars that won't become neutron stars or black holes)
            if (this.initialMass < MIN_NEUTRON_STAR_MASS) {

                // Once fuel drops below 30%, start expanding and cooling into a red giant.
                if (fuelPercent < 0.3 && fuelPercent > 0) {
                    const expansionProgress = 1 - fuelPercent / 0.3;
                    const STAR_MAX_RADIUS = PLUTO_DIST;

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
                    if (this.mesh.material instanceof THREE.MeshPhongMaterial) {
                        this.mesh.material.color.lerp(redGiantColor, 0.01);
                        this.mesh.material.emissive.lerp(redGiantColor, 0.01);

                        const targetIntensity = Star.temperatureToEmissiveIntensity(targetTemp);
                        this.mesh.material.emissiveIntensity =
                            this.mesh.material.emissiveIntensity +
                            (targetIntensity - this.mesh.material.emissiveIntensity) * 0.01;
                    }
                }
            }

            // Finally, if fuel is completely depleted, trigger star death.
            if (this.fuel <= 0) {
                this.fuel = 0;
                this.triggerStarDeath();
            }
        }

        super.update(acc, dt);

        if (this.sunGlow) {
            this.sunGlow.scale.setScalar(
                this.radius * 4.6 + Math.sin(this.visualTime * 0.0015 * 60) * (this.radius * 0.4)
            );
            this.sunGlow.position.copy(this.mesh.position);
        }

        // Solar flare timer
        if (
            !this.isBirthing &&
            !(this.bodyType & BodyTypeEnum.BrownDwarf) &&
            !this._isDisposed
        ) {
            this._solarFlareTimer += dt;
            if (this._solarFlareTimer >= this._nextFlareInterval) {
                this._solarFlareTimer = 0;
                this._nextFlareInterval = 5 + Math.random() * 25;
                this._triggerSolarFlare();
            }
        }

        // Update active solar flares, dispose finished ones
        for (let i = this.activeSolarFlares.length - 1; i >= 0; i--) {
            this.activeSolarFlares[i].update(dt);
            if (!this.activeSolarFlares[i].active) {
                this.activeSolarFlares[i].dispose();
                this.activeSolarFlares.splice(i, 1);
            }
        }
    }

    override setRadius(newRadius: number) {
        super.setRadius(newRadius);
        if (this.corona) {
            this.corona.setRadius(newRadius + 1);
        }
        if (this.sunGlow) {
            this.sunGlow.scale.setScalar(newRadius * 4.6);
        }
        this._syncBaselineRadiusIfStable();
    }

    override die(skipExplosion = false) {
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
            for (const flare of this.activeSolarFlares) {
                flare.dispose();
            }
            this.activeSolarFlares = [];
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
        super.die(skipExplosion);
    }

    override setTemperature(temp: number) {
        super.setTemperature(temp);

        if (this.bodyType & BodyTypeEnum.BrownDwarf) return;

        // Apply temperature-appropriate texture (main-sequence stars change texture bins with temperature)
        let map: THREE.Texture | null;
        if (temp <= 2000)       map = this.textures.brownDwarfTexture;
        else if (temp <= 3000)  map = this.textures.redStarTexture;
        else if (temp < 4000)   map = this.textures.orangeStarTexture;
        else if (temp < 10000)  map = this.textures.sunTexture;
        else if (temp < 25000)  map = this.textures.whiteStarTexture;
        else                    map = this.textures.blueStarTexture;

        if (map) {
            const material = this.mesh.material as THREE.MeshPhongMaterial;
            material.map = map;
            material.emissiveMap = map;
            material.needsUpdate = true;
        }

        // baseColor was already updated by super.setTemperature; reuse it for glow/corona
        const glowHex = this.baseColor.getHex();

        if (this.corona) {
            this.corona.setColor(glowHex);
        }

        if (this.sunGlow && this.sunGlow.material) {
            this.sunGlow.material.color.setHex(glowHex);

            try {
                const oldMap = this.sunGlow.material.map;
                if (oldMap && typeof oldMap.dispose === 'function') oldMap.dispose();

                const newGlow = this.createGlow(this.radius, glowHex);
                if (newGlow) {
                    newGlow.position.copy(this.sunGlow.position);
                    newGlow.scale.copy(this.sunGlow.scale);
                    newGlow.visible = this.sunGlow.visible;
                }
                this.scene.remove(this.sunGlow);
                this.sunGlow = newGlow;
            } catch {
                // ignore
            }
        }
    }

    _setBirthVisibility(visible: boolean) {
        try {
            if (this.mesh) this.mesh.visible = visible;
            if (this.trail) this.trail.visible = visible;
            if (this.sunGlow) this.sunGlow.visible = visible;
            if (this.sunLight) this.sunLight.visible = visible;
            if (this.ambientLight) this.ambientLight.visible = visible;
        } catch {
            // ignore
        }
        try {
            if (this.corona && this.corona.points) this.corona.points.visible = visible;
        } catch {
            // ignore
        }
    }

    override setMass(mass: number) {
        super.setMass(mass);

        if (mass > 0 && mass < BROWN_DWARF_MASS_THRESHOLD) {
            this.transitionToBrownDwarf();
        } else if (mass >= BROWN_DWARF_MASS_THRESHOLD && (this.bodyType & BodyTypeEnum.BrownDwarf)) {
            this.transitionToMainSequence();
            // Fallback temperature for non-edit paths (e.g. black hole siphon).
            // applyEdit always calls setTemperature(sliderTemp) after setMass, which overrides this.
            this.setTemperature(3000);
        }

        // Keep radius in sync with mass whenever not in a special transition phase.
        if (
            !this.isInRedGiantPhase &&
            !this.isBecomingWhiteDwarf &&
            !(this.bodyType & BodyTypeEnum.BrownDwarf) &&
            !(this.bodyType & BodyTypeEnum.WhiteDwarf)
        ) {
            const newRadius = Star.massToRadius(mass);
            if (newRadius > 0 && Math.abs(newRadius - this.radius) / Math.max(this.radius, 1) > 0.005) {
                this.setRadius(newRadius);
            }
        }
    }

    get isInRedGiantPhase(): boolean {
        const fuelActive = this.fuel !== null && this.maxFuel !== null && this.maxFuel > 0;
        const fuelPercent =
            fuelActive && this.maxFuel !== null && this.fuel !== null
                ? this.fuel / this.maxFuel
                : 1;
        return fuelActive && fuelPercent < 0.3 && fuelPercent > 0;
    }

    _syncBaselineRadiusIfStable() {
        if (this.isInRedGiantPhase || this.isBecomingWhiteDwarf) return;

        this.initialRadius = this.radius;
        if (this.mesh) this.mesh.scale.setScalar(1);
    }

    createGlow(radius: number, glowHex = 0xffffcc) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

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

    createStarBirth(scene: THREE.Scene, pos: THREE.Vector3, radius: number) {
        return new StarBirth(this.dependencies, scene, pos, radius);
    }

    _startBirthEffect() {
        try {
            this._setBirthVisibility(false);

            const pos = this.mesh?.position?.clone?.() || new THREE.Vector3();
            const radius = this.radius || 1;
            this.birthEffect = this.createStarBirth(this.scene, pos, radius);
            this.isBirthing = !!this.birthEffect;
        } catch {
            this.birthEffect = null;
            this.isBirthing = false;
            this._setBirthVisibility(true);
        }
    }

    _updateBirthEffect(dt: number) {
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

    _triggerSolarFlare() {
        if (!this.mesh || this._isDisposed) return;

        // 75% small cone burst, 25% large arc loop
        const type: SolarFlareType = Math.random() < 0.75 ? 'small' : 'large';
        const colorHex = this.baseColor.getHex();

        try {
            const flare = new SolarFlare(
                this.dependencies,
                this.scene,
                this.mesh.position,
                this.radius,
                type,
                colorHex
            );
            this.activeSolarFlares.push(flare);

            if (type === 'large' && this.dependencies?.addEvent) {
                this.dependencies.addEvent(`Solar flare erupts on ${this.name}!`);
            }
        } catch (e) {
            console.error('Error triggering solar flare:', e);
        }
    }

    createSupernova(pos: THREE.Vector3, radius: number, shouldCollapse: boolean) {
        const supernova = new Supernova(this.dependencies, this.scene, pos, radius, shouldCollapse);
        this.dependencies.addSupernova(supernova);
        return supernova;
    }

    triggerStarDeath() {
        if (this.initialMass > MIN_NEUTRON_STAR_MASS) {
            try {
                this.createSupernova(this.mesh.position.clone(), this.radius, false);
            } catch (e) {
                console.error('Error creating supernova:', e);
            }

            try {
                triggerScreenFlash();
            } catch (e) {
                console.error('Error triggering screen flash:', e);
            }
        }

        if (this.initialMass > MIN_NEUTRON_STAR_MASS && this.initialMass < MIN_BLACK_HOLE_MASS) {
            try {
                // TODO: Create pulsar instance

                // TODO: Uncomment when pulsar is implemented
                // if (this.dependencies?.addBody) {
                //     this.dependencies.addBody(pulsar);
                // }

                // if (this.dependencies?.addEvent) {
                //     this.dependencies.addEvent(`Pulsar formed from ${this.name}!`);
                // }
            } catch (e) {
                console.error('Error creating neutron star:', e);
            }

            this.die(true);
        }
        if (this.initialMass >= MIN_BLACK_HOLE_MASS) {
            try {
                const blackHoleMass = this.mass * 0.9999;
                const newBlackHole = new BlackHole(
                    this.dependencies,
                    this.scene,
                    this.mesh.position.clone(),
                    blackHoleMass,
                    createUniqueId('blackhole'),
                    'Black Hole',
                    this.rotation,
                    true
                );

                if (this.dependencies?.addBody) {
                    this.dependencies.addBody(newBlackHole);
                }

                if (this.dependencies?.addEvent) {
                    this.dependencies.addEvent(`Black Hole formed from ${this.name}!`);
                }
            } catch (e) {
                console.error('Error creating black hole:', e);
            }

            this.die(true);
        } else {
            try {
                const newWhiteDwarf = new WhiteDwarf(
                    this.dependencies,
                    this.scene,
                    this.mesh.position.clone(),
                    this.mass,
                    createUniqueId('whitedwarf'),
                    this.name + ' (White Dwarf)',
                    this.rotation
                );

                if (this.dependencies?.addBody) {
                    this.dependencies.addBody(newWhiteDwarf);
                }

                if (this.dependencies?.addEvent) {
                    this.dependencies.addEvent(`White Dwarf formed from ${this.name}!`);
                }
            } catch (e) {
                console.error('Error creating white dwarf:', e);
            }

            this.die(true);
        }
    }

    /** Transitions this star into a brown dwarf, applying its texture and removing stellar effects. */
    transitionToBrownDwarf() {
        if (this.bodyType & BodyTypeEnum.BrownDwarf) return; // already transitioned

        // Call before setting the BrownDwarf flag so the guard in setTemperature doesn't block it.
        this.setTemperature(1000);

        this.bodyType |= BodyTypeEnum.BrownDwarf;

        if (this.corona) {
            this.corona.dispose();
            this.corona = null;
        }

        if (this.sunGlow) {
            this.scene.remove(this.sunGlow);
            this.sunGlow = null;
        }

        if (this.sunLight) {
            this.sunLight.intensity = 0.002;
            this.sunLight.color.setHex(0xff6020);
        }

        this.fuel = null;
        this.maxFuel = null;

        if (!this.name.includes('(Brown Dwarf)')) {
            this.name = this.name + ' (Brown Dwarf)';
            this.updateLabel(this.name);
        }
    }

    /** Reverts a brown dwarf back to a main-sequence star. Temperature must be set by the caller afterwards. */
    transitionToMainSequence() {
        if (!(this.bodyType & BodyTypeEnum.BrownDwarf)) return; // not a brown dwarf

        // Clear the flag before any setTemperature call so the guard won't block it.
        this.bodyType &= ~BodyTypeEnum.BrownDwarf;

        // Restore fuel proportional to current mass.
        this.maxFuel = this.mass * 100000 * SCALE_FACTOR;
        this.fuel = this.maxFuel;

        // Restore corona.
        if (!this.corona) {
            this.corona = new Corona(this.dependencies, this.scene, this.radius + 1, this.baseColor.getHex());
        }

        // Restore glow.
        if (!this.sunGlow) {
            this.sunGlow = this.createGlow(this.radius, this.baseColor.getHex());
        }

        // Restore light intensity.
        if (this.sunLight) {
            this.sunLight.intensity = Math.max(1.0, this.lightIntensity / 20000000);
            this.sunLight.color.setHex(0xffffff);
        }

        // Strip the suffix from the name if present.
        if (this.name.includes(' (Brown Dwarf)')) {
            this.name = this.name.replace(' (Brown Dwarf)', '');
            this.updateLabel(this.name);
        }
    }
}

