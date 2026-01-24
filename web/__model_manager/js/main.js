import { initializeWebSocketListener } from './websocket.js'; // Websocket for progress download
import { loadAllModelData, checkModelStatus, downloadModel, deleteModel } from './model-api.js'; // Model API functions
import { renderArchitectureDetails, updateCardStatus, getMissingRequiredModels } from './card-renderer.js'; // CARD FUNCTIONS
import { insertElement } from '../../../core/js/common/components/header.js'; //common header of all apps

// --- 1. CORE ARCHITECTURE LIST & CONFIGURATION ---
let ARCHITECTURES = {};
window.currentActiveArchitecture = 'SDXL'; // Default view

// A map to associate categories with icons (using Font Awesome). Sidebar categories also follow this order
const CATEGORY_ICONS = {
    "Image Models": "fas fa-image", 
    "Video Models": "fas fa-film", 
    "Style, Edit, inpaint": "fas fa-palette",
    "Low VRAM - GGUF": "fas fa-cube",    
    "LORA": "fas fa-compress-arrows-alt",
    "Fast - Distillation": "fas fa-bolt",
    "ControlNet": "fas fa-sitemap", 
    "Upscalers": "fas fa-magnifying-glass-plus", 
    // Add any future categories here
};

// Sidebar navigation: dynamically based on the categories in ARCHITECTURES data (loaded at the DOM).
function generateSidebarNavigation() {
    const menuContainer = document.getElementById('dynamic-architecture-menu');
    if (!menuContainer) return;

    // 1. Group Architectures by Category
    const categorizedMenu = {};
    for (const key in ARCHITECTURES) {
        const arch = ARCHITECTURES[key];
        arch.categories.forEach(category => {
            if (!categorizedMenu[category]) {
                categorizedMenu[category] = [];
            }            
            categorizedMenu[category].push({ key: key, title: arch.title });
        });
    }

    // 2. Generate HTML for each Category
    let menuHTML = '';
    // Sort categories alphabetically for consistent display
    const sortedCategories = Object.keys(CATEGORY_ICONS).filter(category => categorizedMenu[category]);
    sortedCategories.forEach((category, index) => {
        const submenuId = `submenu-${index}`; // Unique ID for the collapsible part
        const iconClass = CATEGORY_ICONS[category] || 'fas fa-cog';

        // Start of the menu-category (collapsible top level)
        let categoryBlock = `
            <div class="menu-category">
                <span class="menu-item collapsible-header" onclick="toggleSubMenu('${submenuId}')">
                    <i class="${iconClass}"></i> ${category}
                    <i class="fas fa-caret-right expand-icon"></i>
                </span>
                <div id="${submenuId}" class="submenu hidden">
        `;

        // Add submenu items (architectures) for this category. Architectures sortedby title within the category  (alphabetical)
        categorizedMenu[category].sort((a, b) => a.title.localeCompare(b.title)).forEach(arch => {
            categoryBlock += `
                <a class="submenu-item" onclick="loadArchitecture('${arch.key}')">${arch.title}</a>
            `;
        });

        // End of the menu-category
        categoryBlock += `
                </div> 
            </div>
        `;

        menuHTML += categoryBlock;
    });

    menuContainer.innerHTML = menuHTML;
}


// --- 2. GLOBAL UI HANDLERS (EXPOSED TO WINDOW) ---

/** * Toggles the visibility of a submenu in the sidebar.
 * @param {string} submenuId - The ID of the submenu UL element.*/

window.toggleSubMenu = function (submenuId) {
    const submenu = document.getElementById(submenuId);
    if (!submenu) return;

    // Toggle the 'hidden' class to show/hide the submenu
    const isHidden = submenu.classList.toggle('hidden');

    // Find the icon and rotate it based on visibility
    const parentHeader = submenu.previousElementSibling;
    const expandIcon = parentHeader ? parentHeader.querySelector('.expand-icon') : null;

    if (expandIcon) {
        if (isHidden) {
            expandIcon.classList.remove('rotated');
        } else {
            expandIcon.classList.add('rotated');
        }
    }
};
/** Handles the click event for an architecture/category link. Updates the UI to reflect the new active architecture and renders cards.
 * @param {string} archKey - The key of the architecture (e.g., 'SDXL_BASE').*/

window.loadArchitecture = async function (archKey) {

    // 1. Update active menu item
    const allActiveElements = document.querySelectorAll('.menu-item.active, .submenu-item.active');
    allActiveElements.forEach(el => {
        el.classList.remove('active');
    });

    let newActiveElement = document.querySelector(`[onclick="loadArchitecture('${archKey}')"]`);
    if (newActiveElement) {
        newActiveElement.classList.add('active');
    }

    // 🚨 FIX: Synchronously clear the grid BEFORE the asynchronous render begins
    const componentGrid = document.getElementById('modelComponentGrid');
    if (componentGrid) {
    componentGrid.innerHTML = ''; // Ensure the grid is cleared immediately
    }
    // 2. Update the main content header and render cards
    window.currentActiveArchitecture = archKey;
    const archData = ARCHITECTURES[archKey];
    if (archData) {
        document.getElementById('current-architecture-title').textContent = archData.title;
        //await renderArchitectureDetails(archData);
        await renderArchitectureDetails(archData, ARCHITECTURES);
    }
};

/**
 * Initiates the download of all core components currently missing for the active architecture.
 * This function is called when the 'Download All Missing' button is clicked.
 */
window.downloadAllMissing = async function() {
    console.log('[Download All Missing] Initiating batch download for required models.');
    
    // Use the imported function to get the list of missing models
    const missingModels = getMissingRequiredModels();
    
    if (missingModels.length === 0) {
        alert('No missing core components found to download.');
        return;
    }

    const confirmMessage = `Are you sure you want to download ${missingModels.length} missing core component(s) for the '${ARCHITECTURES[window.currentActiveArchitecture].title}' architecture?`;

    if (!confirm(confirmMessage)) {
        return;
    }
    
    const actionButtonEl = document.getElementById('actionButton');
    if (actionButtonEl) {
        actionButtonEl.disabled = true;
        actionButtonEl.textContent = 'Starting Downloads...';
    }

    // Call the individual downloadModel function for each missing model
    for (const model of missingModels) {
        // Pass null for the event as we don't need UI feedback on the batch button itself
        // The individual model card will be updated via the WebSocket connection.
        await downloadModel(model.type, model.url_model, model.model_path, null);
    }

    // Re-enable and reset the button after initiating all downloads
    if (actionButtonEl) {
        actionButtonEl.disabled = false; 
        actionButtonEl.textContent = 'Download All Missing'; 
    }

    console.log(`[Download All Missing] Started download task initiation for ${missingModels.length} models.`);
};




window.updateCardStatus = updateCardStatus;

window.downloadModel = downloadModel;
window.deleteModel = deleteModel;
window.downloadAllMissing = window.downloadAllMissing; // Exposes the batch download function

// --- 3. INITIALIZATION --- 


export function initializeUI() {
    window.loadArchitecture(currentActiveArchitecture);
    window.toggleSubMenu('submenu-0');
}



document.addEventListener('DOMContentLoaded', async () => {
    console.log("[DEBUG: Startup] main.js DOMContentLoaded handler executed."); 

    initializeWebSocketListener(); // <--- CALL IT HERE
    console.log("[DEBUG: Startup] main.js DOMContentLoaded after initializeWebScoketListener"); 

    // 1. Fetch Architectures Data
    try {
        const response = await fetch('/saus/api/architectures');
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        ARCHITECTURES = await response.json();
        window.ARCHITECTURES = ARCHITECTURES;
    } catch (error) {
        console.error("CRITICAL: Failed to load architectures data.", error);
        document.getElementById('current-architecture-title').textContent = 'Error Loading Architectures';
        return;
    }

    // 2. Fetch Model Component Data (MUST BE AWAITED BEFORE RENDERING)
    // We update loadAllModelData to be awaited here
    await loadAllModelData();



    const headerContainer = document.querySelector('header');

    if (headerContainer) {
        // 1. Insert header element
        insertElement(headerContainer);

        setTimeout(() => {
            const appNameElement = document.querySelector('.appName');
            if (appNameElement) {
                appNameElement.textContent = 'File Manager';
                appNameElement.style.fontSize = '1.5em'; // or '20px', '24px', etc.

            }
        }, 300);
    }

    // 2. Set copyright year
    const copyrightEl = document.getElementById('copyright');
    if (copyrightEl) {
        copyrightEl.textContent = `© ${new Date().getFullYear()} SAUS.`;
    }

    // 3. Initialize the Model Manager UI
    generateSidebarNavigation(); // <--- NEW STEP: Generate the menu first
    //loadAllModelData(); // <--- IN HERE?



    initializeUI();
});