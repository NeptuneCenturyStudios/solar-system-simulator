import * as THREE from 'three';

import { DEFAULT_COMET_TAIL_COLOR, SCALE_FACTOR } from '../utilities/consts.js';
import { BodyTypeEnum } from './body-enums.js';
import { CelestialBody } from './celestial-body';
import { ICometCreationOptions, IDeathOptions, IStateDependencies } from '../interfaces.js';
import { settingsStore } from '../settings/settings-store.js';

/**
 * This class represents a comet, which is a type of celestial body with a nucleus and a tail. The tail is created using a particle system that emits particles in the opposite direction
 * of the comet's velocity. The comet's nucleus is represented as a distorted icosahedron to give it an irregular shape.
 */
/**
 * Represents a comet in the simulation, including its nucleus and particle tail.
 * Inherits from CelestialBody and adds comet-specific tail rendering and logic.
 */
export abstract class Comet extends CelestialBody {
    private tailCount: number;
    private tailGeo: THREE.BufferGeometry | null;
    private tailMat: THREE.PointsMaterial | null;
    private tailParticles: THREE.Points | null;
    // Float64 simulation state — keeps world positions precise regardless of distance from origin
    private tailPx: Float64Array | null;
    private tailPy: Float64Array | null;
    private tailPz: Float64Array | null;
    // Float32 scratch buffer written every frame as camera-relative offsets for the GPU
    private tailGpuBuf: Float32Array | null;
    private tailColors: Float32Array | null;
    private tailOpacities: Float32Array | null;
    private tailVelocities: { life: number; lifeIncrement: number; vel: THREE.Vector3 }[] | null;
    private tailColorMain: THREE.Color;
    /** Fraction of tail particles that take the comet's main tail color (vs white). */
    private static readonly COLORED_PARTICLE_RATIO = 0.8;

    /**
     * Constructs a new Comet with a nucleus and initializes its tail particle system.
     * @param deps State dependencies for the simulation.
     * @param scene The THREE.Scene to which the comet belongs.
     * @param options Creation options for the comet.
     * @param material The material used for rendering the comet nucleus.
     */
    constructor(
        deps: IStateDependencies,
        scene: THREE.Scene,
        options: ICometCreationOptions
    ) {
        super(
            deps,
            scene,
            options.radius,
            0x888888,
            options.pos,
            options.vel,
            options.mass,
            options.id,
            options.name,
            BodyTypeEnum.Comet,
            options.trailColor ?? 0xaaaaaa,
            options.maxTrail ?? 2000,
            false,
            options.rotation,
            options.mesh
        );

        this.tailCount = 1200;
        this.tailGeo = new THREE.BufferGeometry();
        this.tailPx = new Float64Array(this.tailCount);
        this.tailPy = new Float64Array(this.tailCount);
        this.tailPz = new Float64Array(this.tailCount);
        this.tailGpuBuf = new Float32Array(this.tailCount * 3);
        this.tailColors = new Float32Array(this.tailCount * 3);
        this.tailOpacities = new Float32Array(this.tailCount);
        this.tailVelocities = [];
        this.tailColorMain = new THREE.Color(options.tailColor ?? DEFAULT_COMET_TAIL_COLOR);

        // Direction away from sun for initial tail positioning
        const awayFromSun = new THREE.Vector3(
            options.pos.x,
            options.pos.y,
            options.pos.z
        ).normalize();

        for (let i = 0; i < this.tailCount; i++) {
            // Create velocity vector — direction will be refreshed on first death anyway
            const velVec = awayFromSun
                .clone()
                .multiplyScalar(0.3 + Math.random() * 0.4)
                .add(
                    new THREE.Vector3(
                        (Math.random() - 0.5) * 0.2,
                        (Math.random() - 0.5) * 0.2,
                        (Math.random() - 0.5) * 0.2
                    )
                );

            // Offsets from the nucleus, not world positions — updateTail will properly
            // bootstrap every particle on the first call (life = 1.001 → all die immediately).
            this.tailPx[i] = options.pos.x;
            this.tailPy[i] = options.pos.y;
            this.tailPz[i] = options.pos.z;

            const colorIdx = i * 3;
            const color = this.generateTailParticleColor();
            this.tailColors[colorIdx] = color.r;
            this.tailColors[colorIdx + 1] = color.g;
            this.tailColors[colorIdx + 2] = color.b;

            // life > 1.0 ensures every particle dies on the very first updateTail call and gets
            // correctly bootstrapped at the comet's actual position with the properly computed
            // lifeIncrement.  Previously life was Math.random() (0–1) with lifeIncrement=0.001,
            // meaning a particle at life=0 needed 62,500 frames (~17 min at timeScale=1) to die
            // and reset — leaving half the particles frozen near the spawn position for ages.
            this.tailVelocities[i] = { life: 1.001, lifeIncrement: 0.001, vel: velVec };
        }

        // Initialize tailOpacities to 0 so the life attribute starts quiet
        this.tailOpacities.fill(0);

        this.tailGeo.setAttribute('position', new THREE.BufferAttribute(this.tailGpuBuf, 3));
        this.tailGeo.setAttribute('color', new THREE.BufferAttribute(this.tailColors, 3));
        // Per-particle life/opacity passed as a custom attribute so the shader can
        // produce smooth circular discs with radial falloff and life-based fade —
        // identical pattern to the sun corona shader.
        this.tailGeo.setAttribute('life', new THREE.BufferAttribute(this.tailOpacities, 1));

        this.tailMat = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 5,
            transparent: true,
            opacity: 1.0, // per-fragment alpha comes from the shader
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            vertexColors: true,
        });

        // Inject GLSL to turn each point into a soft circular disc that fades with `life`.
        // `life` here is the pre-computed per-particle opacity (0 = dead/dim, 1 = peak brightness).
        this.tailMat.onBeforeCompile = (shader) => {
            // Vertex shader: forward life to fragment stage
            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
attribute float life;
varying float vLife;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                'void main() {',
                `void main() {
vLife = life;`
            );
            // Fragment shader: receive life, compute circular soft disc
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
varying float vLife;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `void main() {
float dist = length(gl_PointCoord - vec2(0.5));
if (dist > 0.5) discard;
// Soft radial falloff: bright core, feathered edge
float strength = smoothstep(0.95, 0.5, dist);
// Life drives overall brightness — no sin() bell; life is already 0 at death
float alpha = vLife * strength;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                'gl_FragColor = vec4(outgoingLight, alpha);'
            );
        };

        this.tailParticles = new THREE.Points(this.tailGeo, this.tailMat);
        this.tailParticles.frustumCulled = false;

        this.scene.add(this.tailParticles);
    }

    /**
     * Produces a per-particle tail color. ~80% of particles take the comet's main
     * tail color with a little HSL variation (the procedural coloring), and the
     * rest stay white for the icy sheen.
     */
    private generateTailParticleColor(): THREE.Color {
        if (Math.random() < Comet.COLORED_PARTICLE_RATIO) {
            const hsl = { h: 0, s: 0, l: 0 };
            this.tailColorMain.getHSL(hsl);
            const hue = (hsl.h + (Math.random() - 0.5) * 0.08 + 1) % 1;
            const sat = Math.min(1, Math.max(0.2, hsl.s * (0.8 + Math.random() * 0.4)));
            const light = Math.min(1, Math.max(0.15, hsl.l * (0.7 + Math.random() * 0.6)));
            return new THREE.Color().setHSL(hue, sat, light);
        }
        return new THREE.Color(0xffffff);
    }

    /**
     * Sets the comet tail's main color. New particles sample around it, and all
     * live particles are re-tinted immediately so the change is visible at once.
     */
    setTailColor(color: THREE.ColorRepresentation): void {
        this.tailColorMain.set(color);
        if (this.tailColors && this.tailVelocities) {
            for (let i = 0; i < this.tailCount; i++) {
                const c = this.generateTailParticleColor();
                this.tailColors[i * 3] = c.r;
                this.tailColors[i * 3 + 1] = c.g;
                this.tailColors[i * 3 + 2] = c.b;
            }
            if (this.tailGeo) {
                this.tailGeo.attributes.color.needsUpdate = true;
            }
        }
    }

    /** Current comet tail main color. */
    get tailColor(): THREE.Color {
        return this.tailColorMain;
    }

    update(acc: THREE.Vector3, dt: number) {
        super.update(acc, dt);
        // updateTail is called from the outer animate loop (alongside updateTrail)
        // so it receives the camera position for camera-relative rendering.
    }

    /**
     * Updates the comet tail. Must be called from the outer animate loop (not the physics substep
     * loop) so that the camera position is available for camera-relative rendering.
     *
     * Particle world positions are kept in Float64Arrays (tailPx/Y/Z) to avoid the catastrophic
     * cancellation that occurs when accumulating small deltas into a Float32 value that is already
     * ~5 billion units from the origin. Each frame the camera position is subtracted in float64
     * before the result is narrowed to float32 for the GPU, keeping all buffer values small.
     *
     * @param dt        Total frame delta-time (dtTotal from animate loop, same as ship-flame).
     * @param cameraPos Current camera world position.
     */
    updateTail(dt: number, cameraPos: THREE.Vector3) {
        if (
            !this.mesh ||
            !this.tailParticles ||
            !this.tailGeo ||
            !this.tailMat ||
            !this.tailPx ||
            !this.tailPy ||
            !this.tailPz ||
            !this.tailGpuBuf ||
            !this.tailColors ||
            !this.tailOpacities ||
            !this.tailVelocities
        ) {
            return;
        }

        // If particle effects are disabled, skip tail updates for performance
        if (!settingsStore.settings.particleEffectsEnabled) {
            this.tailParticles.visible = false;
            return;
        } else {
            this.tailParticles.visible = true;
        }

        // Anchor the Points mesh at cameraPos so GPU buffer vertices are camera-relative offsets.
        // This is identical to the pattern used by orbit trails and ship-flame.
        this.tailParticles.position.copy(cameraPos);
        const cx = cameraPos.x,
            cy = cameraPos.y,
            cz = cameraPos.z;

        // Camera-to-comet distance drives particle world-space size.
        // With sizeAttenuation:true, screen_pixels = size * (viewportHeight/2) / cameraDepth.
        // Setting size = dist * k gives constant apparent pixel coverage regardless of zoom:
        //   screen_pixels = dist * k * 450 / dist = k * 450
        // k = 0.005 → ~2.25 px apparent diameter at any zoom level.
        // Floor of 200 km prevents particles becoming sub-radius near the nucleus.
        const cometToCameraDist = cameraPos.distanceTo(this.mesh.position);
        const particleWorldSize = Math.max(200, cometToCameraDist * 0.005);

        // Calculate distance to sun (optimized with squared distance)
        const distToSunSq =
            this.mesh.position.x ** 2 + this.mesh.position.y ** 2 + this.mesh.position.z ** 2;
        const distToSun = Math.sqrt(distToSunSq);

        // Calculate comet's velocity magnitude (cached)
        const cometSpeed = this.velocity.length();

        // Scale tail intensity based on distance (closer = brighter/longer)
        // Intensity reference: full tail at Earth-orbit distance (~1.5e8 km)^2 = 2.25e16.
        // Apply the inverse square law.
        //2.25e16
        const tailIntensity = Math.min(1, (10000 * SCALE_FACTOR) / distToSunSq);

        // Direction away from sun (normalized once)
        const invDistToSun = 1 / distToSun;
        const awayFromSunX = this.mesh.position.x * invDistToSun;
        const awayFromSunY = this.mesh.position.y * invDistToSun;
        const awayFromSunZ = this.mesh.position.z * invDistToSun;

        // targetTailLength controls particle lifespan; actual tail extent in km ≈ 143 × targetTailLength.
        // baseTailLength=3500  → ~500,000 km base tail (always present)
        // intensityBonus=35000 → up to ~5,000,000 km extra near perihelion (Earth-orbit)
        // velocityBonus        → small extra length proportional to comet speed
        const baseTailLength = 3500 * SCALE_FACTOR;
        const intensityBonus = tailIntensity * 2 * SCALE_FACTOR;
        const velocityBonus = cometSpeed * 1 * SCALE_FACTOR;
        const targetTailLength = baseTailLength + intensityBonus + velocityBonus;

        // Convert tail length to life increment
        const avgParticleSpeed = 0.7;
        const lifeIncrement = (avgParticleSpeed * 60) / targetTailLength;

        const dtScaled = Math.abs(dt) * 120;
        const spread = this.radius * 3 * SCALE_FACTOR;

        // Nucleus world position — read once outside the loop (float64, exact).
        const nx = this.mesh.position.x,
            ny = this.mesh.position.y,
            nz = this.mesh.position.z;

        // Floor opacity so the tail stays visible even at aphelion (~5.25e9 km), where
        // tailIntensity by inverse-square law drops to ~0.001.  Without this floor the
        // shader vLife attribute is essentially 0 and all particles are invisible.
        const particleOpacity = Math.max(0.3, tailIntensity);

        // Update all particles
        for (let i = 0; i < this.tailCount; i++) {
            const vel = this.tailVelocities[i];

            // Increment life using the current lifeIncrement
            vel.life += vel.lifeIncrement * dt;

            // Integrate world-space position in float64.
            // Particles stay where they are in space as the comet moves —
            // new gas constantly emitted from the nucleus, old gas left behind.
            // Float64 gives full precision at any distance from the origin.
            this.tailPx[i] += vel.vel.x * dtScaled;
            this.tailPy[i] += vel.vel.y * dtScaled;
            this.tailPz[i] += vel.vel.z * dtScaled;

            const idx = i * 3;

            // If particle dies, reset it near the nucleus with a new lifeIncrement.
            if (vel.life >= 1.0 || vel.life <= 0.0) {
                vel.lifeIncrement = lifeIncrement * (0.7 + Math.random() * 0.6); // ±30% variation

                // Pick new velocity direction first — needed for the positional fast-forward below.
                const baseSpeed = 0.3 + Math.random() * 0.4;
                vel.vel.x = awayFromSunX * baseSpeed + (Math.random() - 0.5) * 0.2;
                vel.vel.y = awayFromSunY * baseSpeed + (Math.random() - 0.5) * 0.2;
                vel.vel.z = awayFromSunZ * baseSpeed + (Math.random() - 0.5) * 0.2;

                const color = this.generateTailParticleColor();
                this.tailColors[idx] = color.r;
                this.tailColors[idx + 1] = color.g;
                this.tailColors[idx + 2] = color.b;

                // Stagger the new particle randomly across the full tail length so 1200 particles
                // are always spread out and there is no visible pulsing.
                //
                // Derivation (dt cancels, so this is time-scale independent):
                //   life   increases by lifeIncrement * dt  per frame
                //   offset increases by vel * dt * 6000     per frame
                //   → world offset at life L = vel * 6000 * L / lifeIncrement
                const newLife = Math.random();
                vel.life = newLife;
                const posAdv = (6000 * newLife) / vel.lifeIncrement;
                this.tailPx[i] = nx + (Math.random() - 0.5) * spread + vel.vel.x * posAdv;
                this.tailPy[i] = ny + (Math.random() - 0.5) * spread + vel.vel.y * posAdv;
                this.tailPz[i] = nz + (Math.random() - 0.5) * spread + vel.vel.z * posAdv;
            }

            // GPU write: subtract camera position from world position in float64, then narrow
            // to float32. The result is always small (distance from camera to particle) so
            // float32 is precise regardless of where in the solar system the comet is.
            this.tailGpuBuf[idx] = this.tailPx[i] - cx;
            this.tailGpuBuf[idx + 1] = this.tailPy[i] - cy;
            this.tailGpuBuf[idx + 2] = this.tailPz[i] - cz;

            // Fade from bright (newly born, life≈0) to invisible (dying, life≈1).
            // particleOpacity floors at 0.3 so particles never disappear at large sun distances.
            this.tailOpacities[i] = (1 - vel.life) * particleOpacity;
        }

        this.tailGeo.attributes.position.needsUpdate = true;
        this.tailGeo.attributes.color.needsUpdate = true;
        this.tailGeo.attributes.life.needsUpdate = true;
        // Particle world-space size scales with camera distance for constant apparent pixel coverage.
        this.tailMat.size = particleWorldSize;
    }

    die(deathOptions?: IDeathOptions) {
        this.disposeTail();
        super.die(deathOptions);
    }

    disposeTail() {
        if (!this.tailParticles && !this.tailGeo && !this.tailMat) {
            return;
        }

        try {
            if (this.tailParticles?.parent) {
                this.tailParticles.parent.remove(this.tailParticles);
            }
        } catch {
            // ignore
        }

        try {
            if (this.tailGeo) {
                this.tailGeo.dispose();
            }
        } catch {
            // ignore
        }

        try {
            if (this.tailMat) {
                this.tailMat.dispose();
            }
        } catch {
            // ignore
        }

        this.tailParticles = null;
        this.tailGeo = null;
        this.tailMat = null;
        this.tailPx = null;
        this.tailPy = null;
        this.tailPz = null;
        this.tailGpuBuf = null;
        this.tailColors = null;
        this.tailOpacities = null;
        this.tailVelocities = null;
    }
}
