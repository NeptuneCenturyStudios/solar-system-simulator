import { Panel } from './panel';
import {
    EARTH_MASS,
    EARTH_RADIUS,
    JUPITER_MASS,
    JUPITER_RADIUS,
    MOON_MASS,
    MOON_RADIUS,
    NEPTUNE_MASS,
    NEPTUNE_RADIUS,
    SCALE_FACTOR,
    SUN_MASS,
    SUN_RADIUS,
} from '../utilities/consts.js';
import { BodyTypeEnum, isBodyType } from '../utilities/utilities.js';
import { Star } from '../bodies/star.js';
import { Body } from '../bodies/body.js';
import { randomStarParams } from '../utilities/body-params.js';

interface CreateSliderInitState {
    mass: number | null;
    temperature: number | null;
    lightIntensity: number | null;
    radius: number | null;
}

/**
 * Management panel for creating and editing celestial bodies
 */
export class ManagementPanel extends Panel {
    getFocusObject: () => Body | null;

    btnClose: HTMLButtonElement | null;

    addBodyBtn: HTMLButtonElement | null;
    bodyCreationForm: HTMLElement | null;
    bodyTypeSelect: HTMLSelectElement | null;
    addModeSelect: HTMLSelectElement | null;
    presetBodyGroup: HTMLElement | null;
    presetBodySelect: HTMLSelectElement | null;
    customBodyGroup: HTMLElement | null;
    orbitTypeGroup: HTMLElement | null;
    inclinationGroup: HTMLElement | null;
    inclinationSlider: HTMLInputElement | null;
    inclinationDisplay: HTMLElement | null;
    orbitParentRow: HTMLElement | null;
    orbitParentDisplay: HTMLElement | null;
    moonValidationMessage: HTMLElement | null;
    planetTypeGroup: HTMLElement | null;
    hasAtmosphereRow: HTMLElement | null;
    hasAtmosphereCheckbox: HTMLInputElement | null;
    randomizeCreateBtn: HTMLButtonElement | null;
    randomizeCreateRow: HTMLElement | null;

    // Create numeric inputs (custom planets/moons/stars)
    createMassGroup: HTMLElement | null;
    createMassInput: HTMLInputElement | null;
    createMassDisplay: HTMLElement | null;
    createTemperatureGroup: HTMLElement | null;
    createTemperatureSlider: HTMLInputElement | null;
    createTemperatureDisplay: HTMLElement | null;
    createLightIntensityGroup: HTMLElement | null;
    createLightIntensitySlider: HTMLInputElement | null;
    createLightIntensityDisplay: HTMLElement | null;
    createRadiusGroup: HTMLElement | null;
    createRadiusSlider: HTMLInputElement | null;
    createRadiusDisplay: HTMLElement | null;

    createBodyBtn: HTMLButtonElement | null;
    cancelCreateBtn: HTMLButtonElement | null;
    createSliderInitState: CreateSliderInitState | null;

    editBodyBtn: HTMLButtonElement | null;
    bodyEditForm: HTMLElement | null;
    editControlsContainer: HTMLElement | null;
    editBodyName: HTMLElement | null;
    editNameInput: HTMLInputElement | null;
    editMassInput: HTMLInputElement | null;
    editMassDisplay: HTMLElement | null;
    editTempSlider: HTMLInputElement | null;
    editTempDisplay: HTMLElement | null;
    editTempGroup: HTMLElement | null;
    editRadiusSlider: HTMLInputElement | null;
    editRadiusDisplay: HTMLElement | null;
    editRadiusGroup: HTMLElement | null;
    editColorInput: HTMLInputElement | null;
    editLightIntensityGroup: HTMLElement | null;
    editLightIntensitySlider: HTMLInputElement | null;
    editLightIntensityDisplay: HTMLElement | null;
    editVelocitySlider: HTMLInputElement | null;
    editVelocityDisplay: HTMLElement | null;
    editOrbitalAngleSlider: HTMLInputElement | null;
    editOrbitalAngleDisplay: HTMLElement | null;
    editInclinationSlider: HTMLInputElement | null;
    editInclinationDisplay: HTMLElement | null;
    editTiltGroup: HTMLElement | null;
    editTiltSlider: HTMLInputElement | null;
    editTiltDisplay: HTMLElement | null;
    editAzimuthGroup: HTMLElement | null;
    editAzimuthSlider: HTMLInputElement | null;
    editAzimuthDisplay: HTMLElement | null;
    applyEditBtn: HTMLButtonElement | null;
    deleteBodyBtn: HTMLButtonElement | null;
    cancelEditBtn: HTMLButtonElement | null;

    _editSpeedDirty: boolean;
    _editAngleDirty: boolean;
    _editInclinationDirty: boolean;

    // Create-form tilt/azimuth sliders
    createTiltGroup: HTMLElement | null;
    createTiltSlider: HTMLInputElement | null;
    createTiltDisplay: HTMLElement | null;
    createAzimuthGroup: HTMLElement | null;
    createAzimuthSlider: HTMLInputElement | null;
    createAzimuthDisplay: HTMLElement | null;

    // Environment toggles (owned by ManagementPanel)
    enableKuiperBeltCheckbox: HTMLInputElement | null;
    gravitationalConstantSlider: HTMLInputElement | null;
    gravitationalConstantDisplay: HTMLElement | null;
    gravitationalConstantResetBtn: HTMLButtonElement | null;

    selectedBody: Body | null;

    MASS_MAX!: number;
    MASS_MIN!: number;
    formatNumberForDisplay!: (value: number) => string;
    formatMassForDisplay!: (actualMass: number) => string;
    formatLightIntensityForDisplay!: (value: number) => string;
    clampMassValue!: (value: number) => number;

    constructor(elementId: string | HTMLElement) {
        super(elementId);

        this.getFocusObject = function () { return null; };

        this.btnClose = null;

        this.addBodyBtn = null;
        this.bodyCreationForm = null;
        this.bodyTypeSelect = null;
        this.addModeSelect = null;
        this.presetBodyGroup = null;
        this.presetBodySelect = null;
        this.customBodyGroup = null;
        this.orbitTypeGroup = null;
        this.inclinationGroup = null;
        this.inclinationSlider = null;
        this.inclinationDisplay = null;
        this.orbitParentRow = null;
        this.orbitParentDisplay = null;
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
        this.editTiltGroup = null;
        this.editTiltSlider = null;
        this.editTiltDisplay = null;
        this.editAzimuthGroup = null;
        this.editAzimuthSlider = null;
        this.editAzimuthDisplay = null;
        this.applyEditBtn = null;
        this.deleteBodyBtn = null;
        this.cancelEditBtn = null;

        this._editSpeedDirty = false;
        this._editAngleDirty = false;
        this._editInclinationDirty = false;

        // Create-form tilt/azimuth
        this.createTiltGroup = null;
        this.createTiltSlider = null;
        this.createTiltDisplay = null;
        this.createAzimuthGroup = null;
        this.createAzimuthSlider = null;
        this.createAzimuthDisplay = null;

        // Environment toggles (owned by ManagementPanel)
        this.enableKuiperBeltCheckbox = null;
        this.gravitationalConstantSlider = null;
        this.gravitationalConstantDisplay = null;
        this.gravitationalConstantResetBtn = null;

        this.selectedBody = null;
    }

    initialize(): void {
        this.btnClose = document.getElementById(
            'btn-close-management-panel'
        ) as HTMLButtonElement | null;

        if (this.btnClose) {
            this.btnClose.onclick = () => {
                this.toggle();
                this.emit('closed');
            };
        }

        this.addBodyBtn = document.getElementById('addBodyBtn') as HTMLButtonElement | null;
        this.bodyCreationForm = document.getElementById('bodyCreationForm');
        this.bodyTypeSelect = document.getElementById('bodyType') as HTMLSelectElement | null;
        this.addModeSelect = document.getElementById('addMode') as HTMLSelectElement | null;
        if (this.bodyTypeSelect) {
            this.bodyTypeSelect.addEventListener('change', () => {
                this.randomizeCreateBodyInputs(this.getSelectedBodyType());
            });
        }
        this.presetBodyGroup = document.getElementById('presetBodyGroup');
        this.presetBodySelect = document.getElementById('presetBody') as HTMLSelectElement | null;
        this.customBodyGroup = document.getElementById('customBodyGroup');
        this.orbitTypeGroup = document.getElementById('orbitTypeGroup');
        this.inclinationGroup = document.getElementById('inclinationGroup');
        this.inclinationSlider = document.getElementById('inclination') as HTMLInputElement | null;
        this.inclinationDisplay = document.getElementById('inclination-val');
        this.orbitParentRow = document.getElementById('orbitParentRow');
        this.orbitParentDisplay = document.getElementById('orbitParentDisplay');
        this.moonValidationMessage = document.getElementById('moonValidationMessage');
        this.planetTypeGroup = document.getElementById('planetTypeGroup');
        this.hasAtmosphereRow = document.getElementById('hasAtmosphereRow');
        this.hasAtmosphereCheckbox = document.getElementById(
            'hasAtmosphere'
        ) as HTMLInputElement | null;
        this.randomizeCreateBtn = document.getElementById(
            'randomizeCreateBtn'
        ) as HTMLButtonElement | null;
        this.randomizeCreateRow = document.getElementById('randomizeCreateRow');

        // Create numeric inputs (custom planets/moons/stars)
        this.createMassGroup = document.getElementById('createMassGroup');
        this.createMassInput = document.getElementById('createMass') as HTMLInputElement | null;
        this.createMassDisplay = document.getElementById('create-mass-val');
        this.createTemperatureGroup = document.getElementById('createTemperatureGroup');
        this.createTemperatureSlider = document.getElementById(
            'createTemperature'
        ) as HTMLInputElement | null;
        this.createTemperatureDisplay = document.getElementById('create-temp-val');
        this.createLightIntensityGroup = document.getElementById('createLightIntensityGroup');
        this.createLightIntensitySlider = document.getElementById(
            'createLightIntensity'
        ) as HTMLInputElement | null;
        this.createLightIntensityDisplay = document.getElementById('create-light-intensity-val');
        this.createRadiusGroup = document.getElementById('createRadiusGroup');
        this.createRadiusSlider = document.getElementById(
            'createRadius'
        ) as HTMLInputElement | null;
        this.createRadiusDisplay = document.getElementById('create-radius-val');

        this.createBodyBtn = document.getElementById('createBodyBtn') as HTMLButtonElement | null;
        this.cancelCreateBtn = document.getElementById(
            'cancelCreateBtn'
        ) as HTMLButtonElement | null;
        this.randomizeCreateRow = document.getElementById('randomizeCreateRow');

        this.editBodyBtn = document.getElementById('editBodyBtn') as HTMLButtonElement | null;
        this.bodyEditForm = document.getElementById('bodyEditForm');
        this.editControlsContainer = document.getElementById('editControlsContainer');
        this.editBodyName = document.getElementById('editBodyName');
        this.editNameInput = document.getElementById('editName') as HTMLInputElement | null;
        this.editMassInput = document.getElementById('editMass') as HTMLInputElement | null;
        this.editMassDisplay = document.getElementById('edit-mass-val');
        this.editTempSlider = document.getElementById('editTemperature') as HTMLInputElement | null;
        this.editTempDisplay = document.getElementById('edit-temp-val');
        this.editTempGroup = document.getElementById('editTempGroup');
        this.editColorInput = document.getElementById('editColor') as HTMLInputElement | null;
        this.editLightIntensityGroup = document.getElementById('editLightIntensityGroup');
        this.editLightIntensitySlider = document.getElementById(
            'editLightIntensity'
        ) as HTMLInputElement | null;
        this.editLightIntensityDisplay = document.getElementById('edit-light-intensity-val');
        this.editRadiusGroup = document.getElementById('editRadiusGroup');
        this.editRadiusSlider = document.getElementById('editRadius') as HTMLInputElement | null;
        this.editRadiusDisplay = document.getElementById('edit-radius-val');
        this.editVelocitySlider = document.getElementById(
            'editVelocity'
        ) as HTMLInputElement | null;
        this.editVelocityDisplay = document.getElementById('edit-velocity-val');
        this.editOrbitalAngleSlider = document.getElementById(
            'editOrbitalAngle'
        ) as HTMLInputElement | null;
        this.editOrbitalAngleDisplay = document.getElementById('edit-orbital-angle-val');
        this.editInclinationSlider = document.getElementById(
            'editInclination'
        ) as HTMLInputElement | null;
        this.editInclinationDisplay = document.getElementById('edit-inclination-val');
        this.editTiltGroup = document.getElementById('editTiltGroup');
        this.editTiltSlider = document.getElementById('editTilt') as HTMLInputElement | null;
        this.editTiltDisplay = document.getElementById('edit-tilt-val');
        this.editAzimuthGroup = document.getElementById('editAzimuthGroup');
        this.editAzimuthSlider = document.getElementById('editAzimuth') as HTMLInputElement | null;
        this.editAzimuthDisplay = document.getElementById('edit-azimuth-val');

        // Create-form tilt/azimuth
        this.createTiltGroup = document.getElementById('createTiltGroup');
        this.createTiltSlider = document.getElementById('createTilt') as HTMLInputElement | null;
        this.createTiltDisplay = document.getElementById('create-tilt-val');
        this.createAzimuthGroup = document.getElementById('createAzimuthGroup');
        this.createAzimuthSlider = document.getElementById('createAzimuth') as HTMLInputElement | null;
        this.createAzimuthDisplay = document.getElementById('create-azimuth-val');

        // Live display updates for create-form sliders
        if (this.createTiltSlider && this.createTiltDisplay) {
            const s = this.createTiltSlider, d = this.createTiltDisplay;
            s.oninput = () => { d.textContent = `${s.value}°`; };
        }
        if (this.createAzimuthSlider && this.createAzimuthDisplay) {
            const s = this.createAzimuthSlider, d = this.createAzimuthDisplay;
            s.oninput = () => { d.textContent = `${s.value}°`; };
        }
        // Live display updates for edit-form sliders
        if (this.editTiltSlider && this.editTiltDisplay) {
            const s = this.editTiltSlider, d = this.editTiltDisplay;
            s.oninput = () => { d.textContent = `${s.value}°`; };
        }
        if (this.editAzimuthSlider && this.editAzimuthDisplay) {
            const s = this.editAzimuthSlider, d = this.editAzimuthDisplay;
            s.oninput = () => { d.textContent = `${s.value}°`; };
        }

        this.applyEditBtn = document.getElementById('applyEditBtn') as HTMLButtonElement | null;
        this.deleteBodyBtn = document.getElementById('deleteBodyBtn') as HTMLButtonElement | null;
        this.cancelEditBtn = document.getElementById('cancelEditBtn') as HTMLButtonElement | null;

        // Environment toggles (owned by ManagementPanel)
        this.enableKuiperBeltCheckbox = document.getElementById(
            'enableKuiperBelt'
        ) as HTMLInputElement | null;

        if (this.enableKuiperBeltCheckbox) {
            const kuiperBeltCheckbox = this.enableKuiperBeltCheckbox;
            kuiperBeltCheckbox.onchange = () => {
                this.emit('kuiperBeltChange', { checked: kuiperBeltCheckbox.checked });
            };
        }

        this.gravitationalConstantSlider = document.getElementById(
            'gravitationalConstantSlider'
        ) as HTMLInputElement | null;
        this.gravitationalConstantDisplay = document.getElementById('gravitational-constant-val');

        if (this.gravitationalConstantSlider && this.gravitationalConstantDisplay) {
            const slider = this.gravitationalConstantSlider;
            const display = this.gravitationalConstantDisplay;
            slider.oninput = () => {
                const value = parseFloat(slider.value);
                display.textContent = value.toFixed(2);
                this.emit('gChange', { value });
            };
            (slider.oninput as () => void)();
        }

        this.gravitationalConstantResetBtn = document.getElementById(
            'gravitationalConstantResetBtn'
        ) as HTMLButtonElement | null;
        if (
            this.gravitationalConstantResetBtn &&
            this.gravitationalConstantSlider &&
            this.gravitationalConstantDisplay
        ) {
            const slider = this.gravitationalConstantSlider;
            const display = this.gravitationalConstantDisplay;
            this.gravitationalConstantResetBtn.onclick = () => {
                slider.value = '1';
                display.textContent = '1.00000';
                this.emit('gChange', { value: 1 });
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
        this.MASS_MIN = 0.001;

        const numberFormatter = new Intl.NumberFormat(undefined, {
            maximumFractionDigits: 2,
        });

        const formatNumberForDisplay = (value: number): string => {
            if (!isFinite(value) || value <= 0) return '0';
            return numberFormatter.format(value);
        };

        this.formatNumberForDisplay = formatNumberForDisplay;

        this.formatMassForDisplay = (actualMass: number): string => {
            return formatNumberForDisplay(actualMass);
        };

        const formatLightIntensityForDisplay = (value: number): string => {
            if (!isFinite(value) || value <= 0) return '0M';
            return `${formatNumberForDisplay(value / 1000000)}M`;
        };

        this.formatLightIntensityForDisplay = formatLightIntensityForDisplay;

        this.clampMassValue = (value: number): number => {
            if (!isFinite(value)) return this.MASS_MIN;
            const numericValue = Number(value);
            return numericValue < this.MASS_MIN ? this.MASS_MIN : numericValue;
        };

        const syncCreateDisplay = (
            input: HTMLInputElement | null,
            display: HTMLElement | null,
            formatter: (v: number) => string
        ): void => {
            if (!input || !display) return;
            const value = parseFloat(input.value);
            display.textContent = formatter(value);
        };

        const updateCreateInputsForBodyType = () => {
            const bodyType = this.getSelectedBodyType();
            if (bodyType === 'sun') {
                this.randomizeCustomStarValues();
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

            if (bodyType === 'black_hole') {
                this.randomizeCreateBodyInputs('black_hole');
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

            const randomizeParent = this.randomizeCreateBtn?.parentElement ?? null;
            if (this.randomizeCreateRow) {
                this.randomizeCreateRow.hidden = isPreset;
                this.randomizeCreateRow.style.display = isCustom ? 'flex' : 'none';
            } else if (randomizeParent) {
                randomizeParent.hidden = isPreset;
                randomizeParent.style.display = isCustom ? 'flex' : 'none';
            }

            if (isPreset) {
                if (this.orbitTypeGroup) this.orbitTypeGroup.style.display = 'none';
                if (this.inclinationGroup) this.inclinationGroup.style.display = 'none';
                if (this.orbitParentRow) this.orbitParentRow.style.display = 'none';
                if (this.planetTypeGroup) this.planetTypeGroup.style.display = 'none';
                if (this.hasAtmosphereRow) this.hasAtmosphereRow.style.display = 'none';
                if (this.hasAtmosphereCheckbox) this.hasAtmosphereCheckbox.checked = false;
                if (this.createMassGroup) this.createMassGroup.style.display = 'none';
                if (this.createTemperatureGroup) this.createTemperatureGroup.style.display = 'none';
                if (this.createLightIntensityGroup)
                    this.createLightIntensityGroup.style.display = 'none';
                if (this.createRadiusGroup) this.createRadiusGroup.style.display = 'none';
                if (this.createTiltGroup) this.createTiltGroup.style.display = 'none';
                if (this.createAzimuthGroup) this.createAzimuthGroup.style.display = 'none';
                if (this.moonValidationMessage)
                    this.moonValidationMessage.classList.remove('visible');
                if (this.createBodyBtn) this.createBodyBtn.disabled = false;
                return;
            }

            const bodyType = this.bodyTypeSelect ? this.bodyTypeSelect.value : null;
            if (bodyType === 'black_hole') {
                if (this.createMassGroup) this.createMassGroup.style.display = 'block';
                if (this.createRadiusGroup) this.createRadiusGroup.style.display = 'block';
                if (this.createTemperatureGroup) this.createTemperatureGroup.style.display = 'none';
                if (this.createLightIntensityGroup)
                    this.createLightIntensityGroup.style.display = 'none';
                if (this.orbitTypeGroup) this.orbitTypeGroup.style.display = 'none';
                if (this.inclinationGroup) this.inclinationGroup.style.display = 'none';
                if (this.orbitParentRow) this.orbitParentRow.style.display = 'none';
                if (this.planetTypeGroup) this.planetTypeGroup.style.display = 'none';
                if (this.hasAtmosphereRow) this.hasAtmosphereRow.style.display = 'none';
                if (this.hasAtmosphereCheckbox) this.hasAtmosphereCheckbox.checked = false;
                if (this.createTiltGroup) this.createTiltGroup.style.display = 'none';
                if (this.createAzimuthGroup) this.createAzimuthGroup.style.display = 'none';
                if (this.moonValidationMessage)
                    this.moonValidationMessage.classList.remove('visible');
                if (this.createBodyBtn) this.createBodyBtn.disabled = false;

                syncCreateDisplay(this.createMassInput, this.createMassDisplay, (value) =>
                    this.formatMassForDisplay(value)
                );
                syncCreateDisplay(this.createRadiusSlider, this.createRadiusDisplay, (value) =>
                    formatNumberForDisplay(value)
                );
            } else if (bodyType && bodyType !== 'sun') {
                if (this.orbitTypeGroup) this.orbitTypeGroup.style.display = 'block';
                if (this.inclinationGroup) this.inclinationGroup.style.display = 'block';
                if (this.orbitParentRow) this.orbitParentRow.style.display = 'block';
                this.updateOrbitParentDisplay();

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

                // Show tilt/azimuth only for planet and moon
                const showTilt = bodyType === 'planet' || bodyType === 'moon';
                if (this.createTiltGroup) this.createTiltGroup.style.display = showTilt ? 'block' : 'none';
                if (this.createAzimuthGroup) this.createAzimuthGroup.style.display = showTilt ? 'block' : 'none';

                const planetType = this.getSelectedPlanetType();
                const canHaveAtmosphere =
                    bodyType === 'moon' ||
                    (bodyType === 'planet' &&
                        (planetType === 'solid' ||
                            planetType === 'volcanic' ||
                            planetType === 'ocean' ||
                            planetType === 'frozen' ||
                            planetType === 'desert' ||
                            planetType === 'temperate'));
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
                    this.formatMassForDisplay(value)
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

                if (this.orbitTypeGroup) this.orbitTypeGroup.style.display = 'block';
                if (this.inclinationGroup) this.inclinationGroup.style.display = 'block';
                if (this.orbitParentRow) this.orbitParentRow.style.display = 'block';
                this.updateOrbitParentDisplay();
                if (this.planetTypeGroup) this.planetTypeGroup.style.display = 'none';
                if (this.hasAtmosphereRow) this.hasAtmosphereRow.style.display = 'none';
                if (this.hasAtmosphereCheckbox) this.hasAtmosphereCheckbox.checked = false;
                // Stars have axial tilt/azimuth too
                if (this.createTiltGroup) this.createTiltGroup.style.display = 'block';
                if (this.createAzimuthGroup) this.createAzimuthGroup.style.display = 'block';
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

        const planetTypeSelect = document.getElementById(
            'planetTypeSelect'
        ) as HTMLSelectElement | null;

        if (planetTypeSelect) {
            planetTypeSelect.addEventListener('change', () => updateAddModeVisibility());
        }

        if (this.createMassInput && this.createMassDisplay) {
            const createMassInput = this.createMassInput;
            const createMassDisplay = this.createMassDisplay;
            createMassInput.step = 'any';
            createMassInput.min = String(this.MASS_MIN);
            createMassInput.setAttribute('min', String(this.MASS_MIN));
            createMassInput.setAttribute('step', 'any');
            createMassInput.oninput = () => {
                const rawValue = parseFloat(createMassInput.value);
                const value = this.clampMassValue(rawValue);
                createMassDisplay.textContent = this.formatMassForDisplay(value);

                // For stars, preset the radius slider from mass using the mass-radius relationship.
                if (
                    this.getSelectedBodyType() === 'sun' &&
                    this.createRadiusSlider &&
                    this.createRadiusDisplay
                ) {
                    const starRadius = SUN_RADIUS * Math.pow(Math.max(0, value) / SUN_MASS, 0.8);
                    this.createRadiusSlider.value = String(starRadius);
                    this.createRadiusDisplay.textContent = String(
                        Math.round(starRadius * 100) / 100
                    );
                }

                // For black holes, recompute the radius slider from the new mass
                if (
                    this.getSelectedBodyType() === 'black_hole' &&
                    this.createRadiusSlider &&
                    this.createRadiusDisplay
                ) {
                    const BH_BASE_MASS = 3 * SUN_MASS;
                    const BH_BASE_RADIUS = 1 * SCALE_FACTOR;
                    const bhRadius = Math.max(
                        0.25 * SCALE_FACTOR,
                        BH_BASE_RADIUS * Math.cbrt(value / BH_BASE_MASS)
                    );
                    this.createRadiusSlider.value = String(bhRadius);
                    this.createRadiusDisplay.textContent = String(Math.round(bhRadius * 100) / 100);
                }
            };
            if (this.bodyTypeSelect && this.bodyTypeSelect.value === 'sun') {
                createMassInput.value = String(SUN_MASS);
                createMassInput.max = String(this.MASS_MAX);
                createMassInput.setAttribute('max', String(this.MASS_MAX));
            } else {
                createMassInput.removeAttribute('max');
                createMassInput.max = '';
            }
            (createMassInput.oninput as () => void)();
        }

        if (this.createTemperatureSlider && this.createTemperatureDisplay) {
            const createTemperatureSlider = this.createTemperatureSlider;
            const createTemperatureDisplay = this.createTemperatureDisplay;
            createTemperatureSlider.oninput = () => {
                const value = parseFloat(createTemperatureSlider.value);
                createTemperatureDisplay.textContent = formatNumberForDisplay(value) + 'K';
            };
            (createTemperatureSlider.oninput as () => void)();
        }

        if (this.createLightIntensitySlider && this.createLightIntensityDisplay) {
            const createLightIntensitySlider = this.createLightIntensitySlider;
            const createLightIntensityDisplay = this.createLightIntensityDisplay;
            createLightIntensitySlider.oninput = () => {
                const value = parseFloat(createLightIntensitySlider.value);
                createLightIntensityDisplay.textContent = formatLightIntensityForDisplay(value);
            };
            (createLightIntensitySlider.oninput as () => void)();
        }

        if (this.createRadiusSlider && this.createRadiusDisplay) {
            const createRadiusSlider = this.createRadiusSlider;
            const createRadiusDisplay = this.createRadiusDisplay;
            createRadiusSlider.oninput = () => {
                const value = parseFloat(createRadiusSlider.value);
                createRadiusDisplay.textContent = formatNumberForDisplay(value);
            };
            createRadiusSlider.max = String(200000 * SCALE_FACTOR);
            (createRadiusSlider.oninput as () => void)();
        }

        if (this.editRadiusSlider) {
            this.editRadiusSlider.max = String(200000 * SCALE_FACTOR);
        }

        updateAddModeVisibility();

        if (this.inclinationSlider && this.inclinationDisplay) {
            const inclinationSlider = this.inclinationSlider;
            const inclinationDisplay = this.inclinationDisplay;
            inclinationSlider.oninput = () => {
                const value = parseFloat(inclinationSlider.value);
                inclinationDisplay.textContent = value.toFixed(0) + '°';
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
                        ? parseFloat(this.createMassInput.value)
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
                const createTilt =
                    this.createTiltSlider && this.createTiltGroup?.style.display !== 'none'
                        ? parseFloat(this.createTiltSlider.value)
                        : null;
                const createAzimuth =
                    this.createAzimuthSlider && this.createAzimuthGroup?.style.display !== 'none'
                        ? parseFloat(this.createAzimuthSlider.value)
                        : null;

                this.emit('createBody', {
                    bodyType,
                    planetType,
                    orbitType,
                    inclination,
                    hasAtmosphere,
                    customMass,
                    customTemperature,
                    customLightIntensity,
                    customRadius,
                    createTilt,
                    createAzimuth,
                    orbitParent: this.selectedBody,
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
            const editMassInput = this.editMassInput;
            editMassInput.max = String(this.MASS_MAX);
            editMassInput.min = String(this.MASS_MIN);
            editMassInput.oninput = () => {
                const value = this.clampMassValue(parseFloat(editMassInput.value));
                if (this.editMassDisplay) {
                    this.editMassDisplay.textContent = this.formatMassForDisplay(value);
                }

                // For stars, preset the radius slider from mass using the mass-radius relationship.
                if (
                    this.selectedBody &&
                    isBodyType(this.selectedBody, BodyTypeEnum.Star) &&
                    this.editRadiusSlider &&
                    this.editRadiusDisplay
                ) {
                    const starRadius = SUN_RADIUS * Math.pow(Math.max(0, value) / SUN_MASS, 0.8);
                    this.editRadiusSlider.value = String(starRadius);
                    this.editRadiusDisplay.textContent = String(Math.round(starRadius * 100) / 100);
                }

                // For black holes, recompute the radius slider from the new mass
                if (
                    this.selectedBody &&
                    isBodyType(this.selectedBody, BodyTypeEnum.BlackHole) &&
                    this.editRadiusSlider &&
                    this.editRadiusDisplay
                ) {
                    const BH_BASE_MASS = 3 * SUN_MASS;
                    const BH_BASE_RADIUS = 1 * SCALE_FACTOR;
                    const bhRadius = Math.max(
                        0.25 * SCALE_FACTOR,
                        BH_BASE_RADIUS * Math.cbrt(value / BH_BASE_MASS)
                    );
                    this.editRadiusSlider.value = String(bhRadius);
                    this.editRadiusDisplay.textContent = String(Math.round(bhRadius * 100) / 100);
                }
            };
            editMassInput.min = '0.001';
            editMassInput.step = 'any';
            (editMassInput.oninput as () => void)();
        }

        if (this.editTempSlider) {
            const editTempSlider = this.editTempSlider;
            editTempSlider.oninput = () => {
                const value = parseFloat(editTempSlider.value);
                if (this.editTempDisplay) {
                    this.editTempDisplay.textContent = formatNumberForDisplay(value) + 'K';
                }
            };
            (editTempSlider.oninput as () => void)();
        }

        if (this.editLightIntensitySlider) {
            const editLightIntensitySlider = this.editLightIntensitySlider;
            editLightIntensitySlider.oninput = () => {
                const value = parseFloat(editLightIntensitySlider.value);
                if (this.editLightIntensityDisplay) {
                    this.editLightIntensityDisplay.textContent =
                        formatLightIntensityForDisplay(value);
                }
            };
            (editLightIntensitySlider.oninput as () => void)();
        }

        if (this.editRadiusSlider) {
            const editRadiusSlider = this.editRadiusSlider;
            editRadiusSlider.oninput = () => {
                const value = parseFloat(editRadiusSlider.value);
                if (this.editRadiusDisplay) {
                    this.editRadiusDisplay.textContent = formatNumberForDisplay(value);
                }
            };
            (editRadiusSlider.oninput as () => void)();
        }

        if (this.editColorInput) {
            this.editColorInput.oninput = () => {};
        }

        if (this.editVelocitySlider && this.editVelocityDisplay) {
            const editVelocitySlider = this.editVelocitySlider;
            const editVelocityDisplay = this.editVelocityDisplay;
            editVelocitySlider.oninput = () => {
                this._editSpeedDirty = true;
                const value = parseFloat(editVelocitySlider.value);
                editVelocityDisplay.textContent = value.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                });
            };
        }

        if (this.editOrbitalAngleSlider && this.editOrbitalAngleDisplay) {
            const editOrbitalAngleSlider = this.editOrbitalAngleSlider;
            const editOrbitalAngleDisplay = this.editOrbitalAngleDisplay;
            editOrbitalAngleSlider.oninput = () => {
                this._editAngleDirty = true;
                const value = parseFloat(editOrbitalAngleSlider.value);
                editOrbitalAngleDisplay.textContent = value.toFixed(0) + '°';
            };
        }

        if (this.editInclinationSlider && this.editInclinationDisplay) {
            const editInclinationSlider = this.editInclinationSlider;
            const editInclinationDisplay = this.editInclinationDisplay;
            editInclinationSlider.oninput = () => {
                this._editInclinationDirty = true;
                const value = parseFloat(editInclinationSlider.value);
                editInclinationDisplay.textContent = value.toFixed(0) + '°';
            };
        }

        updateAddModeVisibility();

        if (this.applyEditBtn) {
            this.applyEditBtn.onclick = () => {
                const name = this.editNameInput ? this.editNameInput.value.trim() : null;
                const mass = this.clampMassValue(parseFloat(this.editMassInput?.value ?? '0'));
                const isStarBody = this.selectedBody
                    ? isBodyType(this.selectedBody, BodyTypeEnum.Star)
                    : false;

                const temperature = this.editTempSlider
                    ? parseFloat(this.editTempSlider.value)
                    : null;
                const lightIntensity = this.editLightIntensitySlider
                    ? parseFloat(this.editLightIntensitySlider.value)
                    : null;
                const radius = this.editRadiusSlider
                    ? parseFloat(this.editRadiusSlider.value)
                    : null;
                const velocity =
                    this._editSpeedDirty && this.editVelocitySlider
                        ? parseFloat(this.editVelocitySlider.value)
                        : null;
                const orbitalAngle =
                    this._editAngleDirty && this.editOrbitalAngleSlider
                        ? parseFloat(this.editOrbitalAngleSlider.value)
                        : null;
                const inclination =
                    this._editInclinationDirty && this.editInclinationSlider
                        ? parseFloat(this.editInclinationSlider.value)
                        : null;
                const color = this.editColorInput ? this.editColorInput.value : null;
                // Tilt/azimuth: always emit current slider values when the group is visible
                const editTilt =
                    this.editTiltSlider && this.editTiltGroup?.style.display !== 'none'
                        ? parseFloat(this.editTiltSlider.value)
                        : null;
                const editAzimuth =
                    this.editAzimuthSlider && this.editAzimuthGroup?.style.display !== 'none'
                        ? parseFloat(this.editAzimuthSlider.value)
                        : null;

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
                    editTilt,
                    editAzimuth,
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

    registerGetFocusObject(fn: () => Body | null): void {
        this.getFocusObject = fn;
    }

    randomizeCreateBodyInputs(bodyType?: string | null): void {
        const type = bodyType || this.getSelectedBodyType();

        const setValue = (input: HTMLInputElement | null, value: number): void => {
            if (!input) return;
            input.value = String(value);
            if (typeof input.oninput === 'function') {
                (input.oninput as () => void)();
            }
        };

        const rand = (min: number, max: number) => min + Math.random() * (max - min);
        const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1));
        const randBool = () => Math.random() < 0.5;

        // Only randomize the inclination slider for non-star bodies.
        // Custom stars already get deterministic axial tilt/rotation from randomStarParams() (seeded PRNG),
        // so using Math.random() here would introduce unnecessary non-determinism.
        if (this.inclinationSlider && type !== 'sun') {
            setValue(this.inclinationSlider, randInt(0, 90));
        }

        if (type === 'sun') {
            this.randomizeCustomStarValues();
            return;
        }

        if (this.hasAtmosphereCheckbox && this.hasAtmosphereRow?.style.display !== 'none') {
            this.hasAtmosphereCheckbox.checked = randBool();
        }

        if (type === 'planet') {
            // Randomize the planet subtype dropdown first so mass/radius correspond.
            const planetTypeSelect = document.getElementById(
                'planetTypeSelect'
            ) as HTMLSelectElement | null;

            const planetTypes = [
                'solid',
                'gas_giant',
                'ice_giant',
                'volcanic',
                'ocean',
                'frozen',
                'desert',
                'temperate',
            ] as const;
            if (planetTypeSelect && planetTypeSelect.options.length > 0) {
                const randomSubtype =
                    planetTypes[Math.floor(Math.random() * planetTypes.length)];
                planetTypeSelect.value = randomSubtype;
            }

            const planetType = this.getSelectedPlanetType();

            let massMin: number;
            let massMax: number;
            let radiusMin: number;
            let radiusMax: number;

            // Volcanic uses the same mass/radius ranges as solid-like terrestrial.
            if (planetType === 'gas_giant') {
                massMin = JUPITER_MASS;
                massMax = JUPITER_MASS * 1.8;
                radiusMin = JUPITER_RADIUS * 0.7;
                radiusMax = JUPITER_RADIUS * 1.8;
            } else if (planetType === 'ice_giant') {
                massMin = NEPTUNE_MASS;
                massMax = NEPTUNE_MASS * 1.8;
                radiusMin = NEPTUNE_RADIUS * 0.7;
                radiusMax = NEPTUNE_RADIUS * 1.8;
            } else {
                massMin = EARTH_MASS;
                massMax = EARTH_MASS * 5;
                radiusMin = EARTH_RADIUS * 0.7;
                radiusMax = EARTH_RADIUS * 1.8;
            }

            const mass = rand(massMin, massMax);
            const radius = rand(radiusMin, radiusMax);
            const massValue = this.clampMassValue(mass);

            if (this.createMassInput) {
                this.createMassInput.removeAttribute('max');
                this.createMassInput.min = '0.001';
                this.createMassInput.step = 'any';
                this.createMassInput.value = String(massValue);
                this.createMassInput.setAttribute('value', String(massValue));
                this.createMassInput.defaultValue = String(massValue);
                if (this.createMassDisplay) {
                    this.createMassDisplay.textContent = this.formatMassForDisplay(massValue);
                }
                if (typeof this.createMassInput.oninput === 'function') {
                    (this.createMassInput.oninput as () => void)();
                }
            }

            setValue(this.createRadiusSlider, radius);
            if (this.createTiltGroup?.style.display !== 'none') {
                setValue(this.createTiltSlider, randInt(-180, 180));
                setValue(this.createAzimuthSlider, randInt(-180, 180));
            }
            return;
        }

        if (type === 'moon') {
            const moonMassMin = MOON_MASS * 0.5;
            const moonMassMax = MOON_MASS * 1.8;
            const mass = rand(moonMassMin, moonMassMax);
            const massValue = this.clampMassValue(mass);
            const radiusMin = MOON_RADIUS * 0.5;
            const radiusMax = MOON_RADIUS * 1.8;

            if (this.createMassInput) {
                this.createMassInput.removeAttribute('max');
                this.createMassInput.min = '0.001';
                this.createMassInput.step = 'any';
                this.createMassInput.value = String(massValue);
                this.createMassInput.setAttribute('value', String(massValue));
                this.createMassInput.defaultValue = String(massValue);
                if (this.createMassDisplay) {
                    this.createMassDisplay.textContent = this.formatMassForDisplay(massValue);
                }
                if (typeof this.createMassInput.oninput === 'function') {
                    (this.createMassInput.oninput as () => void)();
                }
            }

            setValue(this.createRadiusSlider, rand(radiusMin, radiusMax));
            if (this.createTiltGroup?.style.display !== 'none') {
                setValue(this.createTiltSlider, randInt(-180, 180));
                setValue(this.createAzimuthSlider, randInt(-180, 180));
            }
            return;
        }

        if (type === 'asteroid') {
            if (this.createMassInput) {
                setValue(this.createMassInput, this.clampMassValue(rand(1e10, 1e18)));
            }
            if (this.createRadiusSlider) setValue(this.createRadiusSlider, rand(1, 500));
            return;
        }

        if (type === 'comet') {
            if (this.createMassInput) {
                setValue(this.createMassInput, this.clampMassValue(rand(1e9, 1e16)));
            }
            if (this.createRadiusSlider) setValue(this.createRadiusSlider, rand(1, 100));
            return;
        }

        if (type === 'black_hole') {
            // Log-sample mass between 3 and 50 solar masses
            const BH_BASE_MASS = 3 * SUN_MASS;
            const BH_MAX_MASS = 50 * SUN_MASS;
            const t = Math.random();
            const bhMass = BH_BASE_MASS * Math.pow(BH_MAX_MASS / BH_BASE_MASS, t);
            const clampedMass = this.clampMassValue(bhMass);

            if (this.createMassInput) {
                this.createMassInput.removeAttribute('max');
                this.createMassInput.min = String(BH_BASE_MASS);
                this.createMassInput.step = 'any';
                this.createMassInput.value = String(clampedMass);
                this.createMassInput.setAttribute('value', String(clampedMass));
                this.createMassInput.defaultValue = String(clampedMass);
                if (this.createMassDisplay) {
                    this.createMassDisplay.textContent = this.formatMassForDisplay(clampedMass);
                }
                if (typeof this.createMassInput.oninput === 'function') {
                    (this.createMassInput.oninput as () => void)();
                }
            }

            // Compute initial radius using same formula as BlackHole.massToEventHorizonRadius
            const BH_BASE_RADIUS = 1 * SCALE_FACTOR;
            const bhRadius = Math.max(
                0.25 * SCALE_FACTOR,
                BH_BASE_RADIUS * Math.cbrt(clampedMass / BH_BASE_MASS)
            );
            setValue(this.createRadiusSlider, bhRadius);
            return;
        }

        this.randomizeCustomStarValues();
    }

    randomizeCustomStarValues(): void {
        const setValue = (input: HTMLInputElement | null, value: number): void => {
            if (!input) return;
            input.value = String(value);
            if (typeof input.oninput === 'function') {
                (input.oninput as () => void)();
            }
        };

        // Always use the seeded generator to guarantee consistent, in-bounds values.
        const params = randomStarParams();
        const inclinationDeg = Math.round(params.rotationTilt); // 0..90 integer

        setValue(this.inclinationSlider, inclinationDeg);

        // Force UI refresh for range inputs (some browsers won't repaint thumb reliably on value assignment)
        if (this.inclinationSlider) {
            this.inclinationSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }

        if (this.inclinationDisplay) {
            this.inclinationDisplay.textContent = `${inclinationDeg.toFixed(0)}°`;
        }

        setValue(this.createMassInput, this.clampMassValue(params.mass));
        setValue(this.createRadiusSlider, Math.round(params.radius * 100) / 100);
        setValue(this.createTemperatureSlider, Math.round(params.temperature));
        setValue(this.createLightIntensitySlider, Math.round(params.lightIntensity));

        if (this.createTiltGroup?.style.display !== 'none') {
            setValue(this.createTiltSlider, inclinationDeg);
            setValue(this.createAzimuthSlider, Math.floor(Math.random() * 361) - 180);
        }
    }

    toggleCreationForm(): void {
        if (this.bodyCreationForm) {
            this.bodyCreationForm.classList.toggle('visible');
        }
    }

    toggleEditForm(): void {
        if (this.bodyEditForm) {
            this.bodyEditForm.classList.toggle('visible');
        }
    }

    getSelectedBodyType(): string | null {
        return this.bodyTypeSelect ? this.bodyTypeSelect.value : null;
    }

    getSelectedOrbitType(): string {
        const circularRadio = document.getElementById('orbitCircular') as HTMLInputElement | null;
        const ellipticalRadio = document.getElementById(
            'orbitElliptical'
        ) as HTMLInputElement | null;
        if (circularRadio && circularRadio.checked) return 'circular';
        if (ellipticalRadio && ellipticalRadio.checked) return 'elliptical';
        return 'circular';
    }

    getSelectedPlanetType(): string {
        const planetTypeSelect = document.getElementById(
            'planetTypeSelect'
        ) as HTMLSelectElement | null;

        const value = planetTypeSelect?.value;
        if (
            value === 'solid' ||
            value === 'gas_giant' ||
            value === 'ice_giant' ||
            value === 'volcanic' ||
            value === 'ocean' ||
            value === 'frozen' ||
            value === 'desert' ||
            value === 'temperate'
        ) {
            return value;
        }

        return 'solid';
    }

    validateMoonCreation(): void {
        const bodyType = this.bodyTypeSelect ? this.bodyTypeSelect.value : null;
        if (bodyType === 'moon') {
            // Use the management panel's selected body (what the user has focused in the UI)
            const parentBody = this.selectedBody || this.getFocusObject();
            const isValid = parentBody && !parentBody._isDisposed;

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

    setSelectedBody(body: Body | null): void {
        this.selectedBody = body;

        const setGroupVisible = (
            el: HTMLElement | null,
            visible: boolean,
            display = 'block'
        ): void => {
            if (!el) return;
            el.style.display = visible ? display : 'none';
        };

        const safeSetText = (el: HTMLElement | null, text: string): void => {
            if (!el) return;
            el.textContent = text;
        };

        const toHexColor = (c: unknown): string => {
            try {
                if (c && typeof c === 'object' && 'r' in c && 'g' in c && 'b' in c) {
                    const rgb = c as { r: number; g: number; b: number };
                    const r = Math.max(0, Math.min(255, Math.round(rgb.r * 255)));
                    const g = Math.max(0, Math.min(255, Math.round(rgb.g * 255)));
                    const b = Math.max(0, Math.min(255, Math.round(rgb.b * 255)));
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
            safeSetText(this.editBodyName, 'No body selected');
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

        const isStarBody = isBodyType(body, BodyTypeEnum.Star);

        safeSetText(this.editBodyName, body.name || 'Unnamed Body');
        if (this.editNameInput) {
            this.editNameInput.value = body.name || '';
        }

        if (this.editColorInput) {
            const showColorPicker =
                isBodyType(body, BodyTypeEnum.Asteroid) || isBodyType(body, BodyTypeEnum.Comet);
            this.editColorInput.disabled = !showColorPicker;
            if (this.editColorInput.parentElement) {
                this.editColorInput.parentElement.style.display = showColorPicker
                    ? 'block'
                    : 'none';
            }

            if (showColorPicker) {
                const bodyWithColor = body as Body & { baseColor?: unknown; color?: unknown };
                const c = bodyWithColor.baseColor || bodyWithColor.color || 0xffffff;
                this.editColorInput.value = toHexColor(c);
            }
        }

        setGroupVisible(this.editTempGroup, isStarBody);
        setGroupVisible(this.editLightIntensityGroup, isStarBody);
        setGroupVisible(this.editRadiusGroup, true);

        if (this.editRadiusSlider && this.editRadiusDisplay) {
            const r = typeof body.radius === 'number' && isFinite(body.radius) ? body.radius : 1;
            this.editRadiusSlider.value = String(r);
            safeSetText(this.editRadiusDisplay, this.formatNumberForDisplay(r));
            if (typeof this.editRadiusSlider.oninput === 'function') {
                (this.editRadiusSlider.oninput as () => void)();
            }
        }

        if (isStarBody && this.editTempSlider && this.editTempDisplay) {
            const starBody = body as Star;
            const t =
                typeof starBody.temperature === 'number' && isFinite(starBody.temperature)
                    ? starBody.temperature
                    : 5778;
            this.editTempSlider.value = String(t);
            safeSetText(this.editTempDisplay, this.formatNumberForDisplay(t) + 'K');
            if (typeof this.editTempSlider.oninput === 'function') {
                (this.editTempSlider.oninput as () => void)();
            }
        }

        if (isStarBody && this.editLightIntensitySlider && this.editLightIntensityDisplay) {
            let intensity: number | null = null;
            if (body instanceof Star) {
                intensity = body.lightIntensity;
            }

            if (intensity == null) intensity = 500000000;

            this.editLightIntensitySlider.value = String(intensity);
            safeSetText(
                this.editLightIntensityDisplay,
                this.formatLightIntensityForDisplay(intensity)
            );
        }

        if (this.editMassInput && this.editMassDisplay) {
            const mass =
                typeof body.mass === 'number' && isFinite(body.mass) ? body.mass : this.MASS_MIN;
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
            const editVelocitySlider = this.editVelocitySlider;
            const editVelocityDisplay = this.editVelocityDisplay;

            // Populate from current velocity magnitude
            const vel = (body as Body & { velocity?: { x: number; y: number; z: number } })
                .velocity;
            const currentSpeed = vel ? Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z) : 0;
            const maxSpeed = parseFloat(editVelocitySlider.max) || 200;
            editVelocitySlider.value = String(Math.min(currentSpeed, maxSpeed));
            editVelocityDisplay.textContent = Math.min(currentSpeed, maxSpeed).toLocaleString(
                undefined,
                {
                    maximumFractionDigits: 1,
                }
            );
        }

        if (this.editOrbitalAngleSlider && this.editOrbitalAngleDisplay) {
            const vel = (body as Body & { velocity?: { x: number; y: number; z: number } })
                .velocity;
            if (vel) {
                const angleDeg = ((Math.atan2(vel.z, vel.x) * 180) / Math.PI + 360) % 360;
                this.editOrbitalAngleSlider.value = String(Math.round(angleDeg));
            } else {
                this.editOrbitalAngleSlider.value = '0';
            }
            this.editOrbitalAngleDisplay.textContent =
                this.formatNumberForDisplay(parseFloat(this.editOrbitalAngleSlider.value)) + '°';
        }

        if (this.editInclinationSlider && this.editInclinationDisplay) {
            const vel = (body as Body & { velocity?: { x: number; y: number; z: number } })
                .velocity;
            if (vel) {
                const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
                const inclinationDeg = (Math.atan2(vel.y, horizontalSpeed) * 180) / Math.PI;
                const maxInclination = parseFloat(this.editInclinationSlider.max) || 90;
                this.editInclinationSlider.value = String(
                    Math.min(Math.max(Math.round(inclinationDeg), 0), maxInclination)
                );
            } else {
                this.editInclinationSlider.value = '0';
            }
            this.editInclinationDisplay.textContent =
                this.formatNumberForDisplay(parseFloat(this.editInclinationSlider.value)) + '°';
        }

        // Show tilt/azimuth sliders only for bodies that have axial rotation (CelestialBody).
        const hasTilt = 'rotation' in body && (body as { rotation?: { tilt?: number } }).rotation?.tilt !== undefined;
        setGroupVisible(this.editTiltGroup, hasTilt);
        setGroupVisible(this.editAzimuthGroup, hasTilt);
        if (hasTilt && this.editTiltSlider && this.editTiltDisplay) {
            const rot = (body as { rotation: { tilt: number; azimuth?: number } }).rotation;
            const tiltVal = Math.round(rot.tilt ?? 0);
            this.editTiltSlider.value = String(tiltVal);
            this.editTiltDisplay.textContent = `${tiltVal}°`;
        }
        if (hasTilt && this.editAzimuthSlider && this.editAzimuthDisplay) {
            const rot = (body as { rotation: { tilt: number; azimuth?: number } }).rotation;
            const azVal = Math.round(rot.azimuth ?? 0);
            this.editAzimuthSlider.value = String(azVal);
            this.editAzimuthDisplay.textContent = `${azVal}°`;
        }

        this.validateMoonCreation();
        this.updateOrbitParentDisplay();
        this._editSpeedDirty = false;
        this._editAngleDirty = false;
        this._editInclinationDirty = false;
    }

    updateOrbitParentDisplay(): void {
        if (!this.orbitParentDisplay) return;
        if (this.selectedBody && !this.selectedBody._isDisposed) {
            this.orbitParentDisplay.textContent = this.selectedBody.name || 'Unnamed';
        } else {
            this.orbitParentDisplay.textContent = 'None';
        }
    }
}
