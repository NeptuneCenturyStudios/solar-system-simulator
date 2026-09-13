import * as THREE from 'three';

/**
 * Shared canvas-2D painters for the UI overlay.
 *
 * Every routine here is lifted verbatim from the indicator that owned it, so the rendered
 * pixels are unchanged — the constants that genuinely differed between call sites (padding,
 * bracket length, fonts) became parameters rather than being unified.
 */

// ── Themes ───────────────────────────────────────────────────────────────────

export interface HudTheme {
    /** Corner brackets, and the primary text in panels that draw one. */
    accent: string;
    /** Outer border stroke. */
    border: string;
    /** Shadow colour behind the primary text. */
    glow: string;
    /** Panel background fill. */
    bg: string;
}

/** Standard cyan HUD panel. */
export const HUD_THEME: HudTheme = {
    accent: '#00ffcc',
    border: 'rgba(0, 255, 204, 0.35)',
    glow: 'rgba(0, 255, 204, 0.9)',
    bg: 'rgba(0, 8, 16, 0.50)',
};

/** Red panel used when the subject body has `isThreat` set. */
export const THREAT_THEME: HudTheme = {
    accent: '#ff3c3c',
    border: 'rgba(255, 60, 60, 0.35)',
    glow: 'rgba(255, 60, 60, 0.9)',
    bg: 'rgba(40, 6, 6, 0.55)',
};

/** Red-orange panel used by the cancel-autopilot prompt. */
export const CANCEL_THEME: HudTheme = {
    accent: 'rgba(255, 80, 60, 0.75)',
    border: 'rgba(255, 80, 60, 0.35)',
    glow: 'rgba(255, 80, 60, 0.9)',
    bg: 'rgba(0, 8, 16, 0.50)',
};

/** Pick the panel theme for a body based on its threat flag. */
export function panelThemeFor(isThreat: boolean): HudTheme {
    return isThreat ? THREAT_THEME : HUD_THEME;
}

// ── Text measurement ─────────────────────────────────────────────────────────

let measureCtx: CanvasRenderingContext2D | null = null;

/**
 * A shared 1×1 scratch context for `measureText`.
 *
 * Panels that size their canvas to fit their text have to measure before resizing, and
 * resizing a canvas resets its context state — so measuring on the sprite's own context
 * would be both awkward and wasteful. One scratch context serves every panel.
 */
export function getMeasureContext(): CanvasRenderingContext2D {
    if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
    return measureCtx;
}

// ── Panel frame ──────────────────────────────────────────────────────────────

/**
 * Draw the background, outer border and four corner accent brackets that every HUD panel
 * shares. Does not clear the canvas — callers do that, because they know their own bounds.
 *
 * `pad` and `accentLen` are parameters because the two existing panels genuinely differ:
 * the name panel uses 12 / 10, the autopilot target panel uses 15 / 14.
 */
export function drawPanelFrame(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    pad: number,
    accentLen: number,
    theme: HudTheme
): void {
    // Reset the shadow explicitly. The panel painters this replaces relied on whatever
    // shadow state the previous draw happened to leave on the context, which meant the
    // background rect picked up a faint dark halo on repeat draws but not on the first
    // draw after a canvas resize. Zeroing it here makes the frame deterministic.
    ctx.shadowBlur = 0;

    ctx.fillStyle = theme.bg;
    ctx.fillRect(pad, pad, width - pad * 2, height - pad * 2);

    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(pad, pad, width - pad * 2, height - pad * 2);

    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 2;

    // top-left
    ctx.beginPath();
    ctx.moveTo(pad, pad + accentLen);
    ctx.lineTo(pad, pad);
    ctx.lineTo(pad + accentLen, pad);
    ctx.stroke();
    // top-right
    ctx.beginPath();
    ctx.moveTo(width - pad - accentLen, pad);
    ctx.lineTo(width - pad, pad);
    ctx.lineTo(width - pad, pad + accentLen);
    ctx.stroke();
    // bottom-left
    ctx.beginPath();
    ctx.moveTo(pad, height - pad - accentLen);
    ctx.lineTo(pad, height - pad);
    ctx.lineTo(pad + accentLen, height - pad);
    ctx.stroke();
    // bottom-right
    ctx.beginPath();
    ctx.moveTo(width - pad - accentLen, height - pad);
    ctx.lineTo(width - pad, height - pad);
    ctx.lineTo(width - pad, height - pad - accentLen);
    ctx.stroke();
}

// ── Key-prompt ring ──────────────────────────────────────────────────────────

export interface KeyPromptRingTheme {
    /** Subtle wash inside the circle. */
    circleFill: string;
    /** The circle's outline. */
    ringBorder: string;
}

/** Cyan ring used for the "hold E to engage autopilot" prompt. */
export const HUD_RING_THEME: KeyPromptRingTheme = {
    circleFill: 'rgba(0, 255, 204, 0.07)',
    ringBorder: 'rgba(0, 255, 204, 0.55)',
};

/** Red-orange ring used for the "press E to cancel autopilot" prompt. */
export const CANCEL_RING_THEME: KeyPromptRingTheme = {
    circleFill: 'rgba(255, 80, 60, 0.07)',
    ringBorder: 'rgba(255, 80, 60, 0.65)',
};

export interface KeyPromptRingOptions {
    cx: number;
    cy: number;
    radius: number;
    /** Progress arc in [0, 1]. Pass 0 or less to draw the ring with no progress arc. */
    fill: number;
    /** The key cap letter drawn inside the circle. */
    key: string;
    /** Caption drawn to the right of the circle. */
    label: string;
    theme: KeyPromptRingTheme;
    /** Overrides the default key-letter colour, which brightens once the arc starts filling. */
    keyColor?: string;
}

/**
 * Draw a circular key prompt: a ring, an optional clockwise progress arc starting at
 * twelve o'clock, the key letter centred inside, and a caption to its right.
 *
 * Replaces the near-identical ring code in `PlanetNameIndicator.drawPanel` (the autopilot
 * charge prompt) and `PlanetNameIndicator.drawCancelRingOnly` (the cancel prompt).
 */
export function drawKeyPromptRing(
    ctx: CanvasRenderingContext2D,
    options: KeyPromptRingOptions
): void {
    const { cx, cy, radius, fill, key, label, theme } = options;

    // Reset the shadow for the same reason as drawPanelFrame — the circle wash must not
    // inherit a glow from whatever the caller drew last.
    ctx.shadowBlur = 0;

    // Subtle background wash inside the circle
    ctx.fillStyle = theme.circleFill;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // 4 px thick outer ring border
    ctx.strokeStyle = theme.ringBorder;
    ctx.lineWidth = 4;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Clockwise fill arc drawn on top — white with glow
    if (fill > 0) {
        const startAngle = -Math.PI / 2;
        const endAngle = startAngle + fill * Math.PI * 2;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(cx, cy, radius, startAngle, endAngle);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // Key letter centred inside the circle
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px monospace';
    ctx.shadowBlur = 0;
    ctx.fillStyle = options.keyColor ?? (fill > 0 ? '#ffffff' : 'rgba(255,255,255,0.80)');
    ctx.fillText(key, cx, cy);

    // Caption to the right of the circle
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = '20px monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.70)';
    ctx.fillText(label, cx + radius + 10, cy);
}

// ── Gauge track ──────────────────────────────────────────────────────────────

/**
 * Draw the empty track shared by the warp-charge bar and the thermal gauge — the same
 * translucent cyan fill and outline in both, differing only in orientation, which is
 * expressed by the rectangle the caller passes.
 *
 * The gradient fill on top differs per gauge, so each caller still paints its own.
 */
export function drawGaugeTrack(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number
): void {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,255,204,0.12)';
    ctx.strokeStyle = 'rgba(0,255,204,0.5)';
    ctx.lineWidth = 2;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
}

// ── Edge chevron ─────────────────────────────────────────────────────────────

/**
 * Build the arrow-head texture used for off-screen edge markers.
 *
 * `AutopilotTargetIndicator` and `ThreatIndicator` each had a private copy of this that
 * differed only in colour. The result is static, so one texture is shared by every pooled
 * marker sprite and never redrawn.
 */
export function createChevronTexture(color: string, glow: string): THREE.CanvasTexture {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d')!;

    ctx.shadowBlur = 12;
    ctx.shadowColor = glow;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const cx = S / 2;
    const cy = S / 2;
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy - 15);
    ctx.lineTo(cx + 15, cy);
    ctx.lineTo(cx - 11, cy + 15);
    ctx.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}
