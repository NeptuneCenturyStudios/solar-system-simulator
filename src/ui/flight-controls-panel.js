import { Panel } from './panel.js';

/**
 * Flight Controls panel.
 * Emits: 'spawnShip', 'toggleView', 'exitFlight'
 */
export class FlightControlsPanel extends Panel {
    constructor(elementId) {
        super(elementId);
        this.spawnBtn = null;
        this.toggleViewBtn = null;
        this.exitBtn = null;
    }

    initialize() {
        this.spawnBtn = document.getElementById('flightSpawnBtn');
        this.toggleViewBtn = document.getElementById('flightToggleViewBtn');
        this.exitBtn = document.getElementById('flightExitBtn');

        if (this.spawnBtn) {
            this.spawnBtn.onclick = () => this.emit('spawnShip');
        }
        if (this.toggleViewBtn) {
            this.toggleViewBtn.onclick = () => this.emit('toggleView');
        }
        if (this.exitBtn) {
            this.exitBtn.onclick = () => this.emit('exitFlight');
        }

        // Start with toggle/exit disabled (no active ship yet)
        this.setFlightActive(false);
    }

    /** Update toggle-view button label to reflect current perspective. */
    setViewState(isCockpit) {
        if (!this.toggleViewBtn) return;
        const iconEl = this.toggleViewBtn.querySelector('.material-symbols-outlined');
        if (iconEl) iconEl.textContent = isCockpit ? 'airline_seat_recline_normal' : 'visibility';
        // Rebuild text node after the icon span
        while (iconEl && iconEl.nextSibling) this.toggleViewBtn.removeChild(iconEl.nextSibling);
        if (iconEl)
            this.toggleViewBtn.appendChild(
                document.createTextNode(isCockpit ? ' 3RD PERSON' : ' COCKPIT VIEW')
            );
    }

    /** Enable/disable buttons depending on whether a ship is active. */
    setFlightActive(isActive) {
        if (this.spawnBtn) this.spawnBtn.disabled = isActive;
        if (this.toggleViewBtn) this.toggleViewBtn.disabled = !isActive;
        if (this.exitBtn) this.exitBtn.disabled = !isActive;
    }
}
