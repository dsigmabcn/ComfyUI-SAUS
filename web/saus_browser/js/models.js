import { state } from './state.js';

export async function checkModelStatus(fileId, modelPath) {
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

export async function updateAppStatus(app, statusElement) {
    if (!app.architecture || !state.ARCHITECTURES[app.architecture]) {
        statusElement.textContent = "Unknown";
        statusElement.className = "status-text";
        return;
    }

    const arch = state.ARCHITECTURES[app.architecture];
    const components = arch.components || {};
    const compulsory = components.compulsory || [];
    const atLeastOne = components.at_least_one || [];

    const totalRequired = compulsory.length + (atLeastOne.length > 0 ? 1 : 0);

    if (totalRequired === 0) {
        statusElement.textContent = "Installed";
        statusElement.className = "status-text status-ready";
        return;
    }

    let readyCompulsoryCount = 0;
    let readyAtLeastOneCount = 0;

    const checkComponents = async (componentList) => {
        let readyCount = 0;
        for (const compKey of componentList) {
            const modelInfo = state.MODELS_DATA[compKey];
            if (modelInfo) {
                const status = await checkModelStatus(modelInfo.id, modelInfo.model_path);
                if (status === 'ready') readyCount++;
            }
        }
        return readyCount;
    };

    readyCompulsoryCount = await checkComponents(compulsory);
    
    if (atLeastOne.length > 0) {
        for (const compKey of atLeastOne) {
            const modelInfo = state.MODELS_DATA[compKey];
            if (modelInfo) {
                const status = await checkModelStatus(modelInfo.id, modelInfo.model_path);
                if (status === 'ready') {
                    readyAtLeastOneCount++;
                    break;
                }
            }
        }
    }

    const installedCount = readyCompulsoryCount + (readyAtLeastOneCount > 0 ? 1 : 0);

    statusElement.textContent = `${installedCount} of ${totalRequired}`;

    if (installedCount === 0) {
        statusElement.className = "status-text status-missing";
    } else if (installedCount === totalRequired) {
        statusElement.className = "status-text status-ready";
    } else {
        statusElement.className = "status-text status-partial";
    }
}

export async function showAppDetails(app) {
    const detailsCol = document.getElementById('app-details-col');
    const detailsContent = document.getElementById('app-details-content');
    
    if (!detailsCol || !detailsContent) return;

    detailsCol.classList.remove('hidden');
    detailsContent.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading details...</div>';

    const card = document.querySelector(`.app-card[data-app-id="${app.id}"]`);
    let statusClass = 'status-missing'; // default
    if (card) {
        const statusEl = card.querySelector('.status-text');
        if (statusEl.classList.contains('status-ready')) {
            statusClass = 'status-ready';
        } else if (statusEl.classList.contains('status-partial')) {
            statusClass = 'status-partial';
        }
    }

    let html = `
        <div class="details-header">
            <div style="display:flex; justify-content:space-between; align-items:start;">
                <h2 class="details-title">${app.name}</h2>
                <button class="btn-action" onclick="document.getElementById('app-details-col').classList.add('hidden')" style="padding:4px 8px;"><i class="fas fa-times"></i></button>
            </div>
            <p class="details-description">${app.description}</p>
            <div style="margin-top:10px;">
                <button class="btn-action open-app-btn ${statusClass}" onclick="window.open('saus/${app.url}', '_blank')"><i class="fas fa-play"></i> Open App</button>                
            </div>
        </div>
    `;

    if (app.architecture && state.ARCHITECTURES[app.architecture]) {
        const arch = state.ARCHITECTURES[app.architecture];
        const components = arch.components || {};
        
        const [compulsoryHtml, atLeastOneHtml, optionalHtml] = await Promise.all([
            renderComponentList("Compulsory Models", components.compulsory, 'compulsory'),
            renderComponentList("At Least One Required", components.at_least_one, 'at_least_one'),
            renderComponentList("Optional Models", components.optional, 'optional')
        ]);
        
        html += compulsoryHtml + atLeastOneHtml + optionalHtml;
    } else {
        html += `<p>No architecture information available.</p>`;
    }

    detailsContent.innerHTML = html;
}

async function renderComponentList(title, componentKeys, listType) {
    if (!componentKeys || componentKeys.length === 0) return '';

    const modelStatuses = await Promise.all(componentKeys.map(async (key) => {
        const model = state.MODELS_DATA[key];
        if (!model) return { key, model: null, status: 'error' };
        const status = await checkModelStatus(model.id, model.model_path);
        return { key, model, status };
    }));

    const readyCount = modelStatuses.filter(m => m.status === 'ready').length;
    const totalCount = modelStatuses.length;

    let headerTrafficLight = '';
    if (listType === 'compulsory' && totalCount > 0) {
        let color = '#f44336'; // red
        if (readyCount === totalCount) {
            color = '#4caf50'; // green
        } else if (readyCount > 0) {
            color = '#ff9800'; // orange
        }
        headerTrafficLight = `<i class="fas fa-circle" style="color: ${color}; margin-right: 8px;"></i>`;
    } else if (listType === 'at_least_one' && totalCount > 0) {
        let color = readyCount > 0 ? '#4caf50' : '#f44336'; // green or red
        headerTrafficLight = `<i class="fas fa-circle" style="color: ${color}; margin-right: 8px;"></i>`;
    }

    let html = `<div class="component-section"><h4>${headerTrafficLight}${title}</h4>`;

    const itemsHtml = modelStatuses.map(({ key, model, status }) => {
        if (!model) return '';

        const isReady = status === 'ready';

        let backgroundClass = '';
        if (listType === 'compulsory' || listType === 'at_least_one') {
            backgroundClass = isReady ? 'required-installed' : 'required-missing';
        } else if (listType === 'optional') {
            if (isReady) {
                backgroundClass = 'optional-installed';
            }
        }

        return `
            <div class="component-item ${backgroundClass}" data-file-id="${model.id}" data-list-type="${listType}">
                <div class="component-info">
                    <span class="component-name">${model.name}</span>
                    <!--<span class="component-filename">${model.id}</span>-->
                </div>
                <div class="component-actions">
                    ${isReady 
                        ? `<button class="btn-action delete" onclick="deleteModel('${model.id}', '${model.model_path}')" title="Uninstall" style="padding:4px 8px;"><i class="fas fa-trash-alt"></i></button>`
                        : `<button class="btn-action" onclick="downloadModel('${model.type}', '${model.url_model}', '${model.model_path}', '${model.id}', event)" title="Install" style="padding:4px 8px;"><i class="fas fa-download"></i></button>`
                    }
                </div>
            </div>
        `;
    }).join('');

    html += itemsHtml;
    html += `</div>`;
    return html;
}

function updateSectionHeader(section, listType) {
    if (listType === 'optional') return;

    const items = section.querySelectorAll('.component-item');
    const total = items.length;
    let ready = 0;

    items.forEach(item => {
        if (item.classList.contains('required-installed') || item.classList.contains('optional-installed')) {
            ready++;
        }
    });

    const header = section.querySelector('h4');
    if (!header) return;

    const existingIcon = header.querySelector('i.fa-circle');
    if (existingIcon) existingIcon.remove();

    let color = '#f44336';
    if (listType === 'compulsory') {
        if (ready === total) color = '#4caf50';
        else if (ready > 0) color = '#ff9800';
    } else if (listType === 'at_least_one') {
        color = ready > 0 ? '#4caf50' : '#f44336';
    }

    header.insertAdjacentHTML('afterbegin', `<i class="fas fa-circle" style="color: ${color}; margin-right: 8px;"></i>`);
}

function updateOpenAppButtonStatus() {
    const detailsContent = document.getElementById('app-details-content');
    if (!detailsContent) return;

    const openAppBtn = detailsContent.querySelector('.open-app-btn');
    if (!openAppBtn) return;

    const compulsoryItems = detailsContent.querySelectorAll('.component-item[data-list-type="compulsory"]');
    const atLeastOneItems = detailsContent.querySelectorAll('.component-item[data-list-type="at_least_one"]');

    let compulsoryReady = 0;
    compulsoryItems.forEach(item => {
        if (item.classList.contains('required-installed')) compulsoryReady++;
    });

    let atLeastOneReady = 0;
    atLeastOneItems.forEach(item => {
        if (item.classList.contains('required-installed')) atLeastOneReady++;
    });

    const totalRequired = compulsoryItems.length + (atLeastOneItems.length > 0 ? 1 : 0);
    const installedCount = compulsoryReady + (atLeastOneReady > 0 ? 1 : 0);

    openAppBtn.classList.remove('status-ready', 'status-partial', 'status-missing');

    if (installedCount === 0 && totalRequired > 0) {
        openAppBtn.classList.add('status-missing');
    } else if (installedCount === totalRequired) {
        openAppBtn.classList.add('status-ready');
    } else {
        openAppBtn.classList.add('status-partial');
    }
}

export function updateComponentStatus(fileId, status, progress = 0) {
    if (!fileId) {
        console.warn("[SAUS] Received update without fileId. Please restart your ComfyUI server to apply backend changes.");
        return;
    }
    //console.log(`[SAUS] updateComponentStatus: ${fileId} -> ${status} (${progress}%)`);

    if (status === 'ready' || status === 'missing') {
        const AppCards = document.querySelectorAll('.app-card');
        AppCards.forEach(card => {
            const AppId = card.dataset.appId;
            const app = state.allApps.find(f => f.id === AppId);
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
    
    let model = null;
    for (const key in state.MODELS_DATA) {
        if (state.MODELS_DATA[key].id === fileId) {
            model = state.MODELS_DATA[key];
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
            <button class="btn-action delete" onclick="deleteModel('${model.id}', '${model.model_path}')" title="Uninstall" style="padding:4px 8px;"><i class="fas fa-trash-alt"></i></button>
        `;

        const listType = item.dataset.listType;
        if (listType === 'compulsory' || listType === 'at_least_one') {
            item.classList.remove('required-missing');
            item.classList.add('required-installed');
        } else if (listType === 'optional') {
            item.classList.add('optional-installed');
        }

        const section = item.closest('.component-section');
        if (section && listType) updateSectionHeader(section, listType);

    } else if (status === 'missing') {
        actions.innerHTML = `
            <button class="btn-action" onclick="downloadModel('${model.type}', '${model.url_model}', '${model.model_path}', '${model.id}', event)" title="Install" style="padding:4px 8px;"><i class="fas fa-download"></i></button>
        `;

        const listType = item.dataset.listType;
        if (listType === 'compulsory' || listType === 'at_least_one') {
            item.classList.remove('required-installed');
            item.classList.add('required-missing');
        } else if (listType === 'optional') {
            item.classList.remove('optional-installed');
        }

        const section = item.closest('.component-section');
        if (section && listType) updateSectionHeader(section, listType);
    }

    updateOpenAppButtonStatus();
}

// Helper function for Modal
function showConfirmationModal(title, message, onConfirm, type = 'info') {
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    
    const confirmBtnText = type === 'delete' ? 'Delete' : 'Install';
    const icon = type === 'delete' ? '<i class="fas fa-trash-alt"></i>' : '<i class="fas fa-download"></i>';

    overlay.innerHTML = `
        <div class="modal-container">
            <div class="modal-header">
                <h3>${title}</h3>
                <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
                <p>${message}</p>
            </div>
            <div class="modal-footer">
                <button class="btn-modal-secondary">Cancel</button>
                <button class="btn-modal-primary ${type === 'delete' ? 'delete' : ''}">${icon} ${confirmBtnText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeBtn = overlay.querySelector('.modal-close');
    const cancelBtn = overlay.querySelector('.btn-modal-secondary');
    const confirmBtn = overlay.querySelector('.btn-modal-primary');

    const close = () => overlay.remove();

    closeBtn.onclick = close;
    cancelBtn.onclick = close;
    
    confirmBtn.onclick = () => {
        onConfirm();
        close();
    };
    
    overlay.onclick = (e) => {
        if (e.target === overlay) close();
    };
}

// Helper function for Toast
function showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    // Trigger reflow
    toast.offsetHeight;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Expose functions to window for onclick handlers
window.downloadModel = async function(componentType, urlModel, modelPath, fileId, event) {
    if (event) event.stopPropagation();
    if (!modelPath) {
        showToast("Cannot download: Model path is missing configuration.", "error");
        return;
    }
    
    if (fileId) updateComponentStatus(fileId, 'downloading', 0);

    try {
        const response = await fetch('/saus/api/download-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ component_type: componentType, url_model: urlModel, model_path: modelPath, file_name: fileId })
        });
        const result = await response.json();
        if (response.ok) {
            showToast("Download started", "info");
        } else {
            showToast(result.message, "error");
            if (fileId) updateComponentStatus(fileId, 'missing');
        }
    } catch (e) {
        console.error(e);
        showToast('Error initiating download', "error");
        if (fileId) updateComponentStatus(fileId, 'missing');
    }
};

window.deleteModel = function(fileId, modelPath) {
    showConfirmationModal(
        "Delete Model",
        `Are you sure you want to delete <strong>${fileId}</strong>?<br>This action cannot be undone.`,
        async () => {
            try {
                const response = await fetch('/saus/api/delete-model', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_id: fileId, model_path: modelPath })
                });
                const result = await response.json();
                
                if (response.ok) {
                    updateComponentStatus(fileId, 'missing');
                    showToast(`${fileId} deleted successfully`, "success");
                } else {
                    showToast(result.message, "error");
                }
            } catch (e) {
                console.error(e);
                showToast('Error deleting file', "error");
            }
        },
        'delete'
    );
};