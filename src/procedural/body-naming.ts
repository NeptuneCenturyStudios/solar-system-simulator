import { SeededRandom } from '../utilities/prng';
import { BodyTypeEnum } from '../utilities/utilities';
import { PlanetTypeEnum } from '../utilities/body-params';

export type ProceduralBodyNameOptions = {
    /** Seed that drives determinism (must be stable for the same generated body). */
    seed: string;

    /** Stable per-system ordering number when available (e.g. star index + 1). */
    sequenceNumber?: number;

    /**
     * For moons/satellites: use parent's resolved name so we can do:
     *   `${parentName} ${romanNumeral}`
     */
    parentName?: string;

    /** For planet naming (terrestrial/ocean/etc). */
    planetSubtype?: PlanetTypeEnum;

    /** For star naming (optional; improves tailoring). */
    starTemperatureK?: number;
};

const LETTERS_NO_I = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

const syllables = [
    'al',
    'an',
    'ar',
    'as',
    'at',
    'ba',
    'be',
    'bi',
    'bo',
    'ca',
    'ce',
    'ci',
    'co',
    'da',
    'de',
    'di',
    'do',
    'el',
    'en',
    'er',
    'es',
    'et',
    'fa',
    'fe',
    'fi',
    'fo',
    'ga',
    'ge',
    'gi',
    'go',
    'ha',
    'he',
    'hi',
    'ho',
    'il',
    'in',
    'ir',
    'is',
    'it',
    'ka',
    'ke',
    'ki',
    'ko',
    'la',
    'le',
    'li',
    'lo',
    'ma',
    'me',
    'mi',
    'mo',
    'na',
    'ne',
    'ni',
    'no',
    'ol',
    'on',
    'or',
    'os',
    'ot',
    'pa',
    'pe',
    'pi',
    'po',
    'ra',
    're',
    'ri',
    'ro',
    'sa',
    'se',
    'si',
    'so',
    'ta',
    'te',
    'ti',
    'to',
    'ul',
    'un',
    'ur',
    'us',
    'ut',
    'va',
    've',
    'vi',
    'vo',
    'za',
    'ze',
    'zi',
    'zo',
    'xy',
    'xeno',
    'cy',
    'cryo',
    'ly',
    'lyra',
    'sy',
    'syn',
    'thal',
    'mor',
    'dor',
];

function toRoman(num: number): string {
    const n = Math.floor(num);
    if (!Number.isFinite(n) || n <= 0) return 'I';
    if (n > 3999) return toRoman(3999);

    const romans: Array<[number, string]> = [
        [1000, 'M'],
        [900, 'CM'],
        [500, 'D'],
        [400, 'CD'],
        [100, 'C'],
        [90, 'XC'],
        [50, 'L'],
        [40, 'XL'],
        [10, 'X'],
        [9, 'IX'],
        [5, 'V'],
        [4, 'IV'],
        [1, 'I'],
    ];

    let remaining = n;
    let out = '';
    for (const [value, sym] of romans) {
        while (remaining >= value) {
            out += sym;
            remaining -= value;
        }
    }
    return out;
}

function clampInt(n: number, min: number, max: number): number {
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

function pickFrom<T>(rng: SeededRandom, arr: T[]): T {
    const p = rng.pick(arr);
    return p ?? arr[0]!;
}

function capitalizeFirst(s: string): string {
    if (!s) return s;
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function spectralClassFromTemperature(tempK: number): 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M' {
    const t = Math.max(0, tempK);
    if (t >= 30000) return 'O';
    if (t >= 10000) return 'B';
    if (t >= 7500) return 'A';
    if (t >= 6000) return 'F';
    if (t >= 5200) return 'G';
    if (t >= 3700) return 'K';
    return 'M';
}

/**
 * Pronounceable syllable builder tuned for “Tibibata” style output:
 * - mostly simple vowels (no long diphthongs like ae/ea/ia/ua)
 * - mostly simple codas (avoid th/d/x/k style harshness)
 * - returns lowercase syllables; we capitalize the whole word once
 */
function makeSyllable(rng: SeededRandom): string {
    return pickFrom(rng, syllables).toLowerCase();
}

function makeWordFromSyllables(
    rng: SeededRandom,
    opts: { minSyllables: number; maxSyllables: number }
): string {
    const min = opts.minSyllables;
    const max = opts.maxSyllables;
    const syllableCount = clampInt(rng.rangeInt(min, max), min, max);

    let out = '';
    for (let i = 0; i < syllableCount; i++) {
        out += makeSyllable(rng);
    }

    // remove any accidental non-letters
    const cleaned = out.replace(/[^a-z]/g, '');
    return cleaned.length > 0 ? capitalizeFirst(cleaned) : 'Proc';
}

function markerLetter(rng: SeededRandom): string {
    const idx = clampInt(rng.rangeInt(0, LETTERS_NO_I.length - 1), 0, LETTERS_NO_I.length - 1);
    return LETTERS_NO_I.charAt(idx);
}

function romanFromSequence(rng: SeededRandom, sequenceNumber?: number): string {
    if (typeof sequenceNumber === 'number' && Number.isFinite(sequenceNumber) && sequenceNumber > 0) {
        return toRoman(sequenceNumber);
    }
    // Small deterministic fallback
    return toRoman(rng.rangeInt(1, 24));
}

export function generateProceduralBodyName(bodyType: BodyTypeEnum, options: ProceduralBodyNameOptions): string {
    const rng = new SeededRandom(options.seed);
    const sequence = options.sequenceNumber;

    switch (bodyType) {
        case BodyTypeEnum.Star: {
            const cls =
                typeof options.starTemperatureK === 'number' && Number.isFinite(options.starTemperatureK)
                    ? spectralClassFromTemperature(options.starTemperatureK)
                    : (() => {
                          // Deterministically derive spectral class from RNG outputs.
                          const roll = rng.next();
                          if (roll < 0.03) return 'O';
                          if (roll < 0.08) return 'B';
                          if (roll < 0.18) return 'A';
                          if (roll < 0.35) return 'F';
                          if (roll < 0.58) return 'G';
                          if (roll < 0.78) return 'K';
                          return 'M';
                      })();

            // Shorter core words than before (user noted “really long”).
            const core = makeWordFromSyllables(rng, { minSyllables: 2, maxSyllables: 2 });

            // Star suffixes: varied + sometimes none (user noted all stars were “Prime”).
            const suffixByClass: Record<'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M', string[]> = {
                O: ['ion', 'elor', 'aris'],
                B: ['ara', 'orin', 'vyr'],
                A: ['ael', 'orin', 'aura'],
                F: ['or', 'elin', 'nara'],
                G: ['en', 'orin', 'sil'],
                K: ['eth', 'vyn', 'keth'],
                M: ['un', 'mira', 'vahl'],
            };

            // Sometimes add an adjective-like suffix token; often omit to keep names short.
            const adjective = rng.chance(0.45) ? pickFrom(rng, suffixByClass[cls]) : '';

            // Majoris/Minor/etc “style” endings (space included when present)
            // Heavily bias toward “no suffix” so not all stars end with Prime.
            const nameEndingBank = [
                '',
                '',
                '',
                '',
                '',
                '',
                ' Prime', // keep Prime rare
                ' Major',
                ' Minor',
                ' Majoris',
                ' Minoris',
                ' Maxima',
                ' Aurea',
                ' Astris',
                ' Lumen',
                ' Zenith',
            ];

            const suffix = pickFrom(rng, nameEndingBank);
            const maybeRoman = rng.chance(0.25) ? ` ${romanFromSequence(rng, sequence)}` : '';

            // Final star shape: "<Core><Adj><Suffix>" (Suffix may be empty)
            // This keeps things short and varied.
            return `${core}${adjective}${suffix}${maybeRoman}`;
        }

        case BodyTypeEnum.Planet: {
            const subtype = options.planetSubtype ?? PlanetTypeEnum.Terrestrial;

            const core = makeWordFromSyllables(rng, { minSyllables: 2, maxSyllables: 3 });

            // Short suffixes so we don't get huge names.
            const suffixBank: Record<PlanetTypeEnum, string[]> = {
                [PlanetTypeEnum.Terrestrial]: ['ara', 'elin', 'oria', 'neth', 'siv'],
                [PlanetTypeEnum.Ocean]: ['mar', 'lenth', 'selia', 'thoa', 'vori'],
                [PlanetTypeEnum.IceGiant]: ['krion', 'niva', 'lune', 'arctic', 'frost'],
                [PlanetTypeEnum.GasGiant]: ['viora', 'zun', 'tor', 'brontia', 'gass'],
                [PlanetTypeEnum.Volcanic]: ['pyra', 'magma', 'ember', 'scoria', 'cald'],
                [PlanetTypeEnum.Frozen]: ['frig', 'helia', 'sora', 'glac', 'albed'],
                [PlanetTypeEnum.Desert]: ['sahara', 'arid', 'solia', 'siro', 'dun'],
            };

            const suffix = pickFrom(rng, suffixBank[subtype] ?? suffixBank[PlanetTypeEnum.Terrestrial]);
            const roman = romanFromSequence(rng, sequence);

            // Requested vibe example: "Gisi III" (core+suffix is one token, roman is separate)
            return `${core}${suffix} ${roman}`;
        }

        case BodyTypeEnum.Moon:
        case BodyTypeEnum.Satellite: {
            const parentName = (options.parentName ?? '').trim();
            const roman = romanFromSequence(rng, sequence);
            // Requested vibe: "<Parent> III"
            return parentName.length > 0 ? `${parentName} ${roman}` : makeWordFromSyllables(rng, { minSyllables: 2, maxSyllables: 3 });
        }

        case BodyTypeEnum.Asteroid: {
            const core = makeWordFromSyllables(rng, { minSyllables: 2, maxSyllables: 3 });
            return `${core} ${markerLetter(rng)}`;
        }

        case BodyTypeEnum.Comet: {
            const core = makeWordFromSyllables(rng, { minSyllables: 2, maxSyllables: 3 });
            return `Comet ${core}${markerLetter(rng)}`;
        }

        case BodyTypeEnum.BlackHole: {
            const core = makeWordFromSyllables(rng, { minSyllables: 2, maxSyllables: 3 });
            return `${core} Singularity ${markerLetter(rng)}`;
        }

        default: {
            const core = makeWordFromSyllables(rng, { minSyllables: 2, maxSyllables: 3 });
            return `${core}${markerLetter(rng)}`;
        }
    }
}
