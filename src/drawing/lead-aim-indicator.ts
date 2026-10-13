import * as THREE from 'three';
import type { Body } from '../bodies/body';
import type { Spaceship } from '../bodies/ships/spaceship';
import { IFlightState, ISimulationState } from '../interfaces';
import { leadTargetPoint } from '../ship-effects/weapons/intercept';
import { muzzleWorldPosition } from '../ship-effects/weapons/weapon';
import { STEERING_RETICLE_RADIUS, TEXT_SPRITE_Z } from '../utilities/consts';
import {
    createScreenProjection,
    ScreenProjector,
    type ScreenProjection,
} from './hud/screen-projection';

/** Ring thickness in pixels — matches the aim reticle's ring. */
const RING_WIDTH_PX = 6;
const RING_COLOR = 0xaaaaaa;
/** A touch stronger than the origin circle (0.25), so it reads against it when they overlap. */
const RING_OPACITY = 0.45;

/**
 * Shows where to put the aim reticle to hit a moving threat: a gray translucent ring, the
 * size of the reticle, drawn at the target's intercept (lead) point for the selected weapon.
 *
 * Shown for one threat inside the player's aim cone — the area the reticle can reach, i.e.
 * within the ship's `flightMaxPointerOffset` of the nose — preferring the Tab-locked target,
 * otherwise the threat nearest the reticle (the same precedence target assist uses).
 * Independent of the Target Assist setting.
 *
 * Hidden whenever the steering HUD is (autopilot, ALT-orbit, warp — keyed off the origin
 * marker's visibility), for an unarmed ship, for a hitscan weapon (the lead point is the
 * target itself), and when the target outruns the projectile (no intercept exists).
 *
 * Updated after the camera's final move each frame, so the ring sits on the rendered view.
 */
export class LeadAimIndicator {
    private readonly simulationState: ISimulationState;
    private readonly flightState: Pick<IFlightState, 'isActive' | 'activeShip' | 'selectedTarget'>;
    /** The gray steering origin circle, centred on the nose; its position (the aim cone's
     *  centre) and visibility drive this indicator. */
    private readonly originMarker: THREE.Object3D;
    /** The aim reticle ring; used to pick the threat nearest the reticle. */
    private readonly reticleMarker: THREE.Object3D;
    private readonly ring: THREE.Mesh;

    private readonly targetProjection: ScreenProjection = createScreenProjection();
    private readonly leadProjection: ScreenProjection = createScreenProjection();
    private readonly muzzle = new THREE.Vector3();
    private readonly leadPoint = new THREE.Vector3();

    constructor(
        uiScene: THREE.Scene,
        simulationState: ISimulationState,
        flightState: Pick<IFlightState, 'isActive' | 'activeShip' | 'selectedTarget'>,
        originMarker: THREE.Object3D,
        reticleMarker: THREE.Object3D
    ) {
        this.simulationState = simulationState;
        this.flightState = flightState;
        this.originMarker = originMarker;
        this.reticleMarker = reticleMarker;

        this.ring = new THREE.Mesh(
            new THREE.RingGeometry(
                STEERING_RETICLE_RADIUS - RING_WIDTH_PX,
                STEERING_RETICLE_RADIUS,
                48
            ),
            new THREE.MeshBasicMaterial({
                color: RING_COLOR,
                transparent: true,
                opacity: RING_OPACITY,
                side: THREE.DoubleSide,
                depthTest: false,
                depthWrite: false,
            })
        );
        this.ring.frustumCulled = false;
        this.ring.visible = false;
        uiScene.add(this.ring);
    }

    /** @param projector Shared projector, already primed for this frame via `beginFrame`. */
    update(projector: ScreenProjector): void {
        this.ring.visible = this.place(projector);
    }

    /** Position the ring for this frame. Returns whether it should be shown. */
    private place(projector: ScreenProjector): boolean {
        const ship = this.flightState.activeShip;
        if (!this.flightState.isActive || !this.originMarker.visible) return false;
        if (!ship || ship._isDisposed || !ship.mesh) return false;

        const weapon = ship.activeWeapon;
        // Unarmed, or a beam: there is nothing to lead.
        if (!weapon || !Number.isFinite(weapon.muzzleSpeed)) return false;

        const target = this.pickTarget(projector, ship);
        if (!target) return false;

        muzzleWorldPosition(ship, this.muzzle);
        if (
            !leadTargetPoint(
                this.muzzle,
                target.mesh.position,
                target.velocity,
                ship.velocity,
                weapon.muzzleSpeed,
                this.leadPoint
            )
        ) {
            return false;
        }

        const p = this.leadProjection;
        if (!projector.projectPoint(this.leadPoint, p) || p.behind) return false;
        this.ring.position.set(p.uiX, p.uiY, TEXT_SPRITE_Z);
        return true;
    }

    /**
     * The threat to lead: the locked target if it is in the aim cone, else the threat in the
     * cone that sits nearest the reticle.
     */
    private pickTarget(projector: ScreenProjector, ship: Spaceship): Body | null {
        const cone = ship.handling.flightMaxPointerOffset;
        const locked = this.flightState.selectedTarget;
        if (locked && locked !== ship && this.reticleDistance(projector, locked, cone) >= 0) {
            return locked;
        }

        let best: Body | null = null;
        let bestDist = Infinity;
        for (const body of this.simulationState.bodies) {
            if (!body?.isThreat || body === ship) continue;
            const d = this.reticleDistance(projector, body, cone);
            if (d >= 0 && d < bestDist) {
                bestDist = d;
                best = body;
            }
        }
        return best;
    }

    /**
     * Screen distance (px) from the reticle to `body`, or -1 when the body is behind the camera
     * or its on-screen disc does not touch the aim cone (`coneRadius` px around the nose).
     */
    private reticleDistance(projector: ScreenProjector, body: Body, coneRadius: number): number {
        const p = this.targetProjection;
        if (!projector.project(body, p) || p.behind) return -1;

        const origin = this.originMarker.position;
        const apparentR = projector.apparentRadius(
            Number.isFinite(body.radius) && body.radius > 0 ? body.radius : 0,
            p.camDist,
            0
        );
        if (Math.hypot(p.uiX - origin.x, p.uiY - origin.y) - apparentR > coneRadius) {
            return -1;
        }

        const reticle = this.reticleMarker.position;
        return Math.hypot(p.uiX - reticle.x, p.uiY - reticle.y);
    }
}
