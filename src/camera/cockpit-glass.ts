import * as THREE from 'three';
import { SeededRandom } from '../utilities/prng';

// ── Tuning ──────────────────────────────────────────────────────────────────
/** Tint of the canopy glass (lit by starlight and the interior fill). */
const GLASS_TINT = 0xb8c8d8;
/** Opacity of clean glass. Keep tiny: everything here dims the view of space. */
const GLASS_CLEAN_ALPHA = 0.035;
/** Opacity of the heaviest smudge. */
const GLASS_SMUDGE_ALPHA = 0.22;
/** Smudges are rough, so they scatter starlight into a soft glow instead of a glint. */
const GLASS_ROUGHNESS = 0.55;
/** How much of the cockpit interior is reflected on the glass (additive). */
const GLASS_REFLECTIVITY = 0.09;
/** Edge length of each face of the reflection cube map, in pixels. */
const REFLECTION_RESOLUTION = 256;
/** Seconds between reflection captures. Matches the dashboard refresh. */
const REFLECTION_INTERVAL = 0.1;
/** Smudge texture size, and its seed so every session gets the same smudges. */
const SMUDGE_TEXTURE_SIZE = 512;
const SMUDGE_SEED = 'cockpit-canopy-smudges';

/**
 * The cockpit canopy glass: a faint tint with smudges, plus a slight reflection of the
 * cockpit interior (the dashboard screens glow on the glass).
 *
 * The model marks its glass meshes with a `glass` extra. Each gets two layers sharing
 * its geometry:
 *  - tint: lit, barely-there glass whose alpha map is the smudge texture, so smudges are
 *    what actually catches the light;
 *  - reflection: an additive layer sampling a cube map of the cockpit captured from the
 *    pilot's eye. Additive blending means the reflection only ever adds light, so it never
 *    darkens the view of space the way a more opaque glass would.
 */
export class CockpitGlass {
    private readonly cubeTarget = new THREE.WebGLCubeRenderTarget(REFLECTION_RESOLUTION);
    private readonly cubeCamera: THREE.CubeCamera;
    private readonly smudgeTexture = createSmudgeTexture();
    private readonly tintMaterial: THREE.MeshStandardMaterial;
    private readonly reflectionMaterial: THREE.MeshBasicMaterial;
    /** Every glass layer, hidden while the reflection is captured so it can't see itself. */
    private readonly layers: THREE.Mesh[] = [];
    private captureTimer = REFLECTION_INTERVAL;

    /**
     * @param scene The cockpit overlay scene. The capture camera sits at its origin, which
     *              is the pilot's eye.
     */
    constructor(scene: THREE.Scene) {
        this.cubeCamera = new THREE.CubeCamera(0.02, 20, this.cubeTarget);
        scene.add(this.cubeCamera);

        this.tintMaterial = new THREE.MeshStandardMaterial({
            color: GLASS_TINT,
            metalness: 0,
            roughness: GLASS_ROUGHNESS,
            transparent: true,
            opacity: GLASS_SMUDGE_ALPHA,
            alphaMap: this.smudgeTexture,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        this.reflectionMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            envMap: this.cubeTarget.texture,
            combine: THREE.AddOperation,
            reflectivity: GLASS_REFLECTIVITY,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
    }

    /** Give every mesh tagged `glass` under `root` the tint + reflection layers. */
    bind(root: THREE.Object3D): void {
        const glassMeshes: THREE.Mesh[] = [];
        root.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (mesh.isMesh && mesh.userData.glass) glassMeshes.push(mesh);
        });

        for (const mesh of glassMeshes) {
            const authored = mesh.material;
            mesh.material = this.tintMaterial;
            if (Array.isArray(authored)) authored.forEach((m) => m.dispose());
            else authored.dispose();
            // Transparent layers draw after the opaque cockpit; reflection last.
            mesh.renderOrder = 10;

            const reflection = new THREE.Mesh(mesh.geometry, this.reflectionMaterial);
            reflection.renderOrder = 11;
            mesh.add(reflection);

            this.layers.push(mesh, reflection);
        }
    }

    /** Advance the capture timer (real seconds). */
    tick(wallDt: number): void {
        this.captureTimer += wallDt;
    }

    /**
     * Re-capture the interior reflection if it's due. Call from the overlay render, before
     * the cockpit is drawn, while `renderer.autoClear` is still on so the cube faces clear.
     */
    captureReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene): void {
        if (this.layers.length === 0 || this.captureTimer < REFLECTION_INTERVAL) return;
        this.captureTimer = 0;
        for (const layer of this.layers) layer.visible = false;
        this.cubeCamera.update(renderer, scene);
        for (const layer of this.layers) layer.visible = true;
    }

    dispose(): void {
        this.cubeCamera.removeFromParent();
        this.cubeTarget.dispose();
        this.smudgeTexture.dispose();
        this.tintMaterial.dispose();
        this.reflectionMaterial.dispose();
        this.layers.length = 0;
    }
}

/**
 * Paint the smudge alpha map: soft blotches, fingerprint clusters and a few wipe streaks,
 * concentrated low on the sides where a pilot would touch the canopy. Grey level is alpha:
 * the background is clean glass, white is the heaviest smudge.
 *
 * UV layout (from the Blender build script): u runs across the canopy from the left sill
 * (0) to the right sill (1); v runs from the nose to the back.
 */
function createSmudgeTexture(): THREE.CanvasTexture {
    const size = SMUDGE_TEXTURE_SIZE;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    if (!ctx) return texture;

    const rng = new SeededRandom(SMUDGE_SEED);
    const clean = Math.round((GLASS_CLEAN_ALPHA / GLASS_SMUDGE_ALPHA) * 255);
    ctx.fillStyle = `rgb(${clean}, ${clean}, ${clean})`;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';

    /** A u position biased toward the sills (0 and 1). */
    const sideU = (): number => {
        const edge = rng.range(0.03, 0.3);
        return rng.next() < 0.5 ? edge : 1 - edge;
    };

    const blob = (x: number, y: number, rx: number, ry: number, strength: number): void => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rng.range(0, Math.PI));
        ctx.scale(1, ry / rx);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
        g.addColorStop(0, `rgba(255,255,255,${strength})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    };

    // Broad haze patches.
    for (let i = 0; i < 9; i++) {
        const r = rng.range(40, 110);
        blob(sideU() * size, rng.range(0.1, 0.9) * size, r, r * rng.range(0.5, 1), rng.range(0.08, 0.18));
    }

    // Fingerprint clusters: a few small oval prints close together.
    for (let c = 0; c < 6; c++) {
        const cx = sideU() * size;
        const cy = rng.range(0.15, 0.75) * size;
        const prints = 2 + Math.floor(rng.range(0, 4));
        for (let p = 0; p < prints; p++) {
            const r = rng.range(7, 13);
            blob(cx + rng.range(-28, 28), cy + rng.range(-20, 20), r, r * 1.4, rng.range(0.35, 0.6));
        }
    }

    // Wipe streaks: wide, very soft arcs.
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
        const x0 = sideU() * size;
        const y0 = rng.range(0.2, 0.8) * size;
        ctx.strokeStyle = `rgba(255,255,255,${rng.range(0.06, 0.12)})`;
        ctx.lineWidth = rng.range(14, 30);
        ctx.shadowColor = 'rgba(255,255,255,0.5)';
        ctx.shadowBlur = 18;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo(
            x0 + rng.range(-60, 60),
            y0 + rng.range(-80, 80),
            x0 + rng.range(-90, 90),
            y0 + rng.range(-120, 120)
        );
        ctx.stroke();
    }
    ctx.shadowBlur = 0;

    texture.needsUpdate = true;
    return texture;
}
