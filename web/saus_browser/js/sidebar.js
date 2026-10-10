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

    const cfg = taxonomyConfig();

    const groupedCategories = {};
    cfg.sections.forEach(s => { groupedCategories[s.id] = []; });

    state.categories.forEach(cat => {
        const section = cfg.sections.find(s => s.categories.includes(cat));
        const lastSection = cfg.sections.length ? cfg.sections[cfg.sections.length - 1].id : null;
        const target = section ? section.id : (groupedCategories["Other"] ? "Other" : lastSection);
        if (target && groupedCategories[target]) groupedCategories[target].push(cat);
    });

    cfg.sections.forEach(section => {
        const sectionCats = groupedCategories[section.id] || [];
        if (sectionCats.length === 0) return;

        sectionCats.sort((a, b) => {
            const indexA = (cfg.order[a] !== undefined) ? cfg.order[a] : 999;
            const indexB = (cfg.order[b] !== undefined) ? cfg.order[b] : 999;
            return (indexA - indexB) || a.localeCompare(b);
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

        header.innerHTML = `<span><i class="${section.icon}"></i> ${section.id}</span> <i class="fas fa-chevron-right toggle-icon" style="font-size: 0.8em;"></i>`;

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
            const catIcon = cfg.icons[category] || CATEGORY_ICONS["other"];
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

/** Build sidebar sections/order/icons from taxonomy.json, falling back to the
 *  built-in vocabulary when taxonomy is unavailable. */
function taxonomyConfig() {
    const tax = state.TAXONOMY || {};
    const cats = Array.isArray(tax.categories) ? tax.categories : [];
    const sections = Array.isArray(tax.sections) ? tax.sections : [];

    if (cats.length && sections.length) {
        const order = {};
        const icons = {};
        cats.forEach((c, i) => {
            order[c.id] = (typeof c.order === 'number') ? c.order : i;
            icons[c.id] = c.icon || CATEGORY_ICONS["other"];
        });
        return {
            order,
            icons,
            sections: sections.map(s => ({
                id: s.id,
                icon: s.icon || 'fas fa-th-large',
                categories: cats.filter(c => c.section === s.id).map(c => c.id)
            }))
        };
    }

    const order = {};
    CATEGORY_ORDER.forEach((c, i) => { order[c] = i; });
    return {
        order,
        icons: CATEGORY_ICONS,
        sections: Object.keys(SECTIONS_CONFIG).map(k => ({
            id: k,
            icon: SECTIONS_CONFIG[k].icon,
            categories: SECTIONS_CONFIG[k].categories
        }))
    };
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