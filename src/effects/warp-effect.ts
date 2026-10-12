import * as THREE from 'three';
import { DIST_SCALE } from '../utilities/consts.js';
import { settingsStore } from '../settings/settings-store.js';

// ─── Tunnel geometry constants ───────────────────────────────────────────────
const N_STREAKS = 500;

// How far ahead of the ship (along its +Z axis) new streaks spawn.
const FAR_SPAWN_Z = 3_000_000 / DIST_SCALE;
// Past-the-ship Z at which a streak is fully gone and re-seeded.
const EXPIRE_Z = -2_000_000 / DIST_SCALE;
// Max distance a streak may travel in one frame (fraction of the tunnel length).
// Guards against streaks leaping the whole tunnel at high time-warp / warp flow.
const MAX_STEP = (FAR_SPAWN_Z - EXPIRE_Z) * 0.25;

// Radial extents of the tunnel cylinder.
const INNER_R = 10_000 / DIST_SCALE;
const OUTER_R = 20_0000 / DIST_SCALE;

// Per-streak base length range (along Z axis), scaled each frame by the length multiplier.
const BASE_MIN_LEN = 40_000 / DIST_SCALE;
const BASE_MAX_LEN = 200_000 / DIST_SCALE;

// Per-streak base travel speed toward the camera (u/s, along -Z in ship space),
// scaled each frame by the flow multiplier.
const BASE_MIN_SPD = 500_000 / DIST_SCALE;
const BASE_MAX_SPD = 1_500_000 / DIST_SCALE;
const AVG_BASE_SPD = (BASE_MIN_SPD + BASE_MAX_SPD) / 2;

// Band split: fraction of streaks allocated to the dense outer ring.
const OUTER_BAND_FRAC = 0.7;
// Outer band: 60–100 % of OUTER_R.  Inner cluster: 5–35 % of OUTER_R.
const OUTER_BAND_MIN = 0.6;
const OUTER_BAND_MAX = 1.0;
const INNER_BAND_MIN = 0.05;
const INNER_BAND_MAX = 0.35;

// ─── Speed-response tuning ───────────────────────────────────────────────────
// Ship speed maps to a `level` in [0,1]: 0 at/below cruise max speed (drifting dust),
// BOOST_LEVEL at boost max speed, 1 at warp speed.
const BOOST_LEVEL = 0.25;

// Multipliers on the base streak speed/length at the boost / warp anchors (and length
// at drift). These act in tunnel-local units, so they set how long a streak takes to
// cross the tunnel (≈ 5 s / FLOW_MUL) independent of how far the tunnel has been
// scaled down. There is no drift flow constant: at or below cruise speed the dust is
// treated as stationary in space, so it passes the ship at the ship's own speed.
const FLOW_MUL_BOOST = 1;
const FLOW_MUL_WARP = 6;
const LEN_MUL_DRIFT = 0;
const LEN_MUL_BOOST = 0.4;
const LEN_MUL_WARP = 8;

// Tunnel size at drift, in ship radii. The full-size tunnel (OUTER_R / FAR_SPAWN_Z) is
// hundreds of thousands of ship radii across, which at low speed reads as a distant
// nebula; at drift it's shrunk around the ship so the dust visibly passes by. Depth is
// squashed more than the radius so dots spawn just ahead rather than piling up at the
// vanishing point.
const DRIFT_OUTER_RADII = 30;
const DRIFT_SPAWN_RADII = 60;
// The tunnel scale is interpolated in log space from the drift size (level 0) to full
// size (level 1) along level^SCALE_CURVE, so it stays close to the ship through boost
// and opens out during the warp spool-up. Existing streaks are held fixed in world
// space while the scale changes (see rescaleStreaks); only new spawns use the new size.
const SCALE_CURVE = 2;

// Crossfade from drifting points to streak lines over this level range.
const STREAK_FADE_START = 0.02;
const STREAK_FADE_END = 0.2;

// Drift particle appearance (screen-space pixels, not attenuated by distance).
const POINT_SIZE_PX = 2;
const POINT_OPACITY_GAIN = 1.5;

// Cached unit vector — avoids allocating a new Vector3 every frame.
const _FWD = new THREE.Vector3(0, 0, 1);
const _dir = new THREE.Vector3();

/** Ship speed anchors (u/s) that drive the warp effect's appearance. */
export interface WarpSpeedProfile {
    /** Normal (non-boost) max speed — at or below this the effect is drifting dust. */
    cruise: number;
    /** Boost max speed — the effect has become short streaks. */
    boost: number;
    /** Warp speed — full-length, full-speed streaks and full opacity. */
    warp: number;
    /** Ship radius (u) — sizes the tunnel at drift so the dust passes close to the ship. */
    shipRadius: number;
}

/**
 * 3-D warp tunnel effect.
 *
 * Renders rainbow speed-streaks arranged in a cylindrical tunnel along the
 * ship's velocity direction.  Everything is driven by ship speed:
 *  - at cruise speeds the streaks are small particles drifting slowly past, with
 *    the tunnel shrunk to a few dozen ship radii so they pass close by,
 *  - while boosting they stretch into short streaks and move faster,
 *  - at warp they become long streaks streaming by at high speed.
 * Opacity also scales with speed (0 at rest → 1 at warp), so the effect fades
 * in and out automatically as the ship accelerates and decelerates.
 *
 * Usage:
 *   const warpEffect = new WarpEffect(scene);
 *   // each frame (always, whenever a ship exists):
 *   warpEffect.update(dt, ship.mesh.position, ship.velocity,
 *                     { cruise, boost, warp, shipRadius });
 *   // optional per-frame distance fade from outside:
 *   warpEffect.setOpacity(distanceFade);  // 0–1 multiplier
 */
export class WarpEffect {
    private scene: THREE.Scene;

    // Per-streak state (ship-local coords; origin = ship centre, +Z = forward)
    private angle: Float32Array; // radial angle around tunnel axis (rad)
    private radius: Float32Array; // radial distance from axis (u)
    private zPos: Float32Array; // leading-tip Z position (u)
    private speed: Float32Array; // base travel speed toward camera (u/s, positive)
    private hue: Float32Array; // [0,1]
    private len: Float32Array; // base streak length along Z (u)

    private positions: Float32Array; // N_STREAKS * 6  (2 verts × xyz)
    private colors: Float32Array; // N_STREAKS * 6  (2 verts × rgb)

    private geo: THREE.BufferGeometry;
    private mat: THREE.LineBasicMaterial;
    private pointsMat: THREE.PointsMaterial;
    readonly lines: THREE.LineSegments;
    /** Drift particles — shares `geo` with `lines` and is parented to it. */
    private points: THREE.Points;

    /** Speed-derived base opacity (0–1), updated each frame by update(). */
    private speedOpacity = 0;
    /** Distance-fade multiplier applied on top of speedOpacity (set by setOpacity). */
    private distanceFade = 1;
    /** Speed level (0 drift → BOOST_LEVEL boost → 1 warp), updated each frame by update(). */
    private level = 0;
    /** Current length multiplier applied to the base streak lengths. */
    private lenMul = LEN_MUL_DRIFT;
    /** Tunnel scale applied last frame (0 = not yet set), for world-fixed rescaling. */
    private prevRadialScale = 0;
    private prevDepthScale = 0;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.angle = new Float32Array(N_STREAKS);
        this.radius = new Float32Array(N_STREAKS);
        this.zPos = new Float32Array(N_STREAKS);
        this.speed = new Float32Array(N_STREAKS);
        this.hue = new Float32Array(N_STREAKS);
        this.len = new Float32Array(N_STREAKS);

        this.positions = new Float32Array(N_STREAKS * 6);
        this.colors = new Float32Array(N_STREAKS * 6);

        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

        this.mat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
        });

        this.pointsMat = new THREE.PointsMaterial({
            size: POINT_SIZE_PX,
            sizeAttenuation: false,
            vertexColors: true,
            transparent: true,
            opacity: 1,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: true,
        });

        this.lines = new THREE.LineSegments(this.geo, this.mat);
        this.lines.frustumCulled = false;
        this.lines.renderOrder = 900;
        this.lines.visible = false;

        // Child of the lines so it inherits the ship anchor, orientation and visibility.
        this.points = new THREE.Points(this.geo, this.pointsMat);
        this.points.frustumCulled = false;
        this.points.renderOrder = 900;
        this.lines.add(this.points);

        scene.add(this.lines);

        // Pre-seed all streaks spread along the full tunnel so the effect is
        // immediately populated once the ship starts moving.
        for (let i = 0; i < N_STREAKS; i++) {
            this.seedStreak(i, EXPIRE_Z, FAR_SPAWN_Z);
        }
    }

    // ─── private helpers ────────────────────────────────────────────────────

    /** Assign a fresh random state to streak i, with its leading tip placed at a random
     *  Z in [zMin, zMax] (tunnel-local units). */
    private seedStreak(i: number, zMin: number, zMax: number): void {
        this.angle[i] = Math.random() * Math.PI * 2;
        this.hue[i] = Math.random();
        this.speed[i] = BASE_MIN_SPD + Math.random() * (BASE_MAX_SPD - BASE_MIN_SPD);
        this.len[i] = BASE_MIN_LEN + Math.random() * (BASE_MAX_LEN - BASE_MIN_LEN);
        this.zPos[i] = zMin + Math.random() * (zMax - zMin);

        // Concentric bands: 70 % outer ring, 30 % inner cluster.
        const isOuter = i < N_STREAKS * OUTER_BAND_FRAC;
        const bandMin = isOuter ? OUTER_BAND_MIN : INNER_BAND_MIN;
        const bandMax = isOuter ? OUTER_BAND_MAX : INNER_BAND_MAX;
        this.radius[i] =
            INNER_R + (bandMin + Math.random() * (bandMax - bandMin)) * (OUTER_R - INNER_R);
    }

    /**
     * Map ship speed to a level in [0,1]: 0 at/below cruise, BOOST_LEVEL at boost max,
     * 1 at warp. The boost→warp segment is linear in speed (sqrt-eased) so it tracks the
     * whole warp spool-up rather than saturating a moment after warp engages.
     */
    private speedLevel(speed: number, speeds: WarpSpeedProfile): number {
        const { cruise, boost, warp } = speeds;
        if (speed <= cruise) return 0;
        if (speed <= boost) {
            return boost > cruise
                ? (BOOST_LEVEL * (speed - cruise)) / (boost - cruise)
                : BOOST_LEVEL;
        }
        if (warp <= boost) return 1;
        const f = THREE.MathUtils.clamp((speed - boost) / (warp - boost), 0, 1);
        return BOOST_LEVEL + (1 - BOOST_LEVEL) * Math.sqrt(f);
    }

    /**
     * Log-space interpolation of a tunnel scale factor from `driftScale` (t = 0) to full
     * size (t = 1). Log space because the two ends are ~6 orders of magnitude apart.
     */
    private tunnelScale(t: number, driftScale: number): number {
        const lo = Math.log(THREE.MathUtils.clamp(driftScale, 1e-12, 1));
        return Math.exp(lo * (1 - t));
    }

    /**
     * Apply a new tunnel scale while keeping existing streaks fixed in world space.
     *
     * Streak positions are tunnel-local, so simply changing the object scale would drag
     * every streak with it. During the warp spool-up the scale grows by ~6 orders of
     * magnitude, and that expansion carried streaks outward and ahead faster than they
     * flowed toward the camera, so they didn't visibly pass the ship until ~2c. Instead,
     * local coords are counter-scaled so streaks stay put, and only respawns use the new
     * tunnel size.
     */
    private rescaleStreaks(radialScale: number, depthScale: number): void {
        const prevRadial = this.prevRadialScale;
        const prevDepth = this.prevDepthScale;
        this.prevRadialScale = radialScale;
        this.prevDepthScale = depthScale;
        this.lines.scale.set(radialScale, radialScale, depthScale);
        if (prevRadial === 0 || (prevRadial === radialScale && prevDepth === depthScale)) return;

        const rr = prevRadial / radialScale;
        const rz = prevDepth / depthScale;
        const growing = rz < 1;
        for (let i = 0; i < N_STREAKS; i++) {
            this.radius[i] *= rr;
            this.zPos[i] *= rz;

            if (this.zPos[i] > FAR_SPAWN_Z || this.radius[i] > OUTER_R) {
                // Tunnel shrank and left this streak outside it — refill inside.
                this.seedStreak(i, EXPIRE_Z, FAR_SPAWN_Z);
            } else if (growing && this.zPos[i] + this.len[i] * this.lenMul < 0) {
                // Tunnel is growing: a streak already behind the ship gets squeezed toward
                // the origin and can stall short of EXPIRE_Z. Recycle it ahead of the ship
                // so the tunnel stays populated through the spool-up.
                this.seedStreak(i, 0, FAR_SPAWN_Z);
            }
        }
    }

    /** Interpolate a drift / boost / warp anchor triple at the given level. */
    private anchorLerp(level: number, drift: number, boost: number, warp: number): number {
        if (level <= BOOST_LEVEL) {
            return THREE.MathUtils.lerp(drift, boost, level / BOOST_LEVEL);
        }
        return THREE.MathUtils.lerp(boost, warp, (level - BOOST_LEVEL) / (1 - BOOST_LEVEL));
    }

    private hslToRgb(h: number, s: number, l: number): [number, number, number] {
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        const hue2 = (t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
            return p;
        };
        return [hue2(h + 1 / 3), hue2(h), hue2(h - 1 / 3)];
    }

    /** Write current streak state into the BufferGeometry arrays. */
    private rebuildGeometry(): void {
        for (let i = 0; i < N_STREAKS; i++) {
            const cos = Math.cos(this.angle[i]);
            const sin = Math.sin(this.angle[i]);
            const r = this.radius[i];
            const x = cos * r;
            const y = sin * r;

            // Leading tip (bright, at zPos) — the end closest to camera.
            this.positions[i * 6] = x;
            this.positions[i * 6 + 1] = y;
            this.positions[i * 6 + 2] = this.zPos[i];

            // Trailing tip (dim, farther ahead along +Z).
            this.positions[i * 6 + 3] = x;
            this.positions[i * 6 + 4] = y;
            this.positions[i * 6 + 5] = this.zPos[i] + this.len[i] * this.lenMul;

            const [r3, g3, b3] = this.hslToRgb(this.hue[i], 1.0, 0.75);

            // Leading tip: full brightness.
            this.colors[i * 6] = r3;
            this.colors[i * 6 + 1] = g3;
            this.colors[i * 6 + 2] = b3;

            // Trailing tip: nearly dark (fades into the tunnel ahead).
            const dimBrt = 0.06;
            this.colors[i * 6 + 3] = r3 * dimBrt;
            this.colors[i * 6 + 4] = g3 * dimBrt;
            this.colors[i * 6 + 5] = b3 * dimBrt;
        }

        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.color.needsUpdate = true;
    }

    // ─── public API ─────────────────────────────────────────────────────────

    /** No-op — kept for call-site compatibility. Visibility is driven by speed. */
    start(): void {
        /* no-op */
    }

    /** No-op — kept for call-site compatibility. Visibility is driven by speed. */
    stop(): void {
        /* no-op */
    }

    /**
     * Immediately hide the warp effect regardless of ship speed.
     * Call when the ship is destroyed mid-warp so the frozen tunnel
     * doesn't linger after flight mode exits.
     */
    forceHide(): void {
        this.speedOpacity = 0;
        this._applyOpacity();
    }

    /**
     * Compute the warp effect opacity based on ship speed.
     * 0 at rest → 1 at maxSpeed, with a steep curve at low speeds.
     * @param speedKmPerSec  Ship speed in km/s.
     * @returns  Opacity in [0,1].
     */
    warpOpacity(speed: number, maxSpeed: number): number {
        const alpha = 0.118; // chosen to make opacity(0.001) ≈ 0.1

        const n = speed / maxSpeed;
        let opacity = Math.pow(n, alpha);

        // clamp 0–1
        if (opacity < 0) opacity = 0;
        if (opacity > 1) opacity = 1;

        return opacity;
    }

    /**
     * Call every frame while a ship exists in the scene.
     *
     * @param dt           Delta time in seconds.
     * @param shipPos      World-space position of the ship.
     * @param shipVelocity World-space velocity of the ship.
     * @param speeds       The ship's cruise / boost / warp speed anchors.
     */
    update(
        dt: number,
        shipPos: THREE.Vector3,
        shipVelocity: THREE.Vector3,
        speeds: WarpSpeedProfile
    ): void {
        // Check performance settings
        if (!settingsStore.settings.particleEffectsEnabled) {
            this.lines.visible = false;
            return;
        }

        // Anchor geometry to the ship.
        this.lines.position.copy(shipPos);

        // Get the current speed of the ship.
        const speed = shipVelocity.length();

        this.lines.visible = true;

        // Speed drives the look: drifting dust at cruise → short streaks at boost →
        // long, fast streaks at warp.
        this.level = this.speedLevel(speed, speeds);
        this.lenMul = this.anchorLerp(this.level, LEN_MUL_DRIFT, LEN_MUL_BOOST, LEN_MUL_WARP);

        // Shrink the tunnel around the ship at low speed (see DRIFT_OUTER_RADII).
        const driftDepthScale = THREE.MathUtils.clamp(
            (DRIFT_SPAWN_RADII * speeds.shipRadius) / FAR_SPAWN_Z,
            1e-12,
            1
        );
        const scaleT = Math.pow(this.level, SCALE_CURVE);
        const radialScale = this.tunnelScale(
            scaleT,
            (DRIFT_OUTER_RADII * speeds.shipRadius) / OUTER_R
        );
        const depthScale = this.tunnelScale(scaleT, driftDepthScale);
        this.rescaleStreaks(radialScale, depthScale);

        // Drift flow: stationary dust, so the average particle passes at the ship's own
        // speed (converted to tunnel-local units at the drift depth scale). Above cruise
        // it's anchored at the cruise-speed value and blends into the boost/warp flow.
        const driftFlowMul = Math.min(speed, speeds.cruise) / (AVG_BASE_SPD * driftDepthScale);
        const flowMul = this.anchorLerp(this.level, driftFlowMul, FLOW_MUL_BOOST, FLOW_MUL_WARP);

        // Scale the opacity based on speed. The opacity should scale on a curve, so that it is 0 at rest and 1 at maxSpeed. The curve should be steep at low speeds and flatten out at high speeds.
        this.speedOpacity = this.warpOpacity(speed, speeds.warp);
        this._applyOpacity();

        // Orient tunnel along velocity direction.
        if (speed > 1e-3) {
            this.lines.quaternion.setFromUnitVectors(
                _FWD,
                _dir.copy(shipVelocity).divideScalar(speed)
            );
        }

        // Always advance streaks so they're ready the moment they become visible.
        for (let i = 0; i < N_STREAKS; i++) {
            const step = Math.min(this.speed[i] * flowMul * dt, MAX_STEP);
            this.zPos[i] -= step;
            if (this.zPos[i] + this.len[i] * this.lenMul < EXPIRE_Z) {
                // Jitter the respawn inward by up to this frame's step, so streaks that
                // expire on the same frame don't come back as a flat "wall".
                this.seedStreak(i, FAR_SPAWN_Z - step, FAR_SPAWN_Z);
            }
        }

        this.rebuildGeometry();
    }

    /**
     * Apply a distance-based fade multiplier (0–1).
     * Final opacity = speedOpacity × distanceFade.
     * Call once per frame from the visibility block in index.ts.
     */
    setOpacity(distanceFade: number): void {
        this.distanceFade = distanceFade;
        this._applyOpacity();
    }

    private _applyOpacity(): void {
        const final = this.speedOpacity * this.distanceFade;
        // Crossfade drifting points → streak lines as the ship speeds up.
        const streakMix = THREE.MathUtils.smoothstep(
            this.level,
            STREAK_FADE_START,
            STREAK_FADE_END
        );
        this.mat.opacity = final * streakMix;
        this.pointsMat.opacity = Math.min(1, final * (1 - streakMix) * POINT_OPACITY_GAIN);
        this.lines.visible = final > 0.005;
    }

    dispose(): void {
        this.lines.remove(this.points);
        this.scene.remove(this.lines);
        this.geo.dispose();
        this.mat.dispose();
        this.pointsMat.dispose();
    }
}
