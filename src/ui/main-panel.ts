import { Panel } from './panel';
import { escapeHtml } from './html';
import { Body } from '../bodies/body';

/**
 * Main control panel managing camera, time controls, and settings for the simulation UI.
 */
export class MainPanel extends Panel {
    freeCameraBtn: HTMLButtonElement | null = null;
    zoomInBtn: HTMLButtonElement | null = null;
    zoomOutBtn: HTMLButtonElement | null = null;
    bodiesTableContainer: HTMLElement | null = null;
    _selectedBodyRef: Body | null = null;
    lockToSunCheckbox: HTMLInputElement | null = null;
    showTrailsCheckbox: HTMLInputElement | null = null;
    showPredictionCheckbox: HTMLInputElement | null = null;
    showNamesCheckbox: HTMLInputElement | null = null;
    timeScaleDisplay: HTMLElement | null = null;
    copyrightYearEl: HTMLElement | null = null;
    targetBtn: HTMLButtonElement | null = null;
    lookAtBtn: HTMLButtonElement | null = null;
    surfaceCameraBtn: HTMLButtonElement | null = null;
    btnClose: HTMLButtonElement | null = null;

    constructor(elementId: string) {
        super(elementId);
    }

    initialize() {
        this.btnClose = document.getElementById(
            'btn-close-system-explorer'
        ) as HTMLButtonElement | null;
        this.bodiesTableContainer = document.getElementById('bodiesTableContainer');
        this.targetBtn = document.getElementById('camTargetBtn') as HTMLButtonElement | null;
        this.lookAtBtn = document.getElementById('camLookAtBtn') as HTMLButtonElement | null;
        this.freeCameraBtn = document.getElementById('freeCameraBtn') as HTMLButtonElement | null;
        this.surfaceCameraBtn = document.getElementById(
            'surfaceCameraBtn'
        ) as HTMLButtonElement | null;
        this.zoomInBtn = document.getElementById('zoomInBtn') as HTMLButtonElement | null;
        this.zoomOutBtn = document.getElementById('zoomOutBtn') as HTMLButtonElement | null;

        if (this.btnClose) {
            this.btnClose.onclick = () => {
                this.toggle();
                this.emit('closed');
            };
        }

        if (this.bodiesTableContainer) {
            this.renderBodiesTable([]);
        }

        if (this.targetBtn) {
            this.targetBtn.onclick = () => this.emit('targetToggle');
        }
        if (this.lookAtBtn) {
            this.lookAtBtn.onclick = () => this.emit('lookAtToggle');
        }
        if (this.freeCameraBtn) {
            this.freeCameraBtn.onclick = () => this.emit('freeCameraToggle');
        }
        if (this.surfaceCameraBtn) {
            this.surfaceCameraBtn.onclick = () => this.emit('surfaceCameraToggle');
        }
        if (this.zoomInBtn) {
            this.zoomInBtn.onclick = () => this.emit('zoomIn');
        }
        if (this.zoomOutBtn) {
            this.zoomOutBtn.onclick = () => this.emit('zoomOut');
        }

        this.lockToSunCheckbox = document.getElementById('lockToSun') as HTMLInputElement | null;
        this.showTrailsCheckbox = document.getElementById('showTrails') as HTMLInputElement | null;
        this.showPredictionCheckbox = document.getElementById(
            'showOrbitPrediction'
        ) as HTMLInputElement | null;
        this.showNamesCheckbox = document.getElementById('showNames') as HTMLInputElement | null;
        this.timeScaleDisplay = document.getElementById('speed-val');
        this.copyrightYearEl = document.getElementById('copyrightYear');

        if (this.copyrightYearEl) {
            this.copyrightYearEl.textContent = new Date().getFullYear().toString();
        }

        if (this.lockToSunCheckbox) {
            this.lockToSunCheckbox.onchange = () => {
                this.emit('lockToSunChange', { checked: this.lockToSunCheckbox!.checked });
            };
        }

        if (this.showTrailsCheckbox) {
            this.showTrailsCheckbox.onchange = () => {
                this.emit('trailsChange', { checked: this.showTrailsCheckbox!.checked });
            };
        }

        if (this.showPredictionCheckbox) {
            this.showPredictionCheckbox.onchange = () => {
                this.emit('predictionChange', { checked: this.showPredictionCheckbox!.checked });
            };
        }

        if (this.showNamesCheckbox) {
            this.showNamesCheckbox.onchange = () => {
                this.emit('namesChange', { checked: this.showNamesCheckbox!.checked });
            };
        }
    }

    updateTimeScaleDisplay(value: string) {
        if (this.timeScaleDisplay) {
            this.timeScaleDisplay.textContent = `${value}`;
        }
    }

    _ensureButtonIconEl(btn: HTMLElement | null): HTMLElement | null {
        if (!btn) return null;
        return btn.querySelector('.material-symbols-outlined');
    }

    _setButtonIcon(btn: HTMLElement | null, iconName: string) {
        const iconEl = this._ensureButtonIconEl(btn);
        if (iconEl) iconEl.textContent = iconName;
    }

    _setButtonLabel(btn: HTMLElement | null, labelText: string) {
        if (!btn) return;
        const iconEl = btn.querySelector('.material-symbols-outlined');
        if (!iconEl) {
            btn.textContent = labelText;
            return;
        }
        while (iconEl.nextSibling) {
            btn.removeChild(iconEl.nextSibling);
        }
        btn.appendChild(document.createTextNode(' ' + labelText));
    }

    setFreeCameraState(isActive: boolean) {
        if (this.freeCameraBtn) {
            if (isActive) {
                this.freeCameraBtn.classList.add('active');
                this._setButtonIcon(this.freeCameraBtn, 'close_fullscreen');
                this.freeCameraBtn.title = 'Free Camera (On)';
            } else {
                this.freeCameraBtn.classList.remove('active');
                this._setButtonIcon(this.freeCameraBtn, 'videogame_asset');
                this.freeCameraBtn.title = 'Free Camera (Off)';
            }
        }
    }

    setSurfaceCameraState({ isActive, isEnabled }: { isActive: boolean; isEnabled: boolean }) {
        if (!this.surfaceCameraBtn) return;
        this.surfaceCameraBtn.disabled = !isEnabled;
        if (isActive) {
            this.surfaceCameraBtn.classList.add('active');
            this._setButtonIcon(this.surfaceCameraBtn, 'directions_walk');
            this.surfaceCameraBtn.title = 'Surface (On)';
        } else {
            this.surfaceCameraBtn.classList.remove('active');
            this._setButtonIcon(this.surfaceCameraBtn, 'hiking');
            this.surfaceCameraBtn.title = 'Surface (Off)';
        }
    }

    setLookAtState(isActive: boolean) {
        if (!this.lookAtBtn) return;
        if (isActive) {
            this.lookAtBtn.classList.add('active');
            this._setButtonIcon(this.lookAtBtn, 'visibility');
            this.lookAtBtn.title = 'Look At (On)';
        } else {
            this.lookAtBtn.classList.remove('active');
            this._setButtonIcon(this.lookAtBtn, 'visibility_off');
            this.lookAtBtn.title = 'Look At (Off)';
        }
    }

    setTargetState(isActive: boolean) {
        if (!this.targetBtn) return;
        if (isActive) {
            this.targetBtn.classList.add('active');
            this._setButtonIcon(this.targetBtn, 'my_location');
            this.targetBtn.title = 'Target (On)';
        } else {
            this.targetBtn.classList.remove('active');
            this._setButtonIcon(this.targetBtn, 'location_searching');
            this.targetBtn.title = 'Target (Off)';
        }
    }

    renderBodiesTable(
        rows: Array<{ name: string; typeLabel: string; body: Body; isShip: boolean }>,
        hasShip = false,
        autopilotTarget: Body | null = null
    ) {
        if (!this.bodiesTableContainer) return;
        const safeRows = Array.isArray(rows) ? rows : [];
        const html = `
            <table>
                <thead>
                    <tr>
                        <th style="width: 50%">Name</th>
                        <th style="width: 30%">Type</th>
                        <th style="width: 20%"></th>
                    </tr>
                </thead>
                <tbody>
                    ${
                        safeRows.length === 0
                            ? `<tr><td colspan="3" style="opacity:0.7; padding:10px 6px;">No bodies</td></tr>`
                            : safeRows
                                  .map((r) => {
                                      const isSel =
                                          this._selectedBodyRef && r.body === this._selectedBodyRef;
                                      const isApTarget =
                                          autopilotTarget && r.body === autopilotTarget;
                                      const flyBtnHtml =
                                          r.isShip
                                              ? `<td style="padding:2px 4px;"><button class="old-ui enter-ship-btn mb-0" data-entership="1" title="Enter ship" style="font-size:0.8em;padding:2px 6px;cursor:pointer;"><span class="material-symbols-outlined" style="font-size:1em;">login</span></button></td>`
                                              : !r.isShip && hasShip
                                              ? `<td style="padding:2px 4px;"><button class="old-ui fly-here-btn mb-0${isApTarget ? ' active' : ''}" data-flyhere="1" title="${isApTarget ? 'Cancel autopilot' : 'Fly to this body'}" style="font-size:0.8em;padding:2px 6px;cursor:pointer;">${isApTarget ? '<span class="material-symbols-outlined" style="font-size:1em;">close</span>' : '<span class="material-symbols-outlined" style="font-size:1em;">flight</span>'}</button></td>`
                                              : `<td></td>`;
                                      return `
                                          <tr class="${isSel ? 'selected' : ''}" data-row="1">
                                              <td>${escapeHtml(r.name || 'Unnamed')}</td>
                                              <td>${escapeHtml(r.typeLabel || 'Unknown')}</td>
                                              ${flyBtnHtml}
                                          </tr>
                                      `;
                                  })
                                  .join('')
                    }
                </tbody>
            </table>
        `;
        this.bodiesTableContainer.innerHTML = html;
        const tbody = this.bodiesTableContainer.querySelector('tbody');
        if (!tbody) return;
        const trList = Array.from(tbody.querySelectorAll('tr'));
        trList.forEach((tr, idx) => {
            if (!safeRows[idx]) return;
            const flyBtn = tr.querySelector('[data-flyhere]');
            if (flyBtn) {
                flyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = safeRows[idx];
                    if (!row || !row.body) return;
                    this.emit('autopilot', { body: row.body });
                });
            }
            const enterShipBtn = tr.querySelector('[data-entership]');
            if (enterShipBtn) {
                enterShipBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = safeRows[idx];
                    if (!row || !row.body) return;
                    this.emit('enterShip', { body: row.body });
                });
            }
            tr.addEventListener('click', () => {
                const row = safeRows[idx];
                if (!row || !row.body) return;
                this.setSelectedBody(row.body);
                this.emit('manualBodySelect', { body: row.body });
            });
        });
    }

    setSelectedBody(body: Body | null) {
        this._selectedBodyRef = body;
    }
}
