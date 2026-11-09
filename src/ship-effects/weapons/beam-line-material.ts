import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/**
 * Core/halo width settings shared by the line-drawn beams (laser, lightning). Widths are world
 * units — km divided by `DIST_SCALE` — so beams shrink with distance like the ships firing them.
 */
export interface IBeamLineWidthConfig {
    /** World-unit width of the white-hot core line (km / DIST_SCALE). */
    coreWidth: number;
    /** World-unit width of the coloured halo line (km / DIST_SCALE). */
    haloWidth: number;
    /** Pixel floor for the core; below it the core dims instead of thinning. */
    minCoreWidthPx: number;
    /** Pixel floor for the halo; below it the halo dims instead of thinning. */
    minHaloWidthPx: number;
    /** Pixel ceiling for both lines. */
    maxWidthPx: number;
    /** Lowest opacity multiplier a below-floor beam fades to. */
    minFade: number;
}

/** Defaults for the pixel clamps and fade; ships normally override only the two widths. */
export const DEFAULT_BEAM_LINE_CLAMPS: Pick<
    IBeamLineWidthConfig,
    'minCoreWidthPx' | 'minHaloWidthPx' | 'maxWidthPx' | 'minFade'
> = {
    minCoreWidthPx: 1,
    minHaloWidthPx: 2,
    maxWidthPx: 64,
    minFade: 0.25,
};

/** Options for {@link BeamLineMaterial}. */
export interface IBeamLineMaterialOptions {
    /** Line colour. */
    color: THREE.ColorRepresentation;
    /** Full line width in world units. Drawn width shrinks with depth like any other geometry. */
    worldWidth: number;
    /** The line is never drawn thinner than this many pixels; it dims instead (see `minFade`). */
    minPixels: number;
    /** Upper clamp, so an endpoint right at (or trimmed to) the near plane can't fill the screen. */
    maxPixels: number;
    /**
     * Lowest opacity multiplier a line falling below `minPixels` fades to. The fade is the ratio
     * of the line's true projected width to `minPixels`, so a far beam dims smoothly instead of
     * staying a constant-brightness hairline — but never past this floor, so a distant battle is
     * still visible.
     */
    minFade: number;
}

/**
 * A `LineMaterial` whose width is given in world units instead of screen pixels, with a pixel
 * floor and ceiling — size attenuation for fat lines.
 *
 * Three's own `worldUnits` mode is not used: its fragment shader intersects the view ray with a
 * hard-coded `1e5` length, which is meaningless at this sim's scale (1 unit = 100 km). Instead the
 * screen-space path is kept and its per-vertex pixel width is computed from the world width and
 * that endpoint's view depth. Each endpoint is sized separately, so a long beam tapers in
 * perspective from the near end to the far one.
 */
export class BeamLineMaterial extends LineMaterial {
    constructor(options: IBeamLineMaterialOptions) {
        super({
            color: options.color,
            linewidth: 1,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.uniforms.worldWidth = { value: options.worldWidth };
        this.uniforms.minPixels = { value: options.minPixels };
        this.uniforms.maxPixels = { value: options.maxPixels };
        this.uniforms.minFade = { value: options.minFade };

        this.vertexShader = patch(
            patch(
                this.vertexShader,
                'uniform float linewidth;',
                `uniform float linewidth;
                uniform float worldWidth;
                uniform float minPixels;
                uniform float maxPixels;
                uniform float minFade;
                varying float vWidthFade;`
            ),
            'offset *= linewidth;',
            // clip.w is the view depth under a perspective projection (log depth only rewrites z).
            // World width → pixels: worldWidth * P[1][1] * viewportHeight / (2 * depth).
            `float _depth = max( ( position.y < 0.5 ) ? clipStart.w : clipEnd.w, 1e-12 );
                float _px = worldWidth * projectionMatrix[ 1 ][ 1 ] * resolution.y / ( 2.0 * _depth );
                vWidthFade = max( minFade, min( 1.0, _px / max( minPixels, 1e-6 ) ) );
                offset *= clamp( _px, minPixels, maxPixels );`
        );

        this.fragmentShader = patch(
            patch(
                this.fragmentShader,
                'uniform float linewidth;',
                `uniform float linewidth;
                varying float vWidthFade;`
            ),
            'float alpha = opacity;',
            'float alpha = opacity * vWidthFade;'
        );
    }

    /** Full line width in world units. */
    get worldWidth(): number {
        return this.uniforms.worldWidth.value as number;
    }

    set worldWidth(value: number) {
        this.uniforms.worldWidth.value = value;
    }
}

/** Replace `anchor` in `source`, throwing if three.js no longer contains it. */
function patch(source: string, anchor: string, replacement: string): string {
    if (!source.includes(anchor)) {
        throw new Error(`BeamLineMaterial: shader anchor not found: "${anchor}"`);
    }
    return source.replace(anchor, replacement);
}
