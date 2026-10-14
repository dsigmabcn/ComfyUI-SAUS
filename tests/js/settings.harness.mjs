/**
 * Headless harness for web/core/js/common/components/settings.js.
 *
 * The Settings tab is the only place the theme picker, the installed version
 * and the project links live, so this checks what it renders and that the
 * version really lands in the DOM (it is fetched, not baked in).
 *
 * Needs no browser: document / localStorage / fetch are stubbed. Run it with
 * ``node tests/js/settings.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const state = { stored: {}, styles: [], version: '9.9.9', fail: false };

const element = () => ({
    id: '',
    innerHTML: '',
    textContent: '',
    style: {},
    classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {},
    appendChild() {},
    remove() {},
});

globalThis.localStorage = {
    getItem: (key) => state.stored[key] ?? null,
    setItem: (key, value) => { state.stored[key] = String(value); },
};
globalThis.window = { location: { search: '', origin: 'http://localhost:8188' }, parent: null };
globalThis.document = {
    documentElement: { dataset: {} },
    head: { appendChild: (node) => state.styles.push(node) },
    createElement: () => element(),
    getElementById: (id) => state.styles.find((node) => node.id === id) ?? null,
    querySelector: () => null,
    body: { appendChild() {} },
};
globalThis.fetch = async () => {
    if (state.fail) throw new Error('offline');
    return { ok: true, status: 200, json: async () => ({ version: state.version }) };
};

const { SettingsComponent } = await import(
    pathToFileURL(join(ROOT, 'web/core/js/common/components/settings.js')).href
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A stand-in for the settings pane: records the markup, hands out one node. */
function pane() {
    const versionNode = element();
    const view = element();
    view.queried = [];
    view.querySelector = (selector) => { view.queried.push(selector); return versionNode; };
    view.querySelectorAll = () => [];
    view.versionNode = versionNode;
    return view;
}

/* 1. the three sections, and the version arriving from the API */
const component = new SettingsComponent('#host');
{
    state.version = '9.9.9';
    state.fail = false;
    state.styles = [];

    const view = pane();
    component.render(view);

    assert.match(view.innerHTML, /<h2>Theme<\/h2>/, 'the theme picker is there');
    assert.match(view.innerHTML, /class="theme-options"/);
    assert.match(view.innerHTML, /<h2>Version<\/h2>/, 'the Version section is there');
    assert.match(view.innerHTML, /<h2>Social<\/h2>/, 'the Social section is there');
    assert.match(view.innerHTML, /id="saus-version"/);

    const links = view.innerHTML.match(/target="_blank"/g) || [];
    assert.equal(links.length, 3, 'ko-fi, GitHub and YouTube');
    for (const host of ['ko-fi.com', 'github.com/dsigmabcn/ComfyUI-SAUS', 'youtube.com/@koalanation']) {
        assert.ok(view.innerHTML.includes(host), `the Social section is missing ${host}`);
    }
    assert.ok(!/#[0-9a-fA-F]{3,8}/.test(view.innerHTML), 'the pane must not hardcode a colour');
    assert.equal(state.styles.length, 1, 'its styles are injected once');

    assert.match(view.innerHTML, /id="saus-version">…<\/strong>/,
        'shown as pending in the markup until it arrives');
    await sleep(0);
    assert.equal(view.versionNode.textContent, '9.9.9', 'and then filled in from the API');
    console.log('1. Theme / Version / Social sections render, version is fetched: OK');
}

/* 2. rendering the same pane again reuses the version and the styles */
{
    const view = pane();
    component.render(view);

    assert.equal(state.styles.length, 1, 'no duplicate <style> element');
    assert.match(view.innerHTML, /9\.9\.9/, 'the known version is rendered straight away');
    assert.equal(view.versionNode.textContent, '9.9.9');
    console.log('2. re-rendering reuses the version and the styles: OK');
}

/* 3. an unreachable version endpoint is reported, not thrown */
{
    state.fail = true;
    const view = pane();
    new SettingsComponent('#host').render(view);

    await sleep(0);
    assert.equal(view.versionNode.textContent, 'unknown');
    console.log('3. an unavailable version shows as unknown: OK');
}

console.log('\nsettings: all scenarios passed');
