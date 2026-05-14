import { Panel } from './panel';

export class MainMenu extends Panel {
    toggleMenuBtn: HTMLButtonElement | null = null;
    toolbarLeft: HTMLElement | null = null;

    constructor(elementId: string | HTMLElement) {
        super(elementId);
    }

    initialize(): void {
        // Add event listeners for menu buttons
        this.toggleMenuBtn = document.getElementById('toggleMenuBtn') as HTMLButtonElement;
        this.toolbarLeft = document.getElementById('toolbarLeft') as HTMLElement;

        // Set up event listeners for buttons and other interactive elements
        if (this.toggleMenuBtn) {
            this.toggleMenuBtn.onclick = () => this.toolbarLeft?.classList.toggle('visible');
        }
    }
}
