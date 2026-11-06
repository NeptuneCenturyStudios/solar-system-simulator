import * as THREE from 'three';
import { PlanetTypeEnum, type MoonTypeEnum } from '../bodies/body-enums';
import { SeededRandom } from '../utilities/prng';

/**
 * Everything that makes one body's clouds its own. Read by the shared coverage function
 * (effects/cloud-coverage-glsl.ts), so the flat and volumetric tiers draw identical clouds.
 */
export interface ICloudProfile {
    /** Overall cloud cover, 0 (clear) to 1 (overcast). */
    coverage: number;
    /** Coverage never drops below this. 1 makes a closed deck (Venus). */
    coverageFloor: number;
    /** > 1 squeezes the noise along the spin axis, smearing clouds into east-west bands. */
    bandStretch: number;
    /**
     * Coverage added by latitude band (sin of latitude):
     * x: equator (an ITCZ), y: subtropics (~27°, usually negative: the clear desert belts),
     * z: mid-latitudes (~50°, storm tracks), w: poles.
     */
    latitudeBias: THREE.Vector4;
    /** Noise frequency over the globe. Higher means more, smaller weather systems. */
    scale: number;
    /** Offset into the noise volume (0..1 per axis), so bodies don't share a pattern. */
    seedOffset: THREE.Vector3;
    /** Cloud albedo colour. */
    tint: THREE.Color;
    /** Multiplies the deck's optical depth (CLOUD_OPTICAL_DEPTH). */
    densityScale: number;
    /** 0..1 brightness variation within cloud, to show bands in a closed deck. */
    shadeContrast: number;
    /** How fast the weather reshapes, in noise units per second of (clamped) animation time. */
    evolveRate: number;
    /** Strength of the domain warp that curls clouds into swirls. */
    swirl: number;
    /**
     * 0..1: how much clouds rise in rounded, cauliflower heads (cumulus) rather than lying in
     * flat, even sheets (stratus).
     */
    billowiness: number;
    /** 0..1: how far up from the base clouds fray into thin wisps instead of billowing. */
    wispiness: number;
    /** 0..1: amount of thin, streaky high cirrus veils. */
    cirrus: number;
    /** 0..1: tallest cloud as a fraction of the deck's thickness. */
    maxHeight: number;
    /**
     * 0..1: how thin and translucent cloud margins are. 0 ends clouds at a fairly crisp surface,
     * 1 fades them out through a wide, fluffy fringe. Cores stay solid either way; overall
     * opacity is densityScale.
     */
    edgeSoftness: number;
    /**
     * Frequency of large weather systems over the globe (fronts, overcast decks, clear regions).
     * ~0.4 gives a few continent-sized systems; higher gives more, smaller ones.
     */
    systemScale: number;
    /**
     * 0..~0.6: how strongly weather systems push cover up or down. 0 spreads clouds evenly;
     * higher merges clouds into big decks in some regions and clears others out.
     */
    systemStrength: number;
    /**
     * 0..1: how much cloud size varies from region to region. 0 keeps every cloud the same size;
     * 1 grows some regions' clouds into a few large masses.
     */
    sizeVariety: number;
    /**
     * 0..1: whether clouds are single solid masses or clusters of puffs. 0 lets the billow and
     * lobe detail cut all the way through (popcorn cumulus); 1 keeps it to the margins, so big
     * clouds stay cohesive with lumpy, billowy outlines.
     */
    cohesion: number;
}

type CloudSubtype = PlanetTypeEnum | MoonTypeEnum;

/** Earth-like circulation: cloudy equator, clear subtropics, stormy mid-latitudes. */
const EARTH_LIKE_BANDS = new THREE.Vector4(0.1, -0.16, 0.12, 0.02);
/** No preferred latitude. */
const FLAT_BANDS = new THREE.Vector4(0, 0, 0, 0);

export const EARTH_CLOUD_PROFILE: ICloudProfile = {
    coverage: 0.65,
    coverageFloor: 0,
    bandStretch: 1.5,
    latitudeBias: EARTH_LIKE_BANDS.clone(),
    scale: 1.3,
    seedOffset: new THREE.Vector3(0.37, 0.11, 0.73),
    tint: new THREE.Color(0xffffff),
    densityScale: 0.08,
    shadeContrast: 0.55,
    evolveRate: 0.003,
    swirl: 0.15,
    billowiness: 0.99,
    wispiness: 0.99,
    cirrus: 0.5,
    maxHeight: 1,
    edgeSoftness: 1,
    systemScale: 0.6,
    systemStrength: 0.4,
    sizeVariety: 0.3,
    cohesion: 0.65,
};

/** A closed, strongly banded sulphuric-acid deck. */
export const VENUS_CLOUD_PROFILE: ICloudProfile = {
    coverage: 1,
    coverageFloor: 1,
    bandStretch: 4,
    latitudeBias: FLAT_BANDS.clone(),
    scale: 1.1,
    seedOffset: new THREE.Vector3(0.61, 0.29, 0.05),
    tint: new THREE.Color(0xfff1d0),
    densityScale: 0.2,
    shadeContrast: 0.35,
    evolveRate: 0.003,
    swirl: 0.25,
    // A smooth sulphuric-acid haze deck, not cumulus.
    billowiness: 0.15,
    wispiness: 0.3,
    cirrus: 0,
    maxHeight: 1,
    edgeSoftness: 0.5,
    // A closed deck: systems only shade its bands.
    systemScale: 0.4,
    systemStrength: 0,
    sizeVariety: 0.3,
    cohesion: 0.85,
};

/**
 * Per-subtype ranges a procedural body's cloud profile is rolled from. Each [min, max] pair is
 * drawn uniformly. The Earth-like types are centred on EARTH_CLOUD_PROFILE (subtle, translucent,
 * soft-edged cumulus); volcanic worlds follow VENUS_CLOUD_PROFILE (a dense, smooth, banded haze).
 */
interface ISubtypeCloudRanges {
    coverage: [number, number];
    /** Coverage never drops below this. Near 1 closes the deck (Venus-like). */
    coverageFloor: [number, number];
    bandStretch: [number, number];
    bands: THREE.Vector4;
    /** One is picked per body. */
    tints: readonly number[];
    scale: [number, number];
    densityScale: [number, number];
    shadeContrast: [number, number];
    swirl: [number, number];
    billowiness: [number, number];
    wispiness: [number, number];
    cirrus: [number, number];
    maxHeight: [number, number];
    edgeSoftness: [number, number];
    systemScale: [number, number];
    systemStrength: [number, number];
    sizeVariety: [number, number];
    cohesion: [number, number];
}

/** Earth-like defaults (EARTH_CLOUD_PROFILE with some spread); subtypes override what differs. */
const EARTH_LIKE_RANGES: ISubtypeCloudRanges = {
    coverage: [0.55, 0.7],
    coverageFloor: [0, 0],
    bandStretch: [1.3, 2.0],
    bands: EARTH_LIKE_BANDS,
    tints: [0xffffff],
    scale: [1.1, 1.6],
    densityScale: [0.06, 0.1],
    shadeContrast: [0.45, 0.6],
    swirl: [0.1, 0.22],
    billowiness: [0.9, 1.0],
    wispiness: [0.85, 1.0],
    cirrus: [0.3, 0.55],
    maxHeight: [0.85, 1],
    edgeSoftness: [0.85, 1],
    systemScale: [0.45, 0.7],
    systemStrength: [0.3, 0.45],
    sizeVariety: [0.2, 0.45],
    cohesion: [0.55, 0.75],
};

const SUBTYPE_RANGES: Record<string, ISubtypeCloudRanges> = {
    [PlanetTypeEnum.Temperate]: EARTH_LIKE_RANGES,
    // Humid: a little more cloud, a little denser and taller.
    [PlanetTypeEnum.Ocean]: {
        ...EARTH_LIKE_RANGES,
        coverage: [0.6, 0.78],
        bandStretch: [1.3, 2.2],
        densityScale: [0.07, 0.12],
        maxHeight: [0.9, 1],
    },
    // Drier and patchier, with lower clouds.
    [PlanetTypeEnum.Terrestrial]: {
        ...EARTH_LIKE_RANGES,
        coverage: [0.35, 0.55],
        bands: new THREE.Vector4(0.04, -0.06, 0.06, 0.02),
        tints: [0xf4f4f4],
        densityScale: [0.05, 0.09],
        billowiness: [0.7, 0.95],
        wispiness: [0.8, 1.0],
        cirrus: [0.2, 0.5],
        maxHeight: [0.6, 0.85],
    },
    // Thin, low, wispy ice cloud with plenty of cirrus.
    [PlanetTypeEnum.Frozen]: {
        ...EARTH_LIKE_RANGES,
        coverage: [0.3, 0.5],
        bandStretch: [1.2, 1.8],
        bands: new THREE.Vector4(-0.04, 0, 0.06, 0.14),
        tints: [0xf0f6ff],
        densityScale: [0.04, 0.07],
        billowiness: [0.4, 0.7],
        wispiness: [0.9, 1.0],
        cirrus: [0.4, 0.8],
        maxHeight: [0.45, 0.7],
    },
    // Dry: sparse, faint, wispy, with high streaks.
    [PlanetTypeEnum.Desert]: {
        ...EARTH_LIKE_RANGES,
        coverage: [0.2, 0.35],
        bandStretch: [1.5, 2.5],
        bands: new THREE.Vector4(0.06, -0.1, 0.04, 0.04),
        tints: [0xfff4e6],
        densityScale: [0.03, 0.06],
        billowiness: [0.5, 0.8],
        wispiness: [0.9, 1.0],
        cirrus: [0.5, 0.9],
        maxHeight: [0.5, 0.75],
    },
    // Venus-like: a dense, smooth, strongly banded haze of ash or sulphur, mostly closed, with
    // the odd thinner patch the lava glows through.
    [PlanetTypeEnum.Volcanic]: {
        coverage: [0.85, 1],
        coverageFloor: [0.5, 0.9],
        bandStretch: [2.5, 4],
        bands: FLAT_BANDS,
        // Ash grey, pale ash, sulphur.
        tints: [0xc8c0b8, 0xe8dcc0, 0xfff1d0],
        scale: [1.0, 1.3],
        densityScale: [0.15, 0.25],
        shadeContrast: [0.3, 0.4],
        swirl: [0.2, 0.3],
        billowiness: [0.1, 0.3],
        wispiness: [0.2, 0.4],
        cirrus: [0, 0],
        maxHeight: [0.9, 1],
        edgeSoftness: [0.4, 0.6],
        systemScale: [0.35, 0.5],
        systemStrength: [0, 0.15],
        sizeVariety: [0.2, 0.4],
        cohesion: [0.75, 0.9],
    },
};

/** Anything without its own entry gets subtle, Earth-like cloud with no preferred latitude. */
const DEFAULT_RANGES: ISubtypeCloudRanges = {
    ...EARTH_LIKE_RANGES,
    coverage: [0.35, 0.55],
    bands: FLAT_BANDS,
    maxHeight: [0.7, 0.9],
};

/** Uniform draw from a [min, max] range. */
function roll(rng: SeededRandom, range: [number, number]): number {
    return rng.range(range[0], range[1]);
}

/**
 * Rolls a deterministic cloud profile for a procedural or custom body. The draw order is fixed:
 * new parameters are drawn after the existing ones, so adding one never reshuffles the clouds
 * of bodies that already exist.
 */
export function rollCloudProfile(subtype: CloudSubtype, seed: string): ICloudProfile {
    const rng = new SeededRandom(`${seed}|clouds-profile`);
    const ranges = SUBTYPE_RANGES[subtype] ?? DEFAULT_RANGES;
    const profile: ICloudProfile = {
        coverage: roll(rng, ranges.coverage),
        coverageFloor: 0,
        bandStretch: roll(rng, ranges.bandStretch),
        latitudeBias: ranges.bands.clone(),
        scale: roll(rng, ranges.scale),
        seedOffset: new THREE.Vector3(rng.next(), rng.next(), rng.next()),
        tint: new THREE.Color(ranges.tints[0]),
        densityScale: roll(rng, ranges.densityScale),
        shadeContrast: roll(rng, ranges.shadeContrast),
        evolveRate: rng.range(0.003, 0.006),
        swirl: roll(rng, ranges.swirl),
        billowiness: roll(rng, ranges.billowiness),
        wispiness: roll(rng, ranges.wispiness),
        cirrus: roll(rng, ranges.cirrus),
        maxHeight: roll(rng, ranges.maxHeight),
        edgeSoftness: roll(rng, ranges.edgeSoftness),
        systemScale: roll(rng, ranges.systemScale),
        systemStrength: roll(rng, ranges.systemStrength),
        sizeVariety: roll(rng, ranges.sizeVariety),
        cohesion: roll(rng, ranges.cohesion),
    };
    // Drawn last (see above).
    profile.coverageFloor = roll(rng, ranges.coverageFloor);
    profile.tint.set(rng.pick([...ranges.tints]) ?? ranges.tints[0]);
    return profile;
}
