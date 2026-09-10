import * as THREE from 'three';

const G_TOTAL = 6.6743e-20 * (6.025757575757576e22 / 100 ** 3);
const gMultiplier = 2500000;
const gEff = G_TOTAL * gMultiplier;

const _scratchDiff = new THREE.Vector3();

function getAcc(p1, p2, m2, G) {
    _scratchDiff.subVectors(p2, p1);
    const r = _scratchDiff.length();
    if (r < 0.01) return null;
    const accMag = (G * m2) / (r * r);
    _scratchDiff.normalize().multiplyScalar(accMag);
    return _scratchDiff;
}

function makeBodies(n) {
    const bodies = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = 100000;
        bodies.push({
            mesh: { position: new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)) },
            mass: i === 0 ? 33000 : 1e-3,
            tempAcc: new THREE.Vector3(),
            _isDisposed: false,
        });
    }
    return bodies;
}

function updatePhysics(bodies) {
    const len = bodies.length;
    for (let idx = 0; idx < len; idx++) {
        const body = bodies[idx];
        if (!body || body._isDisposed || !body.mesh) continue;
        const totalAcc = body.tempAcc;
        totalAcc.set(0, 0, 0);
        for (const other of bodies) {
            if (other !== body && !other?._isDisposed && other.mesh) {
                const acc = getAcc(body.mesh.position, other.mesh.position, other.mass, gEff);
                if (acc) totalAcc.add(acc);
            }
        }
    }
}

function bench(n, substeps, frames) {
    const bodies = makeBodies(n);
    for (let i = 0; i < 5; i++) updatePhysics(bodies);
    const start = performance.now();
    for (let f = 0; f < frames; f++) {
        for (let s = 0; s < substeps; s++) updatePhysics(bodies);
    }
    const elapsed = performance.now() - start;
    const perFrameMs = elapsed / frames;
    console.log(
        `n=${n} substeps=${substeps}: ${perFrameMs.toFixed(1)} ms/frame  (~${(1000 / perFrameMs).toFixed(0)} fps physics-only)`
    );
}

const SUBSTEPS = 64;
bench(20, SUBSTEPS, 60);
bench(60, SUBSTEPS, 60);
bench(100, SUBSTEPS, 60);
bench(150, SUBSTEPS, 60);
