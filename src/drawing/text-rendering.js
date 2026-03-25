import * as THREE from '../vendors/three.module.js'

// Function to create text texture from canvas
export function createTextTexture(text) {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')

    // Set canvas size
    canvas.width = 512
    canvas.height = 128

    // Setup text style
    context.font = '48px monospace'
    context.fillStyle = '#00ffcc'
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    // Add glow effect
    context.shadowColor = 'rgba(0, 255, 204, 0.8)'
    context.shadowBlur = 15

    // Draw text
    context.fillText(text, canvas.width / 2, canvas.height / 2)

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true

    return texture
}