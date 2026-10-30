import { PreferencesManager } from '/core/js/common/scripts/preferences.js';

export const state = {
    allApps: [],
    categories: [],
    selectedCategories: new Set(),
    selectedTags: new Set(),
    allTags: new Set(),
    favorites: new Set(),
    // Apps the App Manager hides. Server-side (saus/data/settings.json), so this
    // is an install-wide choice rather than a per-browser one; filled by
    // loadAppVisibility() while the shell boots.
    hiddenAppIds: new Set(),
    sidebarFilter: null,
    searchTerm: '',
    ARCHITECTURES: {},
    MODELS_DATA: {},
    TAXONOMY: { categories: [], sections: [], tags: {} },
    hideDescriptions: false,
    hideTitles: false,
    sessionTimestamp: Date.now(),
    // The server run this page is talking to (/saus/api/session). Handed to every app
    // tab, so an app's remembered state can tell a reload from a ComfyUI restart.
    sessionStamp: '',
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

const FAVORITES_KEY = 'AppFavorites';

const defaultPreferences = {
    selectedCategories: [],
    hideDescriptions: false,
    hideTitles: false,
    sortValue: 'nameAsc',
    showHiddenOnly: false,
    // Apps the API flags `deprecated` live in web/apps/deprecated/ and stay out of
    // every list until the Settings switch "Show deprecated apps" turns this on
    // (see ui.js -> filterCurrentApps).
    showDeprecatedApps: false,
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
 * App visibility (the App Manager's hidden list)
 *
 * Server-side on purpose: hiding an app is a property of the *install*, not of
 * one browser, so every device that opens this ComfyUI agrees. The endpoint only
 * ever stores ids of apps that are installed, which is what keeps this a display
 * filter: no app file is read or written by it.
 * ------------------------------------------------------------------ */

const VISIBILITY_URL = '/saus/api/app-visibility';

/** True when the App Manager hides this app. */
export function isAppHidden(appId) {
    return state.hiddenAppIds.has(appId);
}

export function hiddenAppCount() {
    return state.hiddenAppIds.size;
}

/** Read the hidden list (boot, and whenever the App Manager opens). */
export async function loadAppVisibility() {
    try {
        const response = await fetch(VISIBILITY_URL);
        if (!response.ok) throw new Error(response.statusText);
        const data = await response.json();
        state.hiddenAppIds = new Set(Array.isArray(data.hiddenAppIds) ? data.hiddenAppIds : []);
    } catch (error) {
        // A hiccup, or a server that predates the route, must not empty the panel:
        // with no list nothing is hidden, which is also the first-run state.
        console.warn('[SAUS] Could not read the app visibility setting:', error);
        state.hiddenAppIds = new Set();
    }
    return state.hiddenAppIds;
}

/**
 * Hide or show one app and store the whole list.
 *
 * Optimistic: the panel repaints at once, and the server's answer is taken as
 * final (it prunes ids of apps that no longer exist). A failed write puts the
 * previous list back, so the UI never claims something the server did not save.
 */
export async function setAppHidden(appId, hidden) {
    if (!appId) return false;

    const previous = new Set(state.hiddenAppIds);
    if (hidden) state.hiddenAppIds.add(appId);
    else state.hiddenAppIds.delete(appId);
    notifyVisibilityChanged();
    return persistHidden(previous);
}

/** Show every app again - the App Manager's "Show all". One write, not one per app. */
export async function showAllApps() {
    if (!state.hiddenAppIds.size) return true;

    const previous = new Set(state.hiddenAppIds);
    state.hiddenAppIds = new Set();
    notifyVisibilityChanged();
    return persistHidden(previous);
}

/** Write the current list, and put `previous` back when the write fails. */
async function persistHidden(previous) {
    try {
        const response = await fetch(VISIBILITY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hiddenAppIds: Array.from(state.hiddenAppIds) }),
        });
        if (!response.ok) throw new Error(response.statusText);
        const data = await response.json();
        state.hiddenAppIds = new Set(Array.isArray(data.hiddenAppIds) ? data.hiddenAppIds : []);
        return true;
    } catch (error) {
        console.error('[SAUS] Could not save the app visibility setting:', error);
        state.hiddenAppIds = previous;
        notifyVisibilityChanged();
        return false;
    }
}

/** Tell the shell that what the explorer should list has changed. */
export function notifyVisibilityChanged() {
    document.dispatchEvent(new CustomEvent('saus:app-visibility-changed'));
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

function saveExplorerState() {
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

        // A tab is an app (needs a url) or a built-in pane: settings, file
        // manager. Built-in panes are always restorable; the console is not a
        // tab any more (it docks over the workspace), so drop stale entries.
        state.openApps = tabs
            .filter(entry => entry && (entry.url || entry.kind))
            .filter(entry => entry.kind !== 'console')
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