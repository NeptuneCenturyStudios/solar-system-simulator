import * as THREE from 'three';

import { Body } from '../bodies/body';
import { CelestialBody } from '../bodies/celestial-body';
import { BlackHole } from '../bodies/black-hole';
import { Pulsar } from '../bodies/pulsar';
import { WhiteDwarf } from '../bodies/white-dwarf';
import { Wormhole } from '../bodies/wormhole';
import { Spaceship } from '../bodies/ships/spaceship';
import { getShipTypeById } from '../bodies/ships/ship-registry';
import { setPendingWormholeLink } from '../bodies/wormhole-link-state';
import { createBridgeForPair } from '../effects/wormhole-link-bridge';
import { resetPhysicsState } from '../physics/physics';
import type { BodyCreator, ICreateCustomBodyOptions } from '../simulation/body-creator';
import { flightState, simulationState } from '../simulation/simulation';
import { MASS_SCALE, RADIUS_SCALE, SimulationStartMode } from '../utilities/consts';
import type { IStateDependencies } from '../interfaces';
import {
    applyBodyState,
    captureBodyState,
    fromKmTuple,
    toKmTuple,
    toQuatTuple,
} from './body-state';
import { getCreation, recordCreation } from './creation-registry';
import {
    CreationKind,
    RemnantKind,
    SAVE_FILE_FORMAT,
    SAVE_FILE_SCHEMA_VERSION,
    isSaveableMode,
    type ISavedBody,
    type ISystemSaveFile,
    type SaveableStartMode,
} from './save-file';

/** The live simulation settings a save carries. */
export type ISavedSimSettings = ISystemSaveFile['sim'];

/** What the persistence service needs from the app shell (index.ts). */
export interface ISystemPersistenceContext {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    bodyCreator: BodyCreator;
    /**
     * Launches the base system (Default / Empty / a procedural seed) at the given G
     * multiplier, exactly as a normal launch would. Resolves once it is live.
     */
    spawnBase(mode: SaveableStartMode, seed: string | null, gMultiplier: number): Promise<void>;
    /** Reads the live time scale, pause state, skydome and focus. */
    readSimSettings(): ISavedSimSettings;
    /** Applies saved time scale, pause state, skydome and focus. */
    applySimSettings(settings: ISavedSimSettings, focusBody: Body | null): Promise<void>;
}

/** What a save or restore left out, for the user-facing result message. */
export interface IPersistenceReport {
    skippedBodies: string[];
}

/** The system that is live right now, as far as saving is concerned. */
interface ICurrentSystem {
    mode: SimulationStartMode;
    seed: string | null;
    /** Index of each body the generator produced, in generation order. */
    baseIndex: Map<Body, number>;
    /** The generator's output, so a restore can find base bodies by index. */
    baseBodies: Body[];
}

/**
 * Saves the live system to a plain-data file and rebuilds a system from one.
 *
 * A file holds the base system (Default, Empty, or a procedural seed) plus the full state of
 * every body alive at save time. Opening one relaunches the base system, removes the base
 * bodies that no longer existed, rebuilds bodies that were added later, then puts every
 * body's saved state (position, velocity, mass, edits, ...) on top.
 */
export class SystemPersistence {
    private current: ICurrentSystem | null = null;
    /** Wall-clock time (ms) the live system was launched or opened. */
    private loadedAt = 0;
    /** Wall-clock time (ms) of the last save of the live system, or null. */
    private lastSavedAt: number | null = null;

    constructor(private readonly ctx: ISystemPersistenceContext) {}

    /** Call after every spawn, once the generator's bodies are live. */
    onSystemSpawned(mode: SimulationStartMode, seed: string | null, bodies: readonly Body[]): void {
        const baseBodies = [...bodies];
        this.current = {
            mode,
            seed,
            baseBodies,
            baseIndex: new Map(baseBodies.map((b, i) => [b, i])),
        };
        this.loadedAt = Date.now();
        this.lastSavedAt = null;
    }

    /** True when the live system is one that can be saved (not a scenario). */
    get canSave(): boolean {
        return !!this.current && isSaveableMode(this.current.mode);
    }

    /** The live system's start mode, or null before the first launch. */
    get currentMode(): SimulationStartMode | null {
        return this.current?.mode ?? null;
    }

    get currentSeed(): string | null {
        return this.current?.seed ?? null;
    }

    /** Milliseconds since the last save, or since launch when never saved. */
    msSinceLastSave(now = Date.now()): number {
        return now - (this.lastSavedAt ?? this.loadedAt);
    }

    get hasSaved(): boolean {
        return this.lastSavedAt !== null;
    }

    markSaved(at = Date.now()): void {
        this.lastSavedAt = at;
    }

    // ── Save ────────────────────────────────────────────────────────────────

    /** Snapshot of the live system. Throws when the live system can't be saved. */
    buildSaveFile(): { file: ISystemSaveFile; report: IPersistenceReport } {
        const current = this.current;
        if (!current || !isSaveableMode(current.mode)) {
            throw new Error(
                'Only the solar system, procedural systems and custom systems can be saved.'
            );
        }

        const report: IPersistenceReport = { skippedBodies: [] };
        const bodies: ISavedBody[] = [];

        for (const body of simulationState.bodies) {
            if (!body || body._isDisposed) continue;
            // The player's ship is saved on its own; other ships only exist in scenarios.
            if (body instanceof Spaceship) continue;

            const baseIndex = current.baseIndex.get(body);
            const creation = getCreation(body);
            if (baseIndex === undefined && !creation) {
                // Probes and other runtime-only bodies have no recipe to rebuild them from.
                report.skippedBodies.push(body.name);
                continue;
            }

            const saved = captureBodyState(body);
            saved.baseIndex = baseIndex ?? null;
            if (baseIndex === undefined && creation) saved.creation = creation;
            bodies.push(saved);
        }

        const ship = flightState.knownShip;
        const playerShip =
            ship && !ship._isDisposed && simulationState.bodies.includes(ship)
                ? {
                      shipTypeId: ship.shipTypeId,
                      posKm: toKmTuple(ship.mesh.position),
                      velKmS: toKmTuple(ship.velocity),
                      quaternion: toQuatTuple(ship.mesh.quaternion),
                  }
                : null;

        const file: ISystemSaveFile = {
            format: SAVE_FILE_FORMAT,
            schemaVersion: SAVE_FILE_SCHEMA_VERSION,
            savedAt: new Date().toISOString(),
            base: { mode: current.mode, seed: current.seed },
            sim: this.ctx.readSimSettings(),
            bodies,
            playerShip,
        };
        return { file, report };
    }

    /** A short name for the live system, for default file names. */
    systemLabel(): string {
        switch (this.current?.mode) {
            case SimulationStartMode.Default:
                return 'Solar System';
            case SimulationStartMode.Procedural:
                return `System ${this.current.seed ?? ''}`.trim();
            default:
                return 'Custom System';
        }
    }

    // ── Restore ─────────────────────────────────────────────────────────────

    /** Replaces the live system with the one in `file`. */
    async restore(file: ISystemSaveFile): Promise<IPersistenceReport> {
        const report: IPersistenceReport = { skippedBodies: [] };

        await this.ctx.spawnBase(file.base.mode, file.base.seed, file.sim.gMultiplier);
        const current = this.current;
        if (!current) throw new Error('The saved system could not be launched.');

        // Saved id → live body, for every body that ends up in the restored system.
        const live = new Map<string, Body>();

        // 1. Match base bodies; remove the ones that were gone when the file was saved.
        const keptBase = new Set<Body>();
        for (const saved of file.bodies) {
            if (saved.baseIndex === null) continue;
            const body = current.baseBodies[saved.baseIndex];
            if (body && !body._isDisposed) {
                live.set(saved.id, body);
                keptBase.add(body);
            }
        }
        for (const body of current.baseBodies) {
            if (!keptBase.has(body)) this.removeBody(body);
        }

        // 2. Rebuild added bodies. A moon may be listed before a parent added later, so keep
        //    passing over the list while that makes progress.
        let pending = file.bodies.filter((s) => s.baseIndex === null);
        while (pending.length > 0) {
            const waiting: ISavedBody[] = [];
            for (const saved of pending) {
                const parentId = this.creationParentId(saved);
                if (parentId && !live.has(parentId) && pending.some((p) => p.id === parentId)) {
                    waiting.push(saved);
                    continue;
                }
                const body = this.rebuild(saved, parentId ? (live.get(parentId) ?? null) : null);
                if (body) live.set(saved.id, body);
                else report.skippedBodies.push(saved.name);
            }
            if (waiting.length === pending.length) {
                // Parents that never appear: build without them.
                for (const saved of waiting) {
                    const body = this.rebuild(saved, null);
                    if (body) live.set(saved.id, body);
                    else report.skippedBodies.push(saved.name);
                }
                break;
            }
            pending = waiting;
        }

        // 3. Saved state on top of every body.
        for (const saved of file.bodies) {
            const body = live.get(saved.id);
            if (body && !body._isDisposed) applyBodyState(body, saved);
        }

        // 4. Relations between bodies, now that they all exist.
        this.restoreRelations(file.bodies, live);

        // 5. The player's ship.
        if (file.playerShip) this.restoreShip(file.playerShip);

        // The integrator's carried accelerations belong to the pre-restore positions.
        resetPhysicsState();

        const focusBody = file.sim.focusedBodyId
            ? (live.get(file.sim.focusedBodyId) ?? null)
            : null;
        await this.ctx.applySimSettings(file.sim, focusBody);

        // The restored state is exactly what is on disk.
        this.loadedAt = Date.now();
        this.lastSavedAt = null;
        return report;
    }

    /** Saved id of the body an added body was created around (its custom/preset parent). */
    private creationParentId(saved: ISavedBody): string | null {
        const creation = saved.creation;
        if (creation?.kind === CreationKind.Custom) return creation.options.orbitParentId ?? null;
        if (creation?.kind === CreationKind.Preset) return saved.orbitParentId ?? null;
        return null;
    }

    /** Rebuilds a body that was added after its system launched. Null when it can't be. */
    private rebuild(saved: ISavedBody, parent: Body | null): Body | null {
        const creation = saved.creation;
        if (!creation) return null;
        const restore = {
            id: saved.id,
            orbitParent: parent instanceof CelestialBody ? parent : null,
        };

        try {
            switch (creation.kind) {
                case CreationKind.Preset:
                    return this.ctx.bodyCreator.createPreset(creation.presetKey, restore) ?? null;
                case CreationKind.Custom: {
                    const { orbitParentId: _unused, ...rest } = creation.options;
                    const options: ICreateCustomBodyOptions = { ...rest, orbitParent: parent };
                    return this.ctx.bodyCreator.createCustom(options, restore);
                }
                case CreationKind.Remnant:
                    return this.rebuildRemnant(saved, creation.remnant);
            }
        } catch (e) {
            console.error(`Could not rebuild ${saved.name}:`, e);
            return null;
        }
    }

    private rebuildRemnant(saved: ISavedBody, kind: RemnantKind): Body {
        const { dependencies, scene } = this.ctx;
        const pos = fromKmTuple(saved.posKm, new THREE.Vector3());
        const vel = fromKmTuple(saved.velKmS, new THREE.Vector3());
        const mass = saved.massKg / MASS_SCALE;
        const rotation = {
            tilt: saved.rotation?.tilt ?? 0,
            speed: saved.rotation?.speed ?? 0,
            azimuth: saved.rotation?.azimuth ?? 0,
        };
        const common = { pos, vel, mass, id: saved.id, name: saved.name };

        let body: Body;
        switch (kind) {
            case RemnantKind.Pulsar:
                body = new Pulsar(dependencies, scene, {
                    ...common,
                    rotation,
                    magneticField: saved.magneticField ?? undefined,
                    // Same radius as the pulsar: no spin-up, the saved spin is restored as is.
                    progenitorRadius: saved.radiusKm / RADIUS_SCALE,
                });
                break;
            case RemnantKind.BlackHole:
                body = new BlackHole(dependencies, scene, { ...common, rotation });
                break;
            case RemnantKind.WhiteDwarf:
                body = new WhiteDwarf(dependencies, scene, {
                    ...common,
                    rotation,
                    temperature: saved.star?.temperature,
                    magneticField: saved.magneticField ?? undefined,
                });
                break;
        }
        recordCreation(body, { kind: CreationKind.Remnant, remnant: kind });
        dependencies.addBody(body);
        return body;
    }

    private restoreRelations(savedBodies: readonly ISavedBody[], live: Map<string, Body>): void {
        const celestial = (id: string | null | undefined): CelestialBody | null => {
            const body = id ? live.get(id) : undefined;
            return body instanceof CelestialBody && !body._isDisposed ? body : null;
        };

        for (const saved of savedBodies) {
            const body = live.get(saved.id);
            if (!(body instanceof CelestialBody) || body._isDisposed) continue;

            if (saved.orbitParentId !== undefined)
                body.orbitParent = celestial(saved.orbitParentId);
            if (saved.binaryPartnerId !== undefined) {
                body.binaryPartner = celestial(saved.binaryPartnerId);
            }

            if (body instanceof Wormhole && saved.linkedWormholeId !== undefined) {
                const partner = saved.linkedWormholeId ? live.get(saved.linkedWormholeId) : null;
                if (partner instanceof Wormhole && !partner._isDisposed) {
                    if (body.linkedWormholeId !== partner.id) {
                        body.setLinkedWormhole(partner.id);
                        partner.setLinkedWormhole(body.id);
                        createBridgeForPair(body, partner, this.ctx.scene);
                    }
                } else if (!body.linkedWormholeId) {
                    // An unlinked wormhole waits for the next one the user creates.
                    setPendingWormholeLink(body);
                }
            }
        }
    }

    private restoreShip(saved: NonNullable<ISystemSaveFile['playerShip']>): void {
        const shipType = getShipTypeById(saved.shipTypeId);
        const ship = shipType.create(
            this.ctx.dependencies,
            this.ctx.scene,
            fromKmTuple(saved.posKm, new THREE.Vector3()),
            fromKmTuple(saved.velKmS, new THREE.Vector3()),
            `spaceship_${Date.now()}`
        );
        const [qx, qy, qz, qw] = saved.quaternion;
        ship.mesh.quaternion.set(qx, qy, qz, qw);
        this.ctx.dependencies.addBody(ship);
        flightState.knownShip = ship;
    }

    /** Removes a body without an explosion, as if the user had deleted it. */
    private removeBody(body: Body): void {
        if (body._isDisposed) return;
        try {
            body.die({ skipExplosion: true, skipImpactSound: true });
        } catch (e) {
            console.error(`Error removing ${body.name}:`, e);
        }
        const index = simulationState.bodies.indexOf(body);
        if (index > -1) simulationState.bodies.splice(index, 1);
        window.dispatchEvent(
            new CustomEvent('body:removed', { detail: { body, id: body.id, name: body.name } })
        );
    }
}
