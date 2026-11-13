import type * as THREE from 'three';

/**
 * Which GPU is drawing the frame, for the render-info readout.
 *
 * There is no cross-browser API that names the graphics card directly, so this reads the
 * `WEBGL_debug_renderer_info` extension: in Chromium (the app's Electron shell and any
 * Chromium tab) it returns the GL renderer string ANGLE builds, which embeds vendor, device
 * and backend, e.g.
 *
 *   ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Pro, Unspecified Version)
 *   ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)
 *
 * That string is verbose and not meant for display, so {@link parseGpuRenderer} reduces it to
 * a device name plus a backend tag. Browsers that hide the GPU for fingerprinting answer
 * "WebKit WebGL" / "Mozilla"; those fall through to the unmasked-less GL parameters and are
 * reported honestly as hidden rather than invented.
 */

/** Renderer strings browsers return instead of the real one under fingerprinting protection. */
const MASKED_RENDERER_STRINGS = new Set(['webkit webgl', 'mozilla', 'webgl', 'webkit']);

/** Values ANGLE puts in the version slot that name a graphics backend. */
const KNOWN_BACKENDS = new Set(['d3d9', 'd3d11', 'd3d12', 'vulkan', 'opengl', 'opengles', 'metal']);

/** Device names containing this are a software rasterizer, not a graphics card. */
const SOFTWARE_RASTERIZER_MARKERS = ['swiftshader', 'llvmpipe', 'softpipe', 'basic render driver'];

/** What {@link detectGpuInfo} learned about the hardware drawing the frame. */
export interface IGpuInfo {
    /** One-line label for the render-info panel, e.g. `Apple M3 Pro · Metal`. */
    short: string;
    /** Manufacturer reported by the driver: `Apple`, `NVIDIA`, `Intel`, `AMD`, `Google`… */
    vendor: string;
    /** Device name, e.g. `Apple M3 Pro` or `NVIDIA GeForce RTX 4070`. */
    device: string;
    /** Graphics backend the driver reports: `Metal`, `D3D11`, `Vulkan`, `OpenGL`. */
    backend: string;
    /** Context the renderer is using: `WebGL2`, or `WebGL1` on a legacy fallback. */
    api: string;
    /** The unmasked renderer string exactly as the driver returned it (for bug reports). */
    rawRenderer: string;
    /** False when the browser hid the hardware, so `device` is a placeholder rather than a card. */
    unmasked: boolean;
}

/** A renderer string split into display pieces. */
interface ParsedRenderer {
    vendor: string;
    device: string;
    backend: string;
}

/**
 * Split `text` on commas that are not inside parentheses, so a device name containing
 * parentheses or commas (e.g. `Intel(R) UHD Graphics 630 (0x00003E9B) OpenGL Engine`) stays
 * one piece instead of fragmenting the parsed fields.
 */
function splitTopLevel(text: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth = Math.max(0, depth - 1);
        else if (ch === ',' && depth === 0) {
            parts.push(text.slice(start, i).trim());
            start = i + 1;
        }
    }
    parts.push(text.slice(start).trim());
    return parts;
}

/** Normalise a backend token from the version slot: `D3D11` → `D3D11`, `opengl` → `OpenGL`. */
function normaliseBackend(token: string): string {
    const lower = token.toLowerCase();
    if (lower === 'd3d9') return 'D3D9';
    if (lower === 'd3d10' || lower === 'd3d10_1') return 'D3D10';
    if (lower === 'd3d11') return 'D3D11';
    if (lower === 'd3d12') return 'D3D12';
    if (lower === 'software') return 'Software';
    if (lower === 'vulkan') return 'Vulkan';
    if (lower === 'opengl' || lower === 'opengles') return 'OpenGL';
    if (lower === 'metal') return 'Metal';
    return token;
}

/** Collapse repeated whitespace so splices from the raw string read cleanly. */
function tidy(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
}

/** Cut `description` just before `marker`, returning the trimmed prefix. */
function beforeMarker(description: string, marker: string): string {
    const index = description.indexOf(marker);
    return index > 0 ? tidy(description.slice(0, index)) : '';
}

/**
 * Parse an ANGLE renderer description (`<device> Metal Renderer: <device>` etc.) into a
 * device name and backend. Returns null when the description carries neither, so the caller
 * can fall back to treating the whole string as a device name.
 */
function parseAngleDescription(description: string): ParsedRenderer | null {
    const metalMarker = /Metal Renderer:\s*/i.exec(description);
    if (metalMarker) {
        return {
            vendor: '',
            device: tidy(description.slice(metalMarker.index + metalMarker[0].length)),
            backend: 'Metal',
        };
    }

    const direct3d = /Direct3D(9|10(?:_1)?|11|12)/i.exec(description);
    if (direct3d) {
        return {
            vendor: '',
            device: beforeMarker(description, direct3d[0]),
            backend: normaliseBackend(`D3D${direct3d[1]}`),
        };
    }

    const vulkan = /^Vulkan\b/i.exec(description);
    if (vulkan) {
        // "Vulkan 1.3.0 (NVIDIA GeForce RTX 4070 (0x2860))" → the parenthesised device name.
        const inner = /\(([^()]*(?:\([^()]*\)[^()]*)*)\)/.exec(description);
        const device = inner ? tidy(inner[1]).replace(/\s*\(0x[0-9a-f]+\)$/i, '') : '';
        return { vendor: '', device, backend: 'Vulkan' };
    }

    if (/\bOpenGL ES\b/i.test(description)) {
        return { vendor: '', device: beforeMarker(description, 'OpenGL ES'), backend: 'OpenGL' };
    }
    if (/\bOpenGL\b/i.test(description)) {
        return { vendor: '', device: beforeMarker(description, 'OpenGL'), backend: 'OpenGL' };
    }

    return null;
}

/**
 * Reduce a GL renderer string to a vendor, device name and backend.
 *
 * Handles the ANGLE strings Chromium emits, the plain names other browsers report
 * (`Apple GPU`, `Apple M3 Pro`) and the software rasterizers that show up when hardware
 * acceleration is off.
 */
export function parseGpuRenderer(rawRenderer: string): ParsedRenderer {
    const raw = tidy(rawRenderer);
    const angle = /^ANGLE\s*\((.*)\)$/i.exec(raw);
    if (angle) {
        const parts = splitTopLevel(angle[1]);
        const vendor = parts[0] ?? '';
        const description = parts[1] ?? '';
        const parsed = parseAngleDescription(description);
        if (parsed) {
            return { vendor, device: parsed.device || vendor, backend: parsed.backend };
        }
        // Fall back to the version slot, which carries the backend on some ANGLE builds.
        const versionSlot = parts.slice(2).join(', ');
        const backend = KNOWN_BACKENDS.has(versionSlot.toLowerCase())
            ? normaliseBackend(versionSlot)
            : '';
        return { vendor, device: description || vendor, backend };
    }

    const lower = raw.toLowerCase();
    if (SOFTWARE_RASTERIZER_MARKERS.some((marker) => lower.includes(marker))) {
        return { vendor: 'Google', device: raw, backend: 'Software' };
    }
    if (lower.startsWith('apple')) {
        return { vendor: 'Apple', device: raw, backend: 'Metal' };
    }
    return { vendor: '', device: raw, backend: '' };
}

/** Join the non-empty pieces of `label` with `separator`. */
function joinParts(pieces: string[], separator: string): string {
    return pieces.filter((piece) => piece.length > 0).join(separator);
}

/**
 * Read the GPU out of a live renderer.
 *
 * Call this **once** and cache the result: `getParameter` can force a pipeline flush, so it
 * must never run inside the frame loop. Re-run it only after a context restore, which can
 * land on a different GPU on a multi-GPU machine.
 */
export function detectGpuInfo(renderer: THREE.WebGLRenderer): IGpuInfo {
    const gl = renderer.getContext() as WebGLRenderingContext | WebGL2RenderingContext;
    const api = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext
        ? 'WebGL2'
        : 'WebGL1';

    let vendor = '';
    let rawRenderer = '';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
        vendor = String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) ?? '');
        rawRenderer = String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? '');
    }

    // Without the extension (or with the string masked) the best honest answer is the
    // context API. Short-circuit before parsing so "WebKit WebGL" is never shown as a card.
    if (!rawRenderer || MASKED_RENDERER_STRINGS.has(rawRenderer.trim().toLowerCase())) {
        return {
            short: `${api} · GPU hidden`,
            vendor: tidy(vendor),
            device: '',
            backend: '',
            api,
            rawRenderer: tidy(rawRenderer),
            unmasked: false,
        };
    }

    const parsed = parseGpuRenderer(rawRenderer);
    const device = tidy(parsed.device);
    const backend = tidy(parsed.backend);
    const short = joinParts([device || 'Unknown GPU', backend], ' · ');

    return {
        short,
        vendor: tidy(parsed.vendor || vendor),
        device,
        backend,
        api,
        rawRenderer: tidy(rawRenderer),
        unmasked: true,
    };
}
