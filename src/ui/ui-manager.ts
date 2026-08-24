import { Panel } from './panel';
import { TextureGeneratorPanel } from './texture-generator-panel';

export class UIManager extends Panel {
    toolbarLeft: HTMLElement | null = null;

    // Left toolbar buttons

    btnTextureGenerator: HTMLButtonElement | null = null;

    // Panels
    textureGeneratorPanel: TextureGeneratorPanel;

    constructor(elementId: string | HTMLElement) {
        super(elementId);

        // Initialize control panels
        this.textureGeneratorPanel = new TextureGeneratorPanel('texture-generator-panel');
        this.textureGeneratorPanel.initialize();
    }

    initialize(): void {
        // Add event listeners for menu buttons

        this.toolbarLeft = document.getElementById('toolbar-left') as HTMLElement;

        this.btnTextureGenerator = document.getElementById(
            'btn-texture-generator'
        ) as HTMLButtonElement;

        // Block events on UI elements to prevent them from affecting the 3D scene
        this.blockUIEvents(this.toolbarLeft);

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
