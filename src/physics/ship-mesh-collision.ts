import * as THREE from 'three';
import { MeshBVH, type ExtendedTriangle } from 'three-mesh-bvh';
import type { Spaceship } from '../bodies/ships/spaceship';
import type { ShipCollisionMode } from '../settings/settings-store';
import {
    SHIP_MESH_BOUNDS_PADDING,
    SHIP_MESH_CCD_MAX_SAMPLES,
    SHIP_MESH_CCD_STEP_FRACTION,
    SHIP_MESH_MAX_CONTACT_PAIRS,
    SHIP_MESH_PENETRATION_ITERATIONS,
} from '../utilities/consts';

/**
 * Hull-accurate contact between two ships, in one of two modes (the Ship Collision setting):
 *
 * - `triangle` — after a box-vs-box reject, the hulls' actual triangles are tested against each
 *   other through a BVH per model mesh (three-mesh-bvh). A fighter can fly alongside a mothership,
 *   or into a gap in its hull, and only collides where the drawn hulls actually touch.
 * - `box` — each hull's oriented bounding box, by the separating axis test. The normal and depth
 *   come from the axis of least overlap. Much cheaper against very detailed models.
 *
 * The broad phase (bounding spheres, in the animation loop) runs before either.
 *
 * All queries run in a frame centred on ship A, built from the *relative* position of B. The
 * geometry and BVH bounds are float32, so working at interplanetary world coordinates would
 * throw away the precision a close contact needs (same rule as modelPointToShipLocal).
 */

/** Result of a hull contact query. All vectors are world-space. */
export interface ShipMeshContact {
    /** Unit contact normal, pointing from B toward A — the direction A is pushed. */
    normal: THREE.Vector3;
    /** Contact point (triangle mode: mean of where the touching triangles cross). */
    point: THREE.Vector3;
    /** How far A must move along `normal`, relative to B, for the hulls to stop intersecting. */
    penetration: number;
    /**
     * Offset of A relative to B that rewinds this frame's motion to the pose where the hulls
     * first met. Zero unless the ships tunnelled through each other this frame (CCD hit); the
     * caller applies it before separating along the normal.
     */
    rewind: THREE.Vector3;
}

/** One drawn mesh of a ship's model, with the BVH of its geometry. */
interface CollisionPart {
    mesh: THREE.Mesh;
    bvh: MeshBVH;
}

/** A hull's oriented bounding box in the contact frame. */
interface HullBox {
    center: THREE.Vector3;
    /** Half extents along `axes`. */
    half: THREE.Vector3;
    /** Unit box axes (the ship's local X, Y, Z). */
    axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

/**
 * BVHs keyed by geometry. GLB ships share geometry across every clone of the type, so one BVH
 * serves the whole fleet. Entries go away with their geometry, so no explicit cleanup is needed.
 */
const bvhCache = new WeakMap<THREE.BufferGeometry, MeshBVH>();

/** Collision parts per loaded model group (a reloaded model gets a fresh entry). */
const partsCache = new WeakMap<THREE.Object3D, CollisionPart[]>();

/**
 * The drawn meshes of `ship`'s model, building each geometry's BVH the first time it is needed,
 * so ships that never come close to another ship never pay for one. `indirect` keeps the BVH
 * from reordering the index buffer the renderer draws from.
 */
function getCollisionParts(ship: Spaceship): CollisionPart[] {
    const model = ship.mesh.children.find((child) => child.userData.isShipModel === true);
    if (!model) return [];

    const cached = partsCache.get(model);
    if (cached) return cached;

    const parts: CollisionPart[] = [];
    model.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
        let bvh = bvhCache.get(mesh.geometry);
        if (!bvh) {
            bvh = new MeshBVH(mesh.geometry, { indirect: true });
            bvhCache.set(mesh.geometry, bvh);
        }
        parts.push({ mesh, bvh });
    });
    partsCache.set(model, parts);
    return parts;
}

/**
 * Writes `part`'s transform relative to `container` into `out`, from the local matrices along the
 * chain. Read every query, so animated parts (the World Destroyer's spinning spiral) collide
 * where they are drawn this frame.
 */
function partToContainer(part: THREE.Object3D, container: THREE.Object3D, out: THREE.Matrix4) {
    out.identity();
    for (let node: THREE.Object3D | null = part; node && node !== container; node = node.parent) {
        node.updateMatrix();
        out.premultiply(node.matrix);
    }
    return out;
}

/** Grows `pool` so it holds at least `count` matrices. */
function ensureMatrices(pool: THREE.Matrix4[], count: number): void {
    while (pool.length < count) pool.push(new THREE.Matrix4());
}

function createHullBox(): HullBox {
    return {
        center: new THREE.Vector3(),
        half: new THREE.Vector3(),
        axes: [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()],
    };
}

/** Per-query state. Module scratch, so the per-pair contact pass never allocates. */
const _aFrame: THREE.Matrix4[] = []; // A part → contact frame
const _aFrameInv: THREE.Matrix4[] = []; // contact frame → A part
const _aNormal: THREE.Matrix3[] = []; // A part normals → contact frame
const _bFrame: THREE.Matrix4[] = []; // B part → contact frame, at B's current pose
let _aParts: CollisionPart[] = [];
let _bParts: CollisionPart[] = [];

const _containerMat = new THREE.Matrix4();
const _partMat = new THREE.Matrix4();
const _offsetMat = new THREE.Matrix4();
const _bPosed = new THREE.Matrix4();
const _toLocal = new THREE.Matrix4();

const _relB = new THREE.Vector3(); // B's centre in the contact frame (A at the origin)
const _zero = new THREE.Vector3();
const _offset = new THREE.Vector3();
const _startB = new THREE.Vector3();
const _disp = new THREE.Vector3();
const _negNormal = new THREE.Vector3();
const _tmp = new THREE.Vector3();

const _boxA = createHullBox();
const _boxB = createHullBox();
const _satAxis = new THREE.Vector3();
const _satT = new THREE.Vector3();
/** Normal (B → A) of the least-overlap axis found by the last {@link boxOverlap} call. */
const _satNormal = new THREE.Vector3();

const _line = new THREE.Line3();
const _triNormal = new THREE.Vector3();
const _normalSum = new THREE.Vector3();
const _pointSum = new THREE.Vector3();
let _pairCount = 0;
let _collectPart = 0;

/**
 * Edge-edge axes only win over a face axis when they overlap this much less. Face normals give
 * steadier contacts; edge axes tied with them would flip the normal frame to frame.
 */
const EDGE_AXIS_BIAS = 0.95;

/**
 * Sets `box` to `ship`'s hull box in the contact frame, with the ship's centre at `centre` and
 * its half extents scaled by `padding`.
 */
function setHullBox(ship: Spaceship, centre: THREE.Vector3, padding: number, box: HullBox): void {
    const bounds = ship.hullBoundsLocal;
    if (!bounds) return;
    const scale = ship.mesh.scale;
    const quat = ship.mesh.quaternion;

    bounds.getCenter(_tmp).multiply(scale).applyQuaternion(quat);
    box.center.copy(centre).add(_tmp);

    bounds.getSize(_tmp).multiplyScalar(0.5 * padding);
    box.half.set(
        Math.abs(_tmp.x * scale.x),
        Math.abs(_tmp.y * scale.y),
        Math.abs(_tmp.z * scale.z)
    );

    box.axes[0].set(1, 0, 0).applyQuaternion(quat);
    box.axes[1].set(0, 1, 0).applyQuaternion(quat);
    box.axes[2].set(0, 0, 1).applyQuaternion(quat);
}

/** Half-width of `box` projected onto unit axis `axis`. */
function projectedRadius(box: HullBox, axis: THREE.Vector3): number {
    return (
        box.half.x * Math.abs(box.axes[0].dot(axis)) +
        box.half.y * Math.abs(box.axes[1].dot(axis)) +
        box.half.z * Math.abs(box.axes[2].dot(axis))
    );
}

/**
 * Separating axis test between two oriented boxes over the 15 candidate axes (3 face normals
 * each, plus the 9 edge-edge cross products). Returns the smallest overlap, with its axis
 * oriented from `b` toward `a` in `_satNormal`, or −1 if some axis separates the boxes.
 */
function boxOverlap(a: HullBox, b: HullBox): number {
    _satT.subVectors(b.center, a.center);
    let minOverlap = Infinity;

    const testAxis = (axis: THREE.Vector3, bias: number): boolean => {
        const dist = _satT.dot(axis);
        const overlap = projectedRadius(a, axis) + projectedRadius(b, axis) - Math.abs(dist);
        if (overlap < 0) return false;
        if (overlap < minOverlap * bias) {
            minOverlap = overlap;
            // T points A → B, so the normal (B → A) is the axis turned against it.
            _satNormal.copy(axis).multiplyScalar(dist >= 0 ? -1 : 1);
        }
        return true;
    };

    for (let i = 0; i < 3; i++) {
        if (!testAxis(a.axes[i], 1)) return -1;
        if (!testAxis(b.axes[i], 1)) return -1;
    }
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            _satAxis.crossVectors(a.axes[i], b.axes[j]);
            const lengthSq = _satAxis.lengthSq();
            // Parallel edges: the face axes already cover this direction.
            if (lengthSq < 1e-12) continue;
            _satAxis.divideScalar(Math.sqrt(lengthSq));
            if (!testAxis(_satAxis, EDGE_AXIS_BIAS)) return -1;
        }
    }
    return minOverlap;
}

/** Smallest dimension of `ship`'s hull box in sim units — how thin a hull CCD must not skip. */
function hullThickness(ship: Spaceship): number {
    const bounds = ship.hullBoundsLocal;
    if (!bounds) return ship.radius * 0.5;
    bounds.getSize(_tmp).multiply(ship.mesh.scale);
    return Math.min(Math.abs(_tmp.x), Math.abs(_tmp.y), Math.abs(_tmp.z));
}

/** Triangle callback that only reports whether any pair touches (stops at the first). */
function anyTriangleHit(t1: ExtendedTriangle, t2: ExtendedTriangle): boolean {
    return t1.intersectsTriangle(t2);
}

/**
 * Triangle callback that gathers the contact: B's outward face normals minus A's (both point
 * from B toward A at the contact), area-weighted, and the midpoints of where the triangles cross.
 * Triangles arrive in A-part space; `_collectPart` says which A part.
 */
function collectTriangleHit(t1: ExtendedTriangle, t2: ExtendedTriangle): boolean {
    if (!t1.intersectsTriangle(t2, _line)) return false;
    const normalMat = _aNormal[_collectPart];

    t2.getNormal(_triNormal).applyMatrix3(normalMat).normalize();
    _normalSum.addScaledVector(_triNormal, t2.getArea());
    t1.getNormal(_triNormal).applyMatrix3(normalMat).normalize();
    _normalSum.addScaledVector(_triNormal, -t1.getArea());

    _line.getCenter(_tmp).applyMatrix4(_aFrame[_collectPart]);
    _pointSum.add(_tmp);

    return ++_pairCount >= SHIP_MESH_MAX_CONTACT_PAIRS;
}

/**
 * Whether the hulls' triangles intersect with B displaced by `offset` from its current pose (in
 * the contact frame). With `collect`, keeps walking the triangles to gather the contact normal
 * and point.
 */
function hullsIntersect(offset: THREE.Vector3, collect: boolean): boolean {
    _offsetMat.makeTranslation(offset.x, offset.y, offset.z);
    const intersectsTriangles = collect ? collectTriangleHit : anyTriangleHit;
    for (let j = 0; j < _bParts.length; j++) {
        _bPosed.multiplyMatrices(_offsetMat, _bFrame[j]);
        for (let i = 0; i < _aParts.length; i++) {
            _toLocal.multiplyMatrices(_aFrameInv[i], _bPosed);
            _collectPart = i;
            // bvhcast returns true once the callback does: the first hit, or (collecting) the cap.
            if (_aParts[i].bvh.bvhcast(_bParts[j].bvh, _toLocal, { intersectsTriangles })) {
                return true;
            }
        }
    }
    return collect && _pairCount > 0;
}

/**
 * Overlap of the two hull boxes with B displaced by `offset`, or −1 if separated. Triangle mode
 * pads the boxes so animated parts stay inside them (it's only a reject there); box mode uses the
 * exact boxes, since they are the contact surface.
 */
function poseBoxOverlap(
    a: Spaceship,
    b: Spaceship,
    offset: THREE.Vector3,
    mode: ShipCollisionMode
): number {
    const padding = mode === 'triangle' ? SHIP_MESH_BOUNDS_PADDING : 1;
    setHullBox(a, _zero, padding, _boxA);
    setHullBox(b, _tmp.copy(_relB).add(offset), padding, _boxB);
    return boxOverlap(_boxA, _boxB);
}

/** Whether the hulls touch with B displaced by `offset`: box test, then (triangle mode) triangles. */
function poseIntersects(
    a: Spaceship,
    b: Spaceship,
    offset: THREE.Vector3,
    mode: ShipCollisionMode
): boolean {
    if (poseBoxOverlap(a, b, offset, mode) < 0) return false;
    return mode === 'box' || hullsIntersect(offset, false);
}

/** Builds the per-part transforms into the contact frame for triangle mode. */
function prepareParts(a: Spaceship, b: Spaceship): boolean {
    _aParts = getCollisionParts(a);
    _bParts = getCollisionParts(b);
    if (_aParts.length === 0 || _bParts.length === 0) return false;

    ensureMatrices(_aFrame, _aParts.length);
    ensureMatrices(_aFrameInv, _aParts.length);
    while (_aNormal.length < _aParts.length) _aNormal.push(new THREE.Matrix3());
    _containerMat.compose(_zero, a.mesh.quaternion, a.mesh.scale);
    for (let i = 0; i < _aParts.length; i++) {
        partToContainer(_aParts[i].mesh, a.mesh, _partMat);
        _aFrame[i].multiplyMatrices(_containerMat, _partMat);
        _aFrameInv[i].copy(_aFrame[i]).invert();
        _aNormal[i].getNormalMatrix(_aFrame[i]);
    }
    ensureMatrices(_bFrame, _bParts.length);
    _containerMat.compose(_relB, b.mesh.quaternion, b.mesh.scale);
    for (let j = 0; j < _bParts.length; j++) {
        partToContainer(_bParts[j].mesh, b.mesh, _partMat);
        _bFrame[j].multiplyMatrices(_containerMat, _partMat);
    }
    return true;
}

/**
 * Box mode's contact at B offset `offset`: least-overlap axis and depth from the SAT, and a
 * contact point midway through the overlap slab along that axis.
 */
function writeBoxContact(
    a: Spaceship,
    b: Spaceship,
    offset: THREE.Vector3,
    out: ShipMeshContact
): boolean {
    const overlap = poseBoxOverlap(a, b, offset, 'box');
    if (overlap < 0) return false;
    const n = out.normal.copy(_satNormal);

    // A's face toward B sits at (cA·n − rA), B's face toward A at (cB·n + rB); the contact is the
    // midpoint of the boxes' centres moved onto the plane halfway between those faces.
    const faceA = _boxA.center.dot(n) - projectedRadius(_boxA, n);
    const faceB = _boxB.center.dot(n) + projectedRadius(_boxB, n);
    _tmp.addVectors(_boxA.center, _boxB.center).multiplyScalar(0.5);
    _tmp.addScaledVector(n, 0.5 * (faceA + faceB) - _tmp.dot(n));
    out.point.copy(_tmp).add(a.mesh.position);
    out.penetration = overlap;
    return true;
}

/**
 * Triangle mode's contact at B offset `offset`: normal and point from the touching triangles,
 * depth by bisection along the normal.
 */
function writeTriangleContact(
    a: Spaceship,
    b: Spaceship,
    offset: THREE.Vector3,
    out: ShipMeshContact
): boolean {
    _normalSum.set(0, 0, 0);
    _pointSum.set(0, 0, 0);
    _pairCount = 0;
    hullsIntersect(offset, true);
    if (_pairCount === 0) return false;

    out.normal.copy(_normalSum);
    if (out.normal.lengthSq() < 1e-24) {
        // Opposing faces cancelled out (e.g. a thin double-sided panel): use the centre line.
        out.normal.copy(_relB).add(offset).negate();
        if (out.normal.lengthSq() < 1e-24) out.normal.set(0, 1, 0);
    }
    out.normal.normalize();

    // Frame-relative → world. The frame's origin is A's current position.
    out.point.copy(_pointSum).divideScalar(_pairCount).add(a.mesh.position);

    // Upper bound: the two hull boxes' projections on the normal stop overlapping.
    _negNormal.copy(out.normal).negate();
    const centreGap = _tmp.copy(_relB).add(offset).dot(out.normal);
    let hi = Math.max(
        1e-12,
        (a.hullExtentAlong(_negNormal) + b.hullExtentAlong(out.normal) + centreGap) *
            SHIP_MESH_BOUNDS_PADDING
    );
    let lo = 0;
    for (let n = 0; n < SHIP_MESH_PENETRATION_ITERATIONS; n++) {
        const mid = 0.5 * (lo + hi);
        // A moved by +mid·n relative to B is B moved by −mid·n.
        _tmp.copy(offset).addScaledVector(out.normal, -mid);
        if (hullsIntersect(_tmp, false)) lo = mid;
        else hi = mid;
    }
    out.penetration = hi;
    return true;
}

/**
 * Finds the contact between ships `a` and `b`, if their hulls touch this frame. Both ships must
 * have their models loaded (Spaceship.hasHullModel).
 *
 * If the current poses don't touch, but the ships were apart and closing at the start of the
 * frame and moved further than half the thinner hull's thickness, the frame's relative motion is
 * sampled from its start, and the first pose that touches becomes the contact (with `out.rewind`
 * taking A back to it).
 *
 * @param aStart, bStart Each ship's position at the start of this frame (before the physics
 *   step), for the CCD sweep. Without both, there is no sweep.
 * @param mode Triangle-accurate or oriented-box hulls (the Ship Collision setting).
 * @returns Whether the hulls touch; `out` is only written when they do.
 */
export function findShipHullContact(
    a: Spaceship,
    b: Spaceship,
    aStart: THREE.Vector3 | undefined,
    bStart: THREE.Vector3 | undefined,
    mode: ShipCollisionMode,
    out: ShipMeshContact
): boolean {
    _relB.subVectors(b.mesh.position, a.mesh.position);
    if (mode === 'triangle' && !prepareParts(a, b)) return false;

    // ── Where do the hulls touch: now, or (for a fast pass) earlier this frame? ──
    _offset.set(0, 0, 0);
    let touching = poseIntersects(a, b, _offset, mode);

    if (!touching && aStart && bStart) {
        // A's actual motion relative to B over the frame (from the positions recorded before the
        // physics step — never inferred from velocity, which right after a bounce points away
        // from B and would "rewind" A into it). B offset by +disp·(1 − t) is A rewound to t.
        _disp.subVectors(a.mesh.position, aStart).sub(_tmp.subVectors(b.mesh.position, bStart));
        const travel = _disp.length();
        const step = Math.min(hullThickness(a), hullThickness(b)) * SHIP_MESH_CCD_STEP_FRACTION;
        // A tunnel needs A heading toward B at the start of the frame…
        _startB.copy(_relB).add(_disp);
        const approaching = _disp.dot(_startB) > 0;
        // …and the hulls apart then. If they touched at the start, that contact was resolved
        // last frame: there's nothing to rewind to.
        if (step > 0 && travel > step && approaching && !poseIntersects(a, b, _disp, mode)) {
            const samples = Math.min(SHIP_MESH_CCD_MAX_SAMPLES, Math.ceil(travel / step));
            for (let k = 1; k < samples && !touching; k++) {
                _offset.copy(_disp).multiplyScalar(1 - k / samples);
                touching = poseIntersects(a, b, _offset, mode);
            }
        }
    }
    if (!touching) return false;

    const found =
        mode === 'box'
            ? writeBoxContact(a, b, _offset, out)
            : writeTriangleContact(a, b, _offset, out);
    if (!found) return false;

    // The offset moved B; the same relative pose is A moved by −offset.
    out.rewind.copy(_offset).negate();
    return true;
}

// ── Closest hull point (player on foot vs a ship) ────────────────────────────────────────────

const _hpLocal = new THREE.Vector3();
const _hpQuery = new THREE.Vector3();
const _hpBest = new THREE.Vector3();
const _hpPart = new THREE.Matrix4();
const _hpPartInv = new THREE.Matrix4();
const _hpInvQuat = new THREE.Quaternion();
const _hpHit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };

/**
 * The point of `ship`'s hull nearest to world-space `point`, written to `out` (world space).
 *
 * Uses the hull's actual triangles (the same BVHs as ship-vs-ship contact) once the model has
 * loaded, and its oriented bounding box before that. Worked in a ship-relative frame so a query at
 * interplanetary coordinates keeps centimetre precision.
 *
 * @returns Distance from `point` to the hull (0 when inside the box fallback), or Infinity when the
 *   ship has no hull to test yet.
 */
export function closestHullPoint(
    ship: Spaceship,
    point: THREE.Vector3,
    out: THREE.Vector3
): number {
    const scale = ship.mesh.scale;
    _hpInvQuat.copy(ship.mesh.quaternion).invert();
    // Probe in the ship mesh's local frame (before its scale).
    _hpLocal.subVectors(point, ship.mesh.position).applyQuaternion(_hpInvQuat).divide(scale);

    let found = false;
    const parts = getCollisionParts(ship);
    if (parts.length > 0) {
        let bestDistSq = Infinity;
        for (const part of parts) {
            partToContainer(part.mesh, ship.mesh, _hpPart);
            _hpPartInv.copy(_hpPart).invert();
            _hpQuery.copy(_hpLocal).applyMatrix4(_hpPartInv);
            if (!part.bvh.closestPointToPoint(_hpQuery, _hpHit)) continue;
            // Back to the ship's local frame, then to a world offset (scale, rotation) for a true
            // world-space distance whatever the part and mesh scales.
            _hpQuery.copy(_hpHit.point).applyMatrix4(_hpPart);
            _tmp.copy(_hpQuery).sub(_hpLocal).multiply(scale).applyQuaternion(ship.mesh.quaternion);
            const distSq = _tmp.lengthSq();
            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                _hpBest.copy(_hpQuery);
                found = true;
            }
        }
        if (found) {
            _hpBest.multiply(scale).applyQuaternion(ship.mesh.quaternion);
            out.copy(ship.mesh.position).add(_hpBest);
            return Math.sqrt(bestDistSq);
        }
    }

    const bounds = ship.hullBoundsLocal;
    if (!bounds) return Infinity;
    _hpBest.copy(_hpLocal).clamp(bounds.min, bounds.max);
    const inside = _hpBest.equals(_hpLocal);
    _hpBest.multiply(scale).applyQuaternion(ship.mesh.quaternion);
    out.copy(ship.mesh.position).add(_hpBest);
    if (inside) return 0;
    _tmp.copy(_hpLocal).multiply(scale).applyQuaternion(ship.mesh.quaternion);
    return _tmp.distanceTo(_hpBest);
}
