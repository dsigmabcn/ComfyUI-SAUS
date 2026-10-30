import { state } from './state.js';
import {
    bucketsComplete, bucketsMissing, missingEntries, statusesFromReadyMap, variantBuckets,
    variantColour,
} from './variantStatus.js';

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
/**
 * Install / uninstall / download-all / open, from a click anywhere in a
 * `.component-item` (or on a variant card's own "Download All").
 *
 * Delegated on the list that holds the rows, so the app details modal and the Model
 * Manager share one dispatcher and one implementation of each action.
 */
export function handleModelActionClick(event) {
    const btn = event.target.closest('button[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    if (action === 'download-all') {
        // Not inside a .component-item: it belongs to the whole variant card.
        event.stopPropagation();
        downloadMissingInVariant(btn.closest('.variant-card'));
        return;
    }

    if (action === 'open-app') {
        event.stopPropagation();
        // Opening is routed through the document event main.js wires to tabs.js -
        // the same route the explorer row takes - so "Open App" lands in a
        // workspace tab. window.open() stranded the user in a bare app page: no
        // rail, no tabs, no console. The catalog entry is resolved here so the
        // tab's url is one the shell knows, never the button's data attribute.
        const app = state.allApps.find((candidate) =>
            candidate.url === btn.dataset.url || candidate.id === btn.dataset.url);
        document.dispatchEvent(new CustomEvent('saus:open-app', {
            detail: app
                ? { id: app.id, url: app.url, name: app.name }
                : { url: btn.dataset.url },
        }));
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


async function checkModelStatus(fileId, modelPath, modelType = '') {
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
function modelsForApp(app) {
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

/* ------------------------------------------------------------------ *
 * What an app needs, per variant (see variantBlocks).
 * ------------------------------------------------------------------ */

/**
 * What an app needs, one block per variant.
 *
 * A variant picks one file per "one of" group and inherits everything that is
 * compulsory; the LoRAs it adds (lightning / turbo) stay optional, so a missing
 * one never blocks the variant. Shared by the status dot and the information
 * modal, so the two can never disagree.
 */
export function variantBlocks(app) {
    const arch = (app && app.architecture && state.ARCHITECTURES)
        ? state.ARCHITECTURES[app.architecture]
        : null;

    const listTypeFor = (need) => need === 'one' ? 'at_least_one'
        : need === 'none' ? 'optional' : 'compulsory';

    if (arch && arch.variants && Object.keys(arch.variants).length) {
        return Object.entries(arch.variants).map(([variantId, variant]) => {
            const entries = [];
            (arch.models || []).forEach((group) => {
                const files = (group.files || [])
                    .map((f) => (typeof f === 'string' ? f : f.file))
                    .filter(Boolean);
                const pick = (variant.pick || {})[group.id];
                const label = group.type || group.id;

                if (pick) {
                    // A file a variant picks is required by that variant - even
                    // from a group the app as a whole does not need (the
                    // LIGHTNING variant needs its lightning LoRA, for example).
                    entries.push({ file: pick, label, listType: 'compulsory' });
                } else if ((group.need || 'all') === 'all') {
                    files.forEach((f) => entries.push({ file: f, label, listType: 'compulsory' }));
                } else if ((group.need || 'all') === 'one') {
                    // "one of these": any single one of them completes the variant.
                    files.forEach((f) => entries.push({ file: f, label, listType: 'at_least_one' }));
                }
            });
            // LoRAs attached to a variant (lightning / turbo) are required by it.
            (variant.loras || []).forEach((f) => entries.push({ file: f, label: 'LORA', listType: 'compulsory' }));
            return { title: variant.label || variantId, settings: variant.settings || {}, entries };
        });
    }

    const entries = [];
    modelsForApp(app).forEach((group) => {
        if (group.need === 'none') return;
        (group.files || []).forEach((f) => entries.push({
            file: f.file, label: group.label || 'Models', listType: listTypeFor(group.need),
        }));
    });
    return [{ title: 'Base', settings: {}, entries }];
}

/* ------------------------------------------------------------------ *
 * Model status. The explorer shows one dot + tooltip per app, so status
 * is fetched in batches and cached: unfolding a subcategory costs a
 * single request no matter how many models those apps need.
 * ------------------------------------------------------------------ */

const STATUS_TTL_MS = 60 * 1000;
const STATUS_BATCH_LIMIT = 500;

// Everything that paints model status registers here - the explorer rows, the App
// Manager, the model manager: a download or a delete changes what is installed, so
// each of those views repaints itself. A set, not a single slot, because more than
// one view is alive at a time.
const statusChangeHandlers = new Set();

/** main.js wires this so the explorer can repaint after a download. */
export function setStatusChangeHandler(fn) {
    return subscribeStatusChanges(fn);
}

/** Add one more listener; the returned function removes it again. */
export function subscribeStatusChanges(fn) {
    if (typeof fn !== 'function') return () => {};
    statusChangeHandlers.add(fn);
    return () => statusChangeHandlers.delete(fn);
}

function notifyStatusChanged() {
    statusChangeHandlers.forEach((handler) => {
        try {
            handler();
        } catch (error) {
            console.error('[SAUS] A model status listener failed:', error);
        }
    });
}

/** The `{file_id, model_path, type, label}` triple the status routes take. */
export function statusEntry(fileId) {
    const model = state.MODELS_DATA[fileId] || {};
    return {
        file_id: fileId,
        model_path: model.directory || '',
        type: model.type || '',
        // Human-readable name, used in the hover tooltip.
        label: model.name || fileId,
    };
}

/** Every registry file the app's variants can need, deduplicated. */
function filesForApp(app) {
    const seen = new Map();
    variantBlocks(app).forEach(block => block.entries.forEach(entry => {
        if (entry.file && !seen.has(entry.file)) seen.set(entry.file, statusEntry(entry.file));
    }));
    return Array.from(seen.values());
}

/**
 * Ask the server about many files at once. Falls back to the per-file
 * endpoint when the batch route is missing (an older server).
 */
export async function fetchModelStatuses(entries) {
    const chunk = entries.slice(0, STATUS_BATCH_LIMIT);
    if (!chunk.length) return new Map();

    try {
        const response = await fetch('/saus/api/model-status-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: chunk.map(({ file_id, model_path, type }) => ({ file_id, model_path, type })),
            }),
        });
        if (response.ok) {
            const data = await response.json();
            const statuses = new Map();
            const reported = data.statuses || {};
            chunk.forEach(entry => {
                statuses.set(entry.file_id, reported[entry.file_id] || 'missing');
            });
            return statuses;
        }
    } catch (error) {
        console.error('Batch model status failed, falling back to single checks:', error);
    }

    const statuses = new Map();
    for (const entry of chunk) {
        statuses.set(entry.file_id, await checkModelStatus(entry.file_id, entry.model_path, entry.type));
    }
    return statuses;
}

/**
 * App status across its variants (pure function):
 *
 *   green  = every variant has all of its required models
 *   orange = at least one variant is complete, another is not
 *   red    = no variant is complete
 *
 * The rule itself lives in `variantStatus.js`, so the explorer's dot and the
 * information panel's card dot cannot disagree (they used to).
 */
function computeAppStatus(app, statuses, at) {
    const variants = variantBlocks(app).map(block => {
        const buckets = variantBuckets(block.entries, statuses);
        return {
            title: block.title,
            ready: bucketsComplete(buckets),
            missing: bucketsMissing(buckets),
            hasModels: block.entries.length > 0,
        };
    });

    // Variants that need nothing at all do not count either way.
    const counted = variants.filter(variant => variant.hasModels);
    const total = counted.length;
    const satisfied = counted.filter(variant => variant.ready).length;

    let stateName = 'ready';
    if (total && satisfied !== total) {
        stateName = satisfied === 0 ? 'missing' : 'partial';
    }

    const firstMissing = counted.find(variant => !variant.ready);
    return {
        state: stateName,
        satisfied,
        total,
        missing: firstMissing ? firstMissing.missing : [],
        variants,
        at,
    };
}

/** Cached status of one app; ``force`` ignores the cache. */
export async function getAppStatus(app, { force = false } = {}) {
    if (!app || !app.id) return { state: 'ready', satisfied: 0, total: 0, missing: [], at: Date.now() };

    const cached = state.statusCache.get(app.id);
    if (cached && !force && Date.now() - cached.at < STATUS_TTL_MS) return cached;

    const entries = filesForApp(app);
    const statuses = entries.length ? await fetchModelStatuses(entries) : new Map();
    const fresh = computeAppStatus(app, statuses, Date.now());
    state.statusCache.set(app.id, fresh);
    return fresh;
}

/** Check a whole screenful of apps with one request, then prime the cache. */
export async function warmAppStatuses(apps) {
    const pending = (apps || []).filter(app => {
        if (!app || !app.id) return false;
        const cached = state.statusCache.get(app.id);
        return !cached || Date.now() - cached.at >= STATUS_TTL_MS;
    });
    if (!pending.length) return;

    const entries = new Map();
    pending.forEach(app => filesForApp(app).forEach(entry => entries.set(entry.file_id, entry)));

    const statuses = entries.size
        ? await fetchModelStatuses(Array.from(entries.values()))
        : new Map();

    const at = Date.now();
    pending.forEach(app => {
        state.statusCache.set(app.id, computeAppStatus(app, statuses, at));
    });
}

/** Drop cached statuses (after a download/delete) and notify the UI. */
export function invalidateStatusCache(appId = null) {
    if (appId) state.statusCache.delete(appId);
    else state.statusCache.clear();
    notifyStatusChanged();
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
        document.removeEventListener('saus:open-app', close);
    };
    modal.querySelector('.app-details-close').addEventListener('click', close);
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);
    // Opening the app in a tab replaces this panel: it was only the way to get there.
    document.addEventListener('saus:open-app', close);

    const detailsContent = document.getElementById('app-details-content');
    detailsContent.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Loading details...</div>';

    // Status of the app (cached by the explorer, refreshed here if needed).
    const appStatus = await getAppStatus(app);
    const statusClass = `status-${appStatus.state}`;

    // The thumbnail the app actually ships; the API reports '' when it has none and the
    // logo stands in. Never guess a file name here: a wrong guess is a 404 in the console
    // that hides why nothing loaded (see the note in ui.js).
    const thumbFallbackUrl = '/core/media/ui/saus_logo.png';
    const thumbUrl = app.thumbnail
        ? `saus/${escapeHtml(app.url)}/${escapeHtml(app.thumbnail)}`
        : thumbFallbackUrl;

    let html = `
        <div class="app-details-top">
            <img class="app-details-thumb" src="${thumbUrl}" alt=""
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

    // One card per variant. The models (with status + install/uninstall
    // buttons) live INSIDE each variant, so nothing is duplicated. Built by the
    // same helper the explorer's status dot uses (variantBlocks).
    const blocks = variantBlocks(app);

    const allFiles = [...new Set(blocks.flatMap((b) => b.entries.map((e) => e.file)))];
    // One batched request for the whole panel. Asking per file cost a round trip
    // each (with many models that is what made the panel feel slow to open); the
    // batch route exists for exactly this - see fetchModelStatuses.
    const statuses = allFiles.length
        ? await fetchModelStatuses(allFiles.map(statusEntry))
        : new Map();
    const readyByFile = {};
    allFiles.forEach((file) => { readyByFile[file] = statuses.get(file) === 'ready'; });

    if (!blocks.some((b) => b.entries.length)) {
        html += `<p>This app has no model requirements.</p>`;
    } else {
        html += `<p class="details-instructions">Install or manage the models required for each variant below.</p>`;
        html += `<div class="variant-list">`;
        blocks.forEach((block) => {
            // The same rule the explorer's dot uses (variantStatus.js): the colour is
            // what the variant is *missing*, not how many of its alternatives are on
            // disk - and an uninstalled optional model never turns it orange.
            const dot = variantColour(block.entries, statuses);
            const missing = missingEntries(block.entries, statuses).length;
            html += `
                <div class="variant-card">
                    <div class="variant-card-title">
                        <span class="variant-card-label"><i class="fas fa-circle" style="color:${dot}; margin-right:8px;"></i>${escapeHtml(block.title)}</span>
                        <span class="variant-card-actions">
                            <button type="button" class="btn-action download-all-btn${missing ? '' : ' hidden'}" data-action="download-all"
                                    title="Install every model this variant still needs">
                                <i class="fas fa-download" aria-hidden="true"></i> Download All
                            </button>
                            <span class="variant-card-ready${missing ? ' hidden' : ''}"><i class="fas fa-check" aria-hidden="true"></i> All installed</span>
                        </span>
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

    // The buttons are painted with the card's first state; from here on
    // refreshVariantDots() keeps them in step with the model cards.
    detailsContent.querySelectorAll('.variant-card').forEach(syncDownloadAllButton);
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

export function prettyType(type) {
    if (!type) return '';
    return TYPE_LABELS[type] || type;
}

/* ------------------------------------------------------------------ *
 * Downloads in flight
 *
 * The panel is rebuilt every time it is opened, and a file being written
 * *exists* on disk, so the server reports it "ready" from the first megabyte.
 * The cards therefore need a memory of their own: a download is red (and shows
 * its progress) until the backend says it finished - whether the panel was open
 * at the time or not.
 * ------------------------------------------------------------------ */

const activeDownloads = new Map();

function rememberDownload(fileId, status, progress = 0) {
    if (status === 'downloading') {
        activeDownloads.set(fileId, Math.max(0, Math.min(100, Number(progress) || 0)));
    } else if (status === 'ready' || status === 'missing') {
        activeDownloads.delete(fileId);
    }
}

/** Progress of the download in flight for a file, or null when there is none. */
export function downloadProgressOf(fileId) {
    return activeDownloads.has(fileId) ? activeDownloads.get(fileId) : null;
}

function downloadingHtml(progress) {
    const pct = Math.max(0, Math.min(100, Number(progress) || 0));
    return `
        <span class="status-badge downloading">Downloading ${pct}%</span>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    `;
}

function componentItemHtml(filename, listType, isReady, label = '') {
    const model = state.MODELS_DATA[filename] || { name: filename };
    const hasUrl = !!model.url;
    // A download in flight outranks what the disk says, so a reopened panel shows
    // the card as it was: not ready, red, with its progress bar.
    const progress = downloadProgressOf(filename);
    const ready = isReady && progress === null;
    const backgroundClass = listType === 'optional'
        ? (ready ? 'optional-installed' : '')
        : (ready ? 'required-installed' : 'required-missing');

    const action = progress !== null
        ? downloadingHtml(progress)
        : (ready
            ? `<button class="btn-action delete" data-action="delete-model" title="Uninstall" style="padding:4px 8px;"><i class="fas fa-trash-alt"></i></button>`
            : (hasUrl
                ? `<button class="btn-action" data-action="download-model" title="Install" style="padding:4px 8px;"><i class="fas fa-download"></i></button>`
                : `<span class="status-badge missing" title="No download URL configured">no URL</span>`));

    const typeHeader = label ? `<div class="model-type">${escapeHtml(prettyType(label))}</div>` : '';

    return `
        ${typeHeader}
        <div class="component-item ${backgroundClass}" data-file-id="${escapeHtml(filename)}" data-list-type="${escapeHtml(listType)}" data-list-label="${escapeHtml(label)}">
            <div class="component-info">
                <span class="component-name">${escapeHtml(model.name || filename)}</span>
            </div>
            <div class="component-actions">${action}</div>
        </div>
    `;
}

/** The entries one card's DOM holds, in the shape the status rule reads. */
function cardEntries(card) {
    return [...card.querySelectorAll('.component-item')].map((item) => ({
        file: item.dataset.fileId || '',
        listType: item.dataset.listType || 'compulsory',
        label: item.dataset.listLabel || '',
        installed: item.classList.contains('required-installed')
            || item.classList.contains('optional-installed'),
    }));
}

/**
 * Refresh a variant card after a status change: its red/orange/green dot and the
 * "Download All" button, which only means something while a model is still missing.
 *
 * The dot goes through the same rule the render and the explorer use, read back from
 * the card's own rows - so a download that finishes repaints the card exactly as
 * reopening the panel would.
 */
function refreshVariantDots() {
    document.querySelectorAll('.variant-card').forEach((card) => {
        const entries = cardEntries(card);
        const statuses = statusesFromReadyMap(
            Object.fromEntries(entries.map((entry) => [entry.file, entry.installed])));
        const dot = card.querySelector('.variant-card-title .fa-circle');
        if (dot) dot.style.color = variantColour(entries, statuses);
        syncDownloadAllButton(card);
    });
}

/**
 * The card's models a "Download All" would still fetch: required (compulsory or
 * "one of"), missing, named once and not already in flight - the shared rule decides
 * *what* is missing (`missingEntries` in variantStatus.js), this only maps it back to
 * the rows so the buttons know what they belong to.
 */
function variantMissingItems(card) {
    if (!card) return [];
    const entries = cardEntries(card);
    const statuses = statusesFromReadyMap(
        Object.fromEntries(entries.map((entry) => [entry.file, entry.installed])));
    const wanted = new Set(missingEntries(entries, statuses).map((entry) => entry.file));

    return [...card.querySelectorAll('.component-item')].filter((item) => {
        const fileId = item.dataset.fileId || '';
        if (!wanted.has(fileId)) return false;
        // A download already in flight is not started a second time.
        return downloadProgressOf(fileId) === null;
    });
}

/** Paint the card's "Download All" button / "All installed" note for its state. */
function syncDownloadAllButton(card) {
    const button = card.querySelector('.download-all-btn');
    const ready = card.querySelector('.variant-card-ready');
    if (!button || !ready) return;
    const missing = variantMissingItems(card).length;
    button.classList.toggle('hidden', missing === 0);
    ready.classList.toggle('hidden', missing > 0);
}

/**
 * One click installs everything the variant still needs.
 *
 * Sequential on purpose: the progress bars and the websocket events stay readable,
 * and a model with no URL is skipped rather than firing an error toast per file.
 */
async function downloadMissingInVariant(card) {
    const targets = variantMissingItems(card);
    if (!targets.length) return;
    for (const item of targets) {
        const fileId = item.dataset.fileId || '';
        const model = state.MODELS_DATA[fileId] || {};
        if (!model.url) continue;
        await window.downloadModel(model.type || '', model.url, model.directory || '', fileId);
    }
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
    // Remembered before any DOM work: the panel may be closed right now, and when
    // it opens again the cards have to know about the download still in flight.
    rememberDownload(fileId, status, progress);

    if (status === 'ready' || status === 'missing') {
        // A model appeared or vanished: drop the cached app summaries so the
        // explorer repaints its dots and tooltips on the next render.
        invalidateStatusCache();
    }

    // Every card that lists this model updates - the app details modal and the Model
    // Manager both render .component-item rows, and a download may be started from
    // either view. Lookup by property: a crafted name can never be parsed as a selector.
    const items = [...document.querySelectorAll('.component-item')]
        .filter((el) => el.dataset.fileId === fileId);
    if (!items.length) return;
    items.forEach((item) => applyStatusToItem(item, status, progress));

    refreshVariantDots();
    updateOpenAppButtonStatus();
}


/** Paint one card for a status: its classes, its badge and its section header. */
export function applyStatusToItem(item, status, progress) {
    const actions = item.querySelector('.component-actions');
    if (!actions) return;

    const listType = item.dataset.listType;

    if (status === 'downloading') {
        actions.innerHTML = downloadingHtml(progress);
        return;
    }

    if (status === 'ready') {
        actions.innerHTML = `
            <button class="btn-action delete" data-action="delete-model" title="Uninstall" style="padding:4px 8px;"><i class="fas fa-trash-alt"></i></button>
        `;
        if (listType === 'compulsory' || listType === 'at_least_one') {
            item.classList.remove('required-missing');
            item.classList.add('required-installed');
        } else if (listType === 'optional') {
            item.classList.add('optional-installed');
        }
    } else if (status === 'missing') {
        actions.innerHTML = `
            <button class="btn-action" data-action="download-model" title="Install" style="padding:4px 8px;"><i class="fas fa-download"></i></button>
        `;
        if (listType === 'compulsory' || listType === 'at_least_one') {
            item.classList.remove('required-installed');
            item.classList.add('required-missing');
        } else if (listType === 'optional') {
            item.classList.remove('optional-installed');
        }
    } else {
        return;
    }

    const section = item.closest('.component-section');
    if (section && listType) updateSectionHeader(section, listType);
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