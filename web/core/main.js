import StateManager from './js/common/scripts/stateManager.js';
import MultiComponent from './js/common/components/widgets/MultiComponent.js';
import InputComponent from "./js/common/components/widgets/InputComponent.js";
import ToggleComponent from "./js/common/components/widgets/ToggleComponent.js";
import DataComponent from "./js/common/components/DataComponent.js";
import Seeder from "./js/common/components/widgets/Seeder.js";
import Stepper from "./js/common/components/widgets/Stepper.js";
import MultiStepper from "./js/common/components/widgets/MultiStepper.js";
import DropdownStepper from "./js/common/components/widgets/DropdownStepper.js";
import DimensionSelector from './js/common/components/widgets/DimSelector.js';
import Dropdown from './js/common/components/widgets/Dropdown.js';
import imageLoaderComp from './js/common/components/widgets/imageLoaderComp.js';
import { uuidv4, showSpinner, hideSpinner } from './js/common/components/utils.js';
import { initializeWebSocket, messageHandler } from './js/common/components/messageHandler.js';
import { updateWorkflowValue, updateWorkflow } from './js/common/components/workflowManager.js';
import { processWorkflowNodes } from './js/common/scripts/nodesscanner.js';
import { fetchWorkflow } from './js/common/scripts/fetchWorkflow.js'; 
import { fetchappConfig } from './js/common/scripts/fetchappConfig.js'; 
import { setFaviconStatus } from './js/common/scripts/favicon.js'; 
import { initialize } from './js/common/scripts/interactiveUI.js';
import injectStylesheet from './js/common/scripts/injectStylesheet.js';
import LoraWorkflowManager from './js/common/components/LoraWorkflowManager.js';
import { CanvasLoader } from './js/common/components/canvas/CanvasLoader.js';
import { checkAndShowMissingPackagesDialog } from './js/common/components/missingPackagesDialog.js';
import CanvasComponent from './js/common/components/CanvasComponent.js';
import { store } from  './js/common/scripts/stateManagerMain.js';

(async (window, document, undefined) => {


    
    // ----------------------------------------------------------------------
    // NEW: Define the labels for components that should appear in the 'Basic' section.
    // Prompts are handled separately by setPromptComponents, so they are excluded here.
    const basicControlLabels = [
        "Checkpoint",
        "Model",
        "Model high noise",
        "Model low noise",
        "Type",
        "Steps",
        "Seed",
        "Dimension Selector",
        "Image Megapixels",
        "Time (s)",
        "FPS"
 
    ];
    // ----------------------------------------------------------------------
    


    function getAppName() {
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.src && script.src.includes('main.js')) {
                try {
                    const url = new URL(script.src, window.location.origin);
                    const appParam = url.searchParams.get('app');
                    if (appParam) {
                        
                        return appParam;
                    }
                } catch (e) {
                    console.error('Error parsing script src URL:', e);
                }
            }
        }
        const paths = window.location.pathname.split('/').filter(Boolean);
        if ((paths[0] === 'flow' || paths[0] === 'saus') && paths[1]) {
            return paths[1];
        }

        if (paths.length > 0) {
            return paths[0];
        }
        
        return 'builder';
    }

    const appName = getAppName();
    const client_id = uuidv4();
    const appConfig = await fetchappConfig(appName);
    const appList = await fetch('/saus/api/apps-list').then(res => res.json());
    const architectures = await fetch('/saus/api/architectures').then(res => res.json());
    const modelsData = await fetch('/saus/api/data-model-info').then(res => res.json());

    const currentApp = appList.find(app => app.url === appName);
    const architectureName = currentApp ? currentApp.architecture : null;
    
    let workflow = await fetchWorkflow(appName);
    let canvasLoader;
    
    const widgetInstances = {}; // To store all widget instances

    const seeders = [];
    initializeWebSocket(client_id);
    setFaviconStatus.Default();
    injectStylesheet('/core/css/main.css', 'main');
    injectStylesheet('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', 'font-awesome');
    

    //console.log("appConfig", appConfig);
    //console.log("workflow", workflow);


    // ----------------------------------------------------------------------
    // MODIFIED: Refactored generateWorkflowControls to use Basic/Advanced containers
    function generateWorkflowControls(config) {
        // Get the new destination containers
        const basicContainer = document.getElementById('basic-controls-container');
        const advancedContainer = document.getElementById('advanced-controls-container');

        // Helper to determine the container
        function getContainer(itemConfig) {
            // DimensionSelector and Seeder configs often lack a 'label', use ID as fallback
            const label = itemConfig.label || (itemConfig.id.includes('dimension-selector') ? "Dimension Selector" : itemConfig.id);
            if (basicControlLabels.includes(label)) {
                return basicContainer;
            }
            return advancedContainer;
        }

        function appendControl(itemConfig, className) {
            const container = getContainer(itemConfig);
            
            const div = document.createElement('div');
            div.id = itemConfig.id;
            div.classList.add(className);
            container.appendChild(div);
        }

        if (config.dropdowns && Array.isArray(config.dropdowns)) {            
            config.dropdowns.forEach(dropdown => {
                appendControl(dropdown, 'loader');
            });
        }
        
        if (config.steppers && Array.isArray(config.steppers)) {
            config.steppers.forEach(stepper => {
                appendControl(stepper, 'stepper-container');
            });
        }

        if (config.dimensionSelectors) {
            config.dimensionSelectors.forEach(selector => {
                // Manually add 'Dimension Selector' as label for categorization
                selector.label = "Dimension Selector"; 
                appendControl(selector, 'dimension-selector-container');
            });
        }
        
        if (config.inputs && Array.isArray(config.inputs)) {
            config.inputs.forEach(input => {
                appendControl(input, 'input-container');
            });
        }

        if (config.toggles && Array.isArray(config.toggles)) {
            config.toggles.forEach(toggle => {
                appendControl(toggle, 'toggle-container');
            });
        }

        if (config.seeders && Array.isArray(config.seeders)) {
            config.seeders.forEach(seeder => {
                // Manually add 'Seed' as label for categorization
                seeder.label = "Seed";
                appendControl(seeder, 'seeder-container');
            });
        }
    }

function setPromptComponents(config, options = { clearInputs: false }) {
    if (!config.prompts || !Array.isArray(config.prompts)) {
        return;
    }
    const promptsContainer = document.getElementById('prompts');

    config.prompts.forEach((input, index) => {
        const container = document.createElement('div');
        container.className = 'prompt-container'; 

        const labelDiv = document.createElement('div');
        labelDiv.className = 'title-text';
        labelDiv.textContent = input.label;

        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'prompt-input-wrapper';

        const textArea = document.createElement('textarea');
        textArea.id = input.id;
        textArea.className = 'prompt-textarea';

        if (options.clearInputs) {
            textArea.value = '';
        } else {
            textArea.value = input.default || generateDynamicScriptDefault(index);
        }

        const expandBtn = document.createElement('div');
        expandBtn.className = 'expand-arrow-bottom';
        expandBtn.innerHTML = '▼'; 
        
        expandBtn.onclick = () => {
            textArea.classList.toggle('expanded');
            expandBtn.classList.toggle('rotated');
        };

        inputWrapper.appendChild(textArea);
        inputWrapper.appendChild(expandBtn);

        container.appendChild(labelDiv);
        container.appendChild(inputWrapper);
        
        promptsContainer.appendChild(container);
    });
}

    function generateDynamicScriptDefault(index) {
        const defaultsPrompts = [
            'A funny bunny playing in a laboratory  between colorful neon glassware',
            'low quality, bad quality, ugly, blur, jpeg artifacts, lowres, child',
        ];
        return defaultsPrompts[index] || ''; 
    }

    generateWorkflowControls(appConfig); 
    setPromptComponents(appConfig, true);
    
    async function setupModeSelector() {
        const modeSelectorContainer = document.getElementById('mode-selector-container');
        const hdButton = modeSelectorContainer.querySelector('[data-mode="hd"]');
        const turboButton = modeSelectorContainer.querySelector('[data-mode="turbo"]');
    
        const modelWidgetConfig = appConfig.dropdowns.find(d => d.label === 'Model' || d.label === 'Checkpoint');
        let availableModels = [];
        if (modelWidgetConfig) {
            try {
                const url = `${window.location.origin}/object_info/${modelWidgetConfig.url}`;
                const response = await fetch(url);
                const data = await response.json();
                const firstKey = Object.keys(data)[0];
                const loaderData = data[firstKey];
                const key = modelWidgetConfig.key || 'ckpt_name';
                availableModels = loaderData.input.required[key][0];
            } catch (error) {
                console.error("Could not fetch available models list:", error);
            }
        }
    
        const checkModels = (settings) => {
            if (!settings || !settings.model || settings.model.length === 0) {
                return true; 
            }
            for (const modelId of settings.model) {
                const modelInfo = modelsData[modelId];
                if (!modelInfo) {
                    console.warn(`Model identifier "${modelId}" not found in models_data.json`);
                    return false;
                }
                let path = (modelInfo.model_path || '').replace('/diffusion_models/', '').replace('/checkpoints/', '').replace(/^\/|\/$/g, '');
                const fullModelPath = path ? `${path}/${modelInfo.id}` : modelInfo.id;
                
                if (!availableModels.includes(fullModelPath)) {
                    console.warn(`Required model "${fullModelPath}" is not installed.`);
                    return false;
                }
            }
            return true;
        };
    
        if (architectureName && architectures[architectureName]) {
            const arch = architectures[architectureName];
    
            if (arch.base_settings) {
                hdButton.textContent = arch.base_settings.name;
                if (!checkModels(arch.base_settings)) {
                    hdButton.disabled = true;
                    hdButton.classList.add('disabled-saus');
                    hdButton.title = 'Required models for this mode are not installed.';
                }
            } else {
                hdButton.disabled = true;
                hdButton.classList.add('disabled-saus');
                hdButton.title = 'This mode is not configured for this architecture.';
            }
    
            if (arch.turbo_settings) {
                turboButton.textContent = arch.turbo_settings.name;
                if (!checkModels(arch.turbo_settings)) {
                    turboButton.disabled = true;
                    turboButton.classList.add('disabled-saus');
                    turboButton.title = 'Required models for this mode are not installed.';
                }
            } else {
                turboButton.disabled = true;
                turboButton.classList.add('disabled-saus');
                turboButton.title = 'This mode is not configured for this architecture.';
            }
        } else {
            hdButton.disabled = true;
            hdButton.classList.add('disabled-saus');
            hdButton.title = 'Architecture not found.';
            turboButton.disabled = true;
            turboButton.classList.add('disabled-saus');
            turboButton.title = 'Architecture not found.';
        }
    
        if (!modeSelectorContainer) {
            console.warn("Mode selector container not found.");
            return;
        }
    
        modeSelectorContainer.addEventListener('click', async (event) => {
            const clickedButton = event.target.closest('.mode-button');
            if (!clickedButton || clickedButton.disabled) {
                return; 
            }
    
            if (clickedButton.classList.contains('exclusive-mode')) {
                if (clickedButton.classList.contains('active')) {
                    return;
                }
    
                const exclusiveButtons = modeSelectorContainer.querySelectorAll('.exclusive-mode');
                exclusiveButtons.forEach(btn => {
                    btn.classList.remove('active');
                });
    
                clickedButton.classList.add('active');

                const mode = clickedButton.dataset.mode;

                const modelWidgetConfigs = appConfig.dropdowns.filter(d => d.label.startsWith('Model') || d.label === 'Checkpoint');
                const modelWidgetElements = modelWidgetConfigs.map(c => document.getElementById(c.id)).filter(el => el);
                const typeWidgetElements = appConfig.dropdowns
                    .filter(d => d.label === 'Type')
                    .map(d => document.getElementById(d.id))
                    .filter(el => el);
                const loraWidgetElement = document.querySelector('.lora-component-container');
                const dynamicLoraWidgets = document.querySelectorAll('#side-workflow-controls .dropdown-stepper-container[id^="LoraLoader_"]');
                
                if (mode === 'custom') {
                    modelWidgetElements.forEach(el => el.style.display = '');
                    typeWidgetElements.forEach(el => el.style.display = '');
                    if (loraWidgetElement) loraWidgetElement.style.display = '';
                    dynamicLoraWidgets.forEach(w => w.style.display = '');
                } else { // for 'hd' and 'turbo'
                    modelWidgetElements.forEach(el => el.style.display = 'none');
                    typeWidgetElements.forEach(el => el.style.display = 'none');
                    if (loraWidgetElement) loraWidgetElement.style.display = 'none';
                    dynamicLoraWidgets.forEach(w => w.style.display = 'none');
                }


                if (architectureName && architectures[architectureName]) {
                    const arch = architectures[architectureName];
                    const settings = (mode === 'hd' && arch.base_settings) ? arch.base_settings :
                                     (mode === 'turbo' && arch.turbo_settings) ? arch.turbo_settings : null;

                    if (settings) {
                        // --- Models ---
                        if (settings.model && Array.isArray(settings.model)) {
                            const modelIdentifiers = settings.model;
                            const modelWidgetConfigs = appConfig.dropdowns.filter(d => d.label.startsWith('Model') || d.label === 'Checkpoint');
                            
                            modelIdentifiers.forEach((modelIdentifier, index) => {
                                if (modelWidgetConfigs[index] && modelsData[modelIdentifier]) {
                                    const modelWidgetConfig = modelWidgetConfigs[index];
                                    const modelInfo = modelsData[modelIdentifier];
                                    let path = (modelInfo.model_path || '').replace('/diffusion_models/', '').replace('/checkpoints/', '').replace(/^\/|\/$/g, '');
                                    const newModelValue = path ? `${path}/${modelInfo.id}` : modelInfo.id;
                                    
                                    updateWorkflow(workflow, modelWidgetConfig.nodePath, newModelValue);

                                    const dropdownElement = document.getElementById(modelWidgetConfig.id);
                                    if (dropdownElement) {
                                        const input = dropdownElement.querySelector('input');
                                        if (input) {
                                            const getDisplayName = (fullPath) => fullPath.split(/[\\/]/).pop();
                                            input.value = getDisplayName(newModelValue);
                                            input.title = newModelValue;
                                        }
                                    }
                                }
                            });
                        }

                        // --- LoRAs ---
                        const existingLoraWidgets = document.querySelectorAll('#side-workflow-controls .dropdown-stepper-container[id^="LoraLoader_"]');
                        existingLoraWidgets.forEach(widget => {
                            const removeBtn = widget.querySelector('button[title="Remove LoRA"]');
                            if (removeBtn) {
                                removeBtn.click();
                            }
                        });

                        if (settings.lora && Array.isArray(settings.lora) && settings.lora.length > 0) {
                            const loraIdentifiers = settings.lora;
                            const addLoraButtons = document.querySelectorAll('.add-lora-button');
                            
                            for (const loraIdentifier of loraIdentifiers) {
                                if (addLoraButtons.length > 0) {
                                    // Assuming chaining loras on the first model loader
                                    addLoraButtons[0].click();
                                    await new Promise(resolve => setTimeout(resolve, 100));
                                    
                                    const newLoraWidget = Array.from(document.querySelectorAll('#side-workflow-controls .dropdown-stepper-container[id^="LoraLoader_"]')).pop();

                                    if (newLoraWidget && modelsData[loraIdentifier]) {
                                        const loraInfo = modelsData[loraIdentifier];
                                        let path = (loraInfo.model_path || '').replace('/loras/', '');
                                        path = path.replace(/^\/|\/$/g, '');
                                        const newLoraValue = path ? `${path}/${loraInfo.id}` : loraInfo.id;
                                        
                                        const containerId = newLoraWidget.id;
                                        const nodeId = containerId.split('_')[1];
                                        const nodePath = `${nodeId}.inputs.lora_name`;
                                        updateWorkflow(workflow, nodePath, newLoraValue);

                                        const dropdownContainer = document.getElementById(`${containerId}-dropdown`);
                                        if (dropdownContainer) {
                                            const input = dropdownContainer.querySelector('input');
                                            if (input) {
                                                const getDisplayName = (fullPath) => fullPath.split(/[\\/]/).pop();
                                                input.value = getDisplayName(newLoraValue);
                                                input.title = newLoraValue;
                                            }
                                        }

                                        if (mode !== 'custom') {
                                            newLoraWidget.style.display = 'none';
                                        }
                                    }
                                }
                            }
                        }

                        // --- Other Steppers (CFG, Steps, etc.) ---
                        for (const key in settings) {
                            if (Object.prototype.hasOwnProperty.call(settings, key) && key !== 'model' && key !== 'lora' && key !== 'name') {
                                const widgetConfig = appConfig.steppers.find(s => s.label.toLowerCase() === key.toLowerCase());
                                if (widgetConfig) {
                                    const widgetInstance = widgetInstances[widgetConfig.id];
                                    if (widgetInstance) {
                                        const value = settings[key];
                                        if (value !== null && value !== undefined) {
                                            widgetInstance.updateValue(Number(value));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } else {
                clickedButton.classList.toggle('active');

                if (clickedButton.dataset.mode === 'fp8') {
                    const typeDropdownConfigs = appConfig.dropdowns.filter(d => d.label === 'Type');
                    const newValue = clickedButton.classList.contains('active') ? 'fp8_e4m3fn' : 'default';

                    typeDropdownConfigs.forEach(typeDropdownConfig => {
                        if (typeDropdownConfig && typeDropdownConfig.nodePath) {
                            const typeInput = document.querySelector(`#${typeDropdownConfig.id} input[type="text"]`);
                            if (typeInput) {
                                typeInput.value = newValue;
                                typeInput.title = newValue;
                                updateWorkflow(workflow, typeDropdownConfig.nodePath, newValue);
                            } else {
                                console.warn(`Could not find the <input> element for the Type widget (ID: ${typeDropdownConfig.id}). UI might not update.`);
                            }
                        } else {
                            console.warn(`Could not find config or nodePath for a Type widget with id: ${typeDropdownConfig ? typeDropdownConfig.id : 'undefined'}`);
                        }
                    });
                }
            }
    
            const activeButtons = modeSelectorContainer.querySelectorAll('.mode-button.active');
            const modes = Array.from(activeButtons).map(btn => btn.dataset.mode);
            console.log('Active modes:', modes);
        });

        const customButton = modeSelectorContainer.querySelector('[data-mode="custom"]');
        if (hdButton && !hdButton.disabled) {
            hdButton.click();
        } else if (turboButton && !turboButton.disabled) {
            turboButton.click();
        } else if (customButton) {
            customButton.click();
        }
    }

    const loraWorkflowManager = new LoraWorkflowManager(workflow, appConfig);

    workflow = loraWorkflowManager.getWorkflow();
    
    processWorkflowNodes(workflow).then(({ nodeToCustomNodeMap, uniqueCustomNodesArray, missingNodes, missingCustomPackages }) => {
        //console.log("Node to Custom Node Mapping:", nodeToCustomNodeMap);
        //console.log("Unique Custom Nodes:", uniqueCustomNodesArray);
        //console.log("Missing Nodes:", missingNodes);
        //console.log("Missing Custom Packages:", missingCustomPackages);
        checkAndShowMissingPackagesDialog(missingCustomPackages, missingNodes, appConfig);
    });

    if (appConfig.dropdowns) {
        appConfig.dropdowns.forEach(config => {
            const instance = new Dropdown(config, workflow);
            widgetInstances[config.id] = instance;
        });
    }

    if (appConfig.steppers) {
        appConfig.steppers.forEach(config => {
            const instance = new Stepper(config, workflow);
            widgetInstances[config.id] = instance;
        });
    }

    if (appConfig.dimensionSelectors) {
        appConfig.dimensionSelectors.forEach(config => {
            if (appConfig.tags && appConfig.tags.base_models) {
                const baseModels = appConfig.tags.base_models;
                if (baseModels.includes('FLUX-2')) {
                    config.modelType = 'FLUX-2';
                } else if (baseModels.includes('FLUX')) {
                    config.modelType = 'FLUX';
                } else if (baseModels.includes('WAN 2.2')) {
                    config.modelType = 'WAN 2.2';
                } else if (baseModels.includes('WAN')) {
                    config.modelType = 'WAN';
                } else if (baseModels.includes('QWEN')) {
                    config.modelType = 'QWEN';
                } else if (baseModels.includes('LTX-2')) {
                    config.modelType = 'LTX-2';
                } else if (baseModels.includes('Z-image')) {
                    config.modelType = 'Z-image';
                } else if (baseModels.includes('SDXL')) {
                    config.modelType = 'SDXL';
                } else if (baseModels.includes('SD1.5')) {
                    config.modelType = 'SDXL';
                }
            }
            const instance = new DimensionSelector(config, workflow);
            widgetInstances[config.id] = instance;
        });
    }

    if (appConfig.inputs) {
        appConfig.inputs.forEach(config => {
            const instance = new InputComponent(config, workflow);
            widgetInstances[config.id] = instance;
        });
    }

    if (appConfig.toggles) {
        appConfig.toggles.forEach(config => {
            const instance = new ToggleComponent(config, workflow);
            widgetInstances[config.id] = instance;
        });
    }

    if (appConfig.seeders) {
        appConfig.seeders.forEach(config => {
            const seeder = new Seeder(config, workflow);
            seeders.push(seeder);
            widgetInstances[config.id] = seeder;
        });
    }

    if (appConfig.multiComponents && Array.isArray(appConfig.multiComponents)) {
        appConfig.multiComponents.forEach(config => {
            const instance = new MultiComponent(config, workflow);
            widgetInstances[config.id] = instance;
        });
    }

    if (appConfig.dataComponents && Array.isArray(appConfig.dataComponents)) {
        appConfig.dataComponents.forEach(config => {
            const instance = new DataComponent(config, workflow);
            widgetInstances[config.id] = instance;
        });
    }


    imageLoaderComp(appConfig, workflow);
    
    // Now that all widgets are created and instances stored, setup the mode selector
    await setupModeSelector();

    const initCanvas = async () => {
        canvasLoader = new CanvasLoader('imageCanvas', appConfig);
        await canvasLoader.initPromise;
    
        if (canvasLoader.isInitialized) {
            //console.log("Canvas initialized successfully.");

            const container = document.getElementById('pluginUIContainer');
            const quickControls = document.getElementById('quick-controls');
            container.append(quickControls);

        } else {
            //console.log("Canvas was not initialized due to missing appConfig fields.");
        }
    };
    
    initCanvas();


    async function queue() {   
        //console.log("Queueing new job");
        messageHandler.updateNodeMap(workflow);

        if (canvasLoader && canvasLoader.isInitialized) {
            await CanvasComponent(appConfig, workflow, canvasLoader);
        } else {
            console.log("Canvas is not initialized. Skipping CanvasComponent.");
        }

        //console.log("Queueing workflow:", workflow);        

        if (appConfig.prompts) {
            appConfig.prompts.forEach(pathConfig => {
                const { id } = pathConfig;
                const element = document.getElementById(id);
                if (element) {
                    const value = element.value.replace(/(\r\n|\n|\r)/gm, " ");
                    updateWorkflowValue(workflow, id, value, appConfig);
                } else {
                    console.warn(`Element not found for ID: ${id}`);
                }
            });
        }

        const jobId = StateManager.incrementJobId();
        const job = { id: jobId, workflow: { ...workflow } };
        StateManager.addJob(job);
        //console.log(`Added job to queue. Job ID: ${jobId}`);
        //console.log("Current queue:", StateManager.getJobQueue());
        //console.log("queued workflow:", workflow);        
        store.dispatch({
            type: 'SET_QUEUE_RUNNING',
            payload: true
        });
        updateQueueDisplay(StateManager.getJobQueue());
        
        if (!StateManager.isProcessing()) {
            setTimeout(processQueue, 0);
        }
    }

    async function processQueue() {
        store.dispatch({
            type: 'TOGGLE_MASK',
            payload: true
        });



        
        if (StateManager.isProcessing()) return;
        
        if (StateManager.getJobQueue().length === 0) {
            return;
        }

        StateManager.setProcessing(true);

        const job = StateManager.getNextJob();
        //console.log(`Processing job ${job.id}`);
        try {
            await queue_prompt(job.workflow);
        } catch (error) {
            console.error(`Error processing job ${job.id}:`, error);
            StateManager.removeJob();
            updateQueueDisplay(StateManager.getJobQueue());
            StateManager.setProcessing(false);
            processQueue();
        }
    }

    async function queue_prompt(prompt = {}) {
        showSpinner();
        seeders.forEach(seeder => seeder.generateSeed());
        const data = { 'prompt': prompt, 'client_id': client_id };
        try {
            const response = await fetch('/prompt', {
                method: 'POST',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                throw new Error('Failed to process prompt.');
            }
            // const result = await response.json();
        } catch (error) {
            console.error('Error processing prompt:', error);
            throw error;
        } finally {
            // hideSpinner();
        }
    }

    function updateQueueDisplay(jobQueue) {
        const queueDisplay = document.getElementById('queue-display');
        if (!queueDisplay) {
            console.warn('queue-display element not found in the DOM.');
            return;
        }
        if (jobQueue.length > 0) {
           queueDisplay.textContent = `${jobQueue.length}`;

         } else {
            queueDisplay.textContent = '';
        }
        
    }

    async function interrupt() {
        await queue_interrupt();
        if (StateManager.isProcessing()) {
            //console.log("Interrupting current job");
        } else if (StateManager.getJobQueue().length > 0) {
            const removedJob = StateManager.getJobQueue().pop();
            //console.log(`Removed job from queue. Job ID: ${removedJob.id}`);
            //console.log("Remaining queue:", StateManager.getJobQueue());
            updateQueueDisplay(StateManager.getJobQueue());
        } else {
            //console.log("No jobs in queue to interrupt.");
        }
    }

    async function queue_interrupt() {
        //console.log("Interrupting last job");
        const data = { 'client_id': client_id };
        try {
            showSpinner();
            const response = await fetch('/interrupt', {
                method: 'POST',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                throw new Error('Failed to interrupt the process.');
            }
            const result = await response.json();
            //console.log('Interrupted:', result);
        } catch (error) {
            console.error('Error during interrupt:', error);
            hideSpinner();
        } finally {
            hideSpinner();
        }
    }



    //Function to handle tab switching logic  

function setupTabSwitching() {
    const tabButtons = document.querySelectorAll('.control-tabs-header .tab-button');
    const tabPanels = document.querySelectorAll('.control-tabs-content .tab-panel');

    //console.log('--- FINAL TEST: Found ' + tabButtons.length + ' buttons and ' + tabPanels.length + ' panels. ---');
    
    if (tabButtons.length === 0 || tabPanels.length === 0) {
        //console.error("FINAL TEST: Tab elements not found.");
        return; 
    }
    
    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetId = this.getAttribute('data-target');
            //console.log(`\n--- FINAL TEST: Clicked ${targetId} ---`);

            // 1. Deactivate all buttons and panels
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabPanels.forEach(panel => {
                panel.classList.remove('active');
            });

            // 2. Activate the clicked button and panel
            this.classList.add('active');
            
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active'); 

                // REPORT THIS VALUE!
                const computedStyle = window.getComputedStyle(targetPanel);
                console.warn(`FINAL TEST: Computed Display Style for ${targetId} is: ${computedStyle.getPropertyValue('display')}`);
                
            } else {
                 console.error(`FINAL TEST: Target Panel ${targetId} not found!`);
            }
        });
    });
}



    document.getElementById('generateButton').addEventListener('click', function () {
        queue();
    });
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            if (event.ctrlKey && event.altKey) {
                interrupt();
                event.preventDefault();
                event.stopPropagation();
            }
            else if (event.ctrlKey) {
                queue();
                event.preventDefault();
                event.stopPropagation();
            }
        }
    });
    document.getElementById('interruptButton').addEventListener('click', function () {
        interrupt();
    });

    setupTabSwitching(); 


    window.addEventListener('jobCompleted', () => {
        StateManager.removeJob();
        updateQueueDisplay(StateManager.getJobQueue());
        StateManager.setProcessing(false);
        processQueue();
    });

    window.addEventListener('jobInterrupted', () => {
        StateManager.removeJob();
        updateQueueDisplay(StateManager.getJobQueue());
        StateManager.setProcessing(false);
        processQueue();
    });

    document.addEventListener('DOMContentLoaded', () => {
        initialize(false, false, false, false);
        // Call the new tab setup function once the DOM is ready
        //setupTabSwitching();

        const overlay = document.getElementById('css-loading-overlay');
        overlay.classList.add('fade-out');
    
        overlay.addEventListener('transitionend', () => {
            overlay.style.display = 'none';
        });
    });
   
})(window, document, undefined);
