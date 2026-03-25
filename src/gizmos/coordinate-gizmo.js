import * as THREE from '../vendors/three.module.js'
import { GIZMO_TUNING, GRAV_ARROW_SCALE } from '../utilities/consts.js'

export class CoordinateGizmo {
    constructor(scene) {
        this.group = new THREE.Group()
        this.arrows = []
        this.group.visible = false
        scene.add(this.group)

        // Arrow configuration: [direction vector, color, axis name]
        const arrowConfigs = [
            { dir: new THREE.Vector3(1, 0, 0), col: 0xff0000, axis: 'x' }, // +X
            { dir: new THREE.Vector3(-1, 0, 0), col: 0xff0000, axis: 'x' }, // -X
            { dir: new THREE.Vector3(0, 0, 1), col: 0x0000ff, axis: 'z' }, // +Z
            { dir: new THREE.Vector3(0, 0, -1), col: 0x0000ff, axis: 'z' }, // -Z
            { dir: new THREE.Vector3(0, 1, 0), col: 0x00ff00, axis: 'y' }, // +Y
            { dir: new THREE.Vector3(0, -1, 0), col: 0x00ff00, axis: 'y' }, // -Y
        ]

        arrowConfigs.forEach((config) => {
            const arrowLength = 60
            const headLength = 15
            const headWidth = 10

            const arrow = new THREE.ArrowHelper(
                config.dir,
                new THREE.Vector3(0, 0, 0),
                arrowLength,
                config.col,
                headLength,
                headWidth,
            )

            // Make the "grab" area easier to hit
            arrow.line.scale.set(3, 1, 3) // Thicker lines for raycasting
            arrow.cone.scale.set(2, 2, 2) // Larger heads for raycasting

            arrow.line.userData = { isGizmo: true, axis: config.axis, dir: config.dir }
            arrow.cone.userData = { isGizmo: true, axis: config.axis, dir: config.dir }
            this.group.add(arrow)
            this.arrows.push(arrow)
        })

        // Velocity arrow (part of the gizmo group so selection visibility is unified)
        this.velocityArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            1,
            0xffff00,
            15, // Slightly larger head for easier clicking
            8,
        )
        this.velocityArrow.visible = false
        this.velocityArrow.line.userData = { isVelocityGizmo: true }
        this.velocityArrow.cone.userData = { isVelocityGizmo: true }
        this.group.add(this.velocityArrow)

        // Gravity arrow (net gravitational acceleration acting ON the body)
        // Not interactable (no drag), purely informational.
        this.gravityArrow = new THREE.ArrowHelper(
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 0, 0),
            1,
            0xaaaaaa,
            12,
            6,
        )
        this.gravityArrow.visible = false
        this.gravityArrow.line.userData = { isGravityGizmo: true }
        this.gravityArrow.cone.userData = { isGravityGizmo: true }
        this.group.add(this.gravityArrow)
    }

    attach(body) {
        if (!body) {
            this.target = null
            this.group.visible = false
            this.velocityArrow.visible = false
            this.gravityArrow.visible = false
            return
        }

        this.group.visible = true
        this.target = body
        this.velocityArrow.visible = true
        this.gravityArrow.visible = true

        // Scale arrows based on body size (allow scaling DOWN as well)
        // Keep a small floor so the gizmo doesn't become impossible to click.
        const scaleFactor = Math.max(body.radius / 10, 0.25)
        this.arrows.forEach((arrow) => {
            arrow.setLength(60 * scaleFactor, 15 * scaleFactor, 10 * scaleFactor)
        })

        // Scale velocity arrow similarly so it's clickable on small bodies
        const velHeadLength = 15 * scaleFactor
        const velHeadWidth = 8 * scaleFactor
        this.velocityArrow.setLength(1, velHeadLength, velHeadWidth)
        this.velocityArrow.line.scale.set(3, 1, 3)
        this.velocityArrow.cone.scale.set(2, 2, 2)

        // Scale gravity arrow similarly for consistency (not for raycasting, just visuals)
        const gravHeadLength = 12 * scaleFactor
        const gravHeadWidth = 6 * scaleFactor
        this.gravityArrow.setLength(1, gravHeadLength, gravHeadWidth)
        this.gravityArrow.line.scale.set(3, 1, 3)
        this.gravityArrow.cone.scale.set(2, 2, 2)
    }

    updateVelocityArrow() {
        if (!this.velocityArrow || !this.target || this.target._isDisposed) return

        const speed = this.target.velocity.length()
        const arrowScale = GIZMO_TUNING.VELOCITY_ARROW_SCALE

        // Avoid NaNs on zero velocity
        const direction =
            speed > 0 ? this.target.velocity.clone().normalize() : new THREE.Vector3(1, 0, 0)

        this.velocityArrow.setDirection(direction)
        this.velocityArrow.setLength(
            Math.max(speed * arrowScale, 0.1),
            this.velocityArrow.headLength,
            this.velocityArrow.headWidth,
        )
    }

    updateGravityArrow() {
        if (!this.gravityArrow || !this.target || this.target._isDisposed) return

        const acc = this.target.tempAcc
        if (!acc) {
            this.gravityArrow.visible = false
            return
        }

        const accMag = acc.length()

        // Avoid NaNs on zero acceleration
        const direction = accMag > 0 ? acc.clone().normalize() : new THREE.Vector3(1, 0, 0)

        // Scale for visibility; clamp to avoid extreme spikes when very close to a massive body.
        const minLen = Math.max((this.target.radius || 0) * 2.0, 0.1) // keep visible even far away; extend beyond body
        const maxLen = 3000

        const len = THREE.MathUtils.clamp(accMag * GRAV_ARROW_SCALE, minLen, maxLen)

        this.gravityArrow.visible = true
        this.gravityArrow.setDirection(direction)
        this.gravityArrow.setLength(len, this.gravityArrow.headLength, this.gravityArrow.headWidth)
    }

    update() {
        if (this.group.visible && this.target && !this.target._isDisposed) {
            this.group.position.copy(this.target.mesh.position)
            this.updateVelocityArrow()
            this.updateGravityArrow()
        } else {
            this.group.visible = false
            if (this.velocityArrow) this.velocityArrow.visible = false
            if (this.gravityArrow) this.gravityArrow.visible = false
        }
    }
}
