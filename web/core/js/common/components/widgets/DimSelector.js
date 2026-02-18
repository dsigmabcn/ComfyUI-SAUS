import { updateWorkflow } from '../workflowManager.js';

class DimensionSelector {
    constructor(config = {}, workflow) {
        this.id = config.id;
        this.workflow = workflow;
        this.currentSelection = 'Square';
        
        // Define resolutions for different models
        this.resolutions = {
            'SDXL': {
                'Square': { width: 1024, height: 1024 },
                'Landscape': { width: 1216, height: 832 },
                'Portrait': { width: 832, height: 1216 }
            },
            'FLUX': {
                'Square': { width: 1024, height: 1024 },
                'Landscape': { width: 1216, height: 832 },
                'Portrait': { width: 832, height: 1216 }
            },
            'FLUX-2': {
                'Square': { width: 1024, height: 1024 },
                'Landscape': { width: 1216, height: 832 },
                'Portrait': { width: 832, height: 1216 }
            },
            'WAN': {
                'Square': { width: 640, height: 640 },
                'Landscape': { width: 832, height: 480 },
                'Portrait': { width: 480, height: 832 }
            },
            'WAN 2.2': {
                'Square': { width: 640, height: 640 },
                'Landscape': { width: 832, height: 480 },
                'Portrait': { width: 480, height: 832 }
            },
            'QWEN': {
                'Square': { width: 1328, height: 1328 },
                'Landscape': { width: 1472, height: 1104 },
                'Portrait': { width: 1104, height: 1472 }
            },
            'LTX-2': {
                'Square': { width: 960, height: 960 },
                'Landscape': { width: 1280, height: 720 },
                'Portrait': { width: 720, height: 1280 }
            },
            'Z-image': {
                'Square': { width: 1024, height: 1024 },
                'Landscape': { width: 1248, height: 832 },
                'Portrait': { width: 832, height: 1248 }
            }            
        };

        this.config = {
            defaultWidth: 1216,
            defaultHeight: 832,
            minDimension: 32,
            maxDimension: 4096,
            step: 16,
            nodePath : config.nodePath,
            ...config
        };
        this.config.defaultWidth = config.defaultWidth || 1216;
        this.config.defaultHeight = config.defaultHeight || 832;

        this.currentModel = this.config.modelType || 'SDXL';
        
        // Set default selection to Square and update defaults
        if (this.resolutions[this.currentModel] && this.resolutions[this.currentModel]['Square']) {
            this.config.defaultWidth = this.resolutions[this.currentModel]['Square'].width;
            this.config.defaultHeight = this.resolutions[this.currentModel]['Square'].height;
        }
        
        this.initializeComponent();
    }

    initializeComponent() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.renderComponent());
        } else {
            this.renderComponent();
        }
    }

    renderComponent() {
        this.container = document.getElementById(this.id);
        if (this.container) {
            this.render();
            this.attachEventListeners();
            this.updateWorkflowWithCurrentDimensions();
        } else {
            console.warn(`Container with id "${this.id}" not found. Retrying in 500ms.`);
            setTimeout(() => this.renderComponent(), 500);
        }
    }

    render() {
        const res = this.resolutions[this.currentModel];
        const getLabel = (key) => {
            if (key === 'Custom') return 'custom';
            if (res && res[key]) return `${key.toLowerCase()}<br>${res[key].width}x${res[key].height}`;
            return key;
        };
        const isActive = (ratio) => this.currentSelection === ratio ? 'active' : '';

        this.container.innerHTML = `
            <div class="dimension-selector-container">
                <div class="dim-icons-container">
                    <button class="dim-icon-btn ${isActive('Square')}" data-ratio="Square" title="Square">
                        <i class="far fa-square"></i>
                        <span class="dim-icon-label">${getLabel('Square')}</span>
                    </button>
                    <button class="dim-icon-btn ${isActive('Landscape')}" data-ratio="Landscape" title="Landscape">
                        <div style="display: inline-block; width: 18px; height: 12px; border: 2px solid currentColor; border-radius: 2px;"></div>
                        <span class="dim-icon-label">${getLabel('Landscape')}</span>
                    </button>
                    <button class="dim-icon-btn ${isActive('Portrait')}" data-ratio="Portrait" title="Portrait">
                        <div style="display: inline-block; width: 12px; height: 18px; border: 2px solid currentColor; border-radius: 2px;"></div>
                        <span class="dim-icon-label">${getLabel('Portrait')}</span>
                    </button>
                    <button class="dim-icon-btn ${isActive('Custom')}" data-ratio="Custom" title="Custom">
                        <i class="fas fa-sliders-h"></i>
                        <span class="dim-icon-label">${getLabel('Custom')}</span>
                    </button>
                </div>
                <div id="dimension-selector" style="display: ${this.currentSelection === 'Custom' ? 'flex' : 'none'};">
                    <div class="dimension-stepper" data-dimension="width">
                        <label for="width-input">Width</label>
                        <div class="stepper">
                            <button class="stepper__button" data-action="decrease" data-target="width-input">-</button>
                            <input class="stepper__input" type="number" value="${this.config.defaultWidth}" id="width-input" name="width" min="${this.config.minDimension}" max="${this.config.maxDimension}" step="${this.config.step}">
                            <button class="stepper__button" data-action="increase" data-target="width-input">+</button>
                        </div>
                    </div>
                    <button class="swap-btn" id="swap-btn">↔</button>
                    <div class="dimension-stepper" data-dimension="height">
                        <label for="height-input">Height</label>
                        <div class="stepper">
                            <button class="stepper__button" data-action="decrease" data-target="height-input">-</button>
                            <input class="stepper__input" type="number" value="${this.config.defaultHeight}" id="height-input" name="height" min="${this.config.minDimension}" max="${this.config.maxDimension}" step="${this.config.step}">
                            <button class="stepper__button" data-action="increase" data-target="height-input">+</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    attachEventListeners() {
        const widthInput = document.getElementById('width-input');
        const heightInput = document.getElementById('height-input');
        const swapBtn = document.getElementById('swap-btn');

        this.container.querySelectorAll('.stepper__button').forEach(button => {
            button.addEventListener('click', this.handleStepperClick.bind(this));
        });

        this.container.querySelectorAll('.dim-icon-btn').forEach(btn => {
            btn.addEventListener('click', this.handleIconClick.bind(this));
        });

        widthInput.addEventListener('change', this.handleInputChange.bind(this));
        heightInput.addEventListener('change', this.handleInputChange.bind(this));
        swapBtn.addEventListener('click', this.handleSwap.bind(this));
    }

    handleStepperClick(event) {
        const targetInput = document.getElementById(event.target.dataset.target);
        const change = event.target.dataset.action === 'increase' ? 1 : -1;
        this.updateInputValue(targetInput, change);
    }

    handleInputChange(event) {
        const dimension = event.target.name;
        const value = parseInt(event.target.value, 10);
        this.updateWorkflowDimension(dimension, value);
        this.setActiveIcon('Custom');
    }

    handleSwap() {
        const widthInput = document.getElementById('width-input');
        const heightInput = document.getElementById('height-input');
        [widthInput.value, heightInput.value] = [heightInput.value, widthInput.value];
        this.updateWorkflowWithCurrentDimensions();
        this.setActiveIcon('Custom');
    }

    handleIconClick(event) {
        const btn = event.currentTarget;
        const ratio = btn.dataset.ratio;
        this.setActiveIcon(ratio);

        if (ratio !== 'Custom') {
            this.applyPreset(ratio);
        }
    }

    applyPreset(ratio) {
        const preset = this.resolutions[this.currentModel][ratio];
        if (preset) {
            document.getElementById('width-input').value = preset.width;
            document.getElementById('height-input').value = preset.height;
            this.updateWorkflowWithCurrentDimensions();
        }
    }

    setActiveIcon(ratio) {
        this.currentSelection = ratio;
        this.container.querySelectorAll('.dim-icon-btn').forEach(btn => {
            if (btn.dataset.ratio === ratio) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        const dimSelector = document.getElementById('dimension-selector');
        if (dimSelector) {
            dimSelector.style.display = ratio === 'Custom' ? 'flex' : 'none';
        }
    }

    updateInputValue(input, change) {
        const min = parseInt(input.getAttribute('min'), 10);
        const max = parseInt(input.getAttribute('max'), 10);
        const step = parseInt(input.getAttribute('step'), 10);
        let newValue = parseInt(input.value, 10) + change * step;
        newValue = Math.max(min, Math.min(newValue, max));
        input.value = newValue;
        this.updateWorkflowDimension(input.name, newValue);
        this.setActiveIcon('Custom');
    }

    updateWorkflowDimension(dimension, value) {
        const path = this.config.nodePath;
        // const path = config.nodePath
        updateWorkflow(this.workflow, `${path}.${dimension}`, value);
        // console.log(`Workflow updated - ${dimension}: ${value}`);
    }

    updateWorkflowWithCurrentDimensions() {
        const width = parseInt(document.getElementById('width-input').value, 10);
        const height = parseInt(document.getElementById('height-input').value, 10);
        this.updateWorkflowDimension('width', width);
        this.updateWorkflowDimension('height', height);
    }
}
export default DimensionSelector;
