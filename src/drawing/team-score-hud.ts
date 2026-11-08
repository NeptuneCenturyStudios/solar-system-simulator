import * as THREE from 'three';

import { TEXT_SPRITE_Z } from '../utilities/consts';

/** Draw order inside the UI scene: with the scenario banner, below the screen flash (1000). */
const TEAM_SCORE_RENDER_ORDER = 900;

/** Fixed pixel size of the sprite, regardless of window size. */
const PANEL_WIDTH = 720;
const PANEL_HEIGHT = 120;

/** Vertical offset of the panel's centre from the top of the screen, in pixels. */
const TOP_OFFSET = 64;

const EARTH_COLOR = '#4fa8ff';
const ALIEN_COLOR = '#7dff6a';
const INTEGRITY_COLOR = '#ffb347';
const TRACK_COLOR = 'rgba(255, 255, 255, 0.12)';
const TEXT_COLOR = '#eafffa';

/** The figures the panel shows. */
export interface TeamScore {
    earthAlive: number;
    earthTotal: number;
    alienAlive: number;
    alienTotal: number;
    /** Earth's remaining health as a 0–1 fraction, or null to hide the integrity bar. */
    earthIntegrity: number | null;
}

/**
 * Persistent fleet-battle score panel: each team's ships still flying and lost, as a pair of
 * bars meeting in the middle, plus an optional planet-integrity bar. A canvas-texture sprite in
 * the UI overlay scene, like ScenarioMessageHud, so scenarios can drive it without any Vue
 * import. Redrawn only when the figures change.
 */
export class TeamScoreHud {
    readonly sprite: THREE.Sprite;

    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly texture: THREE.CanvasTexture;
    private readonly material: THREE.SpriteMaterial;
    /** Key of the last drawn score, to skip redundant redraws. */
    private lastKey = '';

    constructor(scene: THREE.Scene) {
        this.canvas = document.createElement('canvas');
        this.canvas.width = PANEL_WIDTH;
        this.canvas.height = PANEL_HEIGHT;
        const ctx = this.canvas.getContext('2d');
        if (!ctx) throw new Error('Could not get 2D context');
        this.ctx = ctx;

        this.texture = new THREE.CanvasTexture(this.canvas);
        this.material = new THREE.SpriteMaterial({
            map: this.texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this.sprite = new THREE.Sprite(this.material);
        this.sprite.renderOrder = TEAM_SCORE_RENDER_ORDER;
        this.sprite.visible = false;
        scene.add(this.sprite);

        this.resize(window.innerWidth, window.innerHeight);
    }

    /** Reposition to top-centre. Called on construction and on window resize. */
    resize(_width: number, height: number): void {
        this.sprite.scale.set(PANEL_WIDTH, PANEL_HEIGHT, 1);
        this.sprite.position.set(0, height / 2 - TOP_OFFSET, TEXT_SPRITE_Z);
    }

    show(): void {
        this.sprite.visible = true;
    }

    hide(): void {
        this.sprite.visible = false;
        this.lastKey = '';
    }

    update(score: TeamScore): void {
        const integrity =
            score.earthIntegrity === null ? -1 : Math.round(score.earthIntegrity * 100);
        const key = `${score.earthAlive}/${score.earthTotal}|${score.alienAlive}/${score.alienTotal}|${integrity}`;
        if (key === this.lastKey) return;
        this.lastKey = key;
        this.draw(score, integrity);
        this.texture.needsUpdate = true;
    }

    private draw(score: TeamScore, integrityPct: number): void {
        const { ctx } = this;
        const w = PANEL_WIDTH;
        const mid = w / 2;
        ctx.clearRect(0, 0, w, PANEL_HEIGHT);

        // Backing plate, so the text reads over a bright planet.
        ctx.fillStyle = 'rgba(0, 10, 20, 0.55)';
        ctx.fillRect(0, 0, w, PANEL_HEIGHT);

        // ── Team labels and counts ───────────────────────────────────────────
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 20px monospace';
        ctx.fillStyle = EARTH_COLOR;
        ctx.textAlign = 'left';
        ctx.fillText(`TEAM EARTH  ${score.earthAlive}/${score.earthTotal}`, 16, 20);
        ctx.fillStyle = ALIEN_COLOR;
        ctx.textAlign = 'right';
        ctx.fillText(`${score.alienAlive}/${score.alienTotal}  TEAM ALIEN`, w - 16, 20);
        ctx.fillStyle = TEXT_COLOR;
        ctx.textAlign = 'center';
        ctx.fillText('VS', mid, 20);

        // ── Strength bars, meeting in the middle ─────────────────────────────
        const barY = 38;
        const barH = 14;
        const half = mid - 24;
        const earthFrac = score.earthTotal > 0 ? score.earthAlive / score.earthTotal : 0;
        const alienFrac = score.alienTotal > 0 ? score.alienAlive / score.alienTotal : 0;
        ctx.fillStyle = TRACK_COLOR;
        ctx.fillRect(16, barY, half - 16, barH);
        ctx.fillRect(mid + 8, barY, half - 16, barH);
        ctx.fillStyle = EARTH_COLOR;
        const earthW = (half - 16) * earthFrac;
        ctx.fillRect(16 + (half - 16) - earthW, barY, earthW, barH);
        ctx.fillStyle = ALIEN_COLOR;
        ctx.fillRect(mid + 8, barY, (half - 16) * alienFrac, barH);

        // ── Losses ───────────────────────────────────────────────────────────
        ctx.font = '16px monospace';
        ctx.fillStyle = TEXT_COLOR;
        ctx.textAlign = 'left';
        ctx.fillText(`Lost: ${score.earthTotal - score.earthAlive}`, 16, 68);
        ctx.textAlign = 'right';
        ctx.fillText(`Lost: ${score.alienTotal - score.alienAlive}`, w - 16, 68);

        // ── Planet integrity ─────────────────────────────────────────────────
        if (integrityPct >= 0) {
            const y = 96;
            ctx.textAlign = 'left';
            ctx.fillStyle = INTEGRITY_COLOR;
            ctx.font = 'bold 16px monospace';
            ctx.fillText(`EARTH INTEGRITY ${integrityPct}%`, 16, y);
            const x0 = 250;
            const bw = w - 16 - x0;
            ctx.fillStyle = TRACK_COLOR;
            ctx.fillRect(x0, y - 7, bw, 14);
            ctx.fillStyle = INTEGRITY_COLOR;
            ctx.fillRect(x0, y - 7, (bw * integrityPct) / 100, 14);
        }
    }

    /** Remove the sprite and release its GPU resources. */
    dispose(): void {
        this.sprite.removeFromParent();
        this.texture.dispose();
        this.material.dispose();
    }
}

// ── Module-level registry ─────────────────────────────────────────────────────
// Same pattern as scenario-message-hud.ts: one instance registered at the composition root
// (index.ts), driven by scenarios through these functions.
let teamScoreHud: TeamScoreHud | null = null;

/** Register (or clear) the single panel instance. */
export function registerTeamScoreHud(hud: TeamScoreHud | null): void {
    teamScoreHud = hud;
}

/** Show the panel with `score`. No-op when unregistered. */
export function showTeamScoreHud(score: TeamScore): void {
    if (!teamScoreHud) return;
    teamScoreHud.update(score);
    teamScoreHud.show();
}

/** Redraw the panel if `score` changed. No-op when unregistered. */
export function updateTeamScoreHud(score: TeamScore): void {
    teamScoreHud?.update(score);
}

/** Hide the panel. No-op when unregistered. */
export function hideTeamScoreHud(): void {
    teamScoreHud?.hide();
}
