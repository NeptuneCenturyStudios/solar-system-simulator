import * as THREE from 'three';
import { StaticBody } from './static-body';
import { BodyTypeEnum } from './body-enums';
import { IDeathOptions, IRotation, IStateDependencies } from '../interfaces';
import { WormholeFunnelEffect } from '../effects/wormhole-funnel';

const WORMHOLE_COLOR = 0x8844ff;

/** Builds the gate mesh: a ring (ArrowHelper-scaled by the gizmo like any body) plus a
 *  translucent portal disc. Geometry is rotated so its normal is local +Y, matching the
 *  tilt/azimuth gizmo's spin-axis convention used as the wormhole's entrance normal. */
function createWormholeMesh(radius: number): THREE.Mesh {
    const ringGeo = new THREE.TorusGeometry(radius, Math.max(radius * 0.08, 0.05), 16, 48);
    ringGeo.rotateX(Math.PI / 2);
    const ringMat = new THREE.MeshStandardMaterial({
        color: WORMHOLE_COLOR,
        emissive: 0x4411aa,
        emissiveIntensity: 0.6,
        metalness: 0.6,
        roughness: 0.3,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);

    const discGeo = new THREE.CircleGeometry(radius * 0.96, 48);
    discGeo.rotateX(Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
        color: 0x220033,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
    });
    ringMesh.add(new THREE.Mesh(discGeo, discMat));

    return ringMesh;
}

/**
 * A wormhole gate: a StaticBody (no gravity in or out) whose disc-shaped mouth teleports
 * anything passing through it to a linked partner wormhole. Unlinked wormholes destroy
 * whatever enters. Indestructible via collisions/weapons; only removable via manual delete.
 */
export class Wormhole extends StaticBody {
    linkedWormholeId: string | null = null;
    funnelEffect: WormholeFunnelEffect;

    constructor(
        dependencies: IStateDependencies,
        scene: THREE.Scene,
        pos: THREE.Vector3,
        radius: number,
        id: string,
        name: string,
        rotation: IRotation = { tilt: 0, speed: 0 }
    ) {
        const mesh = createWormholeMesh(radius);

        super(
            dependencies,
            scene,
            radius,
            WORMHOLE_COLOR,
            pos,
            new THREE.Vector3(0, 0, 0),
            0, // mass — a wormhole exerts no gravity on other bodies
            id,
            name,
            BodyTypeEnum.Wormhole,
            WORMHOLE_COLOR,
            0, // maxTrail — a stationary gate has no orbit trail
            false,
            rotation,
            mesh
        );

        if (this.trail) this.trail.visible = false;

        this.funnelEffect = new WormholeFunnelEffect(dependencies, this.mesh, radius);
        // Let clicks anywhere on the gate (disc, particles, fallback cones) resolve to this body.
        this.mesh.traverse((child) => (child.userData.parentBody = this));
    }

    /** World-space entrance/exit normal — the gate's local +Y axis after orientation. */
    getEntranceNormal(): THREE.Vector3 {
        return new THREE.Vector3(0, 1, 0).applyQuaternion(this.mesh.quaternion);
    }

    isLinked(): boolean {
        return !!this.linkedWormholeId;
    }

    setLinkedWormhole(id: string | null): void {
        this.linkedWormholeId = id;
        this.funnelEffect.setLinkedState(!!id);
    }

    clearLink(): void {
        this.setLinkedWormhole(null);
    }

    die(deathOptions?: IDeathOptions) {
        this.funnelEffect.dispose();
        super.die(deathOptions);
    }
}
