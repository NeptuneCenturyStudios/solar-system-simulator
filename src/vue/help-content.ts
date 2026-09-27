/**
 * Static content for the Help panel (`HelpPanel.vue`).
 *
 * Kept out of the component so the control reference reads as pure data: a list
 * of sections, each a list of action → key rows. Every entry mirrors what the
 * simulation actually binds — keyboard bindings live in
 * `src/simulation/keyboard-controls.ts`, mouse and gizmo bindings in
 * `src/index.ts` (`onMouseDown` / `onMouseUp` / the wheel handler).
 */

/** One control reference row: what it does, and the key(s) that trigger it. */
export interface HelpRow {
    /** What the control does. */
    action: string;
    /** Key caps to show, left to right. True alternatives (W/S) are separate caps. */
    keys: string[];
}

/** A titled group of rows. `note` adds context shown under the title. */
export interface HelpSection {
    title: string;
    /** Optional line of context for the section as a whole. */
    note?: string;
    rows: HelpRow[];
}

export const HELP_SECTIONS: HelpSection[] = [
    {
        title: 'Camera & Selection',
        rows: [
            { action: 'Rotate / look around', keys: ['Right-drag'] },
            { action: 'Zoom in / out', keys: ['Scroll'] },
            { action: 'Select object', keys: ['Left-click'] },
            { action: 'Deselect', keys: ['Left-click empty space'] },
            { action: 'Rotate / zoom (touch)', keys: ['1-finger drag', '2-finger pinch'] },
        ],
    },
    {
        title: 'Simulation',
        rows: [
            { action: 'Pause / resume', keys: ['P'] },
            { action: 'Double time scale', keys: ['+', '='] },
            { action: 'Halve time scale', keys: ['-', '_'] },
            { action: 'Toggle object names', keys: ['N'] },
            { action: 'Delete selected object', keys: ['Delete'] },
        ],
    },
    {
        title: 'Edit Object (Gizmo)',
        note: 'Show the gizmo by turning on Target mode, then selecting an object.',
        rows: [
            { action: 'Move along an axis', keys: ['Left-drag axis arrow'] },
            { action: 'Nudge (camera-relative)', keys: ['Arrow keys'] },
            { action: 'Nudge up / down', keys: ['Ctrl + ↑ / ↓'] },
            { action: 'Tilt (axial tilt)', keys: ['Left-drag orange ring'] },
            { action: 'Rotate (azimuth)', keys: ['Left-drag cyan ring'] },
            { action: 'Change velocity', keys: ['Left-drag', 'Middle-drag'] },
            { action: 'Toggle velocity plane (horizontal / vertical)', keys: ['G'] },
        ],
    },
    {
        title: 'Flight Mode',
        note: 'Enter a ship from the Flight Controls panel, then these take over.',
        rows: [
            { action: 'Thrust / brake', keys: ['W', 'S'] },
            { action: 'Roll left / right', keys: ['A', 'D'] },
            { action: 'Boost', keys: ['Shift'] },
            { action: 'Steer', keys: ['Mouse'] },
            { action: 'Toggle cockpit / third-person view', keys: ['C'] },
            {
                action: 'Charge warp (release early to cancel; tap again to disengage)',
                keys: ['Hold Space'],
            },
            { action: 'Orbit camera around ship', keys: ['Hold Alt'] },
            { action: 'Lock / cycle threat target', keys: ['Tab', 'Shift+Tab'] },
            { action: 'Chase locked target (needs Chase Mode)', keys: ['Hold S'] },
            { action: 'Autopilot to hovered target', keys: ['Hold E'] },
            { action: 'Fire weapon', keys: ['Left-click'] },
            { action: 'Exit flight mode', keys: ['Esc'] },
        ],
    },
];
