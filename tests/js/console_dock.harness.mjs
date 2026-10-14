/**
 * Headless harness for web/saus_browser/js/console.js (the docked console).
 *
 * The dock floats over the bottom of the workspace and is resized by dragging the
 * divider on its top edge - and by nothing else. This checks that: the grip is
 * the only handle, the height is clamped to the workspace, it survives closing
 * and reopening, the arrow keys work, and closing stops the log polling.
 *
 * Needs no browser: document/window/localStorage are stubbed. Run it with
 * ``node tests/js/console_dock.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const MIN_HEIGHT = 160;    // must match MIN_DOCK_HEIGHT in console.js
const MIN_PANE = 120;      // must match MIN_PANE_HEIGHT in console.js

/* ------------------------------------------------------------------ *
 * A DOM small enough for the dock
 * ------------------------------------------------------------------ */

function makeNode(tag = 'div') {
    const node = {
        tag,
        id: '',
        className: '',
        innerHTML: '',
        title: '',
        type: '',
        checked: false,
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
        style: {},
        children: [],
        listeners: {},
        classes: new Set(),
        setAttribute(name, value) { node[name] = String(value); },
        appendChild(child) { node.children.push(child); return child; },
        addEventListener(type, handler) {
            (node.listeners[type] = node.listeners[type] || []).push(handler);
        },
        removeEventListener(type, handler) {
            const list = node.listeners[type] || [];
            const index = list.indexOf(handler);
            if (index >= 0) list.splice(index, 1);
        },
        fire(type, event = {}) {
            (node.listeners[type] || []).slice()
                .forEach((handler) => handler({ preventDefault() {}, button: 0, ...event }));
        },
        getBoundingClientRect() {
            const height = parseFloat(node.style.height) || 0;
            return { height, width: 1000, top: 0, left: 0, right: 1000, bottom: height };
        },
    };
    node.classList = {
        add: (name) => node.classes.add(name),
        remove: (name) => node.classes.delete(name),
        contains: (name) => node.classes.has(name),
        toggle: (name, on) => (on ? node.classes.add(name) : node.classes.delete(name)),
    };

    // Like the real thing: writing textContent throws the children away.
    let text = '';
    Object.defineProperty(node, 'textContent', {
        get: () => text,
        set: (value) => {
            text = String(value);
            node.children.length = 0;
        },
    });

    return node;
}

function walk(node) {
    return [node, ...node.children.flatMap(walk)];
}

function titled(node, title) {
    return walk(node).find((child) => child.title === title);
}

const nodes = new Map();
function register(node, id) {
    node.id = id;
    nodes.set(id, node);
    return node;
}

const documentListeners = {};

globalThis.document = {
    hidden: false,
    body: makeNode('body'),
    getElementById: (id) => nodes.get(id) || null,
    createElement: (tag) => makeNode(tag),
    createTextNode: (text) => ({ tag: '#text', textContent: String(text), children: [] }),
    addEventListener(type, handler) {
        (documentListeners[type] = documentListeners[type] || []).push(handler);
    },
    removeEventListener(type, handler) {
        const list = documentListeners[type] || [];
        const index = list.indexOf(handler);
        if (index >= 0) list.splice(index, 1);
    },
};

function fireDocument(type, event = {}) {
    (documentListeners[type] || []).slice()
        .forEach((handler) => handler({ preventDefault() {}, button: 0, ...event }));
}

const windowListeners = {};

globalThis.window = {
    innerHeight: 800,
    addEventListener(type, handler) {
        (windowListeners[type] = windowListeners[type] || []).push(handler);
    },
    removeEventListener() {},
};

function fireWindow(type, event = {}) {
    (windowListeners[type] || []).slice().forEach((handler) => handler(event));
}

const store = new Map();
const DOCK_KEY = 'saus.consoleDock.v1';

globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
};

let fetches = 0;
globalThis.fetch = async () => {
    fetches += 1;
    return { ok: true, status: 200, json: async () => ({ logs: 'line one\nline two' }) };
};

const timers = new Map();
let timerSeq = 0;
globalThis.setInterval = (handler, ms) => {
    timers.set(++timerSeq, { handler, ms, cleared: false });
    return timerSeq;
};
globalThis.clearInterval = (id) => {
    const timer = timers.get(id);
    if (timer) timer.cleared = true;
};

/* The workspace (the dock's parent), the dock, its grip and its body: the same
   tree index.html ships. */
const workspace = makeNode('section');
workspace.clientHeight = 800;
workspace.clientWidth = 1000;

const dock = register(makeNode('div'), 'consoleDock');
dock.classes.add('console-dock');
dock.classes.add('hidden');            // class="console-dock hidden"
dock.parentElement = workspace;

const grip = register(makeNode('div'), 'consoleDockGrip');
const dockBody = register(makeNode('div'), 'consoleDockBody');
dock.appendChild(grip);
dock.appendChild(dockBody);

// The dock's box: whatever the code set, or the CSS default (25% of the panes).
dock.getBoundingClientRect = () => {
    const height = parseFloat(dock.style.height) || workspace.clientHeight * 0.25;
    return {
        height,
        width: workspace.clientWidth,
        top: workspace.clientHeight - height,
        bottom: workspace.clientHeight,
        left: 0,
        right: workspace.clientWidth,
    };
};

const { toggleConsoleDock } = await import(
    pathToFileURL(join(ROOT, 'web/saus_browser/js/console.js')).href
);

const heightOf = () => dock.getBoundingClientRect().height;
const isOpen = () => !dock.classes.has('hidden');
const isResizing = () => document.body.classes.has('resizing-console');
const drag = (fromY, toY) => {
    grip.fire('mousedown', { clientY: fromY });
    fireDocument('mousemove', { clientY: toY });
};

/* 1. opening docks the pane and leaves the height to the CSS default */
{
    toggleConsoleDock();

    assert.ok(isOpen(), 'the console opens');
    assert.equal(dockBody.children.length, 1, 'the pane is mounted in the dock');
    assert.ok(titled(dockBody.children[0], 'Close the console'),
        'docked, the pane carries its own close button');
    assert.equal(dock.style.height, undefined, 'a panel nobody resized uses the CSS 25%');
    assert.equal(heightOf(), 200, 'which is a quarter of the workspace');
    console.log('1. opening docks the pane at the CSS default height: OK');
}

/* 2. the grip resizes - and only the grip */
{
    drag(700, 650);                    // 50px up: the dock grows by 50
    assert.equal(dock.style.height, '250px', 'dragging the divider up grows the dock');
    assert.ok(isResizing(), 'and the whole page wears the resize cursor meanwhile');
    fireDocument('mouseup');
    assert.ok(!isResizing(), 'released, the page goes back to normal');

    dockBody.fire('mousedown', { clientY: 700 });
    fireDocument('mousemove', { clientY: 500 });
    assert.equal(dock.style.height, '250px', 'the body is not a handle: only the division resizes');
    assert.ok(!isResizing(), 'and nothing started');
    console.log('2. only the divider resizes the dock: OK');
}

/* 3. the height is clamped to the workspace */
{
    drag(700, 2000);
    fireDocument('mouseup');
    assert.equal(dock.style.height, `${MIN_HEIGHT}px`, 'it cannot be dragged away entirely');

    drag(700, 0);
    fireDocument('mouseup');
    assert.equal(dock.style.height, `${workspace.clientHeight - MIN_PANE}px`,
        'and the panes always keep a strip of their own');
    console.log('3. the drag is clamped bottom and top: OK');
}

/* 4. the size is remembered, and re-clamped to a smaller workspace */
{
    assert.equal(JSON.parse(store.get(DOCK_KEY)).height, workspace.clientHeight - MIN_PANE,
        'the size is remembered on release');

    toggleConsoleDock();
    assert.ok(!isOpen(), 'closing hides the dock');
    assert.equal(dockBody.children.length, 0, 'and unmounts the pane');
    assert.ok([...timers.values()].every((timer) => timer.cleared),
        'closing stops the log polling');
    assert.ok(fetches > 0, 'after having polled, of course');

    workspace.clientHeight = 400;      // a much shorter window
    toggleConsoleDock();
    assert.equal(dock.style.height, `${400 - MIN_PANE}px`,
        'reopened, the remembered size is clamped to what is left');
    console.log('4. the size survives a close, clamped to the workspace: OK');
}

/* 5. the keyboard, and a window that keeps shrinking */
{
    workspace.clientHeight = 800;
    toggleConsoleDock();
    toggleConsoleDock();               // reopen at the remembered, re-clamped size
    assert.equal(dock.style.height, `${800 - MIN_PANE}px`, 'back to the remembered size');

    grip.fire('keydown', { key: 'ArrowDown' });
    assert.equal(dock.style.height, `${800 - MIN_PANE - 40}px`, 'ArrowDown shrinks it by a step');
    grip.fire('keydown', { key: 'ArrowUp' });
    assert.equal(dock.style.height, `${800 - MIN_PANE}px`, 'ArrowUp grows it back');
    assert.equal(JSON.parse(store.get(DOCK_KEY)).height, 800 - MIN_PANE,
        'and the keyboard saves the size too');

    workspace.clientHeight = 300;
    fireWindow('resize');
    assert.equal(dock.style.height, `${300 - MIN_PANE}px`,
        'shrinking the window drags the dock down with it');
    console.log('5. arrow keys resize, window resizes re-clamp: OK');
}

/* 6. and closing still stops the polling */
{
    toggleConsoleDock();
    assert.ok([...timers.values()].every((timer) => timer.cleared),
        'no interval is left running behind a closed console');
    console.log('6. a closed console leaves no polling behind: OK');
}

console.log('\nconsole dock: all scenarios passed');
