import {
    HEAD_BOB_EASE_RATE,
    HEAD_BOB_LANDING_DIP_MAX,
    HEAD_BOB_LANDING_DIP_PER_SPEED,
    HEAD_BOB_LANDING_SPRING,
    HEAD_BOB_LATERAL_RATIO,
    HEAD_BOB_ROLL_SPRINT,
    HEAD_BOB_STRIDE_LENGTH,
    HEAD_BOB_VERTICAL_SPRINT,
    HEAD_BOB_VERTICAL_WALK,
    PLAYER_SPRINT_SPEED,
    PLAYER_WALK_SPEED,
} from '../utilities/consts';

/** Camera offsets from the eye point, in the player's local frame. */
export interface HeadBobOffsets {
    /** Along the local up (sim units; negative = lower). */
    vertical: number;
    /** Along the view's right (sim units). */
    lateral: number;
    /** Roll about the view direction (radians). */
    roll: number;
}

/**
 * Camera sway while walking on foot: a vertical bob (two dips per stride, one per footfall), a
 * side-to-side sway (one per stride, weight shifting foot to foot), a slight roll, and a dip on
 * landing from a jump or fall.
 *
 * The stride phase advances with the **distance walked**, so the bob matches the footfalls at any
 * speed and stops while paused. Amplitude eases toward a target set by ground speed — nothing
 * while standing or airborne, more when sprinting — with time-based exponential decay on wall
 * time, so it feels the same at any frame rate. The landing dip recovers on a critically damped
 * spring, also on wall time.
 */
export class HeadBob {
    private phase = 0;
    private amplitude = 0;
    private sprintMix = 0;
    private dip = 0;
    private dipVelocity = 0;
    private readonly offsets: HeadBobOffsets = { vertical: 0, lateral: 0, roll: 0 };

    /** Drop all sway (entering surface mode). */
    reset(): void {
        this.phase = 0;
        this.amplitude = 0;
        this.sprintMix = 0;
        this.dip = 0;
        this.dipVelocity = 0;
    }

    /**
     * Start a landing dip for a touchdown at `impactSpeed` (sim units / s, into the ground).
     */
    land(impactSpeed: number): void {
        if (!(impactSpeed > 0)) return;
        const dip = Math.min(
            HEAD_BOB_LANDING_DIP_MAX,
            impactSpeed * HEAD_BOB_LANDING_DIP_PER_SPEED
        );
        this.dip = Math.max(this.dip, dip);
        this.dipVelocity = 0;
    }

    /**
     * Advance the sway and return this frame's offsets (a shared object, valid until next call).
     *
     * @param groundSpeed Speed over the ground (sim units / s), relative to the surface.
     * @param grounded Whether the feet are on the ground.
     * @param simDt Sim seconds this frame covered (0 while paused).
     * @param wallDt Wall-clock seconds this frame took.
     */
    update(groundSpeed: number, grounded: boolean, simDt: number, wallDt: number): HeadBobOffsets {
        const speed = grounded ? Math.max(0, groundSpeed) : 0;

        // Footfalls follow distance: one full phase cycle (2π) per stride.
        if (simDt > 0 && speed > 0) {
            this.phase += ((speed * simDt) / HEAD_BOB_STRIDE_LENGTH) * Math.PI * 2;
            if (this.phase > Math.PI * 2000) this.phase %= Math.PI * 2;
        }

        // 0 at a standstill, 1 at walking speed, 2 at sprinting speed.
        const sprintSpan = PLAYER_SPRINT_SPEED - PLAYER_WALK_SPEED;
        const walkLevel = Math.min(1, speed / PLAYER_WALK_SPEED);
        const sprintLevel =
            sprintSpan > 0 ? Math.min(1, Math.max(0, (speed - PLAYER_WALK_SPEED) / sprintSpan)) : 0;

        const blend = 1 - Math.exp(-HEAD_BOB_EASE_RATE * Math.max(0, wallDt));
        this.amplitude += (walkLevel - this.amplitude) * blend;
        this.sprintMix += (sprintLevel - this.sprintMix) * blend;

        const verticalAmp =
            this.amplitude *
            (HEAD_BOB_VERTICAL_WALK +
                (HEAD_BOB_VERTICAL_SPRINT - HEAD_BOB_VERTICAL_WALK) * this.sprintMix);

        // Landing dip: critically damped spring back to 0.
        if (wallDt > 0 && (this.dip !== 0 || this.dipVelocity !== 0)) {
            const w = HEAD_BOB_LANDING_SPRING;
            // Semi-implicit Euler, with the step capped so a frame hitch cannot destabilise it.
            const h = Math.min(wallDt, 0.05);
            const accel = -w * w * this.dip - 2 * w * this.dipVelocity;
            this.dipVelocity += accel * h;
            this.dip += this.dipVelocity * h;
            if (Math.abs(this.dip) < 1e-12 && Math.abs(this.dipVelocity) < 1e-12) {
                this.dip = 0;
                this.dipVelocity = 0;
            }
        }

        // Lowest at each footfall (twice per stride), centred so standing height is the mean.
        // Sway and roll swing once per stride, furthest over each foot as it carries the weight.
        const bob = Math.abs(Math.sin(this.phase)) - 2 / Math.PI;
        this.offsets.vertical = verticalAmp * bob - this.dip;
        this.offsets.lateral = verticalAmp * HEAD_BOB_LATERAL_RATIO * Math.sin(this.phase);
        this.offsets.roll =
            this.amplitude *
            HEAD_BOB_ROLL_SPRINT *
            (0.35 + 0.65 * this.sprintMix) *
            Math.sin(this.phase);
        return this.offsets;
    }
}
