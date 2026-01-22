import { PreferencesManager } from '/core/js/common/scripts/preferences.js';
import ThemeManager from '/core/js/common/scripts/ThemeManager.js';
import injectStylesheet from '/core/js/common/scripts/injectStylesheet.js';
import { PromptServerClient } from './websocket.js';
import { SettingsComponent } from '../../core/js/common/components/settings.js';

let allFlows = [];
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

let hiddenFlows = new Set();
const HIDDEN_FLOWS_KEY = 'HiddenFlows';

const hiddenFlowIds = [
];

const noshowFlowIds = [
    'flupdate',
    'fltuts',
];

const FAVORITES_KEY = 'FlowFavorites';
const openInNewTab = false;

const priorityFlowIds = [];

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

function loadHiddenFlows() {
    const storedHidden = localStorage.getItem(HIDDEN_FLOWS_KEY);
    if (storedHidden) {
        try {
            const parsedHidden = JSON.parse(storedHidden);
            hiddenFlows = new Set(parsedHidden);
        } catch (e) {
            console.error('Error parsing hidden flows from localStorage:', e);
            hiddenFlows = new Set();
        }
    }
    
    hiddenFlowIds.forEach(flowId => hiddenFlows.add(flowId));
    
    saveHiddenFlows(); 
}

function saveHiddenFlows() {
    localStorage.setItem(HIDDEN_FLOWS_KEY, JSON.stringify(Array.from(hiddenFlows)));
}

function isHidden(flowId) {
    return hiddenFlows.has(flowId);
}

function toggleHidden(flowId, button) {
    if (hiddenFlows.has(flowId)) {
        hiddenFlows.delete(flowId);
        button.classList.remove('hidden');
        button.innerHTML = '<i class="fas fa-eye-slash" aria-label="Hide Flow"></i>';  
    } else {
        hiddenFlows.add(flowId);
        button.classList.add('hidden');
        button.innerHTML = '<i class="fas fa-eye" aria-label="Unhide Flow"></i>'; 
    }
    saveHiddenFlows();
    animateFlowReorder();
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

function isFavorited(flowId) {
    return favorites.has(flowId);
}

function toggleFavorite(flowId, button) {
    if (favorites.has(flowId)) {
        favorites.delete(flowId);
        button.classList.remove('favorited');
        button.innerHTML = '<i class="far fa-star"></i>';
    } else {
        favorites.add(flowId);
        button.classList.add('favorited');
        button.innerHTML = '<i class="fas fa-star"></i>';
    }
    saveFavorites();
    animateFlowReorder();
}

const createElement = (type, className, textContent = '') => {
    const element = document.createElement(type);
    element.className = className;
    element.textContent = textContent;
    return element;
};

function createFlowCard(flow) {
     if (noshowFlowIds.includes(flow.id)) {
        return null; 
    }

    const card = createElement('div', 'flow-card');
    
    let thumbnailUrl = `flow/${flow.url}/media/thumbnail.jpg`;
    let defaultThumbnail = '/core/media/ui/flow_logo.png';
    
    const favoriteButton = document.createElement('button');
    favoriteButton.classList.add('favorite-button');
    favoriteButton.innerHTML = isFavorited(flow.id) ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    if (isFavorited(flow.id)) {
        favoriteButton.classList.add('favorited');
    }

    favoriteButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        toggleFavorite(flow.id, favoriteButton);
    });

    function sanitizeHTML(str) {
        const temp = document.createElement('div');
        temp.textContent = str;
        return temp.innerHTML;
    }

    const imageContainer = document.createElement('div');
    imageContainer.className = 'flow-image-container';
    imageContainer.innerHTML = `
        <img src="${sanitizeHTML(thumbnailUrl)}" alt="${sanitizeHTML(flow.name)} Thumbnail" onerror="this.onerror=null; this.src='${sanitizeHTML(defaultThumbnail)}';" class="thumbnail-image">
        <div class="play-overlay" title="Open Flow"><i class="fas fa-play"></i></div>
    `;
    imageContainer.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        window.open(`flow/${flow.url}`, '_blank');
    });
    
    const infoButton = document.createElement('button');
    infoButton.classList.add('open-button');
    infoButton.innerHTML = '<i class="fas fa-info"></i>';
    infoButton.title = 'Flow Information';

    infoButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        showFlowDetails(flow);
    });

    const tagsHtml = (flow.tags) 
        ? `<div class="flow-tags">
            ${(flow.tags.type || []).map(tag => `<span class="flow-tag tag-type">${sanitizeHTML(tag)}</span>`).join('')}
            ${(flow.tags.base_models || []).map(tag => `<span class="flow-tag tag-base">${sanitizeHTML(tag)}</span>`).join('')}
            ${(flow.tags.other || []).map(tag => `<span class="flow-tag tag-other">${sanitizeHTML(tag)}</span>`).join('')}
           </div>`
        : '';

    card.innerHTML = `
        <div class="flow-card-content">
            <h3 class="flow-title">${sanitizeHTML(flow.name)}</h3>
            <!--<p class="flow-description">${sanitizeHTML(flow.description)}</p>-->
            ${tagsHtml}
            <div class="flow-status">
                Models: <span class="status-text status-loading">Checking...</span>
            </div>
        </div>
    `;
    
    card.insertBefore(imageContainer, card.firstChild);
    card.appendChild(infoButton);
    card.appendChild(favoriteButton);

    if (flow.flow_type) {
        const badge = document.createElement('div');
        badge.className = `flow-type-badge type-${flow.flow_type}`;
        badge.title = `${flow.flow_type} workflow`;
        
        let iconClass = 'fa-layer-group';
        switch(flow.flow_type) {
            case 'gold': iconClass = 'fa-crown'; break;
            case 'beta': iconClass = 'fa-flask'; break;
            case 'user': iconClass = 'fa-user'; break;
            case 'open': iconClass = 'fa-box-open'; break;
        }
        
        badge.innerHTML = `<i class="fas ${iconClass}"></i>`;
        card.appendChild(badge);
    }

    /*card.appendChild(hiddenButton);*/
    card.dataset.flowId = flow.id;

    // Trigger async status check
    const statusEl = card.querySelector('.status-text');
    
    statusEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showFlowDetails(flow);
    });
    
    updateFlowStatus(flow, statusEl);

    return card;
}


export async function loadFlows() {
    try {
        // Fetch Architectures and Model Data first
        const [archResponse, modelsResponse] = await Promise.all([
            fetch('/flow/api/architectures'),
            fetch('/flow/api/data-model-info')
        ]);

        if (archResponse.ok) ARCHITECTURES = await archResponse.json();
        if (modelsResponse.ok) MODELS_DATA = await modelsResponse.json();

        const response = await fetch('/flow/api/apps');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        allFlows = await response.json();
        console.log("[Flow] Loaded flows data:", allFlows);

        // Step 2: Fetch the separate list of categories (your flows_list.json)
        // You will need to replace this URL with the correct path to flows_list.json
        const categoriesResponse = await fetch('/flow/api/flows-list');
        if (!categoriesResponse.ok) {
            throw new Error(`HTTP error! status: ${categoriesResponse.status}`);
        }
        const categoriesData = await categoriesResponse.json();
        
        // Create a lookup map for faster access to categories by ID
        const metaMap = new Map(categoriesData.map(item => [item.id, item]));

        // Step 3: Assign categories to each flow from the separate data source
        const uniqueCategories = new Set();
        allTags.clear();
        allFlows.forEach(flow => {
            const meta = metaMap.get(flow.id);
            if (meta) {
                flow.category = meta.category;
                
                if (Array.isArray(meta.tags)) {
                     // Fallback for array
                     flow.tags = { type: [], base_models: [], other: meta.tags };
                     flow.flatTags = meta.tags;
                } else if (typeof meta.tags === 'object') {
                     const asArray = (val) => Array.isArray(val) ? val : (val ? [val] : []);
                     flow.tags = {
                        type: asArray(meta.tags.type),
                        base_models: asArray(meta.tags.base_models),
                        other: asArray(meta.tags.other)
                     };
                     flow.flatTags = [
                        ...flow.tags.type,
                        ...flow.tags.base_models,
                        ...flow.tags.other
                     ];
                } else {
                     flow.tags = { type: [], base_models: [], other: [] };
                     flow.flatTags = [];
                }

                flow.architecture = meta.architecture; // Get architecture from metadata
            } else {
                // Assign a default category if none is found
                flow.category = 'Other'; 
                flow.tags = { type: [], base_models: [], other: [] };
                flow.flatTags = [];
                flow.architecture = null;
            }
            uniqueCategories.add(flow.category);
            if (flow.flatTags) {
                flow.flatTags.forEach(tag => allTags.add(tag));
            }
        });
        
        
        
        categories = Array.from(uniqueCategories);
        console.log(categories);

        //allFlows = assignCategories(allFlows);
        //categories = updateGlobalCategories(allFlows);
        renderSidebarCategories(); // <-- Add this line here
        renderTagsFilter();
        renderFlows(filterCurrentFlows());
        showHome(); // Show home page by default on load
    } catch (error) {
        console.error('Error fetching flows:', error);
    }
}

async function checkModelStatus(fileId, modelPath) {
    if (!modelPath) return 'missing';
    try {
        const query = new URLSearchParams({
            file_id: fileId,
            model_path: modelPath
        }).toString();

        const response = await fetch(`/flow/api/model-status?${query}`);
        if (!response.ok) return 'error';
        
        const data = await response.json();
        return data.status || 'missing';
    } catch (error) {
        console.error("Error checking model status:", error);
        return 'error';
    }
}

async function updateFlowStatus(flow, statusElement) {
    if (!flow.architecture || !ARCHITECTURES[flow.architecture]) {
        statusElement.textContent = "Unknown";
        statusElement.className = "status-text";
        return;
    }

    const arch = ARCHITECTURES[flow.architecture];
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

async function showFlowDetails(flow) {
    const detailsCol = document.getElementById('flow-details-col');
    const detailsContent = document.getElementById('flow-details-content');
    
    if (!detailsCol || !detailsContent) return;

    detailsCol.classList.remove('hidden');
    detailsContent.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading details...</div>';

    let html = `
        <div class="details-header">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <h2 class="details-title">${flow.name}</h2>
                <button class="btn-action" onclick="document.getElementById('flow-details-col').classList.add('hidden')" style="padding:4px 8px;"><i class="fas fa-times"></i></button>
            </div>
            <div class="details-arch">Architecture: ${flow.architecture || 'Unknown'}</div>
            <p class="details-description">${flow.description}</p>
            <div style="margin-top:10px;">
                <button class="btn-action" onclick="window.open('flow/${flow.url}', '_blank')"><i class="fas fa-play"></i> Open Flow</button>
            </div>
        </div>
    `;

    if (flow.architecture && ARCHITECTURES[flow.architecture]) {
        const arch = ARCHITECTURES[flow.architecture];
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
        console.warn("[Flow] Received update without fileId. Please restart your ComfyUI server to apply backend changes.");
        return;
    }
    console.log(`[Flow] updateComponentStatus: ${fileId} -> ${status} (${progress}%)`);

    if (status === 'ready' || status === 'missing') {
        const flowCards = document.querySelectorAll('.flow-card');
        flowCards.forEach(card => {
            const flowId = card.dataset.flowId;
            const flow = allFlows.find(f => f.id === flowId);
            const statusEl = card.querySelector('.status-text');
            if (flow && statusEl) {
                statusEl.textContent = "Checking...";
                statusEl.className = "status-text status-loading";
                updateFlowStatus(flow, statusEl);
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
        const response = await fetch('/flow/api/download-model', {
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
        const response = await fetch('/flow/api/delete-model', {
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
    favoritesToggle.title = favoritesFilterActive ? 'Show All Flows' : 'Show Favorites';
    
    controlsDiv.appendChild(favoritesToggle);
    
    favoritesToggle.addEventListener('click', () => toggleFavoritesFilter(favoritesToggle));
    
    favoritesToggle.classList.toggle('active', favoritesFilterActive);
    
}

function toggleFavoritesFilter(button) {
    favoritesFilterActive = !favoritesFilterActive;
    preferencesManager.set('favoritesFilterActive', favoritesFilterActive);
    button.classList.toggle('active', favoritesFilterActive);
    button.innerHTML = favoritesFilterActive ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    button.title = favoritesFilterActive ? 'Show All Flows' : 'Show Favorites';
    renderFlows(filterCurrentFlows());
}

function updateFlowCardVisibility() {
    const flowCards = document.querySelectorAll('.flow-card');
    flowCards.forEach(card => {
        const title = card.querySelector('.flow-title');
        const description = card.querySelector('.flow-description');
        
        if (title) title.style.display = hideTitles ? 'none' : 'block';
        if (description) description.style.display = (hideTitles || hideDescriptions) ? 'none' : 'block';
    });
}


function filterCurrentFlows() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const sortValue = preferencesManager.get('sortValue') || 'nameAsc';
    const typeFilter = preferencesManager.get('typeFilter') || 'all';
    //let filteredFlows = filterFlows(allFlows, searchTerm, selectedCategories);
    let filteredFlows = allFlows;
    
    //ADDED
    filteredFlows = filteredFlows.filter(flow => 
        (flow.name.toLowerCase().includes(searchTerm) || 
         flow.description.toLowerCase().includes(searchTerm) ||
         (flow.category && flow.category.toLowerCase().includes(searchTerm)))
    );
    
    if (selectedTags.size > 0) {
        filteredFlows = filteredFlows.filter(flow => 
            flow.flatTags && flow.flatTags.some(tag => selectedTags.has(tag))
        );
    }

    if (sidebarFilter) {
        filteredFlows = filteredFlows.filter(flow => {
            //console.log(`Checking flow "${flow.name}" with category: ${flow.category}`); // Log the flow and its category
            console.log(`Checking flow "${flow.name}" with category: ${flow.category}`); // Log the flow and its category
            return flow.category && flow.category.toLowerCase().includes(sidebarFilter.toLowerCase());
        });
    }

    if (typeFilter !== 'all') {
        filteredFlows = filteredFlows.filter(flow => flow.flow_type === typeFilter);
    }

    
    if (favoritesFilterActive) {
        filteredFlows = filteredFlows.filter(flow => isFavorited(flow.id));
    }

    filteredFlows = filteredFlows.filter(flow => !noshowFlowIds.includes(flow.id));

    filteredFlows = sortFlows(filteredFlows, sortValue);
    return filteredFlows;
}

function renderFlows(flows) {
    const flowGrid = document.getElementById('flowGrid');
    flowGrid.innerHTML = '';
    flows.forEach(flow => {
        if (flow.id !== 'menu') {
            const flowCard = createFlowCard(flow);
            if (flowCard) { 
                flowGrid.appendChild(flowCard);
            }
        }
    });
    updateFlowCardVisibility();
}

function animateFlowReorder() {
    const flowGrid = document.getElementById('flowGrid');
    const oldPositions = new Map();
    Array.from(flowGrid.children).forEach(card => {
        const rect = card.getBoundingClientRect();
        oldPositions.set(card.dataset.flowId, rect);
    });

    renderFlows(filterCurrentFlows());

    Array.from(flowGrid.children).forEach(card => {
        const oldRect = oldPositions.get(card.dataset.flowId);
        const newRect = card.getBoundingClientRect();

        const deltaX = oldRect.left - newRect.left;
        const deltaY = oldRect.top - newRect.top;
        card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
        card.offsetHeight;
        card.style.transition = 'transform 0.5s ease';
        card.style.transform = '';
    });

    setTimeout(() => {
        Array.from(flowGrid.children).forEach(card => {
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
        const filteredFlows = filterCurrentFlows();
        renderFlows(filteredFlows);
    }, 300));
    
    const initialSearchTerm = searchInput.value.toLowerCase();
    if (initialSearchTerm) {
        renderFlows(filterCurrentFlows());
    }
}

function initializeSorting() {
    const sortSelect = document.getElementById('sortSelect');
    const savedSortValue = preferencesManager.get('sortValue') || 'nameAsc';
    sortSelect.value = savedSortValue;
    
    sortSelect.addEventListener('change', () => {
        const newSortValue = sortSelect.value;
        preferencesManager.set('sortValue', newSortValue);
        const filteredFlows = filterCurrentFlows();
        renderFlows(filteredFlows);
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
        renderFlows(filterCurrentFlows());
    });
}

function sortFlows(flows, sortValue) {
    let sortedFlows = [...flows];
    
    switch(sortValue) {
        case 'nameAsc':
            sortedFlows.sort((a, b) => a.name.localeCompare(b.name));
            break;
        case 'nameDesc':
            sortedFlows.sort((a, b) => b.name.localeCompare(a.name));
            break;
        case 'categoryAsc':
            sortedFlows.sort((a, b) => {
                const catA = a.categories;//[0];
                const catB = b.categories;//[0];
                const indexA = categories.indexOf(catA);
                const indexB = categories.indexOf(catB);
                return indexA - indexB || a.name.localeCompare(b.name);
            });
            break;
        case 'categoryDesc':
            sortedFlows.sort((a, b) => {
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
    const topPriorityFlows = [];
    const remainingFlows = [];
    
    sortedFlows.forEach(flow => {
        if (topPriorityIds.includes(flow.id)) {
            topPriorityFlows.push(flow);
        } else {
            remainingFlows.push(flow);
        }
    });
    
    topPriorityFlows.sort((a, b) => {
        return topPriorityIds.indexOf(a.id) - topPriorityIds.indexOf(b.id);
    });

    const favoriteFlows = [];
    const nonFavoriteFlows = [];

    remainingFlows.forEach(flow => {
        if (isFavorited(flow.id)) {
            favoriteFlows.push(flow);
        } else {
            nonFavoriteFlows.push(flow);
        }
    });

    const otherPriorityIds = priorityFlowIds.filter(id => !topPriorityIds.includes(id));
    const otherPriorityFlows = [];
    const restFlows = [];

    nonFavoriteFlows.forEach(flow => {
        if (otherPriorityIds.includes(flow.id)) {
            otherPriorityFlows.push(flow);
        } else {
            restFlows.push(flow);
        }
    });

    otherPriorityFlows.sort((a, b) => {
        return otherPriorityIds.indexOf(a.id) - otherPriorityIds.indexOf(b.id);
    });

    sortedFlows = [...topPriorityFlows, ...favoriteFlows, ...otherPriorityFlows, ...restFlows];

    return sortedFlows;
}

function renderTagsFilter() {
    const tagsContainer = document.getElementById('tagsContainer');
    if (!tagsContainer) return;
    tagsContainer.innerHTML = '';
    
    const visibleTypeTags = new Set();
    const visibleBaseTags = new Set();
    const visibleOtherTags = new Set();

    allFlows.forEach(flow => {
        if (noshowFlowIds.includes(flow.id)) return;

        let matchesCategory = true;
        if (sidebarFilter) {
            matchesCategory = flow.category && flow.category.toLowerCase().includes(sidebarFilter.toLowerCase());
        }

        if (matchesCategory && flow.tags) {
            if (Array.isArray(flow.tags)) {
                 flow.tags.forEach(tag => visibleOtherTags.add(tag));
            } else {
                (flow.tags.type || []).forEach(tag => visibleTypeTags.add(tag));
                (flow.tags.base_models || []).forEach(tag => visibleBaseTags.add(tag));
                (flow.tags.other || []).forEach(tag => visibleOtherTags.add(tag));
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
    renderFlows(filterCurrentFlows());
}

function filterFlows(flows, searchTerm, selectedCategories) {
    return flows.filter(flow => 
        (flow.name.toLowerCase().includes(searchTerm) || 
         flow.description.toLowerCase().includes(searchTerm) ||
         flow.categories.some(category => category.toLowerCase().includes(searchTerm))) &&
        (selectedCategories.size === 0 || flow.categories.some(category => selectedCategories.has(category)))
    );
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
            showFlows(); // Switch to flows view

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
            
            renderFlows(filterCurrentFlows());
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
            showFlows(); // Switch to flows view
            sidebarFilter = null;
            selectedCategories.clear();
            document.getElementById('searchInput').value = '';
                document.querySelectorAll('.sidebar-filter-category').forEach(l => l.classList.remove('active'));
                document.querySelectorAll('.sidebar-section-header').forEach(h => h.classList.remove('active-section'));
            selectedTags.clear();
            renderTagsFilter();
            renderFlows(filterCurrentFlows());
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
    const flowGrid = document.getElementById('flowGrid');
    const detailsCol = document.getElementById('flow-details-col');
    const controls = document.querySelector('.controls');
    
    if (homeContainer) homeContainer.classList.remove('hidden');
    if (flowGrid) flowGrid.classList.add('hidden');
    if (detailsCol) detailsCol.classList.add('hidden');
    if (controls) controls.classList.add('hidden');
    
    if (settingsComponent) settingsComponent.hide();

    document.querySelectorAll('.sidebar-filter-category').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-section-header').forEach(el => el.classList.remove('active-section'));
    document.getElementById('resetFiltersLink')?.classList.remove('active');
    document.getElementById('homeLink')?.classList.add('active');
}

function showFlows() {
    document.getElementById('homeContainer')?.classList.add('hidden');
    document.getElementById('flowGrid')?.classList.remove('hidden');
    document.querySelector('.controls')?.classList.remove('hidden');
    document.getElementById('homeLink')?.classList.remove('active');
    if (settingsComponent) settingsComponent.hide();
    document.getElementById('resetFiltersLink')?.classList.add('active');
}

async function showSettings() {
    document.getElementById('homeContainer')?.classList.add('hidden');
    document.getElementById('flowGrid')?.classList.add('hidden');
    document.querySelector('.controls')?.classList.add('hidden');
    document.getElementById('flow-details-col')?.classList.add('hidden');
    
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
        console.log('[Flow] WS Progress:', e.detail);
        const { file_name, progress } = e.detail;
        updateComponentStatus(file_name, 'downloading', progress);
    });

    client.on('model_download_complete', (e) => {
        console.log('[Flow] WS Complete:', e.detail);
        const { file_name } = e.detail;
        updateComponentStatus(file_name, 'ready');
    });
}

function initializeHiddenFlows() {
    loadHiddenFlows();
}

export function initializeUI() {
    // Initialize Settings Component
    settingsComponent = new SettingsComponent('.mid-col');

    loadFavorites();
    initializeHiddenFlows();
    initializeMenu();
    initializeSearch();
    initializeSorting();
    initializeTypeFiltering();
    initializeFilterMenu();
    createToggleButtons();    
    initializeStaticSidebarEvents();
    initializeWebSocket();
    loadFlows();
    showVersion();
    
    window.addEventListener('flowsSynced', () => {
        console.log('[Flow] Flows synced, reloading...');
        loadFlows();
    });

    document.addEventListener('click', (event) => {
        const detailsCol = document.getElementById('flow-details-col');
        if (detailsCol && !detailsCol.classList.contains('hidden')) {
            if (!detailsCol.contains(event.target)) {
                detailsCol.classList.add('hidden');
            }
        }
    });
}

export async function getVersion() {
    try {
        const response = await fetch('/flow/api/flow-version');
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
        // const path = '/flow';
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
        const rawURL = 'https://raw.githubusercontent.com/diStyApps/ComfyUI-disty-Flow/main/pyproject.toml';
        
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
