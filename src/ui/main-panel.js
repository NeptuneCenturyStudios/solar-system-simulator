import { Panel } from './panel.js';
import { escapeHtml } from './html.js';

/**
 * Main control panel managing camera, time controls, and settings
 */
export class MainPanel extends Panel {
    constructor(elementId) {
        super(elementId);

        // Camera buttons
        this.freeCameraBtn = null;
        this.zoomInBtn = null;
        this.zoomOutBtn = null;

        // Bodies list/table
        this.bodiesTableContainer = null;
        this._selectedBodyRef = null;

        // Checkboxes
        this.lockToSunCheckbox = null;
        this.enableShadowsCheckbox = null;
        this.showTrailsCheckbox = null;
        this.showNamesCheckbox = null;

        // Sliders
        this.timeScaleSlider = null;
        this.timeScaleDisplay = null;
        this.timeScaleResetBtn = null;
        this.substepsSlider = null;
        this.substepsDisplay = null;
        this.substepsResetBtn = null;

        // Buttons
        this.pauseBtn = null;
        this.resetBtn = null;
        this.manageSystemBtn = null;
        this.donateBtn = null;
        this.copyrightYearEl = null;
    }

    /**
     * Initialize all UI elements and event listeners
     */
    initialize() {
        // New camera / selection controls
        this.bodiesTableContainer = document.getElementById('bodiesTableContainer');
        this.targetBtn = document.getElementById('camTargetBtn');
        this.lookAtBtn = document.getElementById('camLookAtBtn');
        this.freeCameraBtn = document.getElementById('freeCameraBtn');
        this.surfaceCameraBtn = document.getElementById('surfaceCameraBtn');
        this.zoomInBtn = document.getElementById('zoomInBtn');
        this.zoomOutBtn = document.getElementById('zoomOutBtn');

        if (this.bodiesTableContainer) {
            // Initial empty table render
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

        // Existing toggles/sliders/buttons
        this.lockToSunCheckbox = document.getElementById('lockToSun');
        this.enableShadowsCheckbox = document.getElementById('enableShadows');
        this.showTrailsCheckbox = document.getElementById('showTrails');
        this.showNamesCheckbox = document.getElementById('showNames');
        this.timeScaleSlider = document.getElementById('timeScale');
        this.timeScaleDisplay = document.getElementById('speed-val');
        this.pauseBtn = document.getElementById('pauseBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.manageSystemBtn = document.getElementById('manageSystemBtn');
        this.donateBtn = document.getElementById('donateBtn');
        this.copyrightYearEl = document.getElementById('copyrightYear');

        if (this.copyrightYearEl) {
            this.copyrightYearEl.textContent = new Date().getFullYear();
        }

        // Wire up checkboxes
        if (this.lockToSunCheckbox) {
            this.lockToSunCheckbox.onchange = () => {
                this.emit('lockToSunChange', { checked: this.lockToSunCheckbox.checked });
            };
        }

        if (this.enableShadowsCheckbox) {
            this.enableShadowsCheckbox.onchange = () => {
                this.emit('shadowsChange', { checked: this.enableShadowsCheckbox.checked });
            };
        }

        if (this.showTrailsCheckbox) {
            this.showTrailsCheckbox.onchange = () => {
                this.emit('trailsChange', { checked: this.showTrailsCheckbox.checked });
            };
        }

        if (this.showNamesCheckbox) {
            this.showNamesCheckbox.onchange = () => {
                this.emit('namesChange', { checked: this.showNamesCheckbox.checked });
            };
        }

        // Wire up sliders
        if (this.timeScaleSlider) {
            this.timeScaleSlider.oninput = () => {
                const value = parseFloat(this.timeScaleSlider.value);
                this.emit('timeScaleChange', { value });
            };
        }

        this.timeScaleResetBtn = document.getElementById('timeScaleResetBtn');
        if (this.timeScaleResetBtn) {
            this.timeScaleResetBtn.onclick = () => {
                if (this.timeScaleSlider) this.timeScaleSlider.value = '1';
                this.emit('timeScaleChange', { value: 1 });
            };
        }

        this.substepsSlider = document.getElementById('substepsSlider');
        this.substepsDisplay = document.getElementById('substeps-val');
        if (this.substepsSlider) {
            this.substepsSlider.oninput = () => {
                const value = parseInt(this.substepsSlider.value, 10);
                if (this.substepsDisplay) this.substepsDisplay.textContent = `${value}`;
                this.emit('substepsChange', { value });
            };
        }

        this.substepsResetBtn = document.getElementById('substepsResetBtn');
        if (this.substepsResetBtn) {
            this.substepsResetBtn.onclick = () => {
                if (this.substepsSlider) this.substepsSlider.value = '64';
                if (this.substepsDisplay) this.substepsDisplay.textContent = '64';
                this.emit('substepsChange', { value: 64 });
            };
        }

        // Wire up buttons
        if (this.pauseBtn) {
            this.pauseBtn.onclick = () => {
                this.emit('pause');
            };
        }

        if (this.resetBtn) {
            this.resetBtn.onclick = () => {
                this.emit('reset');
            };
        }

        if (this.manageSystemBtn) {
            this.manageSystemBtn.onclick = () => {
                this.emit('manageSystem');
            };
        }

        if (this.donateBtn) {
            this.donateBtn.onclick = () => {
                window.open('https://ko-fi.com/neptunecentury', '_blank', 'noopener,noreferrer');
            };
        }
    }

    /**
     * Update time scale display
     */
    updateTimeScaleDisplay(value) {
        if (this.timeScaleDisplay) {
            this.timeScaleDisplay.textContent = `${value}`;
        }
    }

    _ensureButtonIconEl(btn) {
        if (!btn) return null;
        return btn.querySelector('.material-symbols-outlined');
    }

    _setButtonIcon(btn, iconName) {
        const iconEl = this._ensureButtonIconEl(btn);
        if (iconEl) iconEl.textContent = iconName;
    }

    _setButtonLabel(btn, labelText) {
        if (!btn) return;
        // For "text + icon" buttons, update the label portion while preserving the icon span.
        // Convention: icon span is first child, label is a text node after it.
        const iconEl = btn.querySelector('.material-symbols-outlined');
        if (!iconEl) {
            btn.textContent = labelText;
            return;
        }

        // Remove everything after icon span and rebuild label.
        while (iconEl.nextSibling) {
            btn.removeChild(iconEl.nextSibling);
        }
        btn.appendChild(document.createTextNode(' ' + labelText));
    }

    /**
     * Set pause button state
     */
    setPauseState(isPaused) {
        if (this.pauseBtn) {
            if (isPaused) {
                this.pauseBtn.classList.add('paused');
                this._setButtonIcon(this.pauseBtn, 'play_arrow');
                this._setButtonLabel(this.pauseBtn, 'RESUME SIMULATION');
            } else {
                this.pauseBtn.classList.remove('paused');
                this._setButtonIcon(this.pauseBtn, 'pause');
                this._setButtonLabel(this.pauseBtn, 'PAUSE SIMULATION');
            }
        }
    }

    /**
     * Set free camera button state
     */
    setFreeCameraState(isActive) {
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

    setSurfaceCameraState({ isActive, isEnabled }) {
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

    /**
     * Set look-at button state (toggle)
     */
    setLookAtState(isActive) {
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

    /**
     * Set target button state (toggle)
     */
    setTargetState(isActive) {
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

    /**
     * Render/update the bodies table.
     * @param {Array<{name:string,typeLabel:string,body:any,isShip:boolean}>} rows
     * @param {boolean} hasShip - Whether a spaceship exists (enables Fly Here buttons).
     * @param {any|null} autopilotTarget - The body currently being tracked by autopilot (or null).
     */
    renderBodiesTable(rows, hasShip = false, autopilotTarget = null) {
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
                                                      this._selectedBodyRef &&
                                                      r.body === this._selectedBodyRef;
                                                  const isApTarget =
                                                      autopilotTarget && r.body === autopilotTarget;
                                                  // Show "Fly Here" only for non-ship bodies when a ship exists
                                                  const flyBtnHtml =
                                                      !r.isShip && hasShip
                                                          ? `<td style="padding:2px 4px;"><button class="fly-here-btn${isApTarget ? ' active' : ''}" data-flyhere="1" title="${isApTarget ? 'Cancel autopilot' : 'Fly to this body'}" style="font-size:0.72em;padding:2px 6px;cursor:pointer;">${isApTarget ? '✕' : '✈'}</button></td>`
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

        // Bind clicks
        const tbody = this.bodiesTableContainer.querySelector('tbody');
        if (!tbody) return;

        const trList = Array.from(tbody.querySelectorAll('tr'));
        trList.forEach((tr, idx) => {
            // Skip empty placeholder row (no bodies)
            if (!safeRows[idx]) return;

            // "Fly Here" button — stop row-select propagation
            const flyBtn = tr.querySelector('[data-flyhere]');
            if (flyBtn) {
                flyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const row = safeRows[idx];
                    if (!row || !row.body) return;
                    this.emit('autopilot', { body: row.body });
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

    /**
     * Update which body is highlighted in the table.
     */
    setSelectedBody(body) {
        this._selectedBodyRef = body || null;
        // Re-render will update selected class
        // (caller should pass rows again if needed; we keep selection state)
    }
}
