import { IProceduralGeneratorPromptResult } from '../interfaces';
import {
    ProceduralGenerationProgress,
    ProceduralGenerationReporter,
} from '../procedural/procedural-generation-progress';
import { Panel } from './panel';

type ModalState = 'idle' | 'seed-entry' | 'generating' | 'retry';

/**
 * Standalone modal for the procedural system generator.
 * Call `prompt()` to display the seed-entry form; it returns when the user
 * clicks Create ({ seed }) or Cancel (null).
 *
 * While generation is running, the modal shows a progress section.
 * The Cancel button in that state emits 'cancelRequested'.
 * If the user cancels from the retry seed form, 'cancelFromRetry' is emitted.
 */
export class ProceduralGeneratorModal extends Panel {
    private _seedInput: HTMLInputElement | null = null;
    private _cancelBtn: HTMLButtonElement | null = null;
    private _createBtn: HTMLButtonElement | null = null;

    private _seedSectionEl: HTMLElement | null = null;
    private _progressSectionEl: HTMLElement | null = null;
    private _progressStatusEl: HTMLElement | null = null;
    private _progressTextEl: HTMLElement | null = null;
    private _progressBarFillEl: HTMLElement | null = null;
    private _progressErrorEl: HTMLElement | null = null;

    private _cancelRequested = false;
    private _state: ModalState = 'idle';
    private _promptResolve: ((value: { seed: string } | null) => void) | null = null;
    private _headerEl: HTMLElement | null = null;

    private _progressReporter: ProceduralGenerationReporter;

    constructor() {
        super('procedural-overlay');

        this._progressReporter = {
            setTotal: (total: number) => {
                console.log(`Total: ${total}`);
                
            },
            report: (progress: ProceduralGenerationProgress) => {
                console.log(`Progress: ${progress.completed}/${progress.total}`);
                this.reportProgress(progress.completed, progress.total, progress.workUnit?.label);
            },
        };
    }

    initialize() {
        this._headerEl = this.element?.querySelector('.modal-header') as HTMLElement | null;
        this._seedInput = document.getElementById('proceduralSeedInput') as HTMLInputElement | null;
        this._cancelBtn = document.getElementById(
            'proceduralCancelBtn'
        ) as HTMLButtonElement | null;
        this._createBtn = document.getElementById(
            'proceduralCreateBtn'
        ) as HTMLButtonElement | null;

        this._seedSectionEl = document.getElementById(
            'procedural-seed-section'
        ) as HTMLElement | null;
        this._progressSectionEl = document.getElementById(
            'procedural-progress-section'
        ) as HTMLElement | null;
        this._progressStatusEl = document.getElementById(
            'procedural-progress-status'
        ) as HTMLElement | null;
        this._progressTextEl = document.getElementById(
            'procedural-progress-text'
        ) as HTMLElement | null;
        this._progressBarFillEl = document.getElementById(
            'procedural-progress-bar-fill'
        ) as HTMLElement | null;
        this._progressErrorEl = document.getElementById(
            'procedural-progress-error'
        ) as HTMLElement | null;

        if (this._createBtn) {
            this._createBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const seed = this._seedInput?.value?.trim() ?? '';
                if (this._state === 'seed-entry' && this._promptResolve) {
                    const resolve = this._promptResolve;
                    this._promptResolve = null;
                    this._state = 'idle';
                    resolve({ seed });
                } else if (this._state === 'retry') {
                    this.emit('create', { seed });
                }
            });
        }

        if (this._cancelBtn) {
            this._cancelBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this._state === 'seed-entry' && this._promptResolve) {
                    const resolve = this._promptResolve;
                    this._promptResolve = null;
                    this._state = 'idle';
                    this.hide();
                    resolve(null);
                } else if (this._state === 'generating') {
                    this.markCancelRequested();
                    this.emit('cancelRequested');
                } else if (this._state === 'retry') {
                    this.emit('cancelFromRetry');
                }
            });
        }
    }

    isVisible(): boolean {
        return !!this.element && this.element.classList.contains('visible');
    }

    /**
     * Shows the modal with the seed-entry form and waits for the user to act.
     * Resolves with `{ seed }` when Create is clicked, or `null` when Cancel is clicked.
     * Safe to call while the modal is already visible (e.g. after a failed generation).
     * @param opts.title Optional header text override (restored after the promise resolves).
     */
    prompt(opts: { title?: string } = {}): Promise<IProceduralGeneratorPromptResult | null> {
        return new Promise((resolve) => {
            this._promptResolve = (value) => {
                if (opts.title && this._headerEl) {
                    this._headerEl.textContent = 'Generate Procedural System';
                }

                const returnValue: IProceduralGeneratorPromptResult = {
                    seed: value?.seed ?? '',
                };

                resolve(returnValue);
            };
            if (opts.title && this._headerEl) {
                this._headerEl.textContent = opts.title;
            }
            this._cancelRequested = false;
            this._state = 'seed-entry';

            // Reset progress UI
            if (this._progressSectionEl) this._progressSectionEl.style.display = 'none';
            if (this._progressErrorEl) this._progressErrorEl.style.display = 'none';
            if (this._progressStatusEl) this._progressStatusEl.textContent = '';
            if (this._progressTextEl) this._progressTextEl.textContent = '';
            if (this._progressBarFillEl) this._progressBarFillEl.style.width = '0%';

            // Show seed section and unlock inputs
            if (this._seedSectionEl) this._seedSectionEl.style.display = 'block';
            if (this._createBtn) this._createBtn.disabled = false;
            if (this._seedInput) this._seedInput.disabled = false;
            if (this._cancelBtn) this._cancelBtn.disabled = false;

            // Show the overlay if not already visible
            if (this.element) {
                this.element.classList.add('visible');
                this.element.style.pointerEvents = 'auto';
            }

            if (this._seedInput) {
                setTimeout(() => this._seedInput?.focus?.(), 0);
            }
        });
    }

    /**
     * Switches to the progress display. Call this immediately before starting generation.
     */
    showProgressUI() {
        this._state = 'generating';
        if (this.element) this.element.style.pointerEvents = 'auto';
        if (this._seedSectionEl) this._seedSectionEl.style.display = 'none';
        if (this._progressSectionEl) this._progressSectionEl.style.display = 'block';
        if (this._progressErrorEl) this._progressErrorEl.style.display = 'none';
        this._setProgressStatus('Generating...');

        // While generating, disable the Cancel button to prevent interruption. It will be re-enabled once generation is complete.
        if (this._cancelBtn) {
            this._cancelBtn.disabled = true;
            this._cancelBtn.style.pointerEvents = 'auto';
        }

        // Also disable the Create button to prevent starting a new generation while one is in progress.
        if (this._createBtn) {
            this._createBtn.disabled = true;
            this._createBtn.style.pointerEvents = 'auto';
        }

        return this._progressReporter;
    }

    /**
     * Locks or unlocks the Create/seed inputs. Cancel is always left enabled.
     */
    setInputsLocked(locked: boolean) {
        if (this._createBtn) this._createBtn.disabled = locked;
        if (this._seedInput) this._seedInput.disabled = locked;
        if (this._cancelBtn) this._cancelBtn.disabled = false;
    }

    /**
     * Marks cancellation as requested and immediately shows "Canceling" in the status.
     */
    markCancelRequested() {
        this._cancelRequested = true;
        this._setProgressStatus('Canceling');
    }

    setProgressTotal(total: number) {
        if (!this._cancelRequested) this._setProgressStatus('Generating...');
        if (this._progressTextEl) this._progressTextEl.textContent = `0 / ${total}`;
        if (this._progressBarFillEl) this._progressBarFillEl.style.width = '0%';
    }

    reportProgress(completed: number, total: number, workUnitLabel?: string) {
        console.log(`Progress: ${completed} / ${total}`);
        if (this._progressBarFillEl) {
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            this._progressBarFillEl.style.width = `${pct}%`;
        }
        if (this._progressTextEl) {
            this._progressTextEl.textContent = `${completed} / ${total}`;
        }
        if (this._cancelRequested) {
            this._setProgressStatus('Canceling');
            return;
        }
        const label = workUnitLabel ?? '';
        this._setProgressStatus(label || 'Generating...');
    }

    setProgressErrorVisible(visible: boolean) {
        if (this._progressErrorEl) {
            this._progressErrorEl.style.display = visible ? '' : 'none';
        }
    }

    setProgressStatusText(text: string) {
        this._setProgressStatus(text);
    }

    /**
     * Returns the modal to seed-entry form after a failed generation so the user can retry.
     * The Create button will emit 'create'; Cancel will emit 'cancelFromRetry'.
     */
    showSeedSectionForRetry() {
        this._state = 'retry';
        if (this._progressSectionEl) this._progressSectionEl.style.display = 'none';
        if (this._seedSectionEl) this._seedSectionEl.style.display = 'block';
    }

    private _setProgressStatus(text: string) {
        if (this._progressStatusEl) this._progressStatusEl.textContent = text;
    }
}
