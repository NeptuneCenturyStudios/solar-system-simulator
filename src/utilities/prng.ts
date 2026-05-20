// --- PRNG Implementation ---

/**
 * Mulberry32 is a fast, 32-bit PRNG.
 * It takes an initial 32-bit state (seed).
 * Returns a function that, when called, produces a float between 0 (inclusive) and 1 (exclusive).
 */
function mulberry32(a: number) {
    return function () {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * xmur3 - a simple string hashing function to convert a string seed into a 32-bit integer
 * suitable for seeding mulberry32.
 */
function xmur3(str: string) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return function () {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}

// --- Core Random Utility Class ---

/**
 * A utility class to wrap the PRNG and provide helpful methods for generating
 * different types of random values based on a single seed instance.
 */
export class SeededRandom {
    rng: () => number;

    constructor(seedString: string) {
        // Generate a 32-bit integer from the string
        const seedGen = xmur3(seedString.toString());
        const numSeed = seedGen();
        // Initialize the PRNG
        this.rng = mulberry32(numSeed);
    }

    // Returns float between 0 and 1
    next() {
        return this.rng();
    }

    // Returns float between min and max
    range(min: number, max: number) {
        return min + this.next() * (max - min);
    }

    // Returns integer between min and max (inclusive)
    rangeInt(min: number, max: number) {
        return Math.floor(this.range(min, max + 1));
    }

    // Picks a random element from an array
    pick<T>(array: T[]): T | null {
        if (!array || array.length === 0) return null;
        const index = Math.floor(this.next() * array.length);
        return array[index];
    }

    // Returns a boolean based on a probability (0.0 to 1.0)
    chance(probability: number) {
        return this.next() < probability;
    }
}
