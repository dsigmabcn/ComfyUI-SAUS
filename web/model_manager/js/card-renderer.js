
import { getAllModelData, checkModelStatus } from './model-api.js';

let _missingRequiredModels = []; 

/**
 * Renders the component cards for the selected architecture and calculates the overall status.
 * @param {object} archData - The data object for the selected architecture, now containing components: { compulsory: [], at_least_one: [], optional: [] }.
 * @param {object} ARCHITECTURES_GLOBAL - The global ARCHITECTURES map (unused but kept for signature).
 */
export async function renderArchitectureDetails(archData, ARCHITECTURES_GLOBAL) { 
    const componentGrid = document.getElementById('modelComponentGrid');
    if (!componentGrid) return;

    // NOTE: The grid clearing is now handled in window.loadArchitecture in main.js
    // We will keep this line for safety if main.js is modified, but it's redundant if main.js is correct.
    componentGrid.innerHTML = ''; 

    // Retrieve the cached model data
    const ALL_MODEL_DATA = getAllModelData(); 

    // --- NEW LOGIC: Extract and Combine Components ---
    const compulsoryComponents = archData.components.compulsory || [];
    const atLeastOneComponents = archData.components.at_least_one || [];
    const optionalComponents = archData.components.optional || [];

    // Full, ordered list of components to render (compulsory first, then at_least_one, then optional)
    const allComponentKeys = [
        ...compulsoryComponents, 
        ...atLeastOneComponents, 
        ...optionalComponents
    ];
    // --- END NEW LOGIC ---

    // Initialize status trackers for the architecture status calculation
    let readyCompulsoryCount = 0;
    let readyAtLeastOneCount = 0;
    
    // Total counts are based on the arrays derived from archData
    const totalCompulsory = compulsoryComponents.length;
    const totalAtLeastOne = atLeastOneComponents.length;
    const totalComponents = allComponentKeys.length;

    // Use Promise.all with map to run status checks concurrently for faster loading
    const cardPromises = allComponentKeys.map(async componentKey => {
        
        const componentInfo = ALL_MODEL_DATA[componentKey] || {
            id: 'N/A',
            name: componentKey.replace(/_/g, ' '),
            type: 'UNKNOWN',
            url_model: '',
            model_path: ''
        };

        let modelStatus = 'missing'; // Default status

        // Only check status if we have a file ID
        if (componentInfo.id !== 'N/A') {
            modelStatus = await checkModelStatus(componentInfo.id, componentInfo.model_path);
        }

        // --- NEW LOGIC: Tally the READY status for required models ---
        if (modelStatus === 'ready') {
            if (compulsoryComponents.includes(componentKey)) {
                readyCompulsoryCount++;
            }
            if (atLeastOneComponents.includes(componentKey)) {
                readyAtLeastOneCount++;
            }
        }
        // --- END NEW LOGIC ---

        // Generate the card HTML (returns a string)
        return createComponentCard(componentInfo, modelStatus);
    });

    // Wait for all card HTML generation and insert them together
    const allCardHTML = await Promise.all(cardPromises);
    componentGrid.insertAdjacentHTML('beforeend', allCardHTML.join(''));

    // --- NEW LOGIC: Update Architecture Status with calculated counts ---
    // The previous call: updateArchitectureStatus(archData.components.length, window.currentActiveArchitecture);
    // is replaced by the call below:
    updateArchitectureStatus(
        totalComponents, 
        totalCompulsory, 
        readyCompulsoryCount, 
        totalAtLeastOne, 
        readyAtLeastOneCount
    );
    // --- END NEW LOGIC ---
}

/** Creates the HTML string for a single Model Component (model) Card.
 * @param {object} componentInfo - The data object for the specific component.
 * @param {string} currentStatus - The actual current status (e.g., 'ready', 'missing').
 * @returns {string} - The HTML string for the component card. 
 */
function createComponentCard(componentInfo, currentStatus) {
    const status = currentStatus || 'missing'; 
    const fileName = componentInfo.id;
    const componentType = componentInfo.type; 
    const typeTitle = componentInfo.name;

    let buttonHtml = '';
    // NOTE: downloadModel and deleteModel are expected to be available on the window object 
    // as they are exposed globally by main.js (which we'll update in step 2).

    if (status === 'ready') {
        buttonHtml = `
            <button class="card-action-btn delete" onclick="deleteModel('${componentInfo.id}', '${componentInfo.model_path}')"><i class="fas fa-trash-alt"></i> Delete</button>
        `;
    } else if (status === 'missing' || status === 'error') {
        buttonHtml = `
            <button class="card-action-btn download" onclick="downloadModel('${componentType}', '${componentInfo.url_model}', '${componentInfo.model_path}', event)"><i class="fas fa-download"></i> Download</button>
        `;
    } else if (status === 'downloading') {
        buttonHtml = `
            <button class="card-action-btn disabled" disabled data-action="download-progress"><i class="fas fa-spinner fa-spin"></i> Downloading...</button>
        `;
    }

    return `
        <div class="model-component-card ${status}" data-model-path="${componentInfo.model_path}">
            <div class="card-header">
                <h3 title="${typeTitle}">${typeTitle}</h3>
                <span class="model-type-badge">${componentInfo.type}</span>
            </div>
            <div class="card-details">
                <p>Status: <span class="file-status">
                    <i class="fas fa-circle status-icon ${status}"></i> 
                    ${String(status).toUpperCase()}
                </span></p>
                <p>File: <span class="current-file-name">${fileName}</span></p>
            </div>
            <div class="card-actions">
                ${buttonHtml}
            </div>
        </div>
    `;
}

/**
 * Updates the overall architecture status bar based on component status.
 * @param {number} totalComponents - Total number of components.
 * @param {string} currentActiveArchitecture - The key of the currently selected architecture.
 */
/**
 * Updates the overall architecture status bar based on component status.
 * @param {number} totalComponents - Total number of components rendered (including optional).
 * @param {number} totalCompulsory - Total number of compulsory components.
 * @param {number} readyCompulsoryCount - Count of ready compulsory components.
 * @param {number} totalAtLeastOne - Total number of at_least_one components.
 * @param {number} readyAtLeastOneCount - Count of ready at_least_one components.
 */
function updateArchitectureStatus(
    totalComponents, 
    totalCompulsory, 
    readyCompulsoryCount, 
    totalAtLeastOne, 
    readyAtLeastOneCount
) {
    const statusTextEl = document.getElementById('status-text');
    const actionButtonEl = document.getElementById('actionButton');

    if (!statusTextEl || !actionButtonEl) return;

    let overallStatus = 'missing';
    let statusText = '';
    
    // --- 1. Define Requirement Success ---

    // Compulsory is met if there are zero compulsory components OR if all of them are ready.
    const compulsoryMet = totalCompulsory === 0 || readyCompulsoryCount === totalCompulsory;

    // At_Least_One is met if there are zero at_least_one components OR if at least one is ready.
    const atLeastOneMet = totalAtLeastOne === 0 || readyAtLeastOneCount > 0;

    // --- 2. Determine Overall Status ---

    if (compulsoryMet && atLeastOneMet) {
        // Condition for READY: Both compulsory and at_least_one requirements are met.
        overallStatus = 'ready';
        statusText = `Status: READY (All Core Requirements Met)`;
    } 
    else if (readyCompulsoryCount > 0 || readyAtLeastOneCount > 0) {
        // Condition for PARTIAL: Not READY, but at least one required component is installed.
        overallStatus = 'partial';
        
        // Calculate missing requirement details for display clarity
        const compulsoryMissing = totalCompulsory - readyCompulsoryCount;
        const atLeastOneMissing = totalAtLeastOne > 0 && readyAtLeastOneCount === 0;

        let missingDetails = [];
        if (compulsoryMissing > 0) {
            // We use 'Component(s)' for clarity
            missingDetails.push(`${compulsoryMissing} compulsory component${compulsoryMissing > 1 ? 's' : ''}`);
        }
        if (atLeastOneMissing) {
            // If the at_least_one group failed, it counts as one missing requirement set
            missingDetails.push('1 group of choices');
        }

        const missingText = missingDetails.join(' and ');
        statusText = `Status: PARTIAL (${missingText} missing)`;
        
    } else {
        // Condition for MISSING: Zero required components are ready.
        overallStatus = 'missing';
        statusText = `Status: MISSING (No Core Components Installed)`;
    }


    // --- 3. Update UI Elements ---
    statusTextEl.textContent = statusText;
    statusTextEl.className = `status-${overallStatus}`; 

    if (overallStatus === 'ready') {
        actionButtonEl.classList.add('hidden');
    } else {
        // For MISSING and PARTIAL, show the "Download All Missing" button
        actionButtonEl.textContent = 'Download All Missing';
        actionButtonEl.classList.remove('hidden');
        actionButtonEl.disabled = false;
        actionButtonEl.title = 'Downloads all core components required for this architecture.';
    }
}


// HELPER to update card status after downloading file (MUST BE EXPOSED GLOBALLY FOR WEBSOCKET)
/**
 * Finds the model card by its modelPath and updates its status and UI elements.
 */
export const updateCardStatus = function (modelPath, status, progress = 0) { 
    console.log(`[DEBUG: Status Update] Called for Path: ${modelPath}, Status: ${status}, Progress: ${progress}%`);

    const cardElement = document.querySelector(`.model-component-card[data-model-path="${modelPath}"]`);

    if (!cardElement) {
        console.warn(`Card element not found. Tried to find: .model-component-card[data-model-path="${modelPath}"]`);
        return;
    }

    // 1. Update card classes (removes old, adds new)
    cardElement.classList.remove('ready', 'missing', 'downloading', 'error');
    cardElement.classList.add(status);

    const statusEl = cardElement.querySelector('.file-status');
    const actionContainer = cardElement.querySelector('.card-actions');

    // 2. Update status text and button based on new status
    if (status === 'downloading') {
        const percentText = progress > 0 ? `(${progress}%)` : '...';
        
        if (statusEl) {
            statusEl.innerHTML = `<i class="fas fa-spinner fa-spin status-icon downloading"></i> DOWNLOADING ${percentText}`;
        }
        
        let progressButton = actionContainer.querySelector('[data-action="download-progress"]');
        if (!progressButton) {
            actionContainer.innerHTML = `
                <button class="card-action-btn disabled" disabled data-action="download-progress">
                    <i class="fas fa-spinner fa-spin"></i> Download in Progress ${percentText}
                </button>`;
        } else {
             progressButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Download in Progress ${percentText}`;
        }
    } 
    else if (status === 'ready') {
        if (statusEl) {
             statusEl.innerHTML = `<i class="fas fa-circle status-icon ready"></i> READY`;
        }
        // Full refresh to get the 'Delete' button 
        // NOTE: We need to use the global window.loadArchitecture here
        //window.loadArchitecture(window.currentActiveArchitecture); 
         // 🚀 FIX: Instead of a full re-render, surgically replace the button.
        const componentInfo = { // Reconstruct minimal data needed for delete button
            id: cardElement.querySelector('.current-file-name').textContent,
            model_path: modelPath
        };
        actionContainer.innerHTML = `
            <button class="card-action-btn delete" onclick="deleteModel('${componentInfo.id}', '${componentInfo.model_path}')"><i class="fas fa-trash-alt"></i> Delete</button>
        `;
    } 
    else if (status === 'missing' || status === 'error') {
        if (statusEl) {
            const icon = status === 'error' ? 'fa-exclamation-triangle' : 'fa-circle';
            statusEl.innerHTML = `<i class="fas ${icon} status-icon ${status}"></i> ${status.toUpperCase()}`;
        }
        // Full refresh to get the 'Download' button
        window.loadArchitecture(window.currentActiveArchitecture); 
    }
};
// 3. 🔑 ADD: Export the function so main.js can access the missing list
export function getMissingRequiredModels() {
    return _missingRequiredModels;
}