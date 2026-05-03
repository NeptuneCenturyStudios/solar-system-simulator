import { Panel } from './panel';

/**
 * Startup modal shown before first launch and on reset.
 * Handles launch options and modal overlay logic.
 */
export class StartupModal extends Panel {
    modalEl: HTMLElement | null;
    launchDefaultBtn: HTMLButtonElement | null;
    launchEmptyBtn: HTMLButtonElement | null;
    launchBlackHoleBtn: HTMLButtonElement | null;
    cancelBtn: HTMLButtonElement | null;
    _allowCancel: boolean;

    constructor(elementId: string) {
        super(elementId);
        this.modalEl = document.getElementById('startup-modal');
        this.launchDefaultBtn = null;
        this.launchEmptyBtn = null;
        this.launchBlackHoleBtn = null;
        this.cancelBtn = null;
        this._allowCancel = false;
    }

    initialize() {
        this.launchDefaultBtn = document.getElementById('startupLaunchDefaultBtn') as HTMLButtonElement | null;
        this.launchEmptyBtn = document.getElementById('startupLaunchEmptyBtn') as HTMLButtonElement | null;
        this.launchBlackHoleBtn = document.getElementById('startupLaunchBlackHoleBtn') as HTMLButtonElement | null;
        this.cancelBtn = document.getElementById('startupCancelBtn') as HTMLButtonElement | null;

        if (this.element) {
            const stop = (e: Event) => {
                e.preventDefault();
                e.stopPropagation();
            };
            ['mousedown', 'mouseup', 'mousemove', 'click', 'wheel', 'keydown', 'keyup'].forEach(
                (evt) => this.element!.addEventListener(evt, stop, { passive: false })
            );
        }

        if (this.launchDefaultBtn) {
            this.launchDefaultBtn.onclick = () => this.emit('launchDefault');
        }
        if (this.launchEmptyBtn) {
            this.launchEmptyBtn.onclick = () => this.emit('launchEmpty');
        }
        if (this.launchBlackHoleBtn) {
            this.launchBlackHoleBtn.onclick = () => this.emit('launchBlackHole');
        }
        if (this.cancelBtn) {
            this.cancelBtn.onclick = () => this.emit('cancel');
        }
    }

    open({ allowCancel = false }: { allowCancel?: boolean } = {}) {
        this._allowCancel = !!allowCancel;
        if (this.cancelBtn) {
            this.cancelBtn.style.display = this._allowCancel ? '' : 'none';
        }
        this.show();
    }

    isVisible(): boolean {
        return !!this.element && this.element.classList.contains('visible');
    }
}
