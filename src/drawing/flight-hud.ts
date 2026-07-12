import * as THREE from 'three';
import { Body } from '../bodies/body';
import { AUTOPILOT_ORBIT_NOTIFY_DURATION, TEXT_SPRITE_Z } from '../utilities/consts';
import { IAutopilotState } from '../interfaces';

export type AutopilotHudState =
    | 'ALIGN'
    | 'APPROACH_WARP'
    | 'APPROACH_BOOST'
    | 'APPROACH'
    | 'BRAKE'
    | 'CIRCULARIZE'
    | 'TIDAL_LOCK'
    | 'ORBIT'
    | 'BLOCKED'
    | 'NONE';

// ── Private texture-creator helpers ──────────────────────────────────────────

/** Renders the charging progress bar (fill = 0..1) with label above. */
function createWarpChargeTexture(fill: number): THREE.CanvasTexture {
    const W = 512,
        H = 128;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;

    // Label
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 36px monospace';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#00ffcc';
    ctx.shadowColor = 'rgba(0,255,204,0.9)';
    ctx.fillText('INITIATING WARP', W / 2, 34);

    // Bar track
    const barX = 40,
        barY = 68,
        barW = W - 80,
        barH = 28;
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(0,255,204,0.12)';
    ctx.strokeStyle = 'rgba(0,255,204,0.5)';
    ctx.lineWidth = 2;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeRect(barX, barY, barW, barH);

    // Bar fill — gradient cyan→white at tip
    if (fill > 0) {
        const fillW = barW * fill;
        const grad = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
        grad.addColorStop(0, 'rgba(0,200,180,0.9)');
        grad.addColorStop(0.8, 'rgba(0,255,220,1.0)');
        grad.addColorStop(1, 'rgba(255,255,255,1.0)');
        ctx.fillStyle = grad;
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(0,255,204,0.9)';
        ctx.fillRect(barX, barY, fillW, barH);
        ctx.shadowBlur = 0;
    }

    // Percentage label inside bar
    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowBlur = 0;
    ctx.fillText(`${Math.round(fill * 100)}%`, W / 2, barY + barH / 2);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

/** Renders the pulsing "WARP ACTIVE" text (pulse = 0..1 sine wave). */
function createWarpActiveTexture(pulse: number): THREE.CanvasTexture {
    const W = 512,
        H = 96;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;

    const alpha = 0.55 + 0.45 * pulse; // 0.55–1.0
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 52px monospace';
    ctx.shadowBlur = 20 + 20 * pulse;
    ctx.shadowColor = `rgba(255,120,0,${alpha})`;
    ctx.fillStyle = `rgba(255,${Math.round(180 + 75 * pulse)},0,${alpha})`;
    ctx.fillText('⚡ WARP ACTIVE ⚡', W / 2, H / 2);

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

function createAutopilotPhaseTexture(
    state: AutopilotHudState,
    distanceLabel = ''
): THREE.CanvasTexture {
    // Canvas is deliberately wide (800px) so no label ever clips.
    // Two rows: phase label on top, distance on the bottom.
    const W = 900,
        H = 100;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let text: string;
    let color: string;
    let glow: string;
    switch (state) {
        case 'ALIGN':
            text = '◎  AUTOPILOT: ALIGNING TO TARGET';
            color = '#88ddff';
            glow = 'rgba(136,221,255,0.85)';
            break;
        case 'APPROACH_WARP':
            text = '⚡  AUTOPILOT: WARPING';
            color = '#ff4488';
            glow = 'rgba(255,68,136,0.9)';
            break;
        case 'APPROACH_BOOST':
            text = '▶▶  AUTOPILOT: APPROACHING TARGET (BOOST)';
            color = '#ff9944';
            glow = 'rgba(255,153,68,0.85)';
            break;
        case 'APPROACH':
            text = '▶  AUTOPILOT: APPROACHING TARGET';
            color = '#00ffcc';
            glow = 'rgba(0,255,204,0.85)';
            break;
        case 'BRAKE':
            text = '◼  AUTOPILOT: ESTABLISHING ORBIT TRAJECTORY';
            color = '#00ffcc';
            glow = 'rgba(0,255,204,0.85)';
            break;
        case 'CIRCULARIZE':
            text = '↻  AUTOPILOT: ENTERING ORBIT';
            color = '#00ffcc';
            glow = 'rgba(0,255,204,0.85)';
            break;
        case 'TIDAL_LOCK':
            text = '☰  AUTOPILOT: ORBIT LOCK ACTIVE';
            color = '#7ef0ff';
            glow = 'rgba(100,220,255,0.9)';
            break;
        case 'ORBIT':
            text = '✓  STABLE ORBIT ESTABLISHED';
            color = '#7ef0ff';
            glow = 'rgba(100,220,255,0.9)';
            break;
        case 'BLOCKED':
            text = '⚠ AUTOPILOT BLOCKED';
            color = '#ff3344';
            glow = 'rgba(255,51,68,0.9)';
            break;
        default:
            text = '';
            color = '#ffffff';
            glow = 'transparent';
    }

    // Phase label
    ctx.font = 'bold 34px monospace';
    ctx.shadowBlur = 14;
    ctx.shadowColor = glow;
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, 34);

    // Distance sub-label
    if (distanceLabel) {
        ctx.font = '24px monospace';
        ctx.shadowBlur = 6;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.fillText(distanceLabel, W / 2, 72);
    }

    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    return tex;
}

function createHintTexture({ lines }: { lines: string[] }): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Failed to create canvas context for hint texture');

    canvas.width = 2200;
    canvas.height = 140;

    context.clearRect(0, 0, canvas.width, canvas.height);

    // 28pt hint text (slightly smaller to avoid clipping)
    context.font = '28px monospace';
    context.fillStyle = '#aaaaaa';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
    if (safeLines.length === 0) {
        const texture = new THREE.CanvasTexture(canvas);
        texture.needsUpdate = true;
        return texture;
    }

    const lineY = safeLines.length > 1 ? [50, 100] : [75];
    for (let i = 0; i < Math.min(safeLines.length, 2); i++) {
        context.fillText(safeLines[i], canvas.width / 2, lineY[i]);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
}

// ── FlightHUD class ──────────────────────────────────────────────────────────

export class FlightHUD {
    // Public — accessed directly from index.ts flight logic
    warpSprite: THREE.Sprite | null = null;
    orbitNotifySprite: THREE.Sprite | null = null;
    hintSprite: THREE.Sprite | null = null;
    autopilotBlockedNotifyTimer = 0;
    autopilotBlockedByName = '';

    // Private internal state
    private hintLastText = '';
    private _lastAutopilotHudState: AutopilotHudState = 'NONE';

    private uiScene: THREE.Scene;
    private autopilotState: IAutopilotState;
    private interactionState: {
        isChangingVelocity: boolean;
        isMiddleMouseVelocity: boolean;
        velocityEditMode: string;
    };
    private cameraState: { isFreeCameraMode: boolean; isTargetMode: boolean };
    private simulationState: { bodies: Body[] };
    private flightState: { knownShip: Body | null };
    private getSelectedBody: () => Body | null;

    constructor(
        uiScene: THREE.Scene,
        autopilotState: IAutopilotState,
        interactionState: {
            isChangingVelocity: boolean;
            isMiddleMouseVelocity: boolean;
            velocityEditMode: string;
        },
        cameraState: { isFreeCameraMode: boolean; isTargetMode: boolean },
        simulationState: { bodies: Body[] },
        flightState: { knownShip: Body | null },
        getSelectedBody: () => Body | null
    ) {
        this.uiScene = uiScene;
        this.autopilotState = autopilotState;
        this.interactionState = interactionState;
        this.cameraState = cameraState;
        this.simulationState = simulationState;
        this.flightState = flightState;
        this.getSelectedBody = getSelectedBody;
    }

    /** Create all HUD sprites and add them to uiScene. Call once after construction. */
    init(): void {
        this._initWarp();
        this._initOrbitNotify();
        this._initHint();
    }

    private _initWarp(): void {
        const texture = createWarpChargeTexture(0);
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this.warpSprite = new THREE.Sprite(material);
        // 512×128 canvas at 0.625 ratio → 320×80 screen pixels; center at bottom
        this.warpSprite.scale.set(320, 80, 1);
        this.warpSprite.position.set(0, -(window.innerHeight / 2 - 50), TEXT_SPRITE_Z);
        this.warpSprite.visible = false;
        this.uiScene.add(this.warpSprite);
    }

    private _initOrbitNotify(): void {
        const material = new THREE.SpriteMaterial({
            map: createAutopilotPhaseTexture('NONE'),
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this.orbitNotifySprite = new THREE.Sprite(material);
        // 900×100 canvas → 800×80 screen-pixel sprite (two-line display).
        this.orbitNotifySprite.scale.set(800, 80, 1);
        this.orbitNotifySprite.position.set(0, -(window.innerHeight / 2 - 120), TEXT_SPRITE_Z);
        this.orbitNotifySprite.visible = false;
        this.uiScene.add(this.orbitNotifySprite);
    }

    private _initHint(): void {
        const texture = createHintTexture({ lines: [] });
        const material = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthTest: false,
            depthWrite: false,
        });
        this.hintSprite = new THREE.Sprite(material);
        this.hintSprite.scale.set(1100, 95, 1); // allow 1-2 lines (wider to avoid clipping)
        this.hintSprite.visible = false;
        // Top-center of the screen (slightly below top edge)
        this.hintSprite.position.set(0, window.innerHeight / 2 - 55, TEXT_SPRITE_Z);
        this.uiScene.add(this.hintSprite);
    }

    /** Show the orbit-notify sprite and reset its timer. */
    showOrbitNotify(): void {
        if (!this.orbitNotifySprite) return;
        this.orbitNotifySprite.visible = true;
        this.autopilotState.orbitNotifyTimer = AUTOPILOT_ORBIT_NOTIFY_DURATION;
    }

    /** Update warp sprite to show charge-bar state; makes it visible. */
    setWarpCharge(fill: number): void {
        if (!this.warpSprite) return;
        this.warpSprite.material.map?.dispose();
        this.warpSprite.material.map = createWarpChargeTexture(fill);
        this.warpSprite.material.needsUpdate = true;
        this.warpSprite.scale.set(320, 80, 1);
        this.warpSprite.visible = true;
    }

    /** Update warp sprite to show "WARP ACTIVE" pulse; makes it visible. */
    setWarpActive(pulse: number): void {
        if (!this.warpSprite) return;
        this.warpSprite.material.map?.dispose();
        this.warpSprite.material.map = createWarpActiveTexture(pulse);
        this.warpSprite.material.needsUpdate = true;
        this.warpSprite.scale.set(320, 60, 1);
        this.warpSprite.visible = true;
    }

    /** Hide the warp sprite. */
    hideWarpSprite(): void {
        if (this.warpSprite) this.warpSprite.visible = false;
    }

    /**
     * Update the autopilot phase HUD sprite. Call once per animate frame.
     * @param dt Elapsed seconds since last frame.
     */
    updateAutopilotHUD(dt: number): void {
        if (!this.orbitNotifySprite) return;

        // Determine desired HUD state
        let desiredHud: AutopilotHudState = 'NONE';
        if (this.autopilotState.isActive) {
            if (this.autopilotState.phase === 'ALIGN') {
                desiredHud = 'ALIGN';
            } else if (
                this.autopilotState.phase === 'WARP_CHARGING' ||
                this.autopilotState.phase === 'WARP'
            ) {
                desiredHud = 'APPROACH_WARP';
            } else if (this.autopilotState.phase === 'CIRCULARIZE') {
                desiredHud = 'CIRCULARIZE';
            } else if (this.autopilotState.phase === 'TIDAL_LOCK') {
                desiredHud = 'TIDAL_LOCK';
            } else if (this.autopilotState.phase === 'BRAKE') {
                desiredHud = 'BRAKE';
            } else if (this.autopilotState.isBoostActive) {
                desiredHud = 'APPROACH_BOOST';
            } else {
                desiredHud = 'APPROACH';
            }
        } else if (this.autopilotBlockedNotifyTimer > 0) {
            desiredHud = 'BLOCKED';
        } else if (this.autopilotState.orbitNotifyTimer > 0) {
            desiredHud = 'ORBIT';
        }

        if (desiredHud === 'NONE') {
            this.orbitNotifySprite.visible = false;
            this._lastAutopilotHudState = 'NONE';
        } else {
            this.orbitNotifySprite.visible = true;

            // Build label for the autopilot HUD sprite.
            let distLabel = '';
            if (desiredHud === 'BLOCKED') {
                distLabel = this.autopilotBlockedByName
                    ? `Blocked by: ${this.autopilotBlockedByName}`
                    : '';
            } else if (this.autopilotState.isActive && this.autopilotState.targetBody?.mesh) {
                const ship = this.flightState.knownShip;
                if (ship?.mesh) {
                    const dist = ship.mesh.position.distanceTo(
                        this.autopilotState.targetBody.mesh.position
                    );
                    // Format: show as integer with thousands separator, strip tiny noise.
                    const distRounded = Math.max(0, Math.round(dist));
                    distLabel = `Distance to target: ${distRounded.toLocaleString()} u`;
                }
            }

            // Re-render canvas every frame while active (distance changes continuously),
            // but only on phase changes when the stable-orbit message is showing.
            const needsRedraw = this.autopilotState.isActive
                ? true // distance always changes
                : desiredHud !== this._lastAutopilotHudState;

            if (needsRedraw) {
                this.orbitNotifySprite.material.map?.dispose();
                this.orbitNotifySprite.material.map = createAutopilotPhaseTexture(
                    desiredHud,
                    distLabel
                );
                this.orbitNotifySprite.material.needsUpdate = true;
                this._lastAutopilotHudState = desiredHud;
            }

            // Tick down the autopilot HUD timers
            if (desiredHud === 'ORBIT') {
                this.autopilotState.orbitNotifyTimer -= dt;
            } else if (desiredHud === 'BLOCKED') {
                this.autopilotBlockedNotifyTimer -= dt;
                if (this.autopilotBlockedNotifyTimer <= 0) {
                    this.autopilotBlockedNotifyTimer = 0;
                    this.autopilotBlockedByName = '';
                }
            }
        }
    }

    /** Update hint sprite each frame (texture only redrawn when text changes). */
    updateHintSprite(): void {
        if (!this.hintSprite) return;

        const hint = this._getActiveContextHint();
        this.hintSprite.visible = hint.visible;
        if (!hint.visible) return;

        const textKey = hint.lines.join('\n');
        if (textKey === this.hintLastText) return;
        this.hintLastText = textKey;

        if (this.hintSprite.material.map) this.hintSprite.material.map.dispose();
        this.hintSprite.material.map = createHintTexture({ lines: hint.lines });
        this.hintSprite.material.needsUpdate = true;
    }

    /** Force an immediate re-render of the hint sprite (call after camera/selection changes). */
    forceHintRefresh(): void {
        try {
            this.hintLastText = '';

            // Always recompute the hint, and force-apply both visibility and texture.
            // This avoids "stuck" hint sprites when switching camera modes.
            if (!this.hintSprite) return;

            const hint = this._getActiveContextHint();
            this.hintSprite.visible = hint.visible;

            // Dispose old texture (if any)
            if (this.hintSprite.material?.map) this.hintSprite.material.map.dispose();

            if (!hint.visible) {
                // Ensure we don't keep stale text around
                this.hintLastText = '';
                this.hintSprite.material.map = createHintTexture({ lines: [] });
                this.hintSprite.material.needsUpdate = true;
                return;
            }

            this.hintLastText = hint.lines.join('\n');
            this.hintSprite.material.map = createHintTexture({ lines: hint.lines });
            this.hintSprite.material.needsUpdate = true;
        } catch (e) {
            console.error('Error dispatching body:added event for preset body:', e);
        }
    }

    private _getActiveContextHint(): { visible: boolean; lines: string[] } {
        // Highest priority: velocity dragging hint (existing behavior)
        const draggingVel =
            this.interactionState.isChangingVelocity || this.interactionState.isMiddleMouseVelocity;
        if (draggingVel) {
            const mode = this.interactionState.velocityEditMode || 'xz';
            return {
                visible: true,
                lines: [
                    `Dragging velocity — press G to switch modes (XZ ↔ Y) | Mode: ${mode.toUpperCase()}`,
                ],
            };
        }

        const selectedBody = this.getSelectedBody();
        const selected =
            selectedBody && this.simulationState.bodies.includes(selectedBody)
                ? selectedBody
                : null;

        const isFree = !!this.cameraState.isFreeCameraMode;
        const isTarget = !!this.cameraState.isTargetMode;

        // Case 1: Free camera mode hint (always show when enabled)
        if (isFree) {
            // If a body is also selected, we can show a second line about manipulation.
            if (selected) {
                const bodyLine = isTarget
                    ? `Selected: drag axis arrows to move body | Drag yellow arrow to change velocity`
                    : `Selected: click Target (crosshair) to enable arrows | Then drag arrows to move / change velocity`;
                return {
                    visible: true,
                    lines: [`Free Camera: WASD move | Space up | C down | Shift = fast`, bodyLine],
                };
            }

            return {
                visible: true,
                lines: [`Free Camera: WASD move | Space up | C down | Shift = fast`],
            };
        }

        // Case 2: Body selected manipulation hint (non-free-cam)
        if (selected) {
            const line = isTarget
                ? `Selected: drag axis arrows or use Arrow keys to move body | Drag yellow arrow to change velocity`
                : `Selected: click Target (crosshair) to enable arrows | Arrow keys move body once Target is on`;

            return {
                visible: true,
                lines: [line, 'Hold middle mouse button: follow mode'],
            };
        }

        // Case 3: Default camera hint (no selection, not free camera)
        return {
            visible: true,
            lines: ['Use right mouse button to rotate camera'],
        };
    }
}
