import * as THREE from 'three';
import { SCALE_FACTOR } from '../utilities/consts.js';

// ─── Tunnel geometry constants ───────────────────────────────────────────────
const SF = SCALE_FACTOR;

const N_STREAKS      = 500;

// How far ahead of the ship (along its +Z axis) new streaks spawn.
const FAR_SPAWN_Z    = 3000 * SF;
// Past-the-ship Z at which a streak is fully gone and re-seeded.
const EXPIRE_Z       = -2000 * SF;

// Radial extents of the tunnel cylinder.
const INNER_R        = 10  * SF;
const OUTER_R        = 200 * SF;

// Per-streak length range (along Z axis).
const MIN_LEN        = 40  * SF;
const MAX_LEN        = 200 * SF;

// Per-streak travel speed toward the camera (u/s, along -Z in ship space).
const MIN_SPD        = 500  * SF;
const MAX_SPD        = 1500 * SF;

// Band split: fraction of streaks allocated to the dense outer ring.
const OUTER_BAND_FRAC = 0.70;
// Outer band: 60–100 % of OUTER_R.  Inner cluster: 5–35 % of OUTER_R.
const OUTER_BAND_MIN  = 0.60;
const OUTER_BAND_MAX  = 1.00;
const INNER_BAND_MIN  = 0.05;
const INNER_BAND_MAX  = 0.35;

/**
 * 3-D warp tunnel effect.
 *
 * Renders rainbow speed-streaks arranged in a cylindrical tunnel around the
 * ship's forward axis (+Z in ship-local space).  The geometry lives in the
 * main perspective scene so depth, perspective and camera angle are all
 * handled naturally by Three.js.
 *
 * Usage:
 *   const warpEffect = new WarpEffect(scene);
 *   warpEffect.start();
 *   // each frame:
 *   warpEffect.update(dt, ship.mesh.position, ship.mesh.quaternion);
 *   // to end:
 *   warpEffect.stop();
 */
export class WarpEffect {
    private scene: THREE.Scene;

    // Per-streak state (ship-local coords; origin = ship centre, +Z = forward)
    private angle:  Float32Array;  // radial angle around tunnel axis (rad)
    private radius: Float32Array;  // radial distance from axis (u)
    private zPos:   Float32Array;  // leading-tip Z position (u)
    private speed:  Float32Array;  // travel speed toward camera (u/s, positive)
    private hue:    Float32Array;  // [0,1]
    private len:    Float32Array;  // streak length along Z (u)

    private positions: Float32Array;  // N_STREAKS * 6  (2 verts × xyz)
    private colors:    Float32Array;  // N_STREAKS * 6  (2 verts × rgb)

    private geo: THREE.BufferGeometry;
    private mat: THREE.LineBasicMaterial;
    readonly lines: THREE.LineSegments;

    active = false;

    constructor(scene: THREE.Scene) {
        this.scene = scene;

        this.angle  = new Float32Array(N_STREAKS);
        this.radius = new Float32Array(N_STREAKS);
        this.zPos   = new Float32Array(N_STREAKS);
        this.speed  = new Float32Array(N_STREAKS);
        this.hue    = new Float32Array(N_STREAKS);
        this.len    = new Float32Array(N_STREAKS);

        this.positions = new Float32Array(N_STREAKS * 6);
        this.colors    = new Float32Array(N_STREAKS * 6);

        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geo.setAttribute('color',    new THREE.BufferAttribute(this.colors,    3));

        this.mat = new THREE.LineBasicMaterial({
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
        scene.add(this.lines);

        // Pre-seed all streaks spread along the full tunnel so the effect is
        // immediately populated when start() is called.
        for (let i = 0; i < N_STREAKS; i++) {
            this.seedStreak(i, /*randomZ=*/true);
        }
    }

    // ─── private helpers ────────────────────────────────────────────────────

    /** Assign a fresh random state to streak i.
     *  @param randomZ  true → scatter Z across the tunnel; false → spawn at FAR_SPAWN_Z */
    private seedStreak(i: number, randomZ = false): void {
        this.angle[i] = Math.random() * Math.PI * 2;
        this.hue[i]   = Math.random();
        this.speed[i] = MIN_SPD + Math.random() * (MAX_SPD - MIN_SPD);
        this.len[i]   = MIN_LEN + Math.random() * (MAX_LEN - MIN_LEN);
        this.zPos[i]  = randomZ
            ? EXPIRE_Z + Math.random() * (FAR_SPAWN_Z - EXPIRE_Z)
            : FAR_SPAWN_Z;

        // Concentric bands: 70 % outer ring, 30 % inner cluster.
        const isOuter = i < N_STREAKS * OUTER_BAND_FRAC;
        const bandMin = isOuter ? OUTER_BAND_MIN : INNER_BAND_MIN;
        const bandMax = isOuter ? OUTER_BAND_MAX : INNER_BAND_MAX;
        this.radius[i] = INNER_R + (bandMin + Math.random() * (bandMax - bandMin)) * (OUTER_R - INNER_R);
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
            const r   = this.radius[i];
            const x   = cos * r;
            const y   = sin * r;

            // Leading tip (bright, at zPos) — the end closest to camera.
            this.positions[i * 6]     = x;
            this.positions[i * 6 + 1] = y;
            this.positions[i * 6 + 2] = this.zPos[i];

            // Trailing tip (dim, farther ahead along +Z).
            this.positions[i * 6 + 3] = x;
            this.positions[i * 6 + 4] = y;
            this.positions[i * 6 + 5] = this.zPos[i] + this.len[i];

            const [r3, g3, b3] = this.hslToRgb(this.hue[i], 1.0, 0.75);

            // Leading tip: full brightness.
            this.colors[i * 6]     = r3;
            this.colors[i * 6 + 1] = g3;
            this.colors[i * 6 + 2] = b3;

            // Trailing tip: nearly dark (fades into the tunnel ahead).
            const dimBrt = 0.06;
            this.colors[i * 6 + 3] = r3 * dimBrt;
            this.colors[i * 6 + 4] = g3 * dimBrt;
            this.colors[i * 6 + 5] = b3 * dimBrt;
        }

        this.geo.attributes.position.needsUpdate = true;
        this.geo.attributes.color.needsUpdate    = true;
    }

    // ─── public API ─────────────────────────────────────────────────────────

    start(): void {
        this.active = true;
        this.lines.visible = true;
    }

    stop(): void {
        this.active = false;
        this.lines.visible = false;
    }

    /**
     * Call every frame while warp is active.
     * @param dt        Delta time in seconds.
     * @param shipPos   World-space position of the ship.
     * @param shipQuat  World-space orientation of the ship (+Z = forward).
     */
    update(dt: number, shipPos: THREE.Vector3, shipQuat: THREE.Quaternion): void {
        if (!this.active) return;

        // Anchor the geometry to the ship so positions stay in ship-local space.
        this.lines.position.copy(shipPos);
        this.lines.quaternion.copy(shipQuat);

        // Advance each streak toward the camera (−Z in ship-local space).
        for (let i = 0; i < N_STREAKS; i++) {
            this.zPos[i] -= this.speed[i] * dt;
            // Re-seed once the trailing tip has fully passed the ship's origin.
            if (this.zPos[i] + this.len[i] < EXPIRE_Z) {
                this.seedStreak(i, /*randomZ=*/false);
            }
        }

        this.rebuildGeometry();
    }

    /** Set the material opacity (used for distance-based fade). */
    setOpacity(alpha: number): void {
        this.mat.opacity = alpha;
    }

    /** No-op — kept for call-site compatibility with the previous 2-D version. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    resize(_width: number, _height: number): void { /* no-op */ }

    dispose(): void {
        this.scene.remove(this.lines);
        this.geo.dispose();
        this.mat.dispose();
    }
}
