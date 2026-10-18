/**
 * Headless harness for the information panel's model cards
 * (web/saus_browser/js/models.js).
 *
 * One model belongs to every variant that needs it, so the same file appears on
 * several cards - and a download, a delete or a progress tick has to update all of
 * them. It used to stop at the first match, which left the other variants showing
 * stale buttons and only one card turning red.
 *
 * `models.js` imports `state.js`, which reaches into the core tree through a route
 * specifier (`/core/...`), so `_root_paths_loader.mjs` maps those onto the checkout.
 *
 * Needs no browser: document is stubbed. Run it with
 * ``node tests/js/model_status_cards.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
register('./_root_paths_loader.mjs', import.meta.url);

const VAE = 'flux2-vae.safetensors';
const OTHER = 'qwen_3_4b.safetensors';

/* ------------------------------------------------------------------ *
 * A DOM small enough for the cards
 * ------------------------------------------------------------------ */

function makeSection() {
    const header = {
        inserted: [],
        querySelector: () => null,
        remove() {},
        insertAdjacentHTML(_where, html) { this.inserted.push(html); },
    };
    const section = {
        cards: [],
        header,
        querySelectorAll: (selector) => (selector === '.component-item' ? section.cards : []),
        querySelector: (selector) => (selector === 'h4' ? header : null),
    };
    return section;
}

function makeCard(fileId, listType, section) {
    const classes = new Set(['component-item']);
    const actions = { innerHTML: '' };
    return {
        dataset: { fileId, listType },
        classes,
        actions,
        classList: {
            add: (name) => classes.add(name),
            remove: (name) => classes.delete(name),
            contains: (name) => classes.has(name),
        },
        querySelector: (selector) => (selector === '.component-actions' ? actions : null),
        closest: (selector) => (selector === '.component-section' ? section : null),
    };
}

/* The panel a user sees: a shared section plus one card per variant. */
const shared = makeSection();
const variantA = makeSection();
const variantB = makeSection();

const vaeShared = makeCard(VAE, 'compulsory', shared);
const vaeA = makeCard(VAE, 'compulsory', variantA);
const vaeB = makeCard(VAE, 'at_least_one', variantB);
const otherA = makeCard(OTHER, 'compulsory', variantA);
shared.cards.push(vaeShared);
variantA.cards.push(vaeA, otherA);
variantB.cards.push(vaeB);

const cards = [vaeShared, vaeA, vaeB, otherA];
const vaeCards = [['the shared section', vaeShared], ['variant A', vaeA], ['variant B', vaeB]];

const scope = {
    querySelectorAll: (selector) => (selector === '.component-item' ? cards : []),
    querySelector: () => null,
};

globalThis.document = {
    getElementById: (id) => (id === 'app-details-content' ? scope : null),
    // models.js looks cards up document-wide now: the details modal and the Model
    // Manager render the same .component-item rows, so the harness answers for both.
    querySelectorAll: (selector) => (selector === '.component-item' ? cards : []),
};

// state.js builds a PreferencesManager while it is imported, and that reads the
// browser's storage straight away.
const storage = new Map();
globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
};

// models.js publishes window.downloadModel / window.deleteModel for the onclick
// handlers in its own markup.
globalThis.window = {
    location: { pathname: '/saus/test-app/', origin: 'http://localhost:8188' },
    open: () => null,
};

/* ------------------------------------------------------------------ *
 * The module under test
 * ------------------------------------------------------------------ */

const { updateComponentStatus } = await import(
    pathToFileURL(join(ROOT, 'web/saus_browser/js/models.js')).href
);
const { state } = await import(
    pathToFileURL(join(ROOT, 'web/saus_browser/js/state.js')).href
);
state.MODELS_DATA = {
    [VAE]: { name: 'Flux2 VAE', url: 'https://example.invalid/vae.safetensors', directory: 'vae', type: 'VAE' },
    [OTHER]: { name: 'Qwen 3 4B', url: '', directory: 'text_encoders', type: 'TEXT ENCODER' },
};

/* 1. installed: every card of that model, and only that model */
{
    updateComponentStatus(VAE, 'ready');

    for (const [where, card] of vaeCards) {
        assert.ok(card.classes.has('required-installed'), where + ' should show the model installed');
        assert.match(card.actions.innerHTML, /data-action="delete-model"/,
            where + ' should offer to uninstall it');
    }
    assert.ok(!otherA.classes.has('required-installed'), 'another model is untouched');
    assert.equal(otherA.actions.innerHTML, '', 'its card was not repainted at all');
    assert.ok(!otherA.classes.has('required-missing'), 'and it was not marked missing either');
    console.log('1. an installed model updates every card that lists it: OK');
}

/* 2. deleted: all of them go back to red */
{
    updateComponentStatus(VAE, 'missing');

    for (const [where, card] of vaeCards) {
        assert.ok(card.classes.has('required-missing'), where + ' should be red again');
        assert.ok(!card.classes.has('required-installed'), where + ' is not installed any more');
        assert.match(card.actions.innerHTML, /data-action="download-model"/,
            where + ' should offer to install it');
    }
    console.log('2. deleting it turns every one of those cards red: OK');
}

/* 3. downloading: progress everywhere, and the cards stay red */
{
    updateComponentStatus(VAE, 'downloading', 42);

    for (const [where, card] of vaeCards) {
        assert.match(card.actions.innerHTML, /Downloading 42%/, where + ' should show the progress');
        assert.match(card.actions.innerHTML, /width:42%/, where + ' should show the bar');
        assert.ok(card.classes.has('required-missing'), where + ' stays red while it downloads');
        assert.ok(!card.classes.has('required-installed'), where + ' is not installed yet');
    }
    console.log('3. a progress tick reaches every card and keeps them red: OK');
}

/* 4. a model nobody lists is ignored, not fatal */
{
    updateComponentStatus('not-in-this-app.safetensors', 'ready');
    updateComponentStatus('', 'ready');
    assert.ok(vaeCards.every(([, card]) => card.classes.has('required-missing')),
        'the cards are unchanged');
    console.log('4. an unknown or empty model id changes nothing: OK');
}

console.log('\nmodel status cards: all scenarios passed');
