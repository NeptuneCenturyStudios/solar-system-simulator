import * as THREE from 'three';
import { SolarSystemGenerator } from './solar-system-generator';
import { Sun } from '../bodies/sun';
import { Earth } from '../bodies/earth';
import { Wormhole } from '../bodies/wormhole';
import { createBridgeForPair } from '../effects/wormhole-link-bridge';
import { createUniqueId, generateIAUName } from '../utilities/utilities';
import {
    WORMHOLE_SHORTCUT_GATE_RADIUS,
    WORMHOLE_SHORTCUT_ORBIT_RADIUS,
} from '../utilities/consts';
import { pickRandomSpaceTexture, generateSeedString } from './seed-utils';
import { BodyTypeEnum } from '../bodies/body-enums';
import type { Body } from '../bodies/body';
import type { ISolarSystem, IStateDependencies } from '../interfaces';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

/**
 * Scenario: Earth flies a tight circular orbit around the Sun, and a linked wormhole pair
 * acts as a literal short-cut that halves its lap time.
 *
 * Placement math
 * --------------
 * A wormhole gate's mouth faces along its local +Y (see Wormhole.getEntranceNormal), and
 * its funnel flares open on that +normal side while tapering to a tail tip along −normal
 * (see WormholeFunnelEffect). With `tilt = 90`, `azimuth = a` gives an entrance normal of
 * `(sin(a), 0, cos(a))`, so at orbital angle θ:
 *   - `azimuth = -θ°`    ⇒ normal = `(-sin θ, 0, cos θ)` = Earth's CCW direction of travel
 *   - `azimuth = 180-θ°` ⇒ normal = `( sin θ, 0, -cos θ)` = directly back at oncoming Earth
 *
 * Both gates sit ON Earth's orbit at radius WORMHOLE_SHORTCUT_ORBIT_RADIUS, on exactly
 * opposite sides of the Sun: gate A at θ_A = 90° (the +Z "top") and gate B at
 * θ_B = θ_A + 180° (the −Z "bottom").
 *
 * The two gates face OPPOSITE ways, which is what makes the round trip read correctly.
 * Gate A is the intake: its flare opens back at approaching Earth, so Earth flies into the
 * open mouth rather than into the tail tip. Gate B is the outlet: its flare opens along the
 * direction of travel, so Earth emerges out of the open mouth heading onward. Facing both
 * gates the same way would instead reverse Earth's orbit on the first jump and put it back
 * into a tail tip on every lap after.
 *
 * The SHARED radius is what keeps the orbit circular. Earth crosses A's plane moving
 * exactly along A's axis, so its entry velocity is `(0, ±v, 0)` in A's local frame;
 * `teleportThroughWormhole` forces that axial component positive (bodies always leave by the
 * exit's front face) and re-expresses it in B's frame, preserving the magnitude. Earth
 * therefore emerges at B moving purely tangentially at `v = √(G·M/R)` — precisely the
 * circular speed at radius R. No correction is needed: the orbit stays circular.
 *
 * Travelling CCW from θ_B, Earth sweeps 180° and arrives back at gate A with the right
 * heading, re-enters, and jumps to B again. It therefore only ever traverses the B→A half
 * of the circle, and the observed period is half the true orbital period.
 *
 * The emergence buffer (exit.radius × WORMHOLE_EMERGE_BUFFER_FACTOR) pushes Earth clear of
 * B along its direction of travel, so it cannot immediately re-trigger B's own plane.
 *
 * The scenario launches at preset gravity (in index.ts) so Earth's circular velocity is
 * computed consistently for the high-gravity world, and a modest time scale keeps the
 * motion watchable without destabilising the integrator.
 */
/**
 * Which way a gate's flared mouth opens, relative to Earth's CCW direction of travel.
 * `'oncoming'` turns the flare back toward approaching Earth (an intake); `'downstream'`
 * points it along the direction of travel (an outlet).
 */
type GateFacing = 'oncoming' | 'downstream';

export class WormholeShortcutGenerator extends SolarSystemGenerator {
    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly masterSeed: string;

    // Orbital angles for the two gates (in the ecliptic XZ plane).
    private static readonly THETA_A = Math.PI / 2; // +Z "top" of Earth's orbit
    // Opposite end of the same diameter, so the jump skips exactly half the orbit.
    private static readonly THETA_B = Math.PI / 2 + Math.PI;
    // Earth starts 30° before gate A so the user sees it approach before taking the short-cut.
    private static readonly EARTH_START_ANGLE = Math.PI / 2 - Math.PI / 6;

    constructor(dependencies: IStateDependencies, scene: THREE.Scene, seed?: string) {
        super();
        this.dependencies = dependencies;
        this.scene = scene;
        const inputSeed = (seed ?? '').trim();
        this.masterSeed = inputSeed.length > 0 ? inputSeed : generateSeedString();
        this.seed = this.masterSeed;
        console.info('[wormhole-shortcut] using master seed:', this.masterSeed);
    }

    /**
     * Build a gate sitting on Earth's orbit at orbital angle `theta`, oriented so its flared
     * mouth — not its tail tip — is the face Earth meets.
     * @param theta Orbital angle in radians (0 = +X axis, π/2 = +Z axis).
     * @param facing Which way the flare opens relative to Earth's CCW direction of travel.
     * @param bodies Bodies created so far, used only to keep the generated IAU name unique.
     */
    private createGate(theta: number, facing: GateFacing, bodies: Body[]): Wormhole {
        const pos = new THREE.Vector3(
            WORMHOLE_SHORTCUT_ORBIT_RADIUS * Math.cos(theta),
            0,
            WORMHOLE_SHORTCUT_ORBIT_RADIUS * Math.sin(theta)
        );
        const thetaDeg = THREE.MathUtils.radToDeg(theta);
        return new Wormhole(
            this.dependencies,
            this.scene,
            pos,
            WORMHOLE_SHORTCUT_GATE_RADIUS,
            createUniqueId('wormhole'),
            generateIAUName(BodyTypeEnum.Wormhole, null, bodies),
            {
                tilt: 90,
                speed: 0,
                azimuth: facing === 'oncoming' ? 180 - thetaDeg : -thetaDeg,
            }
        );
    }

    async generateSolarSystemAsync(reporter?: ProceduralGenerationReporter): Promise<ISolarSystem> {
        const bodies: Body[] = [];

        const totalBodies = 4; // Sun + Earth + 2 wormholes
        reporter?.setTotal(totalBodies);

        // ── Sun (static at the origin) ───────────────────────────────────────
        const sun = new Sun(this.dependencies, this.scene);
        bodies.push(sun);
        reporter?.report({
            completed: 1,
            total: totalBodies,
            workUnit: { phase: 'stars', label: 'Creating Sun' },
        });
        await this.yieldToEventLoop();

        // ── Earth (tight circular orbit, started 30° before gate A) ──────────
        const earth = new Earth(
            this.dependencies,
            this.scene,
            WormholeShortcutGenerator.EARTH_START_ANGLE,
            WORMHOLE_SHORTCUT_ORBIT_RADIUS
        );
        bodies.push(earth);
        reporter?.report({
            completed: 2,
            total: totalBodies,
            workUnit: { phase: 'planets', label: 'Creating Earth' },
        });
        await this.yieldToEventLoop();

        // ── Wormhole A (intake: +Z "top", flare turned back at oncoming Earth) ──
        const gateA = this.createGate(WormholeShortcutGenerator.THETA_A, 'oncoming', bodies);
        bodies.push(gateA);
        reporter?.report({
            completed: 3,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Creating short-cut entrance' },
        });
        await this.yieldToEventLoop();

        // ── Wormhole B (outlet: opposite side of the Sun, flare aimed downstream) ──
        const gateB = this.createGate(WormholeShortcutGenerator.THETA_B, 'downstream', bodies);
        bodies.push(gateB);
        reporter?.report({
            completed: 4,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Creating short-cut exit' },
        });
        await this.yieldToEventLoop();

        // ── Link the pair and draw the connecting bridge ─────────────────────
        gateA.setLinkedWormhole(gateB.id);
        gateB.setLinkedWormhole(gateA.id);
        createBridgeForPair(gateA, gateB, this.scene);

        return {
            bodies,
            spaceTexture: pickRandomSpaceTexture(this.masterSeed),
        };
    }
}
