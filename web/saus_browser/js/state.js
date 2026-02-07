import { PreferencesManager } from '/core/js/common/scripts/preferences.js';

export const state = {
    allApps: [],
    categories: [],
    selectedCategories: new Set(),
    selectedTags: new Set(),
    allTags: new Set(),
    favorites: new Set(),
    favoritesFilterActive: false,
    sidebarFilter: null,
    ARCHITECTURES: {},
    MODELS_DATA: {},
    settingsComponent: null,
    hideDescriptions: false,
    hideTitles: false
};

export const noshowAppIds = [
    'flupdate',
    'fltuts',
];

export const priorityAppIds = [];

const FAVORITES_KEY = 'AppFavorites';

const defaultPreferences = {
    selectedCategories: [],
    favoritesFilterActive: false,
    hideDescriptions: false,
    hideTitles: false,
    sortValue: 'nameAsc',
    showHiddenOnly: false, 
    selectedTheme: null,
    activeTypeFilters: ['open', 'gold']
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