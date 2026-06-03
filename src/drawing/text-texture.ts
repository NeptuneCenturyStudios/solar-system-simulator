import * as THREE from 'three';

/**
 * Creates a THREE.js texture from a string of text, rendered on a canvas with glow effect.
 * Used for rendering labels or UI text in the 3D scene.
 * @param text - The text to render.
 * @returns The resulting texture.
 */
export function createTextTexture(text: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get 2D context');

    // Set canvas size
    canvas.width = 512;
    canvas.height = 128;

    // Setup text style
    context.font = '48px monospace';
    context.fillStyle = '#00ffcc';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    // Add glow effect
    context.shadowColor = 'rgba(0, 255, 204, 0.8)';
    context.shadowBlur = 15;

    // Draw text
    context.fillText(text, canvas.width / 2, canvas.height / 2);

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    return texture;
}