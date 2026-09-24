import * as THREE from 'three';
import type { CelestialBody } from '../bodies/celestial-body';
import { MoonTypeEnum, PlanetTypeEnum } from '../bodies/body-enums';
import { cloudTextures } from '../drawing/textures';
import { SeededRandom } from '../utilities/prng';
import { buildBodySphereGeometry } from '../utilities/utilities';
import type { IAtmosphereProfile } from './atmosphere-profile';

type AtmosphereSubtype = PlanetTypeEnum | MoonTypeEnum;

/** Probability (0–1) that a body of each subtype has a cloud layer, *given* it has an atmosphere. */
const CLOUD_CHANCE: Record<string, number> = {
    [PlanetTypeEnum.Temperate]: 1.0,
    [PlanetTypeEnum.Ocean]: 0.85,
    [PlanetTypeEnum.Terrestrial]: 0.6,
    [PlanetTypeEnum.Frozen]: 0.5,
    [PlanetTypeEnum.Desert]: 0.4,
    [PlanetTypeEnum.Volcanic]: 0.35,
};

/** Below this surface pressure the air is too thin to hold visible clouds. */
const MIN_CLOUD_PRESSURE_BAR = 0.05;

/** Base haze tint per subtype. */
const ATMOSPHERE_TINT: Record<string, number> = {
    [PlanetTypeEnum.GasGiant]: 0xffcc88, // warm amber
    [PlanetTypeEnum.IceGiant]: 0x5599ff, // ice blue
    [PlanetTypeEnum.Temperate]: 0x77aaff, // soft blue
    [PlanetTypeEnum.Ocean]: 0x4477cc, // deep blue
    [PlanetTypeEnum.Desert]: 0xffbb66, // warm tan
    [PlanetTypeEnum.Frozen]: 0xaaccee, // pale ice blue
    [PlanetTypeEnum.Volcanic]: 0xff8844, // orange haze
};
const DEFAULT_ATMOSPHERE_TINT = 0x88aaff; // generic blue (Terrestrial or fallback)

/** Subtype tint with a slight seeded hue shift so same-subtype bodies don't look identical. */
function pickAtmosphereTint(subtype: AtmosphereSubtype, seed: string): THREE.Color {
    const tintRng = new SeededRandom(`${seed}|atmosphere-tint`);
    const tintColor = new THREE.Color(ATMOSPHERE_TINT[subtype] ?? DEFAULT_ATMOSPHERE_TINT);
    const shift = (tintRng.next() - 0.5) * 0.08;
    tintColor.offsetHSL(shift, 0, 0);
    return tintColor;
}

/**
 * Attaches a procedural cloud layer if the subtype and seeded roll call for one. Gas/ice giants
 * never get a separate cloud mesh — their texture already is the cloud deck.
 */
function addCloudLayer(
    body: CelestialBody,
    subtype: AtmosphereSubtype,
    seed: string,
    rotationSpeed: number
): void {
    const chance = CLOUD_CHANCE[subtype] ?? 0;
    if (chance <= 0) return;

    const enableRng = new SeededRandom(`${seed}|clouds-enabled`);
    if (chance < 1.0 && !enableRng.chance(chance)) return;

    if (cloudTextures.length === 0) return;

    const textureRng = new SeededRandom(`${seed}|clouds-texture`);
    const cloudTexture = textureRng.pick(cloudTextures);
    if (!cloudTexture) return;

    const cloudsMat = new THREE.MeshStandardMaterial({
        map: cloudTexture,
        alphaMap: cloudTexture,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        depthTest: true,
        color: 0xffffff,
        roughness: 1.0,
        metalness: 0.0,
    });

    const cloudsGeo = buildBodySphereGeometry(body.radius * 1.03);
    body.clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
    body.clouds.renderOrder = 2;
    body.clouds.receiveShadow = true;
    body.clouds.userData = { parentBody: body };
    body.mesh.add(body.clouds);

    body.cloudRotationSpeed = rotationSpeed * 1.3;
}

/**
 * Applies a resolved atmosphere profile to a freshly created procedural or custom body: the
 * physics/visual shell, then (only when there is an atmosphere dense enough to hold them) a
 * cloud layer. A null profile leaves the body airless and cloudless. Shared by every creation
 * path so they can't drift apart.
 */
export function applyAtmosphereToBody(
    body: CelestialBody,
    profile: IAtmosphereProfile | null,
    subtype: AtmosphereSubtype,
    seed: string,
    rotationSpeed: number
): void {
    if (!profile) return;

    body.setAtmosphere({
        radius: body.radius * profile.radiusFactor,
        density: profile.surfacePressureBar,
        tint: pickAtmosphereTint(subtype, seed),
    });

    if (profile.surfacePressureBar >= MIN_CLOUD_PRESSURE_BAR) {
        addCloudLayer(body, subtype, seed, rotationSpeed);
    }
}
