import { PreferencesManager } from '/core/js/common/scripts/preferences.js';

export const state = {
    allApps: [],
    categories: [],
    selectedCategories: new Set(),
    selectedTags: new Set(),
    allTags: new Set(),
    favorites: new Set(),
    sidebarFilter: null,
    searchTerm: '',
    ARCHITECTURES: {},
    MODELS_DATA: {},
    TAXONOMY: { categories: [], sections: [], tags: {} },
    hideDescriptions: false,
    hideTitles: false,
    sessionTimestamp: Date.now(),
    // Per-app model status, filled by models.js (see getAppStatus).
    statusCache: new Map(),
    // Tabs: [{ id, url, name, kind }] with the id of the active one.
    openApps: [],
    activeAppId: null,
};

export const noshowAppIds = [
    'flupdate',
    'fltuts',
];

export const priorityAppIds = [];

const FAVORITES_KEY = 'AppFavorites';

const defaultPreferences = {
    selectedCategories: [],
    hideDescriptions: false,
    hideTitles: false,
    sortValue: 'nameAsc',
    showHiddenOnly: false,
};

export const preferencesManager = new PreferencesManager(defaultPreferences);

export function loadFavorites() {
    const storedFavorites = localStorage.getItem(FAVORITES_KEY);
    if (storedFavorites) {
        try {
            const parsedFavorites = JSON.parse(storedFavorites);
            state.favorites = new Set(parsedFavorites);
        } catch (e) {
            console.error('Error parsing favorites from localStorage:', e);
            state.favorites = new Set();
        }
    }
}

export function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(state.favorites)));
}

export function isFavorited(appId) {
    return state.favorites.has(appId);
}

/* ------------------------------------------------------------------ *
 * Explorer (left panel) state: which section the panel is showing and
 * which of its subcategories are unfolded. Clicking a rail icon opens
 * the panel on that section (clicking the same icon again closes it);
 * hovering another icon switches the panel to it.
 * ------------------------------------------------------------------ */

const EXPLORER_KEY = 'saus.explorer.v3';

export const explorerState = {
    // Which section the panel lists ('AI Image', 'AI Video', 'Other'),
    // or null when the panel is closed.
    openSection: null,
    openCategories: [],
    // False until storage has been read (so the first run can pick a default).
    initialised: false,
};

export function loadExplorerState() {
    try {
        const raw = localStorage.getItem(EXPLORER_KEY);
        if (!raw) return;   // No saved layout: renderExplorer picks a default one.
        const data = JSON.parse(raw) || {};
        explorerState.openSection = data.openSection ? String(data.openSection) : null;
        explorerState.openCategories = Array.isArray(data.openCategories) ? data.openCategories.map(String) : [];
        explorerState.initialised = true;
    } catch (e) {
        console.error('Error loading explorer state:', e);
    }
}

export function saveExplorerState() {
    try {
        localStorage.setItem(EXPLORER_KEY, JSON.stringify({
            openSection: explorerState.openSection,
            openCategories: explorerState.openCategories,
        }));
    } catch (e) {
        console.error('Error saving explorer state:', e);
    }
}

/** Open the panel on a section; ``null`` closes it. */
export function setOpenSection(sectionId) {
    explorerState.openSection = sectionId || null;
    saveExplorerState();
}

export function isPanelOpen() {
    return !!explorerState.openSection;
}

export function isCategoryOpen(key) {
    return explorerState.openCategories.includes(key);
}

export function toggleCategoryOpen(sectionId, categoryId) {
    const key = categoryKey(sectionId, categoryId);
    if (explorerState.openCategories.includes(key)) {
        explorerState.openCategories = explorerState.openCategories.filter(c => c !== key);
    } else {
        explorerState.openCategories.push(key);
    }
    saveExplorerState();
    return explorerState.openCategories.includes(key);
}

/** Subcategories are keyed by section too, so two sections can hold the same id. */
export function categoryKey(sectionId, categoryId) {
    return `${sectionId}::${categoryId}`;
}

/* ------------------------------------------------------------------ *
 * Open apps (tabs). Kept in sessionStorage: a reload should bring the
 * apps back, closing the browser should not.
 * ------------------------------------------------------------------ */

const TABS_KEY = 'saus.tabs.v1';

export function loadOpenApps() {
    try {
        const raw = sessionStorage.getItem(TABS_KEY);
        if (!raw) return;
        const data = JSON.parse(raw) || {};
        // saveOpenApps() writes { activeId, tabs: [...] }.
        const tabs = Array.isArray(data) ? data : data.tabs;
        if (!Array.isArray(tabs)) return;

        // A tab is an app (needs a url) or a built-in pane: settings, console,
        // file manager. Built-in panes are always restorable.
        state.openApps = tabs
            .filter(entry => entry && (entry.url || entry.kind))
            .map(entry => ({
                id: String(entry.id || entry.url || entry.kind),
                url: String(entry.url || ''),
                name: String(entry.name || entry.id || entry.url || entry.kind),
                kind: String(entry.kind || 'app'),
            }));

        const activeId = Array.isArray(data) ? null : data.activeId;
        state.activeAppId = state.openApps.length
            ? String(activeId || state.openApps[0].id)
            : null;
    } catch (e) {
        console.error('Error loading open apps:', e);
    }
}

export function saveOpenApps() {
    try {
        sessionStorage.setItem(TABS_KEY, JSON.stringify({
            activeId: state.activeAppId,
            tabs: state.openApps.map(app => ({
                id: app.id, url: app.url, name: app.name, kind: app.kind || 'app',
            })),
        }));
    } catch (e) {
        console.error('Error saving open apps:', e);
    }
}