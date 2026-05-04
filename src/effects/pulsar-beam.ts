import * as THREE from 'three';
import { IEffect } from './effect-base';
import { IStateDependencies } from '../interfaces';
import { SCALE_FACTOR } from '../utilities/consts';

/**
 * Renders the twin electromagnetic beams emitted by a pulsar along its magnetic axis.
 *
 * The magnetic axis is offset from the rotation (spin) axis by a random angle (10–45°),
 * causing the beam to sweep a cone as the pulsar spins — the classic "lighthouse" effect.
 *
 * Visuals: two vertex-coloured line segments (south tip → centre → north tip), bright
 * cyan-white at the tips fading to black at the centre (additive blend = transparent at
 * centre), matching the style of the black-hole jet lines.
 */
export class PulsarBeam implements IEffect {
    dependencies: IStateDependencies;
    active: boolean = true;

    private scene: THREE.Scene;
    private position: THREE.Vector3;
    private rotationAxis: THREE.Vector3;
    private rotationSpeed: number;

    /** Magnetic axis in its initial orientation (before any spin phase is applied). */
    private magneticAxisBase: THREE.Vector3;

    /** Accumulates spin angle over time (radians). */
    private spinPhase: number = 0;

    /** How far each beam tip reaches from the pulsar centre (simulation units). */
    private beamLength: number;

    // Line geometry (3 points: south → centre → north)
    private line: THREE.Line | null = null;
    private lineGeo: THREE.BufferGeometry | null = null;
    private lineMat: THREE.LineBasicMaterial | null = null;

    // Glow sprites at each beam tip
    private tipSprites: THREE.Sprite[] = [];

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        position: THREE.Vector3,
        radius: number,
        rotationAxis: THREE.Vector3,
        rotationSpeed: number
    ) {
        this.dependencies = dependencies;
        this.scene = scene;
        this.position = position.clone();
        this.rotationAxis = rotationAxis.clone().normalize();
        this.rotationSpeed = rotationSpeed;

        this.beamLength = Math.max(300 * SCALE_FACTOR, radius * 50);

        // Build a random magnetic axis offset 10–45° from the spin axis.
        // Pick a vector perpendicular to the spin axis, then rotate around it.
        const offsetAngle = (10 + Math.random() * 35) * (Math.PI / 180);
        const perp = this._buildPerpendicular(this.rotationAxis);
        const tiltQuat = new THREE.Quaternion().setFromAxisAngle(perp, offsetAngle);
        this.magneticAxisBase = this.rotationAxis.clone().applyQuaternion(tiltQuat).normalize();

        this._buildLine();
        this._buildTipSprites();
    }

    // ─── helpers ───────────────────────────────────────────────────────────────

    /** Returns a unit vector perpendicular to `v`. */
    private _buildPerpendicular(v: THREE.Vector3): THREE.Vector3 {
        const perp = Math.abs(v.x) < 0.9
            ? new THREE.Vector3(1, 0, 0)
            : new THREE.Vector3(0, 1, 0);
        return perp.clone().cross(v).normalize();
    }

    /** Computes the current magnetic axis after spinning by `spinPhase` around `rotationAxis`. */
    private _currentMagAxis(): THREE.Vector3 {
        const q = new THREE.Quaternion().setFromAxisAngle(this.rotationAxis, this.spinPhase);
        return this.magneticAxisBase.clone().applyQuaternion(q);
    }

    // ─── build ─────────────────────────────────────────────────────────────────

    private _buildLine(): void {
        const axis = this._currentMagAxis();
        const c = this.position;
        const north = c.clone().addScaledVector(axis,  this.beamLength);
        const south = c.clone().addScaledVector(axis, -this.beamLength);

        // Beam colour: bright cyan-white
        const r = 0.6, g = 0.93, b = 1.0;

        const positions = new Float32Array([
            south.x, south.y, south.z,
            c.x,     c.y,     c.z,
            north.x, north.y, north.z,
        ]);
        // Tips are full colour; centre is black (additive blend makes it invisible).
        const colors = new Float32Array([
            r, g, b,
            0, 0, 0,
            r, g, b,
        ]);

        this.lineGeo = new THREE.BufferGeometry();
        this.lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.lineGeo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

        this.lineMat = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        this.line = new THREE.Line(this.lineGeo, this.lineMat);
        this.line.frustumCulled = false;
        this.line.renderOrder = 999;
        this.scene.add(this.line);
    }

    private _buildTipSprites(): void {
        const glowTex = this._makeTipTexture();
        const axis = this._currentMagAxis();

        for (const side of [1, -1]) {
            const mat = new THREE.SpriteMaterial({
                map: glowTex,
                blending: THREE.AdditiveBlending,
                transparent: true,
                depthWrite: false,
                color: 0x99eeff,
                opacity: 0.7,
            });
            const sprite = new THREE.Sprite(mat);
            const tipRadius = this.beamLength * 0.04;
            sprite.scale.setScalar(tipRadius);
            sprite.position.copy(
                this.position.clone().addScaledVector(axis, side * this.beamLength)
            );
            sprite.frustumCulled = false;
            this.scene.add(sprite);
            this.tipSprites.push(sprite);
        }
    }

    /** Creates a simple radial-gradient canvas texture for the tip glow sprites. */
    private _makeTipTexture(): THREE.CanvasTexture {
        const size = 64;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d')!;
        const half = size / 2;
        const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
        grad.addColorStop(0,   'rgba(200, 240, 255, 1)');
        grad.addColorStop(0.4, 'rgba(100, 200, 255, 0.6)');
        grad.addColorStop(1,   'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.needsUpdate = true;
        return tex;
    }

    // ─── IEffect ───────────────────────────────────────────────────────────────

    update(dt: number): void {
        if (!this.active || !dt) return;

        this.spinPhase += this.rotationSpeed * Math.abs(dt);

        const axis = this._currentMagAxis();
        const c = this.position;
        const north = c.clone().addScaledVector(axis,  this.beamLength);
        const south = c.clone().addScaledVector(axis, -this.beamLength);

        // Update line vertices in-place
        if (this.lineGeo) {
            const posArr = this.lineGeo.attributes.position.array as Float32Array;
            posArr[0] = south.x; posArr[1] = south.y; posArr[2] = south.z;
            posArr[3] = c.x;     posArr[4] = c.y;     posArr[5] = c.z;
            posArr[6] = north.x; posArr[7] = north.y; posArr[8] = north.z;
            (this.lineGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        }

        // Update tip sprite positions
        const tips = [south, north];
        for (let i = 0; i < this.tipSprites.length; i++) {
            this.tipSprites[i].position.copy(tips[i]);
        }
    }

    setPosition(pos: THREE.Vector3): void {
        this.position.copy(pos);
    }

    dispose(): void {
        this.active = false;

        if (this.line) {
            this.scene.remove(this.line);
            this.lineGeo?.dispose();
            this.lineMat?.dispose();
            this.line = null;
            this.lineGeo = null;
            this.lineMat = null;
        }

        for (const sprite of this.tipSprites) {
            this.scene.remove(sprite);
            sprite.material?.map?.dispose();
            sprite.material?.dispose();
        }
        this.tipSprites = [];
    }
}
