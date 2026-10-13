/**
 * Headless harness for web/core/js/common/components/widgets/Seeder.js.
 *
 * The R button is a switch - randomise the seed on every run, or keep the seed
 * in the field - so the class, aria-pressed and the tooltip all have to follow
 * the state (a switch nobody can read is the bug this covers). A short press
 * still draws a seed, a long press flips the switch, and a drawn seed has to
 * reach the workflow.
 *
 * Needs no browser: document is stubbed. Run it with
 * ``node tests/js/seeder.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ID = 'seedComp';

const elements = new Map();

function element(id) {
    const node = {
        id,
        innerHTML: '',
        textContent: '',
        value: '',
        title: '',
        style: {},
        attributes: {},
        classes: new Set(),
        listeners: {},
        classList: {
            add: (name) => node.classes.add(name),
            remove: (name) => node.classes.delete(name),
            toggle: (name, on) => (on ? node.classes.add(name) : node.classes.delete(name)),
            contains: (name) => node.classes.has(name),
        },
        setAttribute(name, value) {
            node.attributes[name] = String(value);
        },
        addEventListener(type, handler) {
            (node.listeners[type] = node.listeners[type] || []).push(handler);
        },
        fire(type, event = {}) {
            (node.listeners[type] || []).forEach((handler) =>
                handler({ preventDefault() {}, ...event })
            );
        },
    };
    return node;
}

globalThis.document = {
    getElementById: (id) => {
        if (!elements.has(id)) elements.set(id, element(id));
        return elements.get(id);
    },
    createElement: (tag) => element(tag),
};

const { default: Seeder } = await import(
    pathToFileURL(join(ROOT, 'web/core/js/common/components/widgets/Seeder.js')).href
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isOn = (button) => button.classes.has('active');

const workflow = {};
const seedOf = () => workflow?.[459]?.inputs?.seed;

new Seeder(
    { id: ID, label: 'Seed', nodePath: '459.inputs.seed', initialSeed: 42, increment: 1 },
    workflow
);

const button = document.getElementById(`${ID}RandomSeedButton`);
const input = document.getElementById(`${ID}Input`);

/* 1. random-each-run is the default, and it says so three ways */
{
    assert.ok(isOn(button), 'the default is randomising every run');
    assert.equal(button.attributes['aria-pressed'], 'true', 'and it is announced as pressed');
    assert.match(button.title, /^Random seed each run: ON/, 'the tooltip says what ON means');
    assert.equal(input.value, 42, 'the seed from the config is shown');
    assert.equal(seedOf(), 42, 'and written into the workflow');
    console.log('1. the default state is ON and reads as ON: OK');
}

/* 2. toggling flips every signal at once */
{
    button.fire('mousedown');
    await sleep(200); // longer than the long-press threshold
    button.fire('mouseup');

    assert.ok(!isOn(button), 'the switch is off');
    assert.equal(button.attributes['aria-pressed'], 'false', 'and announced as not pressed');
    assert.match(button.title, /^Random seed each run: OFF/, 'the tooltip says what OFF means');
    console.log('2. a long press flips the switch visibly: OK');
}

/* 3. a short press still draws a seed, even when randomising is off */
{
    const before = input.value;
    button.fire('mousedown');
    await sleep(20); // shorter than the long-press threshold
    button.fire('mouseup');

    assert.notEqual(input.value, before, 'a new seed is drawn on a short press');
    assert.equal(Number(input.value), seedOf(), 'and it lands in the workflow');
    assert.ok(!isOn(button), 'without flipping the switch');
    console.log('3. a short press draws a seed: OK');
}

/* 4. and back on again, so the state is not a one-way trip */
{
    button.fire('mousedown');
    await sleep(200);
    button.fire('mouseup');

    assert.ok(isOn(button), 'the switch is on again');
    assert.equal(button.attributes['aria-pressed'], 'true');
    assert.match(button.title, /ON/);
    console.log('4. the switch flips back on: OK');
}

console.log('\nseeder: all scenarios passed');
