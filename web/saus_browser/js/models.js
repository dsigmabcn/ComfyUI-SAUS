import { state } from './state.js';

/** Escape a value so it is safe inside HTML text OR a quoted attribute. */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * One delegated click handler for every action button rendered inside the
 * app-details modal. Nothing is inlined into the markup, so data (file names,
 * model names, URLs) can never be interpreted as code.
 */
function handleModelActionClick(event) {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    if (action === 'open-app') {
        event.stopPropagation();
        window.open(`saus/${btn.dataset.url || ''}`, '_blank');
        return;
    }

    const item = btn.closest('.component-item');
    if (!item) return;
    const fileId = item.dataset.fileId || '';
    const model = state.MODELS_DATA[fileId] || {};
    event.stopPropagation();

    if (action === 'download-model') {
        window.downloadModel(model.type || '', model.url || '', model.directory || '', fileId, event);
    } else if (action === 'delete-model') {
        window.deleteModel(fileId, model.directory || '', model.type || '');
    }
}


export async function checkModelStatus(fileId, modelPath, modelType = '') {
    if (!fileId) return 'missing';
    try {
        // model_path (the registry folder) is only a hint: the server looks for
        // the file in every ComfyUI model folder, sub-folders included.
        const query = new URLSearchParams({
            file_id: fileId,
            model_path: modelPath || '',
            type: modelType || ''
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

/**
 * Model groups for an app, taken from its architecture's ``models``.
 * Each group = one model type, with ``need`` "all" | "one" | "none".
 * Falls back to the legacy flat ``metadata.models`` (all required) when the
 * architecture has no grouped models yet.
 */
export function modelsForApp(app) {
    const arch = (app && app.architecture && state.ARCHITECTURES)
        ? state.ARCHITECTURES[app.architecture]
        : null;
    const groups = (arch && arch.models) || null;

    if (Array.isArray(groups) && groups.length && typeof groups[0] === 'object') {
        return groups.map((group) => ({
            id: group.id || group.type || 'model',
            label: group.type || group.id || 'Models',
            need: group.need || 'all',
            files: (group.files || []).map((f) => (typeof f === 'string' ? { file: f } : f)),
        }));
    }

    const filenames = (app && app.metadata && app.metadata.models) || [];
    if (!filenames.length) return [];
    return [{
        id: 'models',
        label: 'Models',
        need: 'all',
        files: filenames.map((f) => ({ file: f })),
    }];
}

function isModelSatisfied(group, readyCount) {
    if (group.need === 'none') return true;
    if (group.need === 'one') return readyCount > 0;
    return group.files.length > 0 && readyCount === group.files.length;
}

export async function updateAppStatus(app, statusElement) {
    const groups = modelsForApp(app).filter((group) => group.need !== 'none');

    if (groups.length === 0) {
        // No models required (e.g. pure "tools" apps).
        statusElement.textContent = "Installed";
        statusElement.className = "status-text status-ready";
        return;
    }

    let satisfied = 0;
    for (const group of groups) {
        let readyCount = 0;
        for (const entry of group.files) {
            const model = state.MODELS_DATA[entry.file];
            const directory = (model && model.directory) || "";
            const type = (model && model.type) || "";
            const status = await checkModelStatus(entry.file, directory, type);
            if (status === 'ready') readyCount++;
        }
        if (isModelSatisfied(group, readyCount)) satisfied++;
    }

    statusElement.textContent = `${satisfied} of ${groups.length}`;

    if (satisfied === 0) {
        statusElement.className = "status-text status-missing";
    } else if (satisfied === groups.length) {
        statusElement.className = "status-text status-ready";
    } else {
        statusElement.className = "status-text status-partial";
    }
}

export async function showAppDetails(app) {
    // Show the app info as a modal (more room than the old side panel).
    document.getElementById('app-details-modal')?.remove();

    const arch = (app.architecture && state.ARCHITECTURES) ? state.ARCHITECTURES[app.architecture] : null;

    const overlay = document.createElement('div');
    overlay.id = 'app-details-modal';
    overlay.className = 'app-details-overlay';

    const modal = document.createElement('div');
    modal.className = 'app-details-modal';
    modal.innerHTML = `
        <div class="app-details-modal-head">
            ${arch ? `<span class="details-arch">Architecture: ${escapeHtml(app.architecture)}</span>` : '<span></span>'}
            <button type="button" class="btn-action app-details-close" aria-label="Close"><i class="fas fa-times"></i></button>
        </div>
        <div class="app-details-modal-body">
            <div id="app-details-content"></div>
        </div>
    `;
    overlay.appendChild(modal);

    // Delegated listener: all model buttons inside the modal body.
    modal.querySelector('.app-details-modal-body').addEventListener('click', handleModelActionClick);
    document.body.appendChild(overlay);

    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey);
    };
    modal.querySelector('.app-details-close').addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    const detailsContent = document.getElementById('app-details-content');
    detailsContent.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading details...</div>';

    let card = null;
    document.querySelectorAll('.app-card').forEach((el) => {
        if (!card && el.dataset.appId === app.id) card = el;
    });
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
        <div class="app-details-top">
            <img class="app-details-thumb" src="saus/${escapeHtml(app.url)}/media/thumbnail.jpg" alt=""
                 onerror="this.onerror=null; this.style.visibility='hidden';">
            <div class="app-details-toptext">
                <h2 class="details-title">${escapeHtml(app.name)}</h2>
                <p class="details-description">${escapeHtml(app.description || '')}</p>
                <div class="app-details-actions">
                    <button class="btn-action open-app-btn ${statusClass}" data-action="open-app" data-url="${escapeHtml(app.url)}"><i class="fas fa-play"></i> Open App</button>
                </div>
            </div>
        </div>
    `;

    const groupListType = (need) => need === 'one' ? 'at_least_one'
        : need === 'none' ? 'optional' : 'compulsory';

    // One card per variant. The models (with status + install/uninstall
    // buttons) live INSIDE each variant, so nothing is duplicated. When the
    // architecture has no variants, everything is a single "Base" card.
    const blocks = [];
    if (arch && arch.variants && Object.keys(arch.variants).length) {
        Object.entries(arch.variants).forEach(([vid, v]) => {
            const entries = [];
            (arch.models || []).forEach((group) => {
                const files = (group.files || []).map((f) => (typeof f === 'string' ? f : f.file)).filter(Boolean);
                const lt = groupListType(group.need || 'all');
                const pick = (v.pick || {})[group.id];
                if (pick) {
                    entries.push({ file: pick, label: group.type || group.id, listType: lt });
                } else if ((group.need || 'all') === 'all') {
                    files.forEach((f) => entries.push({ file: f, label: group.type || group.id, listType: lt }));
                }
            });
            (v.loras || []).forEach((f) => entries.push({ file: f, label: 'LORA', listType: 'optional' }));
            blocks.push({ title: v.label || vid, settings: v.settings || {}, entries });
        });
    } else {
        const groups = modelsForApp(app);
        const entries = [];
        groups.forEach((g) => (g.files || []).forEach((f) => entries.push({
            file: f.file, label: g.label || 'Models', listType: groupListType(g.need)
        })));
        blocks.push({ title: 'Base', settings: {}, entries });
    }

    const allFiles = [...new Set(blocks.flatMap((b) => b.entries.map((e) => e.file)))];
    const readyByFile = {};
    await Promise.all(allFiles.map(async (file) => {
        const model = state.MODELS_DATA[file] || { name: file };
        readyByFile[file] = (await checkModelStatus(file, model.directory || '', model.type || '')) === 'ready';
    }));

    if (!blocks.some((b) => b.entries.length)) {
        html += `<p>This app has no model requirements.</p>`;
    } else {
        html += `<p class="details-instructions">Install or manage the models required for each variant below.</p>`;
        html += `<div class="variant-list">`;
        blocks.forEach((block) => {
            const uniq = [...new Set(block.entries.map((e) => e.file))];
            const ready = uniq.filter((f) => readyByFile[f]).length;
            const dot = uniq.length === 0 ? '#9e9e9e'
                : (ready === uniq.length ? '#4caf50' : (ready === 0 ? '#f44336' : '#ff9800'));
            html += `
                <div class="variant-card">
                    <div class="variant-card-title">
                        <i class="fas fa-circle" style="color:${dot}; margin-right:8px;"></i>${escapeHtml(block.title)}
                    </div>
                    <div class="variant-models">
                        ${block.entries.map((e) => componentItemHtml(e.file, e.listType, readyByFile[e.file], e.label)).join('')}
                    </div>
                    ${Object.keys(block.settings).length
                        ? `<div class="variant-settings">${Object.entries(block.settings).map(([k, val]) => escapeHtml(`${k} = ${val}`)).join(' · ')}</div>`
                        : ''}
                </div>`;
        });
        html += `</div>`;
    }

    detailsContent.innerHTML = html;
}

/** Friendly names for the model types (unify how we display them). */
const TYPE_LABELS = {
    'CHECKPOINT': 'Checkpoint',
    'CONTROLNET': 'ControlNet',
    'LORA': 'LoRA',
    'MOTION_MODULE': 'Motion module',
    'TEXT ENCODER': 'Text encoder',
    'Clipvision': 'Clip vision',
    'Latent Upscaler': 'Latent upscaler',
    'Style': 'Style model'
};

function prettyType(type) {
    if (!type) return '';
    return TYPE_LABELS[type] || type;
}

function componentItemHtml(filename, listType, isReady, label = '') {
    const model = state.MODELS_DATA[filename] || { name: filename };
    const hasUrl = !!model.url;
    const backgroundClass = listType === 'optional'
        ? (isReady ? 'optional-installed' : '')
        : (isReady ? 'required-installed' : 'required-missing');

    const action = isReady
        ? `<button class="btn-action delete" data-action="delete-model" title="Uninstall" style="padding:4px 8px;"><i class="fas fa-trash-alt"></i></button>`
        : (hasUrl
            ? `<button class="btn-action" data-action="download-model" title="Install" style="padding:4px 8px;"><i class="fas fa-download"></i></button>`
            : `<span class="status-badge missing" title="No download URL configured">no URL</span>`);

    const typeHeader = label ? `<div class="model-type">${escapeHtml(prettyType(label))}</div>` : '';

    return `
        ${typeHeader}
        <div class="component-item ${backgroundClass}" data-file-id="${escapeHtml(filename)}" data-list-type="${escapeHtml(listType)}">
            <div class="component-info">
                <span class="component-name">${escapeHtml(model.name || filename)}</span>
            </div>
            <div class="component-actions">${action}</div>
        </div>
    `;
}

/** Semaphore colour for a set of component items (red / orange / green). */
function semaphoreColor(items) {
    if (!items.length) return '#9e9e9e';
    const ready = items.filter((it) => it.classList.contains('required-installed')
        || it.classList.contains('optional-installed')).length;
    if (ready === items.length) return '#4caf50';
    if (ready === 0) return '#f44336';
    return '#ff9800';
}

/** Refresh the red/orange/green dot of every variant card after a status change. */
function refreshVariantDots() {
    document.querySelectorAll('.variant-card').forEach((card) => {
        const dot = card.querySelector('.variant-card-title .fa-circle');
        if (!dot) return;
        dot.style.color = semaphoreColor([...card.querySelectorAll('.component-item')]);
    });
}

async function renderComponentList(title, filenames, listType) {
    if (!filenames || filenames.length === 0) return '';

    const modelStatuses = await Promise.all(filenames.map(async (filename) => {
        const model = state.MODELS_DATA[filename] || { name: filename };
        const directory = model.directory || "";
        const status = await checkModelStatus(filename, directory, model.type || '');
        return { filename, model, status };
    }));

    const readyCount = modelStatuses.filter(m => m.status === 'ready').length;
    const totalCount = modelStatuses.length;

    let color = '#f44336'; // red
    if (listType === 'optional') {
        color = '#9e9e9e';                                   // neutral grey
    } else if (listType === 'at_least_one') {
        color = readyCount > 0 ? '#4caf50' : '#f44336';      // ≥1 installed
    } else if (readyCount === totalCount) {
        color = '#4caf50';                                   // green
    } else if (readyCount > 0) {
        color = '#ff9800';                                   // orange
    }

    let html = `<div class="component-section"><h4><i class="fas fa-circle" style="color: ${color}; margin-right: 8px;"></i>${escapeHtml(title)}</h4>`;
    html += modelStatuses.map(({ filename, status }) => componentItemHtml(filename, listType, status === 'ready')).join('');
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

    openAppBtn.classList.remove('status-ready', 'status-partial', 'status-missing');

    // New layout: one card per variant. The app is "ready" when at least one
    // variant has all of its (non-optional) models installed.
    const cards = detailsContent.querySelectorAll('.variant-card');
    if (cards.length) {
        let anyReady = false;
        let anyPartial = false;
        cards.forEach((card) => {
            const required = [...card.querySelectorAll('.component-item')]
                .filter((it) => it.dataset.listType !== 'optional');
            if (!required.length) return;
            const ready = required.filter((it) => it.classList.contains('required-installed')).length;
            if (ready === required.length) anyReady = true;
            else if (ready > 0) anyPartial = true;
        });
        if (anyReady) openAppBtn.classList.add('status-ready');
        else if (anyPartial) openAppBtn.classList.add('status-partial');
        else openAppBtn.classList.add('status-missing');
        return;
    }

    // Legacy layout: each .component-section is one requirement group.
    const sections = detailsContent.querySelectorAll('.component-section');
    let total = 0;
    let satisfied = 0;

    sections.forEach(section => {
        const items = section.querySelectorAll('.component-item');
        if (!items.length) return;

        const listType = items[0].dataset.listType || 'compulsory';
        if (listType === 'optional') return;

        let ready = 0;
        items.forEach(item => {
            if (item.classList.contains('required-installed')) ready++;
        });

        total++;
        if (listType === 'at_least_one') {
            if (ready > 0) satisfied++;
        } else if (ready === items.length) {
            satisfied++;
        }
    });

    if (total > 0 && satisfied === 0) {
        openAppBtn.classList.add('status-missing');
    } else if (satisfied === total) {
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

    // Lookup by property (a crafted file name can never be parsed as a selector).
    const scope = document.getElementById('app-details-content');
    let item = null;
    if (scope) {
        for (const el of scope.querySelectorAll('.component-item')) {
            if (el.dataset.fileId === fileId) { item = el; break; }
        }
    }
    if (!item) return;

    const actions = item.querySelector('.component-actions');
    
    const model = state.MODELS_DATA[fileId];
    if (!model) return;

    if (status === 'downloading') {
        const pct = Math.max(0, Math.min(100, Number(progress) || 0));
        actions.innerHTML = `
            <span class="status-badge downloading">Downloading ${pct}%</span>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
        `;
    } else if (status === 'ready') {
        actions.innerHTML = `
            <button class="btn-action delete" data-action="delete-model" title="Uninstall" style="padding:4px 8px;"><i class="fas fa-trash-alt"></i></button>
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
            <button class="btn-action" data-action="download-model" title="Install" style="padding:4px 8px;"><i class="fas fa-download"></i></button>
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

    refreshVariantDots();
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
        <span>${escapeHtml(message)}</span>
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
    if (!urlModel) {
        showToast("Cannot download: no download URL is configured for this model.", "error");
        return;
    }

    if (fileId) updateComponentStatus(fileId, 'downloading', 0);

    try {
        const response = await fetch('/saus/api/download-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                component_type: componentType,
                url_model: urlModel,
                model_path: modelPath || '',
                file_name: fileId,
                type: componentType
            })
        });
        const result = await response.json();
        if (response.ok) {
            if (result.status === 'already_installed') {
                // It lives in another ComfyUI folder: nothing to fetch, just
                // mark it installed (silently).
                if (fileId) updateComponentStatus(fileId, 'ready');
                return;
            }
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

window.deleteModel = function(fileId, modelPath, modelType = '') {
    showConfirmationModal(
        "Delete Model",
        `Are you sure you want to delete <strong>${escapeHtml(fileId)}</strong>?<br>This action cannot be undone.`,
        async () => {
            try {
                const response = await fetch('/saus/api/delete-model', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ file_id: fileId, model_path: modelPath, type: modelType })
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