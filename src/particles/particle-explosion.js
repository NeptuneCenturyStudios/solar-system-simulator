import * as THREE from '../vendors/three.module.js'

export class ParticleExplosion {
    constructor(scene, pos, color, radius = 10) {
        this.count = 800 // 4x more particles
        this.geometry = new THREE.BufferGeometry()
        this.positions = new Float32Array(this.count * 3)
        this.velocities = []
        this.alive = true
        this.opacity = 1.0
        this.scene = scene

        for (let i = 0; i < this.count; i++) {
            this.positions[i * 3] = pos.x
            this.positions[i * 3 + 1] = pos.y
            this.positions[i * 3 + 2] = pos.z
            const v = new THREE.Vector3(
                Math.random() - 0.5,
                Math.random() - 0.5,
                Math.random() - 0.5,
            )
                .normalize()
                .multiplyScalar(Math.random() * 8 + 2) // Faster, bigger spread
            this.velocities.push(v)
        }
        this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
        // Brighten the color by mixing it with white
        const brightColor = new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5)
        this.material = new THREE.PointsMaterial({
            color: brightColor,
            size: 6, // Larger particles
            transparent: true,
            blending: THREE.AdditiveBlending,
            opacity: 1.5, // Brighter with additive blending
        })
        this.points = new THREE.Points(this.geometry, this.material)
        scene.add(this.points)

        // Create bright flash sphere at impact
        const flashGeo = new THREE.SphereGeometry(radius * 3, 16, 16)
        const flashMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
        })
        this.flashSphere = new THREE.Mesh(flashGeo, flashMat)
        this.flashSphere.position.copy(pos)
        scene.add(this.flashSphere)
        this.flashOpacity = 1.0
    }
    update(dt) {
        // Use absolute value of dt so explosion always plays forward regardless of time direction
        dt = Math.abs(dt)

        const p = this.geometry.attributes.position.array
        this.opacity -= 0.003 * (dt * 60) // Slower fade (was 0.01)
        this.material.opacity = this.opacity

        // Update flash sphere
        // IMPORTANT: clean up as soon as it fades out, so we never leave a lingering white sphere
        // if the explosion particles stop updating for any reason.
        if (this.flashSphere) {
            if (this.flashOpacity > 0) {
                this.flashOpacity -= 0.05 * (dt * 60)
                this.flashSphere.material.opacity = Math.max(0, this.flashOpacity)
                this.flashSphere.scale.setScalar(1 + (1 - this.flashOpacity) * 2) // Expand as it fades
            }

            if (this.flashOpacity <= 0) {
                this.scene.remove(this.flashSphere)
                this.flashSphere.geometry.dispose()
                this.flashSphere.material.dispose()
                this.flashSphere = null
            }
        }

        for (let i = 0; i < this.count; i++) {
            p[i * 3] += this.velocities[i].x * (dt * 60)
            p[i * 3 + 1] += this.velocities[i].y * (dt * 60)
            p[i * 3 + 2] += this.velocities[i].z * (dt * 60)
        }
        this.geometry.attributes.position.needsUpdate = true
        if (this.opacity <= 0) {
            this.alive = false
            this.scene.remove(this.points)

            // flashSphere may already be cleaned up above
            if (this.flashSphere) {
                this.scene.remove(this.flashSphere)
                this.flashSphere.geometry.dispose()
                this.flashSphere.material.dispose()
                this.flashSphere = null
            }

            // Proper cleanup
            this.geometry.dispose()
            this.material.dispose()
        }
    }
}
