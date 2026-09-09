import * as THREE from 'three';
import type { IMagneticFieldOptions } from '../interfaces';
import { computeMagneticAxis } from '../procedural/magnetic-field';
import { SeededRandom } from '../utilities/prng';
import { settingsStore } from '../settings/settings-store';

export type AuroraHandle = {
    dispose: () => void;
    /** Advances the curtain drift and brightness pulse. `dtTotal` is signed, so time reversal reverses the drift. */
    update: (dtTotal: number) => void;
    setVisible: (visible: boolean) => void;
    /** Rescales the whole effect after the host body's radius changes — no geometry rebuild. */
    setRadius: (radius: number) => void;
};

/** Segments around each auroral oval. 128 keeps the warped ring smooth at close range. */
const RING_SEGMENTS = 128;

/** How many times the curtain texture tiles around one full oval. */
const TEXTURE_REPEAT = 8;

/** Curtain texture dimensions. Wide and short — it tiles horizontally around the ring. */
const TEX_WIDTH = 512;
const TEX_HEIGHT = 128;

/** Base of the curtain sits just above the surface so it never z-fights with the planet mesh. */
const BASE_ALTITUDE = 1.005;

/**
 * Gauss range used to normalise field strength. Spans the real spread from a
 * Mercury-like whisper (0.003 G) to well past Jupiter (4.17 G).
 */
const MIN_GAUSS = 0.001;
const MAX_GAUSS = 10;

/** Auroral oval co-latitude, in degrees from the magnetic pole, at min and max field strength. */
const OVAL_COLATITUDE_WEAK = 30;
const OVAL_COLATITUDE_STRONG = 14;

/** Curtain height as a fraction of body radius, at min and max field strength. */
const CURTAIN_HEIGHT_WEAK = 0.025;
const CURTAIN_HEIGHT_STRONG = 0.075;

/** Base opacity at min and max field strength. */
const OPACITY_WEAK = 0.18;
const OPACITY_STRONG = 0.95;

/** The two concentric layers drawn per pole: co-latitude scale, opacity scale, and drift rate. */
const LAYERS = [
    { colatitudeMult: 1.0, opacityMult: 1.0, drift: 0.035 },
    { colatitudeMult: 1.14, opacityMult: 0.55, drift: -0.022 },
];

function clamp01(v: number): number {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Draws the aurora curtain texture: a vertical emission-colour gradient crossed by
 * ragged vertical striations.
 *
 * The gradient follows the real altitude banding of auroral emission — atomic oxygen
 * red (630 nm) high up, oxygen green (557.7 nm) forming the bright core, and an
 * ionised-nitrogen violet fringe along the bottom edge.
 *
 * `CanvasTexture` flips Y, so canvas row 0 becomes v = 1 — the *top* of the curtain.
 */
function drawCurtainTexture(rng: SeededRandom): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = TEX_WIDTH;
    canvas.height = TEX_HEIGHT;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    const grad = ctx.createLinearGradient(0, 0, 0, TEX_HEIGHT);
    grad.addColorStop(0.0, 'rgba(255, 60, 110, 0.0)'); // fades out at the very top
    grad.addColorStop(0.18, 'rgba(255, 70, 120, 0.35)'); // high-altitude oxygen red
    grad.addColorStop(0.4, 'rgba(120, 255, 190, 0.75)'); // cyan-green transition
    grad.addColorStop(0.75, 'rgba(60, 255, 140, 0.95)'); // oxygen green core
    grad.addColorStop(0.92, 'rgba(150, 90, 255, 0.7)'); // nitrogen violet fringe
    grad.addColorStop(1.0, 'rgba(120, 70, 220, 0.0)'); // fades out at the base
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, TEX_WIDTH, TEX_HEIGHT);

    // Striations. Drawn additively so overlapping bands brighten rather than flatten.
    ctx.globalCompositeOperation = 'lighter';

    const drawBand = (x: number, width: number, alpha: number) => {
        // Any band crossing the right edge is drawn again on the left so the texture tiles.
        for (const originX of x + width > TEX_WIDTH ? [x, x - TEX_WIDTH] : [x]) {
            const bandGrad = ctx.createLinearGradient(originX, 0, originX + width, 0);
            bandGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
            bandGrad.addColorStop(0.5, `rgba(255, 255, 255, ${alpha})`);
            bandGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = bandGrad;
            ctx.fillRect(originX, 0, width, TEX_HEIGHT);
        }
    };

    // Fine bands give the curtain its rayed structure.
    for (let i = 0; i < 160; i++) {
        drawBand(rng.range(0, TEX_WIDTH), rng.range(1, 8), rng.range(0.05, 0.35));
    }

    // A second, wider and dimmer pass groups those rays into broader folds.
    for (let i = 0; i < 24; i++) {
        drawBand(rng.range(0, TEX_WIDTH), rng.range(20, 70), rng.range(0.04, 0.12));
    }

    // Low-frequency brightness modulation so the finished ring has bright and dim arcs
    // instead of glowing uniformly all the way around.
    ctx.globalCompositeOperation = 'destination-in';
    const modPhase = rng.range(0, Math.PI * 2);
    const modPhase2 = rng.range(0, Math.PI * 2);
    for (let x = 0; x < TEX_WIDTH; x++) {
        const u = (x / TEX_WIDTH) * Math.PI * 2;
        // Harmonics 1 and 3 both tile exactly over the texture width, keeping the seam seamless.
        const m = 0.55 + 0.3 * Math.sin(u + modPhase) + 0.15 * Math.sin(3 * u + modPhase2);
        ctx.fillStyle = `rgba(0, 0, 0, ${clamp01(m)})`;
        ctx.fillRect(x, 0, 1, TEX_HEIGHT);
    }
    ctx.globalCompositeOperation = 'source-over';

    return canvas;
}

/**
 * Builds one auroral oval as a closed ribbon of quads around the magnetic pole.
 *
 * Geometry is generated in a frame where the magnetic axis is +Y; the caller rotates the
 * containing group onto the real axis. `hemisphere` is +1 for the northern oval and -1 for
 * the southern one, which mirrors the band through the equatorial plane.
 */
function buildRibbonGeometry(
    radius: number,
    colatitudeRad: number,
    curtainHeight: number,
    hemisphere: 1 | -1,
    rng: SeededRandom
): THREE.BufferGeometry {
    // Seeded harmonics warp the oval away from a perfect circle. Integer harmonic numbers
    // keep the wobble continuous across the φ = 0 seam.
    const warp = [2, 3, 5].map((harmonic) => ({
        harmonic,
        amplitude: rng.range(0.04, 0.12),
        phase: rng.range(0, Math.PI * 2),
    }));
    const heightWobble = [2, 4, 7].map((harmonic) => ({
        harmonic,
        amplitude: rng.range(0.1, 0.3),
        phase: rng.range(0, Math.PI * 2),
    }));

    const baseRadius = radius * BASE_ALTITUDE;

    // One extra vertex pair closes the ring. It sits exactly on top of the first pair —
    // φ = 2π and the integer warp harmonics both repeat — but carries u = TEXTURE_REPEAT
    // instead of u = 0. Wrapping the last quad back onto vertex 0 instead would run the
    // texture backwards across the entire seam segment, leaving a smeared vertical band.
    const vertexPairs = RING_SEGMENTS + 1;
    const positions = new Float32Array(vertexPairs * 2 * 3);
    const uvs = new Float32Array(vertexPairs * 2 * 2);
    const indices: number[] = [];

    for (let i = 0; i < vertexPairs; i++) {
        const phi = (i / RING_SEGMENTS) * Math.PI * 2;

        let warpSum = 0;
        for (const w of warp) warpSum += w.amplitude * Math.sin(w.harmonic * phi + w.phase);
        const theta = colatitudeRad * (1 + warpSum);

        let wobbleSum = 0;
        for (const w of heightWobble) {
            wobbleSum += w.amplitude * Math.sin(w.harmonic * phi + w.phase);
        }
        const height = curtainHeight * (0.6 + 0.4 * (0.5 + 0.5 * wobbleSum));

        // The top edge leans poleward, mimicking magnetic field lines converging on the pole.
        const thetaTop = Math.max(0, theta - (height / radius) * 0.35);

        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);

        const baseIdx = i * 2;
        const p = baseIdx * 3;
        positions[p] = Math.sin(theta) * cosPhi * baseRadius;
        positions[p + 1] = hemisphere * Math.cos(theta) * baseRadius;
        positions[p + 2] = Math.sin(theta) * sinPhi * baseRadius;

        const topRadius = baseRadius + height;
        positions[p + 3] = Math.sin(thetaTop) * cosPhi * topRadius;
        positions[p + 4] = hemisphere * Math.cos(thetaTop) * topRadius;
        positions[p + 5] = Math.sin(thetaTop) * sinPhi * topRadius;

        const u = (i / RING_SEGMENTS) * TEXTURE_REPEAT;
        const t = baseIdx * 2;
        uvs[t] = u;
        uvs[t + 1] = 0;
        uvs[t + 2] = u;
        uvs[t + 3] = 1;

        // The duplicated seam pair is a vertex target only — it starts no quad of its own.
        if (i < RING_SEGMENTS) {
            const nextBase = (i + 1) * 2;
            indices.push(baseIdx, baseIdx + 1, nextBase + 1);
            indices.push(baseIdx, nextBase + 1, nextBase);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeBoundingSphere();
    return geo;
}

/**
 * Aurora curtains ringing a body's magnetic poles.
 *
 * Rendered as texture-mapped ribbon meshes rather than particles: each oval is a closed
 * band of quads wrapped around the magnetic pole, carrying a procedurally drawn curtain
 * texture that scrolls to give the drifting shimmer. Two concentric layers per pole drift
 * in opposite directions, which reads as depth.
 *
 * The group is added as a child of `parent` (the body mesh), so it inherits axial tilt and
 * spin automatically. That is also physically right: the auroral oval is fixed in magnetic
 * coordinates and turns with the body.
 *
 * Brightness, curtain height, and how tightly the oval hugs the pole all come from the
 * body's real dipole data — see `IMagneticFieldOptions`.
 *
 * @param radius Host body radius, in the same units as the body mesh.
 * @param field The body's dipole; `strength` (gauss) drives intensity, `tilt`/`azimuth` the axis.
 * @param seed Deterministic seed string for the curtain texture and oval warp.
 * @param parent Object3D to attach to — the body mesh.
 */
export function createAurora(
    radius: number,
    field: IMagneticFieldOptions,
    seed: string,
    parent: THREE.Object3D
): AuroraHandle {
    const rng = new SeededRandom(`${seed}|aurora`);

    // Log-scale the strength: the real spread (Mercury 0.003 G to Jupiter 4.17 G) is so wide
    // that a linear map would leave everything but the gas giants invisible.
    const strength = Number.isFinite(field.strength)
        ? Math.max(field.strength, MIN_GAUSS)
        : MIN_GAUSS;
    const intensity = clamp01(
        (Math.log(strength) - Math.log(MIN_GAUSS)) / (Math.log(MAX_GAUSS) - Math.log(MIN_GAUSS))
    );

    const baseColatitude = THREE.MathUtils.degToRad(
        lerp(OVAL_COLATITUDE_WEAK, OVAL_COLATITUDE_STRONG, intensity)
    );
    const baseHeight = radius * lerp(CURTAIN_HEIGHT_WEAK, CURTAIN_HEIGHT_STRONG, intensity);
    const baseOpacity = lerp(OPACITY_WEAK, OPACITY_STRONG, intensity);

    // A displaced dipole sits closer to one pole, so that hemisphere gets a tighter, brighter
    // oval and the far one a wider, dimmer one — the asymmetry Neptune shows at offset ≈0.55.
    // `reversed` flips which hemisphere the dipole moment points toward.
    const offset = clamp01(field.offset ?? 0);
    const nearHemisphere: 1 | -1 = field.reversed ? -1 : 1;

    const group = new THREE.Group();

    // Hue jitter so same-strength bodies aren't visually identical, matching the
    // atmosphere-tint idiom in the planet factory.
    const tint = new THREE.Color(0xffffff);
    tint.offsetHSL((rng.next() - 0.5) * 0.06, 0, 0);

    const canvas = drawCurtainTexture(rng);
    // One CanvasTexture, cloned per layer: clones share `.source`, so this is a single GPU
    // upload, but each clone carries its own `offset` and can scroll independently.
    const baseTexture = new THREE.CanvasTexture(canvas);
    baseTexture.wrapS = THREE.RepeatWrapping;
    baseTexture.wrapT = THREE.ClampToEdgeWrapping;
    baseTexture.needsUpdate = true;

    type Ribbon = {
        geo: THREE.BufferGeometry;
        mat: THREE.MeshBasicMaterial;
        tex: THREE.Texture;
        drift: number;
        baseOpacity: number;
        pulsePhase: number;
        pulseRate: number;
    };
    const ribbons: Ribbon[] = [];

    for (const hemisphere of [1, -1] as const) {
        const isNear = hemisphere === nearHemisphere;
        const colatitudeScale = isNear ? 1 - offset * 0.6 : 1 + offset * 0.6;
        const opacityScale = Math.min(isNear ? 1 + offset * 0.8 : 1 - offset * 0.8, 1.4);

        for (const layer of LAYERS) {
            const colatitude = baseColatitude * colatitudeScale * layer.colatitudeMult;
            const geo = buildRibbonGeometry(radius, colatitude, baseHeight, hemisphere, rng);

            const tex = baseTexture.clone();
            tex.needsUpdate = true;

            const opacity = clamp01(baseOpacity * opacityScale * layer.opacityMult);
            const mat = new THREE.MeshBasicMaterial({
                map: tex,
                color: tint,
                transparent: true,
                blending: THREE.AdditiveBlending,
                opacity,
                depthWrite: false,
                depthTest: true,
                side: THREE.DoubleSide,
            });

            const mesh = new THREE.Mesh(geo, mat);
            // Above the cloud layer (2) and atmosphere shell (1).
            mesh.renderOrder = 3;
            group.add(mesh);

            ribbons.push({
                geo,
                mat,
                tex,
                drift: layer.drift,
                baseOpacity: opacity,
                pulsePhase: rng.range(0, Math.PI * 2),
                pulseRate: rng.range(0.15, 0.35),
            });
        }
    }

    // `setRotation` bakes axial tilt into the body mesh's quaternion and leaves `rotationAxis`
    // as the mesh-local +Y, so the local rotation axis to tilt away from is always +Y here.
    const magneticAxis = computeMagneticAxis(new THREE.Vector3(0, 1, 0), field);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), magneticAxis);

    parent.add(group);

    // Remembered so setRadius can rescale rather than rebuild every ribbon.
    const builtRadius = radius;
    let elapsed = 0;

    return {
        dispose: () => {
            if (group.parent) group.parent.remove(group);
            for (const r of ribbons) {
                r.geo.dispose();
                r.mat.dispose();
                r.tex.dispose();
            }
            baseTexture.dispose();
        },

        update: (dtTotal: number) => {
            if (!settingsStore.settings.auroraEnabled) {
                group.visible = false;
                return;
            }
            group.visible = true;

            elapsed += dtTotal;
            for (const r of ribbons) {
                // Signed, so reversing simulation time reverses the curtain drift.
                r.tex.offset.x += r.drift * dtTotal;
                r.mat.opacity =
                    r.baseOpacity * (0.75 + 0.25 * Math.sin(elapsed * r.pulseRate + r.pulsePhase));
            }
        },

        setVisible: (visible: boolean) => {
            group.visible = visible;
        },

        setRadius: (newRadius: number) => {
            if (!Number.isFinite(newRadius) || newRadius <= 0 || builtRadius <= 0) return;
            group.scale.setScalar(newRadius / builtRadius);
        },
    };
}
