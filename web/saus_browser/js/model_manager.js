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
    downloadProgressOf, prettyType, escapeHtml, subscribeStatusChanges, variantBlocks,
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
        // Everything the app can need: what it declares, plus every file its variants
        // pick and every LoRA they add - the turbo / lightning LoRA of a variant is
        // named by the *architecture*, so `metadata.models` alone misses it.
        const files = new Set((((app.metadata || {}).models) || []));
        variantBlocks(app).forEach((block) => {
            block.entries.forEach((entry) => { if (entry.file) files.add(entry.file); });
        });
        files.forEach(file => note(file, app, 'app'));
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

/**
 * The apps that need a file: a thumbnail and the name, **filed by their category**
 * (the same filing the App Manager uses), then a count for the rest.
 */
function appChips(usage) {
    const wrap = createElement('div', 'manager-apps');
    const apps = (usage && usage.apps) || [];
    if (!apps.length) {
        wrap.appendChild(createElement('span', 'manager-uses-empty', 'Used by no app.'));
        return wrap;
    }

    const byCategory = new Map();
    apps.forEach((app) => {
        const id = ((app.metadata || {}).category) || '';
        if (!byCategory.has(id)) byCategory.set(id, []);
        byCategory.get(id).push(app);
    });

    // Filed by category, in taxonomy order - but the category is only in the tooltip:
    // the cards are already grouped by model kind, and a label per line was noise.
    orderedCategoryIds(byCategory).forEach((categoryId) => {
        const group = createElement('div', 'manager-app-list');
        const groupApps = byCategory.get(categoryId);
        const label = categoryId ? categoryLabel(categoryId) : '';

        groupApps.slice(0, APP_CHIPS_SHOWN).forEach((app) => group.appendChild(appChip(app, label)));

        const rest = groupApps.length - APP_CHIPS_SHOWN;
        if (rest > 0) {
            const more = createElement('span', 'manager-app manager-app-more', `+${rest}`);
            more.title = groupApps.map(app => app.name || app.url).join(', ');
            group.appendChild(more);
        }
        wrap.appendChild(group);
    });

    return wrap;
}

/** Taxonomy order first, then anything the vocabulary does not list yet. */
function orderedCategoryIds(byCategory) {
    const taxonomy = state.TAXONOMY || {};
    const order = new Map();
    (taxonomy.categories || []).forEach((category) => order.set(category.id, category.order ?? 0));
    return Array.from(byCategory.keys()).sort((a, b) => {
        const known = order.has(a) ? 0 : 1;
        const knownOther = order.has(b) ? 0 : 1;
        if (known !== knownOther) return known - knownOther;
        return (order.get(a) ?? 0) - (order.get(b) ?? 0) || a.localeCompare(b);
    });
}

function categoryLabel(categoryId) {
    const categories = ((state.TAXONOMY || {}).categories) || [];
    const found = categories.find(category => category.id === categoryId);
    return (found && found.label) || categoryId;
}

/** One app: its thumbnail, then its name. The category lives in the tooltip. */
function appChip(app, categoryLabelText = '') {
    const chip = createElement('span', 'manager-app');
    const name = app.name || app.url;
    const tooltip = categoryLabelText ? `${name} — ${categoryLabelText}` : name;
    chip.title = tooltip;

    const thumb = document.createElement('img');
    thumb.className = 'manager-app-thumb';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.decoding = 'async';
    thumb.title = tooltip;
    const onThumbError = () => {
        thumb.removeEventListener('error', onThumbError);
        thumb.src = APP_THUMB_FALLBACK;
    };
    thumb.addEventListener('error', onThumbError);
    thumb.src = appThumbSrc(app);

    chip.appendChild(thumb);
    chip.appendChild(document.createTextNode(name));
    return chip;
}

/* ------------------------------------------------------------------ *
 * Rows
 * ------------------------------------------------------------------ */

/**
 * One registry file. The `.component-item` *is* the card's top band, so the red /
 * green marking only ever covers the model and its buttons - the apps below sit on
 * the page's own background, whatever the theme.
 */
function modelRow(file, usage) {
    const model = state.MODELS_DATA[file] || {};

    const card = createElement('div', 'manager-model-card');

    const item = document.createElement('div');
    item.className = 'component-item manager-model-row';
    item.dataset.fileId = file;
    // 'compulsory': the red / green marking the app details panel uses for a file
    // that cannot be missing, which is what every registry entry is here.
    item.dataset.listType = 'compulsory';

    const main = createElement('div', 'manager-model-main');
    main.appendChild(createElement('span', 'component-name', model.name || file));
    // The kind is the section heading and the folder is only a lookup hint, so the
    // card carries one extra line only when there is something to say about it.
    if (!model.url) main.appendChild(createElement('span', 'manager-meta', 'no download URL'));
    item.appendChild(main);

    // Its Install / Uninstall button (or the progress bar), top right.
    item.appendChild(createElement('div', 'component-actions'));
    card.appendChild(item);

    // Below the band: the apps that need it, filed by their category.
    const uses = createElement('div', 'manager-model-uses');
    uses.appendChild(appChips(usage));
    card.appendChild(uses);

    return card;
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

/**
 * The models as one boxed group per kind - the way the App Manager files its
 * subcategories - so the registry reads as a handful of sections instead of one run.
 */
function appendTypeGroups(container, files, usage) {
    const byType = new Map();
    files.forEach((file) => {
        const type = typeOf(file);
        if (!byType.has(type)) byType.set(type, []);
        byType.get(type).push(file);
    });

    orderedTypes(byType).forEach((type) => {
        const block = createElement('section', 'manager-subgroup');

        const head = createElement('div', 'manager-group-head');
        head.appendChild(createElement('span', 'manager-group-title', prettyType(type)));
        head.appendChild(createElement('span', 'manager-group-count',
            String(byType.get(type).length)));
        block.appendChild(head);

        const grid = createElement('div', 'manager-model-grid');
        byType.get(type).forEach(file => grid.appendChild(modelRow(file, usage.get(file))));
        block.appendChild(grid);
        container.appendChild(block);
    });
}

/** The kinds, alphabetically by the label they are shown with. */
function orderedTypes(byType) {
    return Array.from(byType.keys()).sort((a, b) => prettyType(a).localeCompare(prettyType(b)));
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

    // Rebuilding the list must not send the reader back to the top of it.
    const previousList = host.querySelector('.manager-list');
    const scrollTop = previousList ? previousList.scrollTop : 0;

    host.innerHTML = '';

    const head = createElement('div', 'manager-head');
    head.appendChild(createElement('h2', 'manager-title', 'Model Manager'));
    head.appendChild(createElement('span', 'manager-count', [
        `${files.length} model${files.length === 1 ? '' : 's'}`,
        known ? (missing ? `${missing} not installed` : 'all installed') : 'checking…',
        known && unused ? `${unused} unused` : '',
    ].filter(Boolean).join(' · ')));
    host.appendChild(head);

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
        appendTypeGroups(list, shown, usage);
    }
    host.appendChild(list);
    list.scrollTop = scrollTop;

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
