import { state, loadOpenApps, saveOpenApps } from './state.js';
import { SettingsComponent } from '../../core/js/common/components/settings.js';
import { exportWorkflowToComfyUI } from './workflow_export.js';
import { mountAppManager, refreshAppManager } from './app_manager.js';
import { mountModelManager, refreshModelManager } from './model_manager.js';
import { currentTheme } from '/core/js/common/scripts/theme.js';
import { isMediaDrag } from '/core/js/common/scripts/appDrag.js';

/* ------------------------------------------------------------------ *
 * Workspace tabs. A tab is an app (iframe of /saus/<url>) or one of the
 * built-in panes: Settings, App Manager, File Manager. The iframe is created when
 * the tab is first activated, so a restored tab costs nothing. The console is
 * not a tab: it docks over the bottom of the workspace (see console.js).
 * ------------------------------------------------------------------ */

const BUILT_INS = {
    settings: { name: 'Settings', icon: 'fas fa-cog' },
    appmanager: { name: 'App Manager', icon: 'fas fa-list-check' },
    modelmanager: { name: 'Model Manager', icon: 'fas fa-database' },
    filemanager: { name: 'File Manager', icon: 'fas fa-folder', url: 'file_manager' },
};

const paneId = (id) => `tab-pane-${id}`;
const tabId = (id) => `tab-btn-${id}`;

// The tab currently using the whole browser area (enlarge button). Transient.
let focusedTabId = null;

// The tab being dragged along the strip (drag & drop reordering). Transient.
let draggedTabId = null;

/* ------------------------------------------------------------------ *
 * Hovering a tab with media in hand opens that app.
 *
 * A file dragged out of Recent belongs to the *previous* app, so the tab the
 * pointer rests on has to come forward before the drop - the loader of the app
 * behind it is not even on screen. A short dwell avoids swapping the workspace
 * while the pointer is merely passing over the strip.
 * ------------------------------------------------------------------ */

const MEDIA_HOVER_MS = 550;
let mediaHoverTimer = null;
let mediaHoverTabId = null;

function clearMediaHoverMark() {
    document.querySelectorAll('.tab.media-hover')
        .forEach((el) => el.classList.remove('media-hover'));
}

function cancelMediaHover() {
    if (mediaHoverTimer) clearTimeout(mediaHoverTimer);
    mediaHoverTimer = null;
    mediaHoverTabId = null;
    clearMediaHoverMark();
}

function armMediaHover(tabId_, btn) {
    if (mediaHoverTabId === tabId_) return;   // already armed for this tab
    cancelMediaHover();
    mediaHoverTabId = tabId_;
    btn.classList.add('media-hover');
    mediaHoverTimer = setTimeout(() => {
        mediaHoverTimer = null;
        // The arming above proved a media drag is in flight, and the source document's
        // flag is not readable from here - so only re-check that the pointer is still
        // on this tab.
        if (mediaHoverTabId === tabId_) activateTab(tabId_);
    }, MEDIA_HOVER_MS);
}

// Any drag ending anywhere clears the pending switch.
document.addEventListener('dragend', cancelMediaHover);

// The Settings pane opens a manager through an event, so that core component needs
// no import of this one - the route "Open App" already takes (see models.js).
document.addEventListener('saus:open-manager', (event) => {
    const kind = event && event.detail && event.detail.kind;
    if (kind && BUILT_INS[kind]) openBuiltIn(kind);
});

function findTab(id) {
    return state.openApps.find(tab => tab.id === id);
}

/** Drop `fromId` in `toId`'s place: the strip order is state.openApps' order. */
function moveTab(fromId, toId) {
    const from = state.openApps.findIndex(tab => tab.id === fromId);
    const to = state.openApps.findIndex(tab => tab.id === toId);
    if (from < 0 || to < 0 || from === to) return;

    const [tab] = state.openApps.splice(from, 1);
    state.openApps.splice(to, 0, tab);

    // The panes keep their own elements; only the strip is re-ordered.
    renderTabStrip();
    saveOpenApps();
}

/* The tab of an app wears the icon of the section it belongs to (AI Image /
 * AI Video / Other), the same one the rail and the panel head use; a built-in
 * pane keeps its own icon, and anything unknown falls back to a cube. */
function tabIconClass(tab) {
    const spec = BUILT_INS[tab.kind];
    if (spec) return spec.icon;

    const app = state.allApps.find(candidate =>
        candidate.id === tab.id || candidate.url === tab.url);
    const category = (app && app.category) || '';
    const taxonomy = state.TAXONOMY || {};
    const entry = (taxonomy.categories || []).find(item => item.id === category);
    if (entry) {
        const section = (taxonomy.sections || []).find(item => item.id === entry.section);
        return (section && section.icon) || entry.icon || 'fas fa-cube';
    }
    return 'fas fa-cube';
}

function tabButton(title, icon, onClick) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.title = title;
    btn.innerHTML = `<i class="${icon}"></i>`;
    btn.addEventListener('click', onClick);
    return btn;
}

function renderTabStrip() {
    const strip = document.getElementById('tabStrip');
    if (!strip) return;

    strip.innerHTML = '';
    if (!state.openApps.length) {
        strip.classList.add('hidden');
        return;
    }
    strip.classList.remove('hidden');

    state.openApps.forEach(tab => {
        const btn = document.createElement('div');
        btn.className = 'tab' + (tab.id === state.activeAppId ? ' active' : '');
        btn.id = tabId(tab.id);
        btn.dataset.appId = tab.id;
        btn.title = tab.name;

        // Tabs are dragged into a new order: drop one on another and it takes
        // its place (the strip's order is what state.openApps holds).
        btn.draggable = true;
        btn.addEventListener('dragstart', (event) => {
            draggedTabId = tab.id;
            event.dataTransfer.effectAllowed = 'move';
            // Firefox will not start a drag without some data set.
            event.dataTransfer.setData('text/plain', tab.name || tab.id);
            btn.classList.add('dragging');
        });
        btn.addEventListener('dragend', () => {
            draggedTabId = null;
            btn.classList.remove('dragging');
        });
        btn.addEventListener('dragover', (event) => {
            if (draggedTabId) {
                if (draggedTabId === tab.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                btn.classList.add('drop-target');
                return;
            }
            // A *media* drag (an image from the Recent panel or the File Manager) can
            // be dropped on whichever app's load input is in front, so hovering a tab
            // opens it. This runs in the parent document while the drag comes from an
            // app's iframe, so it asks dataTransfer.types - the module flag lives in
            // the source document and is not visible here.
            if (!isMediaDrag(event.dataTransfer)) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            armMediaHover(tab.id, btn);
        });
        btn.addEventListener('dragleave', () => {
            btn.classList.remove('drop-target');
            cancelMediaHover();
        });
        btn.addEventListener('drop', (event) => {
            btn.classList.remove('drop-target');
            cancelMediaHover();
            if (draggedTabId) {
                if (draggedTabId === tab.id) return;
                event.preventDefault();
                moveTab(draggedTabId, tab.id);
            }
        });

        const icon = document.createElement('i');
        icon.className = tabIconClass(tab);

        const label = document.createElement('span');
        label.className = 'tab-name';
        label.textContent = tab.name;

        btn.appendChild(icon);
        btn.appendChild(label);

        // The action icons sit at the right end of the tab (.tab-actions).
        const actions = document.createElement('div');
        actions.className = 'tab-actions';

        if (tab.kind === 'app') {
            actions.appendChild(tabButton('Open this workflow in ComfyUI', 'fas fa-share-from-square', (event) => {
                event.stopPropagation();
                // ensurePane builds the app's iframe on demand (hidden), so the app
                // can be asked for the workflow it is running right now - variant
                // included - without the button switching the visible tab.
                exportWorkflowToComfyUI(tab, () => {
                    const pane = ensurePane(tab.id);
                    return pane ? pane.querySelector('iframe') : null;
                });
            }));
        }

        if (tab.kind !== 'settings') {
            actions.appendChild(tabButton(
                focusedTabId === tab.id ? 'Back to the normal view' : 'Use the whole browser area',
                focusedTabId === tab.id ? 'fas fa-compress' : 'fas fa-expand',
                (event) => {
                    event.stopPropagation();
                    toggleFocus(tab.id);
                },
            ));
        }

        actions.appendChild(tabButton('Close', 'fas fa-times', (event) => {
            event.stopPropagation();
            closeTab(tab.id);
        }));

        btn.appendChild(actions);

        btn.addEventListener('click', () => activateTab(tab.id));
        btn.addEventListener('auxclick', (event) => {
            if (event.button === 1) {
                event.preventDefault();
                closeTab(tab.id);
            }
        });

        strip.appendChild(btn);
    });
}

/* ------------------------------------------------------------------ *
 * Panes: one per tab, created the first time the tab is shown.
 * ------------------------------------------------------------------ */

function ensurePane(id) {
    const container = document.getElementById('paneContainer');
    if (!container) return null;

    const existing = document.getElementById(paneId(id));
    if (existing) return existing;

    const tab = findTab(id);
    const pane = document.createElement('div');
    pane.className = 'pane tab-pane hidden';
    pane.id = paneId(id);

    if (tab.kind === 'settings') {
        const host = document.createElement('div');
        host.id = 'settingsPane';
        host.className = 'settings-pane';
        pane.appendChild(host);
        container.appendChild(pane);
        // The settings form (theme, version, social links, restart).
        new SettingsComponent('#settingsPane', { showDeprecatedSwitch: true, showManagers: true }).show();
        return pane;
    }

    if (tab.kind === 'appmanager') {
        // A pane that lives in the shell rather than an iframe: it needs the live app
        // list, the taxonomy and the model-status cache, which the shell already has.
        const host = document.createElement('div');
        host.id = 'appManagerPane';
        host.className = 'manager-host';
        pane.appendChild(host);
        container.appendChild(pane);
        mountAppManager(host);
        return pane;
    }

    if (tab.kind === 'modelmanager') {
        const host = document.createElement('div');
        host.id = 'modelManagerPane';
        host.className = 'manager-host';
        pane.appendChild(host);
        container.appendChild(pane);
        mountModelManager(host);
        return pane;
    }

    const frame = document.createElement('iframe');
    frame.title = tab.name;
    frame.setAttribute('allow', 'clipboard-write');
    // embed=1 lets the page drop its own header/footer: the tab provides them.
    // The theme travels in the URL as well as in localStorage, so an app paints
    // correctly the very first time (see core/js/common/scripts/theme.js). The
    // session stamp travels with it so the app can tell a reload of this page from
    // a ComfyUI restart, which is what decides whether it restores its state.
    frame.src = `saus/${tab.url}?embed=1&theme=${encodeURIComponent(currentTheme())}`
        + `&session=${encodeURIComponent(state.sessionStamp || '')}`;
    pane.appendChild(frame);
    container.appendChild(pane);
    return pane;
}

/** Highlight the explorer row of the app that is showing. */
function markActiveRow(id) {
    document.querySelectorAll('.app-row').forEach(row => {
        row.classList.toggle('active', !!id && row.dataset.appId === id);
    });
}

/* ------------------------------------------------------------------ *
 * Enlarge: one tab can take the whole browser area (rail, panel and
 * tab strip step aside until it is shrunk again).
 * ------------------------------------------------------------------ */

function applyFocusState() {
    document.getElementById('appShell')?.classList.toggle('tab-focused', !!focusedTabId);

    let exit = document.getElementById('focusExit');
    if (focusedTabId) {
        if (!exit) {
            exit = document.createElement('button');
            exit.id = 'focusExit';
            exit.type = 'button';
            exit.className = 'focus-exit';
            exit.title = 'Back to the app browser (Esc)';
            exit.innerHTML = '<i class="fas fa-compress"></i>';
            exit.addEventListener('click', () => exitFocus());
            document.body.appendChild(exit);
        }
    } else if (exit) {
        exit.remove();
    }
}

function toggleFocus(id) {
    focusedTabId = focusedTabId === id ? null : id;
    if (focusedTabId) activateTab(focusedTabId);
    applyFocusState();
    renderTabStrip();
}

/** Leaves the enlarged view. Returns true when it was in that view. */
export function exitFocus() {
    if (!focusedTabId) return false;
    focusedTabId = null;
    applyFocusState();
    renderTabStrip();
    return true;
}

/* ------------------------------------------------------------------ *
 * Open / activate / close
 * ------------------------------------------------------------------ */

function activateTab(id) {
    const tab = findTab(id);
    if (!tab) return;

    // Switching away from the enlarged tab leaves the enlarged view.
    if (focusedTabId && focusedTabId !== id) {
        focusedTabId = null;
        applyFocusState();
    }

    document.getElementById('homeContainer')?.classList.add('hidden');
    document.querySelectorAll('#paneContainer > .tab-pane').forEach(pane => pane.classList.add('hidden'));

    const pane = ensurePane(id);
    if (pane) pane.classList.remove('hidden');

    // A manager view can go stale while it is not on screen: the hidden list is
    // install-wide, and a download anywhere changes the status dots.
    if (tab.kind === 'appmanager') refreshAppManager();
    if (tab.kind === 'modelmanager') refreshModelManager();

    state.activeAppId = id;
    renderTabStrip();
    markActiveRow(id);
    saveOpenApps();

    // An app gets the room to itself: sidebar.js listens for this and steps the
    // explorer panel aside (built-in panes keep it).
    if (tab.kind === 'app') {
        document.dispatchEvent(new CustomEvent('saus:app-activated', {
            detail: { id, url: tab.url },
        }));
    }
}

function openApp(app) {
    if (!app || !app.url) return;
    const id = String(app.id || app.url);
    if (!findTab(id)) {
        state.openApps.push({ id, url: app.url, name: app.name || app.url, kind: 'app' });
    }
    renderTabStrip();
    activateTab(id);
}

/** Settings / File Manager live in the workspace too. */
export function openBuiltIn(kind) {
    const spec = BUILT_INS[kind];
    if (!spec) return;
    if (!findTab(kind)) {
        state.openApps.push({ id: kind, url: spec.url || '', name: spec.name, kind });
    }
    renderTabStrip();
    activateTab(kind);
}

/** Open by url; used by the "Open App" button of the details modal. */
export function openAppByUrl(url, name = '', id = null) {
    if (!url) return;
    const app = state.allApps.find(candidate =>
        (id && candidate.id === id) || candidate.url === url
    );
    if (app) {
        openApp(app);
        return;
    }

    const tabKey = String(id || url);
    if (!findTab(tabKey)) {
        state.openApps.push({ id: tabKey, url, name: name || url, kind: 'app' });
    }
    renderTabStrip();
    activateTab(tabKey);
}

function closeTab(id) {
    const index = state.openApps.findIndex(tab => tab.id === id);
    if (index === -1) return;

    const tab = state.openApps[index];
    const wasActive = state.activeAppId === id;
    state.openApps.splice(index, 1);

    if (focusedTabId === id) {
        focusedTabId = null;
        applyFocusState();
    }

    // Removing the pane also removes its iframe, releasing the app's state.
    document.getElementById(paneId(id))?.remove();

    if (wasActive) {
        const next = state.openApps[Math.min(index, state.openApps.length - 1)];
        if (next) activateTab(next.id);
        else showHome();
    } else {
        renderTabStrip();
        saveOpenApps();
    }
}

/** No tab in front: the welcome pane. */
function showHome() {
    document.querySelectorAll('#paneContainer > .tab-pane').forEach(pane => pane.classList.add('hidden'));
    document.getElementById('homeContainer')?.classList.remove('hidden');
    state.activeAppId = null;
    renderTabStrip();
    markActiveRow(null);
    saveOpenApps();
}

/** Bring back the tabs that were open before the page reloaded. */
export function restoreTabs() {
    loadOpenApps();

    // Forget app tabs whose app is gone (removed while we were away).
    state.openApps = state.openApps.filter(tab =>
        tab.kind !== 'app' || state.allApps.some(app => app.id === tab.id || app.url === tab.url)
    );

    if (!state.openApps.length) {
        showHome();
        return;
    }

    renderTabStrip();
    const active = state.openApps.some(tab => tab.id === state.activeAppId)
        ? state.activeAppId
        : state.openApps[0].id;
    activateTab(active);
}

/** Handler for the ``saus:open-app`` document event. */
export function handleOpenAppEvent(event) {
    const detail = (event && event.detail) || {};
    openAppByUrl(detail.url, detail.name, detail.id);
}

