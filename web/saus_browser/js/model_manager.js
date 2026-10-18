/**
 * The Model Manager: every file in the registry, with what is installed, who needs
 * it, and the same install / uninstall actions the app details panel offers.
 *
 * Nothing is implemented twice here: the rows are the `.component-item` markup
 * models.js already paints, the buttons go through its `handleModelActionClick`, and
 * download progress arrives from the shell's websocket through `updateComponentStatus`
 * - which repaints every row listing that file, in whichever view it sits.
 */
import { state } from './state.js';
import { appThumbSrc, APP_THUMB_FALLBACK } from './ui.js';
import {
    handleModelActionClick, statusEntry, fetchModelStatuses, applyStatusToItem,
    downloadProgressOf, prettyType, escapeHtml, subscribeStatusChanges,
} from './models.js';

const FILTERS = [
    { id: 'all', label: 'All models' },
    { id: 'installed', label: 'Installed' },
    { id: 'missing', label: 'Not installed' },
    { id: 'unused', label: 'Unused' },
];

// How many apps a card names before it counts the rest (the tooltip has them all).
const APP_CHIPS_SHOWN = 5;

let host = null;
let filter = 'all';
// The model's own kind ("Diffusion model", "VAE", ...): the registry's type field.
let typeFilter = 'all';
// file -> 'ready' | 'missing', the last answer the server gave. Filtering by state
// needs it *before* painting, so it is fetched for the whole registry on mount.
let statuses = new Map();

function createElement(tag, className, textContent = '') {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = textContent;
    return element;
}

/** Every registry file, alphabetically. */
function registryFiles() {
    return Object.keys(state.MODELS_DATA || {}).sort((a, b) => a.localeCompare(b));
}

/**
 * Who needs each file: the apps (their `metadata.models`) and *how many* the
 * architectures name (their model groups, variant picks and variant LoRAs).
 *
 * Apps are kept whole - the cards show their name and thumbnail - while the
 * architectures are only counted, never shown: they are what keeps a file out of
 * the Unused chip when no app lists it.
 *
 * Built on every render: it is a walk over ~45 apps and ~30 architectures, and a
 * rebuild is cheaper to reason about than an invalidation rule.
 */
function usageIndex() {
    const used = new Map();
    const note = (file, value, kind) => {
        if (!file || !value) return;
        if (!used.has(file)) used.set(file, { apps: [], architectures: [] });
        const entry = used.get(file);
        if (kind === 'app') {
            if (!entry.apps.some(app => app.id === value.id)) entry.apps.push(value);
        } else if (!entry.architectures.includes(value)) {
            entry.architectures.push(value);
        }
    };

    state.allApps.forEach((app) => {
        (((app.metadata || {}).models) || []).forEach(file => note(file, app, 'app'));
    });

    Object.entries(state.ARCHITECTURES || {}).forEach(([name, arch]) => {
        (((arch || {}).models) || []).forEach((group) => {
            ((group.files) || []).forEach(file => note(file.file, name, 'arch'));
        });
        Object.values(((arch || {}).variants) || {}).forEach((variant) => {
            Object.values((variant.pick) || {}).forEach(file => note(file, name, 'arch'));
            (variant.loras || []).forEach(file => note(file, name, 'arch'));
        });
    });

    return used;
}

/** The apps that need a file: a thumbnail and the name, then a count for the rest. */
function appChips(usage) {
    const wrap = createElement('div', 'manager-apps');
    const apps = (usage && usage.apps) || [];
    if (!apps.length) {
        wrap.appendChild(createElement('span', 'manager-uses-empty', 'Used by no app.'));
        return wrap;
    }

    apps.slice(0, APP_CHIPS_SHOWN).forEach((app) => {
        const chip = createElement('span', 'manager-app');
        chip.title = app.name || app.url;

        const thumb = document.createElement('img');
        thumb.className = 'manager-app-thumb';
        thumb.alt = '';
        thumb.loading = 'lazy';
        thumb.decoding = 'async';
        const onThumbError = () => {
            thumb.removeEventListener('error', onThumbError);
            thumb.src = APP_THUMB_FALLBACK;
        };
        thumb.addEventListener('error', onThumbError);
        thumb.src = appThumbSrc(app);

        chip.appendChild(thumb);
        chip.appendChild(document.createTextNode(app.name || app.url));
        wrap.appendChild(chip);
    });

    const rest = apps.length - APP_CHIPS_SHOWN;
    if (rest > 0) {
        const more = createElement('span', 'manager-app manager-app-more', `+${rest}`);
        more.title = apps.map(app => app.name || app.url).join(', ');
        wrap.appendChild(more);
    }
    return wrap;
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

/** One registry file as a `.component-item`, so the shared painting applies to it. */
function modelRow(file, usage) {
    const model = state.MODELS_DATA[file] || {};

    const item = document.createElement('div');
    item.className = 'component-item manager-model-row';
    item.dataset.fileId = file;
    // 'compulsory': the red / green marking the app details panel uses for a file
    // that cannot be missing, which is what every registry entry is here.
    item.dataset.listType = 'compulsory';

    // The model and its install state (the actions models.js paints) ...
    const main = createElement('div', 'manager-model-main');
    main.appendChild(createElement('span', 'component-name', model.name || file));
    main.appendChild(createElement('span', 'manager-meta', [
        prettyType(typeOf(file)),
        model.directory ? `${model.directory}/` : '',
        model.url ? '' : 'no download URL',
    ].filter(Boolean).join(' · ')));
    item.appendChild(main);

    // ... its Install / Uninstall button (or progress bar), top right ...
    item.appendChild(createElement('div', 'component-actions'));

    // ... and the apps that need it, each as a thumbnail and its name.
    const uses = createElement('div', 'manager-model-uses');
    uses.appendChild(createElement('span', 'manager-uses-label', 'Used by'));
    uses.appendChild(appChips(usage));
    item.appendChild(uses);

    return item;
}

/* ------------------------------------------------------------------ *
 * Render
 * ------------------------------------------------------------------ */

function statusOf(file) {
    // Unknown counts as missing on purpose: it offers Install, and the download route
    // answers "already installed" without fetching anything when the file is there.
    return statuses.get(file) || 'missing';
}

function visibleFiles(files, usage) {
    const byType = matchesType;
    if (filter === 'installed') return files.filter(file => byType(file) && statusOf(file) === 'ready');
    if (filter === 'missing') return files.filter(file => byType(file) && statusOf(file) !== 'ready');
    if (filter === 'unused') return files.filter(file => byType(file) && !usage.has(file));
    return files.filter(byType);
}

/** The registry type of a file, as the filter and the rows label it. */
function typeOf(file) {
    return ((state.MODELS_DATA[file] || {}).type) || 'Model';
}

function matchesType(file) {
    return typeFilter === 'all' || typeOf(file) === typeFilter;
}

function render() {
    if (!host) return;

    const usage = usageIndex();
    const files = registryFiles();
    const shown = visibleFiles(files, usage);
    const known = statuses.size > 0;
    // The state chips count within the chosen type, and the type chips across all
    // states: either chip row answers "what would I see", never "what is there".
    const typeScoped = files.filter(matchesType);
    const missing = typeScoped.filter(file => statusOf(file) !== 'ready').length;
    const unused = typeScoped.filter(file => !usage.has(file)).length;

    host.innerHTML = '';

    const head = createElement('div', 'manager-head');
    head.appendChild(createElement('h2', 'manager-title', 'Model Manager'));
    head.appendChild(createElement('span', 'manager-count', [
        `${files.length} model${files.length === 1 ? '' : 's'}`,
        known ? (missing ? `${missing} not installed` : 'all installed') : 'checking…',
        known && unused ? `${unused} unused` : '',
    ].filter(Boolean).join(' · ')));
    host.appendChild(head);

    host.appendChild(createElement('p', 'manager-hint',
        "Install and uninstall here or from an app's (i) panel - both use the same model folders."));

    const counts = {
        all: typeScoped.length,
        installed: typeScoped.length - missing,
        missing,
        unused,
    };
    const bar = createElement('div', 'manager-filters');
    FILTERS.forEach((entry) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `manager-chip${filter === entry.id ? ' active' : ''}`;
        button.appendChild(document.createTextNode(entry.label));
        button.appendChild(createElement('span', 'manager-chip-count',
            known ? String(counts[entry.id]) : '…'));
        button.addEventListener('click', () => { filter = entry.id; render(); });
        bar.appendChild(button);
    });
    host.appendChild(bar);
    host.appendChild(typeBar(files));

    const list = createElement('div', 'manager-list');
    if (!shown.length) {
        list.appendChild(createElement('p', 'manager-empty', 'No model matches this filter.'));
    } else {
        const grid = createElement('div', 'manager-model-grid');
        shown.forEach(file => grid.appendChild(modelRow(file, usage.get(file))));
        list.appendChild(grid);
    }
    host.appendChild(list);

    paint();
}

/** The model's own kind: "All types" plus one chip per type in the registry. */
function typeBar(files) {
    const counts = new Map();
    files.forEach((file) => {
        const type = typeOf(file);
        counts.set(type, (counts.get(type) || 0) + 1);
    });

    const bar = createElement('div', 'manager-filters manager-categories');
    const entries = [['all', 'All types', files.length]].concat(
        Array.from(counts.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([type, count]) => [type, prettyType(type), count]),
    );

    entries.forEach(([id, label, count]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `manager-chip${typeFilter === id ? ' active' : ''}`;
        button.appendChild(document.createTextNode(label));
        button.appendChild(createElement('span', 'manager-chip-count', String(count)));
        button.addEventListener('click', () => { typeFilter = id; render(); });
        bar.appendChild(button);
    });
    return bar;
}

/** Ask the server about every registry file at once. */
async function loadStatuses() {
    const files = registryFiles();
    if (!files.length) return;
    statuses = await fetchModelStatuses(files.map(statusEntry));
}

/** Paint each row through the shared status / progress helpers. */
function paint() {
    if (!host) return;
    host.querySelectorAll('.component-item').forEach((item) => {
        const file = item.dataset.fileId;
        const progress = downloadProgressOf(file);
        const status = progress !== null ? 'downloading' : statusOf(file);
        applyStatusToItem(item, status, progress || 0);
    });
}

/* ------------------------------------------------------------------ *
 * Mount
 * ------------------------------------------------------------------ */

let listenersBound = false;

export function mountModelManager(container) {
    host = container;
    host.classList.add('manager-pane');
    // One delegated dispatcher for every Install / Uninstall button in the list.
    host.addEventListener('click', handleModelActionClick);

    if (!listenersBound) {
        listenersBound = true;
        // A download finishing anywhere drops the status cache and tells us, so the
        // counts and the filter stay honest; the rows themselves are repainted by the
        // shell through updateComponentStatus.
        subscribeStatusChanges(() => { loadStatuses().then(render); });
    }

    render();                     // the list and its chips, with '…' counts
    loadStatuses().then(render);  // then the real installed / missing state
}

/** The tab came forward: a download or a delete may have changed things since. */
export async function refreshModelManager() {
    if (!host) return;
    await loadStatuses();
    render();
}
