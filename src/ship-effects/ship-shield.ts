import * as THREE from 'three';
import type { Body } from '../bodies/body';

/** Impacts tracked at once. A burst of bolts lands on a few spots at most; extra hits recycle the faintest slot. */
const MAX_HITS = 8;

/** Exponential decay rate of a hit's glow, per second (~0.7 s to fade below the visible floor). */
const HIT_DECAY_RATE = 4.0;

/** A hit whose intensity has fallen below this is treated as gone. */
const HIT_FLOOR = 0.004;

/**
 * Two hits closer together than this (radians, ~20°) share one slot and just refresh it, so a
 * sustained laser reads as one pulsing glow rather than a stack of overlapping ripples.
 */
const MERGE_ANGLE = 0.35;
const MERGE_COS = Math.cos(MERGE_ANGLE);

/** Resting tint of the bubble and the colour a hit blends toward. */
const SHIELD_COLOR = 0x44bbff;

/** Sphere tessellation — the glow is computed per fragment, so this only needs to look round. */
const SEGMENTS_W = 48;
const SEGMENTS_H = 32;

/** Drawn after the hull (renderOrder 2) so the bubble overlays the ship. */
const RENDER_ORDER = 3;

/**
 * Per-shield shader uniforms.
 *
 * Owned by the shield and handed to `shader.uniforms` rather than read back from a captured
 * `shader` reference — Three.js shares compiled programs between materials, so a captured
 * reference can end up belonging to another one (same approach as the planet rings).
 */
type ShieldUniforms = {
    /** xyz = unit direction of the hit in the ship's local frame, w = remaining intensity 0..1. */
    uHits: { value: THREE.Vector4[] };
    uColor: { value: THREE.Color };
};

const SHIELD_VERTEX_PARS = /* glsl */ `
    varying vec3 vShieldLocal;
    varying vec3 vShieldNormalV;
    varying vec3 vShieldViewDir;
`;

// Local position of a unit-ish sphere doubles as its outward normal, so no normal attribute needed.
const SHIELD_VERTEX_CHUNK = /* glsl */ `
    vShieldLocal = position;
    vShieldNormalV = normalMatrix * position;
    vShieldViewDir = -(modelViewMatrix * vec4(position, 1.0)).xyz;
`;

const SHIELD_FRAGMENT_PARS = /* glsl */ `
    uniform vec4 uHits[${MAX_HITS}];
    uniform vec3 uColor;
    varying vec3 vShieldLocal;
    varying vec3 vShieldNormalV;
    varying vec3 vShieldViewDir;
`;

const SHIELD_FRAGMENT_CHUNK = /* glsl */ `
    vec3 shieldDir = normalize(vShieldLocal);
    float shieldGlow = 0.0;
    for (int i = 0; i < ${MAX_HITS}; i++) {
        vec4 hit = uHits[i];
        if (hit.w <= ${HIT_FLOOR.toFixed(3)}) continue;

        float ang = acos(clamp(dot(shieldDir, hit.xyz), -1.0, 1.0));
        // 0 on impact, 1 once faded: drives the ring that spreads out from the strike point.
        float spread = 1.0 - hit.w;
        float spot = exp(-pow(ang / 0.3, 2.0));
        float ringRadius = 0.12 + spread * 0.85;
        float ring = exp(-pow((ang - ringRadius) / 0.1, 2.0));
        shieldGlow += hit.w * (spot * 0.95 + ring * 0.55);
    }

    // The bubble is brightest edge-on, like a real energy field, and nearly clear face-on.
    float rim = 1.0 - abs(dot(normalize(vShieldNormalV), normalize(vShieldViewDir)));
    float shieldAlpha = shieldGlow * (0.45 + 0.9 * rim * rim);
    if (shieldAlpha < 0.004) discard;

    diffuseColor.rgb = mix(uColor, vec3(1.0), clamp(shieldGlow, 0.0, 1.0) * 0.55);
    diffuseColor.a = clamp(shieldAlpha, 0.0, 1.0);
`;

/** Attaches the shield shader to a material, driven by the caller-owned uniforms. */
function applyShieldShader(mat: THREE.MeshBasicMaterial, uniforms: ShieldUniforms): void {
    mat.onBeforeCompile = (shader) => {
        shader.uniforms.uHits = uniforms.uHits;
        shader.uniforms.uColor = uniforms.uColor;

        shader.vertexShader = shader.vertexShader
            .replace('void main() {', `${SHIELD_VERTEX_PARS}\nvoid main() {`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>\n${SHIELD_VERTEX_CHUNK}`);
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', `${SHIELD_FRAGMENT_PARS}\nvoid main() {`)
            .replace(
                '#include <map_fragment>',
                `#include <map_fragment>\n${SHIELD_FRAGMENT_CHUNK}`
            );
    };
}

// Scratch objects, reused so a hit allocates nothing.
const _local = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();

/**
 * An invisible bubble around a ship that lights up where a weapon strikes it.
 *
 * The shell is a transparent sphere parented to the ship's mesh, so it follows position and
 * orientation for free. It is never raycast — clicks and weapon hit tests ignore it — and is
 * hidden outright while no hit is glowing, so an undisturbed ship costs nothing to draw.
 *
 * Hit points arrive in world space (float64) and are converted to the ship's local frame on the
 * CPU, then uploaded as unit directions: world coordinates run to millions of units, which float32
 * cannot resolve on a ship-sized sphere.
 */
export class ShipShield {
    private readonly mesh: THREE.Mesh;
    private readonly material: THREE.MeshBasicMaterial;
    private readonly uniforms: ShieldUniforms;
    private readonly host: Body;
    private disposed = false;

    /**
     * @param host Ship the shield surrounds; the shell is attached to `host.mesh`.
     * @param radius Shell radius in the ship's local units. Should equal the weapon hit radius so
     *               the glow appears exactly where a projectile stops.
     */
    constructor(host: Body, radius: number) {
        this.host = host;

        const hits: THREE.Vector4[] = [];
        for (let i = 0; i < MAX_HITS; i++) hits.push(new THREE.Vector4(0, 1, 0, 0));
        this.uniforms = {
            uHits: { value: hits },
            uColor: { value: new THREE.Color(SHIELD_COLOR) },
        };

        this.material = new THREE.MeshBasicMaterial({
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
            // Both faces, so the bubble is also visible from inside it (cockpit / chase camera).
            side: THREE.DoubleSide,
        });
        applyShieldShader(this.material, this.uniforms);

        this.mesh = new THREE.Mesh(
            new THREE.SphereGeometry(radius, SEGMENTS_W, SEGMENTS_H),
            this.material
        );
        // The ship's own container is already the click target; an invisible bubble must not
        // widen it. Raycaster ignores `visible`, so opt out of raycasting explicitly.
        this.mesh.raycast = () => {};
        this.mesh.renderOrder = RENDER_ORDER;
        this.mesh.frustumCulled = false;
        this.mesh.visible = false;
        host.mesh.add(this.mesh);
    }

    /**
     * Light up the shield where a projectile struck.
     * @param worldPos World-space impact point.
     */
    registerHit(worldPos: THREE.Vector3): void {
        if (this.disposed) return;

        const hostMesh = this.host.mesh;
        _local.copy(worldPos).sub(hostMesh.position);
        if (_local.lengthSq() === 0) return;
        _local.applyQuaternion(_invQuat.copy(hostMesh.quaternion).invert()).normalize();

        const hits = this.uniforms.uHits.value;
        let slot = -1;
        let faintest = Infinity;
        for (let i = 0; i < MAX_HITS; i++) {
            const h = hits[i];
            if (h.w > HIT_FLOOR && h.x * _local.x + h.y * _local.y + h.z * _local.z > MERGE_COS) {
                slot = i;
                break;
            }
            if (h.w < faintest) {
                faintest = h.w;
                slot = i;
            }
        }
        // `slot` is the matching live hit if one was close enough, otherwise the faintest.
        hits[slot].set(_local.x, _local.y, _local.z, 1);
        this.mesh.visible = true;
    }

    /** Snuff out every glowing hit immediately, e.g. when the shield is knocked down. */
    clear(): void {
        if (this.disposed || !this.mesh.visible) return;
        for (const h of this.uniforms.uHits.value) h.w = 0;
        this.mesh.visible = false;
    }

    /**
     * Fade the glow.
     * @param dt Seconds to advance. Pass 0 while paused so the glow holds still.
     */
    update(dt: number): void {
        if (this.disposed || !this.mesh.visible || dt <= 0) return;

        const decay = Math.exp(-HIT_DECAY_RATE * dt);
        let anyLive = false;
        for (const h of this.uniforms.uHits.value) {
            if (h.w <= 0) continue;
            h.w *= decay;
            if (h.w <= HIT_FLOOR) h.w = 0;
            else anyLive = true;
        }
        if (!anyLive) this.mesh.visible = false;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.mesh.removeFromParent();
        this.mesh.geometry.dispose();
        this.material.dispose();
    }
}
