import * as THREE from 'three';
import { CLOUD_OPTICAL_DEPTH } from '../utilities/consts';
import { CLOUD_COMMON_GLSL, syncCloudObjectSpace, type CloudUniforms } from './cloud-coverage-glsl';

/** Cloud albedo of the flat layer (Lambertian, so divided by pi in the shader). */
const FLAT_CLOUD_ALBEDO = 0.6;
/**
 * Optical depth the flat layer gives full, eroded cover: half the deck's, as a view through a
 * cloud from above crosses about half its column. Same knobs (CLOUD_OPTICAL_DEPTH and the
 * profile's densityScale) as the volumetric deck, so transparency tunes the same in every tier.
 */
const FLAT_OPTICAL_DEPTH = CLOUD_OPTICAL_DEPTH * 0.5;

/** How much darker a thick cloud looks from underneath than from above. */
const FLAT_UNDERSIDE_DARKENING = 0.65;

/**
 * Low-tier clouds: a single sphere at the cloud top, coloured and cut out by the shared
 * procedural coverage (cloud-coverage-glsl.ts). A handful of noise fetches per pixel and no ray
 * march, so it costs about what the old textured cloud sphere did.
 *
 * Lit by the same raw star irradiance as everything else: a soft Lambert term for the day side,
 * a little skylight through twilight, nothing on the night side.
 */
export function createFlatCloudMesh(
    uniforms: CloudUniforms,
    worldStarDirs: THREE.Vector3[]
): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.FrontSide,
        transparent: true,
        depthWrite: false,
        depthTest: true,
    });

    material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);

        shader.vertexShader = shader.vertexShader
            .replace(
                '#include <common>',
                /* glsl */ `#include <common>
                varying vec3 vCloudObjPos;`
            )
            .replace(
                '#include <project_vertex>',
                /* glsl */ `#include <project_vertex>
                vCloudObjPos = position;`
            );

        shader.fragmentShader = shader.fragmentShader
            .replace(
                '#include <common>',
                /* glsl */ `#include <common>
                ${CLOUD_COMMON_GLSL}
                varying vec3 vCloudObjPos;`
            )
            .replace(
                'vec4 diffuseColor = vec4( diffuse, opacity );',
                /* glsl */ `
                // Fully replaced by the volumetric deck (LOD): skip all the work.
                if (uCloudVolumetricFade >= 0.999) discard;
                vec3 cDir = normalize(vCloudObjPos);
                vec2 cField = cloudField(cDir);
                // Same erosion and cirrus as the volumetric deck, read at the upper deck where
                // the billows are, so the flat layer's edges match it and look as cottony.
                float cDens = cField.x > 0.0 ? cloudErode(cField.x, cDir, cDir, 0.85, true) : 0.0;
                // Cirrus is a thin volume; seen flat its depth needs scaling up to match.
                cDens += 6.0 * cloudCirrus(cDir, 0.85, cField.y);
                // Beer-Lambert, like the volumetric deck.
                float cCov = 1.0 - exp(-${FLAT_OPTICAL_DEPTH.toFixed(3)} * uCloudDensityScale * cDens);
                if (cCov < 0.002) discard;

                vec3 cCol = vec3(0.0);
                for (int s = 0; s < CLOUD_MAX_STARS; s++) {
                    if (s >= uCloudStarCount) break;
                    float mu = dot(cDir, uCloudStarDir[s]);
                    // Slightly wrapped Lambert: cloud scatters a little light past the terminator.
                    float diffuseTerm = clamp((mu + 0.05) / 1.05, 0.0, 1.0);
                    cCol += uCloudStarLight[s] *
                        (diffuseTerm * ${(FLAT_CLOUD_ALBEDO / Math.PI).toFixed(6)} + cloudAmbient(mu, 1.0));
                }

                // Seen from below (camera inside the layer), thick cloud blocks the light.
                if (dot(uCloudCamObj, uCloudCamObj) < 1.0) {
                    cCol *= mix(1.0, 1.0 - ${FLAT_UNDERSIDE_DARKENING.toFixed(3)}, cCov);
                }
                cCol *= uCloudTint * cloudShade(cField.y);

                // Fades out as the volumetric deck fades in (cloud-layer.ts LOD).
                float cAlpha = cCov * (1.0 - uCloudVolumetricFade);
                if (cAlpha < 0.002) discard;
                vec4 diffuseColor = vec4(cCol, cAlpha);
                `
            );
    };
    material.customProgramCacheKey = () => 'flat-clouds-v5';

    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 64), material);
    mesh.name = 'FlatClouds';
    mesh.renderOrder = 2;

    // From outside, draw the near hemisphere; from inside (surface camera), the dome overhead.
    mesh.onBeforeRender = (_renderer, _scene, camera) => {
        const camDistSq = syncCloudObjectSpace(uniforms, worldStarDirs, mesh, camera);
        const side = camDistSq < 1 ? THREE.BackSide : THREE.FrontSide;
        if (material.side !== side) material.side = side;
    };

    return mesh;
}
