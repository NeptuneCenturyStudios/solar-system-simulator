import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { planetOrbitFromElements } from './planet-orbit.js';
import { orbitElementsFromApsides, type IBodyOrbitElements } from './orbital-elements.js';
import {
    SUN_MASS,
    EARTH_MASS,
    EARTH_DIST,
    EARTH_RADIUS,
    EARTH_AXIS,
    EARTH_AZIMUTH,
    EARTH_MAG_AZIMUTH,
    EARTH_MAG_OFFSET,
    EARTH_MAG_REVERSED,
    EARTH_MAG_STRENGTH,
    EARTH_MAG_TILT,
    EARTH_ORBITAL_PERIOD_REAL,
    EARTH_PERIHELION_DIST,
    EARTH_APHELION_DIST,
    EARTH_INCLINATION,
    EARTH_LONG_ASC_NODE,
    EARTH_ARG_PERIHELION,
    calcSimOrbitalPeriod,
    MAX_LIGHTING_STARS,
    EARTH_NIGHT_IRRADIANCE,
    EARTH_DAY_IRRADIANCE,
} from '../utilities/consts.js';
import { buildBodySphereGeometry, createUniqueId } from '../utilities/utilities.js';
import {
    createStarLightingSet,
    gatherStarLighting,
    type IStarLightingSet,
} from '../effects/star-illumination.js';
import { getBodyTexture } from '../drawing/texture-registry.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet.js';
import { PlanetTypeEnum } from './body-enums.js';
import { EARTH_CLOUD_PROFILE } from '../procedural/cloud-profile.js';
import {
    AtmosphericGasEnum,
    CoreTypeEnum,
    LifeformBaseEnum,
    LiquidCompositionEnum,
    SoilCompositionEnum,
    VegetationEnum,
} from './body-attributes.js';

// Maximum number of stars supported by the day/night shader (shared with every star effect).
const MAX_STARS = MAX_LIGHTING_STARS;

const earthDayTexture = getBodyTexture('earth_day.jpg');
const earthNightTexture = getBodyTexture('earth_night.jpg');
const earthNormalTexture = getBodyTexture('earth_normal_map.png', 'linear');
const earthSpecularTexture = getBodyTexture('earth_specular_map.png', 'linear');

// The specular map marks water (bright) vs land (dark). MeshStandardMaterial has no specular map,
// so it drives roughness instead: water is glossy, land is matte.
const LAND_ROUGHNESS = 0.9;
const OCEAN_ROUGHNESS = 0.25;

type EarthUniforms = {
    nightTexture: { value: THREE.Texture };
    specularTexture: { value: THREE.Texture };
    starPositions: { value: THREE.Vector3[] };
    /** Per-star illuminance scale: irradiance × luminance of the light's colour. */
    starLight: { value: number[] };
    numStars: { value: number };
    earthPosition: { value: THREE.Vector3 };
};

function buildEarthMaterial(customUniforms: EarthUniforms): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
        map: earthDayTexture,
        normalMap: earthNormalTexture,
        normalScale: new THREE.Vector2(1, 1),
        color: 0xffffff,
        roughness: 0.7,
        metalness: 0.7,
    });

    material.onBeforeCompile = (shader) => {
        // Merge our custom uniforms so Three.js uploads them each frame.
        Object.assign(shader.uniforms, customUniforms);

        // ── Vertex shader ──────────────────────────────────────────────────────
        // Declare the world-space normal varying alongside Three.js's UV varyings.
        shader.vertexShader = shader.vertexShader.replace(
            '#include <uv_pars_vertex>',
            `#include <uv_pars_vertex>
varying vec3 vEarthWorldNormal;`
        );
        // After defaultnormal_vertex, objectNormal holds the local-space normal.
        // Multiply by modelMatrix (upper-left 3×3) to get world-space normal.
        shader.vertexShader = shader.vertexShader.replace(
            '#include <defaultnormal_vertex>',
            `#include <defaultnormal_vertex>
vEarthWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`
        );

        // ── Fragment shader ────────────────────────────────────────────────────
        // Inject uniform declarations and the matching varying after <common>.
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <common>',
            `#include <common>
#define MAX_STARS ${MAX_STARS}
#define EARTH_NIGHT_IRRADIANCE ${EARTH_NIGHT_IRRADIANCE.toFixed(6)}
#define EARTH_DAY_IRRADIANCE ${EARTH_DAY_IRRADIANCE.toFixed(6)}
uniform sampler2D nightTexture;
uniform sampler2D specularTexture;
uniform vec3 starPositions[MAX_STARS];
uniform float starLight[MAX_STARS];
uniform int  numStars;
uniform vec3 earthPosition;
varying vec3 vEarthWorldNormal;`
        );

        // Day/night blend driven by the light actually reaching each spot: the sum over stars of
        // irradiance × luminance × N·L, i.e. the illuminance three.js lights this surface with.
        // A faint or distant star therefore leaves even the side facing it on the night texture.
        // earthDayFactor is declared at main() scope so the emissive pass below reuses it.
        // vMapUv is declared by Three.js under USE_MAP (guaranteed since map is set).
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `float earthDayFactor;
{
    float illuminance = 0.0;
    for (int i = 0; i < MAX_STARS; i++) {
        if (i >= numStars) break;
        vec3  lightDir = normalize(starPositions[i] - earthPosition);
        float ndotl    = max(dot(vEarthWorldNormal, lightDir), 0.0);
        illuminance += starLight[i] * ndotl;
    }
    earthDayFactor = smoothstep(EARTH_NIGHT_IRRADIANCE, EARTH_DAY_IRRADIANCE, illuminance);

    vec3 dayColor   = texture2D(map, vMapUv).rgb;
    vec3 nightColor = texture2D(nightTexture, vMapUv).rgb;
    diffuseColor.rgb *= mix(nightColor, dayColor, earthDayFactor);
}`
        );

        // Water (bright in the specular map) gets low roughness, land stays matte.
        // vMapUv is declared by Three.js under USE_MAP (guaranteed since map is set).
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <roughnessmap_fragment>',
            `#include <roughnessmap_fragment>
roughnessFactor = mix(${LAND_ROUGHNESS.toFixed(2)}, ${OCEAN_ROUGHNESS.toFixed(2)}, texture2D(specularTexture, vMapUv).r);`
        );

        // Add night-side city-light emission to totalEmissiveRadiance.
        // This runs just after emissivemap_fragment, before lighting, so it
        // integrates cleanly with Three.js's PBR pipeline (tone-mapping, fog, etc.).
        // vMapUv is declared by Three.js under USE_MAP (guaranteed since map is set).
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <emissivemap_fragment>',
            `#include <emissivemap_fragment>
{
    vec3 nightColor = texture2D(nightTexture, vMapUv).rgb;
    totalEmissiveRadiance += nightColor * (1.0 - earthDayFactor) * 1.6;
}`
        );
    };

    return material;
}

/**
 * Represents the planet Earth in the simulation, including its surface and cloud layer.
 * Sets up Earth's trajectory, material, and cloud rendering.
 */
export class Earth extends Planet {
    private customUniforms: EarthUniforms;
    private readonly starLighting: IStarLightingSet = createStarLightingSet();

    /**
     * Constructs a new Earth object with its unique properties, orbit, and cloud layer.
     * @param dependencies State dependencies for the simulation.
     * @param scene The THREE.Scene to which Earth belongs.
     * @param angleRad Position along the orbit in radians. On Earth's real orbit (the default)
     *                 this is the true anomaly measured from perihelion (0 = perihelion,
     *                 π = aphelion); when `orbitDistance` is given it is instead the circular
     *                 orbital angle (0 = +X axis, π/2 = +Z axis), exactly as it was before.
     * @param orbitDistance Optional radius of a bespoke CIRCULAR orbit around the Sun. Omit it
     *                 (the normal case) to give Earth its real, slightly eccentric orbit;
     *                 scenarios that need Earth on a tight circle — the wormhole short-cut and
     *                 the asteroid field — pass an explicit radius.
     */
    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        angleRad: number = 0,
        orbitDistance?: number
    ) {
        const gEff = dependencies.getG();
        // The spin rate stays keyed to EARTH_DIST regardless of the orbit actually flown, so a day
        // keeps looking like a day. Deriving it from a much tighter orbit would shorten the
        // sim year and spin Earth into a blur.
        const timeScale =
            EARTH_ORBITAL_PERIOD_REAL / calcSimOrbitalPeriod(EARTH_DIST, gEff, SUN_MASS);
        const rotSpeed = ((2 * Math.PI) / (23.934 * 3600)) * timeScale;

        // Earth follows its real orbit by default: nearly circular (e ≈ 0.0167) and, by
        // definition, lying in the ecliptic (inclination ≈ 0), so it is built from its orbital
        // elements the same way Neptune and Pluto are. The eccentricity makes the Sun distance
        // vary by ~1.7% over the year and the argument of perihelion points that ellipse the
        // correct way round the ecliptic. A scenario that needs Earth on a bespoke circular orbit
        // passes `orbitDistance`, which keeps the old flat-circle placement.
        let trajectory: { pos: THREE.Vector3; vel: THREE.Vector3 };
        /** Set only on the real orbit; a bespoke circular orbit was never placed on elements. */
        let referenceOrbitElements: IBodyOrbitElements | null = null;
        if (orbitDistance === undefined) {
            referenceOrbitElements = orbitElementsFromApsides(
                EARTH_PERIHELION_DIST,
                EARTH_APHELION_DIST,
                EARTH_INCLINATION,
                EARTH_LONG_ASC_NODE,
                EARTH_ARG_PERIHELION
            );
            trajectory = planetOrbitFromElements(referenceOrbitElements, angleRad, gEff * SUN_MASS);
        } else {
            trajectory = calculateTrajectory(gEff, orbitDistance, SUN_MASS, angleRad);
        }

        const geometry = buildBodySphereGeometry(EARTH_RADIUS);

        const customUniforms: EarthUniforms = {
            nightTexture: { value: earthNightTexture },
            specularTexture: { value: earthSpecularTexture },
            starPositions: { value: Array.from({ length: MAX_STARS }, () => new THREE.Vector3()) },
            starLight: { value: new Array<number>(MAX_STARS).fill(0) },
            numStars: { value: 0 },
            earthPosition: { value: new THREE.Vector3() },
        };

        const material = buildEarthMaterial(customUniforms);
        const mesh = new THREE.Mesh(geometry, material);

        super(dependencies, scene, {
            id: createUniqueId('earth'),
            name: 'Earth',
            mass: EARTH_MASS,
            radius: EARTH_RADIUS,
            pos: trajectory.pos,
            vel: trajectory.vel,
            referenceOrbitElements: referenceOrbitElements ?? undefined,
            rotation: {
                tilt: EARTH_AXIS,
                speed: rotSpeed,
                azimuth: EARTH_AZIMUTH,
            },
            trailColor: 0x88ccff,
            maxTrail: 4500,
            bodySubtype: PlanetTypeEnum.Terrestrial,
            mesh: mesh,
            atmosphere: {
                radius: EARTH_RADIUS * 1.07,
                tint: 0x5599ff,
                // Surface pressure in bar.
                density: 1.0,
            },
            magneticField: {
                strength: EARTH_MAG_STRENGTH,
                tilt: EARTH_MAG_TILT,
                azimuth: EARTH_MAG_AZIMUTH,
                offset: EARTH_MAG_OFFSET,
                reversed: EARTH_MAG_REVERSED,
            },
            attributes: {
                surfacePressure: { discovered: true },
                coreType: { value: CoreTypeEnum.Molten, discovered: true },
                atmosphericComposition: {
                    value:
                        AtmosphericGasEnum.Nitrogen |
                        AtmosphericGasEnum.Oxygen |
                        AtmosphericGasEnum.Argon |
                        AtmosphericGasEnum.CarbonDioxide |
                        AtmosphericGasEnum.Ozone |
                        AtmosphericGasEnum.WaterVapor,
                    discovered: true,
                },
                soilComposition: {
                    value:
                        SoilCompositionEnum.Silicates |
                        SoilCompositionEnum.Iron |
                        SoilCompositionEnum.IronOxide |
                        SoilCompositionEnum.Carbon,
                    discovered: true,
                },
                liquidComposition: { value: LiquidCompositionEnum.Water, discovered: true },
                averageTemperatureKelvin: { value: 288, discovered: true },
                vegetation: {
                    value:
                        VegetationEnum.Grass |
                        VegetationEnum.Trees |
                        VegetationEnum.Cacti |
                        VegetationEnum.Algae |
                        VegetationEnum.Fungus |
                        VegetationEnum.Moss |
                        VegetationEnum.Shrubs |
                        VegetationEnum.Kelp,
                    discovered: true,
                },
                sentientLife: { value: true, discovered: true },
                lifeformBase: { value: LifeformBaseEnum.CarbonBased, discovered: true },
                orbitalPeriod: { discovered: true },
                rotationPeriod: { discovered: true },
            },
        });

        this.customUniforms = customUniforms;

        // Procedural, Earth-like weather; clouds drift slightly faster than the surface turns.
        this.setClouds(EARTH_CLOUD_PROFILE, rotSpeed * 1.3);
    }

    override updateVisuals(dtTotal: number, cameraPos?: THREE.Vector3) {
        super.updateVisuals(dtTotal, cameraPos);

        if (this._isDisposed) return;

        // Feed the stars lighting Earth most strongly into the day/night shader each frame, with
        // the exact irradiance each one delivers here (weighted by its colour's luminance), so
        // day vs night follows the light actually reaching the surface.
        gatherStarLighting(this.mesh.position, this.starLighting);
        const count = Math.min(this.starLighting.count, MAX_STARS);
        this.customUniforms.numStars.value = count;

        const posArray = this.customUniforms.starPositions.value;
        const lightArray = this.customUniforms.starLight.value;
        for (let i = 0; i < count; i++) {
            const light = this.starLighting.lights[i];
            posArray[i].copy(light.position);
            const c = light.color;
            lightArray[i] = light.irradiance * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
        }

        this.customUniforms.earthPosition.value.copy(this.mesh.position);
    }
}
