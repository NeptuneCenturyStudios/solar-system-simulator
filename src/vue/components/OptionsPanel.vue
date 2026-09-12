<template>
    <PanelBase title="Options">
        <div class="vue-ui-options-fields">
            <div class="vue-ui-card-header">Graphics</div>

            <label class="checkbox-row">
                <input
                    type="checkbox"
                    :checked="simStore.particleEffectsEnabled"
                    @change="onParticleEffectsChange"
                />
                Enable Particle Effects
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
                    :checked="simStore.showAiDebug"
                    @change="onShowAiDebugChange"
                />
                Show Ship AI Debug
            </label>

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
                        <span class="material-symbols-outlined">replay</span>
                    </button>
                </div>
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
                        <span class="material-symbols-outlined">replay</span>
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
                        title="Controls the volume of weapon sounds, impacts, and warp loop effects."
                        @input="onSfxVolumeInput"
                    />
                    <button
                        class="old-ui btn-slider-reset"
                        title="Reset to 100%"
                        @click="resetSfxVolume"
                    >
                        <span class="material-symbols-outlined">replay</span>
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
                        <span class="material-symbols-outlined">replay</span>
                    </button>
                </div>
            </div>
        </div>
    </PanelBase>
</template>

<script setup lang="ts">
import { computed } from 'vue';

import {
    setAuroraDetail,
    setAuroraEnabled,
    setBarnesHutTheta,
    setFrameRateLimit,
    setLensflareEnabled,
    setMusicVolume,
    setParticleEffectsEnabled,
    setPhysicsSolver,
    setSfxVolume,
    setShowAiDebug,
    setSubsteps,
    simStore,
} from '../sim-bridge';
import type { AuroraDetailMode, PhysicsSolverMode } from '../../settings/settings-store';

import PanelBase from './PanelBase.vue';

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
const DEFAULT_SFX_VOLUME_PERCENT = 100;
const DEFAULT_MUSIC_VOLUME_PERCENT = 50;
/** Max frame-rate-limit value the Options panel permits. */
const MAX_FRAME_RATE_LIMIT = 240;

function onParticleEffectsChange(e: Event): void {
    setParticleEffectsEnabled((e.target as HTMLInputElement).checked);
}

function onLensflareChange(e: Event): void {
    setLensflareEnabled((e.target as HTMLInputElement).checked);
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

function onShowAiDebugChange(e: Event): void {
    setShowAiDebug((e.target as HTMLInputElement).checked);
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
