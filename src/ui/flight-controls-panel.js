import { Panel } from './panel.js';

/**
 * Flight Controls panel.
 * Emits: 'spawnShip', 'toggleView', 'exitFlight', 'autopilot'
 */
export class FlightControlsPanel extends Panel {
    constructor(elementId) {
        super(elementId);
        this.spawnBtn = null;
        this.toggleViewBtn = null;
        this.exitBtn = null;
        this.autopilotBtn = null;
    }

    initialize() {
        this.spawnBtn = document.getElementById('flightSpawnBtn');
        this.toggleViewBtn = document.getElementById('flightToggleViewBtn');
        this.exitBtn = document.getElementById('flightExitBtn');
        this.autopilotBtn = document.getElementById('flightAutopilotBtn');

        if (this.spawnBtn) {
            this.spawnBtn.onclick = () => this.emit('spawnShip');
        }
        if (this.toggleViewBtn) {
            this.toggleViewBtn.onclick = () => this.emit('toggleView');
        }
        if (this.exitBtn) {
            this.exitBtn.onclick = () => this.emit('exitFlight');
        }
        if (this.autopilotBtn) {
            this.autopilotBtn.onclick = () => this.emit('autopilot', {});
        }

        // Start with toggle/exit/autopilot disabled (no active ship yet)
        this.setFlightActive(false);
        this.setAutopilotState(false, false);
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

    /**
     * Update the autopilot button state.
     * @param {boolean} isEngaged  - Whether autopilot is currently running.
     * @param {boolean} isEnabled  - Whether the button should be clickable.
     */
    setAutopilotState(isEngaged, isEnabled) {
        if (!this.autopilotBtn) return;
        this.autopilotBtn.disabled = !isEnabled;
        const iconEl = this.autopilotBtn.querySelector('.material-symbols-outlined');
        if (isEngaged) {
            this.autopilotBtn.classList.add('active');
            if (iconEl) iconEl.textContent = 'cancel';
            while (iconEl && iconEl.nextSibling) this.autopilotBtn.removeChild(iconEl.nextSibling);
            if (iconEl) this.autopilotBtn.appendChild(document.createTextNode(' CANCEL AUTOPILOT'));
        } else {
            this.autopilotBtn.classList.remove('active');
            if (iconEl) iconEl.textContent = 'rocket';
            while (iconEl && iconEl.nextSibling) this.autopilotBtn.removeChild(iconEl.nextSibling);
            if (iconEl) this.autopilotBtn.appendChild(document.createTextNode(' AUTOPILOT'));
        }
    }
}
