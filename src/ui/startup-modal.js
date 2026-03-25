import { Panel } from './panel.js'

/**
 * Startup modal shown before first launch and on reset
 */
export class StartupModal extends Panel {
    constructor(elementId) {
        super(elementId)

        this.modalEl = document.getElementById('startup-modal')
        this.launchDefaultBtn = null
        this.launchEmptyBtn = null
        this.cancelBtn = null

        this._allowCancel = false
    }

    initialize() {
        this.launchDefaultBtn = document.getElementById('startupLaunchDefaultBtn')
        this.launchEmptyBtn = document.getElementById('startupLaunchEmptyBtn')
        this.cancelBtn = document.getElementById('startupCancelBtn')

        // Ensure overlay blocks all underlying interactions
        if (this.element) {
            const stop = (e) => {
                e.preventDefault()
                e.stopPropagation()
            }
            ;['mousedown', 'mouseup', 'mousemove', 'click', 'wheel', 'keydown', 'keyup'].forEach(
                (evt) => this.element.addEventListener(evt, stop, { passive: false }),
            )
        }

        if (this.launchDefaultBtn) {
            this.launchDefaultBtn.onclick = () => this.emit('launchDefault')
        }
        if (this.launchEmptyBtn) {
            this.launchEmptyBtn.onclick = () => this.emit('launchEmpty')
        }
        if (this.cancelBtn) {
            this.cancelBtn.onclick = () => this.emit('cancel')
        }
    }

    open({ allowCancel = false } = {}) {
        this._allowCancel = !!allowCancel
        if (this.cancelBtn) {
            this.cancelBtn.style.display = this._allowCancel ? '' : 'none'
        }
        this.show()
    }

    isVisible() {
        return !!this.element && this.element.classList.contains('visible')
    }
}
