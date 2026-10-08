import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import { stateVectorsFromElements } from '../procedural/orbital-math.js';
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
} from '../utilities/consts.js';
import { buildBodySphereGeometry, createUniqueId, isBodyType } from '../utilities/utilities.js';
import { getBodyTexture } from '../drawing/texture-registry.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet.js';
import { BodyTypeEnum, PlanetTypeEnum } from './body-enums.js';
import {
    AtmosphericGasEnum,
    CoreTypeEnum,
    LifeformBaseEnum,
    LiquidCompositionEnum,
    SoilCompositionEnum,
    VegetationEnum,
} from './body-attributes.js';

// Maximum number of stars supported by the day/night shader.
const MAX_STARS = 8;

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
uniform sampler2D nightTexture;
uniform sampler2D specularTexture;
uniform vec3 starPositions[MAX_STARS];
uniform int  numStars;
uniform vec3 earthPosition;
varying vec3 vEarthWorldNormal;`
        );

        // Blend day/night textures in the base map for smoother terminator.
        // vMapUv is declared by Three.js under USE_MAP (guaranteed since map is set).
        shader.fragmentShader = shader.fragmentShader.replace(
            '#include <map_fragment>',
            `{
    float maxLight = 0.0;
    for (int i = 0; i < MAX_STARS; i++) {
        if (i >= numStars) break;
        vec3  lightDir = normalize(starPositions[i] - earthPosition);
        float ndotl    = max(dot(vEarthWorldNormal, lightDir), 0.0);
        maxLight = max(maxLight, ndotl);
    }

    // Day factor for texture blend (wider than before so sunset/twilight wraps farther).
    float dayFactor = smoothstep(0.06, 0.35, maxLight);

    vec3 dayColor   = texture2D(map, vMapUv).rgb;
    vec3 nightColor = texture2D(nightTexture, vMapUv).rgb;

    // Warm tint near the terminator for a sunset-like transition.
    float twilight = dayFactor * (1.0 - dayFactor); // peaks around 0.5
    vec3 warmTint = vec3(1.0, 0.72, 0.45);
    vec3 blended = mix(nightColor, dayColor, dayFactor);
    blended = mix(blended, blended * warmTint, twilight * 1.25);

    diffuseColor.rgb *= blended;
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
    float maxLight = 0.0;
    for (int i = 0; i < MAX_STARS; i++) {
        if (i >= numStars) break;
        vec3  lightDir = normalize(starPositions[i] - earthPosition);
        float ndotl    = max(dot(vEarthWorldNormal, lightDir), 0.0);
        maxLight = max(maxLight, ndotl);
    }
    float nightFactor = 1.0 - smoothstep(0.06, 0.35, maxLight);
    vec3  nightColor  = texture2D(nightTexture, vMapUv).rgb;
    totalEmissiveRadiance += nightColor * nightFactor * 1.6;
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
        if (orbitDistance === undefined) {
            const semiMajorAxis = (EARTH_PERIHELION_DIST + EARTH_APHELION_DIST) / 2;
            const ecc =
                (EARTH_APHELION_DIST - EARTH_PERIHELION_DIST) /
                (EARTH_APHELION_DIST + EARTH_PERIHELION_DIST); // ≈ 0.0167
            trajectory = stateVectorsFromElements({
                semiMajorAxis,
                eccentricity: ecc,
                inclinationRad: THREE.MathUtils.degToRad(EARTH_INCLINATION),
                longitudeAscendingNodeRad: THREE.MathUtils.degToRad(EARTH_LONG_ASC_NODE),
                argumentOfPeriapsisRad: THREE.MathUtils.degToRad(EARTH_ARG_PERIHELION),
                trueAnomalyRad: angleRad,
                mu: gEff * SUN_MASS,
            });
        } else {
            trajectory = calculateTrajectory(gEff, orbitDistance, SUN_MASS, angleRad);
        }

        const geometry = buildBodySphereGeometry(EARTH_RADIUS);

        const customUniforms: EarthUniforms = {
            nightTexture: { value: earthNightTexture },
            specularTexture: { value: earthSpecularTexture },
            starPositions: { value: Array.from({ length: MAX_STARS }, () => new THREE.Vector3()) },
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

        const earthCloudsTexture = getBodyTexture('earth_clouds.jpg');
        earthCloudsTexture.wrapS = THREE.ClampToEdgeWrapping;
        earthCloudsTexture.wrapT = THREE.ClampToEdgeWrapping;

        // earthCloudsTexture.repeat.set(-1, 1);
        // earthCloudsTexture.offset.set(1, 0);

        // earthCloudsTexture.rotation = 0;

        // Cloud layer (UV sphere slightly above surface)
        const cloudsMat = new THREE.MeshStandardMaterial({
            map: earthCloudsTexture,
            alphaMap: earthCloudsTexture,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            depthTest: true,
            color: 0xffffff,
            roughness: 1.0,
            metalness: 0.0,
        });

        const cloudsGeo = buildBodySphereGeometry(this.radius * 1.03);
        this.clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
        this.clouds.renderOrder = 2;
        this.clouds.receiveShadow = true;
        // Make cloud sphere selectable (raycaster maps back to owning body)
        this.clouds.userData = { parentBody: this };
        this.mesh.add(this.clouds);

        // Clouds rotate slightly faster than Earth to simulate moving atmosphere.
        this.cloudRotationSpeed = rotSpeed * 1.3;
    }

    override updateVisuals(dtTotal: number, cameraPos?: THREE.Vector3) {
        super.updateVisuals(dtTotal, cameraPos);

        if (this._isDisposed) return;

        // Feed live star positions into the day/night shader each frame.
        // This allocated a filtered array once per substep before; now it runs once per frame.
        const stars = this.dependencies
            .getBodies()
            .filter((b) => isBodyType(b, BodyTypeEnum.Star) && !b._isDisposed);

        const count = Math.min(stars.length, MAX_STARS);
        this.customUniforms.numStars.value = count;

        const posArray = this.customUniforms.starPositions.value;
        for (let i = 0; i < count; i++) {
            posArray[i].copy(stars[i].mesh.position);
        }

        this.customUniforms.earthPosition.value.copy(this.mesh.position);
    }
}
