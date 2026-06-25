import { BodyTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';
import { SeededRandom } from '../utilities/prng';

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

    /**
     * When provided for stars, enables "shared base + per-member suffix" naming
     * for multi-star systems (2–3 stars):
     *   <base name> A / B / C  OR  <base name> I / II / III
     *
     * Note: `seed` should be the shared base seed (stable across all stars in the system).
     */
    starSystemMemberIndex?: number; // 0-based
    starSystemMemberCount?: number;
    starSystemSuffixStyle?: 'letters' | 'romans' | 'auto';
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
    if (
        typeof sequenceNumber === 'number' &&
        Number.isFinite(sequenceNumber) &&
        sequenceNumber > 0
    ) {
        return toRoman(sequenceNumber);
    }
    // Small deterministic fallback
    return toRoman(rng.rangeInt(1, 24));
}

function maybeSecondToken(rng: SeededRandom, chance: number): string {
    if (!rng.chance(chance)) return '';
    return makeWordFromSyllables(rng, { minSyllables: 2, maxSyllables: 3 });
}

export function generateProceduralBodyName(
    bodyType: BodyTypeEnum,
    options: ProceduralBodyNameOptions
): string {
    // Primary name token(s) + suffix/roman are generated from rngPrimary.
    // Secondary-name presence/token is generated from rngSecond so we don't
    // disturb existing suffix/roman choices for the same seed.
    const rngPrimary = new SeededRandom(options.seed);
    const rngSecond = new SeededRandom(`${options.seed}|second-name`);

    const sequence = options.sequenceNumber;

    switch (bodyType) {
        case BodyTypeEnum.Star: {
            const starMemberCount =
                typeof options.starSystemMemberCount === 'number' &&
                Number.isFinite(options.starSystemMemberCount)
                    ? options.starSystemMemberCount
                    : undefined;

            const starMemberIndex =
                typeof options.starSystemMemberIndex === 'number' &&
                Number.isFinite(options.starSystemMemberIndex)
                    ? options.starSystemMemberIndex
                    : undefined;

            const isMultiStarSystemNamed =
                typeof starMemberCount === 'number' &&
                starMemberCount > 1 &&
                typeof starMemberIndex === 'number' &&
                starMemberIndex >= 0;

            // In multi-star-system mode we must ensure the whole base name is shared.
            // Therefore we should NOT let per-star inputs (like temperature) affect the base.
            const cls = (() => {
                if (isMultiStarSystemNamed) {
                    // Derive spectral class purely from RNG for shared base determinism.
                    const roll = rngPrimary.next();
                    if (roll < 0.03) return 'O';
                    if (roll < 0.08) return 'B';
                    if (roll < 0.18) return 'A';
                    if (roll < 0.35) return 'F';
                    if (roll < 0.58) return 'G';
                    if (roll < 0.78) return 'K';
                    return 'M';
                }

                return typeof options.starTemperatureK === 'number' &&
                    Number.isFinite(options.starTemperatureK)
                    ? spectralClassFromTemperature(options.starTemperatureK)
                    : (() => {
                          // Deterministically derive spectral class from RNG outputs.
                          const roll = rngPrimary.next();
                          if (roll < 0.03) return 'O';
                          if (roll < 0.08) return 'B';
                          if (roll < 0.18) return 'A';
                          if (roll < 0.35) return 'F';
                          if (roll < 0.58) return 'G';
                          if (roll < 0.78) return 'K';
                          return 'M';
                      })();
            })();

            const core = makeWordFromSyllables(rngPrimary, { minSyllables: 2, maxSyllables: 2 });

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
            const adjective = rngPrimary.chance(0.45)
                ? pickFrom(rngPrimary, suffixByClass[cls])
                : '';

            const firstToken = `${core}${adjective}`;
            const secondToken = maybeSecondToken(rngSecond, 0.55);

            // Multi-star-system mode: base name is shared; only append A/B/C or I/II/III.
            if (isMultiStarSystemNamed) {
                const style =
                    options.starSystemSuffixStyle === 'letters' ||
                    options.starSystemSuffixStyle === 'romans'
                        ? options.starSystemSuffixStyle
                        : (() => {
                              const styleRng = new SeededRandom(
                                  `${options.seed}|star-system-suffix-style`
                              );
                              return styleRng.chance(0.5) ? 'letters' : 'romans';
                          })();

                const idx = clampInt(starMemberIndex!, 0, Math.max(0, starMemberCount! - 1));

                const memberSuffix =
                    style === 'romans'
                        ? toRoman(idx + 1)
                        : LETTERS_NO_I.charAt(clampInt(idx, 0, LETTERS_NO_I.length - 1));

                return `${firstToken}${secondToken ? ` ${secondToken}` : ''} ${memberSuffix}`;
            }

            // Single-star mode: keep existing behavior (varied + sometimes roman/suffix endings).
            const nameEndingBank = [
                '',
                '',
                '',
                '',
                '',
                '',
                ' A',
                ' B',
                ' C',
                ' Alpha',
                ' Beta',
                ' Gamma',
                ' Prime',
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

            const suffix = pickFrom(rngPrimary, nameEndingBank);
            const maybeRoman = rngPrimary.chance(0.25)
                ? ` ${romanFromSequence(rngPrimary, sequence)}`
                : '';

            return `${firstToken}${secondToken ? ` ${secondToken}` : ''}${suffix}${maybeRoman}`;
        }

        case BodyTypeEnum.Planet:
        case BodyTypeEnum.DwarfPlanet: {
            const core = makeWordFromSyllables(rngPrimary, { minSyllables: 2, maxSyllables: 4 });
            const secondToken = maybeSecondToken(rngSecond, 0.5);

            // Optional weighted planet-like suffix (e.g. 'Prime', 'Major', 'Minor', etc.). This can be extended to include other common planetary suffixes as needed.
            function getSuffix() {
                const roll = rngPrimary.next();
                if (roll < 0.01) return 'Prime';
                if (roll < 0.02) return 'Alpha';
                if (roll < 0.03) return 'Beta';
                if (roll < 0.04) return 'Minor';
                if (roll < 0.05) return 'Major';
                if (roll < 0.06) return 'Majoris';
                if (roll < 0.07) return 'Minoris';

                return null;
            }

            const suffix = getSuffix();

            return `${core}${secondToken ? ` ${secondToken}` : ''}${suffix ? ` ${suffix}` : ''}`;
        }

        case BodyTypeEnum.Moon:
        case BodyTypeEnum.Satellite: {
            const parentName = (options.parentName ?? '').trim();
            const roman = romanFromSequence(rngPrimary, sequence);

            const secondToken = maybeSecondToken(rngSecond, 0.6);

            if (parentName.length > 0) {
                return `${parentName}${secondToken ? ` ${secondToken}` : ''} ${roman}`;
            }

            // Fallback when we don't have a parent.
            const fallback = makeWordFromSyllables(rngPrimary, {
                minSyllables: 2,
                maxSyllables: 3,
            });
            return `${fallback}${secondToken ? ` ${secondToken}` : ''}`;
        }

        case BodyTypeEnum.Asteroid: {
            const core = makeWordFromSyllables(rngPrimary, { minSyllables: 2, maxSyllables: 3 });
            const letter = markerLetter(rngPrimary);

            const secondToken = maybeSecondToken(rngSecond, 0.5);

            return `${core}${secondToken ? ` ${secondToken}` : ''} ${letter}`;
        }

        case BodyTypeEnum.Comet: {
            const core = makeWordFromSyllables(rngPrimary, { minSyllables: 2, maxSyllables: 3 });
            const letter = markerLetter(rngPrimary);

            const secondToken = maybeSecondToken(rngSecond, 0.5);

            // Keep primary formatting exactly when secondToken is absent.
            if (!secondToken) {
                return `Comet ${core}${letter}`;
            }

            // When second token exists, we prefer to separate the marker into its own token.
            return `Comet ${core} ${secondToken} ${letter}`;
        }

        case BodyTypeEnum.BlackHole: {
            const core = makeWordFromSyllables(rngPrimary, { minSyllables: 2, maxSyllables: 3 });
            const letter = markerLetter(rngPrimary);

            const secondToken = maybeSecondToken(rngSecond, 0.55);

            // Primary: "<Core> <Letter>"
            // With second: "<Core> Opus <Letter>"
            return `${core}${secondToken ? ` ${secondToken}` : ''} ${letter}`;
        }

        default: {
            const core = makeWordFromSyllables(rngPrimary, { minSyllables: 2, maxSyllables: 3 });
            const letter = markerLetter(rngPrimary);

            const secondToken = maybeSecondToken(rngSecond, 0.5);

            // Keep primary formatting exactly when secondToken is absent.
            if (!secondToken) {
                return `${core}${letter}`;
            }

            return `${core} ${secondToken} ${letter}`;
        }
    }
}
