import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import { Wormhole } from '../bodies/wormhole';
import { settingsStore } from '../settings/settings-store';
import {
    WORMHOLE_BRIDGE_CONTROL_FACTOR,
    WORMHOLE_BRIDGE_FLOW_SPEED,
    WORMHOLE_BRIDGE_LINE_SEGMENTS,
    WORMHOLE_BRIDGE_PARTICLE_COUNT,
    WORMHOLE_BRIDGE_SWIRL_SPEED,
    WORMHOLE_BRIDGE_TUBE_RADIUS_FACTOR,
    WORMHOLE_FUNNEL_LENGTH_FACTOR,
} from '../utilities/consts';

/**
 * Bridges only exist between LINKED wormholes, so they reuse the stable funnel palette:
 * white at both ends matches the funnel's bright INSIDE_COLOR tips, cyan is the linked
 * core color, purple the linked outer rim color.
 */
const COLOR_TIP = new THREE.Color(0xffffff);
const COLOR_MID = new THREE.Color(0x33e0ff);
const COLOR_OUTER = new THREE.Color(0xcc33ff);

// ─── Module-level scratch vectors (no per-frame allocation in update loops) ──
const P0 = new THREE.Vector3();
const P3 = new THREE.Vector3();
const C1 = new THREE.Vector3();
const C2 = new THREE.Vector3();
const CURVE_PT = new THREE.Vector3();
const CURVE_DERIV = new THREE.Vector3();
const REF = new THREE.Vector3();
const SIDE = new THREE.Vector3();
const UPV = new THREE.Vector3();
const TMP = new THREE.Vector3();
const PREV = new THREE.Vector3();

/** Evaluates a cubic Bézier point at parameter t into `out`. */
function cubicPoint(
    out: THREE.Vector3,
    p0: THREE.Vector3,
    c1: THREE.Vector3,
    c2: THREE.Vector3,
    p3: THREE.Vector3,
    t: number
): THREE.Vector3 {
    const s = 1 - t;
    const w0 = s * s * s;
    const w1 = 3 * s * s * t;
    const w2 = 3 * s * t * t;
    const w3 = t * t * t;
    out.set(
        w0 * p0.x + w1 * c1.x + w2 * c2.x + w3 * p3.x,
        w0 * p0.y + w1 * c1.y + w2 * c2.y + w3 * p3.y,
        w0 * p0.z + w1 * c1.z + w2 * c2.z + w3 * p3.z
    );
    return out;
}

/** Evaluates the cubic Bézier first derivative (tangent direction) at t into `out`. */
function cubicDeriv(
    out: THREE.Vector3,
    p0: THREE.Vector3,
    c1: THREE.Vector3,
    c2: THREE.Vector3,
    p3: THREE.Vector3,
    t: number
): THREE.Vector3 {
    const s = 1 - t;
    out.set(
        3 * s * s * (c1.x - p0.x) + 6 * s * t * (c2.x - c1.x) + 3 * t * t * (p3.x - c2.x),
        3 * s * s * (c1.y - p0.y) + 6 * s * t * (c2.y - c1.y) + 3 * t * t * (p3.y - c2.y),
        3 * s * s * (c1.z - p0.z) + 6 * s * t * (c2.z - c1.z) + 3 * t * t * (p3.z - c2.z)
    );
    return out;
}

/** Approximates the curve length by sampling 8 segments — cheap, once per frame. */
function approxBezierLength(
    p0: THREE.Vector3,
    c1: THREE.Vector3,
    c2: THREE.Vector3,
    p3: THREE.Vector3
): number {
    let len = 0;
    PREV.copy(p0);
    for (let i = 1; i <= 8; i++) {
        cubicPoint(TMP, p0, c1, c2, p3, i / 8);
        len += TMP.distanceTo(PREV);
        PREV.copy(TMP);
    }
    return len;
}

/**
 * A swirling Bézier particle stream connecting the funnel tips of two LINKED wormholes.
 *
 * The path is a cubic Bézier from wormhole A's funnel tip (the deep point behind its gate,
 * local y = -tailLength) to wormhole B's funnel tip, with control points extending along
 * each funnel's outward axis so the stream leaves and enters axially — no kinks at either end.
 *
 * Particles flow continuously A→B along the curve while spiralling around it inside a tube
 * whose radius tapers to zero at both tips, so the stream visually "plugs into" the funnels.
 * Color follows the linked funnel palette via a GPU-side ramp driven by a per-particle `aT`
 * attribute; alpha fades at both endpoints so the stream melts into the funnels.
 *
 * Uses THREE.PointsMaterial with onBeforeCompile (same soft-disc injection pattern as
 * WormholeFunnelEffect and MassSiphonEffect). When particle effects are disabled, a simple
 * Bézier Line is shown instead (MassSiphon fallback pattern).
 *
 * Instances are owned by the module-level pair registry below; create via
 * createBridgeForPair(), drive via updateWormholeBridges(dt) once per frame. A bridge
 * prunes itself automatically when either wormhole dies or the mutual link is broken.
 */
export class WormholeLinkBridge implements IEffect {
    dependencies: IStateDependencies;
    active = true;

    private readonly _a: Wormhole;
    private readonly _b: Wormhole;
    private readonly _scene: THREE.Scene;

    private _points: THREE.Points | null = null;
    private _geometry: THREE.BufferGeometry | null = null;
    private _material: THREE.PointsMaterial | null = null;

    private _line: THREE.Line | null = null;
    private _lineGeo: THREE.BufferGeometry | null = null;
    private _lineMat: THREE.LineBasicMaterial | null = null;

    private _lastParticlesEnabled = true;
    private _time = 0;

    /** Progress along the curve [0,1] per particle. */
    private _tPos: Float32Array = new Float32Array(0);
    /** Per-particle speed multiplier around the mean flow speed. */
    private _speedMul: Float32Array = new Float32Array(0);
    /** Per-particle angular phase around the tube axis (radians). */
    private _phase: Float32Array = new Float32Array(0);
    /** Per-particle radial fraction inside the tube [0,1], sqrt-distributed for even density. */
    private _radial: Float32Array = new Float32Array(0);
    /** Per-particle direction: +1 forward, -1 backward. */
    private _dir: Float32Array = new Float32Array(0);

    constructor(dependencies: IStateDependencies, a: Wormhole, b: Wormhole, scene: THREE.Scene) {
        this.dependencies = dependencies;
        this._a = a;
        this._b = b;
        this._scene = scene;

        this._buildPoints(scene);
        this._buildLine(scene);
        this._lastParticlesEnabled = settingsStore.settings.particleEffectsEnabled;
        this._applyMode();
    }

    // ── Construction ─────────────────────────────────────────────────────────

    private _buildPoints(scene: THREE.Scene): void {
        const count = WORMHOLE_BRIDGE_PARTICLE_COUNT;
        const positions = new Float32Array(count * 3); // filled on first update()
        const sizes = new Float32Array(count);
        const tVals = new Float32Array(count);

        this._tPos = new Float32Array(count);
        this._speedMul = new Float32Array(count);
        this._phase = new Float32Array(count);
        this._radial = new Float32Array(count);
        this._dir = new Float32Array(count);

        for (let i = 0; i < count; i++) {
            this._tPos[i] = Math.random();
            this._speedMul[i] = 0.7 + Math.random() * 0.6;
            this._phase[i] = Math.random() * Math.PI * 2;
            this._radial[i] = Math.sqrt(Math.random());
            // NEW: half forward, half backward
            this._dir[i] = Math.random() < 0.5 ? 1 : -1;
            sizes[i] = 1.5 + Math.random() * 2.0; // 1.5 → 3.5
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geo.setAttribute('aT', new THREE.BufferAttribute(tVals, 1));
        geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

        const mat = new THREE.PointsMaterial({
            size: Math.max(Math.min(this._a.radius, this._b.radius) * 0.05, 0.03),
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            sizeAttenuation: true,
        });

        // Inject GLSL: per-particle size scaling, soft circular disc fragment, and a
        // palette ramp + endpoint alpha fade driven by the aT attribute.
        mat.onBeforeCompile = (shader) => {
            shader.uniforms.uColorTip = { value: COLOR_TIP.clone() };
            shader.uniforms.uColorMid = { value: COLOR_MID.clone() };
            shader.uniforms.uColorOuter = { value: COLOR_OUTER.clone() };

            shader.vertexShader = shader.vertexShader.replace(
                '#include <common>',
                `#include <common>
attribute float aSize;
attribute float aT;
varying float vT;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                '#include <begin_vertex>',
                `#include <begin_vertex>
vT = aT;`
            );
            shader.vertexShader = shader.vertexShader.replace(
                'gl_PointSize = size;',
                'gl_PointSize = size * aSize * 1.1;'
            );

            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>',
                `#include <common>
uniform vec3 uColorTip;
uniform vec3 uColorMid;
uniform vec3 uColorOuter;
varying float vT;
vec3 bridgeRamp(float t) {
    vec3 c1 = mix(uColorTip, uColorMid, t);
    vec3 c2 = mix(uColorMid, uColorOuter, t);
    return mix(c1, c2, t);
}`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                'void main() {',
                `void main() {
float dist = length(gl_PointCoord - vec2(0.5));
if (dist > 0.5) discard;
float strength = smoothstep(0.5, 0.1, dist);
float endFade = 0.6 + 0.4 * (
    smoothstep(0.0, 0.03, vT) * (1.0 - smoothstep(0.97, 1.0, vT))
);

strength *= endFade;`
            );
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <opaque_fragment>',
                'gl_FragColor = vec4(bridgeRamp(vT) * 1.4, strength);'
            );
        };

        this._geometry = geo;
        this._material = mat;
        this._points = new THREE.Points(geo, mat);
        this._points.frustumCulled = false;
        this._points.renderOrder = 20;
        scene.add(this._points);
    }

    private _buildLine(scene: THREE.Scene): void {
        const segs = WORMHOLE_BRIDGE_LINE_SEGMENTS;
        this._lineGeo = new THREE.BufferGeometry();
        this._lineGeo.setAttribute(
            'position',
            new THREE.BufferAttribute(new Float32Array((segs + 1) * 3), 3)
        );
        this._lineMat = new THREE.LineBasicMaterial({
            color: COLOR_MID.getHex(),
            transparent: true,
            opacity: 0.55,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this._line = new THREE.Line(this._lineGeo, this._lineMat);
        this._line.frustumCulled = false;
        this._line.renderOrder = 20;
        scene.add(this._line);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /** True while both wormholes are alive, have meshes, and remain mutually linked. */
    isValidPair(): boolean {
        return (
            !this._a._isDisposed &&
            !this._b._isDisposed &&
            !!this._a.mesh &&
            !!this._b.mesh &&
            this._a.linkedWormholeId === this._b.id &&
            this._b.linkedWormholeId === this._a.id
        );
    }

    involves(wormholeId: string): boolean {
        return this._a.id === wormholeId || this._b.id === wormholeId;
    }

    private _applyMode(): void {
        const enabled = settingsStore.settings.particleEffectsEnabled;
        if (this._points) this._points.visible = enabled;
        if (this._line) this._line.visible = !enabled;
    }

    update(dt: number): void {
        if (!this.active || !this.isValidPair()) return;

        const particlesEnabled = settingsStore.settings.particleEffectsEnabled;
        if (particlesEnabled !== this._lastParticlesEnabled) {
            this._lastParticlesEnabled = particlesEnabled;
            this._applyMode();
        }

        // ── Curve endpoints: the funnel tips (deep points behind each gate) ────
        const tailA = this._a.radius * WORMHOLE_FUNNEL_LENGTH_FACTOR;
        const tailB = this._b.radius * WORMHOLE_FUNNEL_LENGTH_FACTOR;
        const normalA = this._a.getEntranceNormal();
        const normalB = this._b.getEntranceNormal();

        P0.copy(this._a.mesh.position).addScaledVector(normalA, -tailA);
        P3.copy(this._b.mesh.position).addScaledVector(normalB, -tailB);

        const dist = P0.distanceTo(P3);
        if (!isFinite(dist) || dist < 1e-6) return;

        // Control points extend past each tip along the outward (-normal) axis so the
        // stream leaves/enters the funnels axially.
        const ctrlLen = dist * WORMHOLE_BRIDGE_CONTROL_FACTOR;
        C1.copy(P0).addScaledVector(normalA, -ctrlLen);
        C2.copy(P3).addScaledVector(normalB, -ctrlLen);

        // Tube radius scales with the smaller mouth, capped so short bridges don't bulge.
        const minMouth = Math.min(this._a.radius, this._b.radius);
        const tubeRadius = Math.min(
            minMouth * WORMHOLE_BRIDGE_TUBE_RADIUS_FACTOR * 1.4,
            dist * 0.08
        );

        // Distance-normalised flow speed so traversal time stays consistent.
        const pathLen = approxBezierLength(P0, C1, C2, P3);
        const baseStep = (WORMHOLE_BRIDGE_FLOW_SPEED / Math.max(pathLen, 1e-6)) * dt;

        this._time += dt;

        if (particlesEnabled && this._points && this._geometry) {
            this._updateParticles(baseStep, tubeRadius);
        } else if (this._line && this._lineGeo) {
            this._updateFallbackLine();
        }
    }

    private _updateParticles(baseStep: number, tubeRadius: number): void {
        const posArr = this._geometry!.attributes.position.array as Float32Array;
        const tArr = this._geometry!.attributes.aT.array as Float32Array;
        const count = this._tPos.length;

        for (let i = 0; i < count; i++) {
            let t = this._tPos[i] + baseStep * this._speedMul[i] * this._dir[i];

            // Safety: prevent NaN / Infinity from breaking geometry
            if (!isFinite(t)) {
                t = Math.random(); // respawn particle
            }

            // Wrap into [0,1]
            t = t - Math.floor(t);

            this._tPos[i] = t;
            tArr[i] = t;

            cubicPoint(CURVE_PT, P0, C1, C2, P3, t);
            cubicDeriv(CURVE_DERIV, P0, C1, C2, P3, t).normalize();

            // Orthonormal frame perpendicular to the local tangent.
            REF.set(0, 1, 0);
            if (Math.abs(REF.dot(CURVE_DERIV)) > 0.99) REF.set(1, 0, 0);
            SIDE.crossVectors(REF, CURVE_DERIV).normalize();
            UPV.crossVectors(CURVE_DERIV, SIDE);

            // Spiral around the curve axis over time; radius tapers to zero at both
            // funnel tips so the stream converges exactly onto them.
            const angle = this._phase[i] + this._time * WORMHOLE_BRIDGE_SWIRL_SPEED;
            const r = this._radial[i] * tubeRadius * Math.sin(Math.PI * t);
            const cosA = Math.cos(angle) * r;
            const sinA = Math.sin(angle) * r;

            posArr[i * 3] = CURVE_PT.x + SIDE.x * cosA + UPV.x * sinA;
            posArr[i * 3 + 1] = CURVE_PT.y + SIDE.y * cosA + UPV.y * sinA;
            posArr[i * 3 + 2] = CURVE_PT.z + SIDE.z * cosA + UPV.z * sinA;
        }

        this._geometry!.attributes.position.needsUpdate = true;
        this._geometry!.attributes.aT.needsUpdate = true;
    }

    private _updateFallbackLine(): void {
        const arr = this._lineGeo!.attributes.position.array as Float32Array;
        const segs = WORMHOLE_BRIDGE_LINE_SEGMENTS;
        for (let s = 0; s <= segs; s++) {
            cubicPoint(CURVE_PT, P0, C1, C2, P3, s / segs);
            arr[s * 3] = CURVE_PT.x;
            arr[s * 3 + 1] = CURVE_PT.y;
            arr[s * 3 + 2] = CURVE_PT.z;
        }
        this._lineGeo!.attributes.position.needsUpdate = true;
    }

    dispose(): void {
        this.active = false;
        if (this._points) {
            this._scene.remove(this._points);
            this._geometry?.dispose();
            this._material?.dispose();
            this._points = null;
            this._geometry = null;
            this._material = null;
        }
        if (this._line) {
            this._scene.remove(this._line);
            this._lineGeo?.dispose();
            this._lineMat?.dispose();
            this._line = null;
            this._lineGeo = null;
            this._lineMat = null;
        }
    }
}

// ─── Pair registry ───────────────────────────────────────────────────────────

/** One bridge per unordered wormhole-id pair; shared by both wormholes. */
const bridges = new Map<string, WormholeLinkBridge>();

function pairKey(idA: string, idB: string): string {
    return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

/** Creates the bridge visual for a newly formed link; no-op if one already exists. */
export function createBridgeForPair(a: Wormhole, b: Wormhole, scene: THREE.Scene): void {
    const key = pairKey(a.id, b.id);
    if (bridges.has(key)) return;
    bridges.set(key, new WormholeLinkBridge(a.dependencies, a, b, scene));
}

/** Advances every live bridge once per frame; prunes dead/broken pairs automatically. */
export function updateWormholeBridges(dt: number): void {
    for (const [key, bridge] of bridges) {
        if (!bridge.isValidPair()) {
            bridge.dispose();
            bridges.delete(key);
            continue;
        }
        bridge.update(dt);
    }
}

/** Removes any bridge involving the given wormhole (called when it is deleted/dies). */
export function disposeWormholeBridgesFor(wormholeId: string): void {
    for (const [key, bridge] of bridges) {
        if (bridge.involves(wormholeId)) {
            bridge.dispose();
            bridges.delete(key);
        }
    }
}

/** Disposes every bridge (system reset). */
export function disposeAllWormholeBridges(): void {
    for (const bridge of bridges.values()) bridge.dispose();
    bridges.clear();
}

// Full system reset clears all bridges alongside the rest of the simulation state.
window.addEventListener('bodies:reset', () => {
    disposeAllWormholeBridges();
});
