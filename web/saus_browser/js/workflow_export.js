/**
 * "Open the workflow in ComfyUI".
 *
 * The graph that goes over is the one the app is running right now, read from
 * the app itself (window.SAUS in web/core/main.js): its settings and the variant
 * the user selected, which is an overlay applied to the template graph at run
 * time and therefore cannot be read from a file. An app that cannot be reached
 * - not loaded yet, or an older copy without the accessor - falls back to the
 * base wf.json it ships.
 *
 * Either way the JSON is copied into ComfyUI's own user workflow folder through
 * ComfyUI's /userdata API, so it also shows up in the ComfyUI workflow list.
 * ComfyUI is then opened in a new window, carrying a ?saus_workflow= parameter
 * that points at that copy; the extension SAUS injects into the ComfyUI page
 * (web/core/js/common/scripts/saus_open_workflow.js) reads the parameter and
 * loads the graph in a new workflow tab of that window.
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

/**
 * The graph the app is running right now, read straight from the app page.
 *
 * ``frame`` is the app's iframe. It is built on demand by the app browser and
 * may still be booting (or missing for an app tab that was restored but never
 * shown), so we wait - briefly - for the app to report itself ready.
 *
 * @returns {Promise<?{workflow: object, variant: ?{mode: string, variant: ?string, label: string}}>}
 *          null when the app cannot be read (older copy without the accessor,
 *          still loading, or not same-origin): the caller then falls back to
 *          the base wf.json.
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
            if (!workflow) return null;

            return { workflow, variant: (saus.getVariant && saus.getVariant()) || null };
        }

        if (Date.now() >= deadline) {
            console.warn('[SAUS] the app did not finish loading, exporting its base workflow');
            return null;
        }

        await new Promise((resolve) => setTimeout(resolve, APP_READY_POLL_MS));
    }
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

        // Name the copy after the variant being exported, so the variants of an
        // app can sit in the workflow list side by side.
        const name = [tab.name || tab.url];
        if (running && running.variant && running.variant.label) name.push(running.variant.label);
        const fileName = `${safeFileName(name.join(' · '))}.json`;

        // Same endpoint ComfyUI's own workflow list reads from (the slash stays
        // encoded, which is how the UI asks for a file inside "workflows/").
        const target = `/api/userdata/${encodeURIComponent(`workflows/${fileName}`)}`;
        const saved = await fetch(target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: workflowText,
        });
        if (!saved.ok) throw new Error(`ComfyUI refused it (HTTP ${saved.status})`);

        // The workflow itself is loaded by the extension SAUS injects into the
        // ComfyUI page, which reads this parameter and puts the graph in a new
        // workflow tab there.
        const comfyUrl = new URL('/', window.location.origin);
        comfyUrl.searchParams.set('saus_workflow', target);
        if (comfyWindow) {
            comfyWindow.location.replace(comfyUrl.href);
        } else {
            window.open(comfyUrl.href, '_blank');   // the window was blocked
        }

        toast(running
            ? `“${fileName}” saved and opened in a new ComfyUI tab.`
            : `${tab.name || tab.url} was not ready: its base workflow was sent to ComfyUI.`,
            running ? 'success' : 'info');
        return true;
    } catch (error) {
        if (comfyWindow) comfyWindow.close();
        console.error('Workflow export failed:', error);
        toast(`Could not send the workflow to ComfyUI: ${error.message}`, 'error');
        return false;
    }
}
