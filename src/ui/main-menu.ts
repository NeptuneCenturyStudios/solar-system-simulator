import { FlightControlsPanel } from './flight-controls-panel';
import { ManagementPanel } from './management-panel';
import { Panel } from './panel';

export class MainMenu extends Panel {
    toggleMenuBtn: HTMLButtonElement | null = null;
    toolbarLeft: HTMLElement | null = null;

    // Bottom toolbar elements
    btnNormalSpeed: HTMLButtonElement | null = null;
    btnForwardSpeed: HTMLButtonElement | null = null;
    btnReverseSpeed: HTMLButtonElement | null = null;
    btnPause: HTMLButtonElement | null = null;
    btnOpenExplorer: HTMLButtonElement | null = null;

    // Left toolbar buttons
    btnDonate: HTMLButtonElement | null = null;
    btnEditSolarSystem: HTMLButtonElement | null = null;
    btnFlightControls: HTMLButtonElement | null = null;
    btnReset: HTMLButtonElement | null = null;

    // Panels
    systemExplorerPanel: HTMLElement | null = null;
    flightControlsPanel: FlightControlsPanel;
    managementPanel: ManagementPanel;

    // State variables
    timeScale: number = 1;

    constructor(elementId: string | HTMLElement) {
        super(elementId);

        // Initialize control panels
        this.flightControlsPanel = new FlightControlsPanel('flight-controls-panel');
        this.managementPanel = new ManagementPanel('management-panel');

        this.flightControlsPanel.initialize();
        this.managementPanel.initialize();
    }

    initialize(): void {
        // Add event listeners for menu buttons
        this.toggleMenuBtn = document.getElementById('btn-toggle-menu') as HTMLButtonElement;
        this.toolbarLeft = document.getElementById('toolbar-left') as HTMLElement;

        // Bottom toolbar buttons
        this.btnNormalSpeed = document.getElementById('btn-normal-speed') as HTMLButtonElement;
        this.btnForwardSpeed = document.getElementById('btn-forward-speed') as HTMLButtonElement;
        this.btnReverseSpeed = document.getElementById('btn-reverse-speed') as HTMLButtonElement;
        this.btnPause = document.getElementById('btn-pause') as HTMLButtonElement;
        this.btnOpenExplorer = document.getElementById('btn-open-explorer') as HTMLButtonElement;
        this.systemExplorerPanel = document.getElementById('system-explorer') as HTMLElement;

        // Bottom toolbar buttons
        this.btnDonate = document.getElementById('btn-donate') as HTMLButtonElement;
        this.btnEditSolarSystem = document.getElementById(
            'btn-edit-solar-system'
        ) as HTMLButtonElement;
        this.btnFlightControls = document.getElementById('flightControlsBtn') as HTMLButtonElement;
        this.btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

        // Set up event listeners for buttons and other interactive elements
        if (this.toggleMenuBtn) {
            this.toggleMenuBtn.onclick = () => {
                this.setLeftToolbarVisibility(!this.toolbarLeft?.classList.contains('visible'));
            };
        }

        // Set up event listeners for bottom toolbar buttons
        if (this.btnReverseSpeed) {
            this.btnReverseSpeed.onclick = () => {
                this.timeScale /= 2; // Halve the time scale for reverse/slow
                if (this.timeScale < 0.01) this.timeScale = 0.01; // Prevent time scale from getting too small
                this.emit('timeScaleChange', { value: this.timeScale });
            };
        }

        if (this.btnPause) {
            this.btnPause.onclick = () => {
                this.emit('pause');
            };
        }

        if (this.btnNormalSpeed) {
            this.btnNormalSpeed.onclick = () => {
                this.timeScale = 1;
                this.emit('timeScaleChange', { value: this.timeScale });
            };
        }

        if (this.btnForwardSpeed) {
            this.btnForwardSpeed.onclick = () => {
                this.timeScale *= 2; // Double the time scale for forward speed
                if (this.timeScale > 128) this.timeScale = 128; // Cap the time scale to prevent it from getting too high
                this.emit('timeScaleChange', { value: this.timeScale });
            };
        }

        // Explorer button event
        if (this.btnOpenExplorer && this.systemExplorerPanel) {
            this.btnOpenExplorer.onclick = () => {
                this.systemExplorerPanel?.classList.toggle('visible');
                if (this.systemExplorerPanel?.classList.contains('visible')) {
                    this.btnOpenExplorer?.classList.add('active');
                    // Close the left toolbar
                    this.setLeftToolbarVisibility(false);
                } else {
                    this.btnOpenExplorer?.classList.remove('active');
                }
            };
        }

        // Left toolbar button events
        if (this.btnDonate) {
            this.btnDonate.onclick = () => {
                window.open('https://ko-fi.com/neptunecentury', '_blank', 'noopener,noreferrer');
            };
        }

        if (this.btnEditSolarSystem) {
            this.btnEditSolarSystem.onclick = () => {
                const visible = this.managementPanel.toggle();
                if (visible) {
                    this.btnEditSolarSystem?.classList.add('active');
                } else {
                    this.btnEditSolarSystem?.classList.remove('active');
                }
                // Hide left toolbar
                this.setLeftToolbarVisibility(false);
            };
        }

        if (this.btnFlightControls) {
            this.btnFlightControls.onclick = () => {
                this.flightControlsPanel.toggle();
                // Update spawn button label to reflect whether there is a re-enterable ship
                //updateFlightSpawnBtnLabel();
                // Hide the left toolbar
                this.setLeftToolbarVisibility(false);
            };
        }

        if (this.btnReset) {
            this.btnReset.onclick = () => {
                this.emit('reset');
            };
        }
    }

    setPauseState(isPaused: boolean) {
        if (this.btnPause) {
            if (isPaused) {
                this.btnPause.classList.add('active');
            } else {
                this.btnPause.classList.remove('active');
            }
        }
    }

    setLeftToolbarVisibility(visible: boolean) {
        if (this.toolbarLeft) {
            if (visible) {
                this.toolbarLeft.classList.add('visible');
            } else {
                this.toolbarLeft.classList.remove('visible');
            }
        }
    }
}
