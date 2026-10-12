import { state, loadOpenApps, saveOpenApps } from './state.js';
import { SettingsComponent } from '../../core/js/common/components/settings.js';
import { renderConsolePane, teardownConsole } from './console.js';
import { exportWorkflowToComfyUI } from './workflow_export.js';
import { renderSettingsInfo } from './settings_info.js';

/* ------------------------------------------------------------------ *
 * Workspace tabs. A tab is an app (iframe of /saus/<url>) or one of the
 * built-in panes: Settings, Console, File Manager. The iframe is created
 * when the tab is first activated, so a restored tab costs nothing.
 * ------------------------------------------------------------------ */

const BUILT_INS = {
    settings: { name: 'Settings', icon: 'fas fa-cog' },
    console: { name: 'Console', icon: 'fas fa-terminal' },
    filemanager: { name: 'File Manager', icon: 'fas fa-folder', url: 'file_manager' },
};

const paneId = (id) => `tab-pane-${id}`;
const tabId = (id) => `tab-btn-${id}`;

// The tab currently using the whole browser area (enlarge button). Transient.
let focusedTabId = null;

function findTab(id) {
    return state.openApps.find(tab => tab.id === id);
}

function tabIconClass(tab) {
    const spec = BUILT_INS[tab.kind];
    return spec ? spec.icon : 'fas fa-cube';
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
                exportWorkflowToComfyUI(tab);
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
        // core's component renders the settings form into its pane...
        new SettingsComponent('#settingsPane').show();
        // ...and the SAUS block goes under it (version + project links).
        renderSettingsInfo(host);
        return pane;
    }

    if (tab.kind === 'console') {
        pane.appendChild(renderConsolePane());
        container.appendChild(pane);
        return pane;
    }

    const frame = document.createElement('iframe');
    frame.title = tab.name;
    frame.setAttribute('allow', 'clipboard-write');
    // embed=1 lets the page drop its own header/footer: the tab provides them.
    frame.src = `saus/${tab.url}?embed=1`;
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

export function toggleFocus(id) {
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

export function activateTab(id) {
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

    state.activeAppId = id;
    renderTabStrip();
    markActiveRow(id);
    saveOpenApps();
}

export function openApp(app) {
    if (!app || !app.url) return;
    const id = String(app.id || app.url);
    if (!findTab(id)) {
        state.openApps.push({ id, url: app.url, name: app.name || app.url, kind: 'app' });
    }
    renderTabStrip();
    activateTab(id);
}

/** Settings / Console / File Manager live in the workspace too. */
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

export function closeTab(id) {
    const index = state.openApps.findIndex(tab => tab.id === id);
    if (index === -1) return;

    const tab = state.openApps[index];
    const wasActive = state.activeAppId === id;
    state.openApps.splice(index, 1);

    if (tab.kind === 'console') teardownConsole();
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
export function showHome() {
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

