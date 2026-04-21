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
    document.body.appendChild(screenFlashDiv);
}
createScreenFlash();

/**
 * Trigger a white screen flash.
 * @param holdMs   How long (ms) the flash stays at full brightness before fading. Default 50.
 * @param fadeInSecs CSS transition duration for the fade-in in seconds. Default 0.5.
 * @param fadeOutSecs CSS transition duration for the fade-out in seconds. Default 0.5.
 */
export function triggerScreenFlash(holdMs = 50, fadeInSecs = 0.5, fadeOutSecs = 0.5) {
    if (screenFlashDiv) {
        screenFlashDiv.style.transition = `opacity ${fadeInSecs}s`;
        screenFlashDiv.style.opacity = '0.8';
        setTimeout(() => {
            if (screenFlashDiv) {
                screenFlashDiv.style.transition = `opacity ${fadeOutSecs}s`;
                screenFlashDiv.style.opacity = '0';
            }
        }, holdMs);
    }
}
