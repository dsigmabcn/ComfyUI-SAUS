/**
 * Headless harness for web/core/js/common/components/workflowManager.js.
 *
 * A component's `nodePath` is `"<nodeId>.inputs.<inputKey>"`, but ComfyUI stores a
 * *dynamic combo* widget as ONE flat key that contains dots - `ResizeImageMaskNode`
 * with `resize_type: "scale by multiplier"` has `"resize_type.multiplier"`, and
 * `DA3Render` has `"output.normalization"`. Splitting the path into exactly three
 * parts looked for a nested `inputs.resize_type.multiplier`, wrote a key ComfyUI does
 * not know and changed nothing, so a Scale Multiplier control never reached the graph.
 *
 * Needs no browser (the module only walks plain objects). Run it with
 * ``node tests/js/workflow_path.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// A stale binding is reported with console.warn; keep the harness output readable.
const warnings = [];
const realWarn = console.warn;
console.warn = (...args) => { warnings.push(args.join(' ')); };

const { splitNodePath, getValueFromWorkflow, updateWorkflow, updateWorkflowValue } =
    await import(pathToFileURL(join(ROOT, 'web/core/js/common/components/workflowManager.js')).href);

/* 1. a path splits into node / inputs / the whole (possibly dotted) input name */
{
    assert.deepEqual(splitNodePath('1.inputs.image'), ['1', 'inputs', 'image']);
    assert.deepEqual(splitNodePath('66_57.inputs.resize_type.multiplier'),
        ['66_57', 'inputs', 'resize_type.multiplier']);
    assert.deepEqual(splitNodePath('14_7.inputs.output.normalization'),
        ['14_7', 'inputs', 'output.normalization']);
    console.log('1. splitNodePath keeps a dotted input name whole: OK');
}

/* 2. reading prefers the flat dotted key, and a miss is a miss */
{
    const wf = { '66_57': { inputs: { 'resize_type.multiplier': 4, resize_type: 'scale by multiplier' } } };
    assert.equal(getValueFromWorkflow(wf, '66_57.inputs.resize_type.multiplier'), 4,
        'the whole key wins over its prefix');
    assert.equal(getValueFromWorkflow(wf, '66_57.inputs.resize_type'), 'scale by multiplier');
    assert.equal(getValueFromWorkflow(wf, '66_57.inputs.nope'), null, 'a missing input is null');
    assert.equal(getValueFromWorkflow(wf, '99.inputs.image'), null, 'so is an unknown node');
    console.log('2. getValueFromWorkflow finds the flat dotted key: OK');
}

/* 3. writing targets the flat key and never invents a nested object */
{
    const wf = { '66_57': { inputs: { 'resize_type.multiplier': 4 } } };
    updateWorkflow(wf, '66_57.inputs.resize_type.multiplier', 2);
    assert.equal(wf['66_57'].inputs['resize_type.multiplier'], 2, 'the flat key is written');
    assert.equal(wf['66_57'].inputs.resize_type, undefined,
        'and no nested object appeared, which ComfyUI would have rejected');
    console.log('3. updateWorkflow writes the flat dotted key: OK');
}

/* 4. a stale binding is reported instead of written */
{
    const wf = { 1: { inputs: { image: 'a.png' } } };
    warnings.length = 0;
    updateWorkflow(wf, '404.inputs.image', 'b.png');
    assert.deepEqual(wf['1'].inputs, { image: 'a.png' }, 'the real node is untouched');
    assert.equal(wf['404'], undefined, 'and no node appeared from nowhere');
    assert.equal(warnings.length, 1, 'the disagreement is reported once');
    console.log('4. a stale nodePath warns instead of writing: OK');
}

/* 5. a prompt binding follows the same rule */
{
    const wf = { 1: { inputs: { value: 'old' } } };
    const cfg = { prompts: [{ id: 'p1', nodePath: '1.inputs.value' },
                            { id: 'p2', nodePath: '14_7.inputs.output.normalization' }] };
    updateWorkflowValue(wf, 'p1', 'new', cfg);
    assert.equal(wf['1'].inputs.value, 'new', 'a live binding is written');
    warnings.length = 0;
    updateWorkflowValue(wf, 'p2', 'raw', cfg);   // node 14_7 is not in this graph
    assert.equal(warnings.length, 1, 'a stale one is reported, not thrown');
    console.log('5. updateWorkflowValue shares the rule: OK');
}

console.warn = realWarn;
console.log('\nworkflow path: all scenarios passed');
