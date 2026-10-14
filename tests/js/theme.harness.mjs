/**
 * Headless harness for web/core/js/common/scripts/theme.js.
 *
 * The controller has no dependencies, so stubbing localStorage / document /
 * window is enough to check the rules that matter:
 *   - the default is Night,
 *   - a choice is applied to <html data-theme> and remembered,
 *   - an unknown id is refused and changes nothing,
 *   - ?theme= (used when a page embeds another) wins over what is remembered,
 *     but is never persisted,
 *   - a switch reaches the same-origin iframes and is skipped for other origins.
 *
 * Needs no browser: run it with ``node tests/js/theme.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const state = {
    stored: {},
    search: '',
    frames: [],
    parent: null,
};

const stubDocument = (label) => ({
    label,
    documentElement: { dataset: {} },
    querySelectorAll: () => state.frames,
});

globalThis.localStorage = {
    getItem: (key) => (key in state.stored ? state.stored[key] : null),
    setItem: (key, value) => { state.stored[key] = String(value); },
};
globalThis.window = {
    get location() { return { search: state.search }; },
    get parent() { return state.parent; },
};
globalThis.document = stubDocument('page');

const theme = await import(pathToFileURL(join(ROOT, 'web/core/js/common/scripts/theme.js')).href);

const dataset = () => globalThis.document.documentElement.dataset;
const stored = () => state.stored.SausTheme;

function reset(overrides = {}) {
    state.stored = {};
    state.search = '';
    state.frames = [];
    state.parent = null;
    Object.assign(state, overrides);
    globalThis.document = stubDocument('page');
}

/* 1. three themes, Night by default */
{
    reset();
    assert.deepEqual(theme.THEMES.map((entry) => entry.id), ['night', 'day', 'fire']);
    theme.THEMES.forEach((entry) => {
        assert.ok(entry.label, `${entry.id} needs a label for the picker`);
        assert.ok(entry.hint, `${entry.id} needs a hint for the picker`);
    });
    assert.equal(theme.DEFAULT_THEME, 'night');
    assert.ok(theme.THEMES.some((entry) => entry.id === theme.DEFAULT_THEME));

    assert.equal(theme.currentTheme(), 'night', 'with nothing remembered, Night is the default');
    assert.equal(theme.initTheme(), 'night');
    assert.equal(dataset().theme, 'night');
    console.log('1. Night is the default: OK');
}

/* 2. choosing a theme shows it and remembers it */
{
    reset();
    assert.equal(theme.applyTheme('day'), true);
    assert.equal(dataset().theme, 'day');
    assert.equal(stored(), 'day', 'the choice is remembered');
    assert.equal(theme.currentTheme(), 'day');

    assert.equal(theme.applyTheme('fire'), true);
    assert.equal(dataset().theme, 'fire');
    assert.equal(stored(), 'fire');
    console.log('2. a choice is applied and remembered: OK');
}

/* 3. an unknown theme changes nothing */
{
    reset({ stored: { SausTheme: 'day' } });
    assert.equal(theme.applyTheme('purple'), false);
    assert.equal(theme.isTheme('purple'), false);
    assert.equal(stored(), 'day', 'the remembered choice is untouched');
    assert.equal(dataset().theme, undefined, 'and nothing is applied');
    console.log('3. an unknown theme is refused: OK');
}

/* 4. ?theme= wins (that is how a page hands its theme to what it embeds) */
{
    reset({ stored: { SausTheme: 'day' }, search: '?embed=1&theme=fire' });
    assert.equal(theme.currentTheme(), 'fire');
    assert.equal(theme.initTheme(), 'fire');
    assert.equal(dataset().theme, 'fire');

    reset({ stored: { SausTheme: 'day' }, search: '?theme=nonsense' });
    assert.equal(theme.currentTheme(), 'day', 'a nonsense parameter falls back to what is remembered');
    console.log('4. ?theme= wins, and never persists: OK');
}

/* 5. a switch reaches same-origin iframes, and leaves other origins alone */
{
    reset();
    const inner = stubDocument('embedded app');
    const crossOrigin = { get contentDocument() { throw new Error('SecurityError'); } };
    const parentDocument = stubDocument('the shell this page is embedded in');
    state.frames = [
        { contentDocument: inner },
        crossOrigin,
        { contentDocument: null },      // not loaded yet
    ];
    state.parent = { document: parentDocument };

    const synced = theme.syncFrames('fire');

    assert.equal(inner.documentElement.dataset.theme, 'fire', 'the app tab follows the theme');
    assert.equal(parentDocument.documentElement.dataset.theme, 'fire',
        'and so does the page this one is embedded in (the File Manager in a tab)');
    assert.equal(synced, 2, 'only the frames that could be reached are counted');
    console.log('5. frames sync, other origins are skipped: OK');
}

/* 6. a blocked storage (private mode) still works, it just cannot remember */
{
    reset();
    const realSetItem = localStorage.setItem;
    localStorage.setItem = () => { throw new Error('QuotaExceededError'); };

    assert.equal(theme.applyTheme('day'), true, 'the theme still applies');
    assert.equal(dataset().theme, 'day');
    assert.equal(theme.storedTheme(), null, 'nothing to remember');
    assert.equal(theme.currentTheme(), 'night', 'so the default is what comes back');

    localStorage.setItem = realSetItem;
    console.log('6. blocked storage degrades to the default: OK');
}

console.log('\ntheme: all scenarios passed');
