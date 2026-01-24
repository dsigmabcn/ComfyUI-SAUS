// ======================================================================================
// 📦 model-api.js
// 🛑 API INTERACTION FUNCTIONS (Data Fetching, Status Check, Download, Delete)
// ======================================================================================

let _all_modelData = {}; // Global variable to store all models within this module

/** Fetches all component (model) metadata from the backend API. */
export async function loadAllModelData() {
    try {
        const response = await fetch('/saus/api/data-model-info');
        if (!response.ok) {
            throw new Error('Failed to fetch model data');
        }
        _all_modelData = await response.json();
        console.log("[API] Model Data Loaded:", _all_modelData);
        return _all_modelData; // Return data for use in main.js initialization
    } catch (error) {
        console.error("[API] Error loading model data:", error);
        // Ensure ALL_MODEL_DATA is an empty object on failure to prevent crashes
        _all_modelData = {}; 
        throw error;
    }
}

/** * GETTER: Allows external modules (like main.js) to access the cached model data.
 * This is the clean, modular way to share the data.
 */
export function getAllModelData() {
    return _all_modelData;
}


/**
 * Checks the existence status of a model file via the back-end API.
 * @param {string} fileId - The filename (e.g., "flux1-dev.safetensors").
 * @param {string} modelPath - The sub-directory path (e.g., "/diffusion_models/FLUX/").
 * @returns {Promise<string>} - 'ready', 'missing', or 'error'.
 */
export async function checkModelStatus(fileId, modelPath) {
    try {
        const query = new URLSearchParams({
            file_id: fileId,
            model_path: modelPath
        }).toString();

        const response = await fetch(`/saus/api/model-status?${query}`);

        if (!response.ok) {
            console.error(`[API] Status check failed: ${response.statusText}`);
            return 'error';
        }

        const data = await response.json();

        if (data && data.status) {
            return data.status;
        }
        return 'missing';
    } catch (error) {
        console.error("[API] Error during model status fetch:", error);
        return 'error';
    }
}

/**
 * Initiates the download of a model file via the back-end API.
 * @param {string} componentType - The type of model (e.g., 'CHECKPOINT').
 * @param {string} urlModel - The URL to download the model from.
 * @param {string} modelPath - The sub-directory path where the model should be saved.
 * @param {Event} event - The click event object (optional, for accessing the button).
 */
export async function downloadModel(componentType, urlModel, modelPath, event) {
    console.log(`[API] Initiating download for type: ${componentType} from ${urlModel} to ${modelPath}`);

    const clickedButton = event ? event.currentTarget : null;
    const cardElement = clickedButton ? clickedButton.closest('.model-component-card') : null;
    const statusEl = cardElement ? cardElement.querySelector('.file-status') : null;

    // 1. INSTANT UX FEEDBACK (Must be kept here to modify the card element before the API call)
    if (cardElement) {
        cardElement.classList.remove('missing', 'error', 'ready');
        cardElement.classList.add('downloading');

        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-spinner fa-spin status-icon downloading"></i> DOWNLOADING...'; 
        }

        if (clickedButton) {
            clickedButton.outerHTML = `
                <button class="card-action-btn disabled" disabled data-action="download-progress">
                    <i class="fas fa-spinner fa-spin"></i> Download in Progress
                </button>`;
        }
    }

    try {
        const response = await fetch('/saus/api/download-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                component_type: componentType, 
                url_model: urlModel,
                model_path: modelPath
            })
        });

        const result = await response.json();

        if (response.status !== 200 && response.status !== 202) {
            console.error(`[API] Failed to start download: ${result.message}`);
            // Restore original state or set to 'error' status visually
            if (cardElement) {
                console.error("[API] Download failed to initiate. Check server logs.");
                if (statusEl) statusEl.innerHTML = '<i class="fas fa-exclamation-triangle status-icon error"></i> ERROR';
                cardElement.classList.add('error');
                cardElement.classList.remove('downloading');
                // Re-render to restore the Download button
                window.loadArchitecture(window.currentActiveArchitecture); 
            }
        } else {
            console.log("[API] Download task successfully initiated on the server.", result);
            // WebSocket will handle further updates.
        }

    } catch (error) {
        console.error("[API] Network error when calling download endpoint:", error);
        window.loadArchitecture(window.currentActiveArchitecture); // Attempt refresh on error
    }
}


/**
 * Deletes a model file via the back-end API.
 * @param {string} fileId - The filename to delete.
 * @param {string} modelPath - The directory path of the file.
 */
export async function deleteModel(fileId, modelPath) {
    console.log(`[API] Deleting file: ${fileId} in path: ${modelPath}`);

    if (!confirm(`Are you sure you want to delete the file "${fileId}"? This action cannot be undone.`)) {
        return;
    }

    try {
        const response = await fetch('/saus/api/delete-model', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_id: fileId,
                model_path: modelPath
            })
        });

        if (response.ok) {
            alert(`Successfully deleted ${fileId}.`);
            // IMPORTANT: Re-render the UI to update the card status from 'ready' to 'missing'
            window.loadArchitecture(window.currentActiveArchitecture);
        } else {
            const errorData = await response.json();
            alert(`Failed to delete model: ${errorData.message || response.statusText}`);
        }
    } catch (error) {
        console.error("[API] Error during model deletion:", error);
        alert("An unexpected error occurred during deletion.");
    }
}