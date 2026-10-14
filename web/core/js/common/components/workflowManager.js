export function updateWorkflowValue(workflow, pathId, value, workflowConfig) {
    const pathConfig = workflowConfig.prompts.find(path => path.id === pathId);

    if (!pathConfig) {
        console.warn(`Workflow path not found for ID: ${pathId}`);
        return;
    }

    // A binding can outlive the node it points at (an app config saved against a
    // different workflow, or a graph that pruned the node). Writing blind threw
    // here, which took down the whole Run - and the export to ComfyUI - because of
    // one stale control: say so and carry on instead.
    const { nodePath } = pathConfig;
    const [nodeId, inputsKey, inputName] = String(nodePath).split('.');
    const node = workflow ? workflow[nodeId] : null;

    if (!node || !node[inputsKey]) {
        console.warn(`[SAUS] Skipping "${pathId}": the workflow has no node `
            + `${nodeId} (path "${nodePath}") - the app config and its wf.json disagree.`);
        return;
    }

    node[inputsKey][inputName] = value;
}

export function getValueFromWorkflow(workflow, nodePath) {
    const pathParts = nodePath.split('.');
    let value = workflow;
    for (const part of pathParts) {
        if (value.hasOwnProperty(part)) {
            value = value[part];
        } else {
            return null;
        }
    }
    return value;
}

export function updateWorkflow(workflow, path, value) {
    const pathParts = path.split(".");
    let target = workflow;
    for (let i = 0; i < pathParts.length - 1; i++) {
        if (!target[pathParts[i]]) {
            target[pathParts[i]] = {};
        }
        target = target[pathParts[i]];
    }
    target[pathParts[pathParts.length - 1]] = value;
}