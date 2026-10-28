/**
 * "Open the workflow in ComfyUI": the graph that goes over is the one the app is
 * running (its overlay cannot be read from a file), copied into ComfyUI's own
 * workflow folder, with the new window's ?saus_workflow= telling the injected
 * extension which copy to load.
 */

function safeFileName(name) {
    return String(name || 'workflow')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80) || 'workflow';
}

/** Small toast, using the same CSS the model toasts use (modals.css). */
function toast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle'}"></i>`;
    el.appendChild(document.createTextNode(message));
    container.appendChild(el);

    el.offsetHeight;              // let the browser see the start state
    el.classList.add('show');
    setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => el.remove(), 300);
    }, 6000);
}

/**
 * Which workflow file is sent, in order: wf.json is the API-format graph every
 * app ships (and runs), ui_wf.json is an optional UI-format graph used when an
 * app has no API one.
 */
const CANDIDATE_WORKFLOW_FILES = ['wf.json', 'ui_wf.json'];

/**
 * Read an app's workflow. ``appUrl`` is the app's directory name (tab.url),
 * never the tab object: the path is /saus/<url>/<file> - the same URL the app
 * itself loads its workflow from (see core/js/common/scripts/fetchWorkflow.js).
 */
async function fetchAppWorkflow(appUrl) {
    for (const file of CANDIDATE_WORKFLOW_FILES) {
        try {
            const response = await fetch(`/saus/${encodeURIComponent(appUrl)}/${file}?cacheSaus=${Date.now()}`);
            if (response.ok) return await response.text();
        } catch (error) {
            console.error(`Could not read ${file} of ${appUrl}:`, error);
        }
    }
    throw new Error('this app ships no workflow file');
}

/* How long to wait for the app of a freshly created tab to finish booting. */
const APP_READY_TIMEOUT_MS = 3000;
const APP_READY_POLL_MS = 150;

/* A workflow goes into the user's workflow list and onto ComfyUI's canvas, so
 * keep it to a workflow-sized document and never take a file that is not one. */
const MAX_EXPORT_BYTES = 5 * 1024 * 1024;
const MAX_EXPORT_NODES = 2000;

/* How many "name (2).json" attempts before giving up on a free name. */
const MAX_SAVE_ATTEMPTS = 20;

/**
 * The graph the app is running, read from its iframe - which may still be booting,
 * so this waits briefly. Null when the app cannot be read (older copy, not
 * same-origin); the caller then falls back to the shipped wf.json.
 */
async function readLiveWorkflow(frame) {
    if (!frame) return null;

    const deadline = Date.now() + APP_READY_TIMEOUT_MS;

    for (;;) {
        let saus = null;
        try {
            // Reading another origin's window throws here. Apps are served by
            // ComfyUI itself, so this only guards a future setup.
            saus = frame.contentWindow ? frame.contentWindow.SAUS : null;
        } catch (error) {
            console.warn('[SAUS] the app page cannot be read, exporting its base workflow:', error);
            return null;
        }

        if (saus && typeof saus.getWorkflow === 'function' && saus.isReady && saus.isReady()) {
            const workflow = saus.getWorkflow();
            if (!isExportableWorkflow(workflow)) return null;

            return { workflow, variant: (saus.getVariant && saus.getVariant()) || null };
        }

        if (Date.now() >= deadline) {
            console.warn('[SAUS] the app did not finish loading, exporting its base workflow');
            return null;
        }

        await new Promise((resolve) => setTimeout(resolve, APP_READY_POLL_MS));
    }
}

/** A graph we are willing to put in the user's workflow list and canvas. */
function isExportableWorkflow(graph) {
    if (!graph || typeof graph !== 'object' || Array.isArray(graph)) return false;

    // An API graph is keyed by node id; a UI graph holds a "nodes" array.
    const nodes = Array.isArray(graph.nodes) ? graph.nodes.length : Object.keys(graph).length;
    return nodes > 0 && nodes <= MAX_EXPORT_NODES;
}

/** The stored copy of a workflow, or null when there is none. */
async function readCopy(target) {
    try {
        const response = await fetch(target);
        return response.ok ? await response.text() : null;
    } catch (error) {
        return null;
    }
}

/**
 * Copies the workflow into ComfyUI's workflow folder, never over an existing file
 * (ComfyUI numbers its own copies), reusing an identical copy when there is one.
 */
async function saveWorkflowCopy(fileName, workflowText) {
    for (let attempt = 0; attempt < MAX_SAVE_ATTEMPTS; attempt += 1) {
        const numbered = attempt === 0
            ? fileName
            : fileName.replace(/\.json$/i, ` (${attempt + 1}).json`);

        // Same endpoint ComfyUI's own workflow list reads from (the slash stays
        // encoded, which is how the UI asks for a file inside "workflows/").
        const target = `/api/userdata/${encodeURIComponent(`workflows/${numbered}`)}`;

        if (attempt === 0) {
            const existing = await readCopy(target);
            if (existing === workflowText) return { target, fileName: numbered };
        }

        const saved = await fetch(`${target}?overwrite=false`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: workflowText,
        });
        if (saved.ok) return { target, fileName: numbered };
        if (saved.status !== 409) throw new Error(`ComfyUI refused it (HTTP ${saved.status})`);
        // 409: that name is taken, try the next one.
    }

    throw new Error('too many copies of that workflow are already in ComfyUI');
}

/**
 * @param {{url: string, name: string, id: string}} tab
 * @param {?function} [getFrame] returns the app's iframe (created on demand)
 * @returns {Promise<boolean>} true when ComfyUI accepted the workflow
 */
export async function exportWorkflowToComfyUI(tab, getFrame) {
    if (!tab || !tab.url) return false;

    // Opened while the click is still being handled: after an await the browser
    // would count this as an unsolicited popup and block it.
    const comfyWindow = window.open('', '_blank');

    try {
        const running = await readLiveWorkflow(typeof getFrame === 'function' ? getFrame(tab) : null);
        const workflowText = running
            ? JSON.stringify(running.workflow)
            : await fetchAppWorkflow(tab.url);

        if (workflowText.length > MAX_EXPORT_BYTES) {
            throw new Error('that workflow is too large to send');
        }

        // Name the copy after the variant being exported, so the variants of an
        // app can sit in the workflow list side by side.
        const name = [tab.name || tab.url];
        if (running && running.variant && running.variant.label) name.push(running.variant.label);
        const fileName = `${safeFileName(name.join(' · '))}.json`;

        const copy = await saveWorkflowCopy(fileName, workflowText);

        // The workflow itself is loaded by the extension SAUS injects into the
        // ComfyUI page, which reads this parameter and puts the graph in a new
        // workflow tab there.
        const comfyUrl = new URL('/', window.location.origin);
        comfyUrl.searchParams.set('saus_workflow', copy.target);
        if (comfyWindow) {
            // The ComfyUI page needs nothing back from us, and it shares this
            // origin: drop the handle it would otherwise have on this window.
            comfyWindow.opener = null;
            comfyWindow.location.replace(comfyUrl.href);
        } else {
            window.open(comfyUrl.href, '_blank');   // the window was blocked
        }

        toast(running
            ? `“${copy.fileName}” saved and opened in a new ComfyUI tab.`
            : `${tab.name || tab.url} was not ready: its base workflow went over as “${copy.fileName}”.`,
            running ? 'success' : 'info');
        return true;
    } catch (error) {
        if (comfyWindow) comfyWindow.close();
        console.error('Workflow export failed:', error);
        toast(`Could not send the workflow to ComfyUI: ${error.message}`, 'error');
        return false;
    }
}
