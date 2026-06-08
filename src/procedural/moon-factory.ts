import * as THREE from 'three';
import type { IStateDependencies } from '../interfaces';
import { CelestialBody, type ITidalLockOptions } from '../bodies/celestial-body';
import { Moon } from '../bodies/moon';
import {
    fictionalTextures,
    fictionalVolcanicTexture,
    fictionalFrozenTexture,
    fictionalOceanTexture,
    fictionalDesertTexture,
} from '../drawing/textures';
import type { ProceduralMoonCreation } from './moon-generator';
import { MoonTypeEnum } from '../bodies/body-enums';

// New deterministic, seam-free procedural ocean generator for ocean moons.
import {
    getOceanTexture,
    getOceanNormalTexture,
    getOceanNormalTextureAsync,
    getOceanTextureAsync,
    type OceanGenerationProgress,
} from './ocean/ocean-texture-generator';

// New deterministic, seam-free procedural desert generator for desert moons.
import {
    getDesertTexture,
    getDesertNormalTexture,
    getDesertTextureAsync,
    getDesertNormalTextureAsync,
    type DesertGenerationProgress,
} from './desert/desert-texture-generator';

// New deterministic, seam-free procedural frozen generator for frozen moons.
import {
    getFrozenTexture,
    getFrozenNormalTexture,
    getFrozenTextureAsync,
    getFrozenNormalTextureAsync,
    type FrozenGenerationProgress,
} from './frozen/frozen-texture-generator';

function pickMoonTextureForMoonType(
    moonType: MoonTypeEnum,
    moonTextureIndex: number | undefined,
    textureSeed?: string
): THREE.Texture {
    if (moonType === MoonTypeEnum.Volcanic) return fictionalVolcanicTexture;
    if (moonType === MoonTypeEnum.Ocean) {
        if (textureSeed) return getOceanTexture(textureSeed);
        return fictionalOceanTexture;
    }
    if (moonType === MoonTypeEnum.Frozen) {
        if (textureSeed) return getFrozenTexture(textureSeed);
        return fictionalFrozenTexture;
    }
    if (moonType === MoonTypeEnum.Desert) {
        if (textureSeed) return getDesertTexture(textureSeed);
        return fictionalDesertTexture;
    }

    // Terrestrial uses pooled random textures deterministically.
    const idx = Math.max(0, moonTextureIndex ?? 0);
    return fictionalTextures[idx % fictionalTextures.length]!;
}

function createMoonMesh(radius: number, texture: THREE.Texture, isOcean?: boolean): THREE.Mesh {
    const geometry = new THREE.SphereGeometry(radius, 32, 32);

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        normalMap: null,
        normalScale: undefined,
        color: 0xffffff,
        emissive: 0x000000,
        emissiveIntensity: 0,
        roughness: isOcean ? 0.8 : 0.7,
        metalness: isOcean ? 0.02 : 0.7,
        transparent: false,
        depthTest: true,
        depthWrite: true,
    });

    return new THREE.Mesh(geometry, material);
}

function createMoonTidalLock(parent: CelestialBody, safeRotationSpeed: number): ITidalLockOptions {
    void safeRotationSpeed;
    return {
        target: parent,
        spinAxisWorld: new THREE.Vector3(0, 1, 0),
        faceAxisLocal: new THREE.Vector3(0, 0, 1),
        angularSpeed: 0,
    };
}

async function createOceanMoonMeshAsync(params: {
    radius: number;
    textureSeed: string;
    onOceanProgress?: (progress: OceanGenerationProgress) => void;
    signal?: AbortSignal;
}): Promise<THREE.Mesh> {
    const { radius, textureSeed, onOceanProgress, signal } = params;

    const [color, normal] = await Promise.all([
        getOceanTextureAsync(textureSeed, onOceanProgress, { signal }),
        getOceanNormalTextureAsync(textureSeed, onOceanProgress, { signal }),
    ]);

    const geometry = new THREE.SphereGeometry(radius, 32, 32);

    return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
            map: color,
            normalMap: normal,
            normalScale: new THREE.Vector2(0.5, 0.5),
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.8,
            metalness: 0.02,
            transparent: false,
            depthTest: true,
            depthWrite: true,
        })
    );
}

async function createDesertMoonMeshAsync(params: {
    radius: number;
    textureSeed: string;
    onDesertProgress?: (progress: DesertGenerationProgress) => void;
    signal?: AbortSignal;
}): Promise<THREE.Mesh> {
    const { radius, textureSeed, onDesertProgress, signal } = params;

    const [color, normal] = await Promise.all([
        getDesertTextureAsync(textureSeed, onDesertProgress, { signal }),
        getDesertNormalTextureAsync(textureSeed, onDesertProgress, { signal }),
    ]);

    const geometry = new THREE.SphereGeometry(radius, 32, 32);

    return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
            map: color,
            normalMap: normal,
            normalScale: new THREE.Vector2(0.7, 0.7),
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.95,
            metalness: 0.02,
            transparent: false,
            depthTest: true,
            depthWrite: true,
        })
    );
}

async function createFrozenMoonMeshAsync(params: {
    radius: number;
    textureSeed: string;
    onFrozenProgress?: (progress: FrozenGenerationProgress) => void;
    signal?: AbortSignal;
}): Promise<THREE.Mesh> {
    const { radius, textureSeed, onFrozenProgress, signal } = params;

    const [color, normal] = await Promise.all([
        getFrozenTextureAsync(textureSeed, onFrozenProgress, { signal }),
        getFrozenNormalTextureAsync(textureSeed, onFrozenProgress, { signal }),
    ]);

    const geometry = new THREE.SphereGeometry(radius, 32, 32);

    return new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({
            map: color,
            normalMap: normal,
            normalScale: new THREE.Vector2(0.5, 0.5),
            color: 0xffffff,
            emissive: 0x000000,
            emissiveIntensity: 0,
            roughness: 0.7,
            metalness: 0.05,
            transparent: false,
            depthTest: true,
            depthWrite: true,
        })
    );
}

function buildMoon(
    params: {
        dependencies: IStateDependencies;
        scene: THREE.Scene;
        creation: ProceduralMoonCreation;
        parent: CelestialBody;
        mesh: THREE.Mesh;
    }
): CelestialBody {
    const { dependencies, scene, creation, parent, mesh } = params;

    const {
        id,
        name,
        pos,
        vel,
        radius,
        mass,
        rotationSpeed,
        distance,
        angle,
        yVariation,
        moonType,
    } = creation;

    const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
    const safeMass = Number.isFinite(mass) && mass > 0 ? mass : 0.5;
    const safeRotationSpeed = Number.isFinite(rotationSpeed) && rotationSpeed > 0 ? rotationSpeed : 0.1;

    const safeDistance = Number.isFinite(distance) && distance > 0 ? distance : 1;
    const safeAngle = Number.isFinite(angle) ? angle : 0;
    const safeYVariation = Number.isFinite(yVariation) ? yVariation : 0;

    const safePos = pos.clone();
    const safeVel = vel.clone();

    // Guard against NaNs creeping into THREE geometry / bounding spheres.
    const fixVector = (v: THREE.Vector3) => {
        if (!Number.isFinite(v.x)) v.x = 0;
        if (!Number.isFinite(v.y)) v.y = 0;
        if (!Number.isFinite(v.z)) v.z = 0;
    };

    fixVector(safePos);
    fixVector(safeVel);

    const tidalLock: ITidalLockOptions = createMoonTidalLock(parent, safeRotationSpeed);

    return new Moon(dependencies, scene, {
        radius: safeRadius,
        mass: safeMass,
        id,
        name,

        pos: safePos,
        vel: safeVel,

        distance: safeDistance,
        angle: safeAngle,
        yVariation: safeYVariation,

        moonType,

        rotation: { tilt: 0, speed: safeRotationSpeed },

        trailColor: 0xffffff,
        maxTrail: 1500,

        mesh,
        tidalLock,
    });
}

export function createMoonBodyFromProceduralCreation(params: {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    creation: ProceduralMoonCreation;
    parent: CelestialBody;
}): CelestialBody {
    const { creation } = params;

    const {
        radius,
        moonType,
        moonTextureIndex,
        textureSeed,
    } = creation;

    const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;
    const isOcean = moonType === MoonTypeEnum.Ocean;
    const isDesert = moonType === MoonTypeEnum.Desert;
    const isFrozen = moonType === MoonTypeEnum.Frozen;

    const texture = pickMoonTextureForMoonType(moonType, moonTextureIndex, textureSeed);
    const mesh = createMoonMesh(safeRadius, texture, isOcean);

    // Attach normal map from the procedural generator if available.
    if (textureSeed) {
        if (isOcean) {
            const normalMap = getOceanNormalTexture(textureSeed);
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.normalMap = normalMap;
            mat.normalScale = new THREE.Vector2(0.5, 0.5);
            mat.needsUpdate = true;
        } else if (isDesert) {
            const normalMap = getDesertNormalTexture(textureSeed);
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.normalMap = normalMap;
            mat.normalScale = new THREE.Vector2(0.7, 0.7);
            mat.roughness = 0.95;
            mat.metalness = 0.02;
            mat.needsUpdate = true;
        } else if (isFrozen) {
            const normalMap = getFrozenNormalTexture(textureSeed);
            const mat = mesh.material as THREE.MeshStandardMaterial;
            mat.normalMap = normalMap;
            mat.normalScale = new THREE.Vector2(0.5, 0.5);
            mat.roughness = 0.7;
            mat.metalness = 0.05;
            mat.needsUpdate = true;
        }
    }

    return buildMoon({
        dependencies: params.dependencies,
        scene: params.scene,
        creation,
        parent: params.parent,
        mesh,
    });
}

export async function createMoonBodyFromProceduralCreationAsync(params: {
    dependencies: IStateDependencies;
    scene: THREE.Scene;
    creation: ProceduralMoonCreation;
    parent: CelestialBody;

    options?: {
        onOceanProgress?: (progress: OceanGenerationProgress) => void;
        onDesertProgress?: (progress: DesertGenerationProgress) => void;
        onFrozenProgress?: (progress: FrozenGenerationProgress) => void;
        signal?: AbortSignal;
    };
}): Promise<CelestialBody> {
    const { creation, options, parent, dependencies, scene } = params;

    const { radius, moonType, textureSeed, moonTextureIndex } = creation;

    const safeRadius = Number.isFinite(radius) && radius > 0 ? radius : 1;

    if (moonType === MoonTypeEnum.Ocean && textureSeed) {
        const mesh = await createOceanMoonMeshAsync({
            radius: safeRadius,
            textureSeed,
            onOceanProgress: options?.onOceanProgress,
            signal: options?.signal,
        });

        return buildMoon({
            dependencies,
            scene,
            creation,
            parent,
            mesh,
        });
    }

    if (moonType === MoonTypeEnum.Desert && textureSeed) {
        const mesh = await createDesertMoonMeshAsync({
            radius: safeRadius,
            textureSeed,
            onDesertProgress: options?.onDesertProgress,
            signal: options?.signal,
        });

        return buildMoon({
            dependencies,
            scene,
            creation,
            parent,
            mesh,
        });
    }

    if (moonType === MoonTypeEnum.Frozen && textureSeed) {
        const mesh = await createFrozenMoonMeshAsync({
            radius: safeRadius,
            textureSeed,
            onFrozenProgress: options?.onFrozenProgress,
            signal: options?.signal,
        });

        return buildMoon({
            dependencies,
            scene,
            creation,
            parent,
            mesh,
        });
    }

    // Fallback to sync pooled textures for non-desert/non-ocean/non-frozen or missing seed.
    const texture = pickMoonTextureForMoonType(moonType, moonTextureIndex);
    const mesh = createMoonMesh(safeRadius, texture);

    return buildMoon({
        dependencies,
        scene,
        creation,
        parent,
        mesh,
    });
}
