import * as THREE from 'three';
import { CLOUD_COMMON_GLSL, type CloudUniforms } from './cloud-coverage-glsl';

/** Most rays one cloud layer is probed with per frame (one per star in view). */
const PROBE_RAYS = 16;
/** Most cloud layers probed per frame. Layers past this keep their last values. */
const PROBE_LAYERS = 16;
/** Samples along each ray through the deck. */
const PROBE_SAMPLES = 32;

/**
 * What the probe needs from a cloud layer: a material that marches that layer's clouds (built by
 * createCloudProbeMaterial from the layer's own uniforms) and the object whose space has the
 * cloud top at radius 1.
 */
export interface ICloudProbeSource {
    readonly material: THREE.ShaderMaterial;
    readonly object: THREE.Object3D;
}

type ProbeUniforms = {
    uRayOrigin: THREE.IUniform<THREE.Vector3[]>;
    uRayDir: THREE.IUniform<THREE.Vector3[]>;
};

/**
 * A material that writes, for pixel x of the row it is drawn into, how much light gets through
 * the cloud deck along ray x (uRayOrigin/uRayDir, object space). It shares the layer's uniform
 * objects, so it always measures exactly the clouds being drawn: same GLSL, same values.
 */
export function createCloudProbeMaterial(uniforms: CloudUniforms): THREE.ShaderMaterial {
    const probe: ProbeUniforms = { uRayOrigin: { value: [] }, uRayDir: { value: [] } };
    for (let i = 0; i < PROBE_RAYS; i++) {
        probe.uRayOrigin.value.push(new THREE.Vector3());
        probe.uRayDir.value.push(new THREE.Vector3(1, 0, 0));
    }
    return new THREE.ShaderMaterial({
        name: 'CloudTransmittanceProbe',
        uniforms: { ...uniforms, ...probe },
        vertexShader: /* glsl */ `
            void main() {
                gl_Position = vec4(position.xy, 0.0, 1.0);
            }
        `,
        fragmentShader: /* glsl */ `
            #include <common>
            ${CLOUD_COMMON_GLSL}
            uniform vec3 uRayOrigin[${PROBE_RAYS}];
            uniform vec3 uRayDir[${PROBE_RAYS}];

            void main() {
                int i = clamp(int(gl_FragCoord.x), 0, ${PROBE_RAYS - 1});
                float t = cloudLineTransmittance(uRayOrigin[i], uRayDir[i], ${PROBE_SAMPLES});
                gl_FragColor = vec4(t, 0.0, 0.0, 1.0);
            }
        `,
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
    });
}

interface IResult {
    /** Last read-back transmittance, or null while the first measurement is in flight. */
    value: number | null;
    /** Probe frame the line was last asked about, to drop stale entries. */
    frame: number;
}

interface IQueuedLayer {
    source: ICloudProbeSource;
    starIds: string[];
}

interface ISlot {
    source: ICloudProbeSource;
    starId: string;
}

const _layerPos = new THREE.Vector3();
const _seg = new THREE.Vector3();
const _toLayer = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _invWorld = new THREE.Matrix4();
const _ro = new THREE.Vector3();
const _rd = new THREE.Vector3();

/**
 * Measures how much of a star's light gets through cloud layers on the GPU, with the same
 * cloud GLSL the layers are drawn with, and reads the answers back asynchronously.
 *
 * Each frame: `query` for every line of sight (returns the last answer, null until the first one
 * arrives), then `flush` once to draw the queued rays (one pixel each, one row per layer) and
 * start the readback. Answers arrive one to a few frames later; callers ease them anyway.
 */
export class CloudTransmittanceProbe {
    private readonly _target = new THREE.WebGLRenderTarget(PROBE_RAYS, PROBE_LAYERS, {
        format: THREE.RGBAFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        generateMipmaps: false,
    });
    private readonly _scene = new THREE.Scene();
    private readonly _camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    private readonly _quad: THREE.Mesh;
    private readonly _pixels = new Uint8Array(PROBE_RAYS * PROBE_LAYERS * 4);

    private readonly _results = new Map<ICloudProbeSource, Map<string, IResult>>();
    private readonly _queue: IQueuedLayer[] = [];
    /** Which line each pixel of the in-flight readback belongs to, by row then column. */
    private _slots: ISlot[][] = [];
    private _pending = false;
    private _frame = 0;
    private _disposed = false;

    constructor() {
        this._quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
        this._quad.frustumCulled = false;
        this._scene.add(this._quad);
    }

    /**
     * Fraction (0..1) of light that gets through `source`'s clouds on the straight line from
     * `from` to `to` (world space), as last measured; 1 when the line misses the layer, null
     * when it has not been measured yet. Queues the line for the next `flush`.
     */
    query(
        source: ICloudProbeSource,
        starId: string,
        from: THREE.Vector3,
        to: THREE.Vector3
    ): number | null {
        // Cheap reject: the segment never comes within the cloud top's radius.
        const matrix = source.object.matrixWorld;
        _layerPos.setFromMatrixPosition(matrix);
        const cloudTop = matrix.getMaxScaleOnAxis();
        _seg.copy(to).sub(from);
        const segLen = _seg.length();
        if (segLen <= 0) return 1;
        _seg.divideScalar(segLen);
        _toLayer.copy(_layerPos).sub(from);
        const along = THREE.MathUtils.clamp(_toLayer.dot(_seg), 0, segLen);
        _closest.copy(_seg).multiplyScalar(along).add(from);
        if (_closest.distanceToSquared(_layerPos) >= cloudTop * cloudTop) return 1;

        let layer = this._results.get(source);
        if (!layer) {
            layer = new Map();
            this._results.set(source, layer);
        }
        let result = layer.get(starId);
        if (!result) {
            result = { value: null, frame: this._frame };
            layer.set(starId, result);
        }
        result.frame = this._frame;

        if (!this._pending) this._enqueue(source, starId, from, to);
        return result.value;
    }

    /** Draws the queued rays and starts reading them back. Call once per frame, after `query`. */
    flush(renderer: THREE.WebGLRenderer): void {
        this._prune();
        this._frame++;
        const queue = this._queue;
        if (this._pending || queue.length === 0) {
            queue.length = 0;
            return;
        }

        const prevTarget = renderer.getRenderTarget();
        const prevAutoClear = renderer.autoClear;
        renderer.autoClear = false;

        const slots: ISlot[][] = [];
        for (let row = 0; row < queue.length; row++) {
            const { source, starIds } = queue[row];
            this._target.viewport.set(0, row, starIds.length, 1);
            renderer.setRenderTarget(this._target);
            this._quad.material = source.material;
            renderer.render(this._scene, this._camera);
            slots.push(starIds.map((starId) => ({ source, starId })));
        }

        renderer.setRenderTarget(prevTarget);
        renderer.autoClear = prevAutoClear;
        queue.length = 0;

        this._slots = slots;
        this._pending = true;
        renderer
            .readRenderTargetPixelsAsync(this._target, 0, 0, PROBE_RAYS, PROBE_LAYERS, this._pixels)
            .then(() => this._store())
            .catch(() => {
                // Lost context or similar: keep the last answers and try again next frame.
            })
            .finally(() => {
                this._pending = false;
            });
    }

    dispose(): void {
        this._disposed = true;
        this._target.dispose();
        this._quad.geometry.dispose();
        this._results.clear();
        this._queue.length = 0;
        this._slots = [];
    }

    /** Puts a ray into `source`'s row, in the layer's object space (cloud top = unit sphere). */
    private _enqueue(
        source: ICloudProbeSource,
        starId: string,
        from: THREE.Vector3,
        to: THREE.Vector3
    ): void {
        let entry = this._queue.find((q) => q.source === source);
        if (!entry) {
            if (this._queue.length >= PROBE_LAYERS) return;
            entry = { source, starIds: [] };
            this._queue.push(entry);
        }
        const index = entry.starIds.length;
        if (index >= PROBE_RAYS) return;
        entry.starIds.push(starId);

        _invWorld.copy(source.object.matrixWorld).invert();
        _ro.copy(from).applyMatrix4(_invWorld);
        _rd.copy(to).applyMatrix4(_invWorld).sub(_ro).normalize();
        const uniforms = source.material.uniforms as unknown as ProbeUniforms;
        uniforms.uRayOrigin.value[index].copy(_ro);
        uniforms.uRayDir.value[index].copy(_rd);
    }

    /** Copies the finished readback into the results. */
    private _store(): void {
        if (this._disposed) return;
        for (let row = 0; row < this._slots.length; row++) {
            const slots = this._slots[row];
            for (let x = 0; x < slots.length; x++) {
                const { source, starId } = slots[x];
                // Lines no longer asked about were pruned meanwhile; don't bring them back.
                const result = this._results.get(source)?.get(starId);
                if (result) result.value = this._pixels[(row * PROBE_RAYS + x) * 4] / 255;
            }
        }
        this._slots = [];
    }

    /** Drops lines that were not asked about this frame. */
    private _prune(): void {
        for (const [source, layer] of this._results) {
            for (const [starId, result] of layer) {
                if (result.frame !== this._frame) layer.delete(starId);
            }
            if (layer.size === 0) this._results.delete(source);
        }
    }
}
