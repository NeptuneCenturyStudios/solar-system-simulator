import * as THREE from 'three';
import { Body } from '../bodies/body';
import { Wormhole } from '../bodies/wormhole';
import { Spaceship } from '../bodies/ships/spaceship';
import { triggerScreenFlash } from '../effects/screen-flash';
import { NotificationType } from '../event-log/event-log';
import { WORMHOLE_EMERGE_BUFFER_FACTOR } from '../utilities/consts';
import { flightState } from '../simulation/simulation';

const _relPos = new THREE.Vector3();
const _radial = new THREE.Vector3();
const _alongNormal = new THREE.Vector3();
const _entryQuatInv = new THREE.Quaternion();

interface IWormholeCrossing {
    point: THREE.Vector3;
}

/**
 * Swept plane-crossing test against a wormhole's disc-shaped mouth (thin, so a static
 * per-frame overlap test would let fast-moving bodies — e.g. a ship in warp — tunnel
 * straight through). Uses the body's position from the start and end of the frame.
 */
function testWormholeEntrance(
    prevPos: THREE.Vector3,
    newPos: THREE.Vector3,
    wormhole: Wormhole
): IWormholeCrossing | null {
    const normal = wormhole.getEntranceNormal();
    const center = wormhole.mesh.position;

    _relPos.subVectors(prevPos, center);
    const d0 = _relPos.dot(normal);
    _relPos.subVectors(newPos, center);
    const d1 = _relPos.dot(normal);

    // No plane crossing this frame (both sides the same, or no movement along the normal).
    if (d0 === d1 || Math.sign(d0) === Math.sign(d1)) return null;

    const t = d0 / (d0 - d1);
    if (!isFinite(t) || t < 0 || t > 1) return null;

    const point = new THREE.Vector3().lerpVectors(prevPos, newPos, t);
    _radial.subVectors(point, center);
    const alongNormalLen = _radial.dot(normal);
    _alongNormal.copy(normal).multiplyScalar(alongNormalLen);
    const radialDist = _radial.sub(_alongNormal).length();

    if (radialDist > wormhole.radius) return null;

    return { point };
}

/** Re-frames position, velocity, and orientation from the entry wormhole's local space into the exit's. */
function teleportThroughWormhole(
    body: Body,
    entry: Wormhole,
    exit: Wormhole,
    crossingPoint: THREE.Vector3
): void {
    _entryQuatInv.copy(entry.mesh.quaternion).invert();

    const localOffset = crossingPoint
        .clone()
        .sub(entry.mesh.position)
        .applyQuaternion(_entryQuatInv);
    const localVel = body.velocity.clone().applyQuaternion(_entryQuatInv);
    // Always emerge from the exit's front face (opposite the funnel/tail), regardless of
    // which side the body entered from.
    localVel.y = Math.abs(localVel.y);

    const worldOffset = localOffset.applyQuaternion(exit.mesh.quaternion);
    const newVelocity = localVel.applyQuaternion(exit.mesh.quaternion);

    const exitNormal = exit.getEntranceNormal();
    const buffer = exitNormal
        .clone()
        .multiplyScalar(exit.radius * WORMHOLE_EMERGE_BUFFER_FACTOR);

    // Rotating entry->exit local frame is a mirror (not a pure rotation) once the axial
    // velocity component is force-flipped above, so re-using that same delta quaternion to
    // spin the mesh/camera makes the body face backward. Instead, rotate the body's current
    // orientation by however much its travel direction itself just changed — this keeps
    // roll/bank continuity while guaranteeing the nose points along the new heading.
    const oldVelocityDir = body.velocity.lengthSq() > 1e-8 ? body.velocity.clone().normalize() : null;

    body.mesh.position.copy(exit.mesh.position).add(worldOffset).add(buffer);
    body.velocity.copy(newVelocity);

    if (oldVelocityDir && newVelocity.lengthSq() > 1e-8) {
        const newVelocityDir = newVelocity.clone().normalize();
        const reorient = new THREE.Quaternion().setFromUnitVectors(oldVelocityDir, newVelocityDir);
        body.mesh.quaternion.premultiply(reorient);

        // If this is the ship currently being flown, also re-frame the flight camera so
        // steering/thrust continue from the new heading instead of snapping back next frame.
        if (body instanceof Spaceship && flightState.activeShip === body) {
            flightState.flightCameraQuat.premultiply(reorient).normalize();
        }
    }

    try {
        window.dispatchEvent(
            new CustomEvent('wormhole:teleport', { detail: { body, from: entry, to: exit } })
        );
        window.dispatchEvent(
            new CustomEvent('body:absorbed', {
                detail: {
                    message: `${body.name} passed through ${entry.name} and emerged at ${exit.name}`,
                    notificationType: NotificationType.Info,
                },
            })
        );
    } catch {
        // ignore
    }

    // Screen flash cue only makes sense for the ship actually passing through it.
    if (body instanceof Spaceship) {
        triggerScreenFlash(120, 0.05, 0.4);
    }
}

/**
 * Runs the per-frame wormhole entrance pass: any non-wormhole body whose swept path crossed
 * a wormhole's mouth this frame is either teleported to the linked partner, or destroyed if
 * the wormhole has no exit yet. Call once per frame, after the normal collision pass, with
 * each body's position snapshotted immediately before the physics step.
 */
export function processWormholeInteractions(
    bodies: Body[],
    prevPositions: Map<string, THREE.Vector3>
): void {
    const wormholes = bodies.filter(
        (b): b is Wormhole => b instanceof Wormhole && !b._isDisposed && !!b.mesh
    );
    if (wormholes.length === 0) return;

    const handled = new Set<string>();

    for (const wormhole of wormholes) {
        for (const body of bodies) {
            if (body === wormhole || body instanceof Wormhole) continue;
            if (body._isDisposed || !body.mesh || handled.has(body.id)) continue;

            const prevPos = prevPositions.get(body.id);
            if (!prevPos) continue;

            const crossing = testWormholeEntrance(prevPos, body.mesh.position, wormhole);
            if (!crossing) continue;

            handled.add(body.id);

            const exit = wormhole.linkedWormholeId
                ? (bodies.find(
                      (b) => b instanceof Wormhole && b.id === wormhole.linkedWormholeId
                  ) as Wormhole | undefined)
                : undefined;

            if (exit && !exit._isDisposed) {
                teleportThroughWormhole(body, wormhole, exit, crossing.point);
            } else {
                try {
                    window.dispatchEvent(
                        new CustomEvent('body:absorbed', {
                            detail: {
                                message: `${body.name} was destroyed entering an unstable wormhole`,
                                notificationType: NotificationType.Alert,
                            },
                        })
                    );
                } catch {
                    // ignore
                }
                body.die();
            }
        }
    }
}
