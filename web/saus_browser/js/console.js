/**
 * Console pane: the ComfyUI log feed as a workspace tab.
 *
 * Same endpoint the runtime's log modal uses (GET /saus/api/logs), but docked
 * in the workspace instead of a modal, so it can sit next to a running app.
 */

const POLL_MS = 1000;

let timer = null;
let follow = true;
let logElement = null;
let statusElement = null;

function setStatus(text) {
    if (statusElement) statusElement.textContent = text || '';
}

function isAtBottom() {
    if (!logElement) return true;
    return logElement.scrollHeight - logElement.scrollTop <= logElement.clientHeight + 40;
}

function scrollToEnd() {
    if (logElement) logElement.scrollTop = logElement.scrollHeight;
}

async function fetchLogs() {
    if (!logElement) return;
    try {
        const response = await fetch('/saus/api/logs');
        // The dock can be closed while the request is in flight.
        if (!logElement) return;
        if (!response.ok) {
            setStatus(`HTTP ${response.status}`);
            return;
        }
        const data = await response.json();
        if (!logElement) return;
        const text = data.logs || 'No logs found.';
        const pinned = isAtBottom();
        if (logElement.textContent !== text) {
            logElement.textContent = text;
            if (follow && pinned) scrollToEnd();
        }
        setStatus(new Date().toLocaleTimeString());
    } catch (error) {
        setStatus('log fetch failed');
        console.error('Error fetching logs:', error);
    }
}

function startPolling() {
    fetchLogs();
    if (timer) clearInterval(timer);
    // One request per second, skipped while the tab is in the background.
    timer = setInterval(() => {
        if (!document.hidden) fetchLogs();
    }, POLL_MS);
}

/** Build the console pane. ``onClose`` adds the ✕ used when it is docked. */
export function renderConsolePane({ onClose = null } = {}) {
    const wrapper = document.createElement('div');
    wrapper.className = 'console-pane';

    const toolbar = document.createElement('div');
    toolbar.className = 'console-toolbar';

    const title = document.createElement('span');
    title.className = 'console-title';
    title.innerHTML = '<i class="fas fa-terminal"></i> ComfyUI console';

    statusElement = document.createElement('span');
    statusElement.className = 'console-status';

    const followLabel = document.createElement('label');
    followLabel.className = 'console-follow';
    const followBox = document.createElement('input');
    followBox.type = 'checkbox';
    followBox.checked = follow;
    followBox.addEventListener('change', () => {
        follow = followBox.checked;
        if (follow) scrollToEnd();
    });
    followLabel.appendChild(followBox);
    followLabel.appendChild(document.createTextNode('Follow'));

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'console-btn';
    refreshBtn.title = 'Refresh now';
    refreshBtn.innerHTML = '<i class="fas fa-rotate"></i>';
    refreshBtn.addEventListener('click', () => fetchLogs());

    toolbar.appendChild(title);
    toolbar.appendChild(statusElement);
    toolbar.appendChild(followLabel);
    toolbar.appendChild(refreshBtn);

    // Docked over the workspace there is no tab to close it with.
    if (typeof onClose === 'function') {
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'console-btn';
        closeBtn.title = 'Close the console';
        closeBtn.innerHTML = '<i class="fas fa-times"></i>';
        closeBtn.addEventListener('click', onClose);
        toolbar.appendChild(closeBtn);
    }

    logElement = document.createElement('pre');
    logElement.className = 'console-log';
    logElement.textContent = 'Loading logs...';

    wrapper.appendChild(toolbar);
    wrapper.appendChild(logElement);

    startPolling();
    return wrapper;
}

/* ------------------------------------------------------------------ *
 * The dock: the same pane, floating over the bottom of the workspace
 * ------------------------------------------------------------------ */

const DOCK_KEY = 'saus.consoleDock.v1';
const MIN_DOCK_HEIGHT = 160;    // px, the floor the CSS declares
const MIN_PANE_HEIGHT = 120;    // px of workspace left visible above the dock
const KEYBOARD_STEP = 40;       // px per arrow key press

// Resized height (px), or null while the dock still uses its CSS default (25%).
let dockHeight = null;
// { startY, startHeight } for the drag in progress, null when idle.
let resizing = null;
let resizeBound = false;

function loadDockHeight() {
    try {
        const raw = localStorage.getItem(DOCK_KEY);
        if (!raw) return;
        const height = Number((JSON.parse(raw) || {}).height);
        if (Number.isFinite(height) && height > 0) dockHeight = height;
    } catch (error) {
        console.error('Error loading the console dock height:', error);
    }
}

function saveDockHeight(height) {
    try {
        localStorage.setItem(DOCK_KEY, JSON.stringify({ height: Math.round(height) }));
    } catch (error) {
        console.error('Error saving the console dock height:', error);
    }
}

/** How tall the dock may get: the panes keep a usable strip above it. */
function maxDockHeight(dock) {
    const available = (dock.parentElement && dock.parentElement.clientHeight) || window.innerHeight;
    return Math.max(MIN_DOCK_HEIGHT, available - MIN_PANE_HEIGHT);
}

/** Clamp to the workspace, apply, and remember; returns the height used. */
function applyDockHeight(dock, height) {
    dockHeight = Math.min(Math.max(height, MIN_DOCK_HEIGHT), maxDockHeight(dock));
    dock.style.height = `${dockHeight}px`;
    if (follow) scrollToEnd();      // the log grows/shrinks with the box
    return dockHeight;
}

function startDockResize(event) {
    const dock = document.getElementById('consoleDock');
    if (!dock || resizing || (event.button !== undefined && event.button !== 0)) return;

    resizing = { startY: event.clientY, startHeight: dock.getBoundingClientRect().height };
    // The panes are iframes: they would otherwise swallow the moves that leave
    // the grip, so they are taken out of the picture for the duration.
    document.body.classList.add('resizing-console');
    document.addEventListener('mousemove', moveDockResize);
    document.addEventListener('mouseup', stopDockResize);
    event.preventDefault();
}

function moveDockResize(event) {
    if (!resizing) return;
    const dock = document.getElementById('consoleDock');
    if (!dock) return;
    // The grip sits on the top edge: dragging up grows the dock.
    applyDockHeight(dock, resizing.startHeight - (event.clientY - resizing.startY));
}

function stopDockResize() {
    if (!resizing) return;
    resizing = null;
    document.body.classList.remove('resizing-console');
    document.removeEventListener('mousemove', moveDockResize);
    document.removeEventListener('mouseup', stopDockResize);
    if (dockHeight) saveDockHeight(dockHeight);
}

/** Arrow keys, for when the grip has the focus. */
function resizeDockBy(delta) {
    const dock = document.getElementById('consoleDock');
    if (!dock) return;
    saveDockHeight(applyDockHeight(dock, dock.getBoundingClientRect().height + delta));
}

/** Bind the divider once. Only the grip resizes the dock. */
function bindDockResize() {
    if (resizeBound) return;
    const grip = document.getElementById('consoleDockGrip');
    if (!grip) return;
    resizeBound = true;

    grip.addEventListener('mousedown', startDockResize);
    grip.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowUp') resizeDockBy(KEYBOARD_STEP);
        else if (event.key === 'ArrowDown') resizeDockBy(-KEYBOARD_STEP);
        else return;
        event.preventDefault();
    });

    // A shrunk window must not leave the dock taller than the workspace.
    window.addEventListener('resize', () => {
        const dock = document.getElementById('consoleDock');
        if (dockHeight && dock && !dock.classList.contains('hidden')) applyDockHeight(dock, dockHeight);
    });
}

/** Toggle the console docked over the bottom of the workspace. */
export function toggleConsoleDock() {
    const dock = document.getElementById('consoleDock');
    if (dock && !dock.classList.contains('hidden')) {
        hideConsoleDock();
        return;
    }
    showConsoleDock();
}

/** Dock the console over the workspace: the panes keep their size. */
export function showConsoleDock() {
    const dock = document.getElementById('consoleDock');
    const body = document.getElementById('consoleDockBody');
    if (!dock || !body) return;

    body.textContent = '';
    body.appendChild(renderConsolePane({ onClose: hideConsoleDock }));

    // Whatever the user resized it to last time, clamped to this workspace.
    loadDockHeight();
    if (dockHeight) applyDockHeight(dock, dockHeight);
    bindDockResize();

    dock.classList.remove('hidden');
}

export function hideConsoleDock() {
    const dock = document.getElementById('consoleDock');
    const body = document.getElementById('consoleDockBody');
    if (dock) dock.classList.add('hidden');
    if (body) body.textContent = '';
    teardownConsole();
}

export function refreshConsole() {
    fetchLogs();
}

/** Called when the console is closed. */
export function teardownConsole() {
    if (timer) clearInterval(timer);
    timer = null;
    logElement = null;
    statusElement = null;
}
