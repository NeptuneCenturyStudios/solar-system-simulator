import * as THREE from 'three';
import { Body } from '../bodies/body';
import { calculateTrajectory } from '../physics/physics';
import { CelestialBody } from '../bodies/celestial-body';
import { ISS } from '../bodies/iss';
import { BodyTypeEnum } from '../bodies/body-enums';
import { ISatelliteBasicCreationOptions } from '../interfaces';



// Shared body-type helper. Checks bodyType flags only.
export function isBodyType(body: Body, type: BodyTypeEnum) {
    return !!(body && body.bodyType && body.bodyType & type);
}

// Utility to pick a random element from an array
export function pickRandom<T>(arr: Array<T>): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

export function createUniqueId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

export function createSatellite(scene: THREE.Scene, parent: CelestialBody, config: ISatelliteBasicCreationOptions) {
        // Calculate orbital trajectory based on parent's mass
        const trajectory = calculateTrajectory(
            parent.dependencies.getG(),
            config.distance,
            parent.mass
        );

        // Default angle is 0, but can be specified for multiple moons
        const angle = config.angle !== undefined ? config.angle : 0;

        // Calculate position and velocity in orbital plane
        const localPos = new THREE.Vector3(
            Math.cos(angle) * config.distance,
            0,
            Math.sin(angle) * config.distance
        );
        const localVel = new THREE.Vector3(
            -Math.sin(angle) * trajectory.vel.z,
            0,
            Math.cos(angle) * trajectory.vel.z
        );

        // Apply inclination rotation if specified
        if (config.inclinationDeg !== undefined) {
            const inclinationRad = THREE.MathUtils.degToRad(config.inclinationDeg);
            localPos.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);
            localVel.applyAxisAngle(new THREE.Vector3(1, 0, 0), inclinationRad);
        }
        // Optionally add random yVariation
        if (config.yVariation !== undefined) {
            localPos.y += (Math.random() - 0.5) * config.yVariation;
        }

        // Translate to parent position and velocity
        const posX = parent.mesh.position.x + localPos.x;
        const posY = parent.mesh.position.y + localPos.y;
        const posZ = parent.mesh.position.z + localPos.z;
        const velX = parent.velocity.x + localVel.x;
        const velY = parent.velocity.y + localVel.y;
        const velZ = parent.velocity.z + localVel.z;

        // Compute initial orbital angular speed about parent (instantaneous, based on spawn r and vrel).
        // ω = |r × v| / |r|²
        const r0 = new THREE.Vector3(posX, posY, posZ).sub(parent.mesh.position);
        const vrel0 = new THREE.Vector3(velX, velY, velZ).sub(parent.velocity);
        const rLenSq = Math.max(1e-12, r0.lengthSq());
        // For perfect-looking locking, we will correct orientation each frame (see update()).
        // Still store ω at spawn so if tidalLock is disabled later, it continues spinning at its spawn rate.
        const omega = r0.clone().cross(vrel0).length() / rLenSq;

        const satellite = new ISS(parent.dependencies, scene, {
            id: config.id,
            name: config.name,
            mass: config.mass,
            radius: config.radius,
            pos: new THREE.Vector3(posX, posY, posZ),
            vel: new THREE.Vector3(velX, velY, velZ),
            angle: angle,
            yVariation: posY,
            distance: config.distance,
            trailColor: config.trailColor || 0xffffff,
            maxTrail: config.maxTrail || 1500,
            rotation: { tilt: 0, speed: 0 },
            tidalLock: {
                target: parent,
                spinAxisWorld: new THREE.Vector3(0, 1, 0),
                faceAxisLocal: new THREE.Vector3(0, 0, 1),
                angularSpeed: omega,
            },
        });

        return satellite;
    }

    /**
     * Generates a name for a celestial body based on IAU-style conventions.
     * @param type The type of the celestial body.
     * @param parentBody The parent body, if applicable (e.g., for moons).
     * @param bodies The array of existing bodies to ensure unique naming.
     * @returns A string representing the generated name.
     */
    export function generateIAUName(type: BodyTypeEnum, parentBody: Body | null = null, bodies: Body[]) {
        const year = new Date().getFullYear();
    
        // Letter set excluding 'I' to mimic IAU conventions
        const letters = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';
        function randLetter() {
            return letters.charAt(Math.floor(Math.random() * letters.length));
        }
    
        function randNumber(max = 99) {
            return Math.floor(1 + Math.random() * max);
        }
    
        function provisional() {
            // Year + two-letter code + optional sequence number
            const a = randLetter();
            const b = randLetter();
            const seq = Math.random() < 0.25 ? randNumber(9) : ''; // occasional sub-number
            return `${year} ${a}${b}${seq}`;
        }
    
        function cometDesignation() {
            // Simple comet-like designation: C/YYYY Xn
            const a = randLetter();
            const n = randNumber(9);
            return `C/${year} ${a}${n}`;
        }
    
        function hdCatalog() {
            // Henry Draper-like catalog number
            const num = Math.floor(100000 + Math.random() * 900000);
            return `HD ${num}`;
        }
    
        function asteroidDesignation() {
            return provisional();
        }
    
        function planetDesignation() {
            return provisional();
        }
    
        function moonName(parent: Body | null) {
            if (!parent) return `Moon ${provisional()}`;
            // Count existing moons that start with parent name (simple heuristic)
            const existing = bodies.filter(
                (b) => b.name && b.name.startsWith(parent.name + ' ')
            ).length;
            const roman = toRoman(existing + 1);
            return `${parent.name} ${roman}`;
        }
    
        // Convert integer to Roman numerals (1..3999)
        function toRoman(num: number): string {
            if (!num || num <= 0) return 'I';
            const romans = [
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
            let n = num;
            let result = '';
            for (const [val, sym] of romans) {
                while (n >= (val as number)) {
                    result += sym;
                    n -= val as number;
                }
            }
            return result;
        }
    
        switch (type) {
            case BodyTypeEnum.Star:
                return hdCatalog();
            case BodyTypeEnum.Planet:
                return planetDesignation();
            case BodyTypeEnum.Asteroid:
                return asteroidDesignation();
            case BodyTypeEnum.Comet:
                return cometDesignation();
            case BodyTypeEnum.Moon:
                return moonName(parentBody);
            default:
                return provisional();
        }
    }

    /**
     * Gets a human-readable label for a body's type based on its bodyType flags.
     * @param b The body to get the type label for.
     * @returns A string representing the body's type.
     */
    export function getBodyTypeLabel(b: Body) {
        if (!b) return 'Unknown';
        if (b.bodyType & BodyTypeEnum.BlackHole) return 'Black Hole';
        if (isBodyType(b, BodyTypeEnum.Star)) return 'Star';
        if (b.bodyType && b.bodyType & BodyTypeEnum.GasGiant) return 'Gas Giant';
        if (b.bodyType && b.bodyType & BodyTypeEnum.IceGiant) return 'Ice Giant';
        if (b.bodyType && b.bodyType & BodyTypeEnum.DwarfPlanet) return 'Dwarf Planet';
        if (b.bodyType && b.bodyType & BodyTypeEnum.Planet) return 'Planet';
        if (b.bodyType && b.bodyType & BodyTypeEnum.Moon) return 'Moon';
        if (b.bodyType && b.bodyType & BodyTypeEnum.Asteroid) return 'Asteroid';
        if (b.bodyType && b.bodyType & BodyTypeEnum.Comet) return 'Comet';
        if (b.bodyType && b.bodyType & BodyTypeEnum.SpaceShip) return 'Spaceship';
        if (b.bodyType && b.bodyType & BodyTypeEnum.Satellite) return 'Satellite';
    
        return 'Unknown';
    }