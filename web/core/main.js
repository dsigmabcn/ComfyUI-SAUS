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
import { groupFile, dropdownForGroup } from './js/common/scripts/architectureModels.js';
import { fetchWorkflow } from './js/common/scripts/fetchWorkflow.js'; 
import { fetchappConfig } from './js/common/scripts/fetchappConfig.js'; 
import { getObjectInfo, objectInfoPath } from './js/common/scripts/objectInfo.js';
import { PreferencesManager } from './js/common/scripts/preferences.js';
import {
    collectValues, fingerprint, load as loadAppState, save as saveAppState, pluckValues,
} from './js/common/scripts/sessionState.js';
import { setFaviconStatus } from './js/common/scripts/favicon.js'; 
import { initialize } from './js/common/scripts/interactiveUI.js';
import injectStylesheet from './js/common/scripts/injectStylesheet.js';
import LoraWorkflowManager from './js/common/components/LoraWorkflowManager.js';
import { getHistoryUrls, restoreHistory } from './js/common/components/imagedisplay.js';
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

    // Defensive: a failing/non-JSON endpoint must not abort the whole app.
    const safeJson = (url, fallback) =>
        fetch(url).then(res => (res.ok ? res.json() : fallback)).catch((err) => {
            console.warn('[SAUS] could not load', url, err);
            return fallback;
        });

    // The app config, its workflow and the two catalogs are independent, so they are
    // asked for *together*: awaiting them one after another cost three extra round
    // trips (and the catalogs are ~86 KB) before a single control could be built.
    const [appConfig, initialWorkflow, architectures, modelsRegistry] = await Promise.all([
        fetchappConfig(appName),
        fetchWorkflow(appName),
        safeJson('/saus/api/architectures', {}),
        // Filename-keyed registry (used to apply the architecture "models"/"variants").
        safeJson('/saus/api/models', {}),
    ]);

    // The LoRA manager re-writes the graph in place further down, so it cannot be const.
    let workflow = initialWorkflow;

    // Optional per-app output selection: only display media produced by these nodes.
    // Set before the websocket is wired, so no early message slips through.
    if (appConfig.outputs && Array.isArray(appConfig.outputs)) {
        messageHandler.setOutputNodes(appConfig.outputs.map(output => output.nodeId).filter(Boolean));
    }

    // Architecture now comes from the app's own metadata (no app_list.json).
    const architectureName = (appConfig.metadata && appConfig.metadata.architecture) || null;

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
    // Font Awesome from /core, not cdnjs: same origin, cached, and it works offline
    // (the vendor copy and its re-vendoring tool are noted on the shell's page).
    injectStylesheet('/core/media/vendor/fontawesome/css/all.min.css', 'font-awesome');
    



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
        // The dropdowns on this page have already asked for most of these classes:
        // the shared cache (scripts/objectInfo.js) makes this a lookup, not a fetch.
        await Promise.all(loaderConfigs.map(async (cfg) => {
            try {
                const info = await getObjectInfo(objectInfoPath(cfg.url));
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
                const info = await getObjectInfo(objectInfoPath(loraType));
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
                    // The same choice the binding makes below (architectureModels.js):
                    // a variant that names an absent model but has an installed
                    // alternative is usable, because that is what it will bind.
                    const file = groupFile(group, variant.pick, fileInstalled);
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
            // No named variants: the app simply runs as HD (Custom stays, so the
            // parameters are always reachable). A turbo mode would be a variant,
            // so there is nothing to offer as an alternative here.
            setButton(staticButtons.hd, 'HD', true);
            staticButtons.turbo?.remove();
            staticButtons.turbo = null;
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

                // HD / Turbo pick the model themselves, so the *quick* model
                // selectors are hidden then. That only concerns the Basic
                // column: a component the app author placed in the Advanced
                // region is "full control" and must stay visible once the fold
                // is opened, whatever the mode is.
                const inBasicRegion = (c) => ((c.layout && c.layout.region) || 'basic') === 'basic';
                const modelWidgetConfigs = appConfig.dropdowns.filter(d =>
                    inBasicRegion(d) && (d.label.startsWith('Model') || d.label === 'Checkpoint' || LOADER_TYPES.has(d.url)));
                const modelWidgetElements = modelWidgetConfigs.map(c => document.getElementById(c.id)).filter(el => el);
                const typeWidgetElements = appConfig.dropdowns
                    .filter(d => d.label === 'Type' && inBasicRegion(d))
                    .map(d => document.getElementById(d.id))
                    .filter(el => el);
                const loraWidgetElement = document.querySelector('.lora-component-container');
                const dynamicLoraWidgets = document.querySelectorAll('#side-workflow-controls .dropdown-stepper-container[id^="LoraLoader_"]');

                // Applied once the architecture is known, further down: HD only takes
                // these controls out of the user's hands when it really does pick the
                // files itself (see where `hdPicksModels` is set).
                const setModelWidgetsVisible = (visible) => {
                    const display = visible ? '' : 'none';
                    modelWidgetElements.forEach(el => el.style.display = display);
                    typeWidgetElements.forEach(el => el.style.display = display);
                    if (loraWidgetElement) loraWidgetElement.style.display = display;
                    dynamicLoraWidgets.forEach(w => w.style.display = display);
                };

                // Reset to the author's layout before deciding, so switching modes twice
                // cannot leave a control hidden.
                setModelWidgetsVisible(true);

                let hdPicksModels = false;
                if (architectureName && architectures[architectureName]) {
                    const arch = architectures[architectureName];
                    // A variant names the model each group takes ("pick") plus its own
                    // settings (steps/cfg); models are placed by group -> node.
                    let settings = null;
                    const hasVariants = Boolean(arch.variants && Object.keys(arch.variants).length);
                    hdPicksModels = hasVariants;
                    const variant = hasVariants && mode === 'variant'
                        ? arch.variants[clickedButton.dataset.variant]
                        : null;
                    // Either a named variant, or - for an architecture with no variants,
                    // which is what the information panel shows as its single "Base" - the
                    // group's own choice. Without this second case such an app never
                    // bound its model at all: it ran whatever the graph happened to hold,
                    // and (because HD hides the model selectors) the user could not even
                    // see which model that was. `custom` never rebinds: the user is
                    // choosing the models there.
                    if (variant || (mode !== 'custom' && !hasVariants)) {
                        // A variant can name its LoRAs either in the model group it
                        // picks from ("pick") or in its own list ("loras"): collect
                        // the file names from both.
                        const pickedLoras = [];
                        // Two groups may share a (node class, input) - a video VAE and an
                        // audio VAE are both VAELoader.vae_name, so the app config holds
                        // two dropdowns that look identical to this lookup. Take them in
                        // declaration order; always taking the first wrote the audio VAE's
                        // file into the video VAE's node.
                        const usedLoaderDropdowns = new Set();
                        (arch.models || []).forEach((group) => {
                            const file = groupFile(group, variant && variant.pick, fileInstalled);
                            if (!file || !group.node || !group.node.nodeType) return;
                            const cfg = dropdownForGroup(group, appConfig.dropdowns, usedLoaderDropdowns);
                            // A LoRA group is normally attached through the "+Lora" button
                            // (there is rarely a lora dropdown). When the graph *does* have
                            // one - because the template wires a LoRA node in - the file
                            // belongs in that dropdown: adding a block as well would apply
                            // the same LoRA twice.
                            if (/lora/i.test(String(group.node.nodeType)) && !cfg) {
                                pickedLoras.push(file);
                                return;
                            }
                            if (cfg && cfg.id) usedLoaderDropdowns.add(cfg.id);
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
                            name: (variant && variant.label) || 'Base',
                            loraFiles: [...((variant && variant.loras) || []), ...pickedLoras],
                            ...((variant && variant.settings) || {})
                        };
                    }

                    if (settings) {
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

                        // LoRAs are named by file name, which is what the registry is keyed by.
                        const loraFiles = [];
                        const addLoraFile = (file) => {
                            if (!file || loraFiles.includes(file)) return;
                            loraFiles.push(file);
                        };
                        (settings.loraFiles || []).forEach(addLoraFile);

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

                        // --- Other settings (CFG, Steps, toggles, ...) ---
                        // A variant may set a stepper (numeric) or a toggle (on/off), matched
                        // on its label. Without the toggle lookup a variant could not turn
                        // "Enable manual sigmas" on for Turbo and off for HD.
                        for (const key in settings) {
                            if (Object.prototype.hasOwnProperty.call(settings, key) && key !== 'model' && key !== 'lora' && key !== 'name') {
                                const wanted = key.toLowerCase();
                                const stepper = appConfig.steppers.find(s => s.label.toLowerCase() === wanted);
                                const widgetConfig = stepper
                                    || (appConfig.toggles || []).find(t => t.label.toLowerCase() === wanted);
                                if (widgetConfig) {
                                    const widgetInstance = widgetInstances[widgetConfig.id];
                                    if (widgetInstance) {
                                        const value = settings[key];
                                        if (value !== null && value !== undefined) {
                                            // Toggles normalise their own value; a stepper needs a number.
                                            widgetInstance.updateValue(stepper ? Number(value) : value);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // HD and Turbo only take the model out of the user's hands when the
            // architecture's variants name the files themselves. An app whose
            // architecture has no variants has no model choice to make: HD binds
            // its implicit Base (above), so hiding the selectors left the user with
            // a model they could neither see nor change - and on the twenty-two apps
            // in that shape the selectors were hidden while nothing was bound at all.
            setModelWidgetsVisible(mode === 'custom' || !hdPicksModels);

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

    const failedControls = [];

    /**
     * Build one kind of control, reporting a failure instead of dying on it.
     *
     * An exception in one of these loops used to abort the whole of `main()`: every
     * control below it - and the mode selector, which is what binds the model - was
     * never built, and the page just looked half-drawn. An app whose drop area was
     * "missing" gave no clue that a control above it had thrown.
     */
    function buildControls(kind, configs, build) {
        (configs || []).forEach((config) => {
            const label = (config && (config.label || config.id)) || kind;
            try {
                build(config);
            } catch (error) {
                failedControls.push(`${kind} "${label}"`);
                console.error(`[SAUS] ${kind} "${label}" failed:`, error);
            }
        });
    }

    /**
     * Name every control the app declares but the page never rendered.
     *
     * A configured control that is simply absent is a silently half-built app: a widget
     * is missing from the panel, nothing was logged, and the only symptom is "there is
     * no drop area". Data components are exempt - they bind a store value to the graph
     * and draw nothing on purpose - and a multi component inserts its own container into
     * `#side-workflow-controls` (which is why one is not created for it up front).
     */
    function reportMissingControls() {
        const wanted = [
            ['dropdown', appConfig.dropdowns], ['stepper', appConfig.steppers],
            ['dimension selector', appConfig.dimensionSelectors],
            ['aspect ratio', appConfig.aspectRatioSelectors],
            ['input', appConfig.inputs], ['toggle', appConfig.toggles],
            ['seeder', appConfig.seeders], ['multi component', appConfig.multiComponents],
        ];
        const missing = [];
        wanted.forEach(([kind, configs]) => {
            (configs || []).forEach((config) => {
                const id = config && config.id;
                if (!id || !document.getElementById(id)) {
                    missing.push(`${kind} "${(config && (config.label || config.id)) || '?'}"`);
                }
            });
        });
        if ((appConfig.imageLoaders || []).length
            && !document.getElementById('load-image-container')) {
            const labels = appConfig.imageLoaders
                .map((config) => config.label || config.id || '?').join(', ');
            missing.push(`input loader "${labels}"`);
        }
        // Both halves of the same story: a control that threw on construction, and one
        // that was built but never appeared. Either way the panel is missing a widget.
        const report = [...failedControls, ...missing];
        if (report.length) {
            console.warn(
                `[SAUS] ${report.length} configured control(s) are not in the panel: ${report.join(', ')}`);
        }
        return report;
    }

    buildControls('dropdown', appConfig.dropdowns, (config) => {
        widgetInstances[config.id] = new Dropdown(config, workflow);
    });

    buildControls('stepper', appConfig.steppers, (config) => {
        widgetInstances[config.id] = new Stepper(config, workflow);
    });

    buildControls('dimension selector', appConfig.dimensionSelectors, (config) => {
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
        widgetInstances[config.id] = new DimensionSelector(config, workflow);
    });

    buildControls('aspect ratio', appConfig.aspectRatioSelectors, (config) => {
        widgetInstances[config.id] = new AspectRatioSelector(config, workflow);
    });

    buildControls('input', appConfig.inputs, (config) => {
        widgetInstances[config.id] = new InputComponent(config, workflow);
    });

    buildControls('toggle', appConfig.toggles, (config) => {
        widgetInstances[config.id] = new ToggleComponent(config, workflow);
    });

    buildControls('seeder', appConfig.seeders, (config) => {
        const seeder = new Seeder(config, workflow);
        seeders.push(seeder);
        widgetInstances[config.id] = seeder;
    });

    buildControls('multi component', appConfig.multiComponents, (config) => {
        widgetInstances[config.id] = new MultiComponent(config, workflow);
    });

    // A data component binds a store value to the graph and renders nothing.
    buildControls('data component', appConfig.dataComponents, (config) => {
        widgetInstances[config.id] = new DataComponent(config, workflow);
    });


    try {
        imageLoaderComp(appConfig, workflow);
    } catch (error) {
        failedControls.push('input loader');
        console.error('[SAUS] input loader failed:', error);
    }

    // Now that all widgets are created and instances stored, setup the mode selector
    await setupModeSelector();

    // Last, because only now can a control be counted as rendered: this is the line that
    // turns "there is no drop area" into a console report naming what never appeared.
    reportMissingControls();

    const initCanvas = async () => {
        canvasLoader = new CanvasLoader('imageCanvas', appConfig);
        await canvasLoader.initPromise;
    
        if (canvasLoader.isInitialized) {

            const container = document.getElementById('pluginUIContainer');
            const quickControls = document.getElementById('quick-controls');
            container.append(quickControls);

        } else {
        }
    };
    
    initCanvas();


    /* ---------------------------------------------------------------------- *
     * This app's memory for the current browser session
     *
     * Closing a tab destroys this page (tabs.js), so a mistaken close used to lose
     * everything: the settings, the prompt, the variant, the LoRAs and the results.
     * The state lives in sessionStorage - the shell's own open tabs do too - scoped
     * to the server run handed over in `?session=`, so a page reload or a re-opened
     * tab gets it back, while a ComfyUI restart is a new session by definition (see
     * scripts/sessionState.js and the `/saus/api/session` route).
     * ---------------------------------------------------------------------- */
    const sessionPrefs = new PreferencesManager({ rememberAppState: true });
    const sessionStamp = new URLSearchParams(window.location.search).get('session') || '';

    // Every component kind an appConfig can declare, for the restore below.
    const widgetConfigs = [];
    ['dropdowns', 'steppers', 'toggles', 'seeders', 'multiComponents',
     'dataComponents', 'dimensionSelectors'].forEach((kind) => {
        (appConfig[kind] || []).forEach((config) => widgetConfigs.push(config));
    });

    /** The LoRA files the user added here: graph nodes the app did not ship with. */
    function addedLoraFiles() {
        const shipped = new Set(Object.keys(initialWorkflow || {}));
        return Object.entries(workflow || {})
            .filter(([nodeId, node]) => !shipped.has(nodeId) && node
                && typeof node.class_type === 'string'
                && node.class_type.startsWith('LoraLoader'))
            .map(([, node]) => (node.inputs || {}).lora_name)
            .filter((name) => typeof name === 'string' && name);
    }

    function captureAppState() {
        // The prompts are the one control not written into the graph as you type.
        collectPromptValues(workflow);
        const prompts = {};
        (appConfig.prompts || []).forEach(({ id }) => {
            const element = document.getElementById(id);
            if (element) prompts[id] = element.value;
        });
        return {
            fingerprint: fingerprint(initialWorkflow),
            values: collectValues(workflow),
            prompts,
            mode: activeMode ? { ...activeMode } : null,
            loras: addedLoraFiles(),
            recent: getHistoryUrls(),
        };
    }

    function rememberAppState() {
        if (sessionPrefs.get('rememberAppState') === false || !sessionStamp) return;
        saveAppState(appName, sessionStamp, captureAppState());
    }

    /** Put back what the user had, skipping whatever this app no longer has. */
    function restoreAppState() {
        if (sessionPrefs.get('rememberAppState') === false) return;
        const remembered = loadAppState(appName, sessionStamp);
        if (!remembered) return;

        if (remembered.fingerprint
            && remembered.fingerprint !== fingerprint(initialWorkflow)) {
            console.info('[SAUS] this app has changed since it was remembered: only the '
                + 'settings it still has are restored');
        }

        // 1. The mode first: choosing it re-applies that variant (its model, settings
        //    and LoRAs), and the saved values are then layered on top of it.
        if (remembered.mode && remembered.mode.mode) {
            const selector = remembered.mode.variant
                ? `[data-mode="variant"][data-variant="${remembered.mode.variant}"]`
                : `[data-mode="${remembered.mode.mode}"]`;
            const button = document.querySelector(`#mode-selector-container ${selector}`);
            if (button && !button.disabled && !button.classList.contains('disabled-saus')) {
                button.click();
            } else {
                console.info('[SAUS] the mode this app was remembered in is not available');
            }
        }

        // 2. The values the user chose: into the graph, and shown by the widget that
        //    owns each one.
        const { apply, dropped } = pluckValues(remembered.values, workflow);
        const byPath = new Map();
        Object.entries(apply).forEach(([nodeId, inputs]) => {
            Object.entries(inputs).forEach(([key, value]) => {
                byPath.set(`${nodeId}.inputs.${key}`, value);
            });
        });
        byPath.forEach((value, path) => {
            updateWorkflow(workflow, path, value);
            const config = widgetConfigs.find((candidate) => candidate.nodePath === path);
            const instance = config ? widgetInstances[config.id] : null;
            if (instance && typeof instance.updateValue === 'function') {
                instance.updateValue(value);
            }
            window.dispatchEvent(new CustomEvent('workflowValueUpdate', {
                detail: { path, value },
            }));
        });
        if (dropped.length) {
            console.info('[SAUS] settings this app no longer has were skipped:', dropped);
        }

        // 3. The LoRAs the user added. The variant's own are already in the graph, so
        //    only the ones missing from it are put back - never twice.
        const inGraph = new Set(addedLoraFiles());
        (remembered.loras || []).forEach((file) => {
            if (inGraph.has(file)) return;
            try {
                loraWorkflowManager.addLoraBlock(file);
            } catch (error) {
                console.warn('[SAUS] could not put back a LoRA:', file, error);
            }
        });

        // 4. The prompt boxes, which then write themselves into the graph exactly the
        //    way they do on Run.
        let promptsRestored = false;
        (appConfig.prompts || []).forEach(({ id }) => {
            const element = document.getElementById(id);
            if (element && remembered.prompts && id in remembered.prompts) {
                element.value = remembered.prompts[id];
                promptsRestored = true;
            }
        });
        if (promptsRestored) collectPromptValues(workflow);

        // 5. The results panel: the thumbnails, and the image that was showing.
        restoreHistory(remembered.recent);
    }

    restoreAppState();

    // One write per quiet moment rather than one per keystroke. Every way of changing a
    // setting raises an event on the page (typing, a pick, a click, a dropped image), so
    // watching for those covers every widget without touching any of them.
    let rememberTimer = null;
    const scheduleRemember = () => {
        clearTimeout(rememberTimer);
        rememberTimer = setTimeout(rememberAppState, 500);
    };
    ['input', 'change', 'click'].forEach((type) =>
        document.addEventListener(type, scheduleRemember, true));

    // Closing or reloading the tab is the moment that matters most: write it out now.
    window.addEventListener('pagehide', () => {
        clearTimeout(rememberTimer);
        rememberAppState();
    });


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
        messageHandler.updateNodeMap(workflow);

        if (canvasLoader && canvasLoader.isInitialized) {
            await CanvasComponent(appConfig, workflow, canvasLoader);
        } else {
            console.log("Canvas is not initialized. Skipping CanvasComponent.");
        }


        collectPromptValues(workflow);

        const jobId = StateManager.incrementJobId();
        const job = { id: jobId, workflow: { ...workflow } };
        StateManager.addJob(job);
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
        } else if (StateManager.getJobQueue().length > 0) {
            const removedJob = StateManager.getJobQueue().pop();
            updateQueueDisplay(StateManager.getJobQueue());
        } else {
        }
    }

    async function queue_interrupt() {
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
    /**
     * Ask the SAUS browser (our parent window) to open its information panel for
     * this app: the shell owns that panel, with every model of the app and the
     * buttons to install them. False when there is no shell to ask, so the app
     * falls back to its own dialog.
     */
    function askParentForAppInfo(url) {
        if (!url || window.parent === window) return false;
        try {
            window.parent.document.dispatchEvent(new CustomEvent('saus:app-info', {
                detail: { url },
            }));
            return true;
        } catch (error) {
            // A cross-origin parent (never the case for SAUS) cannot be reached.
            console.warn('[SAUS] the browser could not be asked for the app info:', error);
            return false;
        }
    }

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
            // Inside the browser (a workspace tab) the rich information panel lives
            // in the shell; on its own, the local dialog is the whole story.
            if (!askParentForAppInfo(config.url)) {
                fill();
                dialog.showModal();
            }
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
