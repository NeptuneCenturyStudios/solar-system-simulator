import { settingsStore } from '../settings/settings-store';

/**
 * The time step ship steering (yaw, pitch, roll, stick smoothing and banking) advances by this
 * frame.
 *
 * Both clocks are already frame-rate independent: `wallDt` is real seconds and `simDt` is real
 * seconds times the time scale. Steering follows sim time by default, so slowing the simulation
 * slows the turn rate along with the ship's motion and speeding it up raises it. With the
 * `steeringTimeScaleEnabled` setting off, steering keeps the fixed real-time rate it always had.
 *
 * Player and AI ships both go through this, so they can never end up on different clocks.
 *
 * @param wallDt Wall-clock seconds since the previous frame (not time-scaled).
 * @param simDt  Sim-time seconds advanced this frame (wall dt × time scale). Zero while paused.
 */
export function steeringDt(wallDt: number, simDt: number): number {
    return settingsStore.settings.steeringTimeScaleEnabled ? simDt : wallDt;
}
