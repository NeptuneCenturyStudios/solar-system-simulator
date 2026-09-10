import { BH_MAX_DEPTH, BH_THETA_DEFAULT } from '../../utilities/consts';
import { IBodyArrays } from './store-view';
import {
    INBodySolver,
    PhysicsSolverMode,
    accumulateExactTargets,
    clearAccelerations,
    zeroStaticAccelerations,
} from './solver';

/** No children yet / no body here. */
const EMPTY = -1;

/**
 * Barnes-Hut octree gravity, O(N log N).
 *
 * Distant groups of bodies are collapsed into a single point mass at their centre of mass
 * whenever `nodeWidth / distance < theta`, trading a bounded, tunable error for a
 * logarithmic rather than linear number of interactions per body.
 *
 * This is the right solver when mass is spread evenly across many bodies — star clusters,
 * collapsing clouds — where there is no dominant-mass hierarchy to exploit. It is
 * deliberately *not* the default: in a star-dominated system the multipole error on the
 * dominant central term is larger than the error the cutoff solver incurs by dropping
 * dust-on-dust forces entirely.
 *
 * Everything is held in flat typed arrays and the traversal uses an explicit stack, so a
 * frame costs no allocations and no recursion regardless of body count.
 */
export class BarnesHutSolver implements INBodySolver {
    readonly mode: PhysicsSolverMode = 'barnes-hut';

    /** Opening angle. Lower is more accurate and slower; 0 degenerates to exact all-pairs. */
    theta = BH_THETA_DEFAULT;

    // --- node arrays ---
    /** 8 child slots per node, each a node index or EMPTY. */
    private children = new Int32Array(0);
    private comX = new Float64Array(0);
    private comY = new Float64Array(0);
    private comZ = new Float64Array(0);
    private nodeMass = new Float64Array(0);
    private centerX = new Float64Array(0);
    private centerY = new Float64Array(0);
    private centerZ = new Float64Array(0);
    /** Half-width of the node's cube. */
    private half = new Float64Array(0);
    /** Head of this leaf's body chain, or EMPTY. Internal nodes always hold EMPTY. */
    private bodyHead = new Int32Array(0);
    /**
     * One bit per occupied octant. Lets the hot traversal test `mask === 0` for leaf-ness and
     * visit only existing children, instead of scanning all 8 child slots at every node.
     */
    private childMask = new Uint8Array(0);

    private nodeCapacity = 0;
    private nodeCount = 0;

    /** Next-body links, forming per-leaf chains. Indexed by body slot. */
    private nextBody = new Int32Array(0);

    /** Traversal stack of node indices. */
    private stack = new Int32Array(0);

    /** Nodes in push order, walked backwards to get a post-order pass without recursion. */
    private visitOrder = new Int32Array(0);

    computeAccelerations(store: IBodyArrays, gEff: number, eps2: number): void {
        const { count } = store;

        clearAccelerations(store);

        if (count === 0) return;

        if (this.nextBody.length < count) {
            this.nextBody = new Int32Array(Math.max(64, Math.ceil(count * 1.5)));
        }

        this.build(store);
        this.traverse(store, gEff, eps2);

        accumulateExactTargets(store, gEff, eps2);
        zeroStaticAccelerations(store);
    }

    // ── tree construction ───────────────────────────────────────────────────

    private ensureNodeCapacity(needed: number): void {
        if (needed <= this.nodeCapacity) return;

        const next = Math.max(128, Math.ceil(needed * 1.5));

        const children = new Int32Array(next * 8);
        children.set(this.children);
        // Newly added slots must read as EMPTY, not 0 (which is a valid node index).
        children.fill(EMPTY, this.nodeCapacity * 8);
        this.children = children;

        const grow64 = (src: Float64Array): Float64Array<ArrayBuffer> => {
            const dst = new Float64Array(next);
            dst.set(src);
            return dst;
        };

        this.comX = grow64(this.comX);
        this.comY = grow64(this.comY);
        this.comZ = grow64(this.comZ);
        this.nodeMass = grow64(this.nodeMass);
        this.centerX = grow64(this.centerX);
        this.centerY = grow64(this.centerY);
        this.centerZ = grow64(this.centerZ);
        this.half = grow64(this.half);

        const bodyHead = new Int32Array(next);
        bodyHead.set(this.bodyHead);
        bodyHead.fill(EMPTY, this.nodeCapacity);
        this.bodyHead = bodyHead;

        const childMask = new Uint8Array(next);
        childMask.set(this.childMask);
        this.childMask = childMask;

        // A depth-first traversal can hold up to 7 siblings per level plus the current node,
        // which for a shallow tree over few bodies exceeds the node count itself. Size the
        // stack for the worst case as well as for the tree — overflowing an Int32Array
        // silently drops the write, which would quietly corrupt the force sum.
        const stackNeeded = Math.max(next, 8 * BH_MAX_DEPTH + 16);
        this.stack = new Int32Array(stackNeeded);
        this.visitOrder = new Int32Array(next);

        this.nodeCapacity = next;
    }

    private newNode(cx: number, cy: number, cz: number, halfWidth: number): number {
        // A node can spawn up to 8 children, so keep headroom to avoid reallocating mid-insert.
        this.ensureNodeCapacity(this.nodeCount + 9);

        const n = this.nodeCount++;
        const base = n * 8;
        for (let k = 0; k < 8; k++) this.children[base + k] = EMPTY;

        this.centerX[n] = cx;
        this.centerY[n] = cy;
        this.centerZ[n] = cz;
        this.half[n] = halfWidth;

        this.comX[n] = 0;
        this.comY[n] = 0;
        this.comZ[n] = 0;
        this.nodeMass[n] = 0;
        this.bodyHead[n] = EMPTY;
        this.childMask[n] = 0;

        return n;
    }

    private build(store: IBodyArrays): void {
        const { px, py, pz, mass, count } = store;

        this.nodeCount = 0;

        // Bounding cube over all bodies.
        let minX = Infinity;
        let minY = Infinity;
        let minZ = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        let maxZ = -Infinity;

        for (let i = 0; i < count; i++) {
            const x = px[i];
            const y = py[i];
            const z = pz[i];
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (z < minZ) minZ = z;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
            if (z > maxZ) maxZ = z;
        }

        const cx = (minX + maxX) * 0.5;
        const cy = (minY + maxY) * 0.5;
        const cz = (minZ + maxZ) * 0.5;

        // Pad so bodies exactly on the boundary still land inside the root.
        const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
        const rootHalf = Math.max(extent * 0.5 * 1.0001, 1e-6);

        this.ensureNodeCapacity(count * 2 + 16);
        const root = this.newNode(cx, cy, cz, rootHalf);

        for (let i = 0; i < count; i++) {
            if (mass[i] <= 0) continue;
            this.insert(root, i, store);
        }

        this.computeCentersOfMass(root, store);
    }

    /** Index of the octant of `node` containing the point, and the child's centre. */
    private octantOf(node: number, x: number, y: number, z: number): number {
        let octant = 0;
        if (x >= this.centerX[node]) octant |= 1;
        if (y >= this.centerY[node]) octant |= 2;
        if (z >= this.centerZ[node]) octant |= 4;
        return octant;
    }

    private childNode(node: number, octant: number): number {
        const base = node * 8;
        let child = this.children[base + octant];
        if (child !== EMPTY) return child;

        const h = this.half[node] * 0.5;
        const cx = this.centerX[node] + (octant & 1 ? h : -h);
        const cy = this.centerY[node] + (octant & 2 ? h : -h);
        const cz = this.centerZ[node] + (octant & 4 ? h : -h);

        child = this.newNode(cx, cy, cz, h);
        // newNode may have reallocated `children`, so index through the current array.
        this.children[node * 8 + octant] = child;
        this.childMask[node] |= 1 << octant;

        return child;
    }

    /**
     * Insert a body, subdividing occupied leaves as needed.
     *
     * Iterative rather than recursive: a solar system spans a huge dynamic range (a star at
     * the origin, Kuiper objects thousands of units out), so trees get deep and a recursive
     * insert risks blowing the JS stack.
     *
     * At {@link BH_MAX_DEPTH} subdivision stops and bodies simply chain in the leaf. That
     * bounds the tree when bodies are near-coincident (a moon hugging its planet, or two
     * asteroids mid-collision), where subdivision would otherwise never separate them.
     */
    private insert(root: number, bodyIndex: number, store: IBodyArrays): void {
        const { px, py, pz } = store;

        const x = px[bodyIndex];
        const y = py[bodyIndex];
        const z = pz[bodyIndex];

        let node = root;

        for (let depth = 0; ; depth++) {
            const head = this.bodyHead[node];

            if (this.childMask[node] !== 0) {
                node = this.childNode(node, this.octantOf(node, x, y, z));
                continue;
            }

            if (head === EMPTY) {
                this.bodyHead[node] = bodyIndex;
                this.nextBody[bodyIndex] = EMPTY;
                return;
            }

            if (depth >= BH_MAX_DEPTH) {
                // Bottomed out — chain into this leaf and sum it directly at traversal time.
                this.nextBody[bodyIndex] = head;
                this.bodyHead[node] = bodyIndex;
                return;
            }

            // Occupied leaf: push the sitting body (and anything chained behind it) down a
            // level, then loop to place the incoming body.
            this.bodyHead[node] = EMPTY;

            let existing = head;
            while (existing !== EMPTY) {
                const nextExisting = this.nextBody[existing];

                const octant = this.octantOf(node, px[existing], py[existing], pz[existing]);
                const child = this.childNode(node, octant);
                this.nextBody[existing] = this.bodyHead[child];
                this.bodyHead[child] = existing;

                existing = nextExisting;
            }

            node = this.childNode(node, this.octantOf(node, x, y, z));
        }
    }

    /**
     * Propagate mass and centre of mass upward.
     *
     * Uses the traversal stack in two passes (push order, then unwind in reverse) so children
     * are always finished before their parent, without recursion.
     */
    private computeCentersOfMass(root: number, store: IBodyArrays): void {
        const { px, py, pz, mass } = store;

        // Post-order via an explicit stack: collect nodes in push order, then walk backwards.
        const order = this.stack;
        let top = 0;
        order[top++] = root;

        let written = 0;
        const visited = this.visitOrder;

        while (top > 0) {
            const node = order[--top];
            visited[written++] = node;

            const mask = this.childMask[node];
            const base = node * 8;
            for (let k = 0; k < 8; k++) {
                if ((mask & (1 << k)) !== 0) order[top++] = this.children[base + k];
            }
        }

        for (let idx = written - 1; idx >= 0; idx--) {
            const node = visited[idx];

            let m = 0;
            let sx = 0;
            let sy = 0;
            let sz = 0;

            const mask = this.childMask[node];
            const base = node * 8;
            for (let k = 0; k < 8; k++) {
                if ((mask & (1 << k)) === 0) continue;
                const child = this.children[base + k];

                const cm = this.nodeMass[child];
                if (cm <= 0) continue;

                m += cm;
                sx += this.comX[child] * cm;
                sy += this.comY[child] * cm;
                sz += this.comZ[child] * cm;
            }

            for (let b = this.bodyHead[node]; b !== EMPTY; b = this.nextBody[b]) {
                const bm = mass[b];
                if (bm <= 0) continue;

                m += bm;
                sx += px[b] * bm;
                sy += py[b] * bm;
                sz += pz[b] * bm;
            }

            this.nodeMass[node] = m;

            if (m > 0) {
                this.comX[node] = sx / m;
                this.comY[node] = sy / m;
                this.comZ[node] = sz / m;
            }
        }
    }

    // ── traversal ───────────────────────────────────────────────────────────

    private traverse(store: IBodyArrays, gEff: number, eps2: number): void {
        const { px, py, pz, ax, ay, az, mass, count } = store;

        const theta2 = this.theta * this.theta;
        const stack = this.stack;

        for (let i = 0; i < count; i++) {
            const pxi = px[i];
            const pyi = py[i];
            const pzi = pz[i];

            let axi = 0;
            let ayi = 0;
            let azi = 0;

            let top = 0;
            stack[top++] = 0; // root

            while (top > 0) {
                const node = stack[--top];
                const m = this.nodeMass[node];
                if (m <= 0) continue;

                const dx = this.comX[node] - pxi;
                const dy = this.comY[node] - pyi;
                const dz = this.comZ[node] - pzi;
                const r2 = dx * dx + dy * dy + dz * dz + eps2;

                const width = this.half[node] * 2;

                // Accept the node as a single point mass when it subtends a small enough
                // angle. Comparing squares avoids a sqrt in the rejection path.
                if (width * width < theta2 * r2) {
                    const invR = 1 / Math.sqrt(r2);
                    const s = gEff * m * invR * invR * invR;
                    axi += s * dx;
                    ayi += s * dy;
                    azi += s * dz;
                    continue;
                }

                const mask = this.childMask[node];
                if (mask !== 0) {
                    const base = node * 8;
                    for (let k = 0; k < 8; k++) {
                        if ((mask & (1 << k)) !== 0) stack[top++] = this.children[base + k];
                    }
                    continue;
                }

                // Leaf: sum its bodies exactly, skipping self-interaction.
                for (let b = this.bodyHead[node]; b !== EMPTY; b = this.nextBody[b]) {
                    if (b === i) continue;

                    const mb = mass[b];
                    if (mb <= 0) continue;

                    const bx = px[b] - pxi;
                    const by = py[b] - pyi;
                    const bz = pz[b] - pzi;

                    const br2 = bx * bx + by * by + bz * bz + eps2;
                    const bInvR = 1 / Math.sqrt(br2);
                    const bs = gEff * mb * bInvR * bInvR * bInvR;

                    axi += bs * bx;
                    ayi += bs * by;
                    azi += bs * bz;
                }
            }

            ax[i] = axi;
            ay[i] = ayi;
            az[i] = azi;
        }
    }
}
