class WorkflowNodeEraser {
    constructor(workflow) {
        if (typeof workflow !== 'object' || workflow === null || Array.isArray(workflow)) {
            throw new TypeError('Workflow must be a non-null object');
        }
        this.workflow = workflow;
    }

    removeLora(loraNodeId) {
        const nodeIdStr = loraNodeId.toString();
        const loraNode = this.workflow[nodeIdStr];

        if (!loraNode) {
            throw new Error(`Node with ID ${loraNodeId} does not exist.`);
        }

        if (!loraNode.inputs || !loraNode.inputs.model) {
             console.warn(`Node ${loraNodeId} does not have a model input. Deleting without reconnecting.`);
             delete this.workflow[nodeIdStr];
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

export default WorkflowNodeEraser;