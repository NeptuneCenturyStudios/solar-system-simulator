import { SeededRandom } from '../utilities/prng';
import { SolarSystemGenerator } from './solar-system-generator';
import { generateSystemBodyInventory } from './system-body-inventory-generator';

export class ProceduralGenerator extends SolarSystemGenerator {
    prng: SeededRandom;

    constructor(seed?: string) {
        super();

        let masterSeed: string;
        const inputSeed = (seed ?? '').trim();
        if (inputSeed.length > 0) {
            masterSeed = inputSeed;
        } else {
            // Generate a "master seed" (string) in spawn when the textbox is blank.
            // Use crypto when available, fall back to Math.random for older environments.
            const randPart =
                typeof crypto !== 'undefined' && crypto.getRandomValues
                    ? (() => {
                          const bytes = new Uint32Array(2);
                          crypto.getRandomValues(bytes);
                          return `${bytes[0].toString(16)}${bytes[1].toString(16)}`;
                      })()
                    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
            masterSeed = `${randPart}`;
        }

        console.log('[procedural] masterSeed:', masterSeed);

        // Create a numeric seed for the PRNG from the master seed string.
        this.prng = new SeededRandom(masterSeed);
    }

    generateSolarSystem() {
        // For this pass we only determine what bodies will exist in the system.
        const inventory = generateSystemBodyInventory(this.prng);

        console.log('[procedural] system inventory (counts only):', inventory);

        // Future work:
        // - Use the inventory to spawn actual bodies
        // - Derive per-body properties from sub-seeds derived from master seed
    }
}
