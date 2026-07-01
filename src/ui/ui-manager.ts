import { FlightControlsPanel } from './flight-controls-panel';
import { MainPanel } from './main-panel';
import { ManagementPanel } from './management-panel';
import { Panel } from './panel';
import { PlaylistPanel } from './playlist-panel';

export class UIManager extends Panel {
    toolbarBottom: HTMLElement | null = null;
    toolbarLeft: HTMLElement | null = null;

    // Bottom toolbar elements
    toggleMenuBtn: HTMLButtonElement | null = null;
    btnOpenExplorer: HTMLButtonElement | null = null;
    btnNormalSpeed: HTMLButtonElement | null = null;
    btnForwardSpeed: HTMLButtonElement | null = null;
    btnReverseSpeed: HTMLButtonElement | null = null;
    btnPause: HTMLButtonElement | null = null;

    // Left toolbar buttons
    btnDonate: HTMLButtonElement | null = null;
    btnEditSolarSystem: HTMLButtonElement | null = null;
    btnFlightControls: HTMLButtonElement | null = null;
    btnPlaylist: HTMLButtonElement | null = null;
    btnReset: HTMLButtonElement | null = null;

    // Panels
    mainPanel: MainPanel;
    flightControlsPanel: FlightControlsPanel;
    managementPanel: ManagementPanel;
    playlistPanel: PlaylistPanel;

    // State variables
    timeScale: number = 1;

    constructor(elementId: string | HTMLElement) {
        super(elementId);

        // Initialize control panels
        this.flightControlsPanel = new FlightControlsPanel('flight-controls-panel');
        this.managementPanel = new ManagementPanel('management-panel');
        this.mainPanel = new MainPanel('system-explorer');
        this.playlistPanel = new PlaylistPanel('playlist-panel');

        this.flightControlsPanel.initialize();
        this.managementPanel.initialize();
        this.mainPanel.initialize();
        this.playlistPanel.initialize();
    }

    initialize(): void {
        // Add event listeners for menu buttons
        this.toolbarBottom = document.getElementById('toolbar-bottom') as HTMLElement;
        this.toolbarLeft = document.getElementById('toolbar-left') as HTMLElement;

        // Bottom toolbar buttons
        this.toggleMenuBtn = document.getElementById('btn-toggle-menu') as HTMLButtonElement;
        this.btnOpenExplorer = document.getElementById('btn-open-explorer') as HTMLButtonElement;
        this.btnNormalSpeed = document.getElementById('btn-normal-speed') as HTMLButtonElement;
        this.btnForwardSpeed = document.getElementById('btn-forward-speed') as HTMLButtonElement;
        this.btnReverseSpeed = document.getElementById('btn-reverse-speed') as HTMLButtonElement;
        this.btnPause = document.getElementById('btn-pause') as HTMLButtonElement;

        // Bottom toolbar buttons
        this.btnDonate = document.getElementById('btn-donate') as HTMLButtonElement;
        this.btnEditSolarSystem = document.getElementById(
            'btn-edit-solar-system'
        ) as HTMLButtonElement;
        this.btnFlightControls = document.getElementById('flightControlsBtn') as HTMLButtonElement;
        this.btnPlaylist = document.getElementById('btn-playlist') as HTMLButtonElement;
        this.btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

        // Block events on UI elements to prevent them from affecting the 3D scene
        this.blockUIEvents(this.toolbarBottom);
        this.blockUIEvents(this.toolbarLeft);

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
                if (this.timeScale > 2 ** 10) this.timeScale = 2 ** 10; // Cap the time scale to prevent it from getting too high
                this.emit('timeScaleChange', { value: this.timeScale });
            };
        }

        // Explorer button event
        if (this.btnOpenExplorer && this.mainPanel) {
            this.btnOpenExplorer.onclick = () => {
                const visible = this.mainPanel.toggle();
                if (visible) {
                    this.btnOpenExplorer?.classList.add('active');
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
            };
        }

        if (this.btnFlightControls) {
            this.btnFlightControls.onclick = () => {
                const visible = this.flightControlsPanel.toggle();
                if (visible) {
                    this.btnFlightControls?.classList.add('active');
                } else {
                    this.btnFlightControls?.classList.remove('active');
                }

                // Update spawn button label to reflect whether there is a re-enterable ship
                //updateFlightSpawnBtnLabel();
            };
        }

        if (this.btnReset) {
            this.btnReset.onclick = () => {
                this.emit('reset');
            };
        }

        if (this.btnPlaylist) {
            this.btnPlaylist.onclick = () => {
                const visible = this.playlistPanel.toggle();
                if (visible) {
                    this.btnPlaylist?.classList.add('active');
                    this.emit('playlistOpened');
                } else {
                    this.btnPlaylist?.classList.remove('active');
                }
            };
        }

        // Listen to panel events to update button states
        this.mainPanel.on('closed', () => {
            this.btnOpenExplorer?.classList.remove('active');
        });

        this.managementPanel.on('closed', () => {
            this.btnEditSolarSystem?.classList.remove('active');
        });

        this.flightControlsPanel.on('closed', () => {
            this.btnFlightControls?.classList.remove('active');
        });

        this.playlistPanel.on('closed', () => {
            this.btnPlaylist?.classList.remove('active');
        });
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

    /**
     * Stop mouse and keyboard events from propagating to the 3D scene when interacting with the UI.
     * @param element The HTML element to block events for.
     */
    private blockUIEvents(element: HTMLElement) {
        if (element) {
            element.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            element.addEventListener('mouseup', (e) => {
                e.stopPropagation();
            });
            element.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            // Prevent keyboard events (WASD, etc.) from triggering camera movement when typing in UI
            element.addEventListener('keydown', (e) => {
                e.stopPropagation();
            });
            element.addEventListener('keyup', (e) => {
                e.stopPropagation();
            });
        }
    }
}
