/**
 * Headless harness for web/core/js/common/components/LoraWorkflowManager.js.
 *
 * "+Lora" used to fail with "Model loader node with ID 18 does not exist" on every
 * app exported from a workflow that uses a **subgraph**: the builder expands an
 * inner node to `"<outer>_<inner>"` (`ui_to_api.py`), so the graph keys are `"18_1"`,
 * `"18_7"`, ... The manager looked its loader up with `parseInt(id, 10)`, which turns
 * `"18_1"` into `18` - a key nothing is stored under. Every app with a subgraph was
 * affected (moss-text-to-image is one), while a plain graph such as krea worked.
 *
 * The manager therefore keys on the raw id everywhere. This runs the real click: the
 * button `initializeUI()` builds is fired and the rewiring it produces is asserted.
 *
 * Needs no browser: document / window / localStorage / fetch / alert are stubbed.
 * Run it with ``node tests/js/lora_manager.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* --- A DOM thin enough for the widgets the button builds ------------------- */

function makeElement(tag = 'div') {
    const el = {
        tag, id: '', type: '', title: '', className: '', textContent: '', innerHTML: '', value: '',
        style: {}, dataset: {}, children: [], parentNode: null, listeners: {}, classes: new Set(),
        classList: {
            add: (name) => el.classes.add(name),
            remove: (name) => el.classes.delete(name),
            contains: (name) => el.classes.has(name),
            toggle: (name, on) => (on ? el.classes.add(name) : el.classes.delete(name)),
        },
        appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
        removeChild(child) {
            const index = el.children.indexOf(child);
            if (index >= 0) el.children.splice(index, 1);
            return child;
        },
        insertAdjacentHTML() {},
        setAttribute(name, value) { el[name] = String(value); },
        removeAttribute(name) { delete el[name]; },
        addEventListener(type, handler) { (el.listeners[type] = el.listeners[type] || []).push(handler); },
        click() { (el.listeners.click || []).forEach((handler) => handler({ target: el })); },
        // The dropdown draws its rows by id and by class; a stub each is enough.
        querySelector: () => makeElement('div'),
        querySelectorAll: () => [],
    };
    return el;
}

const byId = new Map();
globalThis.document = {
    getElementById: (id) => {
        if (!byId.has(id)) byId.set(id, makeElement('div'));
        const el = byId.get(id);
        el.id = id;
        return el;
    },
    createElement: (tag) => makeElement(tag),
    // The label is a text node beside the icon, so the stub needs one.
    createTextNode: (text) => ({ nodeType: 3, textContent: String(text), data: String(text) }),
    querySelector: () => null,
    querySelectorAll: () => [],
};

const alerts = [];
globalThis.alert = (message) => alerts.push(String(message));
globalThis.CustomEvent = class CustomEvent {
    constructor(type, options) { this.type = type; Object.assign(this, options); }
};
globalThis.window = {
    location: { origin: 'http://localhost:8188', pathname: '/saus/moss-text-to-image/' },
    innerWidth: 1200, innerHeight: 800,
    dispatchEvent() {}, addEventListener() {},
};
globalThis.localStorage = { getItem: () => null, setItem() {} };

// LoraLoaderModelOnly as /object_info answers it, so the block's dropdown draws.
globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
        LoraLoaderModelOnly: { input: { required: { lora_name: [['MOSS/style.safetensors']] } } },
    }),
});

/* --- Reading the manager's own work ---------------------------------------- */

/** The button `initializeUI()` appended, found by walking the tree it built. */
function findButton(node) {
    if (node.className === 'add-lora-button') return node;
    for (const child of node.children) {
        const hit = findButton(child);
        if (hit) return hit;
    }
    return null;
}

const sortedKeys = (workflow) => Object.keys(workflow).sort();
const loraKeys = (workflow) =>
    Object.keys(workflow).filter((key) => workflow[key].class_type === 'LoraLoaderModelOnly');

/** The nodes whose model input (output 0) reads `id` - "who is still wired to it". */
const readersOf = (workflow, id) => Object.keys(workflow)
    .filter((key) => Object.values(workflow[key].inputs || {}).some((value) =>
        Array.isArray(value) && String(value[0]) === id && Number(value[1]) === 0))
    .sort();

const { default: LoraWorkflowManager } = await import(
    pathToFileURL(join(ROOT, 'web', 'core', 'js', 'common', 'components', 'LoraWorkflowManager.js')).href);

function build(workflow, appConfig = {}) {
    alerts.length = 0;
    byId.clear();   // a fresh page: each app builds its own tree
    const manager = new LoraWorkflowManager(workflow, appConfig);
    const button = findButton(document.getElementById('lora-slot'));
    assert.ok(button, 'the "+Lora" button must be on the page for a graph with a loader');
    // The control is an icon plus a plain label, not the old 'Add Lora+' text.
    const label = button.children.map((child) => child.textContent || '').join('');
    assert.ok(button.children.some((child) => String(child.className || '').includes('fas')),
        'the Add Lora button wears an icon');
    assert.equal(label, 'Add Lora', 'and its label is Add Lora, with no plus sign');

    return { manager, button };
}

/* 1. A subgraph-exported graph: the ids the builder writes ("<outer>_<inner>") */
// Mirrors the shape of web/apps/moss-text-to-image/wf.json: a UNETLoader whose model
// reaches the sampler through a switch (one branch through Skip Layer Guidance, one
// straight from the loader - and that one is the reported app's default).
const expanded = {
    '9': { inputs: { images: ['18_8', 0] }, class_type: 'SaveImage' },
    '18_1': { inputs: { unet_name: 'moss.safetensors', weight_dtype: 'default' }, class_type: 'UNETLoader' },
    '18_15': { inputs: { model: ['18_1', 0], end_percent: 0.5 }, class_type: 'SkipLayerGuidanceDiTSimple' },
    '18_24': { inputs: { switch: false, on_false: ['18_1', 0], on_true: ['18_15', 0] }, class_type: 'ComfySwitchNode' },
    '18_7': { inputs: { model: ['18_24', 0], seed: 1 }, class_type: 'KSampler' },
};

const first = build(expanded);
const loaders = first.manager._findModelLoaders();
assert.equal(loaders.length, 1, 'the UNETLoader is the one model loader here');
assert.equal(loaders[0].id, '18_1', 'the loader keeps its raw graph key, not parseInt("18_1")');
assert.ok(expanded[loaders[0].id], 'and that key is where the graph stores it');

first.button.click();
assert.deepEqual(alerts, [], 'clicking "+Lora" must not fail - this is the reported alert');
const afterFirst = first.manager.getWorkflow();
// The highest numeric part in that graph is 18 ("18_1"), so the free id is 19.
assert.deepEqual(loraKeys(afterFirst), ['19'], 'the new node goes to the next free id');
assert.deepEqual(afterFirst['18_15'].inputs.model, ['19', 0], 'the consumer now reads the LoRA');
assert.deepEqual(afterFirst['18_24'].inputs.on_false, ['19', 0],
    'and so does the switch, whose branch skipped the stage the LoRA sits behind');
assert.deepEqual(afterFirst['19'].inputs.model, ['18_1', 0], 'which reads the loader it was attached to');
assert.equal(afterFirst['18_15'].inputs.end_percent, 0.5, 'and nothing else on that node moved');
assert.deepEqual(readersOf(afterFirst, '18_1'), ['19'], 'only the LoRA reads the loader now');
assert.deepEqual(readersOf(afterFirst, '19'), ['18_15', '18_24'], 'and both consumers read the LoRA');
console.log('1. a subgraph graph ("18_1") takes a LoRA: OK');

/* 2. A second click chains onto the first LoRA instead of the loader */
first.button.click();
assert.deepEqual(alerts, [], 'a second LoRA must not fail either');
const afterSecond = first.manager.getWorkflow();
assert.deepEqual(afterSecond['18_15'].inputs.model, ['20', 0], 'the consumer reads the newest LoRA');
assert.deepEqual(afterSecond['18_24'].inputs.on_false, ['20', 0], 'both branches moved together');
assert.deepEqual(afterSecond['20'].inputs.model, ['19', 0], 'which reads the first one');
assert.deepEqual(afterSecond['19'].inputs.model, ['18_1', 0], 'which still reads the loader');
console.log('2. a second LoRA chains onto the first: OK');

/* 3. Removing one puts the chain back together */
first.manager.handleRemoveLora('20', null);
const afterRemove = first.manager.getWorkflow();
assert.equal(afterRemove['20'], undefined, 'the node is gone');
assert.deepEqual(afterRemove['18_15'].inputs.model, ['19', 0], 'and its consumer reads the LoRA below it');
assert.deepEqual(afterRemove['18_24'].inputs.on_false, ['19', 0], 'both of them');
assert.deepEqual(sortedKeys(afterRemove), ['18_1', '18_15', '18_24', '18_7', '19', '9'],
    'nothing else was added or lost');
console.log('3. removing a LoRA reconnects the chain: OK');

/* 4. A plain-id graph keeps working (krea-2-turbo-text-to-image and friends) */
const plain = {
    '1': { inputs: { unet_name: 'krea.safetensors' }, class_type: 'UNETLoader' },
    '3': { inputs: { model: ['1', 0] }, class_type: 'ModelSamplingAuraFlow' },
    '5': { inputs: { model: ['3', 0] }, class_type: 'KSampler' },
};

const second = build(plain);
assert.equal(second.manager._findModelLoaders()[0].id, '1', 'a plain id stays as it was');
second.button.click();
assert.deepEqual(alerts, [], 'and the click works as before');
const plainAfter = second.manager.getWorkflow();
assert.deepEqual(plainAfter['3'].inputs.model, ['6', 0], 'the new LoRA sits between loader and consumer');
assert.deepEqual(plainAfter['6'].inputs.model, ['1', 0], 'wired to the loader');
console.log('4. a plain-id graph is unchanged: OK');

/* 5. The app that was reported, read from disk */
const moss = JSON.parse(
    readFileSync(join(ROOT, 'web', 'apps', 'moss-text-to-image', 'wf.json'), 'utf8'));
const mossRunner = build(moss);
const mossLoaderKey = Object.keys(moss).find((key) => moss[key].class_type === 'UNETLoader');
assert.equal(mossRunner.manager._findModelLoaders()[0].id, mossLoaderKey,
    'the loader is found under the key the app file holds');
mossRunner.button.click();
assert.deepEqual(alerts, [], 'so moss-text-to-image takes a LoRA now');
const mossAfter = mossRunner.manager.getWorkflow();
const mossLora = loraKeys(mossAfter)[0];
assert.deepEqual(mossAfter[mossLora].inputs.model, [mossLoaderKey, 0],
    "the new LoRA reads the app's own loader");
assert.ok(Object.values(mossAfter).some((node) => node.inputs && node.inputs.model
        && String(node.inputs.model[0]) === mossLora),
    'and at least one node downstream reads the LoRA');
// The app gates Skip Layer Guidance behind a switch whose *off* branch (its default,
// switch: false) reads the loader directly - that branch has to carry the LoRA too, or
// the sampler would never see it.
const mossSwitch = Object.keys(moss).find((key) => moss[key].class_type === 'ComfySwitchNode'
    && Array.isArray(moss[key].inputs.on_false) && String(moss[key].inputs.on_false[0]) === mossLoaderKey);
assert.ok(mossSwitch, 'moss reads its loader straight on the SLG-off branch');
assert.deepEqual(mossAfter[mossSwitch].inputs.on_false, [mossLora, 0],
    'which the LoRA now covers');
assert.deepEqual(readersOf(mossAfter, mossLoaderKey), [mossLora], 'the loader feeds the LoRA only');
console.log('5. moss-text-to-image (the reported app) takes a LoRA: OK');

console.log('lora-manager harness: 5/5 OK');

