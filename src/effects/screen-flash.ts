// Screen flash effect for explosions
let screenFlashDiv: HTMLDivElement;
function createScreenFlash() {
    screenFlashDiv = document.createElement('div');
    screenFlashDiv.style.position = 'fixed';
    screenFlashDiv.style.top = '0';
    screenFlashDiv.style.left = '0';
    screenFlashDiv.style.width = '100vw';
    screenFlashDiv.style.height = '100vh';
    screenFlashDiv.style.backgroundColor = 'white';
    screenFlashDiv.style.opacity = '0';
    screenFlashDiv.style.pointerEvents = 'none';
    screenFlashDiv.style.zIndex = '9999';
    screenFlashDiv.style.transition = 'opacity 0.5s';
    document.body.appendChild(screenFlashDiv);
}
createScreenFlash();

export function triggerScreenFlash() {
    if (screenFlashDiv) {
        screenFlashDiv.style.opacity = '0.6';
        setTimeout(() => {
            if (screenFlashDiv) {
                screenFlashDiv.style.opacity = '0';
            }
        }, 50);
    }
}
