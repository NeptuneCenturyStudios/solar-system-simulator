import * as THREE from 'three';

const N_LINES = 100;

/**
 * Screen-space warp tunnel effect.
 *
 * Renders rainbow speed-lines radiating from the screen centre outward,
 * creating a classic hyperspace / warp-jump illusion.
 *
 * Lives in the uiScene (OrthographicCamera, screen-pixel coordinates) so it
 * is always drawn on top of the 3-D scene with no world-space depth issues.
 *
 * Usage:
 *   const warpEffect = new WarpEffect(uiScene, window.innerWidth, window.innerHeight);
 *   warpEffect.start();
 *   // each frame:
 *   warpEffect.update(dt);
 *   // to end:
 *   warpEffect.stop();
 */
export class WarpEffect {
    private scene: THREE.Scene;
    private hw: number;   // half screen width  (screen origin at centre)
    private hh: number;   // half screen height

    /** Radial angle for each line (radians) */
    private angles:     Float32Array;
    /** Progress 0→1: how far along the screen radius the outer tip has reached */
    private progress:   Float32Array;
    /** Progress sweep rate (progress units per second) */
    private speed:      Float32Array;
    /** Random hue per line [0,1] */
    private hue:        Float32Array;
    /**
     * Inner endpoint offset as a fraction of maxR (keeps a gap at the centre
     * so all lines don't converge to a single bright dot).
     */
    private innerFrac:  Float32Array;

    private positions: Float32Array;  // N_LINES * 6 (2 verts × xyz)
    private colors:    Float32Array;  // N_LINES * 6 (2 verts × rgb)

    private geo: THREE.BufferGeometry;
    private mat: THREE.LineBasicMaterial;
    readonly lines: THREE.LineSegments;

    active = false;

    constructor(scene: THREE.Scene, width: number, height: number) {
        this.scene = scene;
        this.hw = width  / 2;
        this.hh = height / 2;

        this.angles    = new Float32Array(N_LINES);
        this.progress  = new Float32Array(N_LINES);
        this.speed     = new Float32Array(N_LINES);
        this.hue       = new Float32Array(N_LINES);
        this.innerFrac = new Float32Array(N_LINES);

        this.positions = new Float32Array(N_LINES * 6);
        this.colors    = new Float32Array(N_LINES * 6);

        this.geo = new THREE.BufferGeometry();
        this.geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        this.geo.setAttribute('color',    new THREE.BufferAttribute(this.colors, 3));

        this.mat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            depthTest: false,
        });

        this.lines = new THREE.LineSegments(this.geo, this.mat);
        this.lines.frustumCulled = false;
        this.lines.renderOrder = 900;
        this.lines.visible = false;
        scene.add(this.lines);

        // Pre-seed each line at a random progress so the effect is full
        // when start() is called (no "build-up" wait).
        for (let i = 0; i < N_LINES; i++) {
            this.seedLine(i, /*randomProgress=*/true);
        }
        this.rebuildGeometry();
    }

    // ─── private helpers ────────────────────────────────────────────────────

    /** Assign a fresh random angle / speed / hue to line i. */
    private seedLine(i: number, randomProgress = false): void {
        this.angles[i]    = Math.random() * Math.PI * 2;
        this.speed[i]     = 0.6 + Math.random() * 1.4;   // progress-units / second
        this.hue[i]       = Math.random();
        this.innerFrac[i] = 0.05 + Math.random() * 0.12;
        this.progress[i]  = randomProgress ? Math.random() : 0;
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

    /** Rebuild vertex positions + colours from current state arrays. */
    private rebuildGeometry(): void {
        const maxR = Math.sqrt(this.hw * this.hw + this.hh * this.hh);

        for (let i = 0; i < N_LINES; i++) {
            const cos    = Math.cos(this.angles[i]);
            const sin    = Math.sin(this.angles[i]);
            const p      = this.progress[i];
            const innerR = this.innerFrac[i] * maxR;
            const outerR = Math.min(maxR * 1.05, innerR + p * maxR);

            // Inner vertex
            this.positions[i * 6]     = cos * innerR;
            this.positions[i * 6 + 1] = sin * innerR;
            this.positions[i * 6 + 2] = 0;

            // Outer vertex
            this.positions[i * 6 + 3] = cos * outerR;
            this.positions[i * 6 + 4] = sin * outerR;
            this.positions[i * 6 + 5] = 0;

            const [r, g, b] = this.hslToRgb(this.hue[i], 1.0, 0.75);

            // Inner endpoint: dim / nearly transparent
            const innerBrt = 0.08;
            this.colors[i * 6]     = r * innerBrt;
            this.colors[i * 6 + 1] = g * innerBrt;
            this.colors[i * 6 + 2] = b * innerBrt;

            // Outer endpoint: bright, ramps up as line extends
            const outerBrt = Math.min(1.0, p * 2.5);
            this.colors[i * 6 + 3] = r * outerBrt;
            this.colors[i * 6 + 4] = g * outerBrt;
            this.colors[i * 6 + 5] = b * outerBrt;
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

    /** Call every frame while warp is active. */
    update(dt: number): void {
        if (!this.active) return;

        for (let i = 0; i < N_LINES; i++) {
            this.progress[i] += this.speed[i] * dt;
            if (this.progress[i] > 1.0) {
                this.seedLine(i); // re-spawn with a new random angle / hue
            }
        }

        this.rebuildGeometry();
    }

    /** Call on window resize to keep screen coordinates correct. */
    resize(width: number, height: number): void {
        this.hw = width  / 2;
        this.hh = height / 2;
    }

    dispose(): void {
        this.scene.remove(this.lines);
        this.geo.dispose();
        this.mat.dispose();
    }
}
