/**
 * The App Manager: every app the panel may offer, with a display switch per app.
 *
 * Display only. Hiding an app writes one id to the install-wide list
 * (/saus/api/app-visibility) and never touches an app file, a graph or a model.
 *
 * Which apps are listed *at all* is `isAppListed()`: the deprecated ones appear
 * only while "Show deprecated apps" is on in Settings, so that switch doubles as
 * the gate for managing a parked app - there is deliberately no way to switch one
 * on from here while it is off.
 */
import {
    state, isAppHidden, setAppHidden, loadAppVisibility, hiddenAppCount,
} from './state.js';
import { appThumbSrc, applyAppRowStatus, isAppListed, APP_THUMB_FALLBACK } from './ui.js';
import { warmAppStatuses, subscribeStatusChanges, showAppDetails } from './models.js';

const THUMB_FALLBACK = APP_THUMB_FALLBACK;

let host = null;
// The chips: a section id, then one of its categories ('all' = no filter).
let filter = { section: 'all', category: 'all' };

function createElement(tag, className, textContent = '') {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = textContent;
    return element;
}

/** The section / category vocabulary, straight from taxonomy.json. */
function sectionEntries() {
    const taxonomy = state.TAXONOMY || {};
    const sections = Array.isArray(taxonomy.sections) ? taxonomy.sections : [];
    const categories = Array.isArray(taxonomy.categories) ? taxonomy.categories : [];
    return sections.map((section) => ({
        id: section.id,
        icon: section.icon || 'fas fa-cube',
        categories: categories
            .filter(category => category.section === section.id)
            .map(category => ({ id: category.id, label: category.label || category.id })),
    }));
}

/** Every app the manager may list (deprecated ones only while that switch is on). */
function listedApps() {
    return state.allApps
        .filter(isAppListed)
        .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
}

/** The apps the current chips show. */
function filteredApps() {
    return listedApps().filter((app) => {
        if (filter.section === 'all') return true;
        const section = sectionEntries().find(entry => entry.id === filter.section);
        if (!section) return true;
        if (filter.category !== 'all') return app.category === filter.category;
        return section.categories.some(category => category.id === app.category)
            || app.category === filter.section;
    });
}

/** category id -> section id, from taxonomy.json (absent when nothing lists it). */
function categoryToSection() {
    const map = new Map();
    sectionEntries().forEach((section) => {
        section.categories.forEach(category => map.set(category.id, section.id));
    });
    return map;
}

function sectionOfApp(app) {
    return categoryToSection().get(app.category) || '';
}

function countFor(predicate) {
    return listedApps().filter(predicate).length;
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function appRow(app) {
    const row = createElement('div', 'app-row');
    row.dataset.appId = app.id;
    row.dataset.status = 'checking';
    row.tabIndex = 0;

    const thumb = document.createElement('img');
    thumb.className = 'app-row-thumb';
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.decoding = 'async';
    const onThumbError = () => {
        thumb.removeEventListener('error', onThumbError);
        thumb.src = THUMB_FALLBACK;
    };
    thumb.addEventListener('error', onThumbError);
    thumb.src = appThumbSrc(app);

    const name = createElement('span', 'app-row-name', app.name || app.id);
    name.title = app.name || app.id;

    const dot = createElement('span', 'app-row-dot status-checking');
    if (app.deprecated) dot.title = 'Deprecated app';

    // The switch replaces the panel row's star: one slot, one meaning - this is the
    // display control, the favourite lives in the panel.
    const hidden = isAppHidden(app.id);
    row.classList.toggle('manager-hidden', hidden);
    const toggle = createElement('label', 'manager-switch');
    toggle.title = hidden ? 'Hidden: show it in the panel' : 'Shown in the panel: hide it';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !hidden;
    input.setAttribute('aria-label', `Show ${app.name || app.id} in the panel`);
    input.addEventListener('change', async () => {
        const ok = await setAppHidden(app.id, !input.checked);
        if (!ok) console.error(`[SAUS] Could not ${input.checked ? 'hide' : 'show'} ${app.id}`);
    });
    const track = createElement('span', 'manager-switch-track');
    track.setAttribute('aria-hidden', 'true');
    toggle.appendChild(input);
    toggle.appendChild(track);

    const infoBtn = document.createElement('button');
    infoBtn.type = 'button';
    infoBtn.className = 'app-row-btn info-btn';
    infoBtn.title = 'App info and model management';
    infoBtn.innerHTML = '<i class="fas fa-info"></i>';
    infoBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showAppDetails(app);
    });

    row.appendChild(thumb);
    row.appendChild(name);
    row.appendChild(dot);
    row.appendChild(toggle);
    row.appendChild(infoBtn);

    // Clicking the row opens the app - the same route the panel takes, so the
    // manager needs no tabs.js import (see the note in ui.js).
    row.addEventListener('click', (event) => {
        if (event.target.closest('button, .manager-switch')) return;
        event.preventDefault();
        document.dispatchEvent(new CustomEvent('saus:open-app', {
            detail: { id: app.id, url: app.url, name: app.name },
        }));
    });

    return row;
}

/* ------------------------------------------------------------------ *
 * The chip bars: a section, then the categories of that section
 * ------------------------------------------------------------------ */

function chip(label, count, active, onClick, icon = '') {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `manager-chip${active ? ' active' : ''}`;
    if (icon) button.innerHTML = `<i class="${icon}"></i> `;
    button.appendChild(document.createTextNode(label));
    button.appendChild(createElement('span', 'manager-chip-count', String(count)));
    button.addEventListener('click', onClick);
    return button;
}

function sectionBar(sections, appCount) {
    const bar = createElement('div', 'manager-filters');
    bar.appendChild(chip('All apps', appCount, filter.section === 'all', () => {
        filter = { section: 'all', category: 'all' };
        render();
    }));

    sections.forEach((section) => {
        bar.appendChild(chip(
            section.id,
            countFor(app => sectionOfApp(app) === section.id),
            filter.section === section.id,
            () => {
                filter = { section: section.id, category: 'all' };
                render();
            },
            section.icon,
        ));
    });
    return bar;
}

function categoryBar(sections) {
    const bar = createElement('div', 'manager-filters manager-categories');
    const section = sections.find(entry => entry.id === filter.section);
    if (!section) return bar;   // "All apps" is picked: no subcategory to choose

    bar.appendChild(chip('All', countFor(app => sectionOfApp(app) === section.id),
        filter.category === 'all', () => { filter.category = 'all'; render(); }));
    section.categories.forEach((category) => {
        bar.appendChild(chip(
            category.label,
            countFor(app => app.category === category.id),
            filter.category === category.id,
            () => { filter.category = category.id; render(); },
        ));
    });
    return bar;
}

/**
 * The apps as section -> subcategory groups, each in a grid of its own.
 *
 * The panel files apps the same way (a section holds its categories), so reading
 * the manager feels like reading the panel - and three columns put far more of the
 * catalogue on one screen.
 */
function appendGroups(container, apps, sections) {
    const byCategory = new Map();
    apps.forEach((app) => {
        const id = app.category || '';
        if (!byCategory.has(id)) byCategory.set(id, []);
        byCategory.get(id).push(app);
    });

    const sectionOfCategory = categoryToSection();
    const placed = new Set();

    sections
        .filter(section => filter.section === 'all' || section.id === filter.section)
        .forEach((section) => {
            const groups = [];

            section.categories
                .filter(category => filter.category === 'all' || category.id === filter.category)
                .forEach((category) => {
                    const groupApps = byCategory.get(category.id) || [];
                    placed.add(category.id);
                    if (groupApps.length) groups.push({ label: category.label, apps: groupApps });
                });

            // A category the taxonomy does not list still gets a group: a new app
            // must not vanish from the only view that can show it.
            byCategory.forEach((groupApps, id) => {
                if (!id || placed.has(id) || sectionOfCategory.get(id) !== section.id) return;
                placed.add(id);
                groups.push({ label: id, apps: groupApps });
            });

            if (!groups.length) return;

            const block = createElement('section', 'manager-group');
            if (filter.section === 'all') {
                block.appendChild(createElement('h3', 'manager-section-title',
                    `${section.id} (${groups.reduce((total, group) => total + group.apps.length, 0)})`));
            }
            groups.forEach(group => block.appendChild(groupBlock(group)));
            container.appendChild(block);
        });

    // Apps whose category no section lists at all (only in the unfiltered view).
    const orphans = apps.filter(app => !app.category || !sectionOfCategory.get(app.category));
    if (orphans.length && filter.section === 'all') {
        const block = createElement('section', 'manager-group');
        block.appendChild(createElement('h3', 'manager-section-title', `Uncategorised (${orphans.length})`));
        block.appendChild(groupBlock({ label: 'No category', apps: orphans }));
        container.appendChild(block);
    }
}

function groupBlock(group) {
    // Each subcategory sits in its own box: two neighbouring groups must never read
    // as one list of apps.
    const block = createElement('section', 'manager-subgroup');

    const head = createElement('div', 'manager-group-head');
    head.appendChild(createElement('span', 'manager-group-title', group.label));
    head.appendChild(createElement('span', 'manager-group-count', String(group.apps.length)));
    block.appendChild(head);

    const grid = createElement('div', 'manager-grid');
    group.apps.forEach(app => grid.appendChild(appRow(app)));
    block.appendChild(grid);
    return block;
}

/* ------------------------------------------------------------------ *
 * Render / status
 * ------------------------------------------------------------------ */

function render() {
    if (!host) return;

    const sections = sectionEntries();
    const apps = listedApps();

    // A section the taxonomy no longer has must not leave the manager showing nothing.
    if (filter.section !== 'all' && !sections.some(section => section.id === filter.section)) {
        filter = { section: 'all', category: 'all' };
    }

    const shown = filteredApps();
    const hidden = hiddenAppCount();
    const parkedOut = state.allApps.filter(app => app.deprecated && !isAppListed(app)).length;

    host.innerHTML = '';

    const head = createElement('div', 'manager-head');
    head.appendChild(createElement('h2', 'manager-title', 'App Manager'));
    head.appendChild(createElement('span', 'manager-count', [
        `${apps.length} app${apps.length === 1 ? '' : 's'}`,
        hidden ? `${hidden} hidden` : '',
        parkedOut ? `${parkedOut} deprecated not listed` : '',
    ].filter(Boolean).join(' · ')));
    host.appendChild(head);

    host.appendChild(createElement('p', 'manager-hint', parkedOut
        ? `${parkedOut} deprecated app${parkedOut === 1 ? ' is' : 's are'} not listed - `
          + 'turn on "Show deprecated apps" in Settings to manage them.'
        : 'Hiding an app only takes it out of the side panel: it stays installed and keeps working.'));

    host.appendChild(sectionBar(sections, apps.length));
    host.appendChild(categoryBar(sections));

    const list = createElement('div', 'manager-list');
    if (!shown.length) {
        list.appendChild(createElement('p', 'manager-empty', 'No app matches this filter.'));
    } else {
        appendGroups(list, shown, sections);
    }
    host.appendChild(list);

    paintStatuses();
}

/** Dots come from the same cache the explorer uses, and repaint on any change. */
async function paintStatuses() {
    if (!host) return;
    const apps = filteredApps();
    await warmAppStatuses(apps);
    apps.forEach((app) => {
        const row = host.querySelector(`.app-row[data-app-id="${app.id}"]`);
        if (row) applyAppRowStatus(row, state.statusCache.get(app.id) || null);
    });
}

/* ------------------------------------------------------------------ *
 * Mount
 * ------------------------------------------------------------------ */

// The listeners are document-level and the manager is a singleton: bind once, no
// matter how often its tab is closed and reopened.
let listenersBound = false;

export function mountAppManager(container) {
    host = container;
    host.classList.add('manager-pane');

    if (!listenersBound) {
        listenersBound = true;
        document.addEventListener('saus:app-visibility-changed', render);
        // The deprecated switch changes which apps are listed here at all.
        document.addEventListener('saus:preference-changed', render);
        subscribeStatusChanges(paintStatuses);
    }

    render();
}

/** The tab came forward: another browser may have changed the list since. */
export async function refreshAppManager() {
    if (!host) return;
    await loadAppVisibility();
    render();
}
