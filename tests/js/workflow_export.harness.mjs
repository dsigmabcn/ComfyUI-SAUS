/**
 * Headless harness for web/saus_browser/js/workflow_export.js.
 *
 * The ⤴ button must reserve the ComfyUI window while the click is still being
 * handled (browsers block a window opened after an await), save the app's graph
 * in ComfyUI's workflow list, and hand that window a URL carrying the
 * ?saus_workflow= parameter the ComfyUI-side extension reads.
 *
 * Needs no browser: window/document/fetch are stubbed. Run it with
 * ``node tests/js/workflow_export.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { install } from './_fake_clock.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORIGIN = 'http://localhost:8188';
const APP_WORKFLOW = JSON.stringify({
    1: { inputs: { image: 'x.png' }, class_type: 'LoadImage', _meta: { title: 'Load Image' } },
});

const state = {
    opened: [],
    toasts: [],
    fetch: [],
    workflowOk: true,
    workflowBody: APP_WORKFLOW,
    saveOk: true,
    storedCopies: {},        // endpoint -> the workflow already stored there
    conflictNames: [],       // file names ComfyUI already has (overwrite=false -> 409)
};

/** The endpoint ComfyUI's workflow list reads a copy from. */
const copyUrl = (fileName) => `/api/userdata/${encodeURIComponent(`workflows/${fileName}`)}`;

const blankWindow = (label) => ({
    label,
    navigatedTo: null,
    closed: false,
    opener: { notNull: true },      // so a scenario can see it being dropped
    close() { this.closed = true; },
    location: { replace(url) { this.owner.navigatedTo = url; }, owner: null },
});

globalThis.window = {
    location: { origin: ORIGIN },
    open(url, target) {
        const handle = blankWindow(`${url || '(blank)'}|${target}`);
        handle.location.owner = handle;
        state.opened.push(handle);
        return state.blockPopups ? null : handle;
    },
    blockPopups: false,
};
globalThis.document = {
    getElementById: () => null,
    createElement: () => ({ className: '', classList: { add() {}, remove() {} }, style: {}, appendChild() {}, remove() {} }),
    createTextNode: (text) => { state.toasts.push(text); return text; },
    body: { appendChild() {} },
};
globalThis.fetch = async (url, options = {}) => {
    const method = options.method ?? 'GET';
    state.fetch.push({ url, method, body: options.body });

    if (method === 'POST') {
        // ComfyUI answers 409 when ?overwrite=false and the name is taken.
        if (state.conflictNames.some((name) => url.startsWith(copyUrl(name)))) {
            return { ok: false, status: 409, text: async () => '' };
        }
        return { ok: state.saveOk, status: state.saveOk ? 200 : 500, text: async () => '' };
    }

    // GET: the app's own wf.json, or a copy already in the workflow folder.
    if (url.startsWith('/saus/')) {
        return { ok: state.workflowOk, status: state.workflowOk ? 200 : 500, text: async () => state.workflowBody };
    }
    const stored = state.storedCopies[url];
    if (stored === undefined) return { ok: false, status: 404, text: async () => '' };
    return { ok: true, status: 200, text: async () => stored };
};

/** Stub of the app's iframe: the window.SAUS API web/core/main.js exposes. */
const liveFrame = (workflow, variant = null, ready = () => true) => ({
    contentWindow: {
        SAUS: {
            isReady: ready,
            getVariant: () => variant,
            getWorkflow: () => workflow,
        },
    },
});

/* The exporter polls for the app to report itself ready (150ms x a 3s grace), and
 * scenario 8 waits that whole grace out; a virtual clock makes the same waits
 * elapse in order, immediately (the >= 3s assertion still holds). */
install({ auto: true });

const { exportWorkflowToComfyUI } = await import(
    pathToFileURL(join(ROOT, 'web', 'saus_browser', 'js', 'workflow_export.js')).href
);

function reset(overrides = {}) {
    state.opened = [];
    state.toasts = [];
    state.fetch = [];
    state.workflowOk = true;
    state.workflowBody = APP_WORKFLOW;
    state.saveOk = true;
    state.storedCopies = {};
    state.conflictNames = [];
    Object.assign(state, overrides);
    globalThis.window.blockPopups = false;
}

/* 1. the happy path: blank window reserved, then pointed at ComfyUI */
{
    reset();
    const result = await exportWorkflowToComfyUI({ url: 'image-upscale-with-model', name: 'Upscale with Model' });

    assert.equal(result, true);
    assert.equal(state.opened.length, 1, 'exactly one window');
    assert.match(state.opened[0].label, /^\(blank\)\|_blank$/, 'the window is reserved empty, before any await');
    assert.equal(state.opened[0].closed, false);

    const target = state.opened[0].navigatedTo;
    assert.ok(target, 'the reserved window must be navigated');
    const parsed = new URL(target);
    assert.equal(parsed.origin, ORIGIN);
    assert.equal(parsed.pathname, '/');
    const param = parsed.searchParams.get('saus_workflow');
    assert.ok(param, 'ComfyUI is told which workflow to open');
    assert.equal(param, copyUrl('Upscale with Model.json'));

    assert.deepEqual(state.fetch.map((call) => call.method), ['GET', 'GET', 'POST'],
        'the app workflow is read, any stored copy checked, then the copy saved');
    assert.ok(state.fetch[0].url.startsWith('/saus/image-upscale-with-model/wf.json?cacheSaus='),
        `unexpected first request: ${state.fetch[0].url}`);
    assert.equal(state.fetch[2].url, `${copyUrl('Upscale with Model.json')}?overwrite=false`,
        'nothing is overwritten');
    console.log('1. reserves a window, saves to userdata, hands over ?saus_workflow=: OK');
}

/* 2. a blocked popup is retried after the workflow is ready */
{
    reset();
    const originalOpen = globalThis.window.open;
    let refusals = 1;
    globalThis.window.open = (url, target) => {
        if (refusals > 0) {
            refusals -= 1;
            return null;
        }
        const handle = blankWindow(`${url}|${target}`);
        handle.location.owner = handle;
        state.opened.push(handle);
        return handle;
    };

    const result = await exportWorkflowToComfyUI({ url: 'app', name: 'App' });
    assert.equal(result, true);
    assert.equal(state.opened.length, 1, 'the retry opened the real window');
    assert.match(state.opened[0].label, /^http:\/\/localhost:8188\/\?saus_workflow=/);
    globalThis.window.open = originalOpen;
    console.log('2. blocked popup -> retried once the workflow is ready: OK');
}

/* 3. failures close the reserved window and say so */
{
    reset({ saveOk: false });
    const result = await exportWorkflowToComfyUI({ url: 'app', name: 'App' });

    assert.equal(result, false);
    assert.equal(state.opened.length, 1);
    assert.equal(state.opened[0].closed, true, 'an empty tab must not be left behind');
    assert.equal(state.opened[0].navigatedTo, null);
    console.log('3. failure -> reserved window closed: OK');
}

/* 4. an app without a workflow opens nothing at all */
{
    reset({ workflowOk: false });
    const before = state.opened.length;
    const result = await exportWorkflowToComfyUI({ url: 'empty-app', name: 'Empty' });

    assert.equal(result, false);
    assert.equal(state.opened.length, before + 1);
    assert.equal(state.opened[0].closed, true);

    reset();
    assert.equal(await exportWorkflowToComfyUI(null), false);
    assert.equal(state.opened.length, 0, 'no tab is opened for a tab that has no app');
    console.log('4. no workflow / no app -> nothing is left open: OK');
}

/* 5. an app that is running hands over the graph it is running, variant and all */
{
    reset();
    const liveGraph = {
        1: { inputs: { image: 'ComfyUI_00001_.png', upload: 'image' }, class_type: 'LoadImage' },
        9: { inputs: { lora_name: 'lightning.safetensors', strength_model: 1 }, class_type: 'LoraLoaderModelOnly' },
    };
    const tab = { url: 'my-app', name: 'My App', id: 'tab-1' };
    const frame = liveFrame(liveGraph, { mode: 'variant', variant: 'turbo', label: 'Turbo' });

    const result = await exportWorkflowToComfyUI(tab, () => frame);

    assert.equal(result, true);
    const saved = state.fetch.find((call) => call.method === 'POST');
    assert.deepEqual(state.fetch.map((call) => call.method), ['GET', 'POST'],
        'the base wf.json must not be fetched when the app can hand over its own graph');
    assert.deepEqual(JSON.parse(saved.body), liveGraph, 'the live graph is what reaches ComfyUI');
    assert.equal(saved.url, `${copyUrl('My App · Turbo.json')}?overwrite=false`,
        'the copy is named after the variant being exported, and never overwrites');
    assert.equal(new URL(state.opened[0].navigatedTo).searchParams.get('saus_workflow'),
        copyUrl('My App · Turbo.json'), 'ComfyUI is pointed at that exact copy');
    assert.equal(state.opened[0].opener, null, 'the ComfyUI window gets no handle back on this one');
    assert.match(state.toasts[0], /“My App · Turbo\.json” saved and opened/,
        'the user is told which copy went over');
    console.log('5. running app -> its live graph, named after the variant: OK');
}

/* 6. an app without the accessor (older copy) falls back to its base wf.json */
{
    reset();
    const tab = { url: 'old-app', name: 'Old App', id: 'tab-2' };

    const result = await exportWorkflowToComfyUI(tab, () => ({ contentWindow: {} }));

    assert.equal(result, true);
    assert.deepEqual(state.fetch.map((call) => call.method), ['GET', 'GET', 'POST'], 'the base file is read and saved');
    assert.ok(state.fetch[0].url.startsWith('/saus/old-app/wf.json'), `unexpected first request: ${state.fetch[0].url}`);
    assert.equal(state.fetch[2].url, `${copyUrl('Old App.json')}?overwrite=false`, 'no variant in the name');
    console.log('6. app without the accessor -> base wf.json: OK');
}

/* 7. an app that is still booting is waited for, not given up on */
{
    reset();
    let asked = 0;
    const liveGraph = { 1: { inputs: {}, class_type: 'LoadImage' } };
    const frame = liveFrame(liveGraph, null, () => { asked += 1; return asked > 2; });

    const result = await exportWorkflowToComfyUI({ url: 'slow-app', name: 'Slow App', id: 'tab-3' }, () => frame);

    assert.equal(result, true);
    assert.ok(asked > 2, 'it must wait for the app to report itself ready');
    assert.deepEqual(state.fetch.map((call) => call.method), ['GET', 'POST'], 'and then export the live graph');
    assert.deepEqual(JSON.parse(state.fetch.find((call) => call.method === 'POST').body), liveGraph);
    console.log('7. app still booting -> waited for, live graph exported: OK');
}

/* 8. an app that never becomes ready, one that cannot be read, and no app at all */
{
    // never ready -> the base workflow, after the grace period
    reset();
    const started = Date.now();
    let result = await exportWorkflowToComfyUI(
        { url: 'stuck-app', name: 'Stuck App', id: 'tab-4' },
        () => liveFrame({ 1: { class_type: 'X' } }, null, () => false),
    );
    assert.equal(result, true);
    assert.deepEqual(state.fetch.map((call) => call.method), ['GET', 'GET', 'POST']);
    assert.ok(Date.now() - started >= 3000, 'the app is given a few seconds before falling back');

    // cross-origin window: reading it throws
    reset();
    const crossOriginFrame = { get contentWindow() { throw new Error('SecurityError'); } };
    result = await exportWorkflowToComfyUI({ url: 'other-app', name: 'Other App', id: 'tab-5' }, () => crossOriginFrame);
    assert.equal(result, true);
    assert.deepEqual(state.fetch.map((call) => call.method), ['GET', 'GET', 'POST'], 'a page we may not read -> base workflow');

    // no iframe at all (restored tab that was never shown)
    reset();
    result = await exportWorkflowToComfyUI({ url: 'closed-app', name: 'Closed App', id: 'tab-6' }, () => null);
    assert.equal(result, true);
    assert.deepEqual(state.fetch.map((call) => call.method), ['GET', 'GET', 'POST']);
    console.log('8. never-ready / unreadable / missing app -> base workflow: OK');
}

/* 9. the copy never lands on a workflow the user already has */
{
    // The name is taken by a *different* workflow: ComfyUI answers 409 to
    // overwrite=false, so the copy is numbered the way ComfyUI numbers its own.
    reset({
        storedCopies: { [copyUrl('My App.json')]: '{"1":{"class_type":"SomethingElse"}}' },
        conflictNames: ['My App.json'],
    });

    const result = await exportWorkflowToComfyUI({ url: 'my-app', name: 'My App', id: 'tab-9' }, () => null);

    assert.equal(result, true);
    assert.deepEqual(state.fetch.filter((call) => call.method === 'POST').map((call) => call.url), [
        `${copyUrl('My App.json')}?overwrite=false`,
        `${copyUrl('My App (2).json')}?overwrite=false`,
    ], 'a taken name is numbered, never overwritten');
    assert.equal(new URL(state.opened[0].navigatedTo).searchParams.get('saus_workflow'),
        copyUrl('My App (2).json'), 'ComfyUI is pointed at the copy that was actually written');
    assert.match(state.toasts[0], /My App \(2\)\.json/, 'and the user is told the name it ended up with');
    console.log('9. a taken name is never overwritten: OK');
}

/* 10. exporting the same app again reuses its copy instead of filling the list */
{
    reset({ storedCopies: { [copyUrl('My App.json')]: APP_WORKFLOW } });

    await exportWorkflowToComfyUI({ url: 'my-app', name: 'My App', id: 'tab-10' }, () => null);

    assert.deepEqual(state.fetch.map((call) => call.method), ['GET', 'GET'],
        'an identical copy is reused: nothing is written at all');
    assert.equal(new URL(state.opened[0].navigatedTo).searchParams.get('saus_workflow'),
        copyUrl('My App.json'));
    console.log('10. an identical copy is reused: OK');
}

/* 11. a graph the app hands over that is not a workflow is not used */
{
    reset();
    const result = await exportWorkflowToComfyUI({ url: 'odd-app', name: 'Odd App', id: 'tab-11' }, () => liveFrame({}));

    assert.equal(result, true);
    assert.deepEqual(state.fetch.map((call) => call.method), ['GET', 'GET', 'POST'],
        'an empty graph is not a workflow: the app base file is sent instead');
    assert.ok(state.fetch[0].url.startsWith('/saus/odd-app/wf.json'));
    console.log('11. a non-workflow graph from the app -> base workflow: OK');
}

console.log('\nall scenarios passed');
