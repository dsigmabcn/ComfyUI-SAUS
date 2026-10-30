import DropdownStepper from './widgets/DropdownStepper.js';
import { updateWorkflow } from './workflowManager.js';

/** Just the file name of a ComfyUI model path ("QWEN/a.safetensors" -> "a.safetensors"). */
const fileName = (fullPath) => String(fullPath).split(/[\\/]/).pop();

// The API graph is a flat map whose keys are strings: a plain node id ("20") or a
// subgraph-expanded one ("18_1" - the builder names an inner node `<outer>_<inner>`,
// see `ui_to_api.py`). Every lookup therefore keys on the raw id; only the "next id"
// high-water mark may be numeric, and there it under-counts ("18_1" -> 18), which can
// only land below the real maximum, never on a key that exists.
const numericId = (id) => parseInt(id, 10) || 0;

class LoraWorkflowManager {

    constructor(workflow, appConfig) {
        if (typeof workflow !== 'object' || workflow === null || Array.isArray(workflow)) {
            throw new TypeError('Workflow must be a non-null object');
        }
        this.workflow = JSON.parse(JSON.stringify(workflow));
        this.existingIds = new Set(Object.keys(this.workflow).map(numericId));
        this.highestId = this._getHighestNodeId();

        this.appConfig = appConfig;
        // The LoRAs render into their own slot so the "Show Advanced" fold can
        // sit below them. The fallback keeps an older content.html working.
        this.container = document.getElementById('lora-slot')
            || document.getElementById('side-workflow-controls');
        this.picker = null;
        this.initializeUI();
    }

    /**
     * One "Add Lora+" button per model loader. Clicking it adds a LoRA block
     * (LoRA label on top, the regular LoRA dropdown, then Strength below).
     */
    initializeUI() {
        const modelLoaders = this._findModelLoaders();
        if (!modelLoaders.length) return;

        const multiple = modelLoaders.length > 1;
        modelLoaders.forEach(loader => {
            const loaderWrapper = document.createElement('div');
            loaderWrapper.className = 'lora-loader-wrapper';

            if (multiple) {
                const caption = document.createElement('span');
                caption.className = 'lora-loader-caption';
                caption.textContent = this._loaderLabel(loader);
                loaderWrapper.appendChild(caption);
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'add-lora-button';
            // An icon plus the plain label reads as one control on one line. The
            // icon is static markup and the label a text node, so nothing here can
            // ever be parsed as code.
            const icon = document.createElement('i');
            icon.className = 'fas fa-layer-group';
            icon.setAttribute('aria-hidden', 'true');
            btn.appendChild(icon);
            btn.appendChild(document.createTextNode('Add Lora'));
            btn.addEventListener('click', () => {
                try {
                    this.addLoraBlock(null, loader, loaderWrapper);
                } catch (error) {
                    console.error('Error adding LoRA:', error);
                    alert(`Failed to add LoRA: ${error.message}`);
                }
            });
            loaderWrapper.appendChild(btn);
            this.container.appendChild(loaderWrapper);
        });
    }

    /**
     * Which loader a LoRA belongs to when there are several (e.g. Wan 2.2
     * high + low noise). The variant flow passes a file name, so match it to the
     * loader whose model shares a noise keyword ("high"/"low"); fall back to the
     * first loader when there is nothing to go on.
     */
    _pickLoaderForLora(file, modelLoaders) {
        if (!file || modelLoaders.length <= 1) return modelLoaders[0];
        const loraName = fileName(file).toLowerCase();
        const keywords = ['high', 'low'].filter((k) => loraName.includes(k));
        if (!keywords.length) return modelLoaders[0];
        const match = modelLoaders.find((loader) => {
            const modelName = this._loaderLabel(loader).toLowerCase();
            return keywords.some((k) => modelName.includes(k));
        });
        return match || modelLoaders[0];
    }

    /** The model a loader holds, used as a caption when there are several. */
    _loaderLabel(loader) {
        if (loader.inputs) {
            const key = Object.keys(loader.inputs).find(k => k.endsWith('_name'));
            if (key && typeof loader.inputs[key] === 'string') {
                return fileName(loader.inputs[key]);
            }
        }
        return `Model #${loader.id}`;
    }

    /**
     * Add a LoRA node. `file` (optional) is written to the new node first, so
     * the block's dropdown shows it (used by the HD/Turbo variant flow).
     */
    addLoraBlock(file = null, targetModelLoader = null, targetContainer = null) {
        if (!targetModelLoader) {
            const modelLoaders = this._findModelLoaders();
            if (modelLoaders.length === 0) {
                throw new Error('No model loader found in the workflow to attach LoRA.');
            }
            targetModelLoader = this._pickLoaderForLora(file, modelLoaders);
        }

        const newNodeId = this.addLora(targetModelLoader.id);
        if (file) {
            updateWorkflow(this.workflow, `${newNodeId}.inputs.lora_name`, file);
        }

        const dynamicConfig = this.createDynamicConfig(newNodeId);
        const loraContainer = this._createLoraBlock(dynamicConfig, targetContainer);
        new DropdownStepper(dynamicConfig, this.workflow);

        return { nodeId: newNodeId, container: loraContainer };
    }

    /** The dropdown and the Strength below, with a remove ✕ in the corner. */
    _createLoraBlock(dynamicConfig, targetContainer) {
        const block = document.createElement('div');
        block.id = dynamicConfig.id;
        block.classList.add('dropdown-stepper-container', 'lora-block');

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'lora-remove-btn';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Remove LoRA';
        deleteBtn.addEventListener('click', () => {
            this.handleRemoveLora(dynamicConfig.id.split('_')[1], block);
        });
        // Absolutely positioned top-right (see .lora-remove-btn in main.css).
        block.appendChild(deleteBtn);

        const parent = targetContainer || this.container;
        parent.appendChild(block);
        return block;
    }

    handleRemoveLora(nodeId, container) {
        try {
            this.removeLora(nodeId);
            
            if (container && container.parentNode) {
                container.parentNode.removeChild(container);
            }
        } catch (error) {
            console.error('Error removing LoRA:', error);
            alert(`Failed to remove LoRA: ${error.message}`);
        }
    }

    createDynamicConfig(nodeId) {
        return {
            id: `LoraLoader_${nodeId}`,
            label: "LoRA",
            dropdown: {
                url: "LoraLoaderModelOnly",
                key: "lora_name",
                nodePath: `${nodeId}.inputs.lora_name`
            },
            steppers: [
                {
                    id: `lorastrength_${nodeId}`,
                    label: "Strength",
                    minValue: 0,
                    maxValue: 2,
                    step: 0.01,
                    defValue: 1,
                    precision: 2,
                    scaleFactor: 1,
                    container: `lorastrength_container_${nodeId}`,
                    nodePath: `${nodeId}.inputs.strength_model`
                }
            ]
        };
    }
    getWorkflow() {
        return this.workflow;
    }

    // --- WorkflowNodeAdder Methods ---

    addLora(modelLoaderId) {
        if (!this.workflow[modelLoaderId]) {
            throw new Error(`Model loader node with ID ${modelLoaderId} does not exist.`);
        }

        const modelLoader = this.workflow[modelLoaderId];
        if (!this._isModelLoader(modelLoader.class_type)) {
            throw new Error(`Node ID ${modelLoaderId} is not a recognized model loader.`);
        }

        const newLoraId = this._getNextNodeId();
        const loraNode = this._createLoraNode(newLoraId);

        const existingLoras = this._findLoraNodes(modelLoaderId);
        if (existingLoras.length === 0) {
            const firstConnectedNodes = this._findConnectedNodes(modelLoaderId);
            if (firstConnectedNodes.length === 0) {
                throw new Error(`No nodes are directly connected to model loader ID ${modelLoaderId}.`);
            }

            this._relinkTo(firstConnectedNodes, newLoraId);

            loraNode.inputs.model = [modelLoaderId.toString(), 0];
        } else {
            const lastLora = this._getLastLoraNode(existingLoras);
            const firstConnectedNodes = this._findConnectedNodes(lastLora.id);
            if (firstConnectedNodes.length === 0) {
                throw new Error(`No nodes are directly connected to the last LoRA node ID ${lastLora.id}.`);
            }

            this._relinkTo(firstConnectedNodes, newLoraId);

            loraNode.inputs.model = [lastLora.id.toString(), 0];
        }

        this.workflow[newLoraId.toString()] = loraNode;
        this.existingIds.add(newLoraId);
        this.highestId = newLoraId;

        return newLoraId;
    }

    _createLoraNode(id) {
        return {
            inputs: {
                lora_name: "lora.safetensors",
                strength_model: 1,
                model: []
            },
            class_type: "LoraLoaderModelOnly",
            _meta: {
                title: "LoraLoaderModelOnly"
            }
        };
    }

    _findLoraNodes(modelLoaderId) {
        return Object.entries(this.workflow)
            .filter(([_, node]) => node.class_type === "LoraLoaderModelOnly")
            .map(([id, node]) => ({ id, ...node }))
            .filter(lora => {
                const modelInput = lora.inputs.model;
                return Array.isArray(modelInput) && String(modelInput[0]) === String(modelLoaderId);
            });
    }

    _findModelLoaders() {
        return Object.entries(this.workflow)
            .filter(([_, node]) => {
                const hasModelInput = node.inputs && node.inputs.model !== undefined;
                return !hasModelInput && this._isModelLoader(node.class_type);
            })
            .map(([id, node]) => ({ id, ...node }));
    }

    _isModelLoader(classType) {
        const modelLoaderTypes = ["UNETLoader","CheckpointLoaderSimple","DownloadAndLoadMochiModel","UnetLoaderGGUF"];
        return modelLoaderTypes.includes(classType);
    }

    /**
     * Every input that reads this node's model output, so both ends of the chain move
     * to the new LoRA. The input is not always called `model`: a graph exported from a
     * template gates a stage behind a `ComfySwitchNode`, whose branches are `on_true`
     * and `on_false` - MOSS sends its loader's model *around* the Skip Layer Guidance
     * node on the branch that skips it (`switch: false` is that app's default), so a
     * LoRA written only to `inputs.model` would reach the sampler on neither path.
     * Slot 0 is the MODEL output of every loader this manager accepts, so an input
     * list that starts with this id and slot 0 is a model reader and nothing else.
     */
    _findConnectedNodes(nodeId) {
        const wanted = String(nodeId);
        return Object.entries(this.workflow)
            .filter(([_, node]) => this._modelInputKeys(node, wanted).length > 0)
            .map(([id, node]) => ({ id, keys: this._modelInputKeys(node, wanted), ...node }));
    }

    /** The input names of `node` that read model output 0 of `nodeId`. */
    _modelInputKeys(node, nodeId) {
        if (!node.inputs) return [];
        return Object.entries(node.inputs)
            .filter(([_, value]) => Array.isArray(value) && value.length >= 2
                && String(value[0]) === String(nodeId) && Number(value[1]) === 0)
            .map(([key]) => key);
    }

    /** Point every model input of these nodes at `newNodeId`'s output 0. */
    _relinkTo(nodes, newNodeId) {
        nodes.forEach(node => {
            node.keys.forEach(key => {
                node.inputs[key] = [newNodeId.toString(), 0];
            });
        });
    }

    /** The most recently added LoRA: the highest id, expanded keys compared by number. */
    _getLastLoraNode(loraNodes) {
        return loraNodes.reduce((prev, current) => {
            const byNumber = numericId(current.id) - numericId(prev.id);
            if (byNumber !== 0) return byNumber > 0 ? current : prev;
            return String(current.id) > String(prev.id) ? current : prev;
        }, loraNodes[0]);
    }

    _getNextNodeId() {
        return this.highestId + 1;
    }

    _getHighestNodeId() {
        // Only the numeric part is comparable; expanded keys sit below their outer
        // node's number, and a fresh id is always one plain number.
        const ids = [...this.existingIds].map(numericId).filter(Number.isFinite);
        return ids.length > 0 ? Math.max(...ids) : 0;
    }

    // --- WorkflowNodeEraser Methods ---

    removeLora(loraNodeId) {
        const nodeIdStr = loraNodeId.toString();
        const loraNode = this.workflow[nodeIdStr];

        if (!loraNode) {
            throw new Error(`Node with ID ${loraNodeId} does not exist.`);
        }

        if (!loraNode.inputs || !loraNode.inputs.model) {
             console.warn(`Node ${loraNodeId} does not have a model input. Deleting without reconnecting.`);
             delete this.workflow[nodeIdStr];
             if (this.existingIds) {
                 this.existingIds.delete(numericId(loraNodeId));
             }
             return;
        }

        const sourceLink = loraNode.inputs.model;
        const sourceId = sourceLink[0];
        const sourceSlot = sourceLink[1];

        const connectedNodes = this._findNodesConnectedToOutput(nodeIdStr);

        connectedNodes.forEach(node => {
            for (const key in node.inputs) {
                const input = node.inputs[key];
                if (Array.isArray(input) && input[0].toString() === nodeIdStr) {
                    node.inputs[key] = [sourceId, sourceSlot];
                }
            }
        });

        delete this.workflow[nodeIdStr];
        if (this.existingIds) {
            this.existingIds.delete(numericId(loraNodeId));
        }
    }

    _findNodesConnectedToOutput(nodeId) {
        const nodeIdStr = nodeId.toString();
        const connectedNodes = [];
        for (const id in this.workflow) {
            const node = this.workflow[id];
            if (node.inputs) {
                for (const key in node.inputs) {
                    const val = node.inputs[key];
                    if (Array.isArray(val) && val[0].toString() === nodeIdStr) {
                        connectedNodes.push(node);
                    }
                }
            }
        }
        return connectedNodes;
    }
}

export default LoraWorkflowManager;
