/**
 * Headless harness for web/core/js/common/scripts/saus_open_workflow.js.
 *
 * The extension runs inside ComfyUI, so this harness stubs window/document/
 * history/fetch and ComfyUI's app, then replays a page load: the extension
 * registers itself, setup() runs, and the afterLoadGraph hooks ComfyUI fires
 * while restoring its own workflow play out. It checks that
 *   - the boot is waited for, without setup() ever blocking it,
 *   - an API graph goes to app.loadApiJson and a UI graph to app.loadGraphData,
 *     both with a null target (= a new workflow tab),
 *   - the parameter is dropped from the address bar, so a reload is quiet,
 *   - anything unusable is reported instead of thrown into ComfyUI.
 *
 * Needs no browser. Run it with ``node tests/js/open_workflow.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const COMFY_ORIGIN = 'http://localhost:8188';
const WORKFLOW_PATH = '/api/userdata/workflows/My%20App.json';

/* The extension imports ComfyUI's /scripts/app.js, so it is copied into a
 * throw-away tree that has one. */
const SANDBOX = mkdtempSync(join(tmpdir(), 'saus-open-workflow-'));
mkdirSync(join(SANDBOX, 'scripts'), { recursive: true });
mkdirSync(join(SANDBOX, 'extensions', 'saus'), { recursive: true });
copyFileSync(
    join(ROOT, 'web', 'core', 'js', 'common', 'scripts', 'saus_open_workflow.js'),
    join(SANDBOX, 'extensions', 'saus', 'saus_open_workflow.js'),
);
writeFileSync(join(SANDBOX, 'scripts', 'app.js'), 'export const app = globalThis.__app;\n');


const API_WORKFLOW = {
    1: { inputs: { image: 'ComfyUI_00001_.png', upload: 'image' }, class_type: 'LoadImage', _meta: { title: 'Load Image' } },
    2: { inputs: { torchscript_jit: 'default', image: [1, 0] }, class_type: 'InspyrenetRembg', _meta: { title: 'Inspyrenet Rembg' } },
};

const UI_WORKFLOW = {
    id: 'abc',
    revision: 0,
    nodes: [{ id: 1, type: 'LoadImage', widgets_values: [] }],
    links: [],
    version: 0.4,
};

const state = {
    calls: [],
    replaced: [],
    notices: [],
    fetches: [],
    payload: API_WORKFLOW,
    rawPayload: null,
    responseOk: true,
    status: 200,
    graphDataResult: true,
    extension: null,
};

const app = {
    async loadApiJson(data, target) {
        state.calls.push({ method: 'loadApiJson', data, target });
    },
    async loadGraphData(data, first, second, target) {
        state.calls.push({ method: 'loadGraphData', data, first, second, target });
        return state.graphDataResult;
    },
    registerExtension(extension) {
        state.extension = extension;
    },
};
globalThis.__app = app;

globalThis.window = { location: { href: `${COMFY_ORIGIN}/`, origin: COMFY_ORIGIN } };
globalThis.document = {
    createElement: () => ({ style: {}, textContent: '', remove() {} }),
    body: { appendChild: (el) => state.notices.push(el.textContent) },
};
globalThis.history = { replaceState: (_state, _title, url) => state.replaced.push(url) };
globalThis.fetch = async (url) => {
    state.fetches.push(url);
    return {
        ok: state.responseOk,
        status: state.status,
        text: async () => state.rawPayload ?? JSON.stringify(state.payload),
    };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let caseId = 0;

/** Fresh module instance (cache-busted), so every scenario starts clean. */
async function loadExtension() {
    caseId += 1;
    state.extension = null;
    const url = pathToFileURL(join(SANDBOX, 'extensions', 'saus', 'saus_open_workflow.js'));
    url.searchParams.set('case', String(caseId));
    await import(url.href);
    const extension = state.extension;
    assert.ok(extension, 'the extension must register itself with ComfyUI');
    assert.equal(extension.name, 'saus.open_workflow');
    return extension;
}

function reset(overrides = {}) {
    state.calls = [];
    state.replaced = [];
    state.notices = [];
    state.fetches = [];
    state.payload = API_WORKFLOW;
    state.rawPayload = null;
    state.responseOk = true;
    state.status = 200;
    state.graphDataResult = true;
    Object.assign(state, overrides);
    globalThis.window.location.href = `${COMFY_ORIGIN}/`;
}

/** Runs one page load: address bar -> setup -> the boot's own workflow loads. */
async function openPage(href, bootLoads = 1, payload = API_WORKFLOW) {
    reset({ payload });
    globalThis.window.location.href = href;
    const extension = await loadExtension();
    const returned = extension.setup();
    for (let i = 0; i < bootLoads; i += 1) {
        await extension.afterLoadGraph();
        await sleep(150);
    }
    await sleep(700);
    return { extension, returned };
}

/* ------------------------------------------------------------------ */
/* 1. API-format app workflow: handed over for a new workflow tab      */
/* ------------------------------------------------------------------ */
{
    const { returned } = await openPage(`${COMFY_ORIGIN}/?saus_workflow=${encodeURIComponent(WORKFLOW_PATH)}`);

    assert.equal(returned, undefined, 'setup() must return at once (blocking it would block the boot)');
    assert.equal(state.calls.length, 1, 'the workflow must be handed over exactly once');
    assert.equal(state.calls[0].method, 'loadApiJson', 'an API graph goes through loadApiJson (it converts it)');
    assert.deepEqual(state.calls[0].data, API_WORKFLOW);
    assert.equal(state.calls[0].target, null, 'a null target is what makes ComfyUI open a NEW workflow tab');
    assert.deepEqual(state.fetches, [`${COMFY_ORIGIN}${WORKFLOW_PATH}`]);
    assert.deepEqual(state.replaced, ['/'], 'the parameter is dropped from the address bar');
    assert.deepEqual(state.notices, [], 'no error notice on the happy path');
    console.log('1. API workflow -> loadApiJson(data, null), parameter cleared: OK');
}

/* ------------------------------------------------------------------ */
/* 2. UI-format app workflow, other query parameters kept              */
/* ------------------------------------------------------------------ */
{
    await openPage(`${COMFY_ORIGIN}/?saus_workflow=${encodeURIComponent(WORKFLOW_PATH)}&foo=bar`, 1, UI_WORKFLOW);

    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].method, 'loadGraphData', 'a UI graph goes through loadGraphData');
    assert.deepEqual(state.calls[0].data, UI_WORKFLOW);
    assert.deepEqual([state.calls[0].first, state.calls[0].second], [true, true]);
    assert.equal(state.calls[0].target, null, 'a null target is what makes ComfyUI open a NEW workflow tab');
    assert.deepEqual(state.replaced, ['/?foo=bar'], 'only our parameter is removed');
    console.log('2. UI workflow -> loadGraphData(data, true, true, null): OK');
}

/* ------------------------------------------------------------------ */
/* 3. Several boot loads: wait for the last one, then load once        */
/* ------------------------------------------------------------------ */
{
    reset();
    globalThis.window.location.href = `${COMFY_ORIGIN}/?saus_workflow=${encodeURIComponent(WORKFLOW_PATH)}`;
    const extension = await loadExtension();
    extension.setup();

    await extension.afterLoadGraph();          // first workflow of the boot
    await sleep(200);
    assert.equal(state.calls.length, 0, 'a second boot load must be waited for too');

    await extension.afterLoadGraph();          // second one, 200ms later
    await sleep(700);
    assert.equal(state.calls.length, 1, 'only the settled canvas is replaced, once');
    console.log('3. multiple boot loads -> single, final load: OK');
}

/* ------------------------------------------------------------------ */
/* 4. No parameter: the extension stays completely out of the way      */
/* ------------------------------------------------------------------ */
{
    const { returned } = await openPage(`${COMFY_ORIGIN}/`, 2);

    assert.equal(returned, undefined);
    assert.equal(state.calls.length, 0, 'a normal ComfyUI page must not be touched');
    assert.deepEqual(state.fetches, []);
    assert.deepEqual(state.replaced, [], 'the address bar is left alone');
    assert.deepEqual(state.notices, []);
    console.log('4. no parameter -> inert: OK');
}

/* ------------------------------------------------------------------ */
/* 5. Errors are reported, never thrown at ComfyUI                     */
/* ------------------------------------------------------------------ */
{
    const attempt = async (overrides) => {
        reset(overrides);
        globalThis.window.location.href = `${COMFY_ORIGIN}/?saus_workflow=${encodeURIComponent(WORKFLOW_PATH)}`;
        const extension = await loadExtension();
        extension.setup();
        await extension.afterLoadGraph();
        await sleep(700);
        return { calls: state.calls.length, notices: [...state.notices], fetches: state.fetches.length };
    };

    // ComfyUI refuses the file
    let result = await attempt({ responseOk: false, status: 404 });
    assert.equal(result.calls, 0, 'a failed fetch must not touch the canvas');
    assert.equal(result.notices.length, 1, 'a failed fetch must tell the user');
    assert.match(result.notices[0], /404/);

    // A body that is not JSON
    result = await attempt({ rawPayload: '<html>oops</html>' });
    assert.equal(result.calls, 0);
    assert.equal(result.notices.length, 1);

    // Valid JSON that is no workflow: ComfyUI would silently put its own
    // default workflow on the canvas for those, so they must be refused
    for (const rawPayload of ['"just a string"', '[]', '42', 'null']) {
        result = await attempt({ rawPayload });
        assert.equal(result.calls, 0, `${rawPayload} must not reach the canvas`);
        assert.equal(result.notices.length, 1);
        assert.match(result.notices[0], /does not hold a workflow/);
    }

    // ComfyUI refusing the graph itself (loadGraphData answers false)
    result = await attempt({ graphDataResult: false, payload: UI_WORKFLOW });
    assert.equal(result.calls, 1);
    assert.equal(result.notices.length, 1);
    assert.match(result.notices[0], /could not read/);

    // A workflow living somewhere else is refused before it is even fetched
    reset();
    globalThis.window.location.href = `${COMFY_ORIGIN}/?saus_workflow=${encodeURIComponent('https://example.com/x.json')}`;
    const extension = await loadExtension();
    extension.setup();
    await extension.afterLoadGraph();
    await sleep(700);
    assert.equal(state.fetches.length, 0, 'a cross-origin workflow is refused before any request');
    assert.equal(state.notices.length, 1);
    assert.match(state.notices[0], /outside ComfyUI/);
    console.log('5. fetch/JSON/refusal errors -> notice, no crash: OK');
}

/* ------------------------------------------------------------------ */
/* 6. Format detection (mirrors ComfyUI's own isApiJson)               */
/* ------------------------------------------------------------------ */
{
    const detect = async (payload) => {
        const href = `${COMFY_ORIGIN}/?saus_workflow=${encodeURIComponent(WORKFLOW_PATH)}`;
        await openPage(href, 1, payload);
        return state.calls[0];
    };

    assert.equal((await detect(API_WORKFLOW)).method, 'loadApiJson');
    assert.equal((await detect({})).method, 'loadGraphData', 'an empty object is not an API graph');
    assert.equal((await detect(UI_WORKFLOW)).method, 'loadGraphData');
    assert.equal((await detect({ 1: { class_type: 'X', inputs: {} }, 2: { inputs: {} } })).method, 'loadGraphData',
        'one entry without class_type is not an API graph');
    assert.equal((await detect({ extra: [], nodes: [] })).method, 'loadGraphData', 'a nodes array means UI graph');

    // an array is refused outright (covered in scenario 5), never passed on
    await openPage(`${COMFY_ORIGIN}/?saus_workflow=${encodeURIComponent(WORKFLOW_PATH)}`, 1, [API_WORKFLOW]);
    assert.equal(state.calls.length, 0);
    assert.equal(state.notices.length, 1);
    console.log('6. format detection: OK');
}

console.log('\nall scenarios passed');

