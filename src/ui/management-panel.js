import { Panel } from './panel.js';
import { SUN_MASS } from '../utilities/consts.js';
import { BodyType, isBodyType } from '../utilities/utilities.js';

/**
 * Management panel for creating and editing celestial bodies
 */
export class ManagementPanel extends Panel {
    /**
     * @param {string|HTMLElement} elementId
     * @param {{ getFocusObject?: () => any }} deps
     */
    constructor(elementId, deps = {}) {
        super(elementId);

        this.getFocusObject =
            typeof deps.getFocusObject === 'function' ? deps.getFocusObject : () => null;

        this.addBodyBtn = null;
        this.bodyCreationForm = null;
        this.bodyTypeSelect = null;
        this.addModeSelect = null;
        this.presetBodyGroup = null;
        this.presetBodySelect = null;
        this.customBodyGroup = null;
        this.orbitTypeGroup = null;
        this.orbitalAngleGroup = null;
        this.orbitalAngleSlider = null;
        this.orbitalAngleDisplay = null;
        this.inclinationGroup = null;
        this.inclinationSlider = null;
        this.inclinationDisplay = null;
        this.moonValidationMessage = null;
        this.planetTypeGroup = null;
        this.hasAtmosphereRow = null;
        this.hasAtmosphereCheckbox = null;
        this.randomizeCreateBtn = null;
        this.randomizeCreateRow = null;

        // Create numeric inputs (custom planets/moons/stars)
        this.createMassGroup = null;
        this.createMassInput = null;
        this.createMassDisplay = null;
        this.createTemperatureGroup = null;
        this.createTemperatureSlider = null;
        this.createTemperatureDisplay = null;
        this.createLightIntensityGroup = null;
        this.createLightIntensitySlider = null;
        this.createLightIntensityDisplay = null;
        this.createRadiusGroup = null;
        this.createRadiusSlider = null;
        this.createRadiusDisplay = null;

        this.createBodyBtn = null;
        this.cancelCreateBtn = null;
        this.createSliderInitState = null;

        this.editBodyBtn = null;
        this.bodyEditForm = null;
        this.editControlsContainer = null;
        this.editBodyName = null;
        this.editNameInput = null;
        this.editMassInput = null;
        this.editMassDisplay = null;
        this.editTempSlider = null;
        this.editTempDisplay = null;
        this.editTempGroup = null;
        this.editRadiusSlider = null;
        this.editRadiusDisplay = null;
        this.editRadiusGroup = null;
        this.editColorInput = null;
        this.editLightIntensityGroup = null;
        this.editLightIntensitySlider = null;
        this.editLightIntensityDisplay = null;
        this.editVelocitySlider = null;
        this.editVelocityDisplay = null;
        this.editOrbitalAngleSlider = null;
        this.editOrbitalAngleDisplay = null;
        this.editInclinationSlider = null;
        this.editInclinationDisplay = null;
        this.applyEditBtn = null;
        this.deleteBodyBtn = null;
        this.cancelEditBtn = null;

        // Environment toggles (owned by ManagementPanel)
        this.enableKuiperBeltCheckbox = null;

        this.selectedBody = null;
    }

    /**
     * Initialize all UI elements and event listeners
     */
    initialize() {
        this.addBodyBtn = document.getElementById('addBodyBtn');
        this.bodyCreationForm = document.getElementById('bodyCreationForm');
        this.bodyTypeSelect = document.getElementById('bodyType');
        this.addModeSelect = document.getElementById('addMode');
        this.presetBodyGroup = document.getElementById('presetBodyGroup');
        this.presetBodySelect = document.getElementById('presetBody');
        this.customBodyGroup = document.getElementById('customBodyGroup');
        this.orbitTypeGroup = document.getElementById('orbitTypeGroup');
        this.orbitalAngleGroup = document.getElementById('orbitalAngleGroup');
        this.orbitalAngleSlider = document.getElementById('orbitalAngle');
        this.orbitalAngleDisplay = document.getElementById('orbital-angle-val');
        this.inclinationGroup = document.getElementById('inclinationGroup');
        this.inclinationSlider = document.getElementById('inclination');
        this.inclinationDisplay = document.getElementById('inclination-val');
        this.moonValidationMessage = document.getElementById('moonValidationMessage');
        this.planetTypeGroup = document.getElementById('planetTypeGroup');
        this.hasAtmosphereRow = document.getElementById('hasAtmosphereRow');
        this.hasAtmosphereCheckbox = document.getElementById('hasAtmosphere');
        this.randomizeCreateBtn = document.getElementById('randomizeCreateBtn');
        this.randomizeCreateRow = document.getElementById('randomizeCreateRow');

        // Create numeric inputs (custom planets/moons/stars)
        this.createMassGroup = document.getElementById('createMassGroup');
        this.createMassInput = document.getElementById('createMass');
        this.createMassDisplay = document.getElementById('create-mass-val');
        this.createTemperatureGroup = document.getElementById('createTemperatureGroup');
        this.createTemperatureSlider = document.getElementById('createTemperature');
        this.createTemperatureDisplay = document.getElementById('create-temp-val');
        this.createLightIntensityGroup = document.getElementById('createLightIntensityGroup');
        this.createLightIntensitySlider = document.getElementById('createLightIntensity');
        this.createLightIntensityDisplay = document.getElementById('create-light-intensity-val');
        this.createRadiusGroup = document.getElementById('createRadiusGroup');
        this.createRadiusSlider = document.getElementById('createRadius');
        this.createRadiusDisplay = document.getElementById('create-radius-val');

        this.createBodyBtn = document.getElementById('createBodyBtn');
        this.cancelCreateBtn = document.getElementById('cancelCreateBtn');
        this.randomizeCreateRow = document.getElementById('randomizeCreateRow');

        this.editBodyBtn = document.getElementById('editBodyBtn');
        this.bodyEditForm = document.getElementById('bodyEditForm');
        this.editControlsContainer = document.getElementById('editControlsContainer');
        this.editBodyName = document.getElementById('editBodyName');
        this.editNameInput = document.getElementById('editName');
        this.editMassInput = document.getElementById('editMass');
        this.editMassDisplay = document.getElementById('edit-mass-val');
        this.editTempSlider = document.getElementById('editTemperature');
        this.editTempDisplay = document.getElementById('edit-temp-val');
        this.editTempGroup = document.getElementById('editTempGroup');
        this.editColorInput = document.getElementById('editColor');
        this.editLightIntensityGroup = document.getElementById('editLightIntensityGroup');
        this.editLightIntensitySlider = document.getElementById('editLightIntensity');
        this.editLightIntensityDisplay = document.getElementById('edit-light-intensity-val');
        this.editRadiusGroup = document.getElementById('editRadiusGroup');
        this.editRadiusSlider = document.getElementById('editRadius');
        this.editRadiusDisplay = document.getElementById('edit-radius-val');
        this.editVelocitySlider = document.getElementById('editVelocity');
        this.editVelocityDisplay = document.getElementById('edit-velocity-val');
        this.editOrbitalAngleSlider = document.getElementById('editOrbitalAngle');
        this.editOrbitalAngleDisplay = document.getElementById('edit-orbital-angle-val');
        this.editInclinationSlider = document.getElementById('editInclination');
        this.editInclinationDisplay = document.getElementById('edit-inclination-val');
        this.applyEditBtn = document.getElementById('applyEditBtn');
        this.deleteBodyBtn = document.getElementById('deleteBodyBtn');
        this.cancelEditBtn = document.getElementById('cancelEditBtn');

        // Environment toggles (owned by ManagementPanel)
        this.enableKuiperBeltCheckbox = document.getElementById('enableKuiperBelt');

        if (this.enableKuiperBeltCheckbox) {
            this.enableKuiperBeltCheckbox.onchange = () => {
                this.emit('kuiperBeltChange', { checked: this.enableKuiperBeltCheckbox.checked });
            };
        }

        this.createSliderInitState = {
            mass: null,
            temperature: null,
            lightIntensity: null,
            radius: null,
        };

        // Initially hide edit controls
        if (this.editControlsContainer) {
            this.editControlsContainer.style.display = 'none';
        }

        const isCreationFormVisible = () =>
            !!this.bodyCreationForm && this.bodyCreationForm.classList.contains('visible');
        const isEditFormVisible = () =>
            !!this.bodyEditForm && this.bodyEditForm.classList.contains('visible');

        const openCreationForm = () => {
            if (!this.bodyCreationForm) return;
            this.bodyCreationForm.classList.add('visible');
        };
        const closeCreationForm = () => {
            if (!this.bodyCreationForm) return;
            this.bodyCreationForm.classList.remove('visible');
        };
        const openEditForm = () => {
            if (!this.bodyEditForm) return;
            this.bodyEditForm.classList.add('visible');
        };
        const closeEditForm = () => {
            if (!this.bodyEditForm) return;
            this.bodyEditForm.classList.remove('visible');
        };

        this.MASS_MAX = 100000000000;

        const numberFormatter = new Intl.NumberFormat(undefined, {
            maximumFractionDigits: 2,
        });

        const formatNumberForDisplay = (value) => {
            if (!isFinite(value) || value <= 0) return '0';
            return numberFormatter.format(value);
        };

        this.formatNumberForDisplay = formatNumberForDisplay;

        const formatMassForDisplay = (actualMass) => {
            return formatNumberForDisplay(actualMass);
        };

        this.formatMassForDisplay = formatMassForDisplay;

        const formatLightIntensityForDisplay = (value) => {
            if (!isFinite(value) || value <= 0) return '0M';
            return `${formatNumberForDisplay(value / 1000000)}M`;
        };

        this.formatLightIntensityForDisplay = formatLightIntensityForDisplay;

        this.clampMassValue = (value) => {
            if (!isFinite(value)) return 0;
            return Math.min(this.MASS_MAX, Math.max(0.001, value));
        };

        const syncCreateDisplay = (input, display, formatter) => {
            if (!input || !display) return;
            const value = parseFloat(input.value);
            display.textContent = formatter(value);
        };

        const updateCreateInputsForBodyType = () => {
            const bodyType = this.getSelectedBodyType();
            if (bodyType === 'sun') {
                this.randomizeCustomStarValues(true);
                return;
            }

            if (bodyType === 'planet') {
                this.randomizeCreateBodyInputs('planet');
                return;
            }

            if (bodyType === 'moon') {
                this.randomizeCreateBodyInputs('moon');
                return;
            }

            if (bodyType === 'asteroid') {
                this.randomizeCreateBodyInputs('asteroid');
                return;
            }

            if (bodyType === 'comet') {
                this.randomizeCreateBodyInputs('comet');
                return;
            }

            this.randomizeCreateBodyInputs(bodyType);
        };

        const updateAddModeVisibility = () => {
            const mode = this.addModeSelect ? this.addModeSelect.value : 'preset';
            const isPreset = mode === 'preset';
            const isCustom = !isPreset;

            if (this.presetBodyGroup)
                this.presetBodyGroup.style.display = isPreset ? 'block' : 'none';
            if (this.customBodyGroup)
                this.customBodyGroup.style.display = isPreset ? 'none' : 'block';
            if (this.randomizeCreateRow) {
                this.randomizeCreateRow.hidden = isPreset;
                this.randomizeCreateRow.style.display = isCustom ? 'flex' : 'none';
            } else if (this.randomizeCreateBtn?.parentElement) {
                this.randomizeCreateBtn.parentElement.hidden = isPreset;
                this.randomizeCreateBtn.parentElement.style.display = isCustom ? 'flex' : 'none';
            }

            if (isPreset) {
                if (this.orbitTypeGroup) this.orbitTypeGroup.style.display = 'none';
                if (this.orbitalAngleGroup) this.orbitalAngleGroup.style.display = 'none';
                if (this.inclinationGroup) this.inclinationGroup.style.display = 'none';
                if (this.planetTypeGroup) this.planetTypeGroup.style.display = 'none';
                if (this.hasAtmosphereRow) this.hasAtmosphereRow.style.display = 'none';
                if (this.hasAtmosphereCheckbox) this.hasAtmosphereCheckbox.checked = false;
                if (this.createMassGroup) this.createMassGroup.style.display = 'none';
                if (this.createTemperatureGroup) this.createTemperatureGroup.style.display = 'none';
                if (this.createLightIntensityGroup)
                    this.createLightIntensityGroup.style.display = 'none';
                if (this.createRadiusGroup) this.createRadiusGroup.style.display = 'none';
                if (this.moonValidationMessage)
                    this.moonValidationMessage.classList.remove('visible');
                if (this.createBodyBtn) this.createBodyBtn.disabled = false;
                return;
            }

            const bodyType = this.bodyTypeSelect ? this.bodyTypeSelect.value : null;
            if (bodyType && bodyType !== 'sun') {
                if (this.orbitTypeGroup) this.orbitTypeGroup.style.display = 'block';
                if (this.orbitalAngleGroup) this.orbitalAngleGroup.style.display = 'block';
                if (this.inclinationGroup) this.inclinationGroup.style.display = 'block';

                const isCustomPlanet = bodyType === 'planet';
                if (this.planetTypeGroup)
                    this.planetTypeGroup.style.display = isCustomPlanet ? 'block' : 'none';

                const showMassRadius = bodyType === 'planet' || bodyType === 'moon';
                if (this.createMassGroup)
                    this.createMassGroup.style.display = showMassRadius ? 'block' : 'none';
                if (this.createRadiusGroup)
                    this.createRadiusGroup.style.display = showMassRadius ? 'block' : 'none';
                if (this.createTemperatureGroup) this.createTemperatureGroup.style.display = 'none';
                if (this.createLightIntensityGroup)
                    this.createLightIntensityGroup.style.display = 'none';

                const planetType = this.getSelectedPlanetType();
                const canHaveAtmosphere =
                    bodyType === 'moon' || (bodyType === 'planet' && planetType === 'solid');
                if (this.hasAtmosphereRow)
                    this.hasAtmosphereRow.style.display = canHaveAtmosphere ? 'flex' : 'none';
                if (this.hasAtmosphereCheckbox && !canHaveAtmosphere)
                    this.hasAtmosphereCheckbox.checked = false;

                this.validateMoonCreation();
            } else {
                [
                    this.createMassGroup,
                    this.createTemperatureGroup,
                    this.createLightIntensityGroup,
                    this.createRadiusGroup,
                ].forEach((group) => {
                    if (group) group.style.display = 'block';
                });

                syncCreateDisplay(this.createMassInput, this.createMassDisplay, (value) =>
                    formatMassForDisplay(value)
                );
                syncCreateDisplay(
                    this.createTemperatureSlider,
                    this.createTemperatureDisplay,
                    (value) => formatNumberForDisplay(value) + 'K'
                );
                syncCreateDisplay(
                    this.createLightIntensitySlider,
                    this.createLightIntensityDisplay,
                    (value) => formatLightIntensityForDisplay(value)
                );
                syncCreateDisplay(this.createRadiusSlider, this.createRadiusDisplay, (value) =>
                    formatNumberForDisplay(value)
                );

                if (this.orbitTypeGroup) this.orbitTypeGroup.style.display = 'none';
                if (this.orbitalAngleGroup) this.orbitalAngleGroup.style.display = 'none';
                if (this.inclinationGroup) this.inclinationGroup.style.display = 'none';
                if (this.planetTypeGroup) this.planetTypeGroup.style.display = 'none';
                if (this.hasAtmosphereRow) this.hasAtmosphereRow.style.display = 'none';
                if (this.hasAtmosphereCheckbox) this.hasAtmosphereCheckbox.checked = false;
                if (this.moonValidationMessage)
                    this.moonValidationMessage.classList.remove('visible');
                if (this.createBodyBtn) this.createBodyBtn.disabled = false;
            }
        };

        if (this.addModeSelect) {
            this.addModeSelect.onchange = () => updateAddModeVisibility();
        }

        if (this.bodyTypeSelect) {
            this.bodyTypeSelect.onchange = () => {
                updateCreateInputsForBodyType();
                updateAddModeVisibility();
            };
        }

        const planetTypeRadios = document.querySelectorAll('input[name="planetType"]');
        planetTypeRadios.forEach((radio) => {
            radio.addEventListener('change', () => updateAddModeVisibility());
        });

        if (this.createMassInput && this.createMassDisplay) {
            this.createMassInput.max = String(this.MASS_MAX);
            this.createMassInput.oninput = () => {
                const value = this.clampMassValue(parseFloat(this.createMassInput.value));
                this.createMassDisplay.textContent = formatMassForDisplay(value);
            };
            if (this.bodyTypeSelect && this.bodyTypeSelect.value === 'sun') {
                this.createMassInput.value = String(SUN_MASS);
            }
            this.createMassInput.oninput();
        }

        if (this.createTemperatureSlider && this.createTemperatureDisplay) {
            this.createTemperatureSlider.oninput = () => {
                const value = parseFloat(this.createTemperatureSlider.value);
                this.createTemperatureDisplay.textContent = formatNumberForDisplay(value) + 'K';
            };
            this.createTemperatureSlider.oninput();
        }

        if (this.createLightIntensitySlider && this.createLightIntensityDisplay) {
            this.createLightIntensitySlider.oninput = () => {
                const value = parseFloat(this.createLightIntensitySlider.value);
                this.createLightIntensityDisplay.textContent =
                    formatLightIntensityForDisplay(value);
            };
            this.createLightIntensitySlider.oninput();
        }

        if (this.createRadiusSlider && this.createRadiusDisplay) {
            this.createRadiusSlider.oninput = () => {
                const value = parseFloat(this.createRadiusSlider.value);
                this.createRadiusDisplay.textContent = formatNumberForDisplay(value);
            };
            this.createRadiusSlider.oninput();
        }

        updateAddModeVisibility();

        if (this.orbitalAngleSlider && this.orbitalAngleDisplay) {
            this.orbitalAngleSlider.oninput = () => {
                const value = parseFloat(this.orbitalAngleSlider.value);
                this.orbitalAngleDisplay.textContent = value.toFixed(0) + '°';
            };
        }

        if (this.inclinationSlider && this.inclinationDisplay) {
            this.inclinationSlider.oninput = () => {
                const value = parseFloat(this.inclinationSlider.value);
                this.inclinationDisplay.textContent = value.toFixed(0) + '°';
            };
        }

        if (this.randomizeCreateBtn) {
            this.randomizeCreateBtn.onclick = () => {
                this.randomizeCreateBodyInputs(this.getSelectedBodyType());
                updateAddModeVisibility();
            };
        }

        updateAddModeVisibility();

        if (this.addBodyBtn) {
            this.addBodyBtn.onclick = () => {
                const willOpen = !isCreationFormVisible();
                if (willOpen) {
                    closeEditForm();
                    openCreationForm();
                    updateCreateInputsForBodyType();
                    updateAddModeVisibility();
                } else {
                    closeCreationForm();
                }

                this.emit('toggleForm', {
                    visible: isCreationFormVisible(),
                });

                if (willOpen) {
                    this.validateMoonCreation();
                }
            };
        }

        if (this.createBodyBtn) {
            this.createBodyBtn.onclick = () => {
                const addMode = this.addModeSelect ? this.addModeSelect.value : 'preset';
                if (addMode === 'preset') {
                    const presetKey = this.presetBodySelect ? this.presetBodySelect.value : null;
                    this.emit('createPresetBody', { presetKey });
                    closeCreationForm();
                    return;
                }

                const bodyType = this.getSelectedBodyType();
                const orbitType = this.getSelectedOrbitType();
                const orbitalAngle = this.orbitalAngleSlider
                    ? parseFloat(this.orbitalAngleSlider.value)
                    : 0;
                const inclination = this.inclinationSlider
                    ? parseFloat(this.inclinationSlider.value)
                    : 0;
                const planetType = this.getSelectedPlanetType();
                const hasAtmosphere =
                    this.hasAtmosphereCheckbox &&
                    this.hasAtmosphereRow &&
                    this.hasAtmosphereRow.style.display !== 'none'
                        ? !!this.hasAtmosphereCheckbox.checked
                        : false;

                const customMass =
                    this.createMassInput && this.createMassGroup?.style.display !== 'none'
                        ? this.clampMassValue(parseFloat(this.createMassInput.value))
                        : null;
                const customTemperature =
                    this.createTemperatureSlider &&
                    this.createTemperatureGroup?.style.display !== 'none'
                        ? parseFloat(this.createTemperatureSlider.value)
                        : null;
                const customLightIntensity =
                    this.createLightIntensitySlider &&
                    this.createLightIntensityGroup?.style.display !== 'none'
                        ? parseFloat(this.createLightIntensitySlider.value)
                        : null;
                const customRadius =
                    this.createRadiusSlider && this.createRadiusGroup?.style.display !== 'none'
                        ? parseFloat(this.createRadiusSlider.value)
                        : null;

                this.emit('createBody', {
                    bodyType,
                    planetType,
                    orbitType,
                    orbitalAngle,
                    inclination,
                    hasAtmosphere,
                    customMass,
                    customTemperature,
                    customLightIntensity,
                    customRadius,
                });

                closeCreationForm();
            };
        }

        if (this.cancelCreateBtn) {
            this.cancelCreateBtn.onclick = () => {
                closeCreationForm();
            };
        }

        if (this.editBodyBtn) {
            this.editBodyBtn.onclick = () => {
                const willOpen = !isEditFormVisible();
                if (willOpen) {
                    closeCreationForm();
                    openEditForm();
                } else {
                    closeEditForm();
                }

                closeCreationForm();

                this.emit('toggleEditForm', {
                    visible: isEditFormVisible(),
                });
            };
        }

        if (this.editMassInput) {
            this.editMassInput.max = String(this.MASS_MAX);
            this.editMassInput.oninput = () => {
                const value = this.clampMassValue(parseFloat(this.editMassInput.value));
                this.editMassDisplay.textContent = formatMassForDisplay(value);
            };
            this.editMassInput.min = '0.001';
            this.editMassInput.step = 'any';
            this.editMassInput.oninput();
        }

        if (this.editTempSlider) {
            this.editTempSlider.oninput = () => {
                const value = parseFloat(this.editTempSlider.value);
                this.editTempDisplay.textContent = formatNumberForDisplay(value) + 'K';
            };
            this.editTempSlider.oninput();
        }

        if (this.editLightIntensitySlider) {
            this.editLightIntensitySlider.oninput = () => {
                const value = parseFloat(this.editLightIntensitySlider.value);
                if (this.editLightIntensityDisplay) {
                    this.editLightIntensityDisplay.textContent =
                        formatLightIntensityForDisplay(value);
                }
            };
            this.editLightIntensitySlider.oninput();
        }

        if (this.editRadiusSlider) {
            this.editRadiusSlider.oninput = () => {
                const value = parseFloat(this.editRadiusSlider.value);
                if (this.editRadiusDisplay) {
                    this.editRadiusDisplay.textContent = formatNumberForDisplay(value);
                }
            };
            this.editRadiusSlider.oninput();
        }

        if (this.editColorInput) {
            this.editColorInput.oninput = () => {};
        }

        if (this.editVelocitySlider && this.editVelocityDisplay) {
            this.editVelocitySlider.oninput = () => {
                const value = parseFloat(this.editVelocitySlider.value);
                this.editVelocityDisplay.textContent = value.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                });
            };
        }

        if (this.editOrbitalAngleSlider && this.editOrbitalAngleDisplay) {
            this.editOrbitalAngleSlider.oninput = () => {
                const value = parseFloat(this.editOrbitalAngleSlider.value);
                this.editOrbitalAngleDisplay.textContent = value.toFixed(0) + '°';
            };
        }

        if (this.editInclinationSlider && this.editInclinationDisplay) {
            this.editInclinationSlider.oninput = () => {
                const value = parseFloat(this.editInclinationSlider.value);
                this.editInclinationDisplay.textContent = value.toFixed(0) + '°';
            };
        }

        if (this.applyEditBtn) {
            this.applyEditBtn.onclick = () => {
                const name = this.editNameInput ? this.editNameInput.value.trim() : null;
                const mass = this.clampMassValue(parseFloat(this.editMassInput.value));
                const isStarBody = isBodyType(this.selectedBody, BodyType.Star);

                const temperature = this.editTempSlider
                    ? parseFloat(this.editTempSlider.value)
                    : null;
                const lightIntensity = this.editLightIntensitySlider
                    ? parseFloat(this.editLightIntensitySlider.value)
                    : null;
                const radius = this.editRadiusSlider
                    ? parseFloat(this.editRadiusSlider.value)
                    : null;
                const velocity = this.editVelocitySlider
                    ? parseFloat(this.editVelocitySlider.value)
                    : 0;
                const orbitalAngle = this.editOrbitalAngleSlider
                    ? parseFloat(this.editOrbitalAngleSlider.value)
                    : 0;
                const inclination = this.editInclinationSlider
                    ? parseFloat(this.editInclinationSlider.value)
                    : 0;
                const color = this.editColorInput ? this.editColorInput.value : null;

                this.emit('applyEdit', {
                    body: this.selectedBody,
                    name,
                    mass,
                    temperature,
                    lightIntensity,
                    radius,
                    velocity,
                    orbitalAngle,
                    inclination,
                    color,
                    isStarBody,
                });
            };
        }

        if (this.deleteBodyBtn) {
            this.deleteBodyBtn.onclick = () => {
                this.emit('deleteBody', { body: this.selectedBody });
            };
        }

        if (this.cancelEditBtn) {
            this.cancelEditBtn.onclick = () => {
                closeEditForm();
            };
        }
    }

    randomizeCreateBodyInputs(bodyType) {
        const type = bodyType || this.getSelectedBodyType();

        const setValue = (input, value) => {
            if (!input) return;
            input.value = String(value);
            if (typeof input.oninput === 'function') {
                input.oninput();
            }
        };

        const rand = (min, max) => min + Math.random() * (max - min);
        const randInt = (min, max) => Math.floor(rand(min, max + 1));
        const randBool = () => Math.random() < 0.5;

        if (this.orbitalAngleSlider) {
            setValue(this.orbitalAngleSlider, randInt(0, 359));
        }
        if (this.inclinationSlider) {
            setValue(this.inclinationSlider, randInt(0, 90));
        }

        if (type === 'sun') {
            this.randomizeCustomStarValues(true);
            return;
        }

        if (this.hasAtmosphereCheckbox && this.hasAtmosphereRow?.style.display !== 'none') {
            this.hasAtmosphereCheckbox.checked = randBool();
        }

        if (type === 'planet') {
            const planetType = this.getSelectedPlanetType();
            const isGasOrIce = planetType === 'gas_giant' || planetType === 'ice_giant';
            const mass = isGasOrIce ? rand(1e24, 3e27) : rand(1e22, 1e25);
            const radius = isGasOrIce ? rand(20000, 80000) : rand(1000, 20000);
            setValue(this.createMassInput, this.clampMassValue(mass));
            setValue(this.createRadiusSlider, radius);
            return;
        }

        if (type === 'moon') {
            setValue(this.createMassInput, this.clampMassValue(rand(1e18, 1e24)));
            setValue(this.createRadiusSlider, rand(50, 5000));
            return;
        }

        if (type === 'asteroid') {
            if (this.createMassInput) setValue(this.createMassInput, this.clampMassValue(rand(1e10, 1e18)));
            if (this.createRadiusSlider) setValue(this.createRadiusSlider, rand(1, 500));
            return;
        }

        if (type === 'comet') {
            if (this.createMassInput) setValue(this.createMassInput, this.clampMassValue(rand(1e9, 1e16)));
            if (this.createRadiusSlider) setValue(this.createRadiusSlider, rand(1, 100));
            return;
        }

        this.randomizeCustomStarValues(false);
    }

    randomizeCustomStarValues(useStarlikeValues) {
        const rand = (min, max) => min + Math.random() * (max - min);
        const setValue = (input, value) => {
            if (!input) return;
            input.value = String(value);
            if (typeof input.oninput === 'function') {
                input.oninput();
            }
        };

        const starMassMin = useStarlikeValues ? 0.5 * SUN_MASS : 1e29;
        const starMassMax = useStarlikeValues ? 5 * SUN_MASS : 5e31;
        const temperatureMin = useStarlikeValues ? 2500 : 1500;
        const temperatureMax = useStarlikeValues ? 12000 : 40000;
        const lightIntensityMin = useStarlikeValues ? 1000000 : 100000;
        const lightIntensityMax = useStarlikeValues ? 5000000000 : 50000000000;
        const radiusMin = useStarlikeValues ? 100000 : 10000;
        const radiusMax = useStarlikeValues ? 2000000 : 5000000;

        setValue(this.createMassInput, this.clampMassValue(rand(starMassMin, starMassMax)));
        setValue(this.createTemperatureSlider, Math.round(rand(temperatureMin, temperatureMax)));
        setValue(
            this.createLightIntensitySlider,
            Math.round(rand(lightIntensityMin, lightIntensityMax))
        );
        setValue(this.createRadiusSlider, Math.round(rand(radiusMin, radiusMax)));
    }

    toggleCreationForm() {
        if (this.bodyCreationForm) {
            this.bodyCreationForm.classList.toggle('visible');
        }
    }

    toggleEditForm() {
        if (this.bodyEditForm) {
            this.bodyEditForm.classList.toggle('visible');
        }
    }

    getSelectedBodyType() {
        return this.bodyTypeSelect ? this.bodyTypeSelect.value : null;
    }

    getSelectedOrbitType() {
        const circularRadio = document.getElementById('orbitCircular');
        const ellipticalRadio = document.getElementById('orbitElliptical');
        if (circularRadio && circularRadio.checked) return 'circular';
        if (ellipticalRadio && ellipticalRadio.checked) return 'elliptical';
        return 'circular';
    }

    getSelectedPlanetType() {
        const solidRadio = document.getElementById('planetTypeSolid');
        const gasGiantRadio = document.getElementById('planetTypeGasGiant');
        const iceGiantRadio = document.getElementById('planetTypeIceGiant');

        if (gasGiantRadio && gasGiantRadio.checked) return 'gas_giant';
        if (iceGiantRadio && iceGiantRadio.checked) return 'ice_giant';
        if (solidRadio && solidRadio.checked) return 'solid';
        return 'solid';
    }

    validateMoonCreation() {
        const bodyType = this.bodyTypeSelect ? this.bodyTypeSelect.value : null;
        if (bodyType === 'moon') {
            const focusedBody = this.getFocusObject();
            const isValid = focusedBody && !focusedBody._isDisposed;

            if (this.moonValidationMessage) {
                if (isValid) {
                    this.moonValidationMessage.classList.remove('visible');
                } else {
                    this.moonValidationMessage.classList.add('visible');
                }
            }

            if (this.createBodyBtn) {
                this.createBodyBtn.disabled = !isValid;
            }
        }
    }

    setSelectedBody(body) {
        this.selectedBody = body;

        const setGroupVisible = (el, visible, display = 'block') => {
            if (!el) return;
            el.style.display = visible ? display : 'none';
        };

        const safeSetText = (el, text) => {
            if (!el) return;
            el.textContent = text;
        };

        const toHexColor = (c) => {
            try {
                if (c && typeof c === 'object' && 'r' in c && 'g' in c && 'b' in c) {
                    const r = Math.max(0, Math.min(255, Math.round(c.r * 255)));
                    const g = Math.max(0, Math.min(255, Math.round(c.g * 255)));
                    const b = Math.max(0, Math.min(255, Math.round(c.b * 255)));
                    return (
                        '#' +
                        [r, g, b]
                            .map((n) => n.toString(16).padStart(2, '0'))
                            .join('')
                            .toLowerCase()
                    );
                }
                if (typeof c === 'number' && isFinite(c)) {
                    return ('#' + (c >>> 0).toString(16).padStart(6, '0')).toLowerCase();
                }
            } catch {
                // ignore
            }
            return '#ffffff';
        };

        if (!body) {
            this.editBodyName.textContent = 'No body selected';
            if (this.editControlsContainer) {
                this.editControlsContainer.style.display = 'none';
            }
            if (this.deleteBodyBtn) {
                this.deleteBodyBtn.disabled = true;
            }

            setGroupVisible(this.editTempGroup, false);
            setGroupVisible(this.editLightIntensityGroup, false);
            setGroupVisible(this.editRadiusGroup, false);
            this.validateMoonCreation();
            return;
        }

        if (this.editControlsContainer) {
            this.editControlsContainer.style.display = 'block';
        }
        if (this.deleteBodyBtn) {
            this.deleteBodyBtn.disabled = false;
        }

        const isStarBody = isBodyType(body, BodyType.Star);

        this.editBodyName.textContent = body.name || 'Unnamed Body';
        if (this.editNameInput) {
            this.editNameInput.value = body.name || '';
        }

        if (this.editColorInput) {
            const showColorPicker =
                isBodyType(body, BodyType.Asteroid) || isBodyType(body, BodyType.Comet);
            this.editColorInput.disabled = !showColorPicker;
            if (this.editColorInput.parentElement) {
                this.editColorInput.parentElement.style.display = showColorPicker
                    ? 'block'
                    : 'none';
            }

            if (showColorPicker) {
                const c = body.baseColor || body.color || 0xffffff;
                this.editColorInput.value = toHexColor(c);
            }
        }

        setGroupVisible(this.editTempGroup, isStarBody);
        setGroupVisible(this.editLightIntensityGroup, isStarBody);
        setGroupVisible(this.editRadiusGroup, true);

        if (this.editRadiusSlider && this.editRadiusDisplay) {
            const r = typeof body.radius === 'number' && isFinite(body.radius) ? body.radius : 1;
            this.editRadiusSlider.value = r;
            safeSetText(this.editRadiusDisplay, this.formatNumberForDisplay(r));
            if (typeof this.editRadiusSlider.oninput === 'function')
                this.editRadiusSlider.oninput();
        }

        if (isStarBody && this.editTempSlider && this.editTempDisplay) {
            const t =
                typeof body.temperature === 'number' && isFinite(body.temperature)
                    ? body.temperature
                    : 5778;
            this.editTempSlider.value = t;
            safeSetText(this.editTempDisplay, this.formatNumberForDisplay(t) + 'K');
            if (typeof this.editTempSlider.oninput === 'function') this.editTempSlider.oninput();
        }

        if (isStarBody && this.editLightIntensitySlider && this.editLightIntensityDisplay) {
            let intensity = null;
            if (typeof body.lightIntensity === 'number' && isFinite(body.lightIntensity)) {
                intensity = body.lightIntensity;
            } else if (body._lightIntensity != null && isFinite(body._lightIntensity)) {
                intensity = body._lightIntensity;
            }

            if (intensity == null) intensity = 500000000;

            this.editLightIntensitySlider.value = String(intensity);
            safeSetText(
                this.editLightIntensityDisplay,
                this.formatLightIntensityForDisplay(intensity)
            );
        }

        if (this.editMassInput && this.editMassDisplay) {
            const mass = typeof body.mass === 'number' && isFinite(body.mass) ? body.mass : 0.001;
            const clampedMass = this.clampMassValue(mass);
            this.editMassInput.value = String(clampedMass);
            this.editMassInput.min = '0.001';
            this.editMassInput.step = 'any';
            this.editMassInput.max = String(this.MASS_MAX);
            if (typeof this.editMassInput.setAttribute === 'function') {
                this.editMassInput.setAttribute('value', String(clampedMass));
            }
            this.editMassDisplay.textContent = this.formatMassForDisplay(clampedMass);
        }

        if (this.editVelocitySlider && this.editVelocityDisplay) {
            const velocity =
                typeof body.velocity?.length === 'function' ? body.velocity.length() : 0;
            this.editVelocitySlider.value = velocity;
            this.editVelocityDisplay.textContent = velocity.toLocaleString(undefined, {
                maximumFractionDigits: 1,
            });
        }

        if (this.editOrbitalAngleSlider && this.editOrbitalAngleDisplay) {
            this.editOrbitalAngleSlider.value = this.editOrbitalAngleSlider.value || 0;
            this.editOrbitalAngleDisplay.textContent =
                this.formatNumberForDisplay(parseFloat(this.editOrbitalAngleSlider.value || 0)) +
                '°';
        }

        if (this.editInclinationSlider && this.editInclinationDisplay) {
            this.editInclinationSlider.value = this.editInclinationSlider.value || 0;
            this.editInclinationDisplay.textContent =
                this.formatNumberForDisplay(parseFloat(this.editInclinationSlider.value || 0)) +
                '°';
        }

        this.validateMoonCreation();
    }
}
