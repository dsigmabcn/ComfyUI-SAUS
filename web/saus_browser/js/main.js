import { PromptServerClient } from './websocket.js';
import { state, loadFavorites, loadAppVisibility, preferencesManager } from './state.js';
import { checkForUpdate } from './updates.js';
import { updateComponentStatus, showAppDetails } from './models.js';
import { initExplorer, renderRail, renderExplorer } from './sidebar.js';
import { setRenderHandler, renderTagsFilter } from './ui.js';
import { restoreTabs, openBuiltIn, exitFocus, handleOpenAppEvent } from './tabs.js';
import { toggleConsoleDock } from './console.js';
import { initTheme } from '/core/js/common/scripts/theme.js';
import { listenForGenerationComplete } from '/core/js/common/scripts/notifications.js';
import { clearAll, isNewServerSession } from '/core/js/common/scripts/sessionState.js';

// Night / Day / Fire, before the shell renders (palette: /core/css/themes.css).
initTheme();

const GUIDE_URL = 'https://github.com/dsigmabcn/ComfyUI-SAUS/blob/main/docs/USER_GUIDE.md';

// Which server run this page belongs to. Kept in `sessionStorage` (like the open
// tabs), so a reload keeps it and a new ComfyUI start does not match it.
const SESSION_KEY = 'saus.session.v1';

/**
 * Ask the server which run this is, and forget the remembered app state when it is
 * not the one we stored - a ComfyUI restart is a *new* session, so an app must not
 * come back carrying the previous one's settings.
 */
async function syncSession() {
    try {
        const response = await fetch('/saus/api/session');
        if (!response.ok) return;
        const current = String((await response.json()).stamp || '');
        if (!current) return;

        const stored = sessionStorage.getItem(SESSION_KEY);
        if (isNewServerSession(stored, current)) {
            const dropped = clearAll();
            if (dropped) console.info('[SAUS] new server session: forgot', dropped, 'remembered app(s)');
        }
        sessionStorage.setItem(SESSION_KEY, current);
        state.sessionStamp = current;
    } catch (error) {
        // Offline or the route is missing: keep whatever the browser already had.
        console.warn('[SAUS] could not read the session:', error);
    }
}

async function loadApps() {
    state.sessionTimestamp = Date.now();
    try {
        // Model registry (filename-keyed) + shared taxonomy + architectures.
        const [modelsResponse, taxonomyResponse, archResponse] = await Promise.all([
            fetch('/saus/api/models'),
            fetch('/saus/api/taxonomy'),
            fetch('/saus/api/architectures')
        ]);

        // The App Manager's hidden list (install-wide). Read alongside the catalogs
        // so the first paint already knows which apps to leave out; it never rejects.
        await loadAppVisibility();

        if (modelsResponse.ok) state.MODELS_DATA = await modelsResponse.json();
        if (taxonomyResponse.ok) state.TAXONOMY = await taxonomyResponse.json();
        if (archResponse.ok) state.ARCHITECTURES = await archResponse.json();

        const response = await fetch('/saus/api/apps');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        state.allApps = await response.json();

        // Category / tags / architecture now live in each app's appConfig.metadata.
        const uniqueCategories = new Set();
        state.allTags.clear();
        state.allApps.forEach(app => {
            const meta = app.metadata || {};
            const tags = meta.tags || {};
            const asArray = (val) => Array.isArray(val) ? val : (val ? [val] : []);

            app.category = meta.category || 'Other';
            app.tags = {
                type: asArray(tags.type),
                base_models: asArray(tags.base_models),
                other: asArray(tags.other)
            };
            app.flatTags = [...app.tags.type, ...app.tags.base_models, ...app.tags.other];
            app.architecture = meta.architecture || null;

            uniqueCategories.add(app.category);
            app.flatTags.forEach(tag => state.allTags.add(tag));
        });

        state.categories = Array.from(uniqueCategories);

        renderRail();
        renderTagsFilter();
        renderExplorer();
        // Re-open the tabs of the previous session, or show the welcome pane.
        restoreTabs();
    } catch (error) {
        console.error('Error fetching apps:', error);
    }
}

/** The tools at the bottom of the rail. */
function handleRailTool(target) {
    switch (target) {
        case 'comfyui':
            window.open('/', '_blank');
            break;
        case 'filemanager':
            openBuiltIn('filemanager');
            break;
        case 'guide':
            window.open(GUIDE_URL, '_blank', 'noopener');
            break;
        case 'console':
            // Docked over the bottom of the workspace, not a workspace tab.
            toggleConsoleDock();
            break;
        case 'settings':
            openBuiltIn('settings');
            break;
        default:
            break;
    }
}

function initializeWebSocket() {
    const client = new PromptServerClient();

    client.on('model_download_progress', (e) => {
        const { file_name, progress } = e.detail;
        updateComponentStatus(file_name, 'downloading', progress);
    });

    client.on('model_download_complete', (e) => {
        const { file_name } = e.detail;
        updateComponentStatus(file_name, 'ready');
    });

    // A download that fails says so, so the card clears (red, installable again)
    // instead of sitting on "Downloading N%" for ever.
    client.on('model_download_error', (e) => {
        const { file_name } = e.detail;
        updateComponentStatus(file_name, 'missing');
    });
}

/**
 * The (i) of an app page, relayed by the app itself: it runs inside a tab's
 * iframe, so it asks the shell to open the information panel it cannot draw - the
 * one with every model of the app and the buttons to install them.
 */
function handleAppInfoEvent(event) {
    const url = String((event && event.detail && event.detail.url) || '');
    if (!url) return;
    const app = state.allApps.find((candidate) => candidate.url === url || candidate.id === url);
    if (app) showAppDetails(app);
}

export function initializeUI() {
    loadFavorites();

    // Anything that changes what the tree should show calls requestRender().
    setRenderHandler(renderExplorer);
    initExplorer({ onTool: handleRailTool });

    document.addEventListener('saus:open-app', handleOpenAppEvent);
    document.addEventListener('saus:app-info', handleAppInfoEvent);
    // An app's gears (next to its progress bar) ask for the console: the app runs in
    // an iframe and cannot draw the shell's dock itself (see core/progressbar.js).
    document.addEventListener('saus:toggle-console', () => toggleConsoleDock());
    // The Settings pane (a core component) writes the shared preferences through
    // its own manager, so our copy is stale the moment its switch is flipped:
    // re-read it, then repaint the explorer so deprecated apps appear/disappear
    // without a reload.
    document.addEventListener('saus:preference-changed', (event) => {
        const key = event && event.detail && event.detail.key;
        if (key !== 'showDeprecatedApps') return;
        preferencesManager.reload();
        renderExplorer();
    });

    // The App Manager hides/shows apps: the panel and its filter chips have to
    // follow at once (the App Manager repaints itself).
    document.addEventListener('saus:app-visibility-changed', () => {
        renderExplorer();
        renderTagsFilter();
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') exitFocus();
    });

    // App tabs report a finished generation from inside their iframe; the notice and the
    // bell belong here, where switching tabs cannot take them away.
    listenForGenerationComplete();

    initializeWebSocket();
    loadApps();
    // The apps' remembered state is scoped to this server run, so the stamp is
    // fetched alongside the catalogs rather than after them.
    syncSession();
    checkForUpdate();

    window.addEventListener('appsSynced', () => loadApps());
}
