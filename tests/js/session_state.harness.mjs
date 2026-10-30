/**
 * Headless harness for web/core/js/common/scripts/sessionState.js.
 *
 * The store is what keeps an app's settings alive across a mistaken tab close: it must
 * round-trip within one server session, refuse a snapshot from another one (a ComfyUI
 * restart), and never hand back a value the app no longer has - an app that was
 * rebuilt has to open regardless. Needs no browser: sessionStorage is stubbed.
 *
 * Run it with ``node tests/js/session_state.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** A sessionStorage thin enough for one page's worth of keys. */
const store = new Map();
globalThis.sessionStorage = {
    get length() { return store.size; },
    key: (index) => Array.from(store.keys())[index] ?? null,
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
};
globalThis.window = { location: { pathname: '/saus/z-image-text-to-image/' } };

const {
    clearAll, collectValues, fingerprint, isNewServerSession, keyFor,
    load, pluckValues, save,
} = await import(
    pathToFileURL(join(ROOT, 'web/core/js/common/scripts/sessionState.js')).href
);

const APP = 'z-image-text-to-image';
const SESSION = '1750000000000';

/* 1. a snapshot belongs to one server session, not to the browser forever */
{
    const snapshot = { values: { 18: { steps: 30 } }, mode: { mode: 'turbo' } };
    assert.equal(save(APP, SESSION, snapshot), true, 'it writes');
    assert.equal(load(APP, SESSION).values[18].steps, 30, 'and reads back');

    assert.equal(load(APP, '1750000009999'), null,
        'a snapshot from another server run is not this app\'s');
    assert.equal(load('some-other-app', SESSION), null, 'and neither is a stranger\'s');
    console.log('1. a snapshot round-trips within its session only: OK');
}

/* 2. a stored version we do not understand is ignored, not guessed at */
{
    store.set(keyFor(APP), JSON.stringify({ version: 99, session: SESSION, values: {} }));
    assert.equal(load(APP, SESSION), null, 'a future/unknown shape is dropped');
    assert.equal(load(APP, SESSION), null, 'and reading it twice is still safe');

    store.set(keyFor(APP), '{not json');
    assert.equal(load(APP, SESSION), null, 'unreadable JSON is dropped too');
    console.log('2. an unknown version or broken JSON is ignored: OK');
}

/* 3. only the values a user could have chosen are collected */
{
    const workflow = {
        18: { class_type: 'KSampler', inputs: { seed: 42, steps: 25, cfg: 4.5, denoise: true } },
        20: { class_type: 'VAEDecode', inputs: { samples: ['18', 0], vae: 'flux2-vae.safetensors' } },
        21: { class_type: 'Note', inputs: { text: '' } },
        broken: null,
    };
    const values = collectValues(workflow);

    assert.deepEqual(values[18], { seed: 42, steps: 25, cfg: 4.5, denoise: true },
        'every primitive input, whatever its type');
    assert.deepEqual(values[20], { vae: 'flux2-vae.safetensors' },
        'a link ([nodeId, slot]) is not a setting a user made');
    assert.ok(!('broken' in values), 'a node without inputs is skipped, not fatal');
    console.log('3. collectValues keeps what a user could set: OK');
}

/* 4. what the app no longer has is reported, never applied */
{
    const saved = { 18: { steps: 30, vanished: 1 }, 99: { seed: 7 } };
    const workflow = { 18: { class_type: 'KSampler', inputs: { steps: 25, seed: 1 } } };

    const { apply, dropped } = pluckValues(saved, workflow);

    assert.deepEqual(apply, { 18: { steps: 30 } }, 'an input the node still has is applied');
    assert.deepEqual(dropped.sort(), ['18.vanished', '99'],
        'a gone node and a gone input are both named');
    console.log('4. a rebuilt app drops what it no longer has: OK');
}

/* 5. the fingerprint answers "is this the same app shape?" */
{
    const one = { 18: { inputs: { steps: 25, seed: 1 } }, 20: { inputs: { vae: 'a' } } };
    const same = { 20: { inputs: { vae: 'a' } }, 18: { inputs: { seed: 1, steps: 25 } } };
    const rebuilt = { 18: { inputs: { steps: 25, seed: 1, cfg: 4 } }, 20: { inputs: { vae: 'a' } } };

    assert.equal(fingerprint(one), fingerprint(same),
        'key order is not a difference');
    assert.notEqual(fingerprint(one), fingerprint(rebuilt),
        'a new input is a different app shape');
    console.log('5. the fingerprint tracks the app shape: OK');
}

/* 6. clearing touches this app state and nothing else */
{
    store.clear();
    save(APP, SESSION, { values: {} });
    save('another-app', SESSION, { values: {} });
    store.set('saus.tabs.v1', 'the shell keeps this');

    assert.equal(clearAll(), 2, 'both remembered apps are dropped');
    assert.equal(store.get('saus.tabs.v1'), 'the shell keeps this',
        'and nothing that is not app state');
    console.log('6. clearing keeps the rest of the session: OK');
}

/* 7. the session rule itself */
{
    assert.equal(isNewServerSession(SESSION, SESSION), false, 'the same stamp is the same session');
    assert.equal(isNewServerSession('1', '2'), true, 'a different stamp is a new one');
    assert.equal(isNewServerSession(SESSION, ''), false,
        'unable to ask is not a reason to forget');
    console.log('7. same stamp = same session: OK');
}

console.log('\nsession state: all scenarios passed');
