import * as THREE from 'three';
import { calculateTrajectory } from '../physics/physics.js';
import {
    SUN_MASS,
    EARTH_MASS,
    EARTH_DIST,
    EARTH_RADIUS,
    EARTH_AXIS,
    EARTH_ROT_SPEED,
} from '../utilities/consts.js';
import { createUniqueId, BodyTypeEnum, isBodyType } from '../utilities/utilities.js';
import { loadSrgbTexture } from '../drawing/textures.js';
import { IStateDependencies } from '../interfaces.js';
import { Planet } from './planet.js';
import { PlanetTypeEnum } from '../utilities/body-params.js';

// Maximum number of stars supported by the day/night shader.
const MAX_STARS = 8;

const earthDayTexture = loadSrgbTexture('./assets/textures/earth_day.jpg');
const earthNightTexture = loadSrgbTexture('./assets/textures/earth_night.jpg');
const earthCloudsTexture = loadSrgbTexture('./assets/textures/earth_clouds.jpg');
earthCloudsTexture.wrapS = THREE.RepeatWrapping;
earthCloudsTexture.wrapT = THREE.RepeatWrapping;

type EarthUniforms = {
    nightTexture:  { value: THREE.Texture };
    starPositions: { value: THREE.Vector3[] };
    numStars:      { value: number };
    earthPosition: { value: THREE.Vector3 };
};

function buildEarthMaterial(customUniforms: EarthUniforms): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({
        map: earthDayTexture,
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
uniform vec3 starPositions[MAX_STARS];
uniform int  numStars;
uniform vec3 earthPosition;
varying vec3 vEarthWorldNormal;`
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
    float nightFactor = 1.0 - smoothstep(0.0, 0.2, maxLight);
    vec3  nightColor  = texture2D(nightTexture, vMapUv).rgb;
    totalEmissiveRadiance += nightColor * nightFactor * 1.8;
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
     */
    constructor(dependencies: IStateDependencies, scene: THREE.Scene) {
        const trajectory = calculateTrajectory(dependencies.getG(), EARTH_DIST, SUN_MASS);
        const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);

        const customUniforms: EarthUniforms = {
            nightTexture:  { value: earthNightTexture },
            starPositions: { value: Array.from({ length: MAX_STARS }, () => new THREE.Vector3()) },
            numStars:      { value: 0 },
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
                speed: EARTH_ROT_SPEED,
            },
            trailColor: 0x88ccff,
            maxTrail: 4500,
            bodySubtype: PlanetTypeEnum.Terrestrial,
            mesh: mesh,
        });

        this.customUniforms = customUniforms;

        // Cloud layer (UV sphere slightly above surface)
        const cloudsMat = new THREE.MeshStandardMaterial({
            map: earthCloudsTexture,
            color: 0xffffff,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
            roughness: 1.0,
            metalness: 0.0,
        });

        const cloudsGeo = new THREE.SphereGeometry(this.radius * 1.03, 32, 32);
        this.clouds = new THREE.Mesh(cloudsGeo, cloudsMat);
        this.clouds.renderOrder = 2;
        this.clouds.receiveShadow = true;
        // Make cloud sphere selectable (raycaster maps back to owning body)
        this.clouds.userData = { parentBody: this };
        this.mesh.add(this.clouds);

        // Clouds rotate slightly faster than Earth to simulate moving atmosphere.
        this.cloudRotationSpeed = EARTH_ROT_SPEED * 1.3;
    }

    update(acc: THREE.Vector3, dt: number) {
        super.update(acc, dt);

        // Feed live star positions into the day/night shader each frame.
        const stars = this.dependencies.getBodies().filter(
            b => isBodyType(b, BodyTypeEnum.Star) && !b._isDisposed
        );

        const count = Math.min(stars.length, MAX_STARS);
        this.customUniforms.numStars.value = count;

        const posArray = this.customUniforms.starPositions.value;
        for (let i = 0; i < count; i++) {
            posArray[i].copy(stars[i].mesh.position);
        }

        this.customUniforms.earthPosition.value.copy(this.mesh.position);
    }
}
