import * as THREE from 'three';
import { formatAltitude, formatAU, formatDistance, formatSpeed } from '../utilities/display-format';

/**
 * Everything the cockpit displays show, gathered once per refresh by CockpitView.
 * Distances and speeds are in sim units; the painters format them for display.
 */
export interface ICockpitTelemetry {
    shipName: string;
    /** Current flight speed magnitude (sim units/s); see `reversing` for direction. */
    speed: number;
    /** True when the ship is moving backwards along its nose (negative forward speed). */
    reversing: boolean;
    /** Top speed of the tier the ship is flying in, for the speed gauge. */
    speedGaugeMax: number;
    /**
     * Flight regime label: CRUISE, BOOST, WARP, WARP CHG, LANDING, GROUNDED, LAUNCH CHG, LIFT-OFF. Comes
     * from the drive, not the speed.
     */
    regime: string;
    /** LOW or HIGH speed tier. */
    speedTier: 'LOW' | 'HIGH';
    /** Guidance (velocity reference frame) status. */
    guidance: 'off' | 'standby' | 'matching' | 'locked';
    /** Name of the body guidance is tracking, when matching or locked. */
    guidanceBodyName: string | null;
    /** 0..1 while the warp drive is charging, otherwise 0. */
    warpCharge: number;
    /** 0..1 while a grounded ship is charging its lift-off, otherwise 0. */
    launchCharge: number;

    shieldFraction: number;
    hullFraction: number;
    weaponName: string | null;
    weaponHeat: number;
    weaponOverheated: boolean;

    /** Ship position in sim space. */
    position: THREE.Vector3;
    nearestName: string | null;
    /** Distance from the nearest body's surface (sim units). */
    nearestAltitude: number;
    /** Speed relative to the nearest body (sim units/s). */
    nearestRelSpeed: number;

    targetName: string | null;
    targetDistance: number;
    /** Positive when the target is getting closer (sim units/s). */
    targetClosing: number;
    autopilotTargetName: string | null;
    /** Distance from the autopilot target's surface (sim units). */
    autopilotTargetDistance: number;
}

type ScreenPainter = (
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: ICockpitTelemetry
) => void;

interface IScreen {
    id: string;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    texture: THREE.CanvasTexture;
    painter: ScreenPainter;
}

// ── Palette (matches the 2D flight HUD's cyan theme) ─────────────────────────
const CYAN = '#00ffcc';
const CYAN_DIM = 'rgba(0, 255, 204, 0.35)';
const CYAN_FAINT = 'rgba(0, 255, 204, 0.12)';
const AMBER = '#ffb020';
const GREEN = '#40ff80';
const RED = '#ff4030';
const BG = '#02080c';
const FONT = '"Consolas", "Menlo", "Courier New", monospace';

/** Canvas height per screen; width follows the screen's physical aspect. */
const SCREEN_RESOLUTION = 320;

/**
 * Paints live flight data onto the cockpit model's display meshes.
 *
 * Display meshes are found by their `screen` extra (exported from Blender as a custom
 * property), so the model can move or resize a screen without touching code. A screen id
 * with no painter is left as authored.
 */
export class CockpitDashboard {
    private readonly screens: IScreen[] = [];

    private static readonly PAINTERS: Record<string, ScreenPainter> = {
        speed: paintSpeedScreen,
        nav: paintNavScreen,
        status: paintStatusScreen,
        target: paintTargetScreen,
    };

    /** Attach a canvas display to every screen mesh under `root`. */
    bind(root: THREE.Object3D): void {
        root.traverse((obj) => {
            const mesh = obj as THREE.Mesh;
            if (!mesh.isMesh) return;
            const id = typeof mesh.userData.screen === 'string' ? mesh.userData.screen : null;
            if (!id) return;
            const painter = CockpitDashboard.PAINTERS[id];
            if (!painter) return;

            const aspect =
                typeof mesh.userData.aspect === 'number' && mesh.userData.aspect > 0
                    ? mesh.userData.aspect
                    : 1.6;
            const canvas = document.createElement('canvas');
            canvas.height = SCREEN_RESOLUTION;
            canvas.width = Math.round(SCREEN_RESOLUTION * Math.min(4, aspect));
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const texture = new THREE.CanvasTexture(canvas);
            // glTF UVs have their origin at the top-left, so the canvas must not be flipped.
            texture.flipY = false;
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.anisotropy = 4;

            const oldMaterial = mesh.material;
            mesh.material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
            disposeMaterial(oldMaterial);

            this.screens.push({ id, canvas, ctx, texture, painter });
        });
    }

    /** Redraw every display from `telemetry`. */
    paint(telemetry: ICockpitTelemetry): void {
        for (const s of this.screens) {
            const { ctx, canvas } = s;
            ctx.save();
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            s.painter(ctx, canvas.width, canvas.height, telemetry);
            drawScanlines(ctx, canvas.width, canvas.height);
            ctx.restore();
            s.texture.needsUpdate = true;
        }
    }

    dispose(): void {
        for (const s of this.screens) s.texture.dispose();
        this.screens.length = 0;
    }
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
}

// ── Shared drawing helpers ───────────────────────────────────────────────────

function text(
    ctx: CanvasRenderingContext2D,
    str: string,
    x: number,
    y: number,
    size: number,
    color = CYAN,
    align: CanvasTextAlign = 'left',
    weight = 'normal'
): void {
    ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.35;
    ctx.fillText(str, x, y);
    ctx.shadowBlur = 0;
}

function frame(ctx: CanvasRenderingContext2D, w: number, h: number, title: string): number {
    const pad = h * 0.05;
    ctx.strokeStyle = CYAN_DIM;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, w - pad * 2, h - pad * 2);
    const titleH = h * 0.11;
    ctx.fillStyle = CYAN_FAINT;
    ctx.fillRect(pad, pad, w - pad * 2, titleH);
    text(ctx, title, pad * 2, pad + titleH / 2, titleH * 0.7, CYAN, 'left', 'bold');
    return pad + titleH;
}

function bar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    fraction: number,
    color: string
): void {
    const f = Math.max(0, Math.min(1, fraction));
    ctx.fillStyle = CYAN_FAINT;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w * f, h);
    ctx.strokeStyle = CYAN_DIM;
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
}

function drawScanlines(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
}

function row(
    ctx: CanvasRenderingContext2D,
    label: string,
    value: string,
    x0: number,
    x1: number,
    y: number,
    size: number,
    valueColor = CYAN,
    labelColor = CYAN_DIM
): void {
    text(ctx, label, x0, y, size, labelColor);
    text(ctx, value, x1, y, size, valueColor, 'right');
}

function fractionColor(f: number): string {
    return f > 0.5 ? CYAN : f > 0.25 ? AMBER : RED;
}

// ── Screens ──────────────────────────────────────────────────────────────────

/** Centre display: big speed readout with an arc gauge and flight regime. */
function paintSpeedScreen(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: ICockpitTelemetry
): void {
    frame(ctx, w, h, `FLIGHT  ·  ${t.speedTier} TIER`);
    paintGuidanceTag(ctx, w, h, t);

    const cx = w / 2;
    const cy = h * 0.78;
    const r = Math.min(w * 0.4, h * 0.56);
    const start = Math.PI * 1.1;
    const end = Math.PI * 1.9;
    // Clamped at both ends: a negative fraction makes canvas draw the arc the long way round
    // (the "overfill"), and coasting past the tier's top speed pegs the needle instead.
    const raw = t.speedGaugeMax > 0 ? t.speed / t.speedGaugeMax : 0;
    const f = Math.max(0, Math.min(1, raw));
    const overspeed = raw > 1.001;

    ctx.lineCap = 'round';
    ctx.lineWidth = h * 0.045;
    ctx.strokeStyle = CYAN_FAINT;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();

    const regimeColor = t.regime === 'WARP' ? '#a070ff' : t.regime === 'BOOST' ? AMBER : CYAN;
    // A pegged gauge turns amber so "beyond the scale" doesn't read as "exactly at max".
    const arcColor = overspeed ? AMBER : regimeColor;
    ctx.strokeStyle = arcColor;
    ctx.shadowColor = arcColor;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, start + (end - start) * f);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // ticks
    ctx.lineWidth = 2;
    ctx.strokeStyle = CYAN_DIM;
    for (let i = 0; i <= 10; i++) {
        const a = start + ((end - start) * i) / 10;
        const r0 = r - h * 0.05;
        const r1 = r - h * (i % 5 === 0 ? 0.1 : 0.075);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
        ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.stroke();
    }

    text(ctx, formatSpeed(t.speed), cx, h * 0.5, h * 0.15, CYAN, 'center', 'bold');
    const status = [t.regime];
    if (t.reversing) status.push('REVERSE');
    if (overspeed) status.push('OVERSPEED');
    text(
        ctx,
        status.join(' · '),
        cx,
        h * 0.68,
        h * 0.085,
        overspeed ? AMBER : regimeColor,
        'center',
        'bold'
    );

    if (t.warpCharge > 0) {
        bar(ctx, w * 0.2, h * 0.82, w * 0.6, h * 0.05, t.warpCharge, '#a070ff');
    } else if (t.launchCharge > 0) {
        bar(ctx, w * 0.2, h * 0.82, w * 0.6, h * 0.05, t.launchCharge, '#ffb040');
    }
}

/**
 * Guidance badge, right-aligned in the speed screen's title bar: GUIDE STBY while waiting for a
 * sphere of influence, GUIDE MATCH while bleeding off relative speed, GUIDE <BODY> once locked.
 * Nothing is drawn while guidance is off.
 */
function paintGuidanceTag(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: ICockpitTelemetry
): void {
    if (t.guidance === 'off') return;
    // Mirrors frame()'s title-bar geometry.
    const pad = h * 0.05;
    const titleH = h * 0.11;
    let label: string;
    let color: string;
    if (t.guidance === 'standby') {
        label = 'GUIDE STBY';
        color = CYAN_DIM;
    } else if (t.guidance === 'matching') {
        label = 'GUIDE MATCH';
        color = AMBER;
    } else {
        label = `GUIDE ${(t.guidanceBodyName ?? '').toUpperCase()}`.trim();
        color = GREEN;
    }
    text(ctx, label, w - pad * 2, pad + titleH / 2, titleH * 0.55, color, 'right', 'bold');
}

/** Left wing display: position and nearest body. */
function paintNavScreen(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: ICockpitTelemetry
): void {
    const top = frame(ctx, w, h, 'NAVIGATION');
    const x0 = w * 0.08;
    const x1 = w * 0.92;
    const s = h * 0.075;
    const step = h * 0.105;
    let y = top + step * 0.85;

    // Axis labels in full brightness: the dim label colour washes out on these short rows.
    row(ctx, 'POS X', formatAU(t.position.x), x0, x1, y, s, CYAN, CYAN);
    y += step;
    row(ctx, 'POS Y', formatAU(t.position.y), x0, x1, y, s, CYAN, CYAN);
    y += step;
    row(ctx, 'POS Z', formatAU(t.position.z), x0, x1, y, s, CYAN, CYAN);
    y += step * 1.15;

    ctx.strokeStyle = CYAN_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y - step * 0.55);
    ctx.lineTo(x1, y - step * 0.55);
    ctx.stroke();

    row(ctx, 'NEAREST', t.nearestName ?? '—', x0, x1, y, s);
    y += step;
    row(
        ctx,
        'ALT',
        t.nearestName ? formatAltitude(Math.max(0, t.nearestAltitude)) : '—',
        x0,
        x1,
        y,
        s
    );
    y += step;
    row(ctx, 'REL V', t.nearestName ? formatSpeed(t.nearestRelSpeed) : '—', x0, x1, y, s);
}

/** Right wing display: shields, hull and the selected weapon. */
function paintStatusScreen(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: ICockpitTelemetry
): void {
    const top = frame(ctx, w, h, `SYSTEMS  ·  ${t.shipName.toUpperCase()}`);
    const x0 = w * 0.08;
    const bw = w * 0.84;
    const s = h * 0.072;
    const bh = h * 0.07;
    let y = top + h * 0.09;

    row(ctx, 'SHIELD', `${Math.round(t.shieldFraction * 100)}%`, x0, x0 + bw, y, s);
    y += h * 0.07;
    bar(ctx, x0, y, bw, bh, t.shieldFraction, '#3aa8ff');
    y += bh + h * 0.09;

    row(
        ctx,
        'HULL',
        `${Math.round(t.hullFraction * 100)}%`,
        x0,
        x0 + bw,
        y,
        s,
        fractionColor(t.hullFraction)
    );
    y += h * 0.07;
    bar(ctx, x0, y, bw, bh, t.hullFraction, fractionColor(t.hullFraction));
    y += bh + h * 0.09;

    const heatColor = t.weaponOverheated ? RED : t.weaponHeat > 0.7 ? AMBER : CYAN;
    row(
        ctx,
        t.weaponName ? t.weaponName.toUpperCase() : 'NO WEAPON',
        t.weaponOverheated ? 'OVERHEAT' : `HEAT ${Math.round(t.weaponHeat * 100)}%`,
        x0,
        x0 + bw,
        y,
        s,
        heatColor
    );
    y += h * 0.07;
    bar(ctx, x0, y, bw, bh, t.weaponHeat, heatColor);
}

/** Small centre-left display: locked target and autopilot destination. */
function paintTargetScreen(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: ICockpitTelemetry
): void {
    const top = frame(ctx, w, h, 'TARGET');
    const cx = w / 2;
    const s = Math.min(h * 0.075, w * 0.075);
    if (t.targetName) {
        text(ctx, t.targetName.toUpperCase(), cx, top + h * 0.08, s * 1.1, RED, 'center', 'bold');
        text(ctx, formatDistance(t.targetDistance), cx, top + h * 0.19, s, CYAN, 'center');
        const closing = t.targetClosing >= 0 ? '▼ ' : '▲ ';
        text(
            ctx,
            closing + formatSpeed(Math.abs(t.targetClosing)),
            cx,
            top + h * 0.29,
            s,
            CYAN_DIM,
            'center'
        );
    } else {
        text(ctx, 'NO LOCK', cx, top + h * 0.17, s * 1.1, CYAN_DIM, 'center', 'bold');
    }

    ctx.strokeStyle = CYAN_DIM;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(w * 0.12, top + h * 0.37);
    ctx.lineTo(w * 0.88, top + h * 0.37);
    ctx.stroke();

    text(ctx, 'AUTOPILOT', cx, top + h * 0.45, s * 0.85, CYAN_DIM, 'center');
    text(
        ctx,
        t.autopilotTargetName ? t.autopilotTargetName.toUpperCase() : 'OFF',
        cx,
        top + h * 0.55,
        s,
        t.autopilotTargetName ? AMBER : CYAN_DIM,
        'center',
        'bold'
    );
    if (t.autopilotTargetName) {
        text(
            ctx,
            formatDistance(Math.max(0, t.autopilotTargetDistance)),
            cx,
            top + h * 0.66,
            s,
            AMBER,
            'center'
        );
    }
}
