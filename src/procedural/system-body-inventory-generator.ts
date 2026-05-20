import { BodyTypeEnum } from '../utilities/utilities';
import { SeededRandom } from '../utilities/prng';

export type SystemBodyInventoryEntry = {
    bodyType: BodyTypeEnum;
    count: number;
};

type WeightedChoice<T> = {
    value: T;
    weight: number;
};

function pickWeighted<T>(prng: SeededRandom, choices: Array<WeightedChoice<T>>): T {
    const totalWeight = choices.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
    if (totalWeight <= 0) {
        // Defensive fallback: choose first choice deterministically (weights were bad)
        return choices[0]?.value;
    }

    const roll = prng.next() * totalWeight;
    let acc = 0;
    for (const c of choices) {
        acc += Math.max(0, c.weight);
        if (roll < acc) return c.value;
    }
    // Floating point fallback
    return choices[choices.length - 1]!.value;
}

function pickCountStars(prng: SeededRandom): number {
    // 1–3 with very high chance of 1, low chance of 2, very low chance of 3
    return pickWeighted(prng, [
        { value: 1, weight: 0.8 },
        { value: 2, weight: 0.18 },
        { value: 3, weight: 0.02 },
    ]);
}

function pickCountBlackHoles(prng: SeededRandom): number {
    // 0–1 with very high chance of 0
    return pickWeighted(prng, [
        { value: 0, weight: 0.95 },
        { value: 1, weight: 0.05 },
    ]);
}

function pickCountComets(prng: SeededRandom): number {
    // 0–2 equal chances
    return prng.rangeInt(0, 2);
}

function pickCountAsteroids(prng: SeededRandom): number {
    // 0–4 equal chances
    return prng.rangeInt(0, 4);
}

function pickCountPlanets(prng: SeededRandom): number {
    // 0–12 low chance of 0, high chance of 1, then decaying likelihood for higher N.
    // We implement this as an explicit weight distribution:
    //   w(0) = 0.1
    //   w(n>=1) = decay^(n-1) where decay in (0,1)
    const maxPlanets = 12;
    const w0 = 0.1;
    const decay = 0.45;

    const choices: Array<WeightedChoice<number>> = [];
    choices.push({ value: 0, weight: w0 });
    for (let n = 1; n <= maxPlanets; n++) {
        choices.push({ value: n, weight: Math.pow(decay, n - 1) });
    }

    return pickWeighted(prng, choices);
}

/**
 * Deterministically generates “what bodies exist in the system” given a master-seeded PRNG.
 * For this pass we only compute counts; individual per-body properties come later.
 */
export function generateSystemBodyInventory(prng: SeededRandom): SystemBodyInventoryEntry[] {
    const stars = pickCountStars(prng);
    const blackHoles = pickCountBlackHoles(prng);
    const comets = pickCountComets(prng);
    const planets = pickCountPlanets(prng);
    const asteroids = pickCountAsteroids(prng);

    return [
        { bodyType: BodyTypeEnum.Star, count: stars },
        { bodyType: BodyTypeEnum.BlackHole, count: blackHoles },
        { bodyType: BodyTypeEnum.Comet, count: comets },
        { bodyType: BodyTypeEnum.Planet, count: planets },
        { bodyType: BodyTypeEnum.Asteroid, count: asteroids },
        // Moons are not generated yet (will be derived from per-planet generation later).
    ];
}
