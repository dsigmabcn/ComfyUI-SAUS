import { PreferencesManager } from '/core/js/common/scripts/preferences.js';
import { PromptServerClient } from './websocket.js';
import { SettingsComponent } from '../../core/js/common/components/settings.js';

let allApps = [];
let categories = [];
let selectedCategories = new Set();
let selectedTags = new Set();
let allTags = new Set();
let hideDescriptions = false;
let hideTitles = false;
let favorites = new Set();
let favoritesFilterActive = false;
let sidebarFilter = null; // Add this line to define the variable
let ARCHITECTURES = {};
let MODELS_DATA = {};
let settingsComponent = null;

let hiddenApps = new Set();
const HIDDEN_APPS_KEY = 'HiddenApps';

const hiddenAppIds = [
];

const noshowAppIds = [
    'flupdate',
    'fltuts',
];

const FAVORITES_KEY = 'AppFavorites';


const priorityAppIds = [];

const defaultPreferences = {
    selectedCategories: [],
    favoritesFilterActive: false,
    hideDescriptions: false,
    hideTitles: false,
    sortValue: 'nameAsc',
    showHiddenOnly: false, 
    selectedTheme: null,
    typeFilter: 'all'
};

const preferencesManager = new PreferencesManager(defaultPreferences);

checkForUpdate();

function loadHiddenApps() {
    const storedHidden = localStorage.getItem(HIDDEN_APPS_KEY);
    if (storedHidden) {
        try {
            const parsedHidden = JSON.parse(storedHidden);
            hiddenApps = new Set(parsedHidden);
        } catch (e) {
            console.error('Error parsing hidden apps from localStorage:', e);
            hiddenApps = new Set();
        }
    }
    
    hiddenAppIds.forEach(appId => hiddenApps.add(appId));
    
    saveHiddenApps(); 
}

function saveHiddenApps() {
    localStorage.setItem(HIDDEN_APPS_KEY, JSON.stringify(Array.from(hiddenApps)));
}


function loadFavorites() {
    const storedFavorites = localStorage.getItem(FAVORITES_KEY);
    if (storedFavorites) {
        try {
            const parsedFavorites = JSON.parse(storedFavorites);
            favorites = new Set(parsedFavorites);
        } catch (e) {
            console.error('Error parsing favorites from localStorage:', e);
            favorites = new Set();
        }
    }
}

function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)));
}

function isFavorited(appId) {
    return favorites.has(appId);
}

function toggleFavorite(appId, button) {
    if (favorites.has(appId)) {
        favorites.delete(appId);
        button.classList.remove('favorited');
        button.innerHTML = '<i class="far fa-star"></i>';
    } else {
        favorites.add(appId);
        button.classList.add('favorited');
        button.innerHTML = '<i class="fas fa-star"></i>';
    }
    saveFavorites();
    animateAppReorder();
}

const createElement = (type, className, textContent = '') => {
    const element = document.createElement(type);
    element.className = className;
    element.textContent = textContent;
    return element;
};

function createAppCard(app) {
     if (noshowAppIds.includes(app.id)) {
        return null; 
    }

    const card = createElement('div', 'app-card');
    
    let thumbnailUrl = `saus/${app.url}/media/thumbnail.jpg`;
    let defaultThumbnail = '/core/media/ui/saus_logo.png';
    
    const favoriteButton = document.createElement('button');
    favoriteButton.classList.add('favorite-button');
    favoriteButton.innerHTML = isFavorited(app.id) ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    if (isFavorited(app.id)) {
        favoriteButton.classList.add('favorited');
    }

    favoriteButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(app.id, favoriteButton);
    });

    function sanitizeHTML(str) {
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }

    const imageContainer = document.createElement('div');
    imageContainer.className = 'app-image-container';
    imageContainer.innerHTML = `
        <img src="${sanitizeHTML(thumbnailUrl)}" alt="${sanitizeHTML(app.name)} Thumbnail" onerror="this.onerror=null; this.src='${sanitizeHTML(defaultThumbnail)}';" class="thumbnail-image">
        <div class="play-overlay" title="Open App"><i class="fas fa-play"></i></div>
    `;
    imageContainer.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(`saus/${app.url}`, '_blank');        
    });
    
    const infoButton = document.createElement('button');
    infoButton.classList.add('open-button');
    infoButton.innerHTML = '<i class="fas fa-info"></i>';
    infoButton.title = 'App Info and model management';

    infoButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showAppDetails(app);
    });

    const tagsHtml = (app.tags) 
        ? `<div class="app-tags">
            ${(app.tags.type || []).map(tag => `<span class="app-tag tag-type">${sanitizeHTML(tag)}</span>`).join('')}
            ${(app.tags.base_models || []).map(tag => `<span class="app-tag tag-base">${sanitizeHTML(tag)}</span>`).join('')}
            ${(app.tags.other || []).map(tag => `<span class="app-tag tag-other">${sanitizeHTML(tag)}</span>`).join('')}
           </div>`
        : '';

    card.innerHTML = `
        <div class="app-card-content">
            <h3 class="app-title">${sanitizeHTML(app.name)}</h3>
            <!--<p class="app-description">${sanitizeHTML(app.description)}</p>-->
            ${tagsHtml}
            <div class="app-status">
                Models: <span class="status-text status-loading">Checking...</span>
            </div>
        </div>
    `;
    
    card.insertBefore(imageContainer, card.firstChild);
    card.appendChild(infoButton);
    card.appendChild(favoriteButton);

    if (app.app_type) {
        const badge = document.createElement('div');
        badge.className = `app-type-badge type-${app.app_type}`;
        badge.title = `${app.app_type} workflow`;
        
        let iconClass = 'fa-layer-group';
        switch(app.app_type) {
            case 'gold': iconClass = 'fa-crown'; break;
            case 'beta': iconClass = 'fa-flask'; break;
            case 'user': iconClass = 'fa-user'; break;
            case 'open': iconClass = 'fa-box-open'; break;
        }
        
        badge.innerHTML = `<i class="fas ${iconClass}"></i>`;
        card.appendChild(badge);
    }

    /*card.appendChild(hiddenButton);*/
    card.dataset.appId = app.id;

    // Trigger async status check
    const statusEl = card.querySelector('.status-text');
    
    statusEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showAppDetails(app);
    });
    
    updateAppStatus(app, statusEl);

    return card;
}


export async function loadApps() {
    try {
        // Fetch Architectures and Model Data first
        const [archResponse, modelsResponse] = await Promise.all([
            fetch('/saus/api/architectures'),
            fetch('/saus/api/data-model-info')
        ]);

        if (archResponse.ok) ARCHITECTURES = await archResponse.json();
        if (modelsResponse.ok) MODELS_DATA = await modelsResponse.json();

        const response = await fetch('/saus/api/apps');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allApps = await response.json();
        console.log("[SAUS] Loaded apps data:", allApps);

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
        allTags.clear();
        allApps.forEach(app => {
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
                app.flatTags.forEach(tag => allTags.add(tag));
            }
        });
        
        
        
        categories = Array.from(uniqueCategories);
        console.log(categories);

        //allApps = assignCategories(allApps);
        //categories = updateGlobalCategories(allApps);
        renderSidebarCategories(); // <-- Add this line here
        renderTagsFilter();
        renderApps(filterCurrentApps());
        showHome(); // Show home page by default on load
    } catch (error) {
        console.error('Error fetching apps:', error);
    }
}

async function checkModelStatus(fileId, modelPath) {
    if (!modelPath) return 'missing';
    try {
        const query = new URLSearchParams({
            file_id: fileId,
            model_path: modelPath
        }).toString();

        const response = await fetch(`/saus/api/model-status?${query}`);
        if (!response.ok) return 'error';
        
        const data = await response.json();
        return data.status || 'missing';
    } catch (error) {
        console.error("Error checking model status:", error);
        return 'error';
    }
}

async function updateAppStatus(app, statusElement) {
    if (!app.architecture || !ARCHITECTURES[app.architecture]) {
        statusElement.textContent = "Unknown";
        statusElement.className = "status-text";
        return;
    }

    const arch = ARCHITECTURES[app.architecture];
    const components = arch.components || {};
    const compulsory = components.compulsory || [];
    const atLeastOne = components.at_least_one || [];

    let readyCompulsoryCount = 0;
    let readyAtLeastOneCount = 0;

    // Helper to check a list of components
    const checkComponents = async (componentList) => {
        let readyCount = 0;
        for (const compKey of componentList) {
            const modelInfo = MODELS_DATA[compKey];
            if (modelInfo) {
                const status = await checkModelStatus(modelInfo.id, modelInfo.model_path);
                if (status === 'ready') readyCount++;
            }
        }
        return readyCount;
    };

    // Check compulsory
    readyCompulsoryCount = await checkComponents(compulsory);
    
    // Check at least one (only if the list is not empty)
    if (atLeastOne.length > 0) {
        // Optimization: we can stop after finding one, but for simplicity we check logic here
        // To be strictly correct with "At Least One", we just need 1.
        for (const compKey of atLeastOne) {
            const modelInfo = MODELS_DATA[compKey];
            if (modelInfo) {
                const status = await checkModelStatus(modelInfo.id, modelInfo.model_path);
                if (status === 'ready') {
                    readyAtLeastOneCount++;
                    break; // Found one, that's enough
                }
            }
        }
    }

    const compulsoryMet = compulsory.length === 0 || readyCompulsoryCount === compulsory.length;
    const atLeastOneMet = atLeastOne.length === 0 || readyAtLeastOneCount > 0;

    if (compulsoryMet && atLeastOneMet) {
        statusElement.textContent = "Installed";
        statusElement.className = "status-text status-ready";
    } else if (readyCompulsoryCount > 0 || readyAtLeastOneCount > 0) {
        statusElement.textContent = "Partially";
        statusElement.className = "status-text status-partial";
    } else {
        statusElement.textContent = "Missing";
        statusElement.className = "status-text status-missing";
    }
}

async function showAppDetails(app) {
    const detailsCol = document.getElementById('app-details-col');
    const detailsContent = document.getElementById('app-details-content');
    
    if (!detailsCol || !detailsContent) return;

    detailsCol.classList.remove('hidden');
    detailsContent.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading details...</div>';

    let html = `
        <div class="details-header">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <h2 class="details-title">${app.name}</h2>
                <button class="btn-action" onclick="document.getElementById('app-details-col').classList.add('hidden')" style="padding:4px 8px;"><i class="fas fa-times"></i></button>
            </div>
            <div class="details-arch">Architecture: ${app.architecture || 'Unknown'}</div>
            <p class="details-description">${app.description}</p>
            <div style="margin-top:10px;">
                <button class="btn-action" onclick="window.open('saus/${app.url}', '_blank')"><i class="fas fa-play"></i> Open App</button>
                <button class="btn-action" onclick="window.open('/${app.url}', '_blank')"><i class="fas fa-play"></i> Open App</button>
            </div>
        </div>
    `;

    if (app.architecture && ARCHITECTURES[app.architecture]) {
        const arch = ARCHITECTURES[app.architecture];
        const components = arch.components || {};
        
        const compulsoryHtml = await renderComponentList("Compulsory Models", components.compulsory);
        const atLeastOneHtml = await renderComponentList("At Least One Required", components.at_least_one);
        const optionalHtml = await renderComponentList("Optional Models", components.optional);
        
        html += compulsoryHtml + atLeastOneHtml + optionalHtml;
    } else {
        html += `<p>No architecture information available.</p>`;
    }

    detailsContent.innerHTML = html;
}

async function renderComponentList(title, componentKeys) {
    if (!componentKeys || componentKeys.length === 0) return '';

    let html = `<div class="component-section"><h4>${title}</h4>`;
    
    // Use Promise.all to fetch statuses in parallel
    const items = await Promise.all(componentKeys.map(async (key) => {
        const model = MODELS_DATA[key];
        if (!model) return '';
        
        const status = await checkModelStatus(model.id, model.model_path);
        const isReady = status === 'ready';
        
        return `
            <div class="component-item" data-file-id="${model.id}">
                <div class="component-info">
                    <span class="component-name">${model.name}</span>
                    <span class="component-filename">${model.id}</span>
                </div>
                <div class="component-actions">
                    <span class="status-badge ${isReady ? 'ready' : 'missing'}">${isReady ? 'Installed' : 'Missing'}</span>
                    ${isReady 
                        ? `<button class="btn-action delete" onclick="deleteModel('${model.id}', '${model.model_path}')">Uninstall</button>`
                        //: `<button class="btn-action" onclick="downloadModel('${model.type}', '${model.url_model}', '${model.model_path}', '${model.id}')">Install</button>`//
                        : `<button class="btn-action" onclick="downloadModel('${model.type}', '${model.url_model}', '${model.model_path}', '${model.id}', event)">Install</button>`
                    }
                </div>
            </div>
        `;
    }));

    html += items.join('');
    html += `</div>`;
    return html;
}

function updateComponentStatus(fileId, status, progress = 0) {
    if (!fileId) {
        console.warn("[SAUS] Received update without fileId. Please restart your ComfyUI server to apply backend changes.");
        return;
    }
    console.log(`[SAUS] updateComponentStatus: ${fileId} -> ${status} (${progress}%)`);

    if (status === 'ready' || status === 'missing') {
        const AppCards = document.querySelectorAll('.app-card');
        AppCards.forEach(card => {
            const AppId = card.dataset.appId;
            const app = allApps.find(f => f.id === AppId);
            const statusEl = card.querySelector('.status-text');
            if (app && statusEl) {
                statusEl.textContent = "Checking...";
                statusEl.className = "status-text status-loading";
                updateAppStatus(app, statusEl);
            }
        });
    }

    const item = document.querySelector(`.component-item[data-file-id="${fileId}"]`);
    if (!item) return;

    const actions = item.querySelector('.component-actions');
    
    // We need model info to reconstruct buttons, but we can grab path from existing onclick if needed
    // Or simpler: just update the innerHTML of actions based on status
    // Since we don't have the full model object here easily without looking it up in MODELS_DATA
    // We can iterate MODELS_DATA to find the model by ID if needed, or store path in DOM.
    
    // Let's find the model data
    let model = null;
    for (const key in MODELS_DATA) {
        if (MODELS_DATA[key].id === fileId) {
            model = MODELS_DATA[key];
            break;
        }
    }
    if (!model) return;

    if (status === 'downloading') {
        actions.innerHTML = `
            <span class="status-badge downloading">Downloading ${progress}%</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div>
        `;
    } else if (status === 'ready') {
        actions.innerHTML = `
            <span class="status-badge ready">Installed</span>
            <button class="btn-action delete" onclick="deleteModel('${model.id}', '${model.model_path}')">Uninstall</button>
        `;
    } else if (status === 'missing') {
        actions.innerHTML = `
            <span class="status-badge missing">Missing</span>
            <!--<button class="btn-action" onclick="downloadModel('${model.type}', '${model.url_model}', '${model.model_path}', '${model.id}')">Install</button>-->
            <button class="btn-action" onclick="downloadModel('${model.type}', '${model.url_model}', '${model.model_path}', '${model.id}', event)">Install</button>
        `;
    }
}

// Expose functions to window for onclick handlers
//window.downloadModel = async function(componentType, urlModel, modelPath, fileId) {//
window.downloadModel = async function(componentType, urlModel, modelPath, fileId, event) {
    if (event) event.stopPropagation();
    if (!modelPath) {
        alert("Cannot download: Model path is missing configuration.");
        return;
    }
    if (!confirm(`Download ${componentType}?\nURL: ${urlModel}`)) return;
    
    // Optimistic UI update
    if (fileId) updateComponentStatus(fileId, 'downloading', 0);

    try {
        const response = await fetch('/saus/api/download-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ component_type: componentType, url_model: urlModel, model_path: modelPath, file_name: fileId })
        });
        const result = await response.json();
        if (response.ok) {
            // Download started
        } else {
            alert(result.message);
            if (fileId) updateComponentStatus(fileId, 'missing');
        }
    } catch (e) {
        console.error(e);
        alert('Error initiating download');
        if (fileId) updateComponentStatus(fileId, 'missing');
    }
};

window.deleteModel = async function(fileId, modelPath) {
    if (!confirm(`Are you sure you want to delete ${fileId}?`)) return;

    try {
        const response = await fetch('/saus/api/delete-model', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file_id: fileId, model_path: modelPath })
        });
        const result = await response.json();
        
        if (response.ok) {
            updateComponentStatus(fileId, 'missing');
        } else {
            alert(result.message);
        }
    } catch (e) {
        console.error(e);
        alert('Error deleting file');
    }
};

function createToggleButtons() {
    const controlsDiv = document.querySelector('.right-controls');
    
    favoritesFilterActive = preferencesManager.get('favoritesFilterActive');
  
    const favoritesToggle = createElement('button', 'toggle-button');
    favoritesToggle.id = 'favoritesToggle';
    favoritesToggle.innerHTML = favoritesFilterActive ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    favoritesToggle.title = favoritesFilterActive ? 'Show All Apps' : 'Show Favorites';
    
    controlsDiv.appendChild(favoritesToggle);
    
    favoritesToggle.addEventListener('click', () => toggleFavoritesFilter(favoritesToggle));
    
    favoritesToggle.classList.toggle('active', favoritesFilterActive);
    
}

function toggleFavoritesFilter(button) {
    favoritesFilterActive = !favoritesFilterActive;
    preferencesManager.set('favoritesFilterActive', favoritesFilterActive);
    button.classList.toggle('active', favoritesFilterActive);
    button.innerHTML = favoritesFilterActive ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    button.title = favoritesFilterActive ? 'Show All Apps' : 'Show Favorites';
    renderApps(filterCurrentApps());
}

function updateAppCardVisibility() {
    const appCards = document.querySelectorAll('.app-card');
    appCards.forEach(card => {
        const title = card.querySelector('.app-title');
        const description = card.querySelector('.app-description');
        
        if (title) title.style.display = hideTitles ? 'none' : 'block';
        if (description) description.style.display = (hideTitles || hideDescriptions) ? 'none' : 'block';
    });
}


function filterCurrentApps() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const sortValue = preferencesManager.get('sortValue') || 'nameAsc';
    const typeFilter = preferencesManager.get('typeFilter') || 'all';    
    let filteredApps = allApps;
    
    //ADDED
    filteredApps = filteredApps.filter(app => 
        (app.name.toLowerCase().includes(searchTerm) || 
         app.description.toLowerCase().includes(searchTerm) ||
         (app.category && app.category.toLowerCase().includes(searchTerm)))
    );
    
    if (selectedTags.size > 0) {
        filteredApps = filteredApps.filter(app => 
            app.flatTags && app.flatTags.some(tag => selectedTags.has(tag))
        );
    }

    if (sidebarFilter) {
        filteredApps = filteredApps.filter(app => {                        
            return app.category && app.category.toLowerCase().includes(sidebarFilter.toLowerCase());
        });
    }

    if (typeFilter !== 'all') {
        filteredApps = filteredApps.filter(app => app.app_type === typeFilter);
    }

    
    if (favoritesFilterActive) {
        filteredApps = filteredApps.filter(app => isFavorited(app.id));
    }

    filteredApps = filteredApps.filter(app => !noshowAppIds.includes(app.id));

    filteredApps = sortApps(filteredApps, sortValue);
    return filteredApps;
}

function renderApps(app) {
    const appGrid = document.getElementById('appGrid');
    appGrid.innerHTML = '';
    app.forEach(app => {
        if (app.id !== 'menu') {
            const appCard = createAppCard(app);
            if (appCard) { 
                appGrid.appendChild(appCard);
            }
        }
    });
    updateAppCardVisibility();
}

function animateAppReorder() {
    const appGrid = document.getElementById('appGrid');
    const oldPositions = new Map();
    Array.from(appGrid.children).forEach(card => {
        const rect = card.getBoundingClientRect();
        oldPositions.set(card.dataset.appId, rect);
    });

    renderApps(filterCurrentApps());

    Array.from(appGrid.children).forEach(card => {
        const oldRect = oldPositions.get(card.dataset.appId);
        const newRect = card.getBoundingClientRect();

        const deltaX = oldRect.left - newRect.left;
        const deltaY = oldRect.top - newRect.top;
        card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        card.offsetHeight;
        card.style.transition = 'transform 0.5s ease';
        card.style.transform = '';
    });

    setTimeout(() => {
        Array.from(appGrid.children).forEach(card => {
            card.style.transition = '';
            card.style.transform = '';
        });
    }, 500);
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

function initializeSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', debounce(() => {
        const filteredApps = filterCurrentApps();
        renderApps(filteredApps);
    }, 300));
    
    const initialSearchTerm = searchInput.value.toLowerCase();
    if (initialSearchTerm) {
        renderApps(filterCurrentApps());
    }
}

function initializeSorting() {
    const sortSelect = document.getElementById('sortSelect');
    const savedSortValue = preferencesManager.get('sortValue') || 'nameAsc';
    sortSelect.value = savedSortValue;
    
    sortSelect.addEventListener('change', () => {
        const newSortValue = sortSelect.value;
        preferencesManager.set('sortValue', newSortValue);
        const filteredApps = filterCurrentApps();
        renderApps(filteredApps);
    });
}

function initializeTypeFiltering() {
    const typeSelect = document.getElementById('typeFilterSelect');
    if (!typeSelect) return;
    
    const savedTypeFilter = preferencesManager.get('typeFilter') || 'all';
    typeSelect.value = savedTypeFilter;
    
    typeSelect.addEventListener('change', () => {
        const newTypeFilter = typeSelect.value;
        preferencesManager.set('typeFilter', newTypeFilter);
        renderApps(filterCurrentApps());
    });
}

function sortApps(apps, sortValue) {
    let sortedApps = [...apps];
    
    switch(sortValue) {
        case 'nameAsc':
            sortedApps.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'nameDesc':
            sortedApps.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'categoryAsc':
            sortedApps.sort((a, b) => {
                const catA = a.categories;//[0];
                const catB = b.categories;//[0];
                const indexA = categories.indexOf(catA);
                const indexB = categories.indexOf(catB);
                return indexA - indexB || a.name.localeCompare(b.name);
            });
            break;
        case 'categoryDesc':
            sortedApps.sort((a, b) => {
                const catA = a.categories;//[0];
                const catB = b.categories;//[0];
                const indexA = categories.indexOf(catA);
                const indexB = categories.indexOf(catB);
                return indexB - indexA || a.name.localeCompare(b.name);
            });
            break;
    }

    const topPriorityIds = [
        // 'flupdate', 
        // 'fltuts'
    ];
    const topPriorityApps = [];
    const remainingApps = [];
    
    sortedApps.forEach(app => {
        if (topPriorityIds.includes(app.id)) {
            topPriorityApps.push(app);
        } else {
            remainingApps.push(app);
        }
    });
    
    topPriorityApps.sort((a, b) => {
        return topPriorityIds.indexOf(a.id) - topPriorityIds.indexOf(b.id);
    });

    const favoriteApps = [];
    const nonfavoriteApps = [];

    remainingApps.forEach(app => {
        if (isFavorited(app.id)) {
            favoriteApps.push(app);
        } else {
            nonfavoriteApps.push(app);
        }
    });

    const otherPriorityIds = priorityAppIds.filter(id => !topPriorityIds.includes(id));
    const otherPriorityApps = [];
    const restApps = [];

    nonfavoriteApps.forEach(app => {
        if (otherPriorityIds.includes(app.id)) {
            otherPriorityApps.push(app);
        } else {
            restApps.push(app);
        }
    });

    otherPriorityApps.sort((a, b) => {
        return otherPriorityIds.indexOf(a.id) - otherPriorityIds.indexOf(b.id);
    });

    sortedApps = [...topPriorityApps, ...favoriteApps, ...otherPriorityApps, ...restApps];

    return sortedApps;
}

function renderTagsFilter() {
    const tagsContainer = document.getElementById('tagsContainer');
    if (!tagsContainer) return;
    tagsContainer.innerHTML = '';
    
    const visibleTypeTags = new Set();
    const visibleBaseTags = new Set();
    const visibleOtherTags = new Set();

    allApps.forEach(app => {
        if (noshowAppIds.includes(app.id)) return;

        let matchesCategory = true;
        if (sidebarFilter) {
            matchesCategory = app.category && app.category.toLowerCase().includes(sidebarFilter.toLowerCase());
        }

        if (matchesCategory && app.tags) {
            if (Array.isArray(app.tags)) {
                 app.tags.forEach(tag => visibleOtherTags.add(tag));
            } else {
                (app.tags.type || []).forEach(tag => visibleTypeTags.add(tag));
                (app.tags.base_models || []).forEach(tag => visibleBaseTags.add(tag));
                (app.tags.other || []).forEach(tag => visibleOtherTags.add(tag));
            }
        }
    });

    const createChip = (tag, typeClass) => {
        const chip = createElement('div', `tag-chip ${typeClass}`, tag);
        if (selectedTags.has(tag)) {
            chip.classList.add('selected');
        }
        chip.addEventListener('click', (e) => toggleTag(tag, e));
        tagsContainer.appendChild(chip);
    };

    Array.from(visibleTypeTags).sort().forEach(tag => createChip(tag, 'tag-type'));
    Array.from(visibleBaseTags).sort().forEach(tag => createChip(tag, 'tag-base'));
    Array.from(visibleOtherTags).sort().forEach(tag => createChip(tag, 'tag-other'));
}

function toggleTag(tag, event) {
    if (event.ctrlKey || event.metaKey) {
        if (selectedTags.has(tag)) {
            selectedTags.delete(tag);
        } else {
            selectedTags.add(tag);
        }
    } else {
        if (selectedTags.has(tag) && selectedTags.size === 1) {
            selectedTags.clear();
        } else {
            selectedTags.clear();
            selectedTags.add(tag);
        }
    }
    renderTagsFilter();
    renderApps(filterCurrentApps());
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

function initializeFilterMenu() {
    // Removed old filter menu initialization
}

// For the sidebar filters
function initializeSidebarFilters() {
    const sidebarLinks = document.querySelectorAll('.sidebar-filter-category');
    const sectionHeaders = document.querySelectorAll('.sidebar-section-header');

    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            const categoryName = link.dataset.category; // Get the category name
            console.log(`Filtering by sidebar category: ${categoryName}`); // Log the category
            showApps(); // Switch to apps view

            sidebarLinks.forEach(l => l.classList.remove('active'));
            sectionHeaders.forEach(h => h.classList.remove('active-section'));
            
            sidebarFilter = categoryName;
            link.classList.add('active');
            const parentSection = link.closest('.sidebar-section');
            if (parentSection) {
                const header = parentSection.querySelector('.sidebar-section-header');
                if (header) header.classList.add('active-section');
            }
            
            selectedTags.clear();
            renderTagsFilter();
            document.getElementById('searchInput').value = '';
            
            renderApps(filterCurrentApps());
        });
    });
}

function initializeStaticSidebarEvents() {
    const resetLink = document.getElementById('resetFiltersLink');
    const homeLink = document.getElementById('homeLink');

    if (homeLink) {
        homeLink.addEventListener('click', (event) => {
            event.preventDefault();
            showHome();
        });
    }

    if (resetLink) {
        resetLink.addEventListener('click', (event) => {
            event.preventDefault();
            console.log('Resetting all sidebar filters.'); // Log the reset action
            showApps(); // Switch to Apps view
            sidebarFilter = null;
            selectedCategories.clear();
            document.getElementById('searchInput').value = '';
                document.querySelectorAll('.sidebar-filter-category').forEach(l => l.classList.remove('active'));
                document.querySelectorAll('.sidebar-section-header').forEach(h => h.classList.remove('active-section'));
            selectedTags.clear();
            renderTagsFilter();
            renderApps(filterCurrentApps());
        });
    }

    // Handle Settings Link (Delegation since header is injected)
    document.addEventListener('click', (event) => {
        const target = event.target.closest('a');
        if (target && (target.id === 'settingsLink' || target.getAttribute('href') === '#settings')) {
            event.preventDefault();
            showSettings();
        }
    });
}

function showHome() {
    const homeContainer = document.getElementById('homeContainer');
    const appGrid = document.getElementById('appGrid');
    const detailsCol = document.getElementById('app-details-col');
    const controls = document.querySelector('.controls');
    
    if (homeContainer) homeContainer.classList.remove('hidden');
    if (appGrid) appGrid.classList.add('hidden');
    if (detailsCol) detailsCol.classList.add('hidden');
    if (controls) controls.classList.add('hidden');
    
    if (settingsComponent) settingsComponent.hide();

    document.querySelectorAll('.sidebar-filter-category').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-section-header').forEach(el => el.classList.remove('active-section'));
    document.getElementById('resetFiltersLink')?.classList.remove('active');
    document.getElementById('homeLink')?.classList.add('active');
}

function showApps() {
    document.getElementById('homeContainer')?.classList.add('hidden');
    document.getElementById('appGrid')?.classList.remove('hidden');
    document.querySelector('.controls')?.classList.remove('hidden');
    document.getElementById('homeLink')?.classList.remove('active');
    if (settingsComponent) settingsComponent.hide();
    document.getElementById('resetFiltersLink')?.classList.add('active');
}

async function showSettings() {
    document.getElementById('homeContainer')?.classList.add('hidden');
    document.getElementById('appGrid')?.classList.add('hidden');
    document.querySelector('.controls')?.classList.add('hidden');
    document.getElementById('app-details-col')?.classList.add('hidden');
    
    if (settingsComponent) settingsComponent.show();
    
    // Reset sidebar active states
    document.querySelectorAll('.sidebar-filter-category').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-section-header').forEach(el => el.classList.remove('active-section'));
    document.getElementById('resetFiltersLink')?.classList.remove('active');
    document.getElementById('homeLink')?.classList.remove('active');
}

// Define the fixed, preferred order for categories
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

// Define the icon map for each category
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
        icon: "fas fa-tools",
        categories: [] 
    }
};

// This is the updated function that creates and then initializes the elements
function renderSidebarCategories() {
    const container = document.getElementById('sidebarCategoriesContainer');
    // Clear all dynamically created category elements
    container.querySelectorAll('.sidebar-filter-category').forEach(el => el.remove());
    container.querySelectorAll('.sidebar-section').forEach(el => el.remove());

    // Group categories into sections
    const groupedCategories = {
        "AI Image": [],
        "AI Video": [],
        "Other": []
    };

    categories.forEach(cat => {
        if (SECTIONS_CONFIG["AI Image"].categories.includes(cat)) {
            groupedCategories["AI Image"].push(cat);
        } else if (SECTIONS_CONFIG["AI Video"].categories.includes(cat)) {
            groupedCategories["AI Video"].push(cat);
        } else {
            groupedCategories["Other"].push(cat);
        }
    });

    // Render Sections
    Object.keys(SECTIONS_CONFIG).forEach(sectionKey => {
        const sectionCats = groupedCategories[sectionKey];
        if (sectionCats.length === 0) return;

        // Sort categories within section
        sectionCats.sort((a, b) => {
            const indexA = CATEGORY_ORDER.indexOf(a);
            const indexB = CATEGORY_ORDER.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });

        // Create Section Container
        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'sidebar-section';
        sectionDiv.style.marginBottom = '5px';

        // Create Header
        const header = document.createElement('div');
        header.className = 'sidebar-section-header';
        header.style.cursor = 'pointer';
        header.style.padding = '8px 10px';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.userSelect = 'none';
        
        const iconClass = SECTIONS_CONFIG[sectionKey].icon;
        header.innerHTML = `<span><i class="${iconClass}"></i> ${sectionKey}</span> <i class="fas fa-chevron-right toggle-icon" style="font-size: 0.8em;"></i>`;

        // Create Content Container (Hidden by default)
        const contentDiv = document.createElement('div');
        contentDiv.className = 'sidebar-section-content';
        contentDiv.style.display = 'none';
        contentDiv.style.paddingLeft = '15px';

        // Toggle Event
        header.addEventListener('click', () => {
            const isHidden = contentDiv.style.display === 'none';
            contentDiv.style.display = isHidden ? 'block' : 'none';
            const icon = header.querySelector('.toggle-icon');
            if (icon) {
                icon.className = isHidden ? 'fas fa-chevron-down toggle-icon' : 'fas fa-chevron-right toggle-icon';
            }
        });

        // Append Categories
        sectionCats.forEach(category => {
            const span = document.createElement('span');
            const catIcon = CATEGORY_ICONS[category] || CATEGORY_ICONS["other"];
            span.className = 'sidebar-filter-category';
            span.dataset.category = category;
            span.innerHTML = `<i class="${catIcon}"></i> ${category}`;
            // Basic styling to ensure it looks clickable
            
            contentDiv.appendChild(span);
        });

        sectionDiv.appendChild(header);
        sectionDiv.appendChild(contentDiv);
        container.appendChild(sectionDiv);
    });

    // NOW that the new elements are in the DOM, re-run the initialization logic
    initializeSidebarFilters();
}

function initializeWebSocket() {
    const client = new PromptServerClient();
    
    client.on('model_download_progress', (e) => {
        console.log('[SAUS] WS Progress:', e.detail);
        const { file_name, progress } = e.detail;
        updateComponentStatus(file_name, 'downloading', progress);
    });

    client.on('model_download_complete', (e) => {
        console.log('[SAIS] WS Complete:', e.detail);
        const { file_name } = e.detail;
        updateComponentStatus(file_name, 'ready');
    });
}

function initializeHiddenApps() {
    loadHiddenApps();
}

export function initializeUI() {
    // Initialize Settings Component
    settingsComponent = new SettingsComponent('.mid-col');

    loadFavorites();
    initializeHiddenApps();
    initializeMenu();
    initializeSearch();
    initializeSorting();
    initializeTypeFiltering();
    initializeFilterMenu();
    createToggleButtons();    
    initializeStaticSidebarEvents();
    initializeWebSocket();
    loadApps();
    showVersion();
    
    window.addEventListener('appsSynced', () => {
        console.log('[SAUS] Apps synced, reloading...');
        loadApps();
    });

    document.addEventListener('click', (event) => {
        const detailsCol = document.getElementById('app-details-col');
        if (detailsCol && !detailsCol.classList.contains('hidden')) {
            if (!detailsCol.contains(event.target)) {
                detailsCol.classList.add('hidden');
            }
        }
    });
}

export async function getVersion() {
    try {
        const response = await fetch('/saus/api/saus-version');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const versionData = await response.json();
        return versionData.version; 
    } catch (error) {
        console.error('Error fetching version:', error);
        throw error; 
    }
}

export async function showVersion() {
    const currentVersion = await getVersion();
    document.getElementById('copyright').innerText = currentVersion
}

function isNewerVersion(current, latest) {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const curr = currentParts[i] || 0;
        const lat = latestParts[i] || 0;
        if (lat > curr) return true;
        if (lat < curr) return false;
    }
    return false;
}

function createFloatingCharacter(currentVersion) {
    const floatingHTML = `
        <div class="floating-update-character">
            <img src="/core/media/ui/update_logo.png" alt="Update Character" />
            <div class="update-indicator">
                <span class="update-dot"></span>
                <span class="version-label">${currentVersion}</span>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', floatingHTML);

    const floatingCharacter = document.querySelector('.floating-update-character');
    return floatingCharacter;
}

function showUpdateDialog(currentVersion, latestVersion) {
    const dialogHTML = `
        <div class="update-dialog-overlay">
            <div class="update-dialog-container">
                <div class="update-character">
                    <img src="/core/media/ui/update_logo.png" alt="Update Avatar" />
                </div>
                <div class="update-dialog">
                    <div class="update-content">
                        <h2>New Update Available!</h2>
                        <p>Version ${latestVersion} is ready to install</p>
                        <p class="version-info">Current version: ${currentVersion}</p>
                        
                        <div class="update-actions">
                            <button class="update-now-btn">
                                <span class="btn-text">Send me to ComfyUI to Update Now</span>
                                <span class="btn-icon">→</span>
                            </button>
                            <button class="remind-later-btn">Later</button>
                        </div>
                    </div>
                </div>
                <button class="close-dialog-btn" aria-label="Close">&times;</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    const overlay = document.querySelector('.update-dialog-overlay');
    const updateNowBtn = document.querySelector('.update-now-btn');
    const remindLaterBtn = document.querySelector('.remind-later-btn');
    const closeBtn = document.querySelector('.close-dialog-btn');

    function closeDialog() {
        overlay.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => overlay.remove(), 300); 
    }

    updateNowBtn.addEventListener('click', () => {
        const origin = window.location.origin;
        
        const urlToOpen = `${origin}`;
        window.open(urlToOpen, '_blank');
        closeDialog();
        setFloatingCharacter(currentVersion, latestVersion)
    });

    remindLaterBtn.addEventListener('click', () => {
        // localStorage.setItem('lastUpdateReminder', Date.now());
        closeDialog();
        setFloatingCharacter(currentVersion, latestVersion)
    });

    closeBtn.addEventListener('click', () => {
        closeDialog();
        setFloatingCharacter(currentVersion, latestVersion)
    });
}

function setFloatingCharacter(currentVersion, latestVersion) {
    if (isNewerVersion(currentVersion, latestVersion)) {
        if (!document.querySelector('.floating-update-character')) {
            const floatingCharacter = createFloatingCharacter(`New Update Available!`);
            
            floatingCharacter.addEventListener('click', () => {

                floatingCharacter.style.animation = 'moveUp  0.3s ease-out forwards';
                
                setTimeout(() => {
                    showUpdateDialog(currentVersion, latestVersion);
                    floatingCharacter.remove();
                }, 300);
            });
        }
    }
}

async function checkForUpdate() {
    try {
        const currentVersion = await getVersion();
        const rawURL = 'https://raw.githubusercontent.com/dsigmabcn/ComfyUI-SAUS/refs/heads/main/pyproject.toml';
        
        const response = await fetch(rawURL);
        if (!response.ok) {
            throw new Error(`Failed to fetch version info. HTTP status: ${response.status}`);
        }

        const tomlText = await response.text();
        const versionMatch = tomlText.match(/^version\s*=\s*"([^"]+)"/m);
        
        if (!versionMatch || versionMatch.length < 2) {
            throw new Error('Version information not found in pyproject.toml.');
        }

        const latestVersion = versionMatch[1];
        
        setFloatingCharacter(currentVersion, latestVersion)

    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}
