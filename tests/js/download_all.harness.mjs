/**
 * Headless harness for the information panel's per-variant "Download all"
 * (web/saus_browser/js/models.js).
 *
 * One click has to install exactly what the variant still needs: every required
 * model that is missing, each of them once, never an optional one, never a model
 * already downloading, and never the leftover of a "one of these" group that is
 * already satisfied by one of its files.
 *
 * `models.js` imports `state.js`, which reaches into the core tree through a route
 * specifier (`/core/...`), so `_root_paths_loader.mjs` maps those onto the checkout.
 *
 * Needs no browser: document / window / localStorage are stubbed, and the real
 * `window.downloadModel` is replaced by a recorder. Run it with
 * ``node tests/js/download_all.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
register('./_root_paths_loader.mjs', import.meta.url);

const SHARED = 'shared-vae.safetensors';
const OPTIONAL = 'optional-style.safetensors';
const ALT_A = 'alt-a.safetensors';
const ALT_B = 'alt-b.safetensors';
const DONE = 'installed.safetensors';
const GROUP = 'Reference';

/* ------------------------------------------------------------------ *
 * A DOM small enough for a variant card
 * ------------------------------------------------------------------ */

function classList(initial = []) {
    const set = new Set(initial);
    return {
        add: (name) => set.add(name),
        remove: (name) => set.delete(name),
        contains: (name) => set.has(name),
        toggle: (name, on) => (on ? set.add(name) : set.delete(name)),
    };
}

/** A model row: the classes applyStatusToItem would have painted. */
function makeItem(fileId, listType, label, installed) {
    const background = listType === 'optional'
        ? (installed ? 'optional-installed' : '')
        : (installed ? 'required-installed' : 'required-missing');
    return {
        dataset: { fileId, listType, listLabel: label },
        classList: classList(['component-item', background].filter(Boolean)),
        querySelector: (selector) => (selector === '.component-actions' ? { innerHTML: '' } : null),
        closest: () => null,
    };
}

const shared = makeItem(SHARED, 'compulsory', 'Diffusion model', false);
const optional = makeItem(OPTIONAL, 'optional', 'Style', false);
const altA = makeItem(ALT_A, 'at_least_one', GROUP, false);
const altB = makeItem(ALT_B, 'at_least_one', GROUP, false);
const done = makeItem(DONE, 'compulsory', 'Text encoder', true);
const items = [shared, optional, altA, altB, done];

const button = {
    dataset: { action: 'download-all' },
    classList: classList(['download-all-btn']),
    querySelector: () => null,
};
const readyNote = { classList: classList(['variant-card-ready', 'hidden']) };

const card = {
    querySelectorAll: (selector) => (selector === '.component-item' ? items : []),
    querySelector(selector) {
        if (selector === '.download-all-btn') return button;
        if (selector === '.variant-card-ready') return readyNote;
        return null;    // the title's dot: nothing to repaint in this harness
    },
};
button.closest = (selector) => (selector === '.variant-card' ? card : null);

/* `updateComponentStatus` looks cards up document-wide; the details modal is the
   only root here (`getElementById` answers null for everything else, which is what
   `updateOpenAppButtonStatus` needs to stand down). */
globalThis.document = {
    getElementById: () => null,
    querySelectorAll: (selector) => {
        if (selector === '.component-item') return items;
        if (selector === '.variant-card') return [card];
        return [];
    },
    dispatchEvent() {},
};

const storage = new Map();
globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
};
globalThis.CustomEvent = class CustomEvent {
    constructor(type, options) { this.type = type; Object.assign(this, options); }
};
globalThis.window = { location: { pathname: '/saus/test-app/' }, open: () => null };


/* ------------------------------------------------------------------ *
 * The module under test
 * ------------------------------------------------------------------ */

const { handleModelActionClick, updateComponentStatus } = await import(
    pathToFileURL(join(ROOT, 'web/saus_browser/js/models.js')).href
);
const { state } = await import(
    pathToFileURL(join(ROOT, 'web/saus_browser/js/state.js')).href
);
state.MODELS_DATA = {
    [SHARED]: { name: 'Shared VAE', url: 'https://example.invalid/shared.safetensors', directory: 'vae', type: 'VAE' },
    [OPTIONAL]: { name: 'Style', url: 'https://example.invalid/style.safetensors', directory: 'style_models', type: 'Style' },
    [ALT_A]: { name: 'Alt A', url: 'https://example.invalid/alt-a.safetensors', directory: 'diffusion_models', type: '' },
    [ALT_B]: { name: 'Alt B', url: 'https://example.invalid/alt-b.safetensors', directory: 'diffusion_models', type: '' },
    [DONE]: { name: 'Text encoder', url: 'https://example.invalid/done.safetensors', directory: 'text_encoders', type: 'TEXT ENCODER' },
};

/* models.js publishes the real `window.downloadModel` while it loads, so the
   recorder has to replace it afterwards. */
const calls = [];
globalThis.window.downloadModel = async (type, url, directory, fileId) => {
    calls.push(fileId);
};

/** Fire the real delegated handler the panel is wired to. */
function clickDownloadAll() {
    handleModelActionClick({
        target: { closest: (selector) => (selector === 'button[data-action]' ? button : null) },
        stopPropagation() {},
    });
}

/** Let the async loop inside downloadMissingInVariant run to completion. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

/* 1. The button offers the three required, missing models - and nothing else */
{
    // A status change repaints the card (that is what keeps the button in step).
    updateComponentStatus(DONE, 'ready');
    assert.ok(!button.classList.contains('hidden'), 'a variant missing models offers to download them');

    clickDownloadAll();
    await settle();

    assert.deepEqual(calls, [SHARED, ALT_A, ALT_B],
        'one click queues every required missing model, in card order, once each');
    assert.ok(!calls.includes(OPTIONAL), 'an optional model is never downloaded for the user');
    assert.ok(!calls.includes(DONE), 'nor is a model that is already installed');
    console.log('1. Download all fetches exactly the required, missing models: OK');
}

/* 2. A satisfied "one of these" group is not topped up */
{
    calls.length = 0;
    updateComponentStatus(ALT_A, 'ready');   // the user installed one of the pair
    assert.ok(!button.classList.contains('hidden'),
        'the shared model is still missing, so the button stays');

    clickDownloadAll();
    await settle();

    assert.deepEqual(calls, [SHARED],
        'the other member of a satisfied "one of these" group is not offered any more');
    console.log('2. a satisfied "one of these" group is left alone: OK');
}

/* 3. A model already downloading is not queued a second time */
{
    calls.length = 0;
    updateComponentStatus(ALT_B, 'downloading', 10);   // the other group member, in flight

    clickDownloadAll();
    await settle();

    assert.deepEqual(calls, [SHARED], 'a download in flight is not started again');
    console.log('3. a model already downloading is not queued twice: OK');
}

/* 4. Nothing left to fetch: the button gives way to "All installed" */
{
    updateComponentStatus(SHARED, 'ready');

    assert.ok(button.classList.contains('hidden'),
        'with every required model present the button is gone');
    assert.ok(!readyNote.classList.contains('hidden'),
        'the card says the variant is installed instead');
    console.log('4. a complete variant shows "All installed": OK');
}

console.log('\ndownload all: all scenarios passed');
