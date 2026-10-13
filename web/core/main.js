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
import AspectRatioSelector from './js/common/components/widgets/AspectRatioSelector.js';
import Dropdown from './js/common/components/widgets/Dropdown.js';
import imageLoaderComp from './js/common/components/widgets/imageLoaderComp.js';
import { uuidv4, showSpinner, hideSpinner } from './js/common/components/utils.js';
import { initializeWebSocket, messageHandler } from './js/common/components/messageHandler.js';
import { updateWorkflowValue, updateWorkflow } from './js/common/components/workflowManager.js';
import { fetchWorkflow } from './js/common/scripts/fetchWorkflow.js'; 
import { fetchappConfig } from './js/common/scripts/fetchappConfig.js'; 
import { setFaviconStatus } from './js/common/scripts/favicon.js'; 
import { initialize } from './js/common/scripts/interactiveUI.js';
import injectStylesheet from './js/common/scripts/injectStylesheet.js';
import LoraWorkflowManager from './js/common/components/LoraWorkflowManager.js';
import { CanvasLoader } from './js/common/components/canvas/CanvasLoader.js';
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

    // Optional per-app output selection: only display media produced by these nodes.
    if (appConfig.outputs && Array.isArray(appConfig.outputs)) {
        messageHandler.setOutputNodes(appConfig.outputs.map(output => output.nodeId).filter(Boolean));
    }

    // Defensive: a failing/non-JSON endpoint must not abort the whole app.
    const safeJson = (url, fallback) =>
        fetch(url).then(res => (res.ok ? res.json() : fallback)).catch((err) => {
            console.warn('[SAUS] could not load', url, err);
            return fallback;
        });
    const architectures = await safeJson('/saus/api/architectures', {});
    const modelsData = await safeJson('/saus/api/data-model-info', {});
    // Filename-keyed registry (used to apply the new architecture "models"/"variants").
    const modelsRegistry = await safeJson('/saus/api/models', {});

    // Architecture now comes from the app's own metadata (no app_list.json).
    const architectureName = (appConfig.metadata && appConfig.metadata.architecture) || null;
    
    let workflow = await fetchWorkflow(appName);
    let canvasLoader;

    // Set once the whole interface is built: the SAUS app browser waits for it
    // before exporting this app's graph to ComfyUI (see window.SAUS below).
    let uiReady = false;
    // The mode / variant the user picked. Only used to name the exported file.
    let activeMode = null;
    
    const widgetInstances = {}; // To store all widget instances

    const seeders = [];
    initializeWebSocket(client_id);
    setFaviconStatus.Default();
    injectStylesheet('/core/css/main.css', 'main');
    injectStylesheet('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css', 'font-awesome');
    

    //console.log("appConfig", appConfig);
    //console.log("workflow", workflow);


    // ----------------------------------------------------------------------
    // Layout/style support: an appConfig component may carry an optional
    //   "layout": { "region": "basic" | "advanced", "order": <number> }
    //   "style":  { "<css-property>": "<value>" }
    // block. When absent, the legacy label-based placement and DOM order are
    // used unchanged, so existing apps are unaffected.
    function applyWidgetLayoutStyle(element, itemConfig) {
        const style = itemConfig && itemConfig.style;
        if (style && typeof style === 'object') {
            Object.entries(style).forEach(([prop, value]) => {
                if (value === null || value === undefined || value === '') return;
                const cssProp = prop.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
                try {
                    element.style.setProperty(cssProp, String(value));
                } catch (err) {
                    console.warn('Invalid style property in appConfig:', prop, value);
                }
            });
        }

        const layout = itemConfig && itemConfig.layout;
        if (layout && layout.order !== undefined && layout.order !== null) {
            element.dataset.layoutOrder = String(layout.order);
        }
    }

    function sortContainerByLayoutOrder(container) {
        if (!container) return;
        const children = Array.from(container.children);
        if (!children.some(child => child.dataset.layoutOrder !== undefined)) return;

        children
            .map((el, index) => ({
                el,
                index,
                order: el.dataset.layoutOrder !== undefined ? Number(el.dataset.layoutOrder) : index
            }))
            .sort((a, b) => (a.order - b.order) || (a.index - b.index))
            .forEach(({ el }) => container.appendChild(el));
    }

    function generateWorkflowControls(config) {
        // Get the new destination containers
        const basicContainer = document.getElementById('basic-controls-container');
        const advancedContainer = document.getElementById('advanced-controls-container');

        // Helper to determine the container (an explicit layout.region wins)
        function getContainer(itemConfig) {
            const region = itemConfig.layout && itemConfig.layout.region;
            if (region === 'basic') {
                return basicContainer;
            }
            if (region === 'advanced') {
                return advancedContainer;
            }
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
            applyWidgetLayoutStyle(div, itemConfig);
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

        if (config.aspectRatioSelectors) {
            config.aspectRatioSelectors.forEach(selector => {
                appendControl(selector, 'aspect-ratio-selector-container');
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

        sortContainerByLayoutOrder(basicContainer);
        sortContainerByLayoutOrder(advancedContainer);
    }

function setPromptComponents(config, options = { clearInputs: false }) {
    if (!config.prompts || !Array.isArray(config.prompts)) {
        return;
    }
    const promptsContainer = document.getElementById('prompts');

    config.prompts.forEach((input, index) => {
        const container = document.createElement('div');
        container.className = 'prompt-container';
        applyWidgetLayoutStyle(container, input); 

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

    sortContainerByLayoutOrder(promptsContainer);
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
        const customButton = modeSelectorContainer.querySelector('[data-mode="custom"]');

        // Collect the installed model options from every *loader* dropdown the
        // app exposes. Labels are free-form ("Unet Name", "Model", ...), so we
        // match on the loader node type instead of the label.
        const LOADER_TYPES = new Set([
            'CheckpointLoaderSimple', 'CheckpointLoader', 'unCLIPCheckpointLoader', 'ImageOnlyCheckpointLoader',
            'UNETLoader', 'UnetLoaderGGUF', 'UnetLoaderGGUFAdvanced',
            'VAELoader', 'CLIPLoader', 'DualCLIPLoader', 'TripleCLIPLoader', 'QuadrupleCLIPLoader',
            'CLIPVisionLoader', 'LoraLoader', 'LoraLoaderModelOnly',
            'ControlNetLoader', 'DiffControlNetLoader', 'StyleModelLoader',
            'UpscaleModelLoader', 'LatentUpscaleModelLoader'
        ]);
        let availableModels = [];
        const loaderOptions = {};   // cfg.id -> the loader's own valid values
        const loaderConfigs = (appConfig.dropdowns || []).filter(d => d.url && d.key && LOADER_TYPES.has(d.url));
        await Promise.all(loaderConfigs.map(async (cfg) => {
            try {
                const res = await fetch(`${window.location.origin}/object_info/${cfg.url}`);
                const data = await res.json();
                const info = data[Object.keys(data)[0]];
                const spec = info && info.input && (info.input.required?.[cfg.key] || info.input.optional?.[cfg.key]);
                const opts = (spec && Array.isArray(spec[0]) ? spec[0] : []).filter(o => typeof o === 'string');
                loaderOptions[cfg.id] = opts;
                for (const o of opts) availableModels.push(o);
            } catch (error) {
                console.error("Could not fetch available models list:", error);
            }
        }));

        // Variants can attach LoRAs even when the app itself has no LoRA dropdown
        // (the "+Lora" button adds a LoraLoaderModelOnly node on the fly), so the
        // LoRA list must be part of the installed/missing check too.
        const loraOptions = [];
        for (const loraType of ['LoraLoaderModelOnly', 'LoraLoader']) {
            try {
                const res = await fetch(`${window.location.origin}/object_info/${loraType}`);
                const data = await res.json();
                const info = data[Object.keys(data)[0]];
                const spec = info && info.input && info.input.required && info.input.required.lora_name;
                const opts = (spec && Array.isArray(spec[0]) ? spec[0] : []).filter(o => typeof o === 'string');
                if (opts.length) {
                    loraOptions.push(...opts);
                    break;
                }
            } catch (error) {
                // Node type not installed: try the next one.
            }
        }
        loaderOptions['__lora__'] = loraOptions;
        for (const o of loraOptions) availableModels.push(o);

        const arch = (architectureName && architectures[architectureName]) || null;

        // A file counts as installed when a loader option is it (or ends with it).
        const fileInstalled = (fn) => {
            const name = String(fn || '');
            if (!name) return false;
            return availableModels.some((opt) => opt === name || opt.endsWith('/' + name));
        };
        const modelFiles = (group) => (group.files || []).map(f => (typeof f === 'string' ? f : f.file)).filter(Boolean);
        // A model group is satisfied per its cardinality ("all" | "one" | "none").
        const checkModelGroup = (group) => {
            const files = modelFiles(group);
            if (group.need === 'one') return files.some(fileInstalled);
            if (group.need === 'none') return true;
            return files.every(fileInstalled);
        };

        // Legacy check (identifier-based settings.model).
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

        const setButton = (btn, label, enabled, title) => {
            if (!btn) return;
            if (label) btn.textContent = label;
            btn.disabled = !enabled;
            btn.classList.toggle('disabled-saus', !enabled);
            // Use the CSS tooltip (data-tip) instead of the native one so the
            // sticky "Basic / Advanced Controls" header cannot cover it.
            if (!enabled && title) {
                btn.dataset.tip = title;
                btn.setAttribute('aria-label', title);
            } else {
                delete btn.dataset.tip;
            }
            btn.removeAttribute('title');
        };

        const staticButtons = {
            hd: modeSelectorContainer.querySelector('[data-mode="hd"]'),
            turbo: modeSelectorContainer.querySelector('[data-mode="turbo"]')
        };
        const variantButtons = [];

        if (arch && arch.variants && Object.keys(arch.variants).length) {
            // One button per named variant; drop the static HD/Turbo buttons.
            Object.values(staticButtons).forEach((b) => b && b.remove());
            // Insert into the same group as the Custom button (it is not a
            // direct child of the container, so insertBefore on the container
            // would throw).
            const variantHost = customButton ? customButton.parentNode : modeSelectorContainer;
            Object.entries(arch.variants).forEach(([id, variant]) => {
                const btn = document.createElement('button');
                btn.className = 'mode-button exclusive-mode';
                btn.dataset.mode = 'variant';
                btn.dataset.variant = id;
                btn.textContent = variant.label || id;
                // A variant is usable only when every model *it* selects is
                // installed; otherwise grey it out with a tooltip.
                const missing = [];
                const optionalMissing = [];
                (arch.models || []).forEach((group) => {
                    const files = modelFiles(group);
                    let file = (variant.pick || {})[group.id];
                    if (!file && group.need === 'all' && files.length) file = files[0];
                    if (file && !fileInstalled(file)) {
                        // A "none" group (typically a LoRA) is optional: it is reported
                        // in the tooltip but must never stop the variant being selectable.
                        if ((group.need || 'all') === 'none') optionalMissing.push(file);
                        else missing.push(file);
                    }
                });
                if (missing.length) {
                    btn.classList.add('disabled-saus');
                    const tip = 'Missing models: ' + missing.slice(0, 3).join(', ')
                        + (missing.length > 3 ? ` (+${missing.length - 3} more)` : '');
                    btn.dataset.tip = tip;
                    btn.setAttribute('aria-label', tip);
                } else if (optionalMissing.length) {
                    // Selectable, but tell the user what is missing.
                    btn.dataset.tip = 'Optional models not installed: ' + optionalMissing.slice(0, 3).join(', ')
                        + (optionalMissing.length > 3 ? ` (+${optionalMissing.length - 3} more)` : '');
                }
                variantHost.insertBefore(btn, customButton);
                variantButtons.push(btn);
            });
        } else if (arch) {
            // No named variants: the architecture's base settings *are* the
            // default, so the app simply runs as HD. Turbo only exists as a
            // choice when the architecture defines turbo_settings; otherwise its
            // button goes away instead of sitting there greyed out.
            setButton(staticButtons.hd, arch.base_settings ? arch.base_settings.name : 'HD',
                !arch.base_settings || checkModels(arch.base_settings),
                'Required models for this mode are not installed.');
            if (arch.turbo_settings) {
                setButton(staticButtons.turbo, arch.turbo_settings.name || 'Turbo',
                    checkModels(arch.turbo_settings),
                    'Required models for this mode are not installed.');
            } else {
                staticButtons.turbo?.remove();
                staticButtons.turbo = null;
            }
        } else {
            // No architecture block at all: still a runnable app, and HD is what
            // it runs as. There is nothing to offer as an alternative (Custom
            // stays, so the parameters are always reachable).
            setButton(staticButtons.hd, 'HD', true);
            staticButtons.turbo?.remove();
            staticButtons.turbo = null;
        }
    
        if (!modeSelectorContainer) {
            console.warn("Mode selector container not found.");
            return;
        }
    
        modeSelectorContainer.addEventListener('click', async (event) => {
            const clickedButton = event.target.closest('.mode-button');
            if (!clickedButton || clickedButton.disabled || clickedButton.classList.contains('disabled-saus')) {
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

                // Remember the choice: the SAUS app browser names the workflow it
                // exports to ComfyUI (the share button of the app tabs) after it.
                activeMode = {
                    mode,
                    variant: clickedButton.dataset.variant || null,
                    label: (clickedButton.textContent || mode).trim(),
                };

                const modelWidgetConfigs = appConfig.dropdowns.filter(d =>
                    d.label.startsWith('Model') || d.label === 'Checkpoint' || LOADER_TYPES.has(d.url));
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
                    // New schema: a mode ("hd"/"turbo") maps to the 1st/2nd variant.
                    // Models are placed by group -> node; settings/LoRAs reuse the
                    // legacy shape below (model:[] so the positional loop is skipped).
                    let settings = null;
                    if (mode === 'variant' && arch.variants) {
                        const variant = arch.variants[clickedButton.dataset.variant];
                        if (variant) {
                            const idByFile = {};
                            Object.entries(modelsData || {}).forEach(([id, entry]) => {
                                if (entry && entry.id) idByFile[entry.id] = id;
                            });
                            // A variant can name its LoRAs either in the model group it
                            // picks from ("pick") or in its own list ("loras"): collect
                            // the file names from both.
                            const pickedLoras = [];
                            (arch.models || []).forEach((group) => {
                                const files = (group.files || []).map(f => (typeof f === 'string' ? f : f.file)).filter(Boolean);
                                let file = (variant.pick || {})[group.id];
                                if (file && !fileInstalled(file)) file = files.find(fileInstalled) || file;
                                if (!file && group.need === 'all' && files.length) file = files[0];
                                // LoRA groups are applied through the "+Lora" button (there
                                // is usually no lora dropdown), so remember the file here.
                                if (file && /lora/i.test(String((group.node || {}).nodeType || ''))) {
                                    pickedLoras.push(file);
                                }
                                if (!file || !group.node || !group.node.nodeType) return;
                                const cfg = appConfig.dropdowns.find(d => d.url === group.node.nodeType && d.key === group.node.input);
                                if (!cfg || !cfg.nodePath) return;
                                // Use the loader's OWN valid option for this file (the
                                // registry "directory" includes the model-type root,
                                // which the loader must NOT get).
                                const opts = loaderOptions[cfg.id] || [];
                                let value = opts.find((o) => o === file) || opts.find((o) => o.endsWith('/' + file));
                                if (!value) {
                                    const segs = String((modelsRegistry[file] || {}).directory || '').split('/').filter(Boolean);
                                    const sub = segs.length > 1 ? segs.slice(1).join('/') : '';
                                    value = sub ? `${sub}/${file}` : file;
                                }
                                updateWorkflow(workflow, cfg.nodePath, value);
                                const container = document.getElementById(cfg.id);
                                const input = container && container.querySelector('input');
                                if (input) { input.value = file; input.title = value; }
                            });
                            settings = {
                                name: variant.label,
                                model: [],
                                lora: (variant.loras || []).map(f => idByFile[f]).filter(Boolean),
                                loraFiles: [...(variant.loras || []), ...pickedLoras],
                                ...(variant.settings || {})
                            };
                        }
                    } else if (mode === 'hd' && arch.base_settings) {
                        settings = arch.base_settings;
                    } else if (mode === 'turbo' && arch.turbo_settings) {
                        settings = arch.turbo_settings;
                    }

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
                        // A LoRA is attached through the "+Lora" button, which adds (and
                        // chains) a LoraLoaderModelOnly node, so the file name has to be
                        // resolved to one of that loader's own values.
                        const existingLoraWidgets = document.querySelectorAll('#side-workflow-controls .dropdown-stepper-container[id^="LoraLoader_"]');
                        existingLoraWidgets.forEach(widget => {
                            const removeBtn = widget.querySelector('button[title="Remove LoRA"]');
                            if (removeBtn) {
                                removeBtn.click();
                            }
                        });

                        // Entries may be legacy keys ("QWEN_LIGHT_8steps"), registry ids or
                        // plain file names -- resolve them all to a LoRA file name.
                        const loraFiles = [];
                        const addLoraFile = (identifier) => {
                            if (!identifier) return;
                            const legacy = modelsData[identifier];
                            const file = (legacy && legacy.id) ? legacy.id : String(identifier);
                            if (file && !loraFiles.includes(file)) loraFiles.push(file);
                        };
                        (settings.loraFiles || []).forEach(addLoraFile);
                        (settings.lora || []).forEach(addLoraFile);

                        const loraValueFor = (file) => {
                            const opts = loaderOptions['__lora__'] || [];
                            const hit = opts.find((o) => o === file) || opts.find((o) => o.endsWith('/' + file));
                            if (hit) return hit;
                            // Fall back to the registry folder, e.g. "/loras/QWEN/" -> "QWEN/".
                            const segs = String((modelsRegistry[file] || {}).directory || '').split('/').filter(Boolean);
                            const sub = segs.length > 1 ? segs.slice(1).join('/') : '';
                            return sub ? `${sub}/${file}` : file;
                        };

                        if (loraFiles.length > 0) {
                            for (const loraFile of loraFiles) {
                                const loraValue = loraValueFor(loraFile);
                                const added = loraWorkflowManager.addLoraBlock(loraValue);
                                if (!added) continue;

                                // The row's own dropdown reads the value back from the
                                // workflow, so nothing else needs updating here.
                                if (mode !== 'custom') {
                                    added.container.style.display = 'none';
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

        const defaultButton = variantButtons.find((b) => !b.disabled)
            || [staticButtons.hd, staticButtons.turbo].find((b) => b && !b.disabled)
            || customButton;
        if (defaultButton) defaultButton.click();
    }

    const loraWorkflowManager = new LoraWorkflowManager(workflow, appConfig);

    workflow = loraWorkflowManager.getWorkflow();
    
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
            const tags = (appConfig.metadata && appConfig.metadata.tags) || appConfig.tags;
            if (tags && tags.base_models) {
                const baseModels = tags.base_models;
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

    if (appConfig.aspectRatioSelectors) {
        appConfig.aspectRatioSelectors.forEach(config => {
            const instance = new AspectRatioSelector(config, workflow);
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


    /**
     * Copy what the user typed in the prompt boxes into ``target``: the live
     * workflow object, or a copy of it.
     *
     * The prompt boxes are the only controls that are not written into the
     * workflow as you type, so both a Run and the export to ComfyUI (the share
     * button of the SAUS app browser) collect them here.
     */
    function collectPromptValues(target) {
        if (!appConfig.prompts) return;

        appConfig.prompts.forEach(pathConfig => {
            const { id } = pathConfig;
            const element = document.getElementById(id);
            if (element) {
                const value = element.value.replace(/(\r\n|\n|\r)/gm, " ");
                updateWorkflowValue(target, id, value, appConfig);
            } else {
                console.warn(`Element not found for ID: ${id}`);
            }
        });
    }

    async function queue() {   
        //console.log("Queueing new job");
        messageHandler.updateNodeMap(workflow);

        if (canvasLoader && canvasLoader.isInitialized) {
            await CanvasComponent(appConfig, workflow, canvasLoader);
        } else {
            console.log("Canvas is not initialized. Skipping CanvasComponent.");
        }

        //console.log("Queueing workflow:", workflow);        

        collectPromptValues(workflow);

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
           queueDisplay.textContent = `${jobQueue.length} left`;
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



    // The old Basic / Advanced tabs are gone: the Advanced controls now live
    // in a fold below the LoRA list, closed until "Show Advanced" is clicked.
function setupAdvancedToggle() {
    const toggle = document.getElementById('advancedToggle');
    const panel = document.getElementById('advanced-controls-container');
    if (!toggle || !panel) return;

    const label = toggle.querySelector('.advanced-toggle-label');

    const setExpanded = (expanded) => {
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.classList.toggle('expanded', expanded);
        panel.classList.toggle('collapsed', !expanded);
        if (label) label.textContent = expanded ? 'Show less' : 'Show Advanced';
    };

    toggle.addEventListener('click', () => {
        setExpanded(toggle.getAttribute('aria-expanded') !== 'true');
    });

    setExpanded(false);
}



    // "Runs" selector next to Generate: queue the workflow N times.
    const runsInput = document.getElementById('runsInput');
    const getRunCount = () => {
        const n = runsInput ? parseInt(runsInput.value, 10) : 1;
        return Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 1;
    };
    const queueRuns = () => {
        const runs = getRunCount();
        for (let i = 0; i < runs; i++) queue();
    };
    document.getElementById('generateButton').addEventListener('click', function () {
        queueRuns();
    });
    document.addEventListener('keydown', function(event) {
        if (event.key === 'Enter') {
            if (event.ctrlKey && event.altKey) {
                interrupt();
                event.preventDefault();
                event.stopPropagation();
            }
            else if (event.ctrlKey) {
                queueRuns();
                event.preventDefault();
                event.stopPropagation();
            }
        }
    });
    document.getElementById('interruptButton').addEventListener('click', function () {
        interrupt();
    });

    setupAdvancedToggle(); 


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

    /* ---------------------------------------------------------------------- *
     * The heading above the mode buttons: which app this is (same size as the
     * buttons, so it reads as a label) and the (i) that opens what the app
     * needs - the facts the browser's information panel shows.
     * ---------------------------------------------------------------------- */
    function setupAppHeading(config = {}) {
        const headingName = document.getElementById('app-heading-name');
        if (headingName) headingName.textContent = config.name || '';

        const dialog = document.getElementById('app-info-dialog');
        const infoButton = document.getElementById('app-info-btn');
        // <dialog> is everywhere modern browsers run this; without it the
        // heading on its own is still correct.
        if (!dialog || !infoButton || typeof dialog.showModal !== 'function') return;

        // Callable twice (boot + DOMContentLoaded): the name refresh above runs
        // every time, the listeners are only ever attached once.
        if (dialog.dataset.wired === '1') return;
        dialog.dataset.wired = '1';

        const metadata = config.metadata || {};
        const tags = metadata.tags || {};
        const modelFiles = Array.isArray(metadata.models) ? metadata.models : [];

        const fill = () => {
            const name = document.getElementById('app-info-name');
            if (name) name.textContent = config.name || '';

            const description = document.getElementById('app-info-description');
            if (description) {
                const text = config.description || '';
                description.textContent = text;
                description.classList.toggle('hidden', !text);
            }

            const meta = document.getElementById('app-info-meta');
            if (meta) {
                const parts = [];
                if (metadata.architecture) parts.push(metadata.architecture);
                if (metadata.category) parts.push(metadata.category);
                const flatTags = [...(tags.type || []), ...(tags.base_models || []), ...(tags.other || [])];
                if (flatTags.length) parts.push(flatTags.join(', '));
                meta.textContent = parts.join(' · ');
                meta.classList.toggle('hidden', !parts.length);
            }

            const list = document.getElementById('app-info-models');
            const title = document.getElementById('app-info-models-title');
            if (list) {
                list.innerHTML = '';
                modelFiles.forEach((file) => {
                    const item = document.createElement('li');
                    item.textContent = file;
                    list.appendChild(item);
                });
                list.classList.toggle('hidden', !modelFiles.length);
            }
            if (title) title.classList.toggle('hidden', !modelFiles.length);
        };

        infoButton.addEventListener('click', () => {
            fill();
            dialog.showModal();
        });
        dialog.querySelectorAll('[data-app-info-close]').forEach((button) =>
            button.addEventListener('click', () => dialog.close()));
        // A click on the dimmed area (the dialog element itself) closes it too.
        dialog.addEventListener('click', (event) => {
            if (event.target === dialog) dialog.close();
        });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initialize(false, false, false, false, true);
        setupAppHeading(appConfig);
        // Build the "Show Advanced" fold once the DOM is ready.

        const overlay = document.getElementById('css-loading-overlay');
        overlay.classList.add('fade-out');
    
        overlay.addEventListener('transitionend', () => {
            overlay.style.display = 'none';
        });
    });
   
    /* ---------------------------------------------------------------------- *
     * What the SAUS app browser reads when the share button of an app tab
     * exports this workflow to ComfyUI.
     *
     * It has to come from this page: a variant is an overlay applied to the
     * graph at run time (models, settings, LoRAs), so there is no per-variant
     * workflow file to hand over instead.
     * ---------------------------------------------------------------------- */
    window.SAUS = window.SAUS || {};
    window.SAUS.isReady = () => uiReady;
    window.SAUS.getVariant = () => (activeMode ? { ...activeMode } : null);
    window.SAUS.getWorkflow = () => {
        if (!workflow) return null;

        // A copy, so the caller can never touch the state this app runs with.
        const snapshot = JSON.parse(JSON.stringify(workflow));
        collectPromptValues(snapshot);
        return snapshot;
    };

    // Wired here as well as on DOMContentLoaded: by the time this module runs,
    // content.html is already in the page, so the heading is never left empty if
    // the app's scripts happen to load after the document finished parsing
    // (setupAppHeading only attaches its listeners once).
    setupAppHeading(appConfig);

    // Everything an export needs is in place from here on.
    uiReady = true;

})(window, document, undefined);
