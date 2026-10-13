import { state, isFavorited, saveFavorites, noshowAppIds, preferencesManager } from './state.js';
import { showAppDetails } from './models.js';

const createElement = (type, className, textContent = '') => {
    const element = document.createElement(type);
    element.className = className;
    element.textContent = textContent;
    return element;
};

/* ------------------------------------------------------------------ *
 * Re-render hook. ui.js never imports the explorer directly (that would
 * be a cycle), so main.js registers the tree renderer here and anything
 * that changes what the tree shows just calls requestRender().
 * ------------------------------------------------------------------ */

let renderHandler = null;

export function setRenderHandler(fn) {
    renderHandler = typeof fn === 'function' ? fn : null;
}

export function requestRender() {
    if (renderHandler) renderHandler();
}

export function toggleFavorite(appId) {
    if (state.favorites.has(appId)) {
        state.favorites.delete(appId);
    } else {
        state.favorites.add(appId);
    }
    saveFavorites();
    requestRender();
}

/* ------------------------------------------------------------------ *
 * Compact app row: small thumbnail, name, status dot, star + info.
 * Clicking it opens the app in a workspace tab.
 * ------------------------------------------------------------------ */

export function createAppRow(app) {
    const row = createElement('div', 'app-row');
    row.dataset.appId = app.id;
    row.dataset.status = 'checking';
    row.tabIndex = 0;

    const thumb = document.createElement('img');
    thumb.className = 'app-row-thumb';
    thumb.alt = '';
    thumb.loading = 'lazy';
    // The app ships whatever thumbnail name it likes (jpg / webp / avif): the
    // API reports the one that exists, and this is the fallback.
    thumb.src = `saus/${app.url}/${app.thumbnail || 'media/thumbnail.jpg'}?t=${state.sessionTimestamp}`;
    const onThumbError = () => {
        thumb.removeEventListener('error', onThumbError);
        thumb.src = '/core/media/ui/saus_logo.png';
    };
    thumb.addEventListener('error', onThumbError);

    // The name may wrap onto a second line so long titles are fully visible.
    const name = createElement('span', 'app-row-name', app.name || app.id);
    name.title = app.name || app.id;

    const dot = createElement('span', 'app-row-dot status-checking');

    const buttons = createElement('div', 'app-row-btns');

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'app-row-btn fav-btn';
    if (isFavorited(app.id)) favBtn.classList.add('fav-on');
    favBtn.title = isFavorited(app.id) ? 'Remove from favorites' : 'Add to favorites';
    favBtn.innerHTML = isFavorited(app.id) ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    favBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(app.id);
    });

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

    buttons.appendChild(favBtn);
    buttons.appendChild(infoBtn);

    row.appendChild(thumb);
    row.appendChild(name);
    row.appendChild(dot);
    row.appendChild(buttons);

    // Opening is routed through a document event: main.js owns the wiring,
    // so this module stays free of a tabs.js <-> ui.js import cycle.
    const launch = () => document.dispatchEvent(new CustomEvent('saus:open-app', {
        detail: { id: app.id, url: app.url, name: app.name },
    }));
    row.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        event.preventDefault();
        launch();
    });
    row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            launch();
        }
    });

    return row;
}

/** Paint the model-status dot of a row. */
export function applyAppRowStatus(row, status) {
    if (!row) return;
    const stateName = status ? status.state : 'checking';
    row.dataset.status = stateName;
    const dot = row.querySelector('.app-row-dot');
    if (dot) dot.className = `app-row-dot status-${stateName}`;
}

/* ------------------------------------------------------------------ *
 * Filtering / sorting
 * ------------------------------------------------------------------ */

export function sortApps(apps, sortValue) {
    const sortedApps = [...apps];

    switch (sortValue) {
        case 'nameAsc':
            sortedApps.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'nameDesc':
            sortedApps.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'categoryAsc':
            sortedApps.sort((a, b) => {
                const indexA = state.categories.indexOf(a.category);
                const indexB = state.categories.indexOf(b.category);
                return indexA - indexB || a.name.localeCompare(b.name);
            });
            break;
        case 'categoryDesc':
            sortedApps.sort((a, b) => {
                const indexA = state.categories.indexOf(a.category);
                const indexB = state.categories.indexOf(b.category);
                return indexB - indexA || a.name.localeCompare(b.name);
            });
            break;
    }

    const favoriteApps = [];
    const restApps = [];
    sortedApps.forEach(app => {
        if (isFavorited(app.id)) favoriteApps.push(app);
        else restApps.push(app);
    });

    return [...favoriteApps, ...restApps];
}

function matchesSearch(app, term) {
    return (app.name || '').toLowerCase().includes(term)
        || (app.description || '').toLowerCase().includes(term)
        || (app.category || '').toLowerCase().includes(term)
        || (app.flatTags || []).some(tag => tag.toLowerCase().includes(term));
}

/** Apps that pass the current search / tag / favorites filters. */
export function filterCurrentApps() {
    const searchTerm = (state.searchTerm || '').trim().toLowerCase();

    let filteredApps = state.allApps.filter(app => app.id !== 'menu' && !noshowAppIds.includes(app.id));

    if (searchTerm) {
        filteredApps = filteredApps.filter(app => matchesSearch(app, searchTerm));
    }

    if (state.selectedTags.size > 0) {
        filteredApps = filteredApps.filter(app =>
            app.flatTags && app.flatTags.some(tag => state.selectedTags.has(tag))
        );
    }

    return sortApps(filteredApps, preferencesManager.get('sortValue') || 'nameAsc');
}

/** True when a filter is active: the tree then unfolds every match. */
export function hasActiveFilters() {
    return !!((state.searchTerm || '').trim()) || state.selectedTags.size > 0;
}

/* ------------------------------------------------------------------ *
 * Tag chips + the counter on the panel head's Tags button
 * ------------------------------------------------------------------ */

export function renderTagsFilter() {
    const tagsContainer = document.getElementById('tagsContainer');
    if (!tagsContainer) return;
    tagsContainer.innerHTML = '';

    const visibleTypeTags = new Set();
    const visibleBaseTags = new Set();
    const visibleOtherTags = new Set();

    state.allApps.forEach(app => {
        if (noshowAppIds.includes(app.id) || !app.tags) return;

        if (Array.isArray(app.tags)) {
            app.tags.forEach(tag => visibleOtherTags.add(tag));
        } else {
            (app.tags.type || []).forEach(tag => visibleTypeTags.add(tag));
            (app.tags.base_models || []).forEach(tag => visibleBaseTags.add(tag));
            (app.tags.other || []).forEach(tag => visibleOtherTags.add(tag));
        }
    });

    const createChip = (tag, typeClass) => {
        const chip = createElement('div', `tag-chip ${typeClass}`, tag);
        if (state.selectedTags.has(tag)) chip.classList.add('selected');
        chip.addEventListener('click', (e) => toggleTag(tag, e));
        tagsContainer.appendChild(chip);
    };

    Array.from(visibleTypeTags).sort().forEach(tag => createChip(tag, 'tag-type'));
    Array.from(visibleBaseTags).sort().forEach(tag => createChip(tag, 'tag-base'));
    Array.from(visibleOtherTags).sort().forEach(tag => createChip(tag, 'tag-other'));

    updateFilterBadge();
}

function toggleTag(tag, event) {
    if (event.ctrlKey || event.metaKey) {
        if (state.selectedTags.has(tag)) {
            state.selectedTags.delete(tag);
        } else {
            state.selectedTags.add(tag);
        }
    } else if (state.selectedTags.has(tag) && state.selectedTags.size === 1) {
        state.selectedTags.clear();
    } else {
        state.selectedTags.clear();
        state.selectedTags.add(tag);
    }
    renderTagsFilter();
    requestRender();
}

/** Little counter on the Filters button: active search + tags. */
export function updateFilterBadge() {
    const badge = document.getElementById('filtersBadge');
    if (!badge) return;
    let count = state.selectedTags.size;
    if ((state.searchTerm || '').trim()) count++;
    badge.textContent = String(count);
    badge.classList.toggle('hidden', count === 0);
}

/* ------------------------------------------------------------------ *
 * Settings used to live here as an overlay on the pane area. It is a
 * workspace tab now, so the tab manager owns it (see tabs.js).
 * ------------------------------------------------------------------ */

