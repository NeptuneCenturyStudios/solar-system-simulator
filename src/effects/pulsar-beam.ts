import * as THREE from 'three';
import { STAR_NOISE_GLSL } from './star-noise-glsl';
import { PULSAR_BEAM_HDR_SCALE, STAR_HDR_GAMMA } from './star-tint';

/** Beam half-width at the star, in pulsar radii. */
const BEAM_BASE_WIDTH_RADII = 0.6;

/** How fast the beam widens with distance (Gaussian width grows by this × distance). */
const BEAM_SPREAD = 0.02;

/** The shell is this many beam widths across, so the Gaussian's tails fit inside it. */
const SHELL_WIDTHS = 3.5;

/** Cap on the brightening when looking down the beam (path-length factor). */
const MAX_PATH_GAIN = 14;

/** Default beam colour: a hot violet-blue white. */
const DEFAULT_BEAM_COLOR = 0xc8d4ff;

const _camWorld = new THREE.Vector3();
const _invWorld = new THREE.Matrix4();
const _Y = new THREE.Vector3(0, 1, 0);

/**
 * The twin radiation beams a pulsar emits from its magnetic poles.
 *
 * Volumetric, not a tube: the beam is a soft glowing column (Gaussian across, widening and
 * fading with distance), and each pixel adds up how much of it its line of sight passes
 * through, in closed form. Seen from the side it is a soft shaft with no hard edges; when its
 * sweep crosses the camera the line of sight runs along the column, so it flashes bright — the
 * lighthouse effect — with no extra sprite.
 *
 * The geometry is only a proxy: a closed bicone shell (both arms) around the column, drawn
 * front-faced from outside and back-faced from inside so there is always exactly one fragment
 * per pixel. The shell is a child of the pulsar mesh, aligned to the magnetic axis in the
 * mesh's object space, so the sim's spin and tilt sweep the beams with no clock of their own.
 */
export class PulsarBeam {
    readonly mesh: THREE.Mesh<THREE.LatheGeometry, THREE.MeshBasicMaterial>;

    private readonly _length: number;
    private readonly _uniforms: {
        uPbColor: THREE.IUniform<THREE.Color>;
        uPbIntensity: THREE.IUniform<number>;
        uPbTime: THREE.IUniform<number>;
        uPbCamObj: THREE.IUniform<THREE.Vector3>;
        uPbLength: THREE.IUniform<number>;
        uPbBaseWidth: THREE.IUniform<number>;
        uPbStarRadius: THREE.IUniform<number>;
    };

    /**
     * @param parent           The pulsar mesh. The beams spin and tilt with it.
     * @param radius           Pulsar radius (world units).
     * @param length           How far each beam reaches from the centre.
     * @param magneticAxisObj  Magnetic axis in the parent's object space.
     * @param time             A clock uniform (shared with the surface) driving the streaks.
     */
    constructor(
        parent: THREE.Object3D,
        radius: number,
        length: number,
        magneticAxisObj: THREE.Vector3,
        time: THREE.IUniform<number>
    ) {
        this._length = length;
        const baseWidth = radius * BEAM_BASE_WIDTH_RADII;

        this._uniforms = {
            uPbColor: { value: new THREE.Color(DEFAULT_BEAM_COLOR) },
            uPbIntensity: { value: 1.0 },
            uPbTime: time,
            uPbCamObj: { value: new THREE.Vector3() },
            uPbLength: { value: length },
            uPbBaseWidth: { value: baseWidth },
            uPbStarRadius: { value: radius },
        };

        // Closed bicone profile (r, y): cap, widening arm, waist at the star, arm, cap. The shell
        // is SHELL_WIDTHS beam widths across at every height.
        const shellRadius = (y: number) => (baseWidth + Math.abs(y) * BEAM_SPREAD) * SHELL_WIDTHS;
        const steps = 6;
        const profile: THREE.Vector2[] = [new THREE.Vector2(0, -length)];
        for (let i = -steps; i <= steps; i++) {
            const y = (i / steps) * length;
            profile.push(new THREE.Vector2(shellRadius(y), y));
        }
        profile.push(new THREE.Vector2(0, length));
        const geometry = new THREE.LatheGeometry(profile, 32);

        const material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.FrontSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        material.onBeforeCompile = (shader) => {
            Object.assign(shader.uniforms, this._uniforms);

            shader.vertexShader = shader.vertexShader
                .replace(
                    '#include <common>',
                    /* glsl */ `#include <common>
                    varying vec3 vPbObjPos;`
                )
                .replace(
                    '#include <project_vertex>',
                    /* glsl */ `#include <project_vertex>
                    vPbObjPos = position;`
                );

            shader.fragmentShader = shader.fragmentShader
                .replace(
                    '#include <common>',
                    /* glsl */ `#include <common>
                    uniform vec3 uPbColor;
                    uniform float uPbIntensity;
                    uniform float uPbTime;
                    uniform vec3 uPbCamObj;
                    uniform float uPbLength;
                    uniform float uPbBaseWidth;
                    uniform float uPbStarRadius;
                    varying vec3 vPbObjPos;
                    ${STAR_NOISE_GLSL}`
                )
                .replace(
                    'vec4 diffuseColor = vec4( diffuse, opacity );',
                    /* glsl */ `
                    // The beam's axis is the shell's local Y. Find where this pixel's view ray
                    // passes closest to it (closest points of two lines).
                    vec3 ro = uPbCamObj;
                    vec3 rd = normalize(vPbObjPos - ro);

                    // Only the stretch of the line of sight in front of the pulsar can glow: if
                    // the ray hits the star, stop there. (Done here rather than by depth so the
                    // beam can still be drawn over the star when looking straight down it.)
                    float tMax = 1e20;
                    float bHit = dot(ro, rd);
                    float hHit = bHit * bHit - (dot(ro, ro) - uPbStarRadius * uPbStarRadius);
                    if (hHit > 0.0) {
                        float tHit = -bHit - sqrt(hHit);
                        if (tHit > 0.0) tMax = tHit;
                    }

                    // The beam's axis is the shell's local Y. Find where this pixel's view ray
                    // passes closest to it (closest points of two lines), kept to the visible
                    // stretch of the ray. Computed relative to the camera's own height on the
                    // axis so nearly-parallel rays (looking down the beam) stay well-conditioned.
                    float cosA = rd.y;
                    float sinSq = max(1.0 - cosA * cosA, 1e-6);
                    vec2 rdXZ = rd.xz;
                    float t = -dot(ro.xz, rdXZ) / max(dot(rdXZ, rdXZ), 1e-12);
                    t = clamp(t, 0.0, tMax);
                    vec3 rayPt = ro + rd * t;
                    float s = clamp(rayPt.y, -uPbLength, uPbLength);  // along the axis
                    float dist = length(rayPt.xz);
                    float sAbs = abs(s);

                    // Gaussian column, widening with distance.
                    float width = uPbBaseWidth + sAbs * ${BEAM_SPREAD.toFixed(4)};
                    float column = exp(-min((dist * dist) / (width * width), 60.0));

                    // Brighter where the line of sight runs along the beam: the path through a
                    // column of width w at angle theta is ~ w / sin(theta). Capped.
                    float pathGain = min(inversesqrt(sinSq), ${MAX_PATH_GAIN.toFixed(1)});

                    // Full strength from the surface (no dim collar round the star when seen
                    // end-on), fading out toward the tip.
                    float u = sAbs / uPbLength;
                    float along = smoothstep(uPbStarRadius * 0.6, uPbStarRadius, sAbs)
                                * (1.0 - smoothstep(0.35, 1.0, u));
                    along *= mix(1.0, 0.35, u);

                    // Streaks: plasma knots streaming outward along the beam.
                    // Keyed to the position across the column (in beam widths), which is
                    // continuous through the axis, unlike the direction around it.
                    vec2 across = rayPt.xz / width;
                    float flow = ss_snoise4(vec4(across * 0.8, u * 18.0 - uPbTime * 0.6, uPbTime * 0.05));
                    float streaks = clamp(0.7 + 0.45 * flow, 0.0, 2.0);

                    // The closest-point estimate above is exact from the side but breaks down as
                    // the line of sight lines up with the beam (it lands on the star's surface,
                    // where the beam is thinnest, and misses the long stretch the ray actually
                    // travels inside it). Fade it out there...
                    float sideOn = smoothstep(0.0, 0.08, sinSq);
                    float glow = column * along * pathGain * streaks * sideOn;

                    // ...and hand over to the end-on view: the beam seen down its length is a
                    // bright disc round the pulsar, as strong as the camera is aligned with it.
                    // This is the lighthouse flash as the beam sweeps past.
                    vec3 toStar = normalize(-ro);
                    float camAlign = abs(toStar.y);                     // 1 = camera on the axis
                    float beamAngle = ${(BEAM_SPREAD * 2.0).toFixed(4)} + uPbBaseWidth / max(length(ro), 1e-6);
                    float offAxis = max(1.0 - camAlign, 0.0) * 2.0;     // ~ angle^2
                    float aligned = exp(-offAxis / (beamAngle * beamAngle));
                    float fromCentre = max(1.0 - dot(rd, toStar), 0.0) * 2.0;  // ~ angle^2
                    float disc = exp(-fromCentre / (beamAngle * beamAngle)) * 3.0
                               + exp(-fromCentre / (16.0 * beamAngle * beamAngle)) * 0.6;
                    glow += aligned * disc * (1.0 - sideOn * 0.5);

                    glow = max(glow * uPbIntensity * 0.55, 0.0);

                    // Linear HDR: the glow profile (authored in display terms) raised to the
                    // display-to-linear power, so the faint column looks as before after the sRGB
                    // encode and the end-on flash goes far above 1; the output pass's tone curve
                    // saturates it to white.
                    vec3 beam = uPbColor * pow(glow * ${PULSAR_BEAM_HDR_SCALE.toFixed(3)}, ${STAR_HDR_GAMMA.toFixed(2)});
                    vec4 diffuseColor = vec4(beam, 1.0);
                    `
                );
        };
        material.customProgramCacheKey = () => 'pulsar-beam-v8';

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.name = 'PulsarBeam';
        this.mesh.quaternion.setFromUnitVectors(_Y, magneticAxisObj.clone().normalize());
        this.mesh.frustumCulled = false;
        this.mesh.raycast = () => {};
        this.mesh.renderOrder = 2;

        // Camera position in the shell's object space, and how to draw. From outside the shell:
        // front faces (the near side), depth-tested, so planets in front block the beam. From
        // inside (looking down the beam) there are only back faces, and those sit behind the
        // star, so depth testing is turned off and the shader hides what is behind the star.
        this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
            _invWorld.copy(this.mesh.matrixWorld).invert();
            _camWorld.setFromMatrixPosition(camera.matrixWorld);
            const cam = this._uniforms.uPbCamObj.value.copy(_camWorld).applyMatrix4(_invWorld);
            const inside =
                Math.abs(cam.y) < this._length &&
                Math.hypot(cam.x, cam.z) < shellRadius(cam.y) * 0.95;
            const side = inside ? THREE.BackSide : THREE.FrontSide;
            if (material.side !== side) material.side = side;
            material.depthTest = !inside;
        };

        parent.add(this.mesh);
    }

    /** Beam colour (default: hot violet-blue white). */
    setColor(color: THREE.ColorRepresentation): void {
        this._uniforms.uPbColor.value.set(color);
    }

    setIntensity(intensity: number): void {
        this._uniforms.uPbIntensity.value = intensity;
    }

    setVisible(visible: boolean): void {
        this.mesh.visible = visible;
    }

    dispose(): void {
        this.mesh.parent?.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
