import * as THREE from 'three';

/** Construction options for MissileSmoke. */
export interface IMissileSmokeOptions {
    /** Maximum live puffs. When full, the oldest puff is recycled for a new one. */
    capacity: number;
    /** Colour of cooled smoke. */
    color: number;
    /** Colour of freshly emitted (hot) exhaust, fading to `color` early in a puff's life. */
    hotColor: number;
    /** Wall-clock seconds each puff lives. */
    lifetime: number;
    /** Puff width at emission (world units). */
    size: number;
    /** Width multiplier a puff reaches by the end of its life. */
    growth: number;
    /** Peak opacity of a puff. */
    opacity: number;
}

/** Fraction of a puff's life spent fading from `hotColor` to `color`. */
const HOT_FRACTION = 0.12;
/** Wall seconds over which a new puff fades in. */
const FADE_IN = 0.05;
/** Puff length as a multiple of the gap to its neighbour, so stretched puffs overlap. */
const OVERLAP = 1.6;
/** Puffs are never drawn thinner than this many pixels; their alpha drops instead. */
const MIN_PIXELS = 1.5;

const _dir = new THREE.Vector3();

/**
 * Pseudo-volumetric smoke trail for missiles: camera-facing noise puffs that grow and fade
 * on wall-clock time. Puffs are emitted by distance along each frame's travel segment, and
 * each one stretches along the missile's heading to cover the gap to its neighbour — dense,
 * round puffs while a missile is slow, a continuous streak once it covers tens of km per frame.
 *
 * Puffs live in a ring buffer independent of any missile, so a trail keeps fading after its
 * missile hits or expires. Positions are float64 and uploaded camera-relative each frame
 * (as MissileWeapon does), sorted back-to-front for normal alpha blending.
 *
 * Rendered as one instanced quad per puff through a MeshBasicMaterial patched with
 * onBeforeCompile, which keeps three's logarithmic-depth chunks intact.
 */
export class MissileSmoke {
    private readonly opts: IMissileSmokeOptions;
    private readonly capacity: number;

    // ── Ring buffer (struct of arrays, indexed by pool slot) ─────────────────
    private readonly px: Float64Array;
    private readonly py: Float64Array;
    private readonly pz: Float64Array;
    private readonly dx: Float32Array;
    private readonly dy: Float32Array;
    private readonly dz: Float32Array;
    private readonly age: Float32Array;
    /** Stretch length at emission — the gap to the neighbouring puff × OVERLAP. */
    private readonly len0: Float32Array;
    private readonly seed: Float32Array;
    /** Oldest live slot. */
    private tail = 0;
    private count = 0;

    // ── Back-to-front sort scratch ───────────────────────────────────────────
    private readonly distSq: Float64Array;
    private readonly order: number[] = [];
    private readonly byDistanceDesc = (a: number, b: number): number =>
        this.distSq[b] - this.distSq[a];

    // ── Rendering ────────────────────────────────────────────────────────────
    private readonly geometry: THREE.InstancedBufferGeometry;
    private readonly material: THREE.MeshBasicMaterial;
    private readonly mesh: THREE.Mesh;
    private readonly offsetAttr: THREE.InstancedBufferAttribute;
    private readonly dirAttr: THREE.InstancedBufferAttribute;
    /** x width, y length, z alpha, w heat. */
    private readonly paramsAttr: THREE.InstancedBufferAttribute;
    /** x seed (0..1), y life fraction (0..1). */
    private readonly seedAgeAttr: THREE.InstancedBufferAttribute;
    private readonly instanceAttrs: THREE.InstancedBufferAttribute[];
    private readonly viewportHeight = { value: window.innerHeight };
    private readonly onResize: () => void;

    constructor(
        private readonly scene: THREE.Scene,
        options: IMissileSmokeOptions
    ) {
        this.opts = options;
        const cap = Math.max(1, Math.floor(options.capacity));
        this.capacity = cap;

        this.px = new Float64Array(cap);
        this.py = new Float64Array(cap);
        this.pz = new Float64Array(cap);
        this.dx = new Float32Array(cap);
        this.dy = new Float32Array(cap);
        this.dz = new Float32Array(cap);
        this.age = new Float32Array(cap);
        this.len0 = new Float32Array(cap);
        this.seed = new Float32Array(cap);
        this.distSq = new Float64Array(cap);

        // ── Instanced unit quad ───────────────────────────────────────────────
        const quad = new THREE.PlaneGeometry(1, 1);
        this.geometry = new THREE.InstancedBufferGeometry();
        this.geometry.index = quad.index;
        this.geometry.setAttribute('position', quad.getAttribute('position'));

        const makeAttr = (itemSize: number): THREE.InstancedBufferAttribute => {
            const attr = new THREE.InstancedBufferAttribute(
                new Float32Array(cap * itemSize),
                itemSize
            );
            attr.setUsage(THREE.DynamicDrawUsage);
            return attr;
        };
        this.offsetAttr = makeAttr(3);
        this.dirAttr = makeAttr(3);
        this.paramsAttr = makeAttr(4);
        this.seedAgeAttr = makeAttr(2);
        this.geometry.setAttribute('aOffset', this.offsetAttr);
        this.geometry.setAttribute('aDir', this.dirAttr);
        this.geometry.setAttribute('aParams', this.paramsAttr);
        this.geometry.setAttribute('aSeedAge', this.seedAgeAttr);
        this.instanceAttrs = [this.offsetAttr, this.dirAttr, this.paramsAttr, this.seedAgeAttr];
        this.geometry.instanceCount = 0;

        this.material = new THREE.MeshBasicMaterial({
            color: options.color,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
        });
        const hotColor = { value: new THREE.Color(options.hotColor) };
        const viewportHeight = this.viewportHeight;
        this.material.onBeforeCompile = (shader) => {
            shader.uniforms.uHotColor = hotColor;
            shader.uniforms.uViewportHeight = viewportHeight;
            shader.uniforms.uMinPixels = { value: MIN_PIXELS };

            shader.vertexShader =
                `attribute vec3 aOffset;
                attribute vec3 aDir;
                attribute vec4 aParams;
                attribute vec2 aSeedAge;
                uniform float uViewportHeight;
                uniform float uMinPixels;
                varying vec2 vQuad;
                varying float vAlpha;
                varying float vHeat;
                varying vec2 vSeedAge;
                ` + shader.vertexShader;
            // Billboard: centre at aOffset, long axis along the heading projected on screen.
            shader.vertexShader = shader.vertexShader.replace(
                '#include <project_vertex>',
                `vec4 mvPosition = modelViewMatrix * vec4( aOffset, 1.0 );
                float _depth = max( -mvPosition.z, 1e-9 );
                float _px = 2.0 * _depth / ( projectionMatrix[1][1] * uViewportHeight );
                float _w = max( aParams.x, uMinPixels * _px );
                vec2 _ax = ( modelViewMatrix * vec4( aDir, 0.0 ) ).xy;
                float _l = length( _ax );
                float _ang = aSeedAge.x * 6.2831853;
                _ax = _l > 1e-4 ? _ax / _l : vec2( cos( _ang ), sin( _ang ) );
                float _len = max( _w, aParams.y * _l );
                mvPosition.xy += _ax * position.x * _len + vec2( -_ax.y, _ax.x ) * position.y * _w;
                gl_Position = projectionMatrix * mvPosition;
                vQuad = position.xy;
                vHeat = aParams.w;
                vSeedAge = aSeedAge;
                // Sub-pixel puffs are widened and dimmed; puffs at the camera fade out.
                vAlpha = aParams.z * sqrt( aParams.x / _w )
                       * smoothstep( _w * 0.5, _w * 2.0, -mvPosition.z );`
            );

            shader.fragmentShader =
                `uniform vec3 uHotColor;
                varying vec2 vQuad;
                varying float vAlpha;
                varying float vHeat;
                varying vec2 vSeedAge;
                float smokeHash( vec2 p ) {
                    return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
                }
                float smokeNoise( vec2 p ) {
                    vec2 i = floor( p );
                    vec2 f = fract( p );
                    vec2 u = f * f * ( 3.0 - 2.0 * f );
                    return mix(
                        mix( smokeHash( i ), smokeHash( i + vec2( 1.0, 0.0 ) ), u.x ),
                        mix( smokeHash( i + vec2( 0.0, 1.0 ) ), smokeHash( i + vec2( 1.0, 1.0 ) ), u.x ),
                        u.y );
                }
                float smokeFbm( vec2 p ) {
                    float v = 0.0;
                    float a = 0.5;
                    for ( int i = 0; i < 3; i++ ) {
                        v += a * smokeNoise( p );
                        p *= 2.03;
                        a *= 0.5;
                    }
                    return v / 0.875;
                }
                ` + shader.fragmentShader;
            // Noise-eroded round puff, hot-tinted while young.
            shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>',
                `#include <color_fragment>
                float _r = length( vQuad ) * 2.0;
                if ( _r >= 1.0 ) discard;
                float _n = smokeFbm( vQuad * 3.5 + vSeedAge.x * vec2( 17.3, 41.7 ) + vSeedAge.y * 0.8 );
                float _density = 1.0 - smoothstep( 0.0, 1.0, _r + ( _n - 0.5 ) * 0.8 );
                diffuseColor.rgb = mix( diffuseColor.rgb * mix( 0.7, 1.15, _n ), uHotColor, vHeat );
                diffuseColor.a *= _density * _density * vAlpha;`
            );
        };

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.mesh.frustumCulled = false;
        this.mesh.renderOrder = 1; // under the exhaust glow (2)
        this.mesh.visible = false;
        scene.add(this.mesh);

        this.onResize = () => {
            this.viewportHeight.value = window.innerHeight;
        };
        window.addEventListener('resize', this.onResize);
    }

    /** True while any puff is still visible. */
    get hasLive(): boolean {
        return this.count > 0;
    }

    /**
     * Emit `n` puffs evenly along the segment `from` → `to` (excluding `from`, which the
     * previous emission ended on). Puffs nearer `from` are aged by their share of `wallDt`
     * so a trail laid down in one frame doesn't appear all at once.
     */
    emit(from: THREE.Vector3, to: THREE.Vector3, n: number, wallDt: number): void {
        if (n < 1) return;
        _dir.subVectors(to, from);
        const segLen = _dir.length();
        if (segLen > 0) _dir.divideScalar(segLen);
        const len = (segLen / n) * OVERLAP;

        for (let k = 1; k <= n; k++) {
            if (this.count === this.capacity) {
                this.tail = (this.tail + 1) % this.capacity;
                this.count--;
            }
            const i = (this.tail + this.count) % this.capacity;
            this.count++;

            const f = k / n;
            this.px[i] = from.x + (to.x - from.x) * f;
            this.py[i] = from.y + (to.y - from.y) * f;
            this.pz[i] = from.z + (to.z - from.z) * f;
            this.dx[i] = _dir.x;
            this.dy[i] = _dir.y;
            this.dz[i] = _dir.z;
            this.age[i] = (1 - f) * wallDt;
            this.len0[i] = len;
            this.seed[i] = Math.random();
        }
    }

    /**
     * Age and expire puffs, then upload them camera-relative and sorted back-to-front.
     * @param isPaused Freezes ageing so the trail holds while the sim is paused.
     */
    update(wallDt: number, cameraPosition: THREE.Vector3, isPaused: boolean): void {
        const { lifetime, size, growth, opacity } = this.opts;
        const cap = this.capacity;

        if (!isPaused) {
            for (let k = 0; k < this.count; k++) this.age[(this.tail + k) % cap] += wallDt;
        }
        while (this.count > 0 && this.age[this.tail] >= lifetime) {
            this.tail = (this.tail + 1) % cap;
            this.count--;
        }

        const count = this.count;
        if (count === 0) {
            this.geometry.instanceCount = 0;
            this.mesh.visible = false;
            return;
        }

        const cpx = cameraPosition.x;
        const cpy = cameraPosition.y;
        const cpz = cameraPosition.z;
        const order = this.order;
        order.length = count;
        for (let k = 0; k < count; k++) {
            const i = (this.tail + k) % cap;
            const rx = this.px[i] - cpx;
            const ry = this.py[i] - cpy;
            const rz = this.pz[i] - cpz;
            this.distSq[i] = rx * rx + ry * ry + rz * rz;
            order[k] = i;
        }
        order.sort(this.byDistanceDesc);

        const offset = this.offsetAttr.array as Float32Array;
        const dir = this.dirAttr.array as Float32Array;
        const params = this.paramsAttr.array as Float32Array;
        const seedAge = this.seedAgeAttr.array as Float32Array;

        for (let k = 0; k < count; k++) {
            const i = order[k];
            const age = this.age[i];
            const t = Math.min(1, age / lifetime);
            const inv = 1 - t;
            // Ease-out growth: billows quickly, then slows.
            const width = size * (1 + (growth - 1) * (1 - inv * inv));
            const heat = Math.max(0, 1 - t / HOT_FRACTION);

            offset[k * 3] = this.px[i] - cpx;
            offset[k * 3 + 1] = this.py[i] - cpy;
            offset[k * 3 + 2] = this.pz[i] - cpz;
            dir[k * 3] = this.dx[i];
            dir[k * 3 + 1] = this.dy[i];
            dir[k * 3 + 2] = this.dz[i];
            params[k * 4] = width;
            params[k * 4 + 1] = this.len0[i] + (width - size);
            params[k * 4 + 2] = opacity * Math.min(1, age / FADE_IN) * Math.pow(inv, 1.5);
            params[k * 4 + 3] = heat * heat;
            seedAge[k * 2] = this.seed[i];
            seedAge[k * 2 + 1] = t;
        }

        for (const attr of this.instanceAttrs) {
            attr.clearUpdateRanges();
            attr.addUpdateRange(0, count * attr.itemSize);
            attr.needsUpdate = true;
        }
        this.geometry.instanceCount = count;
        this.mesh.position.copy(cameraPosition);
        this.mesh.visible = true;
    }

    /** Drop every puff immediately. */
    reset(): void {
        this.tail = 0;
        this.count = 0;
        this.geometry.instanceCount = 0;
        this.mesh.visible = false;
    }

    dispose(): void {
        window.removeEventListener('resize', this.onResize);
        this.scene.remove(this.mesh);
        this.geometry.dispose();
        this.material.dispose();
        this.count = 0;
    }
}
