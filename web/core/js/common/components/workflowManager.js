/**
 * Resolve a component's `nodePath` against an API workflow.
 *
 * A nodePath is `"<nodeId>.inputs.<inputKey>"` - but `<inputKey>` may itself contain
 * dots. ComfyUI stores a *dynamic combo* widget as ONE flat key: `ResizeImageMaskNode`
 * with `resize_type: "scale by multiplier"` has `"resize_type.multiplier"`, and
 * `DA3Render` has `"output.normalization"`. Splitting the path into exactly three
 * parts would then look for a nested `inputs.resize_type.multiplier`, write a key
 * ComfyUI does not know and silently change nothing, so **everything after the
 * second dot is the input name**.
 */
export function splitNodePath(nodePath) {
    const parts = String(nodePath || '').split('.');
    return [parts[0] || '', parts[1] || '', parts.slice(2).join('.')];
}

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
    const [nodeId, inputsKey, inputName] = splitNodePath(nodePath);
    const node = workflow ? workflow[nodeId] : null;

    if (!node || !node[inputsKey] || !inputName) {
        console.warn(`[SAUS] Skipping "${pathId}": the workflow has no node `
            + `${nodeId} (path "${nodePath}") - the app config and its wf.json disagree.`);
        return;
    }

    node[inputsKey][inputName] = value;
}

export function getValueFromWorkflow(workflow, nodePath) {
    const parts = String(nodePath).split('.');
    let value = workflow;
    let i = 0;

    while (i < parts.length) {
        if (value === null || typeof value !== 'object') return null;
        // The longest run of remaining parts that is a real key wins, so a flat
        // dotted key ("resize_type.multiplier") is found before its prefix.
        let end = i + 1;
        for (let candidate = parts.length; candidate > i; candidate--) {
            if (Object.prototype.hasOwnProperty.call(value, parts.slice(i, candidate).join('.'))) {
                end = candidate;
                break;
            }
        }
        const key = parts.slice(i, end).join('.');
        if (!Object.prototype.hasOwnProperty.call(value, key)) return null;
        value = value[key];
        i = end;
    }
    return value;
}

export function updateWorkflow(workflow, path, value) {
    const [nodeId, inputsKey, inputName] = splitNodePath(path);
    const node = workflow ? workflow[nodeId] : null;

    // Same guard as updateWorkflowValue(): a stale nodePath must not conjure a
    // nested object the graph never had - ComfyUI would reject it at queue time.
    if (!node || !node[inputsKey] || !inputName) {
        console.warn(`[SAUS] Skipping write to "${path}": the workflow has no input `
            + `${nodeId}.${inputsKey}.${inputName} - the app config and its wf.json disagree.`);
        return;
    }

    node[inputsKey][inputName] = value;
}