import { state, isFavorited, saveFavorites, noshowAppIds, priorityAppIds, preferencesManager } from './state.js';
import { showAppDetails, updateAppStatus } from './models.js';

const createElement = (type, className, textContent = '') => {
    const element = document.createElement(type);
    element.className = className;
    element.textContent = textContent;
    return element;
};

function toggleFavorite(appId, button) {
    if (state.favorites.has(appId)) {
        state.favorites.delete(appId);
        button.classList.remove('favorited');
        button.innerHTML = '<i class="far fa-star"></i>';
        button.title = 'Add to favorites';
    } else {
        state.favorites.add(appId);
        button.classList.add('favorited');
        button.innerHTML = '<i class="fas fa-star"></i>';
        button.title = 'Remove from favorites';
    }
    saveFavorites();
    animateAppReorder();
}

export function createAppCard(app) {
     if (noshowAppIds.includes(app.id)) {
        return null; 
    }

    const card = createElement('div', 'app-card');
    
    const cacheBuster = `?t=${Date.now()}`;
    let thumbnailUrl = `saus/${app.url}/media/thumbnail.jpg${cacheBuster}`;
    let defaultThumbnail = `/core/media/ui/saus_logo.png`;
    
    const favoriteButton = document.createElement('button');
    favoriteButton.classList.add('favorite-button');
    favoriteButton.innerHTML = isFavorited(app.id) ? '<i class="fas fa-star"></i>' : '<i class="far fa-star"></i>';
    favoriteButton.title = isFavorited(app.id) ? 'Remove from favorites' : 'Add to favorites';
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

    card.dataset.appId = app.id;

    const statusEl = card.querySelector('.status-text');
    
    statusEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showAppDetails(app);
    });
    
    updateAppStatus(app, statusEl);

    return card;
}

export function updateAppCardVisibility() {
    const appCards = document.querySelectorAll('.app-card');
    appCards.forEach(card => {
        const title = card.querySelector('.app-title');
        const description = card.querySelector('.app-description');
        
        if (title) title.style.display = state.hideTitles ? 'none' : 'block';
        if (description) description.style.display = (state.hideTitles || state.hideDescriptions) ? 'none' : 'block';
    });
}

export function renderApps(apps) {
    const appGrid = document.getElementById('appGrid');
    appGrid.innerHTML = '';
    apps.forEach(app => {
        if (app.id !== 'menu') {
            const appCard = createAppCard(app);
            if (appCard) { 
                appGrid.appendChild(appCard);
            }
        }
    });
    updateAppCardVisibility();
}

export function sortApps(apps, sortValue) {
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
                const catA = a.category;
                const catB = b.category;
                const indexA = state.categories.indexOf(catA);
                const indexB = state.categories.indexOf(catB);
                return indexA - indexB || a.name.localeCompare(b.name);
            });
            break;
        case 'categoryDesc':
            sortedApps.sort((a, b) => {
                const catA = a.category;
                const catB = b.category;
                const indexA = state.categories.indexOf(catA);
                const indexB = state.categories.indexOf(catB);
                return indexB - indexA || a.name.localeCompare(b.name);
            });
            break;
    }

    const topPriorityIds = [];
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

export function filterCurrentApps() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const sortValue = preferencesManager.get('sortValue') || 'nameAsc';
    const activeTypeFilters = preferencesManager.get('activeTypeFilters') || [];
    let filteredApps = state.allApps;
    
    filteredApps = filteredApps.filter(app => 
        (app.name.toLowerCase().includes(searchTerm) || 
         app.description.toLowerCase().includes(searchTerm) ||
         (app.category && app.category.toLowerCase().includes(searchTerm)))
    );
    
    if (state.selectedTags.size > 0) {
        filteredApps = filteredApps.filter(app => 
            app.flatTags && app.flatTags.some(tag => state.selectedTags.has(tag))
        );
    }

    if (state.sidebarFilter && !searchTerm) {
        filteredApps = filteredApps.filter(app => {                        
            return app.category && app.category.toLowerCase().includes(state.sidebarFilter.toLowerCase());
        });
    }

    if (activeTypeFilters.length > 0) {
        filteredApps = filteredApps.filter(app => activeTypeFilters.includes(app.app_type));
    } else {
        // If no type filters are active, show no apps.
        filteredApps = [];
    }

    if (state.favoritesFilterActive) {
        filteredApps = filteredApps.filter(app => isFavorited(app.id));
    }

    filteredApps = filteredApps.filter(app => !noshowAppIds.includes(app.id));

    filteredApps = sortApps(filteredApps, sortValue);
    return filteredApps;
}

export function renderTagsFilter() {
    const tagsContainer = document.getElementById('tagsContainer');
    if (!tagsContainer) return;
    tagsContainer.innerHTML = '';
    
    const visibleTypeTags = new Set();
    const visibleBaseTags = new Set();
    const visibleOtherTags = new Set();

    state.allApps.forEach(app => {
        if (noshowAppIds.includes(app.id)) return;

        let matchesCategory = true;
        if (state.sidebarFilter) {
            matchesCategory = app.category && app.category.toLowerCase().includes(state.sidebarFilter.toLowerCase());
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
        if (state.selectedTags.has(tag)) {
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
        if (state.selectedTags.has(tag)) {
            state.selectedTags.delete(tag);
        } else {
            state.selectedTags.add(tag);
        }
    } else {
        if (state.selectedTags.has(tag) && state.selectedTags.size === 1) {
            state.selectedTags.clear();
        } else {
            state.selectedTags.clear();
            state.selectedTags.add(tag);
        }
    }
    renderTagsFilter();
    renderApps(filterCurrentApps());
}

export function animateAppReorder() {
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

        if (oldRect) {
            const deltaX = oldRect.left - newRect.left;
            const deltaY = oldRect.top - newRect.top;
            card.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
            card.offsetHeight;
            card.style.transition = 'transform 0.5s ease';
            card.style.transform = '';
        }
    });

    setTimeout(() => {
        Array.from(appGrid.children).forEach(card => {
            card.style.transition = '';
            card.style.transform = '';
        });
    }, 500);
}

export function showHome() {
    const homeContainer = document.getElementById('homeContainer');
    const appGrid = document.getElementById('appGrid');
    const detailsCol = document.getElementById('app-details-col');
    const controls = document.querySelector('.controls');
    
    if (homeContainer) homeContainer.classList.remove('hidden');
    if (appGrid) appGrid.classList.add('hidden');
    if (detailsCol) detailsCol.classList.add('hidden');
    if (controls) controls.classList.add('hidden');
    
    if (state.settingsComponent) state.settingsComponent.hide();

    document.querySelectorAll('.sidebar-filter-category').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-section-header').forEach(el => el.classList.remove('active-section'));
    document.getElementById('resetFiltersLink')?.classList.remove('active');
    document.getElementById('homeLink')?.classList.add('active');
}

export function showApps() {
    document.getElementById('homeContainer')?.classList.add('hidden');
    document.getElementById('appGrid')?.classList.remove('hidden');
    document.querySelector('.controls')?.classList.remove('hidden');
    document.getElementById('homeLink')?.classList.remove('active');
    if (state.settingsComponent) state.settingsComponent.hide();
    document.getElementById('resetFiltersLink')?.classList.add('active');
}

export async function showSettings() {
    document.getElementById('homeContainer')?.classList.add('hidden');
    document.getElementById('appGrid')?.classList.add('hidden');
    document.querySelector('.controls')?.classList.add('hidden');
    document.getElementById('app-details-col')?.classList.add('hidden');
    
    if (state.settingsComponent) state.settingsComponent.show();
    
    document.querySelectorAll('.sidebar-filter-category').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-section-header').forEach(el => el.classList.remove('active-section'));
    document.getElementById('resetFiltersLink')?.classList.remove('active');
    document.getElementById('homeLink')?.classList.remove('active');
}