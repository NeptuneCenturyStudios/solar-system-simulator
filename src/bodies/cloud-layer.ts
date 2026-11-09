import * as THREE from 'three';
import {
    createCloudUniforms,
    updateCloudStarLighting,
    type CloudUniforms,
} from '../effects/cloud-coverage-glsl';
import {
    createCloudProbeMaterial,
    type ICloudProbeSource,
} from '../effects/cloud-transmittance-probe';
import { createFlatCloudMesh } from '../effects/flat-clouds';
import type { IStarLightingSet } from '../effects/star-illumination';
import {
    createVolumetricCloudMesh,
    type IVolumetricCloudMesh,
    type VolumetricCloudTier,
} from '../effects/volumetric-clouds';
import type { ICloudProfile } from '../procedural/cloud-profile';
import { settingsStore } from '../settings/settings-store';
import {
    CLOUD_TOP_FACTOR,
    CLOUD_VOLUMETRIC_FADE_END,
    CLOUD_VOLUMETRIC_FADE_START,
    MAX_LIGHTING_STARS,
} from '../utilities/consts';

/**
 * Longest step (seconds) the weather evolution advances in one frame. Keeps it at a steady,
 * watchable pace however fast the simulation runs, like the aurora's MAX_ANIM_DELTA.
 */
const MAX_EVOLVE_DELTA = 0.05;

/** The parts of a body the cloud layer attaches to. Structural, to avoid an import cycle. */
interface ICloudHost {
    readonly radius: number;
    readonly mesh: THREE.Object3D;
    /** Outer atmosphere radius, null when airless. */
    readonly atmosphereRadius: number | null;
    readonly atmosphereTint: THREE.Color;
}

export interface CloudLayerHandle {
    /** The group that holds the layer. Spun by CelestialBody at `cloudRotationSpeed`. */
    readonly group: THREE.Group;
    /** Per-frame update: this frame's star lighting at the body and the frame's sim time step. */
    update: (lights: IStarLightingSet, dtTotal: number) => void;
    setRadius: (bodyRadius: number) => void;
    /**
     * What CloudTransmittanceProbe needs to measure how much light gets through this layer on a
     * line of sight (lens flares dim stars behind clouds). Same GLSL and uniforms as the draw.
     */
    readonly probe: ICloudProbeSource;
    dispose: () => void;
}

/**
 * Builds a body's cloud layer: the procedural coverage drawn flat (Low tier, and always when
 * the body is small on screen) or as a volumetric deck (Medium/High). Both share one uniform
 * set, so switching tier or LOD never moves a cloud.
 *
 * The flat mesh always exists and is what click picking hits (`userData.parentBody`). The
 * volumetric mesh is built the first time a volumetric tier is selected.
 *
 * The flat/volumetric LOD is decided at render time, from the camera being rendered (see
 * applyLod). Deciding it in update() used whatever position the camera had then, and the surface
 * camera is only moved onto the (already advanced) body later in the frame, so under time
 * acceleration the layer saw a camera far off the surface and flickered to flat.
 */
export function createCloudLayer(host: ICloudHost, profile: ICloudProfile): CloudLayerHandle {
    const uniforms: CloudUniforms = createCloudUniforms(
        profile,
        host.atmosphereRadius !== null ? host.atmosphereTint : null
    );
    const worldStarDirs: THREE.Vector3[] = [];
    for (let i = 0; i < MAX_LIGHTING_STARS; i++) worldStarDirs.push(new THREE.Vector3(1, 0, 0));

    // The group is scaled to the body radius and the meshes to the cloud top, so the shaders'
    // object space has the cloud top at 1 for any body.
    const group = new THREE.Group();
    group.name = 'CloudLayer';
    group.scale.setScalar(host.radius);
    host.mesh.add(group);

    const flat = createFlatCloudMesh(uniforms, worldStarDirs);
    flat.scale.setScalar(CLOUD_TOP_FACTOR);
    flat.userData = { parentBody: host };
    group.add(flat);

    let volumetric: IVolumetricCloudMesh | null = null;
    let volumetricTier: VolumetricCloudTier | null = null;

    /**
     * Sets the flat/volumetric crossfade for `camera` from the layer's angular radius: 0 = flat
     * only, 1 = volumetric only, blended in between so the swap never pops. Both meshes call it
     * before drawing and get the same answer, so whichever draws first sets it for both.
     */
    const applyLod = (camera: THREE.Camera): void => {
        if (settingsStore.settings.cloudQuality === 'low') {
            uniforms.uCloudVolumetricFade.value = 0;
            return;
        }
        _camPos.setFromMatrixPosition(camera.matrixWorld);
        _layerPos.setFromMatrixPosition(flat.matrixWorld);
        const cloudTop = flat.matrixWorld.getMaxScaleOnAxis();
        const dist = _camPos.distanceTo(_layerPos);
        const angularRadius = dist > cloudTop ? Math.asin(cloudTop / dist) : Math.PI / 2;
        uniforms.uCloudVolumetricFade.value = THREE.MathUtils.smoothstep(
            angularRadius,
            CLOUD_VOLUMETRIC_FADE_START,
            CLOUD_VOLUMETRIC_FADE_END
        );
    };
    chainBeforeRender(flat, applyLod);

    // The flat mesh's object space has the cloud top at radius 1, as the probe expects.
    const probe: ICloudProbeSource = { material: createCloudProbeMaterial(uniforms), object: flat };

    return {
        group,

        update: (lights, dtTotal) => {
            updateCloudStarLighting(uniforms, worldStarDirs, lights);

            const dt = Math.sign(dtTotal) * Math.min(Math.abs(dtTotal), MAX_EVOLVE_DELTA);
            uniforms.uCloudTime.value += dt * profile.evolveRate;

            // Tier only; the LOD fade between the meshes is set per draw (applyLod). Each shader
            // discards at once when it is fully faded out, so the idle mesh costs next to nothing.
            const quality = settingsStore.settings.cloudQuality;
            const wantVolumetric = quality !== 'low';
            if (wantVolumetric) {
                const tier: VolumetricCloudTier = quality === 'high' ? 'high' : 'medium';
                if (!volumetric) {
                    volumetric = createVolumetricCloudMesh(uniforms, worldStarDirs, tier);
                    volumetric.mesh.scale.setScalar(CLOUD_TOP_FACTOR);
                    chainBeforeRender(volumetric.mesh, applyLod);
                    group.add(volumetric.mesh);
                } else if (tier !== volumetricTier) {
                    volumetric.setTier(tier);
                }
                volumetricTier = tier;
            }
            if (volumetric) volumetric.mesh.visible = wantVolumetric;
        },

        setRadius: (bodyRadius) => {
            group.scale.setScalar(bodyRadius);
        },

        probe,

        dispose: () => {
            group.parent?.remove(group);
            flat.geometry.dispose();
            (flat.material as THREE.Material).dispose();
            probe.material.dispose();
            volumetric?.dispose();
            volumetric = null;
        },
    };
}

const _camPos = new THREE.Vector3();
const _layerPos = new THREE.Vector3();

/** Runs `before(camera)` ahead of the mesh's existing onBeforeRender. */
function chainBeforeRender(mesh: THREE.Mesh, before: (camera: THREE.Camera) => void): void {
    const original = mesh.onBeforeRender;
    mesh.onBeforeRender = (renderer, scene, camera, geometry, material, group) => {
        before(camera);
        original.call(mesh, renderer, scene, camera, geometry, material, group);
    };
}
