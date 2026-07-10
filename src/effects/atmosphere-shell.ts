import * as THREE from 'three';

export type AtmosphereShellHandle = {
    dispose: () => void;
    /** No-op — sprite follows parent transform automatically. Kept for API compatibility. */
    update: (opts: { cameraPosWorld: THREE.Vector3 }) => void;
    setVisible: (visible: boolean) => void;
};

/**
 * Atmosphere haze rendered as a billboard sprite with a radial-gradient canvas texture.
 *
 * The gradient is transparent over the planet disc and glows outward from the limb,
 * producing a soft haze that fades away — similar to the star-glow effect but without
 * the pulse and sized for a planetary atmosphere.
 *
 * The sprite is added as a child of `parent` (the planet mesh) so it follows the planet
 * automatically with no per-frame update required.
 */
export function createAtmosphereShell(
    scene: THREE.Scene,
    radius: number,
    tint: THREE.Color | number = 0x5599ff,
    parent: THREE.Object3D | null = null
): AtmosphereShellHandle {
    const color = tint instanceof THREE.Color ? tint.clone() : new THREE.Color(tint);

    // How many times larger than `radius` the sprite is on each side.
    // With this value the planet disc edge sits at ~67 % of the sprite's half-width
    // (accounting for the atmosphere radius being ~1.07 × planet radius), leaving
    // ~33 % for the haze ring to bloom and fade.
    const SCALE_MULT = 2.8;
    const CANVAS_SIZE = 256;
    const HALF = CANVAS_SIZE / 2;

    // Planet disc edge as a fraction of the sprite's half-width.
    // radius ≈ 1.07 × planet radius, so:  disc_frac = (1/1.07) × (2/SCALE_MULT) ≈ 0.668
    const discEdge = (2 / SCALE_MULT) * (1 / 1.07);

    const r = Math.round(color.r * 255);
    const g = Math.round(color.g * 255);
    const b = Math.round(color.b * 255);

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const grad = ctx.createRadialGradient(HALF, HALF, 0, HALF, HALF, HALF);
    grad.addColorStop(0,                             'rgba(0, 0, 0, 0)');
    grad.addColorStop(Math.max(discEdge - 0.07, 0), 'rgba(0, 0, 0, 0)');
    grad.addColorStop(discEdge,                      `rgba(${r}, ${g}, ${b}, 0.85)`);
    grad.addColorStop(Math.min(discEdge + 0.18, 1), `rgba(${r}, ${g}, ${b}, 0.12)`);
    grad.addColorStop(1,                             'rgba(0, 0, 0, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;

    const mat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.8,
        depthWrite: false,
        depthTest: true,
    });

    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(radius * SCALE_MULT);
    sprite.renderOrder = 1;

    if (parent) parent.add(sprite);
    else scene.add(sprite);

    return {
        dispose: () => {
            if (sprite.parent) sprite.parent.remove(sprite);
            tex.dispose();
            mat.dispose();
        },
        update: (_opts) => {
            // No-op: sprite position is inherited from parent mesh.
        },
        setVisible: (visible) => {
            sprite.visible = visible;
        },
    };
}
