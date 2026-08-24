import { Panel } from './panel';
import { TextureGeneratorPanel } from './texture-generator-panel';

export class UIManager extends Panel {
    toolbarBottom: HTMLElement | null = null;
    toolbarLeft: HTMLElement | null = null;

    // Left toolbar buttons
    btnDonate: HTMLButtonElement | null = null;
    btnEditSolarSystem: HTMLButtonElement | null = null;
    btnPlaylist: HTMLButtonElement | null = null;
    btnTextureGenerator: HTMLButtonElement | null = null;
    btnReset: HTMLButtonElement | null = null;

    // Panels
    textureGeneratorPanel: TextureGeneratorPanel;

    // State variables
    timeScale: number = 1;

    constructor(elementId: string | HTMLElement) {
        super(elementId);

        // Initialize control panels
        this.textureGeneratorPanel = new TextureGeneratorPanel('texture-generator-panel');
        this.textureGeneratorPanel.initialize();
    }

    initialize(): void {
        // Add event listeners for menu buttons
        this.toolbarBottom = document.getElementById('toolbar-bottom') as HTMLElement;
        this.toolbarLeft = document.getElementById('toolbar-left') as HTMLElement;

        // Bottom toolbar buttons
        this.btnDonate = document.getElementById('btn-donate') as HTMLButtonElement;
        this.btnEditSolarSystem = document.getElementById(
            'btn-edit-solar-system'
        ) as HTMLButtonElement;
        this.btnPlaylist = document.getElementById('btn-playlist') as HTMLButtonElement;
        this.btnTextureGenerator = document.getElementById(
            'btn-texture-generator'
        ) as HTMLButtonElement;
        this.btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

        // Block events on UI elements to prevent them from affecting the 3D scene
        this.blockUIEvents(this.toolbarBottom);
        this.blockUIEvents(this.toolbarLeft);


        // Left toolbar button events
        if (this.btnDonate) {
            this.btnDonate.onclick = () => {
                window.open('https://ko-fi.com/neptunecentury', '_blank', 'noopener,noreferrer');
            };
        }


        if (this.btnReset) {
            this.btnReset.onclick = () => {
                this.emit('reset');
            };
        }

        // Listen to panel events to update button states

        if (this.btnTextureGenerator) {
            this.btnTextureGenerator.onclick = () => {
                const visible = this.textureGeneratorPanel.toggle();
                if (visible) {
                    this.btnTextureGenerator?.classList.add('active');
                } else {
                    this.btnTextureGenerator?.classList.remove('active');
                }
            };
        }

        this.textureGeneratorPanel.on('closed', () => {
            this.btnTextureGenerator?.classList.remove('active');
        });
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
