export class AboutModal {
    constructor(overlayId, openBtnId, closeBtnId) {
        this.overlayId = overlayId;
        this.openBtnId = openBtnId;
        this.closeBtnId = closeBtnId;
        this.overlay = null;
        this.openBtn = null;
        this.closeBtn = null;
        this.onKeyDown = this.onKeyDown.bind(this);
    }

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

    onKeyDown(e) {
        if (e.key === 'Escape' && this.isVisible()) {
            this.close();
        }
    }

    open() {
        this.overlay?.classList.add('visible');
    }

    close() {
        this.overlay?.classList.remove('visible');
    }

    isVisible() {
        return !!this.overlay?.classList.contains('visible');
    }
}
