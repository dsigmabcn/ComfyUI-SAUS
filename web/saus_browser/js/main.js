import { PromptServerClient } from './websocket.js';
import { SettingsComponent } from '../../core/js/common/components/settings.js';
import { state, loadFavorites, preferencesManager } from './state.js';
import { checkForUpdate, showVersion } from './updates.js';
import { updateComponentStatus } from './models.js';
import { renderSidebarCategories, initializeStaticSidebarEvents } from './sidebar.js';
import { renderApps, filterCurrentApps, renderTagsFilter, showHome, showApps, showSettings } from './ui.js';

export async function loadApps() {
    state.sessionTimestamp = Date.now();
    try {
        // Fetch Architectures and Model Data first
        const [archResponse, modelsResponse] = await Promise.all([
            fetch('/saus/api/architectures'),
            fetch('/saus/api/data-model-info')
        ]);

        if (archResponse.ok) state.ARCHITECTURES = await archResponse.json();
        if (modelsResponse.ok) state.MODELS_DATA = await modelsResponse.json();

        const response = await fetch('/saus/api/apps');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        state.allApps = await response.json();
        //console.log("[SAUS] Loaded apps data:", state.allApps);

        // Step 2: Fetch the separate list of categories (your app_list.json)
        // You will need to replace this URL with the correct path to app_list.json
        const categoriesResponse = await fetch('/saus/api/apps-list');
        if (!categoriesResponse.ok) {
            throw new Error(`HTTP error! status: ${categoriesResponse.status}`);
        }
        const categoriesData = await categoriesResponse.json();
        
        // Create a lookup map for faster access to categories by ID
        const metaMap = new Map(categoriesData.map(item => [item.id, item]));

        // Step 3: Assign categories to each app from the separate data source
        const uniqueCategories = new Set();
        state.allTags.clear();
        state.allApps.forEach(app => {
            const meta = metaMap.get(app.id);
            if (meta) {
                app.category = meta.category;
                
                if (Array.isArray(meta.tags)) {
                     // Fallback for array
                     app.tags = { type: [], base_models: [], other: meta.tags };
                     app.flatTags = meta.tags;
                } else if (typeof meta.tags === 'object') {
                     const asArray = (val) => Array.isArray(val) ? val : (val ? [val] : []);
                     app.tags = {
                        type: asArray(meta.tags.type),
                        base_models: asArray(meta.tags.base_models),
                        other: asArray(meta.tags.other)
                     };
                     app.flatTags = [
                        ...app.tags.type,
                        ...app.tags.base_models,
                        ...app.tags.other
                     ];
                } else {
                     app.tags = { type: [], base_models: [], other: [] };
                     app.flatTags = [];
                }

                app.architecture = meta.architecture; // Get architecture from metadata
            } else {
                // Assign a default category if none is found
                app.category = 'Other'; 
                app.tags = { type: [], base_models: [], other: [] };
                app.flatTags = [];
                app.architecture = null;
            }
            uniqueCategories.add(app.category);
            if (app.flatTags) {
                app.flatTags.forEach(tag => state.allTags.add(tag));
            }
        });
        
        
        
        state.categories = Array.from(uniqueCategories);
        //console.log(state.categories);

        const uiCallbacks = {
            showApps,
            showHome,
            showSettings,
            renderTagsFilter,
            refreshApps: () => renderApps(filterCurrentApps())
        };

        renderSidebarCategories(uiCallbacks);
        renderTagsFilter();
        renderApps(filterCurrentApps());
        showHome(); // Show home page by default on load
    } catch (error) {
        console.error('Error fetching apps:', error);
    }
}

export function initializeMenu() {
    const categoryElements = document.querySelectorAll('.menu-category > span');
    categoryElements.forEach(category => {
        category.addEventListener('click', () => {
            const submenu = category.nextElementSibling;
            submenu.style.display = submenu.style.display === 'block' ? 'none' : 'block';
        });
    });
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.querySelector('.clear-search');
    let preSearchSidebarFilter = null;
    let wasSearching = !!searchInput.value;

    const handleSearch = () => {
        const isSearching = !!searchInput.value;

        if (isSearching && !wasSearching) { // User started typing
            preSearchSidebarFilter = state.sidebarFilter;
            state.sidebarFilter = null;
            document.querySelectorAll('.sidebar-filter-category.active, .sidebar-section-header.active-section').forEach(el => el.classList.remove('active', 'active-section'));
            showApps();
        } else if (!isSearching && wasSearching) { // User cleared the search
            state.sidebarFilter = preSearchSidebarFilter;
            preSearchSidebarFilter = null; // Reset for next search
            if (state.sidebarFilter) {
                // Re-highlight the sidebar category
                document.querySelectorAll('.sidebar-filter-category').forEach(link => {
                    if (link.dataset.category === state.sidebarFilter) {
                        link.classList.add('active');
                        const parentSection = link.closest('.sidebar-section');
                        if (parentSection) {
                            const header = parentSection.querySelector('.sidebar-section-header');
                            if (header) {
                                header.classList.add('active-section');
                                const contentDiv = header.nextElementSibling;
                                if (contentDiv.style.display === 'none') {
                                    contentDiv.style.display = 'block';
                                    const icon = header.querySelector('.toggle-icon');
                                    if (icon) icon.className = 'fas fa-chevron-down toggle-icon';
                                }
                            }
                        }
                    }
                });
            }
        }

        clearBtn.style.display = isSearching ? 'inline' : 'none';
        wasSearching = isSearching;

        renderApps(filterCurrentApps());
    };

    searchInput.addEventListener('input', debounce(handleSearch, 300));

    clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        handleSearch();
        searchInput.focus();
    });

    if (wasSearching) {
        clearBtn.style.display = 'inline';
        renderApps(filterCurrentApps());
    }
}

function createTypeToggles() {
    const controlsDiv = document.querySelector('.right-controls');
    const types = [
        { id: 'open', icon: 'fa-box-open', label: 'Open' },
        { id: 'gold', icon: 'fa-crown', label: 'Gold' },
        { id: 'beta', icon: 'fa-flask', label: 'Beta' },
        { id: 'user', icon: 'fa-user', label: 'User' }
    ];

    let activeFilters = preferencesManager.get('activeTypeFilters') || [];
    if (!Array.isArray(activeFilters)) activeFilters = [];

    types.forEach(type => {
        const btn = document.createElement('button');
        btn.className = `toggle-button type-toggle type-${type.id}`;
        btn.innerHTML = `<i class="fas ${type.icon}"></i>`;
        btn.title = `Toggle ${type.label}`;
        
        if (activeFilters.includes(type.id)) {
            btn.classList.add('active');
        }

        btn.addEventListener('click', () => {
            const currentFilters = preferencesManager.get('activeTypeFilters') || [];
            const index = currentFilters.indexOf(type.id);
            
            if (index === -1) {
                currentFilters.push(type.id);
                btn.classList.add('active');
            } else {
                currentFilters.splice(index, 1);
                btn.classList.remove('active');
            }
            
            preferencesManager.set('activeTypeFilters', currentFilters);
            renderApps(filterCurrentApps());
        });

        controlsDiv.appendChild(btn);
    });
}

function createToggleButtons() {
    const controlsDiv = document.querySelector('.right-controls');
    
    state.favoritesFilterActive = preferencesManager.get('favoritesFilterActive');
  
    const favoritesToggle = document.createElement('button');
    favoritesToggle.className = 'toggle-button';
    favoritesToggle.id = 'favoritesToggle';
    favoritesToggle.innerHTML = state.favoritesFilterActive ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    favoritesToggle.title = state.favoritesFilterActive ? 'Show All Apps' : 'Show Favorites';
    
    controlsDiv.appendChild(favoritesToggle);
    
    favoritesToggle.addEventListener('click', () => toggleFavoritesFilter(favoritesToggle));
    
    favoritesToggle.classList.toggle('active', state.favoritesFilterActive);
}

function toggleFavoritesFilter(button) {
    state.favoritesFilterActive = !state.favoritesFilterActive;
    preferencesManager.set('favoritesFilterActive', state.favoritesFilterActive);
    button.classList.toggle('active', state.favoritesFilterActive);
    button.innerHTML = state.favoritesFilterActive ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    button.title = state.favoritesFilterActive ? 'Show All Apps' : 'Show Favorites';
    renderApps(filterCurrentApps());
}

function initializeWebSocket() {
    const client = new PromptServerClient();
    
    client.on('model_download_progress', (e) => {
        //console.log('[SAUS] WS Progress:', e.detail);
        const { file_name, progress } = e.detail;
        updateComponentStatus(file_name, 'downloading', progress);
    });

    client.on('model_download_complete', (e) => {
        console.log('[SAIS] WS Complete:', e.detail);
        const { file_name } = e.detail;
        updateComponentStatus(file_name, 'ready');
    });
}

export function initializeUI() {
    state.settingsComponent = new SettingsComponent('.mid-col');

    loadFavorites();
    initializeMenu();
    initializeSearch();
    createTypeToggles();
    createToggleButtons();    
    
    const uiCallbacks = {
        showApps,
        showHome,
        showSettings,
        renderTagsFilter,
        refreshApps: () => renderApps(filterCurrentApps())
    };
    initializeStaticSidebarEvents(uiCallbacks);
    
    initializeWebSocket();
    loadApps();
    showVersion();
    checkForUpdate();
    
    window.addEventListener('appsSynced', () => {
        //console.log('[SAUS] Apps synced, reloading...');
        loadApps();
    });

    document.addEventListener('click', (event) => {
        const detailsCol = document.getElementById('app-details-col');
        if (detailsCol && !detailsCol.classList.contains('hidden')) {
            const isModal = event.target.closest && event.target.closest('.modal-overlay');
            if (!detailsCol.contains(event.target) && !isModal) {
                detailsCol.classList.add('hidden');
            }
        }
    });
}
