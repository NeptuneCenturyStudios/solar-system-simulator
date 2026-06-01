import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import { DIST_SCALE } from '../utilities/consts';

// ---------------------------------------------------------------------------
// Color palettes inspired by famous real planetary nebulae.
// Each palette has three zones: outer shell, inner ring/disk, and outer halo.
// ---------------------------------------------------------------------------
const PALETTES = [
    // 0 – Helix / Ring Nebula (NGC 7293): red-orange outer, cyan-blue inner
    {
        outer: [0xff2200, 0xff4400, 0xff8800, 0xdd3300],
        inner: [0x00aaff, 0x00ffee, 0x44ddff, 0x0088cc],
        halo:  [0x880011, 0x550000],
    },
    // 1 – Cat's Eye (NGC 6543): vivid teal / green rings
    {
        outer: [0x00ff88, 0x00ee66, 0x22ffaa, 0x00cc55],
        inner: [0x88eeff, 0xaaffee, 0xffffff, 0x66ccff],
        halo:  [0x003322, 0x001a0f],
    },
    // 2 – Butterfly / M2-9: orange-red lobes, electric blue center
    {
        outer: [0xff6600, 0xff4400, 0xdd2200, 0xff5500],
        inner: [0x0088ff, 0x4444ff, 0x8800ff, 0x2200cc],
        halo:  [0x552200, 0x331100],
    },
    // 3 – NGC 7027: electric blue with red-orange wisps
    {
        outer: [0xff4400, 0xff2200, 0xee3300, 0xff6600],
        inner: [0x0044ff, 0x2266ff, 0x6688ff, 0x1133ee],
        halo:  [0x660000, 0x330011],
    },
    // 4 – Eskimo Nebula (NGC 2392): bright green inner, orange outer
    {
        outer: [0xff8800, 0xffaa00, 0xff6600, 0xffcc00],
        inner: [0x00ff44, 0x44ff88, 0x88ffaa, 0x22ee66],
        halo:  [0x553300, 0x441100],
    },
    // 5 – Blue Snowball / Ghost of Jupiter: deep blue, white-blue core
    {
        outer: [0x0022ff, 0x0044ee, 0x2266ff, 0x1155ff],
        inner: [0x88aaff, 0xaabbff, 0xffffff, 0xddeeff],
        halo:  [0x001144, 0x000033],
    },
] as const;

// Shape type identifiers
const SHAPE_SPHERICAL  = 0;   // uniform hollow sphere
const SHAPE_BIPOLAR    = 1;   // two axial lobes (butterfly)
const SHAPE_RING       = 2;   // toroidal / disk-dominant
const SHAPE_ELLIPTICAL = 3;   // squashed sphere

/** Returns a random point on the unit sphere. */
function randomUnitVector(): THREE.Vector3 {
    const theta = Math.random() * Math.PI * 2;
    const phi   = Math.acos(2 * Math.random() - 1);
    return new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta),
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi)
    );
}

export class PlanetaryNebula implements IEffect {
    /**
     * Per-frame opacity multiplier – very slow real-time fade.
     * At 60 fps the half-life is roughly 9–10 minutes of real time,
     * keeping the nebula visible for a long while at any time-scale.
     */
    static readonly COOLDOWN_FADE = 0.99998;

    /**
     * Per-frame speed multiplier.  Nearly 1 so the shell expands at an
     * almost constant velocity, matching the physics of real nebulae.
     */
    static readonly SPEED_LOSS = 0.9998;

    dependencies: IStateDependencies;
    active:       boolean;
    count:        number;
    shapeType:    number;
    scene:        THREE.Scene;
    geometry:     THREE.BufferGeometry;
    material:     THREE.PointsMaterial;
    points:       THREE.Points;
    positions:    Float32Array;
    colors:       Float32Array;
    sizes:        Float32Array;
    velocities:   THREE.Vector3[];
    origin:       THREE.Vector3;
    expandTime:   number;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        pos: THREE.Vector3,
        radius: number,   // star radius at death – seeds particles at the stellar surface
        _mass:  number    // reserved – star mass (can influence palette choice)
    ) {
        this.dependencies = dependencies;
        this.active       = true;
        this.scene        = scene;
        this.origin       = pos.clone();
        this.expandTime   = 0;
        void _mass;

        // ---- Randomise appearance ----------------------------------------
        const paletteIdx = Math.floor(Math.random() * PALETTES.length);
        const palette    = PALETTES[paletteIdx];
        this.shapeType   = Math.floor(Math.random() * 4);

        // Random global orientation – ensures bipolar / ring nebulae appear
        // at varied angles rather than always aligned to world axes.
        const orientation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(
                Math.random() * Math.PI,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI
            )
        );

        // Elliptical squash factor along one axis (0.3 = very flat, 0.85 = almost round)
        const ellipticScale = 0.3 + Math.random() * 0.55;

        // Bipolar cone half-angle (radians): 27°–81°
        const biCone = (0.15 + Math.random() * 0.30) * Math.PI;

        // Physical expansion speed: 15–80 km/s, converted to sim units (÷ DIST_SCALE).
        // At 1× time-scale and 60 fps the `vel * (absDt*60)` update formula means
        // a speed of S sim-units/s translates to S * DIST_SCALE km/s physically.
        const baseSpeed      = (15 + Math.random() * 65) / DIST_SCALE;
        const speedVariation = baseSpeed * 0.30;

        // ---- Particle budget ------------------------------------------------
        this.count        = 12000;
        const innerCount  = 4200;   // bright inner ring / disk
        const outerCount  = 5400;   // main shell / lobes
        // remaining 2400 become outer halo wisps

        this.geometry  = new THREE.BufferGeometry();
        this.positions = new Float32Array(this.count * 3);
        this.colors    = new Float32Array(this.count * 4);
        this.sizes     = new Float32Array(this.count);
        this.velocities = [];

        for (let i = 0; i < this.count; i++) {
            const isInner = i < innerCount;
            const isHalo  = i >= innerCount + outerCount;

            // ---- Velocity direction based on shape --------------------------
            let dir   = new THREE.Vector3();
            let speed = baseSpeed + (Math.random() - 0.5) * speedVariation;

            switch (this.shapeType) {

                case SHAPE_SPHERICAL: {
                    dir = randomUnitVector();
                    if (isInner) speed *= 1.05;
                    break;
                }

                case SHAPE_BIPOLAR: {
                    // 85% go into the two axial lobes; 15% form a thin equatorial disk
                    const equatorial = !isInner && !isHalo && Math.random() < 0.15;
                    if (equatorial) {
                        const theta = Math.random() * Math.PI * 2;
                        dir.set(
                            Math.cos(theta),
                            (Math.random() - 0.5) * 0.12,
                            Math.sin(theta)
                        );
                    } else {
                        const sign      = Math.random() < 0.5 ? 1 : -1;
                        const coneAngle = Math.random() * biCone;
                        const azimuth   = Math.random() * Math.PI * 2;
                        dir.set(
                            Math.sin(coneAngle) * Math.cos(azimuth),
                            sign * Math.cos(coneAngle),
                            Math.sin(coneAngle) * Math.sin(azimuth)
                        );
                        if (isInner) speed *= 1.10;
                    }
                    break;
                }

                case SHAPE_RING: {
                    // 25% sparse outer sphere + 75% concentrated torus
                    const asShell = isHalo || Math.random() < 0.25;
                    if (asShell) {
                        dir = randomUnitVector();
                        speed *= 0.55 + Math.random() * 0.35;
                    } else {
                        const theta  = Math.random() * Math.PI * 2;
                        const spread = 0.16 + Math.random() * 0.14;
                        dir.set(
                            Math.cos(theta),
                            (Math.random() - 0.5) * spread * 2,
                            Math.sin(theta)
                        ).normalize();
                        if (isInner) speed *= 1.08;
                    }
                    break;
                }

                case SHAPE_ELLIPTICAL: {
                    dir = randomUnitVector();
                    dir.y *= ellipticScale;
                    dir.normalize();
                    if (isInner) speed *= 1.05;
                    break;
                }
            }

            // Apply random global orientation
            dir.applyQuaternion(orientation);
            dir.normalize();

            // Seed particle at the stellar surface so the nebula begins
            // already spread to the red giant's radius rather than collapsing
            // from a single point.
            this.positions[i * 3]     = pos.x + dir.x * radius;
            this.positions[i * 3 + 1] = pos.y + dir.y * radius;
            this.positions[i * 3 + 2] = pos.z + dir.z * radius;

            // Final velocity with a small per-particle speed jitter
            const vel = dir.multiplyScalar(speed * (1 + (Math.random() - 0.5) * 0.12));
            this.velocities.push(vel);

            // ---- Color from palette -----------------------------------------
            const hexArr = isInner ? palette.inner : isHalo ? palette.halo : palette.outer;
            const hex    = hexArr[Math.floor(Math.random() * hexArr.length)];
            const col    = new THREE.Color(hex);

            this.colors[i * 4]     = col.r;
            this.colors[i * 4 + 1] = col.g;
            this.colors[i * 4 + 2] = col.b;
            // Halo wisps start semi-transparent; inner ring starts bright
            this.colors[i * 4 + 3] = isHalo
                ? 0.12 + Math.random() * 0.30
                : isInner
                    ? 0.70 + Math.random() * 0.30
                    : 0.55 + Math.random() * 0.40;

            // ---- Particle size ----------------------------------------------
            if (isInner) {
                this.sizes[i] = 16 + Math.random() * 20;   // compact, bright
            } else if (isHalo) {
                this.sizes[i] = 35 + Math.random() * 55;   // large diffuse wisps
            } else {
                this.sizes[i] = 20 + Math.random() * 28;
            }
        }

        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geometry.setAttribute('color',    new THREE.BufferAttribute(this.colors,    4));
        this.geometry.setAttribute('size',     new THREE.BufferAttribute(this.sizes,     1));

        this.material = new THREE.PointsMaterial({
            size:           16,
            vertexColors:   true,
            transparent:    true,
            blending:       THREE.AdditiveBlending,
            opacity:        1.2,
            sizeAttenuation: true,
            depthWrite:     false,
        });

        // Make the default square point into a round, soft-glow sprite.
        // Pattern matches other effects (see ParticleExplosion / SolarFlare).
        this.material.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace(
                'outgoingLight = diffuseColor.rgb;',
                `outgoingLight = diffuseColor.rgb;
                float _d = length(gl_PointCoord - vec2(0.5));
                if (_d > 0.5) discard;
                float _r = _d * 2.0;

                // Softer exponent => wider glow bloom.
                float _glow = pow(1.0 - _r, 0.8);

                // Brighten the core toward white.
                outgoingLight = mix(outgoingLight, vec3(1.0),
                                    pow(max(0.0, 1.0 - _r * 1.2), 2.0));

                // Preserve existing per-particle alpha fade by scaling it with glow.
                diffuseColor.a *= _glow;`
            );
        };
        this.points = new THREE.Points(this.geometry, this.material);
        this.points.frustumCulled = false;
        scene.add(this.points);
    }

    update(dt: number) {
        const absDt = Math.abs(dt);
        this.expandTime += absDt;

        const p         = this.geometry.attributes.position.array as Float32Array;
        const colorAttr = this.geometry.attributes.color.array    as Float32Array;

        let allFaded = true;

        for (let i = 0; i < this.count; i++) {
            // Expand particles outward from origin
            p[i * 3]     += this.velocities[i].x * (absDt * 60);
            p[i * 3 + 1] += this.velocities[i].y * (absDt * 60);
            p[i * 3 + 2] += this.velocities[i].z * (absDt * 60);

            // Minimal deceleration – planetary nebulae expand at nearly constant speed
            this.velocities[i].multiplyScalar(PlanetaryNebula.SPEED_LOSS);

            // Slow opacity fade
            colorAttr[i * 4 + 3] *= PlanetaryNebula.COOLDOWN_FADE;
            if (colorAttr[i * 4 + 3] >= 0.005) {
                allFaded = false;
            } else {
                colorAttr[i * 4 + 3] = 0;
            }
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate    = true;

        if (allFaded) {
            this.active = false;
        }
    }

    dispose() {
        if (this.points?.parent) {
            this.scene.remove(this.points);
        }
        this.geometry?.dispose();
        this.material?.dispose();
    }
}
