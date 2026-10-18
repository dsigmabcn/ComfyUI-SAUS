
import { SettingsComponent } from '../../../core/js/common/components/settings.js';
import { setMediaDrag, endMediaDrag } from '/core/js/common/scripts/appDrag.js';
import { insertElement } from './header.js';
import { initTheme } from '/core/js/common/scripts/theme.js';
// NOTE: footer.js is deliberately NOT imported — the File Manager has no footer.

// Night / Day / Fire, before the panes render (palette: /core/css/themes.css).
initTheme();

// Opened inside a workspace tab of the SAUS browser (see /saus/js/tabs.js)?
// Then that page provides the chrome, so this one drops its own header.
if (new URLSearchParams(window.location.search).get('embed') === '1') {
    document.documentElement.classList.add('saus-embedded');
}

// avif included: browsers render it, and the thumbnail endpoint hands the
// original back when Pillow cannot decode it.
const IMAGE_RE = /\.(jpe?g|png|gif|webp|avif|bmp)$/i;
const VIDEO_RE = /\.(mp4|webm|ogg|mov|mkv)$/i;
const MEDIA_RE = /\.(jpe?g|png|gif|webp|avif|bmp|mp4|webm|ogg|mov|mkv)$/i;

// One state object per pane. Input / Output are the two (and only) roots.
const panes = {
    input: { root: 'input', path: 'input', items: [], view: [], selected: new Set(), anchor: null, sortKey: 'name', sortDir: 1, viewMode: rememberedViewMode('input') },
    output: { root: 'output', path: 'output', items: [], view: [], selected: new Set(), anchor: null, sortKey: 'name', sortDir: 1, viewMode: rememberedViewMode('output') },
};

let settingsComponent = null;

// The preview panel shows one file of one pane; nav walks that pane's media.
const preview = { pane: null, index: -1 };

// The pane the user last clicked (F2 targets it) and the current drag payload.
let focusedPane = 'output';
let dragState = null;

document.addEventListener('DOMContentLoaded', () => {
    setupPanes();
    setupPreview();
    reloadPane('input');
    reloadPane('output');
    initializeSettings();
    setupWebSocket();
    createUploadModal();
    createDeleteModal();
    createRenameModal();
    createNewFolderModal();

    const hiddenUpload = document.getElementById('hidden-upload');
    if (hiddenUpload) hiddenUpload.addEventListener('change', handleFileUpload);

    setTimeout(() => {
        const appNameElement = document.querySelector('.appName');
        if (appNameElement) appNameElement.innerHTML = '<h2>File Manager</h2>';
    }, 500);
});

/* ------------------------------------------------------------------ *
 * Path / formatting helpers
 * ------------------------------------------------------------------ */

const paneEl = (root) => document.querySelector(`.fm-pane[data-pane="${root}"]`);
const paneRole = (root, role) => {
    const el = paneEl(root);
    return el ? el.querySelector(`[data-role="${role}"]`) : null;
};

const joinPath = (dir, name) => `${dir}/${name}`;

/** A compressed preview image URL (server-side, see /saus/api/thumbnail). */
const thumbUrl = (path, size = 256) =>
    `/saus/api/thumbnail?path=${encodeURIComponent(path)}&size=${size}`;

/** The folder above `path` inside `root` (null at the root itself). */
function parentPath(path, root) {
    if (path === root || path.length <= root.length) return null;
    const idx = path.lastIndexOf('/');
    return idx <= 0 ? null : path.slice(0, idx);
}

function formatSize(bytes) {
    if (bytes === null || bytes === undefined) return '';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = bytes;
    let u = 0;
    while (n >= 1024 && u < units.length - 1) { n /= 1024; u += 1; }
    const value = u === 0 ? n : (n < 10 ? n.toFixed(1) : Math.round(n));
    return `${value} ${units[u]}`;
}

function formatDate(seconds) {
    if (!seconds) return '';
    const d = new Date(seconds * 1000);
    return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: '2-digit',
        hour: '2-digit', minute: '2-digit'
    });
}

function fileIcon(item) {
    if (item.type === 'folder') return 'fas fa-folder';
    if (IMAGE_RE.test(item.name)) return 'fas fa-file-image';
    if (VIDEO_RE.test(item.name)) return 'fas fa-file-video';
    if (/\.(json|txt|md|csv|ya?ml)$/i.test(item.name)) return 'fas fa-file-lines';
    return 'fas fa-file';
}

/* ------------------------------------------------------------------ *
 * Data loading + sorting
 * ------------------------------------------------------------------ */

async function loadDirectory(path) {
    try {
        const response = await fetch(`/saus/api/directory?path=${encodeURIComponent(path)}`);
        if (!response.ok) throw new Error(response.statusText);
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error('Error loading directory:', error);
        showToast('Failed to load folder.', 'error');
        return [];
    }
}

/** Folders first, then by the pane's sort key (name as the tie-break). */
function sortedItems(pane) {
    const dir = pane.sortDir;
    const items = pane.items.slice();
    items.sort((a, b) => {
        const af = a.type === 'folder';
        const bf = b.type === 'folder';
        if (af !== bf) return af ? -1 : 1;
        let cmp = 0;
        if (pane.sortKey === 'size') cmp = (a.size || 0) - (b.size || 0);
        else if (pane.sortKey === 'mtime') cmp = (a.mtime || 0) - (b.mtime || 0);
        if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
        return cmp * dir;
    });
    return items;
}

async function reloadPane(root, keepName = null) {
    const pane = panes[root];
    pane.items = await loadDirectory(pane.path);
    pane.selected.clear();
    pane.anchor = null;
    if (keepName && pane.items.some(i => i.name === keepName)) pane.selected.add(keepName);
    renderPane(root);
    syncPreviewAfterReload(root, keepName);
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

function renderPane(root) {
    const pane = panes[root];
    const listEl = paneRole(root, 'list');
    const pathEl = paneRole(root, 'path');
    if (!listEl) return;

    if (pathEl) pathEl.textContent = `/${pane.path}`;

    pane.view = sortedItems(pane);
    listEl.className = `fm-list view-${pane.viewMode}`;
    listEl.innerHTML = '';

    if (pane.viewMode === 'list') listEl.appendChild(listHead(root));

    const up = parentPath(pane.path, pane.root);
    if (up) listEl.appendChild(upItem(up));

    pane.view.forEach((item, idx) => {
        listEl.appendChild(pane.viewMode === 'list' ? listRow(item, idx) : listTile(pane, item, idx));
    });

    syncPaneControls(root);
    applySelection(root);
}

function listHead(root) {
    const pane = panes[root];
    const head = document.createElement('div');
    head.className = 'fm-row fm-row-head';

    [
        ['name', 'Name', 'fm-c-name'],
        ['size', 'Size', 'fm-c-size'],
        ['mtime', 'Last Modified', 'fm-c-date'],
    ].forEach(([key, label, cls]) => {
        const cell = document.createElement('span');
        cell.className = cls;
        cell.dataset.sort = key;
        cell.title = `Sort by ${label}`;
        cell.appendChild(document.createTextNode(label));
        if (pane.sortKey === key) {
            const arrow = document.createElement('i');
            arrow.className = 'fas fm-sort-arrow ' + (pane.sortDir === 1
                ? 'fa-arrow-up-short-wide'
                : 'fa-arrow-down-short-wide');
            cell.appendChild(arrow);
        }
        cell.addEventListener('click', () => {
            if (pane.sortKey === key) {
                pane.sortDir *= -1;
            } else {
                pane.sortKey = key;
                // Name reads naturally A→Z; sizes and dates are nicer big/new first.
                pane.sortDir = key === 'name' ? 1 : -1;
            }
            renderPane(root);
        });
        head.appendChild(cell);
    });

    return head;
}

function upItem(parent) {
    const row = document.createElement('div');
    row.className = 'fm-row fm-up-row';
    row.dataset.up = parent;
    const name = document.createElement('span');
    name.className = 'fm-c-name';
    name.innerHTML = '<i class="fas fa-arrow-up"></i> ';
    name.appendChild(document.createTextNode('..'));
    row.appendChild(name);
    return row;
}

function listRow(item, idx) {
    const row = document.createElement('div');
    row.className = `fm-row${item.type === 'folder' ? ' is-folder' : ''}`;
    row.dataset.idx = idx;
    row.title = item.name;
    row.draggable = true;

    const name = document.createElement('span');
    name.className = 'fm-c-name';
    const icon = document.createElement('i');
    icon.className = fileIcon(item);
    const text = document.createElement('span');
    text.className = 'fm-name-text';
    text.textContent = item.name;
    name.appendChild(icon);
    name.appendChild(text);

    const size = document.createElement('span');
    size.className = 'fm-c-size';
    size.textContent = item.type === 'folder' ? '' : formatSize(item.size);

    const date = document.createElement('span');
    date.className = 'fm-c-date';
    date.textContent = item.mtime ? formatDate(item.mtime) : '';

    row.appendChild(name);
    row.appendChild(size);
    row.appendChild(date);
    return row;
}

function listTile(pane, item, idx) {
    const tile = document.createElement('div');
    tile.className = `fm-tile${item.type === 'folder' ? ' is-folder' : ''}`;
    tile.dataset.idx = idx;
    tile.title = item.name;
    tile.draggable = true;

    const thumb = document.createElement('div');
    thumb.className = 'fm-tile-thumb';
    if (item.type === 'file' && IMAGE_RE.test(item.name)) {
        // A compressed thumbnail (see /saus/api/thumbnail); fall back to the
        // raw file once, then to the plain icon.
        const filePath = joinPath(pane.path, item.name);
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.decoding = 'async';
        img.draggable = false;
        img.alt = item.name;
        img.src = thumbUrl(filePath, 320);
        img.addEventListener('error', () => {
            if (!img.dataset.fallback) {
                img.dataset.fallback = '1';
                img.src = `/saus/api/download-file?filePath=${encodeURIComponent(filePath)}`;
                return;
            }
            img.remove();
            showTileIcon(thumb, item);
        });
        thumb.appendChild(img);
    } else {
        showTileIcon(thumb, item);
    }

    const name = document.createElement('div');
    name.className = 'fm-tile-name';
    name.textContent = item.name;

    const meta = document.createElement('div');
    meta.className = 'fm-tile-meta';
    meta.textContent = item.type === 'folder' ? 'Folder' : formatSize(item.size);

    tile.appendChild(thumb);
    tile.appendChild(name);
    tile.appendChild(meta);
    return tile;
}

function showTileIcon(thumb, item) {
    thumb.classList.add('is-icon');
    const icon = document.createElement('i');
    icon.className = fileIcon(item);
    thumb.appendChild(icon);
}

/* ------------------------------------------------------------------ *
 * Selection + toolbar state
 * ------------------------------------------------------------------ */

function selectedItems(pane) {
    return pane.items.filter(i => pane.selected.has(i.name));
}

function setDisabled(el, act, disabled) {
    const btn = el.querySelector(`[data-act="${act}"]`);
    if (btn) btn.disabled = disabled;
}

function updateTools(root) {
    const pane = panes[root];
    const el = paneEl(root);
    if (!el) return;
    const selected = selectedItems(pane);
    const oneFile = selected.length === 1 && selected[0].type === 'file';
    const anyFile = selected.some(i => i.type === 'file');
    setDisabled(el, 'rename', !oneFile);
    setDisabled(el, 'download', !anyFile);
    setDisabled(el, 'delete', selected.length === 0);
}

function syncPaneControls(root) {
    const pane = panes[root];
    const el = paneEl(root);
    if (!el) return;

    el.querySelectorAll('.fm-view-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === pane.viewMode);
    });

    updateTools(root);
}

function applySelection(root) {
    const pane = panes[root];
    const el = paneEl(root);
    if (!el) return;
    el.querySelectorAll('[data-idx]').forEach(node => {
        const item = pane.view[parseInt(node.dataset.idx, 10)];
        node.classList.toggle('selected', !!item && pane.selected.has(item.name));
    });
}


/* ------------------------------------------------------------------ *
 * Pane wiring: selection, navigation, toolbar actions
 * ------------------------------------------------------------------ */

function setupPanes() {
    ['input', 'output'].forEach(root => {
        const el = paneEl(root);
        if (!el) return;

        el.addEventListener('click', (e) => onPaneClick(root, e));
        el.addEventListener('dblclick', (e) => onPaneDblClick(root, e));

        // Drag & drop between folders/panes (plain = move, Ctrl/⌘ = copy).
        el.addEventListener('dragstart', (e) => onDragStart(root, e));
        el.addEventListener('dragover', (e) => onDragOver(root, e));
        el.addEventListener('dragleave', onDragLeave);
        el.addEventListener('drop', (e) => onDrop(root, e));

        el.querySelectorAll('.fm-view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                panes[root].viewMode = btn.dataset.view;
                saveViewModes();
                renderPane(root);
            });
        });
    });

    document.addEventListener('keydown', onGlobalKeyDown);
}

/**
 * The view mode (list / medium / large) each pane was last left in.
 *
 * `rememberedViewMode` runs while the pane objects above are being built, so the first
 * render already paints the remembered layout and the matching button comes up active -
 * which is why it is a hoisted `function` with the key and the allowed values written
 * *inside* it: a `const` up here would still be in its dead zone at that moment.
 *
 * The key is the File Manager's own (`SausFileManagerViews`), not one of the shell's
 * preferences, and the two panes remember theirs independently.
 */
function rememberedViewMode(root) {
    try {
        const saved = JSON.parse(localStorage.getItem('SausFileManagerViews') || '{}');
        return ['list', 'medium', 'large'].includes(saved[root]) ? saved[root] : 'list';
    } catch (_) {
        return 'list';
    }
}

function saveViewModes() {
    try {
        localStorage.setItem('SausFileManagerViews', JSON.stringify({
            input: panes.input.viewMode,
            output: panes.output.viewMode,
        }));
    } catch (error) {
        console.warn('[SAUS] Could not remember the File Manager view mode:', error);
    }
}

function onPaneClick(root, e) {
    const pane = panes[root];
    focusedPane = root;

    const up = e.target.closest('[data-up]');
    if (up) { pane.path = up.dataset.up; reloadPane(root); return; }

    const action = e.target.closest('[data-act]');
    if (action) {
        switch (action.dataset.act) {
            case 'upload': triggerFileUpload(); return;
            case 'newfolder': doNewFolder(root); return;
            case 'rename': doRename(root); return;
            case 'download': doDownload(root); return;
            case 'delete': doDelete(root); return;
            case 'up': {
                const parent = parentPath(pane.path, pane.root);
                if (parent) { pane.path = parent; reloadPane(root); }
                return;
            }
            default: return;
        }
    }

    const node = e.target.closest('[data-idx]');
    if (node) selectItem(root, node, e);
}

function onPaneDblClick(root, e) {
    const pane = panes[root];
    focusedPane = root;
    const node = e.target.closest('[data-idx]');
    if (!node) return;
    const item = pane.view[parseInt(node.dataset.idx, 10)];
    if (!item) return;
    if (item.type === 'folder') {
        pane.path = joinPath(pane.path, item.name);
        reloadPane(root);
    } else if (MEDIA_RE.test(item.name)) {
        openPreview(root, item.name);
    }
}

function selectItem(root, node, e) {
    const pane = panes[root];
    const idx = parseInt(node.dataset.idx, 10);
    const item = pane.view[idx];
    if (!item) return;

    const multi = e.ctrlKey || e.metaKey;
    const range = e.shiftKey;

    if (range && pane.anchor) {
        const anchorIdx = pane.view.findIndex(i => i.name === pane.anchor);
        if (anchorIdx >= 0) {
            const [lo, hi] = anchorIdx < idx ? [anchorIdx, idx] : [idx, anchorIdx];
            if (!multi) pane.selected.clear();
            for (let i = lo; i <= hi; i += 1) pane.selected.add(pane.view[i].name);
        }
    } else if (multi) {
        if (pane.selected.has(item.name)) pane.selected.delete(item.name);
        else pane.selected.add(item.name);
        pane.anchor = item.name;
    } else {
        pane.selected.clear();
        pane.selected.add(item.name);
        pane.anchor = item.name;
    }

    applySelection(root);
    updateTools(root);
}

/* ------------------------------------------------------------------ *
 * Header actions
 * ------------------------------------------------------------------ */

function doNewFolder(root) {
    // Acts on the folder the pane is *showing*, so unlike rename / delete it
    // needs no selection and is never disabled.
    showNewFolderModal(panes[root].path, root);
}

function doRename(root) {
    const pane = panes[root];
    const selected = selectedItems(pane);
    if (selected.length !== 1 || selected[0].type !== 'file') return;
    const item = selected[0];
    showRenameModal(joinPath(pane.path, item.name), item.name, root);
}

function doDownload(root) {
    const pane = panes[root];
    selectedItems(pane).filter(i => i.type === 'file').forEach(item => {
        const link = document.createElement('a');
        link.href = `/saus/api/download-file?filePath=${encodeURIComponent(joinPath(pane.path, item.name))}`;
        link.download = item.name;
        document.body.appendChild(link);
        link.click();
        link.remove();
    });
}

function doDelete(root) {
    const pane = panes[root];
    const selected = selectedItems(pane);
    if (!selected.length) return;
    showDeleteModal(
        selected.map(i => ({ name: i.name, path: joinPath(pane.path, i.name) })),
        root
    );
}


/* ------------------------------------------------------------------ *
 * Drag & drop: plain drag moves, Ctrl/⌘ + drag copies
 * ------------------------------------------------------------------ */

/** The folder a drop lands in: a folder item, or the pane's current folder. */
function dropDir(root, e) {
    const pane = panes[root];
    const node = e.target.closest('[data-idx]');
    if (node) {
        const item = pane.view[parseInt(node.dataset.idx, 10)];
        if (item && item.type === 'folder') return joinPath(pane.path, item.name);
    }
    return pane.path;
}

function clearDropHighlight() {
    document.querySelectorAll('.drop-target').forEach(n => n.classList.remove('drop-target'));
}

function onDragStart(root, e) {
    const node = e.target.closest('[data-idx]');
    if (!node) return;
    const pane = panes[root];
    const item = pane.view[parseInt(node.dataset.idx, 10)];
    if (!item) return;

    // Dragging an unselected item selects it first (like other file managers).
    if (!pane.selected.has(item.name)) {
        pane.selected.clear();
        pane.selected.add(item.name);
        pane.anchor = item.name;
        applySelection(root);
        updateTools(root);
    }

    dragState = { root, names: Array.from(pane.selected) };
    focusedPane = root;
    // Also publish the dragged file as a SAUS media drag, so it can be dropped onto an
    // app's "Load Image" / "Video" input (see core/js/common/scripts/appDrag.js).
    if (item.type !== 'folder') {
        const subfolder = pane.path.startsWith(root)
            ? pane.path.slice(root.length).replace(/^\/+/, '') : '';
        setMediaDrag({
            filename: item.name,
            subfolder,
            type: root,
            path: joinPath(pane.path, item.name),
        }, e.dataTransfer);
    } else {
        endMediaDrag();
    }
    if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = 'copyMove';
        try { e.dataTransfer.setData('text/plain', item.name); } catch (_) { /* ignore */ }
    }
}

function onDragOver(root, e) {
    if (!dragState) return;
    e.preventDefault();
    if (e.dataTransfer) {
        e.dataTransfer.dropEffect = (e.ctrlKey || e.metaKey) ? 'copy' : 'move';
    }
    clearDropHighlight();
    const pane = panes[root];
    const node = e.target.closest('[data-idx]');
    const item = node ? pane.view[parseInt(node.dataset.idx, 10)] : null;
    if (item && item.type === 'folder') node.classList.add('drop-target');
    else paneEl(root).classList.add('drop-target');
}

function onDragLeave(e) {
    // Only clear once the pointer really leaves every pane.
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.fm-pane')) return;
    clearDropHighlight();
}

function onDrop(root, e) {
    if (!dragState) return;
    e.preventDefault();
    clearDropHighlight();

    const targetDir = dropDir(root, e);
    const copy = e.ctrlKey || e.metaKey;
    const source = dragState;
    dragState = null;
    transferItems(source.root, source.names, targetDir, copy);
}

async function transferItems(sourceRoot, names, targetDir, copy) {
    const pane = panes[sourceRoot];
    const sourcePaths = names.map(name => joinPath(pane.path, name));
    if (!sourcePaths.length) return;

    try {
        const response = await fetch('/saus/api/move-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sourcePaths, targetDir, copy })
        });
        if (!response.ok) {
            let detail = `HTTP ${response.status}`;
            try {
                const body = await response.json();
                if (body && body.error) detail = `${detail}: ${body.error}`;
            } catch (_) { /* not JSON */ }
            throw new Error(detail);
        }
        const data = await response.json();
        if (data.errors && data.errors.length) {
            showToast(data.errors[0], 'error');
        } else {
            showToast(copy ? 'Copied.' : 'Moved.', 'success');
        }
    } catch (error) {
        console.error('Transfer error:', error);
        showToast(`Transfer failed (${error.message}).`, 'error');
    }

    // The target may live in the other pane, so refresh both.
    hidePreview();
    await reloadPane('input');
    await reloadPane('output');
}

/* ------------------------------------------------------------------ *
 * Keyboard: F2 renames the selected file
 * ------------------------------------------------------------------ */

function onGlobalKeyDown(e) {
    if (e.key !== 'F2' && e.key !== 'Delete') return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    const pane = panes[focusedPane];
    if (!pane) return;

    // Del asks before it removes anything (showDeleteModal), so the key is as
    // safe as the toolbar button it mirrors.
    if (e.key === 'Delete') {
        if (!pane.selected.size) return;
        e.preventDefault();
        doDelete(focusedPane);
        return;
    }

    const selected = selectedItems(pane);
    if (selected.length === 1 && selected[0].type === 'file') {
        e.preventDefault();
        doRename(focusedPane);
    }
}

/* ------------------------------------------------------------------ *
 * Preview panel (right side): close ✕ + ‹ › navigation
 * ------------------------------------------------------------------ */

function setupPreview() {
    const panel = document.getElementById('fm-preview');
    if (!panel) return;
    panel.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'close') hidePreview();
        else if (btn.dataset.act === 'prev') stepPreview(-1);
        else if (btn.dataset.act === 'next') stepPreview(1);
    });
}

function mediaItems(pane) {
    return pane.view.filter(i => i.type === 'file' && MEDIA_RE.test(i.name));
}

function openPreview(root, name) {
    const media = mediaItems(panes[root]);
    const idx = media.findIndex(i => i.name === name);
    if (idx < 0) { hidePreview(); return; }
    preview.pane = root;
    preview.index = idx;
    renderPreview();
}

function stepPreview(delta) {
    if (!preview.pane) return;
    const pane = panes[preview.pane];
    const media = mediaItems(pane);
    const next = preview.index + delta;
    if (next < 0 || next >= media.length) return;
    preview.index = next;

    // Keep the list selection in step with what the preview is showing.
    const item = media[next];
    pane.selected.clear();
    pane.selected.add(item.name);
    pane.anchor = item.name;
    applySelection(preview.pane);
    updateTools(preview.pane);
    renderPreview();
}

function renderPreview() {
    const panel = document.getElementById('fm-preview');
    const pane = preview.pane ? panes[preview.pane] : null;
    if (!panel || !pane) return;

    const media = mediaItems(pane);
    const item = media[preview.index];
    if (!item) { hidePreview(); return; }

    const url = `/saus/api/download-file?filePath=${encodeURIComponent(joinPath(pane.path, item.name))}`;
    const body = panel.querySelector('[data-role="body"]');
    body.innerHTML = '';

    let mediaEl;
    if (IMAGE_RE.test(item.name)) {
        mediaEl = document.createElement('img');
        mediaEl.src = url;
        mediaEl.alt = item.name;
    } else {
        mediaEl = document.createElement('video');
        mediaEl.src = url;
        mediaEl.controls = true;
        mediaEl.autoplay = true;
        mediaEl.loop = true;
        mediaEl.muted = true;
    }
    mediaEl.draggable = false;
    body.appendChild(mediaEl);

    const metaEl = document.createElement('div');
    metaEl.className = 'fm-preview-info';
    metaEl.textContent = `${formatSize(item.size)} · ${formatDate(item.mtime)}`;
    body.appendChild(metaEl);

    const resEl = document.createElement('div');
    resEl.className = 'fm-preview-info';
    body.appendChild(resEl);
    const setRes = (w, h) => { if (w && h) resEl.textContent = `Resolution: ${w}×${h}`; };
    if (mediaEl.tagName === 'IMG') {
        mediaEl.addEventListener('load', () => setRes(mediaEl.naturalWidth, mediaEl.naturalHeight));
    } else {
        mediaEl.addEventListener('loadedmetadata', () => setRes(mediaEl.videoWidth, mediaEl.videoHeight));
    }

    panel.querySelector('[data-role="name"]').textContent = item.name;
    const prevBtn = panel.querySelector('[data-act="prev"]');
    const nextBtn = panel.querySelector('[data-act="next"]');
    if (prevBtn) prevBtn.disabled = preview.index <= 0;
    if (nextBtn) nextBtn.disabled = preview.index >= media.length - 1;

    panel.classList.remove('hidden');
}

function hidePreview() {
    const panel = document.getElementById('fm-preview');
    if (panel) panel.classList.add('hidden');
    preview.pane = null;
    preview.index = -1;
}

/** Keep the preview in step after the pane it belongs to is reloaded. */
function syncPreviewAfterReload(root, keepName) {
    if (preview.pane !== root) return;
    const media = mediaItems(panes[root]);
    const idx = keepName ? media.findIndex(i => i.name === keepName) : -1;
    if (idx < 0) { hidePreview(); return; }
    preview.index = idx;
    renderPreview();
}


/* ------------------------------------------------------------------ *
 * Toast
 * ------------------------------------------------------------------ */

function showToast(message, type = 'info') {
    if (!document.getElementById('saus-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'saus-toast-styles';
        style.innerHTML = `
            .saus-toast {
                position: fixed; top: 20px; right: 20px; background-color: #333;
                color: white; padding: 15px 20px; border-radius: 5px; z-index: 22000;
                opacity: 0; transform: translateY(-20px);
                transition: opacity 0.3s ease, transform 0.3s ease;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2); font-family: sans-serif;
                font-size: 1em; display: flex; align-items: center;
            }
            .saus-toast.show { opacity: 1; transform: translateY(0); }
            .saus-toast.toast-success { background-color: #28a745; }
            .saus-toast.toast-error { background-color: #dc3545; }
        `;
        document.head.appendChild(style);
    }

    const toast = document.createElement('div');
    toast.className = `saus-toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}


/* ------------------------------------------------------------------ *
 * Upload (chunked) — always into the Input pane's current folder
 * ------------------------------------------------------------------ */

function createUploadModal() {
    if (document.getElementById('upload-modal')) return;
    const modalHTML = `
    <div id="upload-modal" class="modal hidden">
        <div class="modal-content" style="text-align: center;">
            <h3 style="margin-top: 0; margin-bottom: 15px;">Uploading File...</h3>
            <div class="progress-container" style="margin-top: 20px;">
                <div class="progress-bar-base" style="background: var(--color-progress-background); height: 24px; border-radius: 12px; overflow: hidden; position: relative;">
                    <div id="upload-progress-bar-modal" class="progress-bar-value" style="width: 0%; background: var(--color-progress-value); height: 100%; transition: width 0.2s;"></div>
                    <div id="upload-progress-text-modal" class="progress-text" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #fff; font-weight: bold; text-shadow: 1px 1px 2px black;">0%</div>
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}

function triggerFileUpload() {
    const input = document.getElementById('hidden-upload');
    if (input) input.click();
}
window.triggerFileUpload = triggerFileUpload;

function resetUploadInput() {
    const input = document.getElementById('hidden-upload');
    if (input) input.value = '';
}

function handleFileUpload() {
    const fileInput = document.getElementById('hidden-upload');
    if (!fileInput || !fileInput.files.length) return;

    const uploadModal = document.getElementById('upload-modal');
    const progressBar = document.getElementById('upload-progress-bar-modal');
    const progressText = document.getElementById('upload-progress-text-modal');

    if (uploadModal) {
        uploadModal.classList.remove('hidden');
        const title = uploadModal.querySelector('h3');
        if (title) title.textContent = 'Uploading File...';
    }
    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '0%';

    handleChunkedUpload(fileInput.files[0]);
}

function handleChunkedUpload(file) {
    const CHUNK_SIZE = 1024 * 1024 * 20;
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE) || 1;
    const fileId = `${file.name}-${file.size}-${Date.now()}`;
    const targetPath = panes.input.path;

    const progressBar = document.getElementById('upload-progress-bar-modal');
    const progressText = document.getElementById('upload-progress-text-modal');
    const uploadModal = document.getElementById('upload-modal');

    let start = 0;
    let end = CHUNK_SIZE;
    let chunkCount = 0;

    const sendChunk = async () => {
        if (start < file.size) {
            const formData = new FormData();
            formData.append('fileChunk', file.slice(start, end));
            formData.append('fileName', file.name);
            formData.append('fileId', fileId);
            formData.append('targetPath', targetPath);
            formData.append('isLast', end >= file.size);
            formData.append('chunkIndex', chunkCount);

            let response = null;
            try {
                response = await fetch('/saus/api/upload-chunk', {
                    method: 'POST',
                    headers: { 'X-SAUS-Request': '1' },
                    body: formData
                });
            } catch (error) {
                console.error('Upload error:', error);
            }

            if (!response || !response.ok) {
                showToast('Upload failed.', 'error');
                if (uploadModal) uploadModal.classList.add('hidden');
                resetUploadInput();
                return;
            }

            const uploadedBytes = Math.min(end, file.size);
            const percent = Math.floor((uploadedBytes / file.size) * 100);
            if (progressBar) progressBar.style.width = `${percent}%`;
            if (progressText) progressText.textContent = `${percent}% (Chunk ${chunkCount + 1} of ${totalChunks})`;

            start = end;
            end = start + CHUNK_SIZE;
            chunkCount += 1;
            await sendChunk();
        } else {
            if (progressBar) progressBar.style.width = '100%';
            if (progressText) progressText.textContent = '100%';
            if (uploadModal) {
                const title = uploadModal.querySelector('h3');
                if (title) title.textContent = 'File Upload Successful!';
            }
            resetUploadInput();
            reloadPane('input', file.name);
            setTimeout(() => { if (uploadModal) uploadModal.classList.add('hidden'); }, 1500);
        }
    };

    sendChunk();
}


/* ------------------------------------------------------------------ *
 * "Download from URL" modal (always targets the Input pane)
 * ------------------------------------------------------------------ */

function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'file_download_progress') {
                const { filename, progress } = msg.data;
                updateDownloadProgress(progress, `Downloading ${filename}...`);
            } else if (msg.type === 'file_download_complete') {
                finishDownload(msg.data.filename);
            } else if (msg.type === 'file_download_error') {
                alert(`Download error: ${msg.data.error}`);
                resetDownloadUI();
            }
        } catch (e) {
            console.error('[WS] Error parsing message', e);
        }
    };

    ws.onclose = () => {
        setTimeout(setupWebSocket, 5000);
    };
}

function updateDownloadProgress(percent, text) {
    const bar = document.getElementById('download-progress-bar');
    const label = document.getElementById('download-progress-text');
    if (bar) bar.style.width = `${percent}%`;
    if (label) label.textContent = `${percent}%`;
    const status = document.getElementById('download-status');
    if (status && text) status.textContent = text;
}

function finishDownload(filename) {
    updateDownloadProgress(100);
    const status = document.getElementById('download-status');
    if (status) status.textContent = `Successfully downloaded: ${filename}`;
    setTimeout(() => {
        closeModal();
        resetDownloadUI();
        reloadPane('input', filename);
    }, 1500);
}

function resetDownloadUI() {
    const container = document.getElementById('download-progress-container');
    const bar = document.getElementById('download-progress-bar');
    const text = document.getElementById('download-progress-text');
    const button = document.getElementById('download-button');
    const status = document.getElementById('download-status');

    if (bar) bar.style.width = '0%';
    if (text) text.textContent = '';
    if (container) {
        container.style.display = 'none';
        container.classList.add('hidden-initial');
    }
    if (button) {
        button.disabled = false;
        button.style.display = 'block';
    }
    if (status) status.textContent = '';
}


function loadDownloadApp() {
    const modal = document.getElementById('download-modal');
    if (modal) modal.classList.remove('hidden');
}
window.loadDownloadApp = loadDownloadApp;

function closeModal() {
    const modal = document.getElementById('download-modal');
    if (modal) modal.classList.add('hidden');
}
window.closeModal = closeModal;

async function startDownload() {
    const urlField = document.getElementById('download-url');
    const tokenSource = document.getElementById('token-source');
    const tokenInput = document.getElementById('download-token');
    const url = urlField ? urlField.value.trim() : '';
    const apiToken = (tokenSource && tokenSource.value === 'custom' && tokenInput)
        ? tokenInput.value.trim() : '';

    if (!url) { alert('Please enter a URL.'); return; }

    const button = document.getElementById('download-button');
    const container = document.getElementById('download-progress-container');
    const bar = document.getElementById('download-progress-bar');
    const text = document.getElementById('download-progress-text');
    const status = document.getElementById('download-status');

    if (container) {
        container.classList.remove('hidden-initial');
        container.style.display = 'block';
    }
    if (bar) bar.style.width = '0%';
    if (text) text.textContent = '';
    if (status) status.textContent = 'Initiating download...';
    if (button) { button.disabled = true; button.style.display = 'none'; }

    try {
        const response = await fetch('/saus/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, targetPath: panes.input.path, apiToken })
        });
        if (!response.ok) throw new Error(response.statusText);
        if (status) status.textContent = 'Download started on server...';
    } catch (error) {
        console.error('Download error:', error);
        alert('Failed to start download.');
        resetDownloadUI();
    }
}
window.startDownload = startDownload;


/* ------------------------------------------------------------------ *
 * Delete
 * ------------------------------------------------------------------ */

function createDeleteModal() {
    if (document.getElementById('delete-modal')) return;
    const modalHTML = `
    <div id="delete-modal" class="modal hidden">
        <div class="modal-content" style="text-align: center; max-width: 400px;">
            <h3 style="margin-top: 0; margin-bottom: 15px;">Delete</h3>
            <p id="delete-modal-message">Are you sure you want to delete this?</p>
            <div style="margin-top: 20px; display: flex; justify-content: center; gap: 10px;">
                <button id="delete-cancel-btn" class="btn-modal-secondary">Cancel</button>
                <button id="delete-confirm-btn" class="btn-modal-primary delete">Delete</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const cancelBtn = document.getElementById('delete-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = closeDeleteModal;
}

function showDeleteModal(items, root) {
    const modal = document.getElementById('delete-modal');
    const message = document.getElementById('delete-modal-message');
    const confirmBtn = document.getElementById('delete-confirm-btn');
    if (!modal || !message || !confirmBtn) return;

    message.textContent = items.length === 1
        ? `Are you sure you want to delete "${items[0].name}"?`
        : `Are you sure you want to delete these ${items.length} items?`;

    confirmBtn.onclick = async () => {
        closeDeleteModal();
        await deleteItems(items, root);
    };
    modal.classList.remove('hidden');
}

function closeDeleteModal() {
    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.add('hidden');
}

async function deleteItems(items, root) {
    let failed = 0;
    for (const item of items) {
        try {
            const response = await fetch('/saus/api/delete-file', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: item.path })
            });
            if (!response.ok) throw new Error(response.statusText);
        } catch (error) {
            console.error('Delete error:', error);
            failed += 1;
        }
    }
    const ok = items.length - failed;
    if (failed) showToast(`Deleted ${ok}/${items.length} item(s).`, 'error');
    else showToast(items.length === 1 ? 'Item deleted.' : `${items.length} items deleted.`, 'success');

    // reloadPane hides the preview when the file it was showing is gone.
    await reloadPane(root);
}


/* ------------------------------------------------------------------ *
 * Rename
 * ------------------------------------------------------------------ */

function createRenameModal() {
    if (document.getElementById('rename-modal')) return;
    const modalHTML = `
    <div id="rename-modal" class="modal hidden">
        <div class="modal-content" style="text-align: center; max-width: 400px;">
            <h3 style="margin-top: 0; margin-bottom: 15px;">Rename</h3>
            <input type="text" id="rename-input" style="width: 100%; padding: 8px; margin-bottom: 20px; box-sizing: border-box; background: #333; color: white; border: 1px solid #555; border-radius: 4px;" />
            <div style="display: flex; justify-content: center; gap: 10px;">
                <button id="rename-cancel-btn" class="btn-modal-secondary">Cancel</button>
                <button id="rename-confirm-btn" class="btn-modal-primary">Rename</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const cancelBtn = document.getElementById('rename-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = closeRenameModal;
}

function showRenameModal(path, currentName, root) {
    const modal = document.getElementById('rename-modal');
    const input = document.getElementById('rename-input');
    const confirmBtn = document.getElementById('rename-confirm-btn');
    if (!modal || !input || !confirmBtn) return;

    input.value = currentName;
    confirmBtn.onclick = async () => {
        const newName = input.value.trim();
        closeRenameModal();
        if (newName && newName !== currentName) await renameFile(path, newName, root);
    };
    modal.classList.remove('hidden');
    input.focus();
    if (input.select) input.select();
}

function closeRenameModal() {
    const modal = document.getElementById('rename-modal');
    if (modal) modal.classList.add('hidden');
}

async function renameFile(path, newName, root) {
    try {
        const response = await fetch('/saus/api/rename-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPath: path, newName })
        });
        if (!response.ok) throw new Error(response.statusText);
        showToast('File renamed.', 'success');
        await reloadPane(root, newName);
    } catch (error) {
        console.error('Rename error:', error);
        showToast('Failed to rename file.', 'error');
    }
}

/* ------------------------------------------------------------------ *
 * New folder
 * ------------------------------------------------------------------ */

function createNewFolderModal() {
    if (document.getElementById('newfolder-modal')) return;
    const modalHTML = `
    <div id="newfolder-modal" class="modal hidden">
        <div class="modal-content" style="text-align: center; max-width: 400px;">
            <h3 style="margin-top: 0; margin-bottom: 15px;">New folder</h3>
            <input type="text" id="newfolder-input" placeholder="Folder name" style="width: 100%; padding: 8px; margin-bottom: 20px; box-sizing: border-box; background: #333; color: white; border: 1px solid #555; border-radius: 4px;" />
            <div style="display: flex; justify-content: center; gap: 10px;">
                <button id="newfolder-cancel-btn" class="btn-modal-secondary">Cancel</button>
                <button id="newfolder-confirm-btn" class="btn-modal-primary">Create</button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const cancelBtn = document.getElementById('newfolder-cancel-btn');
    if (cancelBtn) cancelBtn.onclick = closeNewFolderModal;
    const input = document.getElementById('newfolder-input');
    // A name dialog is expected to take Enter (the rename one has nothing to add:
    // it opens pre-filled).
    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            const confirmBtn = document.getElementById('newfolder-confirm-btn');
            if (confirmBtn) confirmBtn.click();
        });
    }
}

function showNewFolderModal(path, root) {
    const modal = document.getElementById('newfolder-modal');
    const input = document.getElementById('newfolder-input');
    const confirmBtn = document.getElementById('newfolder-confirm-btn');
    if (!modal || !input || !confirmBtn) return;

    input.value = '';
    confirmBtn.onclick = async () => {
        const folderName = input.value.trim();
        closeNewFolderModal();
        if (folderName) await createFolder(path, folderName, root);
    };
    modal.classList.remove('hidden');
    input.focus();
}

function closeNewFolderModal() {
    const modal = document.getElementById('newfolder-modal');
    if (modal) modal.classList.add('hidden');
}

async function createFolder(path, folderName, root) {
    try {
        const response = await fetch('/saus/api/create-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ parentPath: path, folderName })
        });
        if (!response.ok) {
            // The server knows why (name taken, not allowed): say that instead of
            // a generic failure.
            let reason = '';
            try { reason = (await response.json()).error || ''; } catch (error) { /* not JSON */ }
            throw new Error(reason || response.statusText);
        }
        showToast('Folder created.', 'success');
        await reloadPane(root, folderName);
    } catch (error) {
        console.error('Create folder error:', error);
        showToast(`Failed to create folder: ${error.message}`, 'error');
    }
}

/* ------------------------------------------------------------------ *
 * Settings
 * ------------------------------------------------------------------ */

function initializeSettings() {
    settingsComponent = new SettingsComponent('#settings-host');
    document.addEventListener('click', (event) => {
        const target = event.target.closest('a');
        if (target && (target.id === 'settingsLink' || target.getAttribute('href') === '#settings')) {
            event.preventDefault();
            showSettings();
        }
    });
}

async function showSettings() {
    const layout = document.getElementById('fm-layout');
    const host = document.getElementById('settings-host');
    const view = document.getElementById('settings-view');
    const isOpen = view && view.style.display !== 'none';
    if (isOpen) {
        if (settingsComponent) settingsComponent.hide();
        if (host) host.classList.remove('active');
        if (layout) layout.classList.remove('hidden');
    } else {
        if (layout) layout.classList.add('hidden');
        if (host) host.classList.add('active');
        if (settingsComponent) settingsComponent.show();
    }
}

