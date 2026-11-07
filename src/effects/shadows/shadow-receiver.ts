import * as THREE from 'three';
import {
    MAX_SHADOW_OCCLUDERS,
    MAX_SHADOW_STARS,
    MAX_SHIP_SHADOW_CASTERS,
} from '../../utilities/consts';
import { STAR_OCCLUSION_GLSL } from './star-occlusion-glsl';

/**
 * Shadow quality as the shader sees it: 0 = off (all shadow code compiled out), 1 = low,
 * 2 = high (wider soft-shadow kernel).
 */
export type ShadowShaderMode = 0 | 1 | 2;

/**
 * Uniforms shared by every patched material. The *same objects* are handed to every program, so
 * the shadow system updates them once per frame on the CPU and every lit surface sees the change.
 *
 * Everything positional is in the main camera's **view space**. World coordinates run to millions
 * of units, which float32 cannot resolve to metres; view space is built in float64 on the CPU and is
 * precise near the camera, where the shadows that matter are.
 */
export const shadowUniforms = {
    /** Occluding spheres (centre in view space, radius) — eclipse casters. */
    uSimOccluderCount: { value: 0 },
    uSimOccluders: { value: makeVec4s(MAX_SHADOW_OCCLUDERS) },
    /** Stars (light position in view space, star radius) — gives each point light a disc size. */
    uSimStarCount: { value: 0 },
    uSimStars: { value: makeVec4s(MAX_SHADOW_STARS) },
    /** Ship shadow atlas (a depth texture) and its tiles. */
    uSimShipShadowMap: { value: null as THREE.Texture | null },
    uSimShipTexel: { value: 1 / 1024 },
    uSimShipTileCount: { value: 0 },
    /** View space → (atlas u, atlas v, depth 0..1) for each tile. */
    uSimShipTileMatrix: { value: makeMat4s(MAX_SHIP_SHADOW_CASTERS) },
    /** Each tile's bounds in the atlas (minU, minV, maxU, maxV), so filtering never bleeds across. */
    uSimShipTileRect: { value: makeVec4s(MAX_SHIP_SHADOW_CASTERS) },
    /** (world size of one texel, depth range of the tile in sim units, unused, unused). */
    uSimShipTileInfo: { value: makeVec4s(MAX_SHIP_SHADOW_CASTERS) },
    /** The star a tile was rendered for (light position in view space, angular radius). */
    uSimShipTileLight: { value: makeVec4s(MAX_SHIP_SHADOW_CASTERS) },
};

function makeVec4s(n: number): THREE.Vector4[] {
    return Array.from({ length: n }, () => new THREE.Vector4());
}

function makeMat4s(n: number): THREE.Matrix4[] {
    return Array.from({ length: n }, () => new THREE.Matrix4());
}

/**
 * GLSL helpers. `simShadow(lightPos, fragPos, normal)` returns how much of one point light reaches
 * the fragment: the analytic eclipse term times the ship shadow-map term.
 */
const SHADOW_PARS_GLSL = /* glsl */ `
#if SIM_SHADOWS_MODE > 0
    #define SIM_MAX_OCCLUDERS ${MAX_SHADOW_OCCLUDERS}
    #define SIM_MAX_STARS ${MAX_SHADOW_STARS}
    #define SIM_MAX_SHIP_TILES ${MAX_SHIP_SHADOW_CASTERS}
    #if SIM_SHADOWS_MODE > 1
        #define SIM_SHIP_PCF_HALF 2
    #else
        #define SIM_SHIP_PCF_HALF 1
    #endif
    /** Largest penumbra kernel radius, in texels. */
    #define SIM_SHIP_MAX_KERNEL 6.0

    uniform int uSimOccluderCount;
    uniform vec4 uSimOccluders[SIM_MAX_OCCLUDERS];
    uniform int uSimStarCount;
    uniform vec4 uSimStars[SIM_MAX_STARS];
    uniform sampler2D uSimShipShadowMap;
    uniform float uSimShipTexel;
    uniform int uSimShipTileCount;
    uniform mat4 uSimShipTileMatrix[SIM_MAX_SHIP_TILES];
    uniform vec4 uSimShipTileRect[SIM_MAX_SHIP_TILES];
    uniform vec4 uSimShipTileInfo[SIM_MAX_SHIP_TILES];
    uniform vec4 uSimShipTileLight[SIM_MAX_SHIP_TILES];

    ${STAR_OCCLUSION_GLSL}

    // Whether two view-space light positions are the same light. They are computed from the same
    // float64 matrices, so they agree to float32 rounding; the tolerance is relative because star
    // positions run to millions of units.
    bool simSameLight(vec3 a, vec3 b) {
        return distance(a, b) <= 1e-4 * length(a) + 1e-6;
    }

    // Analytic eclipse: every occluding sphere hides part of the star's disc. Exact umbra, penumbra
    // and antumbra; a body's own night side comes from N·L, and its occluder sphere is uploaded at
    // the faceted mesh's inscribed radius so its own surface never falls inside it.
    float simEclipse(vec3 lightPos, vec3 fragPos) {
        if (uSimOccluderCount == 0) return 1.0;

        float starR = 0.0;
        for (int k = 0; k < SIM_MAX_STARS; k++) {
            if (k >= uSimStarCount) break;
            if (simSameLight(uSimStars[k].xyz, lightPos)) {
                starR = uSimStars[k].w;
                break;
            }
        }

        vec3 toLight = lightPos - fragPos;
        float lightDist = length(toLight);
        vec3 L = toLight / max(lightDist, 1e-9);
        float starAngle = asin(clamp(starR / max(lightDist, 1e-9), 0.0, 1.0));

        float visible = 1.0;
        for (int j = 0; j < SIM_MAX_OCCLUDERS; j++) {
            if (j >= uSimOccluderCount) break;
            vec4 occ = uSimOccluders[j];
            vec3 toOcc = occ.xyz - fragPos;
            float occDist = length(toOcc);
            // Inside it (shouldn't happen for a surface), or it's behind us / past the star.
            if (occDist <= occ.w || occDist >= lightDist) continue;
            vec3 O = toOcc / occDist;
            if (dot(O, L) <= 0.0) continue;

            float occAngle = asin(clamp(occ.w / occDist, 0.0, 1.0));
            // atan2 of cross and dot stays precise where acos of a near-1 dot would not.
            float sep = atan(length(cross(O, L)), dot(O, L));
            if (sep >= starAngle + occAngle + 1e-3) continue;
            // A distant star's shadow edge can be far narrower than a pixel; widen the star to
            // about one pixel of separation so the edge is antialiased, not jagged.
            float a = max(max(starAngle, fwidth(sep)), 1e-6);
            visible *= 1.0 - starDiscOcclusion(a, occAngle, sep);
        }
        return visible;
    }

    // Ship shadow map: each tile is an orthographic depth render of one ship along its star's
    // direction. Percentage-closer filtering, with the kernel widened by the star's angular size
    // times the gap behind the blocker — a contact-hardening penumbra sized like the real one.
    float simShipShadow(vec3 lightPos, vec3 fragPos, vec3 normal) {
        float visible = 1.0;
        for (int i = 0; i < SIM_MAX_SHIP_TILES; i++) {
            if (i >= uSimShipTileCount) break;
            vec4 tileLight = uSimShipTileLight[i];
            if (!simSameLight(tileLight.xyz, lightPos)) continue;

            vec4 info = uSimShipTileInfo[i];
            float texelWorld = info.x;
            float depthRange = info.y;

            // Normal offset: push the lookup off the surface by about a texel, which removes
            // self-shadow acne without detaching the shadow from the hull.
            vec3 p = fragPos + normal * texelWorld * 1.5;
            vec3 s = (uSimShipTileMatrix[i] * vec4(p, 1.0)).xyz;
            vec4 rect = uSimShipTileRect[i];
            if (s.x < rect.x || s.y < rect.y || s.x > rect.z || s.y > rect.w) continue;
            if (s.z <= 0.0 || s.z >= 1.0) continue;

            float bias = 2.0 * texelWorld / depthRange;
            vec2 lo = rect.xy + 0.5 * uSimShipTexel;
            vec2 hi = rect.zw - 0.5 * uSimShipTexel;

            float blocker = texture2D(uSimShipShadowMap, s.xy).r;
            float gap = max(s.z - blocker, 0.0) * depthRange;
            float kernel = clamp(gap * tan(tileLight.w) / texelWorld, 1.0, SIM_SHIP_MAX_KERNEL);
            float stepUv = kernel * uSimShipTexel / float(SIM_SHIP_PCF_HALF);

            float lit = 0.0;
            float taps = 0.0;
            for (int y = -SIM_SHIP_PCF_HALF; y <= SIM_SHIP_PCF_HALF; y++) {
                for (int x = -SIM_SHIP_PCF_HALF; x <= SIM_SHIP_PCF_HALF; x++) {
                    vec2 uv = clamp(s.xy + vec2(float(x), float(y)) * stepUv, lo, hi);
                    float d = texture2D(uSimShipShadowMap, uv).r;
                    lit += (s.z - bias <= d) ? 1.0 : 0.0;
                    taps += 1.0;
                }
            }
            visible = min(visible, lit / taps);
        }
        return visible;
    }

    float simShadow(vec3 lightPos, vec3 fragPos, vec3 normal) {
        float v = simEclipse(lightPos, fragPos);
        if (v > 0.0 && uSimShipTileCount > 0) v *= simShipShadow(lightPos, fragPos, normal);
        return v;
    }
#endif
`;

/** The point-light loop's per-light line we hook in after. */
const POINT_LIGHT_ANCHOR = 'getPointLightInfo( pointLight, geometryPosition, directLight );';

const LIGHTS_FRAGMENT_BEGIN_PATCHED = THREE.ShaderChunk.lights_fragment_begin.replace(
    POINT_LIGHT_ANCHOR,
    `${POINT_LIGHT_ANCHOR}
		#if SIM_SHADOWS_MODE > 0
		directLight.color *= simShadow( pointLight.position, geometryPosition, geometryNormal );
		#endif`
);

if (LIGHTS_FRAGMENT_BEGIN_PATCHED === THREE.ShaderChunk.lights_fragment_begin) {
    console.warn('[shadows] three.js light loop changed — shadows will not be applied.');
}

/** Live patched materials, for switching the mode. */
const _patched = new Set<THREE.Material>();
/** Every material ever patched, so a material shared by many meshes is patched once. */
const _patchedLookup = new WeakSet<THREE.Material>();

let _mode: ShadowShaderMode = 1;

/** Version suffix for the program cache key; bump when the injected GLSL changes. */
const SHADOW_CACHE_KEY = 'sim-shadows-v1';

/**
 * Materials whose fragment shader runs three.js's shared point-light loop (lights_fragment_begin):
 * Standard/Physical (planets, moons, GLTF ships), Phong (OBJ/MTL models — most ships, the ISS)
 * and Lambert.
 */
function isLitMaterial(material: THREE.Material): boolean {
    return (
        material instanceof THREE.MeshStandardMaterial ||
        material instanceof THREE.MeshPhongMaterial ||
        material instanceof THREE.MeshLambertMaterial
    );
}

/**
 * Makes `material` receive shadows. Idempotent. Chains onto any `onBeforeCompile` the material
 * already has (Earth's day/night shader, for one) and extends its program cache key, so a patched
 * material never shares a compiled program with an unpatched one or with a different hook.
 */
export function patchShadowReceiver(material: THREE.Material): void {
    if (!isLitMaterial(material)) return;
    if (_patchedLookup.has(material)) return;
    _patchedLookup.add(material);
    _patched.add(material);
    // Disposed materials drop out of the mode-switch set so it doesn't grow forever.
    material.addEventListener('dispose', () => _patched.delete(material));

    const previousHook = material.onBeforeCompile;
    const hasOwnKey = Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey');
    const previousKey = hasOwnKey ? material.customProgramCacheKey.bind(material) : null;
    // The default key is the hook's source text; capture the original hook's before replacing it.
    const previousHookSource = previousHook.toString();

    material.defines = { ...(material.defines ?? {}), SIM_SHADOWS_MODE: _mode };

    material.onBeforeCompile = (shader, renderer) => {
        previousHook.call(material, shader, renderer);
        Object.assign(shader.uniforms, shadowUniforms);
        shader.fragmentShader = shader.fragmentShader
            .replace('void main() {', `${SHADOW_PARS_GLSL}\nvoid main() {`)
            .replace('#include <lights_fragment_begin>', LIGHTS_FRAGMENT_BEGIN_PATCHED);
    };
    material.customProgramCacheKey = () =>
        `${previousKey ? previousKey() : previousHookSource}|${SHADOW_CACHE_KEY}`;
    material.needsUpdate = true;
}

/** Patches every lit material in `root`'s subtree. */
export function patchShadowReceiversIn(root: THREE.Object3D): void {
    root.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) if (material) patchShadowReceiver(material);
    });
}

/**
 * Switches every patched material to `mode`. Changing it recompiles those programs once (the
 * mode is a define, so `off` compiles every line of shadow code away).
 */
export function setShadowShaderMode(mode: ShadowShaderMode): void {
    if (mode === _mode) return;
    _mode = mode;
    for (const material of _patched) {
        material.defines = { ...(material.defines ?? {}), SIM_SHADOWS_MODE: mode };
        material.needsUpdate = true;
    }
}
