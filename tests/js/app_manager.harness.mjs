/**
 * Headless harness for web/saus_browser/js/app_manager.js (the App Manager).
 *
 * The manager lists the apps the panel may offer, in a box per subcategory, with a
 * display switch per app. It launches nothing: a click anywhere on a row (name,
 * thumbnail, status dot) must do nothing at all - opening an app is the explorer's
 * job - while the switch toggles visibility and stores it. This checks both, plus
 * the filing and the deprecated gate.
 *
 * Needs no browser: document / localStorage / fetch are stubbed, with bubbling, so a
 * click on a child reaches the row exactly as it does in a browser. Run it with
 * ``node tests/js/app_manager.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
register('./_root_paths_loader.mjs', import.meta.url);

function matchesSimple(node, part) {
    if (!part) return false;
    if (part.startsWith('.')) return node.classes.has(part.slice(1));
    const attr = part.match(/^\[data-([\w-]+)="?([^"\]]*)"?\]$/);
    if (attr) {
        const key = attr[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
        return String(node.dataset[key] ?? '') === attr[2];
    }
    return node.tag === part.toLowerCase();
}

/** One "simple descendant" selector ("a b") is enough for this harness. */
function matches(node, selector) {
    return selector.split(',').some((raw) => {
        const parts = raw.trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return false;
        if (!matchesSimple(node, parts[parts.length - 1])) return false;

        let current = node.parent;
        for (let index = parts.length - 2; index >= 0; index -= 1) {
            while (current && !matchesSimple(current, parts[index])) current = current.parent;
            if (!current) return false;
            current = current.parent;
        }
        return true;
    });
}

function makeNode(tag = 'div') {
    const node = {
        tag,
        id: '', title: '', type: '', value: '', checked: false, textContent: '', innerHTML: '',
        style: {}, dataset: {}, attributes: {}, children: [], parent: null, listeners: {},
        classes: new Set(),
        setAttribute(name, value) { node.attributes[name] = String(value); },
        appendChild(child) { child.parent = node; node.children.push(child); return child; },
        append(...children) { children.forEach((child) => node.appendChild(child)); },
        addEventListener(type, handler) {
            (node.listeners[type] = node.listeners[type] || []).push(handler);
        },
        removeEventListener(type, handler) {
            node.listeners[type] = (node.listeners[type] || []).filter(h => h !== handler);
        },
        fire(type, extra = {}) {
            (node.listeners[type] || []).slice()
                .forEach(handler => handler({ preventDefault() {}, ...extra }));
        },
        closest(selector) {
            for (let current = node; current; current = current.parent) {
                if (matches(current, selector)) return current;
            }
            return null;
        },
        querySelectorAll(selector) {
            const found = [];
            const walk = (current) => {
                current.children.forEach((child) => {
                    if (matches(child, selector)) found.push(child);
                    walk(child);
                });
            };
            walk(node);
            return found;
        },
        querySelector(selector) { return node.querySelectorAll(selector)[0] || null; },
        focus() {},
        remove() {
            if (node.parent) node.parent.children = node.parent.children.filter(c => c !== node);
        },
        getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0 }; },
    };
    Object.defineProperty(node, 'className', {
        get: () => [...node.classes].join(' '),
        set: (value) => { node.classes = new Set(String(value).split(/\s+/).filter(Boolean)); },
    });
    node.classList = {
        add: (...names) => names.forEach(name => node.classes.add(name)),
        remove: (...names) => names.forEach(name => node.classes.delete(name)),
        contains: (name) => node.classes.has(name),
        toggle: (name, force) => {
            const on = force === undefined ? !node.classes.has(name) : !!force;
            if (on) node.classes.add(name); else node.classes.delete(name);
            return on;
        },
    };
    return node;
}

/** A real click bubbles: the target first, then each ancestor, until stopped. */
function click(node) {
    const event = {
        target: node,
        stopped: false,
        preventDefault() {},
        stopPropagation() { event.stopped = true; },
    };
    for (let current = node; current && !event.stopped; current = current.parent) {
        (current.listeners.click || []).slice().forEach(handler => handler(event));
    }
    return event;
}

const documentListeners = {};
globalThis.document = {
    createElement: (tag) => makeNode(tag),
    createTextNode: (text) => {
        const node = makeNode('#text');
        node.textContent = String(text);
        return node;
    },
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    body: makeNode('body'),
    addEventListener: (type, handler) => {
        (documentListeners[type] = documentListeners[type] || []).push(handler);
    },
    removeEventListener: (type, handler) => {
        documentListeners[type] = (documentListeners[type] || []).filter(h => h !== handler);
    },
    dispatchEvent: (event) => {
        (documentListeners[event.type] || []).slice().forEach(handler => handler(event));
        return true;
    },
};
globalThis.CustomEvent = class {
    constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
};
globalThis.window = globalThis;
// The breadcrumb reveals itself on the next frame; the stub can just call it.
globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);

const storage = new Map();
globalThis.localStorage = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
};

const posts = [];
globalThis.fetch = async (url, options = {}) => {
    posts.push({ url, options });
    const body = options.body ? JSON.parse(options.body) : {};
    return {
        ok: true,
        json: async () => (options.method === 'POST'
            ? { hiddenAppIds: body.hiddenAppIds || [] }
            : { hiddenAppIds: [] }),
    };
};

/* ------------------------------------------------------------------ *
 * Fixtures: two subcategories, one deprecated app, one to switch off
 * ------------------------------------------------------------------ */

const { state } = await import(pathToFileURL(join(ROOT, 'web', 'saus_browser', 'js', 'state.js')));
const { mountAppManager } = await import(
    pathToFileURL(join(ROOT, 'web', 'saus_browser', 'js', 'app_manager.js')));

state.allApps = [
    { id: 'a1', url: 'app-one', name: 'App One', category: 'text-to-image', metadata: { models: [] } },
    { id: 'a2', url: 'app-two', name: 'App Two', category: 'text-to-image', metadata: { models: [] } },
    { id: 'b1', url: 'app-three', name: 'App Three', category: 'text-to-video', metadata: { models: [] } },
    { id: 'old1', url: 'old-app', name: 'Old App', category: 'text-to-video', deprecated: true, metadata: { models: [] } },
];
state.TAXONOMY = {
    sections: [{ id: 'AI Image', icon: 'fas fa-image' }, { id: 'AI Video', icon: 'fas fa-video' }],
    categories: [
        { id: 'text-to-image', label: 'text-to-image', section: 'AI Image', order: 0 },
        { id: 'text-to-video', label: 'text-to-video', section: 'AI Video', order: 1 },
    ],
};
state.MODELS_DATA = {};
state.ARCHITECTURES = {};

const host = makeNode('div');
mountAppManager(host);

const opens = [];
document.addEventListener('saus:open-app', (event) => opens.push(event.detail));

/* 1. the filing */
const groups = host.querySelectorAll('.manager-subgroup');
assert.equal(groups.length, 2, 'one box per subcategory');
assert.deepEqual(groups.map(g => g.querySelector('.manager-group-title').textContent),
    ['text-to-image', 'text-to-video'], 'in section / taxonomy order');
assert.equal(host.querySelectorAll('.app-row').length, 3, 'the deprecated app is not listed');
assert.ok(host.querySelector('.manager-section-title'), 'the section heading is there');
assert.equal(host.querySelectorAll('.manager-grid').length, 2, 'each group is a grid of its own');
assert.ok(!host.querySelector('.manager-hint'), 'and no hint line');
console.log('1. section -> subcategory groups, deprecated gate: OK');

/* 2. the manager launches nothing: only the (i) opens a panel, the switch hides */
const row = host.querySelectorAll('.app-row').find(r => r.dataset.appId === 'a2');
click(row.querySelector('.app-row-name'));
click(row.querySelector('.app-row-thumb'));
click(row.querySelector('.app-row-dot'));
assert.equal(opens.length, 0, 'no row click opens the app - the manager is not the explorer');
console.log('2. a row click opens nothing: OK');

/* 3. the switch toggles visibility, and opens nothing */
const toggle = row.querySelector('.manager-switch');
click(toggle.querySelector('.manager-switch-track'));
assert.equal(opens.length, 0, 'the switch does not open the app either');

const input = toggle.querySelector('input');
input.checked = false;
input.fire('change');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(state.hiddenAppIds.has('a2'), true, 'the app is hidden');
assert.ok(posts.some(p => p.options.method === 'POST' && p.options.body.includes('a2')),
    'and the list is stored on the server');
console.log('3. the switch hides without opening: OK');

/* 4. "Show all": greyed while everything is shown, one write when it is not */
const showAll = host.querySelector('.manager-showall input');
assert.equal(showAll.checked, false, 'one app is hidden, so Show all is off');
assert.equal(showAll.disabled, false, 'and it can be used');

showAll.checked = true;
showAll.fire('change');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(state.hiddenAppIds.size, 0, 'turning it on shows every app');
assert.ok(posts.some(p => p.options.method === 'POST' && p.options.body.includes('"hiddenAppIds":[]')),
    'in one write, not one per app');
assert.equal(row.querySelector('.manager-switch input').checked, true, 'and the row switch came back on');
assert.equal(showAll.disabled, true, 'with nothing hidden it is greyed out');
assert.ok(showAll.closest('.manager-showall').classes.has('manager-showall-disabled'),
    'and marked so for the stylesheet');
console.log('4. Show all: one write, then greyed out: OK');

console.log('app-manager harness: 4/4 OK');
