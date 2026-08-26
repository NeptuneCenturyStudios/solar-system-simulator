import * as THREE from 'three';
import { StaticBody } from './static-body';
import { BodyTypeEnum } from './body-enums';
import { IDeathOptions, IRotation, IStateDependencies } from '../interfaces';
import { WormholeFunnelEffect } from '../effects/wormhole-funnel';

const WORMHOLE_COLOR = 0x8844ff;

/**
 * Builds the gate mesh: a flat, invisible disk. The mesh's position/quaternion define the
 * wormhole's entrance plane and normal (geometry rotated so its normal is local +Y, matching
 * the tilt/azimuth gizmo's spin-axis convention used as the wormhole's entrance normal).
 *
 * The disk is intentionally invisible (material.visible = false) because the WormholeFunnelEffect
 * provides all the visuals. It is still raycastable (Mesh.raycast ignores material.visible), so
 * click-picking resolves to the owning body via userData.parentBody. Swept-plane collision
 * (wormhole-collision.ts) uses only mesh.position, getEntranceNormal(), and radius, not geometry.
 */
function createWormholeMesh(radius: number): THREE.Mesh {
    const discGeo = new THREE.CircleGeometry(radius, 48);
    discGeo.rotateX(Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
        visible: false,
        side: THREE.DoubleSide,
    });
    return new THREE.Mesh(discGeo, discMat);
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
        // Let clicks anywhere on the gate (disk, particles, fallback cones) resolve to this body.
        this.mesh.traverse((child) => (child.userData.parentBody = this));
    }

    /** Rebuilds the disc mesh and funnel effect at the new radius (mesh is a flat disc, not a sphere). */
    override setRadius(newRadius: number) {
        if (!Number.isFinite(newRadius) || newRadius <= 0) return;

        this.radius = newRadius;

        try {
            this.mesh.geometry.dispose();
            const discGeo = new THREE.CircleGeometry(newRadius, 48);
            discGeo.rotateX(Math.PI / 2);
            this.mesh.geometry = discGeo;
        } catch (e) {
            console.error('Error updating wormhole mesh radius:', e);
        }

        this.funnelEffect.setRadius(newRadius);
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
