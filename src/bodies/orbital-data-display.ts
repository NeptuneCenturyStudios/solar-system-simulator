/**
 * Turns orbital element data into display rows for the attributes modal's Orbital Data section.
 *
 * Pure — no THREE.js or scene references — mirroring body-attribute-display.ts: the sim side
 * (index.ts) hands Vue plain label/value rows, never live Body objects or element structs.
 *
 * Two sets of rows are produced:
 *   - live rows, derived from the body's current state vector (osculating elements);
 *   - reference rows, describing the orbit the body was *placed* on, when that is known.
 */

import type { IBodyAttributeRow } from './body-attribute-display';
import {
    eccentricityFromApsides,
    semiMajorAxisFromApsides,
    type IBodyOrbitElements,
    type ILiveOrbitElements,
} from './orbital-elements';
import {
    formatAngleDeg,
    formatAU,
    formatEccentricity,
    formatSpeed,
} from '../utilities/display-format';

/** Placeholder for a value that has no meaning for the orbit being described. */
const NOT_APPLICABLE_PLACEHOLDER = '—';

/** A live orbit plus the label of the frame it is measured in. */
export interface ILiveOrbitData {
    /** Name of the body this orbit is measured against. */
    referenceLabel: string;
    /** Null when the elements could not be derived from the current state vector. */
    elements: ILiveOrbitElements | null;
}

/** One always-known row; orbital data is observability, not probe-gated science. */
function row(key: string, label: string, value: string): IBodyAttributeRow {
    return { key, label, value, discovered: true };
}

/**
 * Build the live orbital rows for a body's current osculating orbit.
 *
 * A body on an escape trajectory has no semi-major axis or apoapsis worth reporting (the
 * semi-major axis is negative and the orbit never closes), so those two rows are omitted rather
 * than shown as nonsense — everything else, including the periapsis it is heading away from,
 * still describes the path it is on.
 */
export function buildLiveOrbitRows(data: ILiveOrbitData): IBodyAttributeRow[] {
    const { referenceLabel, elements } = data;
    const rows: IBodyAttributeRow[] = [row('orbitReference', 'Orbital Reference', referenceLabel)];

    // A degenerate state vector (zero angular momentum) yields no elements, but the reference
    // frame is still worth naming — the note under the list explains the rest.
    if (!elements) return rows;

    if (elements.isBound) {
        rows.push(row('semiMajorAxis', 'Semi-major Axis', formatAU(elements.semiMajorAxis)));
    }

    rows.push(row('eccentricity', 'Eccentricity', formatEccentricity(elements.eccentricity)));

    if (elements.periapsis !== null) {
        rows.push(row('periapsis', 'Periapsis', formatAU(elements.periapsis)));
    }

    if (elements.isBound && elements.apoapsis !== null) {
        rows.push(row('apoapsis', 'Apoapsis', formatAU(elements.apoapsis)));
    }

    rows.push(
        row('inclination', 'Inclination', formatAngleDeg(elements.inclinationDeg)),
        row(
            'longitudeAscendingNode',
            'Long. of Asc. Node',
            formatAngleDeg(elements.longitudeAscendingNodeDeg)
        ),
        row(
            'argumentOfPeriapsis',
            'Arg. of Periapsis',
            formatAngleDeg(elements.argumentOfPeriapsisDeg)
        ),
        row('trueAnomaly', 'True Anomaly', formatAngleDeg(elements.trueAnomalyDeg)),
        row('distanceFromReference', 'Distance', formatAU(elements.distance)),
        row('orbitalSpeed', 'Orbital Speed', formatSpeed(elements.speed))
    );

    return rows;
}

/**
 * Build the reference-orbit rows: the elements the body was placed on. `a` and `e` are derived
 * from the two apsides here for the same reason the placements derive them — so the five
 * published numbers can never disagree with the two shown values.
 */
export function buildReferenceOrbitRows(elements: IBodyOrbitElements): IBodyAttributeRow[] {
    const semiMajorAxis = semiMajorAxisFromApsides(elements.perihelion, elements.aphelion);
    const eccentricity = eccentricityFromApsides(elements.perihelion, elements.aphelion);

    return [
        row('refSemiMajorAxis', 'Semi-major Axis', formatAU(semiMajorAxis)),
        row('refEccentricity', 'Eccentricity', formatEccentricity(eccentricity)),
        row('refPeriapsis', 'Periapsis', formatAU(elements.perihelion)),
        row('refApoapsis', 'Apoapsis', formatAU(elements.aphelion)),
        row('refInclination', 'Inclination', formatAngleDeg(elements.inclinationDeg)),
        row(
            'refLongitudeAscendingNode',
            'Long. of Asc. Node',
            formatAngleDeg(elements.longitudeAscendingNodeDeg)
        ),
        row(
            'refArgumentOfPeriapsis',
            'Arg. of Periapsis',
            formatAngleDeg(elements.argumentOfPeriapsisDeg)
        ),
    ];
}

/**
 * Explain what the live rows are measuring, for the cases where they need saying: an unbound
 * trajectory, or a body with no orbital reference frame at all (the system's central star).
 */
export function orbitalDataNote(
    elements: ILiveOrbitElements | null,
    referenceLabel: string | null
): string | null {
    if (!elements) {
        // No reference frame at all: the section body already says so, and adding a note would
        // only repeat it.
        if (referenceLabel === null) return null;
        return `${NOT_APPLICABLE_PLACEHOLDER} Orbital elements could not be derived from the current state.`;
    }

    if (!elements.isBound) {
        return 'Unbound trajectory: this body is escaping its orbital reference.';
    }

    return null;
}
