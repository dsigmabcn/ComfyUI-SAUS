import {
    state, explorerState, loadExplorerState, isCategoryOpen, categoryKey,
    toggleCategoryOpen, setOpenSection, isPanelOpen,
} from './state.js';
import {
    filterCurrentApps, createAppRow, applyAppRowStatus, hasActiveFilters,
    renderTagsFilter, updateFilterBadge,
} from './ui.js';
import { getAppStatus, warmAppStatuses, setStatusChangeHandler } from './models.js';

const CATEGORY_ICONS = {
    "text-to-image": "fas fa-paint-brush",
    "image-to-image (editing)": "fas fa-cut",
    "image-to-image (reference)": "fas fa-images",
    "text-to-video": "fas fa-clapperboard",
    "image-to-video": "fas fa-film",
    "video-to-video": "fas fa-video",
    "tools": "fas fa-wrench",
    "other": "fas fa-th-large"
};

const CATEGORY_ORDER = [
    "text-to-image",
    "image-to-image (editing)",
    "image-to-image (reference)",
    "text-to-video",
    "image-to-video",
    "video-to-video",
    "tools",
    "other"
];

const SECTIONS_CONFIG = {
    "AI Image": {
        icon: "fas fa-image",
        categories: ["text-to-image", "image-to-image (editing)", "image-to-image (reference)"]
    },
    "AI Video": {
        icon: "fas fa-video",
        categories: ["text-to-video", "image-to-video", "video-to-video"]
    },
    "Other": {
        icon: "fas fa-shapes",
        categories: ["tools", "other"]
    }
};

/** The official ComfyUI mark (mono), drawn with currentColor so it follows the rail. */
const COMFYUI_LOGO_SVG = `
    <svg viewBox="0 0 520 520" width="24" height="24" aria-hidden="true" focusable="false">
        <path d="M176.484 428.831C168.649 428.831 162.327 425.919 158.204 420.412C153.966 414.755 152.861 406.857 155.171 398.749L164.447 366.178C165.187 363.585 164.672 360.794 163.059 358.636C161.446 356.483 158.921 355.216 156.241 355.216H129.571C121.731 355.216 115.409 352.308 111.289 346.802C107.051 341.14 105.946 333.242 108.258 325.134L140.124 213.748L143.642 201.51C148.371 184.904 165.62 171.407 182.097 171.407H214.009C217.817 171.407 221.167 168.868 222.215 165.183L232.769 128.135C237.494 111.545 254.742 98.048 271.219 98.048L339.468 97.9264L389.431 97.9221C397.268 97.9221 403.59 100.831 407.711 106.337C411.949 111.994 413.054 119.892 410.744 128L396.457 178.164C391.734 194.75 374.485 208.242 358.009 208.242L289.607 208.372H257.706C253.902 208.372 250.557 210.907 249.502 214.588L222.903 307.495C222.159 310.093 222.673 312.892 224.291 315.049C225.904 317.202 228.428 318.469 231.107 318.469C231.113 318.469 276.307 318.381 276.307 318.381H326.122C333.959 318.381 340.281 321.29 344.402 326.796C348.639 332.457 349.744 340.355 347.433 348.463L333.146 398.619C328.423 415.209 311.174 428.701 294.698 428.701L226.299 428.831H176.484Z" fill="currentColor"/>
    </svg>
`;

/** Tools that live at the bottom of the rail (kind: 'tool'). */
const RAIL_TOOLS = [
    { target: 'comfyui', svg: COMFYUI_LOGO_SVG, label: 'ComfyUI', title: 'Open ComfyUI in a new window' },
    { target: 'filemanager', icon: 'fas fa-folder', label: 'Files', title: 'File Manager' },
    { target: 'guide', icon: 'fas fa-circle-question', label: 'Guide', title: 'Open the user guide in a new window' },
    { target: 'console', icon: 'fas fa-terminal', label: 'Console', title: 'ComfyUI console logs, docked at the bottom' },
    { target: 'settings', icon: 'fas fa-cog', label: 'Settings', title: 'SAUS settings' },
];

// The rail only reacts to clicks: hovering an icon shows a tooltip and a
// highlight, but it never changes which section the panel is showing.

/** Build the section/category vocabulary from taxonomy.json, with fallbacks. */
function taxonomyConfig() {
    const tax = state.TAXONOMY || {};
    const cats = Array.isArray(tax.categories) ? tax.categories : [];
    const sections = Array.isArray(tax.sections) ? tax.sections : [];

    if (cats.length && sections.length) {
        const order = {};
        const icons = {};
        cats.forEach((c, i) => {
            order[c.id] = (typeof c.order === 'number') ? c.order : i;
            icons[c.id] = c.icon || CATEGORY_ICONS.other;
        });
        return {
            order,
            icons,
            sections: sections.map(s => ({
                id: s.id,
                icon: s.icon || 'fas fa-th-large',
                categories: cats.filter(c => c.section === s.id).map(c => c.id)
            }))
        };
    }

    const order = {};
    CATEGORY_ORDER.forEach((c, i) => { order[c] = i; });
    return {
        order,
        icons: CATEGORY_ICONS,
        sections: Object.keys(SECTIONS_CONFIG).map(k => ({
            id: k,
            icon: SECTIONS_CONFIG[k].icon,
            categories: SECTIONS_CONFIG[k].categories
        }))
    };
}

let callbacks = {};
let tooltipElement = null;
let tooltipTarget = null;

function debounce(fn, wait) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), wait);
    };
}

/* ------------------------------------------------------------------ *
 * Wiring (once). Rail, panel head and tree are re-rendered often, but
 * the listeners live on their containers, so nothing is bound twice.
 * ------------------------------------------------------------------ */

export function initExplorer(handlers = {}) {
    callbacks = handlers;
    loadExplorerState();

    const rail = document.getElementById('sideRail');
    const explorer = document.getElementById('explorer');

    if (rail) {
        rail.addEventListener('click', (event) => {
            const btn = event.target.closest('.rail-btn');
            if (!btn) return;
            if (btn.dataset.rail === 'section') toggleSection(btn.dataset.target);
            else if (callbacks.onTool) callbacks.onTool(btn.dataset.target);
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && isPanelOpen()) {
            setOpenSection(null);
            applyPanelState();
        }
    });

    // Opening an app hands the room to the workspace: the panel steps aside
    // (the rail stays, so one click brings it back).
    document.addEventListener('saus:app-activated', closePanel);

    if (explorer) {
        explorer.addEventListener('click', (event) => {
            const catHead = event.target.closest('.explorer-category-head');
            if (catHead) toggleCategoryNode(catHead.parentElement);
        });

        explorer.addEventListener('mouseover', (event) => {
            const row = event.target.closest('.app-row');
            if (!row || event.target.closest('button')) {
                hideTooltip();
                return;
            }
            showTooltipFor(row);
        });

        explorer.addEventListener('mouseout', (event) => {
            const row = event.target.closest('.app-row');
            if (!row) return;
            if (event.relatedTarget && row.contains(event.relatedTarget)) return;
            hideTooltip();
        });

        explorer.addEventListener('scroll', hideTooltip, { passive: true });
    }

    initializePanelFilters();

    // A download or a delete changes what is installed: repaint the dots we can
    // already answer, then re-check the rest. Without the warm-up the rows whose
    // cache was just dropped would sit on "checking" until the panel is rebuilt.
    setStatusChangeHandler(() => {
        refreshVisibleStatuses();
        warmVisibleStatuses();
    });
}

/* ------------------------------------------------------------------ *
 * Panel state: a click opens it on a section (clicking the same icon
 * again closes it), a hover switches it to another section.
 * ------------------------------------------------------------------ */

function toggleSection(sectionId) {
    if (!sectionId) return;

    if (explorerState.openSection === sectionId) {
        setOpenSection(null);            // same icon again: close the panel
    } else {
        setOpenSection(sectionId);       // open it, or move it to that section
    }

    renderExplorer();
    applyPanelState();
    warmVisibleStatuses();
}

/** Close the panel - the same as clicking the open section's rail icon again. */
export function closePanel() {
    if (!isPanelOpen()) return;
    setOpenSection(null);
    applyPanelState();
}

/**
 * Which section an app is filed under in the panel. Mirrors
 * categoriesForSection(): a category belongs to the section that lists it, and
 * one no section lists is filed under the last section, so an app can never
 * silently disappear.
 */
function sectionOfApp(app, cfg) {
    const sections = cfg.sections || [];
    const category = app.category || 'other';
    const owner = sections.find(section => (section.categories || []).includes(category));
    if (owner) return owner.id;
    const last = sections[sections.length - 1];
    return last ? last.id : null;
}


/**
 * The favourite apps, pinned in the panel head between the search field and
 * the section (category) name. Hidden while there are no favourites.
 *
 * Only the favourites of what the panel is *showing* appear: the open section
 * plus whatever search / tag filter is on. A favourite from another section
 * would otherwise be pinned above a tree it is not part of.
 */
function renderFavorites() {
    const section = document.getElementById('favoritesSection');
    const list = document.getElementById('favoritesList');
    if (!section || !list) return;

    const cfg = taxonomyConfig();
    const openSection = explorerState.openSection;
    const visible = new Set(filterCurrentApps().map(app => app.id));

    const apps = Array.from(state.favorites)
        .map(id => state.allApps.find(app => app.id === id))
        .filter(app => app && visible.has(app.id))
        .filter(app => !openSection || sectionOfApp(app, cfg) === openSection);

    section.classList.toggle('hidden', apps.length === 0);
    list.innerHTML = '';
    if (!apps.length) return;

    list.appendChild(appRows(apps));
}

function applyPanelState() {
    const shell = document.getElementById('appShell');
    shell?.classList.toggle('panel-hidden', !isPanelOpen());

    const title = document.getElementById('sidePanelTitle');
    if (title) {
        // While a search or tag filter is on, the tree becomes a flat result
        // list: the section (category) title no longer describes what is shown,
        // so it disappears.
        const filtering = hasActiveFilters();
        title.textContent = filtering ? '' : (explorerState.openSection || 'Apps');
        title.classList.toggle('hidden', filtering);
    }

    syncRailActive();
}

function syncRailActive() {
    document.querySelectorAll('#sideRail .rail-btn[data-rail="section"]').forEach(btn => {
        btn.classList.toggle('active', explorerState.openSection === btn.dataset.target);
    });
}

/* ------------------------------------------------------------------ *
 * Icon rail: the three sections on top, the tools at the bottom.
 * ------------------------------------------------------------------ */

function railButton({ target, kind, icon, svg, label, title }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rail-btn';
    btn.dataset.rail = kind;
    btn.dataset.target = target;
    btn.title = title || label;

    // A raw SVG logo (e.g. ComfyUI) or a Font Awesome icon class.
    let glyph;
    if (svg) {
        glyph = document.createElement('span');
        glyph.className = 'rail-icon-svg';
        glyph.innerHTML = svg;
    } else {
        glyph = document.createElement('i');
        glyph.className = icon;
    }
    const span = document.createElement('span');
    span.textContent = label;

    btn.appendChild(glyph);
    btn.appendChild(span);
    return btn;
}

export function renderRail() {
    const rail = document.getElementById('sideRail');
    if (!rail) return;
    rail.innerHTML = '';

    // The SAUS logo lives at the top of the rail (it used to be in the header).
    const logo = document.createElement('a');
    logo.className = 'rail-logo';
    logo.href = '/saus';
    logo.title = 'SAUS';
    const logoImg = document.createElement('img');
    logoImg.src = '/core/media/ui/saus_logo.png';
    logoImg.alt = 'SAUS';
    logo.appendChild(logoImg);
    rail.appendChild(logo);

    const cfg = taxonomyConfig();

    const sections = document.createElement('div');
    sections.className = 'rail-group rail-sections';
    cfg.sections.forEach(section => {
        sections.appendChild(railButton({
            target: section.id, kind: 'section', icon: section.icon,
            label: section.id, title: `${section.id} apps`,
        }));
    });
    rail.appendChild(sections);

    const spacer = document.createElement('div');
    spacer.className = 'rail-group grow';
    rail.appendChild(spacer);

    const tools = document.createElement('div');
    tools.className = 'rail-group rail-tools';
    RAIL_TOOLS.forEach(tool => tools.appendChild(railButton({ ...tool, kind: 'tool' })));
    rail.appendChild(tools);

    syncRailActive();
}

/* ------------------------------------------------------------------ *
 * Panel head: the search box and the tag chips (the panel owns them).
 * ------------------------------------------------------------------ */

function initializePanelFilters() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.querySelector('.clear-search');
    const tagsToggle = document.getElementById('tagsToggle');
    const tagsContainer = document.getElementById('tagsContainer');

    if (clearBtn) clearBtn.style.display = 'none';

    const applySearch = () => {
        state.searchTerm = searchInput ? searchInput.value : '';
        if (clearBtn) clearBtn.style.display = state.searchTerm ? 'inline' : 'none';
        updateFilterBadge();
        renderExplorer();
    };

    searchInput?.addEventListener('input', debounce(applySearch, 220));
    clearBtn?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        applySearch();
        searchInput?.focus();
    });

    tagsToggle?.addEventListener('click', () => {
        const hidden = tagsContainer?.classList.toggle('hidden');
        tagsToggle.classList.toggle('active', !hidden);
        if (!hidden) renderTagsFilter();
    });
}

/* ------------------------------------------------------------------ *
 * Tree: the subcategories of ONE section, each unfolding its apps.
 * ------------------------------------------------------------------ */

let forceExpand = false;

/** The subcategories of ``section`` that hold at least one visible app. */
function categoriesForSection(section, cfg) {
    const apps = filterCurrentApps();

    const byCategory = new Map();
    apps.forEach(app => {
        const category = app.category || 'other';
        if (!byCategory.has(category)) byCategory.set(category, []);
        byCategory.get(category).push(app);
    });

    const categories = [];
    (section.categories || []).forEach(catId => {
        const catApps = byCategory.get(catId) || [];
        if (catApps.length) {
            categories.push({
                id: catId,
                icon: cfg.icons[catId] || CATEGORY_ICONS.other,
                apps: catApps,
            });
        }
    });

    // A category no section lists (typo in an appConfig) is filed under the
    // last section, so an app can never silently disappear from the panel.
    // Only categories unknown to EVERY section count as orphans: a category of
    // another section belongs there, it must not be repeated here.
    const globallyKnown = new Set();
    cfg.sections.forEach(candidate => (candidate.categories || []).forEach(id => globallyKnown.add(id)));

    const lastSection = cfg.sections[cfg.sections.length - 1];
    if (lastSection && lastSection.id === section.id) {
        const orphans = [];
        byCategory.forEach((catApps, catId) => {
            if (!globallyKnown.has(catId)) {
                orphans.push({ id: catId, icon: cfg.icons[catId] || CATEGORY_ICONS.other, apps: catApps });
            }
        });
        orphans.sort((a, b) => a.id.localeCompare(b.id));
        categories.push(...orphans);
    }

    return categories;
}

function nodeHead({ className, icon, label, count, sectionId, categoryId }) {
    const head = document.createElement('div');
    head.className = className;
    head.dataset.section = sectionId;
    head.dataset.category = categoryId;

    const iconEl = document.createElement('i');
    iconEl.className = `${icon} node-icon`;

    const labelEl = document.createElement('span');
    labelEl.className = 'node-label';
    labelEl.textContent = label;

    const countEl = document.createElement('span');
    countEl.className = 'node-count';
    countEl.textContent = String(count);

    const chevron = document.createElement('i');
    chevron.className = 'fas fa-chevron-right node-chev';

    head.appendChild(iconEl);
    head.appendChild(labelEl);
    head.appendChild(countEl);
    head.appendChild(chevron);
    return head;
}

/** Rows for one list of apps, painted with whatever status is cached. */
function appRows(apps) {
    const fragment = document.createDocumentFragment();
    apps.forEach(app => {
        const row = createAppRow(app);
        applyAppRowStatus(row, state.statusCache.get(app.id) || null);
        fragment.appendChild(row);
    });
    return fragment;
}

function emptyNote(text) {
    const note = document.createElement('div');
    note.className = 'explorer-empty';
    note.textContent = text;
    return note;
}

function categoryNode(sectionId, category) {
    const open = forceExpand || isCategoryOpen(categoryKey(sectionId, category.id));

    const node = document.createElement('div');
    node.className = 'explorer-category' + (open ? ' open' : '');
    node.dataset.section = sectionId;
    node.dataset.category = category.id;

    node.appendChild(nodeHead({
        className: 'explorer-category-head',
        icon: category.icon,
        label: category.id,
        count: category.apps.length,
        sectionId,
        categoryId: category.id,
    }));

    const body = document.createElement('div');
    body.className = 'explorer-category-body';
    body.appendChild(appRows(category.apps));
    node.appendChild(body);

    return node;
}

/** Flat list shown while a search or a tag filter is active. */
function resultsNode(apps) {
    const node = document.createElement('div');
    node.className = 'explorer-results';

    const head = document.createElement('div');
    head.className = 'explorer-results-head';
    head.textContent = `${apps.length} ${apps.length === 1 ? 'app' : 'apps'} found`;
    node.appendChild(head);

    const body = document.createElement('div');
    body.className = 'explorer-results-body';
    if (apps.length) body.appendChild(appRows(apps));
    else body.appendChild(emptyNote('No apps match the current filters.'));
    node.appendChild(body);

    return node;
}

export function renderExplorer() {
    const container = document.getElementById('explorer');
    if (!container) return;

    renderFavorites();

    forceExpand = hasActiveFilters();
    container.innerHTML = '';

    if (!state.allApps.length) {
        container.appendChild(emptyNote('Loading apps…'));
        applyPanelState();
        return;
    }

    const cfg = taxonomyConfig();

    // Nothing is opened on its own: the panel opens when a rail icon is
    // clicked. The tree is still built so the rows are ready to show.
    explorerState.initialised = true;

    // With a filter on, list every match instead of one section: a hit in
    // another section would otherwise look like "no apps at all".
    if (forceExpand) {
        container.appendChild(resultsNode(filterCurrentApps()));
        applyPanelState();
        markActiveRow(state.activeAppId);
        warmVisibleStatuses();
        return;
    }

    const section = cfg.sections.find(s => s.id === explorerState.openSection) || cfg.sections[0];
    if (!section) {
        container.appendChild(emptyNote('No apps to show.'));
        applyPanelState();
        return;
    }
    // A stored section that no longer exists is corrected (but a closed panel
    // is never opened from here).
    if (explorerState.openSection && explorerState.openSection !== section.id) {
        setOpenSection(section.id);
    }

    const categories = categoriesForSection(section, cfg);
    if (!categories.length) {
        container.appendChild(emptyNote(`No apps in ${section.id} yet.`));
        applyPanelState();
        return;
    }

    categories.forEach(category => container.appendChild(categoryNode(section.id, category)));

    applyPanelState();
    markActiveRow(state.activeAppId);
    warmVisibleStatuses();
}

/* ------------------------------------------------------------------ *
 * Unfolding, status dots and the hover tooltip
 * ------------------------------------------------------------------ */

function toggleCategoryNode(node) {
    if (!node) return;
    const open = toggleCategoryOpen(node.dataset.section, node.dataset.category);
    node.classList.toggle('open', open);
    if (open) warmVisibleStatuses();
}

function rowIsVisible(row) {
    const category = row.closest('.explorer-category');
    if (category && !category.classList.contains('open')) return false;
    return true;
}

/** Rows the user can actually see right now (closed panel: none). */
function visibleRows() {
    if (!isPanelOpen()) return [];
    return Array.from(document.querySelectorAll('#sidePanel .app-row')).filter(rowIsVisible);
}

export function markActiveRow(id) {
    document.querySelectorAll('#sidePanel .app-row').forEach(row => {
        row.classList.toggle('active', !!id && row.dataset.appId === id);
    });
}

/** Check the rows that are on screen: one batched request for all of them. */
async function warmVisibleStatuses() {
    const rows = visibleRows();
    if (!rows.length) return;

    const apps = rows
        .map(row => state.allApps.find(app => app.id === row.dataset.appId))
        .filter(Boolean);

    if (!apps.length) return;

    await warmAppStatuses(apps);
    rows.forEach(row => applyAppRowStatus(row, state.statusCache.get(row.dataset.appId) || null));
    if (tooltipTarget) showTooltipFor(tooltipTarget);
}

/** Repaint the dots from the cache (after a download finished, say). */
export function refreshVisibleStatuses() {
    visibleRows().forEach(row => {
        applyAppRowStatus(row, state.statusCache.get(row.dataset.appId) || null);
    });
    if (tooltipTarget) showTooltipFor(tooltipTarget);
}

/* ------------------------------------------------------------------ *
 * Hover tooltip: green when everything is installed, the list of missing
 * models (orange/red) when something still has to be downloaded.
 * ------------------------------------------------------------------ */

function ensureTooltip() {
    if (tooltipElement && document.body.contains(tooltipElement)) return tooltipElement;

    tooltipElement = document.createElement('div');
    tooltipElement.id = 'explorerTooltip';
    // Not the .hidden class: that one is display:none !important.
    tooltipElement.style.display = 'none';
    document.body.appendChild(tooltipElement);
    return tooltipElement;
}

function hideTooltip() {
    tooltipTarget = null;
    if (tooltipElement) tooltipElement.style.display = 'none';
}

function tipLine(text, className = '') {
    const line = document.createElement('span');
    line.className = className;
    line.textContent = text;
    return line;
}

function positionTooltip(tip, row) {
    const rect = row.getBoundingClientRect();
    const maxLeft = Math.max(8, window.innerWidth - 360);
    tip.style.left = `${Math.min(rect.left + 8, maxLeft)}px`;
    const below = rect.bottom + 6;
    tip.style.top = `${below + 170 > window.innerHeight ? Math.max(8, rect.top - 160) : below}px`;
}

function showTooltipFor(row) {
    const app = state.allApps.find(candidate => candidate.id === row.dataset.appId);
    if (!app) {
        hideTooltip();
        return;
    }

    tooltipTarget = row;
    const tip = ensureTooltip();
    tip.className = '';
    tip.innerHTML = '';

    const status = state.statusCache.get(app.id);

    if (!status) {
        tip.appendChild(tipLine('Checking models…', 'tip-title'));
        tip.appendChild(tipLine('Click ⓘ for info and to install.', 'tip-hint'));
        positionTooltip(tip, row);
        tip.style.display = 'block';
        // Not checked yet (e.g. the panel just opened).
        getAppStatus(app).then(fresh => {
            applyAppRowStatus(row, fresh);
            if (tooltipTarget === row) showTooltipFor(row);
        });
        return;
    }

    // Keep it short: only one of three summary states + a call to action.
    if (status.state === 'ready') {
        tip.classList.add('ready');
        tip.appendChild(tipLine('All models installed', 'tip-title'));
        tip.appendChild(tipLine('Click to open the app.', 'tip-hint'));
    } else if (status.state === 'partial') {
        tip.classList.add('partial');
        tip.appendChild(tipLine('Some variants still need models', 'tip-title'));
        tip.appendChild(tipLine('Click ⓘ for info and to install.', 'tip-hint'));
    } else {
        tip.classList.add('warn');
        tip.appendChild(tipLine('No models installed', 'tip-title'));
        tip.appendChild(tipLine('Click ⓘ for info and to install.', 'tip-hint'));
    }

    positionTooltip(tip, row);
    tip.style.display = 'block';
}
