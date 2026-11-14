<template>
    <div class="vue-ui-options-fields">
        <div class="vue-ui-card-header">Graphics</div>

        <div class="control-group">
            <label>Graphics Preset</label>
            <select
                class="solver-select"
                :value="graphicsPreset"
                title="Sets render scale, HDR, clouds, shadows, sun rays, lens flares, aurorae, particles and name panel updates in one go. Changing any of them afterwards shows Custom."
                @change="onGraphicsPresetChange"
            >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="custom" disabled>Custom</option>
            </select>
            <p class="solver-hint">{{ graphicsPresetHint }}</p>
        </div>

        <div class="control-group">
            <label>
                Render Scale
                <span class="val-display">{{ renderScalePercent }}%</span>
            </label>
            <div class="slider-row">
                <input
                    type="range"
                    :min="RENDER_SCALE_MIN * 100"
                    :max="RENDER_SCALE_MAX * 100"
                    :step="RENDER_SCALE_STEP * 100"
                    :value="renderScalePercent"
                    title="Resolution the 3D scene is drawn at, as a percentage of the window. Lower is faster but softer. The HUD always stays sharp."
                    @input="onRenderScaleInput"
                />
                <button
                    class="old-ui btn-slider-reset"
                    :title="`Reset to ${RENDER_SCALE_DEFAULT * 100}%`"
                    @click="resetRenderScale"
                >
                    <svg-icon type="mdi" :path="mdiReplay"></svg-icon>
                </button>
            </div>
            <p class="solver-hint">{{ renderScaleHint }}</p>
        </div>

        <div class="control-group">
            <label class="checkbox-row">
                <input
                    type="checkbox"
                    :checked="simStore.hdrEnabled && simStore.hdrSupported"
                    :disabled="!simStore.hdrSupported"
                    title="Draw the scene with high dynamic range, so light brighter than white rolls off smoothly instead of clipping."
                    @change="onHdrChange"
                />
                HDR Rendering
            </label>
            <p class="solver-hint">{{ hdrHint }}</p>
        </div>

        <div class="control-group">
            <label>Tone Mapping</label>
            <select
                class="solver-select"
                :value="simStore.toneMapping"
                title="The curve that fits the scene's light onto the screen."
                @change="onToneMappingChange"
            >
                <option value="agx">AgX</option>
                <option value="aces">ACES Filmic</option>
                <option value="neutral">Neutral</option>
            </select>
            <p class="solver-hint">{{ toneMappingHint }}</p>
        </div>

        <div class="control-group">
            <label>
                Exposure
                <span class="val-display">{{ simStore.exposure.toFixed(2) }}×</span>
            </label>
            <div class="slider-row">
                <input
                    type="range"
                    :min="EXPOSURE_MIN"
                    :max="EXPOSURE_MAX"
                    :step="EXPOSURE_STEP"
                    :value="simStore.exposure"
                    title="Brightens or darkens the whole scene before tone mapping. The HUD is unaffected."
                    @input="onExposureInput"
                />
                <button
                    class="old-ui btn-slider-reset"
                    :title="`Reset to ${EXPOSURE_DEFAULT}×`"
                    @click="resetExposure"
                >
                    <svg-icon type="mdi" :path="mdiReplay"></svg-icon>
                </button>
            </div>
        </div>

        <div class="control-group">
            <label>Texture Quality</label>
            <select
                class="solver-select"
                :value="simStore.textureQuality"
                :title="textureQualityTitle"
                @change="onTextureQualityChange"
            >
                <option value="low">Low (standard)</option>
                <option value="high" :disabled="!highQualityAvailable">High (up to 8K)</option>
            </select>
            <p class="solver-hint">{{ textureQualityHint }}</p>
        </div>

        <div class="control-group">
            <label>
                Render Distance
                <span class="val-display">{{ renderDistanceLabel }}</span>
            </label>
            <div class="slider-row">
                <input
                    type="range"
                    :min="0"
                    :max="RENDER_DISTANCE_SLIDER_STEPS"
                    step="1"
                    :value="renderDistanceSliderPos"
                    title="How far from the camera objects are drawn, in astronomical units (AU). Lower values improve performance by culling distant planets and belts."
                    @input="onRenderDistanceInput"
                />
                <button
                    class="old-ui btn-slider-reset"
                    :title="`Reset to default (${RENDER_DISTANCE_DEFAULT_AU} AU)`"
                    @click="resetRenderDistance"
                >
                    <svg-icon type="mdi" :path="mdiReplay"></svg-icon>
                </button>
            </div>
            <p class="solver-hint">
                Objects farther than this from the camera are not drawn, but their names and
                distant-body dots still are. The default shows out to Saturn from Earth.
            </p>
        </div>

        <div class="control-group">
            <label>Distant Body Detail</label>
            <select
                class="solver-select"
                :value="simStore.distantBodyDetail"
                title="Bodies that look small on screen are drawn as low-poly spheres, and tiny ones as dots, so a distant cluster of bodies costs almost nothing to draw."
                @change="onDistantBodyDetailChange"
            >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
            </select>
            <p class="solver-hint">{{ distantBodyDetailHint }}</p>
        </div>

        <div class="control-group">
            <label>Name Panel Updates</label>
            <select
                class="solver-select"
                :value="simStore.namePanelUpdateRate"
                title="How often body name panels redraw their distance. Panels always follow their bodies smoothly; only the number updates less often on lower settings."
                @change="onNamePanelUpdateRateChange"
            >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
            </select>
            <p class="solver-hint">{{ namePanelUpdateRateHint }}</p>
        </div>

        <div class="control-group">
            <label>
                Frame Rate Limit
                <span class="val-display">{{ simStore.frameRateLimit || 'Unlimited' }}</span>
            </label>
            <input
                class="text-input"
                type="number"
                min="0"
                max="240"
                :value="simStore.frameRateLimit"
                title="Maximum frames per second. 0 or blank = unlimited."
                @input="onFrameRateLimitInput"
            />
        </div>

        <div class="vue-ui-card-header">Effects</div>

        <div class="control-group">
            <label>Cloud Quality</label>
            <select
                class="solver-select"
                :value="simStore.cloudQuality"
                title="How cloud layers are drawn. Every level shows the same clouds in the same places; higher levels give them depth and self-shadowing at a higher GPU cost."
                @change="onCloudQualityChange"
            >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
            </select>
            <p class="solver-hint">{{ cloudQualityHint }}</p>
        </div>

        <div class="control-group">
            <label>Star Quality</label>
            <select
                class="solver-select"
                :value="simStore.starQuality"
                title="How much detail star surfaces and their glowing edges draw. A star close up can fill the screen, so on integrated graphics this can be the most expensive thing in the scene."
                @change="onStarQualityChange"
            >
                <option value="minimal">Minimal</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
            </select>
            <p class="solver-hint">{{ starQualityHint }}</p>
        </div>

        <div class="control-group">
            <label>Shadow Quality</label>
            <select
                class="solver-select"
                :value="simStore.shadowQuality"
                title="Eclipse shadows between planets, moons and ships, and shaped shadows cast by nearby ships onto the ground, each other and themselves."
                @change="onShadowQualityChange"
            >
                <option value="off">Off</option>
                <option value="low">Low</option>
                <option value="high">High</option>
            </select>
            <p class="solver-hint">{{ shadowQualityHint }}</p>
        </div>

        <label class="checkbox-row">
            <input type="checkbox" :checked="simStore.sunRaysEnabled" @change="onSunRaysChange" />
            Sun Rays
        </label>

        <label class="checkbox-row">
            <input
                type="checkbox"
                :checked="simStore.lensflareEnabled"
                @change="onLensflareChange"
            />
            Lens Flares
        </label>

        <label class="checkbox-row">
            <input type="checkbox" :checked="simStore.auroraEnabled" @change="onAuroraChange" />
            Aurorae
        </label>

        <div v-if="simStore.auroraEnabled" class="control-group">
            <label>Aurora Detail</label>
            <select
                class="solver-select"
                :value="simStore.auroraDetail"
                title="How much per-pixel work the aurora curtains do. Dynamic animates each band's height, brightness and colour; Static gives every band its own fixed values and compiles a cheaper shader."
                @change="onAuroraDetailChange"
            >
                <option value="static">Static Bands</option>
                <option value="dynamic">Dynamic Bands</option>
            </select>
            <p class="solver-hint">{{ auroraDetailHint }}</p>
        </div>

        <label class="checkbox-row">
            <input
                type="checkbox"
                :checked="simStore.particleEffectsEnabled"
                @change="onParticleEffectsChange"
            />
            Enable Particle Effects
        </label>

        <div class="vue-ui-card-header">Camera</div>
        <label class="checkbox-row">
            <input
                type="checkbox"
                :checked="simStore.smoothZoomEnabled"
                @change="onSmoothZoomChange"
            />
            Smooth Zoom
        </label>

        <div class="vue-ui-card-header">Physics</div>
        <div class="control-group">
            <label>Gravity Solver</label>
            <select
                class="solver-select"
                :value="simStore.physicsSolver"
                title="How gravitational forces are computed each step. Exact is the ground truth; Significant Mass is exact for everything that matters and far faster with many bodies; Barnes-Hut scales best when many bodies have comparable mass."
                @change="onPhysicsSolverChange"
            >
                <option value="direct">Exact (all pairs)</option>
                <option value="cutoff">Significant Mass</option>
                <option value="barnes-hut">Barnes-Hut (octree)</option>
            </select>
            <p class="solver-hint">{{ solverHint }}</p>
        </div>

        <div v-if="simStore.physicsSolver === 'barnes-hut'" class="control-group">
            <label>
                Opening Angle (θ)
                <span class="val-display">{{ simStore.barnesHutTheta.toFixed(2) }}</span>
            </label>
            <div class="slider-row">
                <input
                    type="range"
                    min="0.1"
                    max="1.5"
                    step="0.05"
                    :value="simStore.barnesHutTheta"
                    title="How aggressively distant groups of bodies are collapsed into a single point mass. Lower is more accurate and slower."
                    @input="onBarnesHutThetaInput"
                />
                <button
                    class="old-ui btn-slider-reset"
                    title="Reset to default (0.5)"
                    @click="resetBarnesHutTheta"
                >
                    <svg-icon type="mdi" :path="mdiReplay"></svg-icon>
                </button>
            </div>
        </div>

        <div class="control-group">
            <label>Ship Collision</label>
            <select
                class="solver-select"
                :value="simStore.shipCollisionMode"
                title="How two ships' hulls are tested against each other. Triangle uses the actual models; Box uses each hull's bounding box and is much cheaper against very detailed ships."
                @change="onShipCollisionModeChange"
            >
                <option value="triangle">Triangle (exact hull)</option>
                <option value="box">Box (fast)</option>
            </select>
            <p class="solver-hint">{{ shipCollisionHint }}</p>
        </div>

        <div class="control-group">
            <label>
                Physics Accuracy
                <span class="val-display">{{ simStore.substeps }}</span>
            </label>
            <div class="slider-row">
                <input
                    type="range"
                    min="1"
                    max="512"
                    step="1"
                    :value="simStore.substeps"
                    title="Controls how many physics steps are calculated per frame. Higher values improve orbital accuracy but use more CPU. Lower values are faster but less precise."
                    @input="onSubstepsInput"
                />
                <button
                    class="old-ui btn-slider-reset"
                    title="Reset to default (64)"
                    @click="resetSubsteps"
                >
                    <svg-icon type="mdi" :path="mdiReplay"></svg-icon>
                </button>
            </div>
        </div>

        <div class="vue-ui-card-header">Audio</div>
        <div class="control-group">
            <label>
                Sound Effects Volume
                <span class="val-display">{{ simStore.sfxVolumePercent }}%</span>
            </label>
            <div class="slider-row">
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :value="simStore.sfxVolumePercent"
                    title="Controls the volume of weapon sounds, impacts, explosions, and warp loop effects."
                    @input="onSfxVolumeInput"
                />
                <button
                    class="old-ui btn-slider-reset"
                    title="Reset to 50%"
                    @click="resetSfxVolume"
                >
                    <svg-icon type="mdi" :path="mdiReplay"></svg-icon>
                </button>
            </div>
        </div>

        <div class="control-group">
            <label>
                Voice Volume
                <span class="val-display">{{ simStore.voiceVolumePercent }}%</span>
            </label>
            <div class="slider-row">
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :value="simStore.voiceVolumePercent"
                    title="Controls the volume of ship computer and scenario voice prompts."
                    @input="onVoiceVolumeInput"
                />
                <button
                    class="old-ui btn-slider-reset"
                    title="Reset to 100%"
                    @click="resetVoiceVolume"
                >
                    <svg-icon type="mdi" :path="mdiReplay"></svg-icon>
                </button>
            </div>
        </div>

        <div class="control-group">
            <label>
                Background Music Volume
                <span class="val-display">{{ simStore.musicVolumePercent }}%</span>
            </label>
            <div class="slider-row">
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    :value="simStore.musicVolumePercent"
                    title="Controls the volume of background music."
                    @input="onMusicVolumeInput"
                />
                <button
                    class="old-ui btn-slider-reset"
                    title="Reset to 50%"
                    @click="resetMusicVolume"
                >
                    <svg-icon type="mdi" :path="mdiReplay"></svg-icon>
                </button>
            </div>
        </div>

        <div class="vue-ui-card-header">Saving</div>
        <label class="checkbox-row">
            <input
                type="checkbox"
                :checked="simStore.alwaysCloseWithoutAsking"
                title="Leave the current system without being reminded how long it has been since your last save."
                @change="onAlwaysCloseWithoutAskingChange"
            />
            Always close without asking
        </label>

        <div class="vue-ui-card-header">Debug</div>
        <label class="checkbox-row">
            <input type="checkbox" :checked="simStore.showFps" @change="onShowFpsChange" />
            Show FPS
        </label>
        <label class="checkbox-row">
            <input
                type="checkbox"
                :checked="simStore.showRenderInfo"
                title="Frame time, draw calls, triangles, GPU memory objects and how many bodies are drawn at each detail level."
                @change="onShowRenderInfoChange"
            />
            Show Render Info
        </label>
        <label class="checkbox-row">
            <input type="checkbox" :checked="simStore.showAiDebug" @change="onShowAiDebugChange" />
            Show Ship AI Debug
        </label>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import {
    applyGraphicsPreset,
    setAuroraDetail,
    setAuroraEnabled,
    setBarnesHutTheta,
    setCloudQuality,
    setStarQuality,
    setShadowQuality,
    setShipCollisionMode,
    setExposure,
    setFrameRateLimit,
    setHdrEnabled,
    setLensflareEnabled,
    setMusicVolume,
    setParticleEffectsEnabled,
    setPhysicsSolver,
    setRenderDistance,
    setRenderScale,
    setSfxVolume,
    setVoiceVolume,
    setSunRaysEnabled,
    setShowAiDebug,
    setDistantBodyDetail,
    setNamePanelUpdateRate,
    setShowFps,
    setAlwaysCloseWithoutAsking,
    setShowRenderInfo,
    setSmoothZoomEnabled,
    setSubsteps,
    setTextureQuality,
    setToneMapping,
    simStore,
} from '../sim-bridge';
import type {
    AuroraDetailMode,
    CloudQuality,
    DistantBodyDetail,
    NamePanelUpdateRate,
    PhysicsSolverMode,
    ShadowQuality,
    ShipCollisionMode,
    StarQuality,
    TextureQuality,
    ToneMappingMode,
} from '../../settings/settings-store';
import {
    matchGraphicsPreset,
    type GraphicsPreset,
    type GraphicsPresetSelection,
} from '../../settings/graphics-presets';
import { isHighQualityTextureAvailable } from '../../drawing/texture-quality';
import {
    EXPOSURE_DEFAULT,
    EXPOSURE_MAX,
    EXPOSURE_MIN,
    EXPOSURE_STEP,
    RENDER_DISTANCE_DEFAULT_AU,
    RENDER_DISTANCE_MAX_AU,
    RENDER_DISTANCE_MIN_AU,
    RENDER_SCALE_DEFAULT,
    RENDER_SCALE_MAX,
    RENDER_SCALE_MIN,
    RENDER_SCALE_STEP,
} from '../../utilities/consts';
import SvgIcon from '@jamescoyle/vue-icon';
import { mdiReplay } from '@mdi/js';

/** Same defaults as the legacy panel's reset buttons. */
const DEFAULT_SUBSTEPS = 64;
const DEFAULT_BARNES_HUT_THETA = 0.5;

/** One-line explanation of the trade-off the selected solver is making. */
const SOLVER_HINTS: Record<PhysicsSolverMode, string> = {
    direct: 'Every pair computed exactly. Most accurate, but cost grows with the square of the body count.',
    cutoff: 'Exact between significant masses; skips negligible asteroid-on-asteroid pulls. Falls back to exact when all masses are comparable.',
    'barnes-hut':
        'Groups distant bodies into single point masses. Scales best for large clusters where many bodies have comparable mass.',
};
const DEFAULT_SFX_VOLUME_PERCENT = 50;
const DEFAULT_VOICE_VOLUME_PERCENT = 100;
const DEFAULT_MUSIC_VOLUME_PERCENT = 50;
/** Max frame-rate-limit value the Options panel permits. */
const MAX_FRAME_RATE_LIMIT = 240;

/** One-line summary of what each preset trades away. */
const GRAPHICS_PRESET_HINTS: Record<GraphicsPresetSelection, string> = {
    low: 'For integrated graphics: 75% render scale, no HDR, flat clouds, baked star surfaces, no shadows, sun rays or lens flares, slower name panel updates.',
    medium: "Volumetric clouds, eclipse shadows and the nearest ship's shadow, all effects on. The default.",
    high: isHighQualityTextureAvailable()
        ? 'Detailed volumetric clouds, high-quality textures, shadows for up to four ships and name panels updated every frame. Highest GPU cost.'
        : 'Detailed volumetric clouds, shadows for up to four ships and name panels updated every frame. Highest GPU cost.',
    custom: 'Your own mix of the settings below. Pick a preset to reset them all at once.',
};

/** The preset the current settings match, or Custom. */
const graphicsPreset = computed<GraphicsPresetSelection>(() =>
    matchGraphicsPreset({
        renderScale: simStore.renderScale,
        cloudQuality: simStore.cloudQuality,
        starQuality: simStore.starQuality,
        shadowQuality: simStore.shadowQuality,
        sunRaysEnabled: simStore.sunRaysEnabled,
        lensflareEnabled: simStore.lensflareEnabled,
        auroraEnabled: simStore.auroraEnabled,
        auroraDetail: simStore.auroraDetail,
        particleEffectsEnabled: simStore.particleEffectsEnabled,
        hdrEnabled: simStore.hdrEnabled,
        namePanelUpdateRate: simStore.namePanelUpdateRate,
    })
);

const graphicsPresetHint = computed(() => GRAPHICS_PRESET_HINTS[graphicsPreset.value]);

function onGraphicsPresetChange(e: Event): void {
    const value = (e.target as HTMLSelectElement).value as GraphicsPresetSelection;
    // Custom is display-only (its option is disabled), but guard anyway.
    if (value !== 'custom') applyGraphicsPreset(value as GraphicsPreset);
}

const renderScalePercent = computed(() => Math.round(simStore.renderScale * 100));

/** Pixel work goes with the square of the scale, which is the number worth knowing. */
const renderScaleHint = computed(() => {
    const scale = simStore.renderScale;
    if (scale >= 1) return 'The scene is drawn at full window resolution.';
    const work = Math.round(scale * scale * 100);
    return `The scene is drawn at ${renderScalePercent.value}% resolution: about ${work}% of the pixel work, slightly softer. The HUD stays sharp.`;
});

function onRenderScaleInput(e: Event): void {
    setRenderScale(parseInt((e.target as HTMLInputElement).value, 10) / 100);
}

function resetRenderScale(): void {
    setRenderScale(RENDER_SCALE_DEFAULT);
}

const hdrHint = computed(() => {
    if (!simStore.hdrSupported) {
        return 'Not supported by this graphics card or browser: bright light clips to white.';
    }
    return simStore.hdrEnabled
        ? 'Bright light (stars, sunlit clouds, explosions) rolls off smoothly. Uses twice the memory bandwidth of the scene image.'
        : 'Faster on integrated graphics, but anything brighter than white clips.';
});

function onHdrChange(e: Event): void {
    setHdrEnabled((e.target as HTMLInputElement).checked);
}

/** One-line description of each tone-mapping curve. */
const TONE_MAPPING_HINTS: Record<ToneMappingMode, string> = {
    agx: 'Natural film-like roll-off that keeps bright star colours true. The default.',
    aces: 'Punchier contrast; very bright colours shift toward white and yellow.',
    neutral: 'Colours closest to how they were authored; only the highlights are compressed.',
};

const toneMappingHint = computed(() => TONE_MAPPING_HINTS[simStore.toneMapping]);

function onToneMappingChange(e: Event): void {
    setToneMapping((e.target as HTMLSelectElement).value as ToneMappingMode);
}

function onExposureInput(e: Event): void {
    setExposure(parseFloat((e.target as HTMLInputElement).value));
}

function resetExposure(): void {
    setExposure(EXPOSURE_DEFAULT);
}

function onParticleEffectsChange(e: Event): void {
    setParticleEffectsEnabled((e.target as HTMLInputElement).checked);
}

function onLensflareChange(e: Event): void {
    setLensflareEnabled((e.target as HTMLInputElement).checked);
}

function onSunRaysChange(e: Event): void {
    setSunRaysEnabled((e.target as HTMLInputElement).checked);
}

function onAuroraChange(e: Event): void {
    setAuroraEnabled((e.target as HTMLInputElement).checked);
}

/** One-line explanation of what each aurora detail level buys. */
const AURORA_DETAIL_HINTS: Record<AuroraDetailMode, string> = {
    static: 'Each band keeps a fixed height, brightness and colour. Cheapest — the curtains still drift and writhe, but never flare.',
    dynamic:
        'Bands grow, brighten and fade independently, and the bright arcs migrate around the oval. Higher performance impact.',
};

const auroraDetailHint = computed(() => AURORA_DETAIL_HINTS[simStore.auroraDetail]);

function onAuroraDetailChange(e: Event): void {
    setAuroraDetail((e.target as HTMLSelectElement).value as AuroraDetailMode);
}

/** One-line explanation of what each cloud quality level costs. */
const CLOUD_QUALITY_HINTS: Record<CloudQuality, string> = {
    low: 'Flat procedural clouds. Fastest.',
    medium: 'Volumetric clouds with depth and soft self-shadowing. Distant planets stay flat.',
    high: 'Volumetric clouds with twice the samples and detailed self-shadowing. Highest GPU cost.',
};

const cloudQualityHint = computed(() => CLOUD_QUALITY_HINTS[simStore.cloudQuality]);

function onCloudQualityChange(e: Event): void {
    setCloudQuality((e.target as HTMLSelectElement).value as CloudQuality);
}

/** One-line explanation of what each star quality level costs. */
const STAR_QUALITY_HINTS: Record<StarQuality, string> = {
    minimal:
        'Star surfaces are pre-rendered once and slowly drift instead of boiling. No flame wisps. Fastest.',
    low: 'Live boiling surfaces with the finest detail and flame wisps removed.',
    medium: 'Live boiling surfaces and flame wisps with slightly less fine detail. The default.',
    high: 'Full surface detail and flame wisps. Highest GPU cost when a star fills the screen.',
};

const starQualityHint = computed(() => STAR_QUALITY_HINTS[simStore.starQuality]);

function onStarQualityChange(e: Event): void {
    setStarQuality((e.target as HTMLSelectElement).value as StarQuality);
}

/** One-line explanation of what each shadow quality level costs. */
const SHADOW_QUALITY_HINTS: Record<ShadowQuality, string> = {
    off: 'No shadows. Fastest.',
    low: 'Eclipse shadows, plus a shadow for the nearest ship.',
    high: 'Eclipse shadows, plus sharper, softer-edged shadows for up to four nearby ships.',
};

const shadowQualityHint = computed(() => SHADOW_QUALITY_HINTS[simStore.shadowQuality]);

function onShadowQualityChange(e: Event): void {
    setShadowQuality((e.target as HTMLSelectElement).value as ShadowQuality);
}

/** One-line explanation of what each ship collision mode costs. */
const SHIP_COLLISION_HINTS: Record<ShipCollisionMode, string> = {
    triangle:
        'Ships only touch where their hulls are drawn. Can be slow against very detailed ships like the World Destroyer.',
    box: "Each hull is treated as its bounding box. Fast, but ships can bump into the empty space around a hull's shape.",
};

const shipCollisionHint = computed(() => SHIP_COLLISION_HINTS[simStore.shipCollisionMode]);

function onShipCollisionModeChange(e: Event): void {
    setShipCollisionMode((e.target as HTMLSelectElement).value as ShipCollisionMode);
}

function onShowAiDebugChange(e: Event): void {
    setShowAiDebug((e.target as HTMLInputElement).checked);
}

function onAlwaysCloseWithoutAskingChange(e: Event): void {
    setAlwaysCloseWithoutAsking((e.target as HTMLInputElement).checked);
}

function onShowFpsChange(e: Event): void {
    setShowFps((e.target as HTMLInputElement).checked);
}

function onShowRenderInfoChange(e: Event): void {
    setShowRenderInfo((e.target as HTMLInputElement).checked);
}

/** One-line explanation of each distant-body detail level. */
const DISTANT_BODY_DETAIL_HINTS: Record<DistantBodyDetail, string> = {
    low: 'Bodies switch to low-poly spheres and dots early. Fastest with many bodies in view.',
    medium: 'Bodies smaller than a few pixels are drawn as dots, and small ones as low-poly spheres. The default.',
    high: 'Keeps full detail until bodies are very small on screen.',
};

const distantBodyDetailHint = computed(() => DISTANT_BODY_DETAIL_HINTS[simStore.distantBodyDetail]);

function onDistantBodyDetailChange(e: Event): void {
    setDistantBodyDetail((e.target as HTMLSelectElement).value as DistantBodyDetail);
}

/** One-line explanation of each name panel update rate. */
const NAME_PANEL_UPDATE_HINTS: Record<NamePanelUpdateRate, string> = {
    low: 'Distance text updates 4× a second. Fastest with many panels on screen.',
    medium: 'Distance text updates 10× a second. The default.',
    high: 'Distance text updates every frame.',
};

const namePanelUpdateRateHint = computed(
    () => NAME_PANEL_UPDATE_HINTS[simStore.namePanelUpdateRate]
);

function onNamePanelUpdateRateChange(e: Event): void {
    setNamePanelUpdateRate((e.target as HTMLSelectElement).value as NamePanelUpdateRate);
}

/**
 * The render distance spans three decades (0.1–100 AU) and the useful values sit at the low end,
 * so the slider is logarithmic: position 0 = min, position STEPS = max.
 */
const RENDER_DISTANCE_SLIDER_STEPS = 1000;
const RENDER_DISTANCE_RATIO = RENDER_DISTANCE_MAX_AU / RENDER_DISTANCE_MIN_AU;

const renderDistanceSliderPos = computed(() =>
    Math.round(
        (Math.log(simStore.renderDistanceAU / RENDER_DISTANCE_MIN_AU) /
            Math.log(RENDER_DISTANCE_RATIO)) *
            RENDER_DISTANCE_SLIDER_STEPS
    )
);

const renderDistanceLabel = computed(() => {
    const au = simStore.renderDistanceAU;
    return `${au < 10 ? au.toFixed(2) : au.toFixed(1)} AU`;
});

function onRenderDistanceInput(e: Event): void {
    const pos = parseInt((e.target as HTMLInputElement).value, 10);
    const au =
        RENDER_DISTANCE_MIN_AU * RENDER_DISTANCE_RATIO ** (pos / RENDER_DISTANCE_SLIDER_STEPS);
    // Rounded only to keep the stored value tidy; coarser rounding would make the thumb snap
    // visibly at the low end, where one slider step is well under 0.01 AU.
    setRenderDistance(Math.round(au * 10_000) / 10_000);
}

function resetRenderDistance(): void {
    setRenderDistance(RENDER_DISTANCE_DEFAULT_AU);
}

/** True when this platform can use the High tier (desktop build only). */
const highQualityAvailable = isHighQualityTextureAvailable();

/** Why High is unavailable, or a one-line summary of what each tier loads. */
const textureQualityHint = computed(() => {
    if (!highQualityAvailable) {
        return 'High-quality textures are only available in the desktop app; the browser always uses the standard set.';
    }
    return 'High loads the sharpest available asset for each body (8K, else 4K, else standard). Applies immediately.';
});

const textureQualityTitle = computed(() =>
    highQualityAvailable
        ? 'Uses the highest-resolution texture available for each body. Applies immediately without a restart.'
        : 'High-quality textures require the desktop app.'
);

function onTextureQualityChange(e: Event): void {
    setTextureQuality((e.target as HTMLSelectElement).value as TextureQuality);
}

function onSmoothZoomChange(e: Event): void {
    setSmoothZoomEnabled((e.target as HTMLInputElement).checked);
}

function onSubstepsInput(e: Event): void {
    setSubsteps(parseInt((e.target as HTMLInputElement).value, 10));
}

const solverHint = computed(() => SOLVER_HINTS[simStore.physicsSolver]);

function onPhysicsSolverChange(e: Event): void {
    setPhysicsSolver((e.target as HTMLSelectElement).value as PhysicsSolverMode);
}

function onBarnesHutThetaInput(e: Event): void {
    setBarnesHutTheta(parseFloat((e.target as HTMLInputElement).value));
}

function resetBarnesHutTheta(): void {
    setBarnesHutTheta(DEFAULT_BARNES_HUT_THETA);
}

function onSfxVolumeInput(e: Event): void {
    setSfxVolume(parseInt((e.target as HTMLInputElement).value, 10));
}

function onVoiceVolumeInput(e: Event): void {
    setVoiceVolume(parseInt((e.target as HTMLInputElement).value, 10));
}

function onMusicVolumeInput(e: Event): void {
    setMusicVolume(parseInt((e.target as HTMLInputElement).value, 10));
}

function onFrameRateLimitInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const raw = input.value.trim();
    // Blank is treated as unlimited (0).
    if (raw === '') {
        setFrameRateLimit(0);
        return;
    }
    const parsed = parseInt(raw, 10);
    const value = Number.isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), MAX_FRAME_RATE_LIMIT);
    setFrameRateLimit(value);
    // If the typed value was clamped, reflect the stored value back in the field.
    if (raw !== String(value)) {
        input.value = String(value);
    }
}

function resetSubsteps(): void {
    setSubsteps(DEFAULT_SUBSTEPS);
}

function resetSfxVolume(): void {
    setSfxVolume(DEFAULT_SFX_VOLUME_PERCENT);
}

function resetVoiceVolume(): void {
    setVoiceVolume(DEFAULT_VOICE_VOLUME_PERCENT);
}

function resetMusicVolume(): void {
    setMusicVolume(DEFAULT_MUSIC_VOLUME_PERCENT);
}
</script>

<style scoped>
.vue-ui-options {
    flex: 1;
    min-height: 0;
}

.vue-ui-options-fields {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
}

/* Explains the trade-off the selected solver is making, so the choice is not opaque. */
.solver-hint {
    margin: 6px 0 0;
    color: var(--new-ui-color);
    opacity: 0.65;
    font-size: 0.85em;
    line-height: 1.4;
}
</style>
