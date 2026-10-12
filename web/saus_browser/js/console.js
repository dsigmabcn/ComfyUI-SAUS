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
        if (!response.ok) {
            setStatus(`HTTP ${response.status}`);
            return;
        }
        const data = await response.json();
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

/** Build the console pane. */
export function renderConsolePane() {
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

    logElement = document.createElement('pre');
    logElement.className = 'console-log';
    logElement.textContent = 'Loading logs...';

    wrapper.appendChild(toolbar);
    wrapper.appendChild(logElement);

    startPolling();
    return wrapper;
}

export function refreshConsole() {
    fetchLogs();
}

/** Called when the console tab is closed. */
export function teardownConsole() {
    if (timer) clearInterval(timer);
    timer = null;
    logElement = null;
    statusElement = null;
}
