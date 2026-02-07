import DropdownStepper from './widgets/DropdownStepper.js';

class LoraWorkflowManager {

    constructor(workflow, appConfig) {
        if (typeof workflow !== 'object' || workflow === null || Array.isArray(workflow)) {
            throw new TypeError('Workflow must be a non-null object');
        }
        this.workflow = JSON.parse(JSON.stringify(workflow));
        this.existingIds = new Set(Object.keys(this.workflow).map(id => parseInt(id, 10)));
        this.highestId = this._getHighestNodeId();

        this.appConfig = appConfig;
        this.container = document.getElementById('side-workflow-controls');
        this.addButton = null;
        this.initializeUI();
    }

    initializeUI() {
        const modelLoaders = this._findModelLoaders();

        if (modelLoaders.length > 1) {
            modelLoaders.forEach(loader => {
                const loaderWrapper = document.createElement('div');
                loaderWrapper.style.display = 'flex';
                loaderWrapper.style.flexDirection = 'column';
                loaderWrapper.style.marginBottom = '10px';
                this.container.appendChild(loaderWrapper);

                const btn = document.createElement('button');

                const updateButtonLabel = () => {
                    let modelName = '';
                    if (loader.inputs) {
                        // Heuristic to find the model name from the loader's inputs.
                        // It looks for an input property ending with '_name'.
                        const modelInputKey = Object.keys(loader.inputs).find(key => key.endsWith('_name'));
                        if (modelInputKey && typeof loader.inputs[modelInputKey] === 'string') {
                            let fullPath = loader.inputs[modelInputKey];
                            // Extract just the filename from a potential full path.
                            modelName = fullPath.split('/').pop().split('\\').pop();
                        }
                    }

                    // Construct a descriptive label.
                    // If a model name was found, use it. Otherwise, use the node's ID for uniqueness.
                    const label = modelName || `Model #${loader.id}`;
                    btn.innerHTML = `+LoRA<br><span style="font-size: 0.85em; opacity: 0.8;">${label}</span>`;
                };

                updateButtonLabel();

                window.addEventListener('workflowValueUpdate', (e) => {
                    if (e.detail.path.startsWith(`${loader.id}.`)) {
                        updateButtonLabel();
                    }
                });

                btn.classList.add('add-lora-button');
                btn.style.marginBottom = '5px';
                loaderWrapper.appendChild(btn);
                btn.addEventListener('click', () => this.handleAddLora(loader, loaderWrapper));
            });
        } else {
            const loaderWrapper = document.createElement('div');
            loaderWrapper.style.display = 'flex';
            loaderWrapper.style.flexDirection = 'column';
            loaderWrapper.style.marginBottom = '10px';
            this.container.appendChild(loaderWrapper);

            this.addButton = document.createElement('button');
            this.addButton.textContent = '+LoRA';
            this.addButton.classList.add('add-lora-button');
            this.addButton.style.marginBottom = '5px';
            loaderWrapper.appendChild(this.addButton);
            this.addButton.addEventListener('click', () => this.handleAddLora(modelLoaders[0], loaderWrapper));
        }
    }

    handleAddLora(targetModelLoader, targetContainer) {
        try {
            if (!targetModelLoader) {
                const modelLoaders = this._findModelLoaders();
                if (modelLoaders.length === 0) {
                    throw new Error('No model loader found in the workflow to attach LoRA.');
                }
                targetModelLoader = modelLoaders[0];
            }

            const newNodeId = this.addLora(targetModelLoader.id);
            const updatedWorkflow = this.getWorkflow();

            const dynamicConfig = this.createDynamicConfig(newNodeId);
            const loraContainer = document.createElement('div');
            loraContainer.id = dynamicConfig.id;
            loraContainer.classList.add('dropdown-stepper-container');
            loraContainer.style.position = 'relative';
            
            const controlsHeader = document.createElement('div');
            controlsHeader.style.position = 'absolute';
            controlsHeader.style.top = '0';
            controlsHeader.style.right = '0';
            controlsHeader.style.zIndex = '100';

            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Remove LoRA';
            deleteBtn.style.background = '#000000';
            deleteBtn.style.border = '1px solid #ff4444';
            deleteBtn.style.color = '#ff4444';
            deleteBtn.style.cursor = 'pointer';
            deleteBtn.style.fontSize = '16px';
            deleteBtn.style.fontWeight = 'bold';
            deleteBtn.style.padding = '0';
            deleteBtn.style.borderRadius = '50%';
            deleteBtn.style.width = '22px';
            deleteBtn.style.height = '22px';
            deleteBtn.style.display = 'flex';
            deleteBtn.style.alignItems = 'center';
            deleteBtn.style.justifyContent = 'center';
            deleteBtn.style.margin = '4px';
            deleteBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
            
            deleteBtn.addEventListener('click', () => this.handleRemoveLora(newNodeId, loraContainer));
            
            controlsHeader.appendChild(deleteBtn);
            loraContainer.appendChild(controlsHeader);
            if (targetContainer) {
                targetContainer.appendChild(loraContainer);
            } else {
                this.container.appendChild(loraContainer);
            }
            new DropdownStepper(dynamicConfig, updatedWorkflow);

            // console.log(`LoRA node ${newNodeId} added successfully to model loader ${targetModelLoader.id}.`);
        } catch (error) {
            console.error('Error adding LoRA:', error);
            alert(`Failed to add LoRA: ${error.message}`);
        }
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

            firstConnectedNodes.forEach(node => {
                node.inputs.model = [newLoraId.toString(), 0];
            });

            loraNode.inputs.model = [modelLoaderId.toString(), 0];
        } else {
            const lastLora = this._getLastLoraNode(existingLoras);
            const firstConnectedNodes = this._findConnectedNodes(lastLora.id);
            if (firstConnectedNodes.length === 0) {
                throw new Error(`No nodes are directly connected to the last LoRA node ID ${lastLora.id}.`);
            }

            firstConnectedNodes.forEach(node => {
                node.inputs.model = [newLoraId.toString(), 0];
            });

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
            .map(([id, node]) => ({ id: parseInt(id, 10), ...node }))
            .filter(lora => {
                const modelInput = lora.inputs.model;
                return Array.isArray(modelInput) && parseInt(modelInput[0], 10) === modelLoaderId;
            });
    }

    _findModelLoaders() {
        return Object.entries(this.workflow)
            .filter(([_, node]) => {
                const hasModelInput = node.inputs && node.inputs.model !== undefined;
                return !hasModelInput && this._isModelLoader(node.class_type);
            })
            .map(([id, node]) => ({ id: parseInt(id, 10), ...node }));
    }

    _isModelLoader(classType) {
        const modelLoaderTypes = ["UNETLoader","CheckpointLoaderSimple","DownloadAndLoadMochiModel","UnetLoaderGGUF"];
        return modelLoaderTypes.includes(classType);
    }

    _findConnectedNodes(nodeId) {
        return Object.entries(this.workflow)
            .filter(([_, node]) => {
                if (!node.inputs || !node.inputs.model) return false;
                const modelInput = node.inputs.model;
                return Array.isArray(modelInput) && parseInt(modelInput[0], 10) === nodeId;
            })
            .map(([id, node]) => ({ id: parseInt(id, 10), ...node }));
    }

    _getLastLoraNode(loraNodes) {
        return loraNodes.reduce((prev, current) => {
            return (prev.id > current.id) ? prev : current;
        }, loraNodes[0]);
    }

    _getNextNodeId() {
        return this.highestId + 1;
    }

    _getHighestNodeId() {
        return this.existingIds.size > 0 ? Math.max(...this.existingIds) : 0;
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
                 this.existingIds.delete(parseInt(loraNodeId, 10));
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
            this.existingIds.delete(parseInt(loraNodeId, 10));
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
