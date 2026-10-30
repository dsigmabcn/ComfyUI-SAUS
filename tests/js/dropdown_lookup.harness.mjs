/**
 * Headless harness for web/core/js/common/components/widgets/Dropdown.js.
 *
 * A combo is looked up in /object_info by *node type*, and an app config does
 * not always carry a usable one: a builder used to save ComfyUI's per-node uuid
 * (`c291ceec-...`), which no node is called at all. The widget has to fall back
 * to the class the workflow itself names for the node it writes to, otherwise
 * the app shows "Missing input ..." where a dropdown belongs.
 *
 * The config's own url still wins when it works - several apps point a combo at
 * another node on purpose (a `sampler_name` list served by KSampler for a
 * KSamplerSelect), so it may not be replaced or fetched twice.
 *
 * Needs no browser: document / window / localStorage / fetch are stubbed.
 * Run it with ``node tests/js/dropdown_lookup.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UUID = 'c291ceec-b98f-4751-9d0b-7bc288f27b30';

const state = { requested: [], answers: {}, lookups: 0, root: null, containers: 1 };

function element(id) {
    return {
        id,
        innerHTML: '',
        textContent: '',
        style: {},
        children: [],
        appendChild(child) {
            this.children.push(child);
            return child;
        },
        querySelector: () => null,
        addEventListener() {},
    };
}

globalThis.window = {
    location: { origin: 'http://localhost:8188', pathname: '/saus/saus-builder-preview/' },
};
globalThis.localStorage = { getItem: () => null, setItem() {} };

globalThis.document = {
    // The widget looks its own container up first; every later lookup (the
    // dropdown handler's) finds nothing, which is that handler's documented
    // "nothing to draw into" path - so this stays a lookup test, not a DOM test.
    // `state.containers` is how many widgets a scenario wants to give a home to.
    getElementById: (id) => {
        state.lookups += 1;
        if (state.lookups > state.containers) return null;
        state.root = element(id);
        return state.root;
    },
    createElement: (tag) => element(tag),
};

globalThis.fetch = async (url) => {
    const nodeType = decodeURIComponent(String(url).split('/object_info/')[1] || '');
    state.requested.push(nodeType);
    const payload = state.answers[nodeType];
    // ComfyUI answers { "<class>": {...} }, and an unknown type with {}.
    return {
        ok: true,
        status: 200,
        json: async () => (payload ? { [nodeType]: payload } : {}),
    };
};

const { default: Dropdown } = await import(
    pathToFileURL(join(ROOT, 'web/core/js/common/components/widgets/Dropdown.js')).href
);
// The cache lives for one page load, so a scenario has to start from a fresh one -
// that is what a reload does in the browser.
const { clearObjectInfoCache } = await import(
    pathToFileURL(join(ROOT, 'web/core/js/common/scripts/objectInfo.js')).href
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const settle = async () => {
    for (let turn = 0; turn < 8; turn += 1) await sleep(0);
};

/** One node's input map, keyed below by the class /object_info is asked for. */
const combo = (type, key, options = ['a', 'b']) => ({
    [type]: { input: { required: { [key]: [options, {}] } } },
});

/**
 * Load a widget for real (fetch + retries run) and collect what it asked for.
 * `answers` is keyed by node type - the type that should answer with a combo.
 */
async function load(config, workflow, answers = {}) {
    state.requested = [];
    state.answers = answers;
    state.lookups = 0;
    clearObjectInfoCache();
    const dropdown = new Dropdown(config, workflow);
    await settle();
    return dropdown;
}

/** Inspect a widget without letting it touch the network. */
function inspect(config, workflow) {
    state.lookups = 99;
    return new Dropdown(config, workflow);
}

/* 1. a uuid url falls back to the class in the workflow (the builder bug) */
{
    const config = { id: 'comp0f0gai', label: 'Scheduler 1', nodePath: '459.inputs.scheduler_1', url: UUID, key: 'scheduler_1' };
    const workflow = { 459: { class_type: 'QwenImageLoader', inputs: {} } };

    const dropdown = await load(config, workflow, combo('QwenImageLoader', 'scheduler_1', ['simple', 'beta']));

    assert.deepEqual(state.requested, [UUID, 'QwenImageLoader'],
        'the unusable url is tried, then the class the workflow names');
    assert.deepEqual(dropdown.nodeTypeCandidates, [UUID, 'QwenImageLoader']);
    assert.equal(state.root.children.length, 0, 'no "Missing input" placeholder is drawn');
    console.log('1. a uuid url falls back to the workflow class: OK');
}

/* 2. a working url is used as-is, even when it is another node's class */
{
    const config = { id: 'compSample', label: 'Sampler', nodePath: '16.inputs.sampler_name', url: 'KSampler', key: 'sampler_name' };
    const workflow = { 16: { class_type: 'KSamplerSelect', inputs: {} } };

    const dropdown = await load(config, workflow, combo('KSampler', 'sampler_name', ['euler', 'dpmpp_2m']));

    assert.deepEqual(state.requested, ['KSampler'], 'the hint is not replaced, and asked once');
    assert.deepEqual(dropdown.nodeTypeCandidates, ['KSampler', 'KSamplerSelect'],
        'the fallback is still known in case the hint stops working');
    console.log('2. a working url is preferred and fetched once: OK');
}

/* 3. nothing usable at all still reports what it looked for */
{
    const config = { id: 'compBroken', label: 'Unet Name', nodePath: '999.inputs.unet_name', url: UUID, key: 'unet_name' };

    await load(config, { 459: { class_type: 'QwenImageLoader', inputs: {} } });

    assert.deepEqual(state.requested, [UUID], 'only the config url is on offer');
    assert.equal(state.root.children.length, 1, 'the placeholder is drawn');
    const message = state.root.children[0].textContent;
    assert.match(message, /^Missing input "unet_name" on /, 'the wording the UI always had');
    assert.ok(message.includes(UUID), 'and it names the type it could not resolve');
    console.log('3. an unresolvable combo reports what it tried: OK');
}

/* 4. the same guess twice is one lookup */
{
    const config = { id: 'compSame', label: 'Clip Name', nodePath: '459.inputs.clip_name', url: 'CLIPLoader', key: 'clip_name' };
    const workflow = { 459: { class_type: 'CLIPLoader', inputs: {} } };

    const dropdown = await load(config, workflow, combo('CLIPLoader', 'clip_name'));

    assert.deepEqual(dropdown.nodeTypeCandidates, ['CLIPLoader'], 'no duplicate candidates');
    assert.deepEqual(state.requested, ['CLIPLoader'], 'and one request');
    assert.equal(dropdown.workflowNodeType, 'CLIPLoader');
    assert.equal(dropdown.nodeId, '459', 'the node is read off the nodePath');
    console.log('4. duplicate candidates collapse: OK');
}

/* 5. a combo with no usable target is not a crash */
{
    const bare = inspect({ id: 'compNoPath', label: 'Nothing', key: 'sampler_name' }, {});
    assert.deepEqual(bare.nodeTypeCandidates, [], 'nothing to look up');
    assert.equal(bare.workflowNodeType, '', 'and no class to fall back to');
    assert.equal(bare.nodeId, '', 'nor a node');

    const unknownNode = inspect({ id: 'compUnknown', label: 'Unknown', nodePath: '12.inputs.steps', url: UUID, key: 'steps' }, {});
    assert.deepEqual(unknownNode.nodeTypeCandidates, [UUID], 'a workflow without the node adds nothing');
    console.log('5. missing workflow entries are handled: OK');
}

/* 6. the same node type is fetched once for the whole page */
{
    clearObjectInfoCache();
    state.requested = [];
    state.lookups = 0;
    state.containers = 4;
    state.answers = combo('CLIPLoader', 'clip_name', ['clip_l.safetensors']);
    const workflow = { 459: { class_type: 'CLIPLoader', inputs: {} } };
    const widget = (id) => ({ id, label: 'Clip Name', nodePath: '459.inputs.clip_name', url: 'CLIPLoader', key: 'clip_name' });

    new Dropdown(widget('clipA'), workflow);
    await settle();
    new Dropdown(widget('clipB'), workflow);
    await settle();

    assert.deepEqual(state.requested, ['CLIPLoader'],
        'two dropdowns over one class cost one request - a loader answers with every model on disk');

    // A class ComfyUI does not know is remembered too: the next widget must not
    // re-ask for a type the first already proved is unknown.
    state.answers = {};
    new Dropdown(widget('clipC'), workflow);
    await settle();
    assert.deepEqual(state.requested, ['CLIPLoader'],
        'an unknown type is not asked for twice either');

    // A failure is NOT remembered, so a retry is still possible.
    clearObjectInfoCache();
    state.requested = [];
    state.lookups = 0;
    state.containers = 2;
    const working = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('offline'); };
    new Dropdown(widget('clipD'), workflow);
    await settle();
    globalThis.fetch = working;
    new Dropdown(widget('clipE'), workflow);
    await settle();
    assert.deepEqual(state.requested, ['CLIPLoader'], 'the retry after a failure does fetch');
    console.log('6. one /object_info request per node type, per page: OK');
}

console.log('\ndropdown lookup: all scenarios passed');
