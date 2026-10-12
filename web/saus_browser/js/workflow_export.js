/**
 * "Open the workflow in ComfyUI".
 *
 * Every SAUS app ships web/apps/<url>/wf.json (API format). That file is
 * copied into ComfyUI's own user workflow folder through ComfyUI's
 * /userdata API, so it shows up in the ComfyUI workflow list; ComfyUI detects
 * API-format JSON on load and builds the graph from it. ComfyUI is then
 * opened in a new window.
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

/**
 * @param {{url: string, name: string}} tab
 * @returns {Promise<boolean>} true when ComfyUI accepted the workflow
 */
export async function exportWorkflowToComfyUI(tab) {
    if (!tab || !tab.url) return false;

    try {
        const workflowText = await fetchAppWorkflow(tab.url);

        const fileName = `${safeFileName(tab.name || tab.url)}.json`;
        // Same endpoint ComfyUI's own workflow list reads from (the slash stays
        // encoded, which is how the UI asks for a file inside "workflows/").
        const target = `/api/userdata/${encodeURIComponent(`workflows/${fileName}`)}`;
        const saved = await fetch(target, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: workflowText,
        });
        if (!saved.ok) throw new Error(`ComfyUI refused it (HTTP ${saved.status})`);

        window.open('/', '_blank');
        toast(`Workflow saved as “${fileName}” — open it from ComfyUI's workflow list.`, 'success');
        return true;
    } catch (error) {
        console.error('Workflow export failed:', error);
        toast(`Could not send the workflow to ComfyUI: ${error.message}`, 'error');
        return false;
    }
}
