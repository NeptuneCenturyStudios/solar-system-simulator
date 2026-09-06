import * as THREE from 'three';
import { SolarSystemGenerator } from './solar-system-generator';
import { Sun } from '../bodies/sun';
import { Earth } from '../bodies/earth';
import { Wormhole } from '../bodies/wormhole';
import { createBridgeForPair } from '../effects/wormhole-link-bridge';
import { createUniqueId, generateIAUName } from '../utilities/utilities';
import {
    EARTH_DIST,
    WORMHOLE_DEFAULT_RADIUS,
    WORMHOLE_SHORTCUT_RADIUS,
} from '../utilities/consts';
import { pickRandomSpaceTexture, generateSeedString } from './seed-utils';
import { BodyTypeEnum } from '../bodies/body-enums';
import type { Body } from '../bodies/body';
import type { ISolarSystem, IStateDependencies } from '../interfaces';
import { ProceduralGenerationReporter } from './procedural-generation-progress';

/**
 * Scenario: Earth orbits the Sun but takes a linked-wormhole short-cut on a tighter
 * ellipse that dips well inside Mercury's orbit.
 *
 * Placement math
 * --------------
 * A wormhole gate's mouth faces along its local +Y (see Wormhole.getEntranceNormal).
 * With `tilt = 90` and `azimuth = -θ°`, the entrance normal becomes
 * `(sin(azimuth), 0, cos(azimuth)) = (-sin(θ), 0, cos(θ))` — exactly Earth's CCW
 * tangential direction of travel at orbital angle θ. So a gate placed on Earth's path
 * with that orientation catches Earth head-on as it flies through the mouth.
 *
 * Wormhole A sits ON Earth's orbit at θ_A = 90° (the +Z "top" of the orbit). Wormhole B
 * sits at radius WORMHOLE_SHORTCUT_RADIUS — inside Mercury's orbit — at θ_B = 270° (the
 * −Z "bottom").
 *
 * Because both gates use the same tilt/azimuth convention, `teleportThroughWormhole`
 * converts Earth's entry velocity `(0, v, 0)` (in A's local frame) into a purely
 * tangential velocity of the SAME magnitude at B — `v = √(G·M/R)`, the circular speed
 * at Earth's orbit. That is BELOW the circular speed at the tighter radius r_B, so B is
 * the apoapsis of an ellipse with eccentricity `e = (R − r_B)/R`. The ellipse returns to
 * its apoapsis after one period — crossing B's mouth again — so the loop closes and
 * repeats forever: normal orbit → wormhole A→B → tight ellipse → wormhole B→A → normal
 * orbit.
 *
 * The emergence buffer (exit.radius × WORMHOLE_EMERGE_BUFFER_FACTOR) only nudges Earth a
 * tiny fraction of a unit along its travel direction; the ellipse still crosses each
 * gate's plane within its mouth radius, so the return re-entry is reliable.
 *
 * The scenario launches at preset gravity (in index.ts) so Earth's circular velocity is
 * computed consistently for the high-gravity world, and a modest time scale keeps the
 * motion watchable without destabilising the integrator.
 */
export class WormholeShortcutGenerator extends SolarSystemGenerator {
    private readonly dependencies: IStateDependencies;
    private readonly scene: THREE.Scene;
    private readonly masterSeed: string;

    // Orbital angles for the two gates (in the ecliptic XZ plane).
    private static readonly THETA_A = Math.PI / 2; // +Z "top" of Earth's orbit
    private static readonly THETA_B = (3 * Math.PI) / 2; // −Z "bottom", the short-cut gate
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

        // ── Earth (circular orbit at EARTH_DIST, started before gate A) ──────
        const earth = new Earth(this.dependencies, this.scene, WormholeShortcutGenerator.EARTH_START_ANGLE);
        bodies.push(earth);
        reporter?.report({
            completed: 2,
            total: totalBodies,
            workUnit: { phase: 'planets', label: 'Creating Earth' },
        });
        await this.yieldToEventLoop();

        // ── Wormhole A (on Earth's orbit, +Z "top") ──────────────────────────
        const posA = new THREE.Vector3(
            EARTH_DIST * Math.cos(WormholeShortcutGenerator.THETA_A),
            0,
            EARTH_DIST * Math.sin(WormholeShortcutGenerator.THETA_A)
        );
        const gateA = new Wormhole(
            this.dependencies,
            this.scene,
            posA,
            WORMHOLE_DEFAULT_RADIUS,
            createUniqueId('wormhole'),
            generateIAUName(BodyTypeEnum.Wormhole, null, bodies),
            {
                tilt: 90,
                speed: 0,
                azimuth: -THREE.MathUtils.radToDeg(WormholeShortcutGenerator.THETA_A),
            }
        );
        bodies.push(gateA);
        reporter?.report({
            completed: 3,
            total: totalBodies,
            workUnit: { phase: 'finalizing', label: 'Creating short-cut entrance' },
        });
        await this.yieldToEventLoop();

        // ── Wormhole B (short-cut radius, −Z "bottom") ───────────────────────
        const posB = new THREE.Vector3(
            WORMHOLE_SHORTCUT_RADIUS * Math.cos(WormholeShortcutGenerator.THETA_B),
            0,
            WORMHOLE_SHORTCUT_RADIUS * Math.sin(WormholeShortcutGenerator.THETA_B)
        );
        const gateB = new Wormhole(
            this.dependencies,
            this.scene,
            posB,
            WORMHOLE_DEFAULT_RADIUS,
            createUniqueId('wormhole'),
            generateIAUName(BodyTypeEnum.Wormhole, null, bodies),
            {
                tilt: 90,
                speed: 0,
                azimuth: -THREE.MathUtils.radToDeg(WormholeShortcutGenerator.THETA_B),
            }
        );
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
