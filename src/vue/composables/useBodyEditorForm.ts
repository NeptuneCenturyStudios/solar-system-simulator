import {
    computed,
    inject,
    provide,
    reactive,
    watch,
    type ComputedRef,
    type InjectionKey,
} from 'vue';

import { COMET_TAIL_COLOR_PALETTE, RADIUS_SCALE } from '../../utilities/consts';
import type { IMagneticFieldOptions } from '../../interfaces';
import type { IAtmosphereProfile } from '../../procedural/atmosphere-profile';
import { subtypeForcesAtmosphere } from '../../procedural/atmosphere-profile';
import {
    bodyEditorStore,
    generateAddFormBodyName,
    getRandomizedCreateDefaults,
    resolveOrbitParentId,
    simStore,
    type ApplyBodyEditPayload,
    type BodyEditSnapshot,
    type BodySnapshot,
    type CreateBodyPayload,
} from '../sim-bridge';

/**
 * One form for both Add and Edit. Add mode fills it from a procedural roll for the chosen body
 * type; edit mode fills it from the selected body's snapshot. The `view` flags decide which
 * fields show and which are editable, so the panel's template is shared between the two modes.
 */

/** Floor for asteroid/comet mass inputs, which run far below planetary scale. */
const SMALL_BODY_MIN = '0.000001';
/** Radius input floors in km (the old sim-unit floors of 0.000001 / 0.01, times RADIUS_SCALE). */
const SMALL_BODY_RADIUS_MIN_KM = '0.0001';
const RADIUS_MIN_KM = '1';

export const ATM_RADIUS_FACTOR_MIN = 1.01;
export const ATM_RADIUS_FACTOR_MAX = 2;
export const ATM_PRESSURE_MIN = 0.00001;

const DEFAULT_TAIL_COLOR = '#7ab8ff';

/** Add-form body types that can orbit the system barycenter (moons need a parent). */
const BARYCENTER_BODY_TYPES: ReadonlySet<string> = new Set(['sun', 'planet', 'asteroid', 'comet']);

export type OrbitType = 'circular' | 'elliptical' | 'binary';

export interface BodyFormState {
    /** Add-form body type key; '' until the user picks one. */
    bodyType: string;
    /** Planet/moon subtype key; '' until the user picks one. */
    subtype: string;
    name: string;
    mass: number;
    /** Body radius in km; converted to/from sim units with RADIUS_SCALE at the form's edges. */
    radiusKm: number;
    temperature: number;
    lightIntensity: number;
    tailColor: string;
    hasRings: boolean;
    /** Orbit parent body id; '' means "the default parent" (see `view.orbitParentId`). */
    orbitParentId: string;
    /** Orbit the system barycenter instead of the orbit parent. */
    orbitSystemBarycenter: boolean;
    orbitType: OrbitType;
    inclination: number;
    /** Edit-only: current speed. */
    velocity: number;
    /** Edit-only: direction of travel in the XZ plane. */
    orbitalAngle: number;
    tilt: number;
    azimuth: number;
    hasAtmosphere: boolean;
    /** Atmosphere radius as a multiple of the body's radius. */
    atmRadiusFactor: number;
    /** Surface (or cloud-top) pressure in bar. */
    atmPressure: number;
    hasMagneticField: boolean;
    magStrength: number;
    magTilt: number;
    magAzimuth: number;
    magOffset: number;
    magReversed: boolean;
}

/** What the form shows and allows, derived from the mode, body type and snapshot. */
export interface BodyFormView {
    isEdit: boolean;
    snapshot: BodyEditSnapshot | null;
    /** Planet/moon need a subtype before their fields can be rolled. */
    needsSubtype: boolean;
    /** True once enough is chosen to show the field groups. */
    fieldsReady: boolean;
    showStarFields: boolean;
    showTailColor: boolean;
    showMass: boolean;
    showRings: boolean;
    ringsEditable: boolean;
    massMin: string;
    radiusMin: string;
    radiusStep: string;
    /** Orbit parent / type / inclination rows (velocity and angle too, in edit mode). */
    showOrbitFields: boolean;
    showTilt: boolean;
    /** Bodies eligible as an orbit parent in add mode. */
    orbitParentOptions: BodySnapshot[];
    /** The parent the new body will orbit (explicit choice or the default), or null. */
    orbitParentId: string | null;
    orbitParentName: string | null;
    /** A new star orbiting another star can join it in a true binary (shared barycenter). */
    binaryAvailable: boolean;
    /** The "Orbit system barycenter" checkbox is offered (stars, planets, asteroids, comets). */
    barycenterAvailable: boolean;
    /** The new body will orbit the system barycenter instead of a parent. */
    usesSystemBarycenter: boolean;
    showAtmosphereSection: boolean;
    /** The "Has Atmosphere" checkbox can be toggled (add mode, optional-atmosphere subtypes). */
    atmosphereToggleEnabled: boolean;
    /** The atmosphere controls are live (body has / will have an atmosphere). */
    atmosphereActive: boolean;
    atmosphereIsCloudTop: boolean;
    showMagneticSection: boolean;
    /** Moons need a parent; null when everything required is chosen. */
    validationMessage: string | null;
}

export interface BodyEditorContext {
    form: BodyFormState;
    view: ComputedRef<BodyFormView>;
}

const BODY_EDITOR_KEY: InjectionKey<BodyEditorContext> = Symbol('bodyEditor');

/** Section components read the shared form through this. */
export function useBodyEditorContext(): BodyEditorContext {
    const ctx = inject(BODY_EDITOR_KEY);
    if (!ctx) throw new Error('useBodyEditorContext() called outside AddEditBodyPanel');
    return ctx;
}

// ── Value helpers ─────────────────────────────────────────────────────────
// The procedural roll produces azimuth over 0–360 and full-precision floats; the
// sliders want -180..180 and something readable. These convert between the two.

/** Wraps an angle into the -180..180 range the azimuth slider uses. */
function normalizeAzimuth(deg: number): number {
    const wrapped = ((deg % 360) + 360) % 360;
    return wrapped > 180 ? wrapped - 360 : wrapped;
}

/** Field strengths span 0.001–100 G, so keep enough significant digits at the low end. */
function roundStrength(gauss: number): number {
    return Number(gauss.toPrecision(3));
}

/** Dipole offset is a 0–1 fraction of radius shown at slider (0.01) resolution. */
function roundOffset(fraction: number): number {
    return Math.round(fraction * 100) / 100;
}

/** Radius factor at slider (0.01) resolution, kept inside the slider's range. */
function roundRadiusFactor(factor: number): number {
    const clamped = Math.min(ATM_RADIUS_FACTOR_MAX, Math.max(ATM_RADIUS_FACTOR_MIN, factor));
    return Math.round(clamped * 100) / 100;
}

/** Pressures span µbar to ~100 bar, so keep significant digits rather than decimals. */
function roundPressure(bar: number): number {
    return Number(bar.toPrecision(3));
}

/** Sim-unit radius -> km, at 6 significant digits so the box doesn't show float noise. */
function simRadiusToKm(simRadius: number): number {
    return Number((simRadius * RADIUS_SCALE).toPrecision(6));
}

/** km -> sim-unit radius. */
function kmToSimRadius(km: number): number {
    return km / RADIUS_SCALE;
}

/** Picks a random comet-tail color from the shared procedural palette, as a hex string. */
function randomCometTailColorHex(): string {
    const color =
        COMET_TAIL_COLOR_PALETTE[Math.floor(Math.random() * COMET_TAIL_COLOR_PALETTE.length)];
    return '#' + color.toString(16).padStart(6, '0');
}

function createInitialState(): BodyFormState {
    return {
        bodyType: '',
        subtype: '',
        name: '',
        mass: 0,
        radiusKm: 0,
        temperature: 5778,
        lightIntensity: 15000,
        tailColor: DEFAULT_TAIL_COLOR,
        hasRings: false,
        orbitParentId: '',
        orbitSystemBarycenter: false,
        orbitType: 'circular',
        inclination: 0,
        velocity: 0,
        orbitalAngle: 0,
        tilt: 0,
        azimuth: 0,
        hasAtmosphere: false,
        atmRadiusFactor: 1.07,
        atmPressure: 1,
        hasMagneticField: false,
        magStrength: 0.3,
        magTilt: 0,
        magAzimuth: 0,
        magOffset: 0,
        magReversed: false,
    };
}

function magneticFieldFromForm(form: BodyFormState): IMagneticFieldOptions | null {
    if (!form.hasMagneticField) return null;
    return {
        strength: form.magStrength,
        tilt: form.magTilt,
        azimuth: form.magAzimuth,
        offset: form.magOffset,
        reversed: form.magReversed,
    };
}

function applyMagneticField(form: BodyFormState, field: IMagneticFieldOptions | null): void {
    // A null field means this body has / will have none, so the checkbox comes up unchecked.
    form.hasMagneticField = field !== null;
    if (!field) return;
    form.magStrength = roundStrength(field.strength);
    form.magTilt = Math.round(field.tilt);
    form.magAzimuth = Math.round(normalizeAzimuth(field.azimuth));
    form.magOffset = roundOffset(field.offset ?? 0);
    form.magReversed = field.reversed ?? false;
}

/**
 * Creates the shared form for AddEditBodyPanel and provides it to the section components.
 * `isEdit` is read reactively so the same form instance follows mode switches.
 */
export function useBodyEditorForm(isEdit: () => boolean) {
    const form = reactive<BodyFormState>(createInitialState());
    /** The last procedurally generated name, so a parent change can re-roll an untouched one. */
    let lastGeneratedName = '';

    const candidateParents = computed(() =>
        simStore.bodies.filter((b) => b.isProbeTarget && !b.isShip)
    );

    /** Default parent: the selected body when valid, else the first star (never for moons). */
    const defaultOrbitParentId = computed<string | null>(() => {
        const selected = resolveOrbitParentId(simStore.selectedId);
        if (selected && candidateParents.value.some((b) => b.id === selected)) return selected;
        if (form.bodyType === 'moon') return null;
        return candidateParents.value.find((b) => b.isStar)?.id ?? null;
    });

    const view = computed<BodyFormView>(() => {
        const edit = isEdit();
        const snap = bodyEditorStore.snapshot;
        const type = form.bodyType;
        const needsSubtype = !edit && (type === 'planet' || type === 'moon');
        const fieldsReady = edit ? !!snap : type !== '' && (!needsSubtype || form.subtype !== '');

        const isSmallBody = edit
            ? !!snap?.isAsteroid || !!snap?.isComet
            : type === 'asteroid' || type === 'comet';

        const orbitParentId = edit
            ? null
            : (resolveOrbitParentId(form.orbitParentId || null) ?? defaultOrbitParentId.value);
        const orbitParent = edit
            ? null
            : (candidateParents.value.find((b) => b.id === orbitParentId) ?? null);
        const barycenterAvailable =
            !edit &&
            BARYCENTER_BODY_TYPES.has(type) &&
            candidateParents.value.some((b) => b.isStar);
        const usesSystemBarycenter = barycenterAvailable && form.orbitSystemBarycenter;
        const orbitParentName = edit
            ? (snap?.orbitParentName ?? null)
            : usesSystemBarycenter
              ? 'System barycenter'
              : (orbitParent?.name ?? null);

        // Atmosphere: edit mode can tune an existing atmosphere but never add or remove one.
        const forcesAtmosphere =
            (type === 'planet' || type === 'moon') && subtypeForcesAtmosphere(form.subtype);
        const canToggleAtmosphere = (type === 'planet' || type === 'moon') && !forcesAtmosphere;

        return {
            isEdit: edit,
            snapshot: snap,
            needsSubtype,
            fieldsReady,
            showStarFields: edit ? !!snap?.isStar : type === 'sun',
            showTailColor: edit ? !!snap?.isComet : type === 'comet',
            showMass: edit || type !== 'wormhole',
            showRings: edit
                ? snap?.bodyTypeKey === 'planet' || snap?.bodyTypeKey === 'dwarf_planet'
                : type === 'planet',
            ringsEditable: !edit,
            massMin: isSmallBody ? SMALL_BODY_MIN : '0.001',
            radiusMin: isSmallBody ? SMALL_BODY_RADIUS_MIN_KM : RADIUS_MIN_KM,
            radiusStep: 'any',
            showOrbitFields: edit || (type !== 'black_hole' && type !== 'wormhole'),
            showTilt: edit
                ? !!snap?.hasTilt
                : type === 'sun' || type === 'planet' || type === 'moon' || type === 'wormhole',
            orbitParentOptions: candidateParents.value,
            orbitParentId,
            orbitParentName,
            // Binary pairs with a parent star, so it's off while the barycenter box is ticked.
            binaryAvailable:
                !edit && type === 'sun' && !usesSystemBarycenter && !!orbitParent?.isStar,
            barycenterAvailable,
            usesSystemBarycenter,
            showAtmosphereSection: edit ? !!snap?.atmosphere : type === 'planet' || type === 'moon',
            atmosphereToggleEnabled: !edit && canToggleAtmosphere,
            atmosphereActive: edit
                ? !!snap?.atmosphere
                : forcesAtmosphere || (canToggleAtmosphere && form.hasAtmosphere),
            atmosphereIsCloudTop: edit
                ? !!snap?.atmosphereIsCloudTop
                : type === 'planet' &&
                  (form.subtype === 'gas_giant' || form.subtype === 'ice_giant'),
            showMagneticSection: edit
                ? !!snap?.canHaveMagneticField
                : type === 'sun' || type === 'planet' || type === 'moon',
            validationMessage:
                !edit && type === 'moon' && !orbitParentId
                    ? 'Select an orbit parent for the moon'
                    : null,
        };
    });

    provide(BODY_EDITOR_KEY, { form, view });

    // One rule for every way Binary can stop applying (body type, parent, barycenter box,
    // selection change): fall back to Circular rather than leave a hidden radio selected.
    watch(
        () => view.value.binaryAvailable,
        (available) => {
            if (!available && form.orbitType === 'binary') form.orbitType = 'circular';
        }
    );

    /** Back to an empty Add form ("< Select >" body type, nothing else shown). */
    function resetForAdd(): void {
        Object.assign(form, createInitialState());
        lastGeneratedName = '';
    }

    function rollName(): void {
        lastGeneratedName = generateAddFormBodyName(form.bodyType, view.value.orbitParentId);
        form.name = lastGeneratedName;
    }

    /** Moons are named after their parent; follow a parent change unless the user typed a name. */
    function onOrbitParentChanged(): void {
        if (form.bodyType === 'moon' && form.name === lastGeneratedName) rollName();
    }

    /**
     * Rolls fresh procedural values for the chosen body type (and subtype, which stays pinned).
     * Does nothing until the form has everything it needs to roll.
     */
    function randomize(): void {
        if (isEdit() || !view.value.fieldsReady) return;
        const type = form.bodyType;
        rollName();

        const defaults = getRandomizedCreateDefaults(type, form.subtype || undefined);
        if (!defaults) return;
        if (defaults.mass !== null) form.mass = defaults.mass;
        if (defaults.radius !== null) form.radiusKm = simRadiusToKm(defaults.radius);
        if (defaults.temperature !== null) form.temperature = defaults.temperature;
        if (defaults.lightIntensity !== null) form.lightIntensity = defaults.lightIntensity;
        if (defaults.tilt !== null) form.tilt = defaults.tilt;
        if (defaults.azimuth !== null) form.azimuth = defaults.azimuth;
        if (defaults.inclination !== null) form.inclination = defaults.inclination;
        form.hasAtmosphere = defaults.hasAtmosphere;
        if (defaults.atmosphere) {
            form.atmRadiusFactor = roundRadiusFactor(defaults.atmosphere.radiusFactor);
            form.atmPressure = roundPressure(defaults.atmosphere.surfacePressureBar);
        }
        form.hasRings = type === 'planet' && defaults.hasRings;
        applyMagneticField(form, defaults.magneticField);
        if (type === 'comet') form.tailColor = randomCometTailColorHex();
    }

    /** Body Type dropdown changed: planets/moons wait for a subtype, everything else rolls now. */
    function onBodyTypeChanged(): void {
        form.subtype = '';
        form.orbitParentId = '';
        form.orbitSystemBarycenter = false;
        if (!view.value.needsSubtype) randomize();
    }

    /** Planet/Moon Type dropdown changed: roll values for that subtype. */
    function onSubtypeChanged(): void {
        randomize();
    }

    /** Fills the form from the edited body's snapshot. */
    function loadFromSnapshot(snap: BodyEditSnapshot | null): void {
        if (!snap) return;
        form.bodyType = snap.bodyTypeKey;
        form.subtype = snap.subtypeKey ?? '';
        form.name = snap.name;
        form.tailColor = snap.tailColorHex ?? DEFAULT_TAIL_COLOR;
        form.mass = snap.mass;
        form.radiusKm = simRadiusToKm(snap.radius);
        form.temperature = snap.temperature ?? 5778;
        form.lightIntensity = snap.lightIntensity ?? 15000;
        form.hasRings = snap.hasRings;
        form.velocity = snap.velocity;
        form.orbitalAngle = Math.round(snap.orbitalAngle);
        form.inclination = Math.round(snap.inclination);
        form.tilt = Math.round(snap.tilt);
        form.azimuth = Math.round(snap.azimuth);
        form.hasAtmosphere = snap.atmosphere !== null;
        if (snap.atmosphere) {
            form.atmRadiusFactor = roundRadiusFactor(snap.atmosphere.radiusFactor);
            form.atmPressure = roundPressure(snap.atmosphere.surfacePressureBar);
        }
        applyMagneticField(form, snap.magneticField);
    }

    function buildCreatePayload(): CreateBodyPayload {
        const v = view.value;
        const type = form.bodyType;
        return {
            bodyType: type,
            // Empty means "let the sim generate one procedurally".
            customName: form.name.trim() || null,
            planetType: form.subtype || 'solid',
            // Binary only applies to a star orbiting a star; anything else falls back.
            orbitType:
                form.orbitType === 'binary' && !v.binaryAvailable ? 'circular' : form.orbitType,
            inclination: form.inclination,
            atmosphere: v.atmosphereActive
                ? { radiusFactor: form.atmRadiusFactor, surfacePressureBar: form.atmPressure }
                : null,
            hasRings: v.showRings && form.hasRings,
            customMass: v.showMass ? form.mass : null,
            customTemperature: v.showStarFields ? form.temperature : null,
            customLightIntensity: v.showStarFields ? form.lightIntensity : null,
            customRadius: kmToSimRadius(form.radiusKm),
            orbitParentId: v.orbitParentId,
            orbitSystemBarycenter: v.usesSystemBarycenter,
            createTilt: v.showTilt ? form.tilt : null,
            createAzimuth: v.showTilt ? form.azimuth : null,
            magneticField: v.showMagneticSection ? magneticFieldFromForm(form) : null,
            tailColor: v.showTailColor ? form.tailColor : null,
        };
    }

    /** The edited atmosphere, or undefined when the body has none or neither control changed. */
    function editedAtmosphere(original: IAtmosphereProfile | null): IAtmosphereProfile | undefined {
        if (!original) return undefined;
        const unchanged =
            form.atmRadiusFactor === roundRadiusFactor(original.radiusFactor) &&
            form.atmPressure === roundPressure(original.surfacePressureBar);
        if (unchanged) return undefined;
        return { radiusFactor: form.atmRadiusFactor, surfacePressureBar: form.atmPressure };
    }

    function buildApplyPayload(snap: BodyEditSnapshot): ApplyBodyEditPayload {
        return {
            name: form.name,
            mass: form.mass,
            temperature: snap.isStar ? form.temperature : null,
            lightIntensity: snap.isStar ? form.lightIntensity : null,
            // An untouched box sends the exact radius back, not the rounded km round-trip.
            radius:
                form.radiusKm === simRadiusToKm(snap.radius)
                    ? snap.radius
                    : kmToSimRadius(form.radiusKm),
            velocity: form.velocity,
            orbitalAngle: form.orbitalAngle,
            inclination: form.inclination,
            tailColor: snap.isComet ? form.tailColor : null,
            isStarBody: snap.isStar,
            editTilt: snap.hasTilt ? form.tilt : null,
            editAzimuth: snap.hasTilt ? form.azimuth : null,
            // Undefined leaves the field untouched for body types that can't carry one.
            magneticField: snap.canHaveMagneticField ? magneticFieldFromForm(form) : undefined,
            // Only sent when a control actually moved, so APPLY on an untouched form doesn't
            // snap the body's exact atmosphere to the controls' rounded values.
            atmosphere: editedAtmosphere(snap.atmosphere),
        };
    }

    return {
        form,
        view,
        resetForAdd,
        randomize,
        onBodyTypeChanged,
        onSubtypeChanged,
        onOrbitParentChanged,
        loadFromSnapshot,
        buildCreatePayload,
        buildApplyPayload,
    };
}
