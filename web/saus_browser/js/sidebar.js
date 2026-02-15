import { state } from './state.js';

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

export function renderSidebarCategories(callbacks) {
    const container = document.getElementById('sidebarCategoriesContainer');
    container.querySelectorAll('.sidebar-filter-category').forEach(el => el.remove());
    container.querySelectorAll('.sidebar-section').forEach(el => el.remove());

    const groupedCategories = {
        "AI Image": [],
        "AI Video": [],
        "Other": []
    };

    state.categories.forEach(cat => {
        if (SECTIONS_CONFIG["AI Image"].categories.includes(cat)) {
            groupedCategories["AI Image"].push(cat);
        } else if (SECTIONS_CONFIG["AI Video"].categories.includes(cat)) {
            groupedCategories["AI Video"].push(cat);
        } else {
            groupedCategories["Other"].push(cat);
        }
    });

    Object.keys(SECTIONS_CONFIG).forEach(sectionKey => {
        const sectionCats = groupedCategories[sectionKey];
        if (sectionCats.length === 0) return;

        sectionCats.sort((a, b) => {
            const indexA = CATEGORY_ORDER.indexOf(a);
            const indexB = CATEGORY_ORDER.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });

        const sectionDiv = document.createElement('div');
        sectionDiv.className = 'sidebar-section';
        sectionDiv.style.marginBottom = '5px';

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

        const contentDiv = document.createElement('div');
        contentDiv.className = 'sidebar-section-content';
        contentDiv.style.display = 'none';
        contentDiv.style.paddingLeft = '15px';

        header.addEventListener('click', () => {
            const isHidden = contentDiv.style.display === 'none';
            contentDiv.style.display = isHidden ? 'block' : 'none';
            const icon = header.querySelector('.toggle-icon');
            if (icon) {
                icon.className = isHidden ? 'fas fa-chevron-down toggle-icon' : 'fas fa-chevron-right toggle-icon';
            }
        });

        sectionCats.forEach(category => {
            const span = document.createElement('span');
            const catIcon = CATEGORY_ICONS[category] || CATEGORY_ICONS["other"];
            span.className = 'sidebar-filter-category';
            span.dataset.category = category;
            span.innerHTML = `<i class="${catIcon}"></i> ${category}`;
            
            contentDiv.appendChild(span);
        });

        sectionDiv.appendChild(header);
        sectionDiv.appendChild(contentDiv);
        container.appendChild(sectionDiv);
    });

    initializeSidebarFilters(callbacks);
}

function initializeSidebarFilters(callbacks) {
    const sidebarLinks = document.querySelectorAll('.sidebar-filter-category');
    const sectionHeaders = document.querySelectorAll('.sidebar-section-header');

    sidebarLinks.forEach(link => {
        link.addEventListener('click', () => {
            const categoryName = link.dataset.category;
            //console.log(`Filtering by sidebar category: ${categoryName}`);
            
            if (callbacks.showApps) callbacks.showApps();

            sidebarLinks.forEach(l => l.classList.remove('active'));
            sectionHeaders.forEach(h => h.classList.remove('active-section'));
            
            state.sidebarFilter = categoryName;
            link.classList.add('active');
            const parentSection = link.closest('.sidebar-section');
            if (parentSection) {
                const header = parentSection.querySelector('.sidebar-section-header');
                if (header) header.classList.add('active-section');
            }
            
            state.selectedTags.clear();
            if (callbacks.renderTagsFilter) callbacks.renderTagsFilter();
            document.getElementById('searchInput').value = '';
            
            if (callbacks.refreshApps) callbacks.refreshApps();
        });
    });
}

export function initializeStaticSidebarEvents(callbacks) {
    const resetLink = document.getElementById('resetFiltersLink');
    const homeLink = document.getElementById('homeLink');

    if (homeLink) {
        homeLink.addEventListener('click', (event) => {
            event.preventDefault();
            if (callbacks.showHome) callbacks.showHome();
        });
    }

    if (resetLink) {
        resetLink.addEventListener('click', (event) => {
            event.preventDefault();
            console.log('Resetting all sidebar filters.');
            if (callbacks.showApps) callbacks.showApps();
            state.sidebarFilter = null;
            state.selectedCategories.clear();
            document.getElementById('searchInput').value = '';
            document.querySelectorAll('.sidebar-filter-category').forEach(l => l.classList.remove('active'));
            document.querySelectorAll('.sidebar-section-header').forEach(h => h.classList.remove('active-section'));
            state.selectedTags.clear();
            if (callbacks.renderTagsFilter) callbacks.renderTagsFilter();
            if (callbacks.refreshApps) callbacks.refreshApps();
        });
    }

    document.addEventListener('click', (event) => {
        const target = event.target.closest('a');
        if (target && (target.id === 'settingsLink' || target.getAttribute('href') === '#settings')) {
            event.preventDefault();
            if (callbacks.showSettings) callbacks.showSettings();
        }
    });
}