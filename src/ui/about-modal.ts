/**
 * Modal dialog for displaying "About" information in the UI.
 * Handles open/close logic, overlay, and keyboard events.
 */
export class AboutModal {
    overlayId: string;
    openBtnId: string;
    closeBtnId: string;
    overlay: HTMLElement | null;
    openBtn: HTMLElement | null;
    closeBtn: HTMLElement | null;
    onKeyDown: (e: KeyboardEvent) => void;

    /**
     * Constructs an AboutModal instance.
     * @param overlayId - The DOM id for the overlay element.
     * @param openBtnId - The DOM id for the open button.
     * @param closeBtnId - The DOM id for the close button.
     */
    constructor(overlayId: string, openBtnId: string, closeBtnId: string) {
        this.overlayId = overlayId;
        this.openBtnId = openBtnId;
        this.closeBtnId = closeBtnId;
        this.overlay = null;
        this.openBtn = null;
        this.closeBtn = null;
        this.onKeyDown = this._onKeyDown.bind(this);
    }

    /**
     * Initializes the modal by binding DOM elements and event listeners.
     */
    initialize() {
        this.overlay = document.getElementById(this.overlayId);
        this.openBtn = document.getElementById(this.openBtnId);
        this.closeBtn = document.getElementById(this.closeBtnId);

        if (this.openBtn) {
            this.openBtn.addEventListener('click', () => this.open());
        }

        if (this.closeBtn) {
            this.closeBtn.addEventListener('click', () => this.close());
        }

        if (this.overlay) {
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.close();
                }
            });
        }

        document.addEventListener('keydown', this.onKeyDown);
    }

    /**
     * Handles Escape key to close the modal if visible.
     * @param e
     */
    private _onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape' && this.isVisible()) {
            this.close();
        }
    }

    /**
     * Opens the modal overlay.
     */
    open() {
        this.overlay?.classList.add('visible');
    }

    /**
     * Closes the modal overlay.
     */
    close() {
        this.overlay?.classList.remove('visible');
    }

    /**
     * Checks if the modal is currently visible.
     * @returns True if visible, false otherwise.
     */
    isVisible(): boolean {
        return !!this.overlay?.classList.contains('visible');
    }
}
