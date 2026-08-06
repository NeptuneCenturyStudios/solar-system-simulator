import { Body } from '../bodies/body';
import { Spaceship } from '../bodies/ships/spaceship';
import { Panel } from './panel';

/**
 * Flight Controls panel for managing ship controls in the UI.
 * Emits: 'spawnShip', 'toggleView', 'exitFlight', 'autopilot'.
 */
export class FlightControlsPanel extends Panel {
    spawnBtn: HTMLButtonElement | null;
    shipModelSelect: HTMLSelectElement | null;

    autopilotBtn: HTMLButtonElement | null;
    btnClose: HTMLButtonElement | null;

    constructor(elementId: string) {
        super(elementId);
        this.spawnBtn = null;
        this.shipModelSelect = null;

        this.autopilotBtn = null;
        this.btnClose = null;
    }

    initialize() {
        this.btnClose = document.getElementById(
            'btn-close-flight-controls-panel'
        ) as HTMLButtonElement | null;

        if (this.btnClose) {
            this.btnClose.onclick = () => {
                this.toggle();
                this.emit('closed');
            };
        }

        this.spawnBtn = document.getElementById('flightSpawnBtn') as HTMLButtonElement | null;
        this.shipModelSelect = document.getElementById(
            'flightShipModelSelect'
        ) as HTMLSelectElement | null;

        this.autopilotBtn = document.getElementById(
            'flightAutopilotBtn'
        ) as HTMLButtonElement | null;

        if (this.spawnBtn) {
            this.spawnBtn.onclick = () => this.emit('spawnShip');
        }

        if (this.shipModelSelect) {
            this.shipModelSelect.onchange = () =>
                this.emit('modelChanged', { modelName: this.getSelectedModel() });
        }

        if (this.autopilotBtn) {
            this.autopilotBtn.onclick = () => this.emit('autopilot', {});
        }

        // Start with autopilot disabled (no active ship yet)
        this.setFlightActive(false);
        this.setAutopilotState(false, false);
    }

    setFlightActive(isActive: boolean) {
        if (this.spawnBtn) this.spawnBtn.disabled = isActive;
    }

    setAutopilotState(isEngaged: boolean, isEnabled: boolean) {
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

    /** Update the spawn/re-enter button label based on whether a live ship exists. */
    updateFlightSpawnBtnLabel(ship: Spaceship | null, bodies: Body[]) {
        const btn = document.getElementById('flightSpawnBtn');
        if (!btn) return;

        const canReenter = ship && !ship._isDisposed && bodies.includes(ship as Body);
        const iconEl = btn.querySelector('.material-symbols-outlined');
        if (iconEl) iconEl.textContent = canReenter ? 'login' : 'rocket_launch';
        while (iconEl && iconEl.nextSibling) btn.removeChild(iconEl.nextSibling);
        if (iconEl)
            btn.appendChild(
                document.createTextNode(canReenter ? ' ENTER SHIP' : ' SPAWN SPACESHIP')
            );
    }

    /** Returns the currently selected ship model base name (without extension). */
    getSelectedModel(): string {
        return this.shipModelSelect?.value ?? 'Lo_poly_Spaceship_01_by_Liz_Reddington';
    }
}
