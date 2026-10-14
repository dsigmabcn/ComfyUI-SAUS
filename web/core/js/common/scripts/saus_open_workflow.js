/**
 * Open a SAUS app's workflow in ComfyUI.
 *
 * The ⤴ button of the SAUS app browser (see
 * web/saus_browser/js/workflow_export.js) opens ComfyUI in a new window with
 * ?saus_workflow=<url of the workflow>. This file is loaded inside that
 * ComfyUI page (SAUS ships it through WEB_DIRECTORY, see saus/constants.py)
 * and turns the parameter into a real workflow:
 *
 *   1. it waits for ComfyUI to come up and to finish loading the workflow it
 *      had restored, so the app's graph is what is left on screen;
 *   2. it reads the JSON behind the parameter and tells the two formats apart:
 *      SAUS apps ship the API graph they run (wf.json), some ship a UI graph
 *      (ui_wf.json);
 *   3. it hands the graph to ComfyUI with a null target, which makes ComfyUI
 *      build a new - unsaved - workflow tab for it (app.loadApiJson converts
 *      the API format, app.loadGraphData takes the UI one).
 *
 * The parameter is dropped from the address bar before any of this, so a
 * reload never opens the same workflow twice.
 */

import { app } from "../../scripts/app.js";

const QUERY_PARAM = 'saus_workflow';

/* Only the two things this feature ever points at: the copy the ⤴ button saved
 * into ComfyUI's workflow folder, or a workflow an app ships. Anything else in
 * the parameter is refused, so a link cannot make this page fetch an arbitrary
 * same-origin URL. */
const ALLOWED_PATH_PREFIXES = ['/api/userdata/', '/saus/'];

/* A workflow is a small JSON document; these keep a hostile (or simply wrong)
 * file from being read into this page and handed to ComfyUI's loader. */
const MAX_WORKFLOW_BYTES = 5 * 1024 * 1024;
const MAX_WORKFLOW_NODES = 2000;

/* ComfyUI loads the restored workflow only after every extension setup() has
 * returned, so we never block setup(): we wait for the graph loads it performs
 * while booting and only step in once they stopped. */
const SETTLE_MS = 400;
const BOOT_TIMEOUT_MS = 20000;
const NOTICE_MS = 10000;

let bootResolver = null;
let bootTimer = null;

function stopWaitingForBoot() {
    if (!bootResolver) return;

    clearTimeout(bootTimer);
    bootTimer = null;

    const resolve = bootResolver;
    bootResolver = null;
    resolve();
}

/** ComfyUI loaded (or restored) a workflow: it is still busy, keep waiting. */
function bootIsLoadingAWorkflow() {
    if (!bootResolver) return;

    clearTimeout(bootTimer);
    bootTimer = setTimeout(stopWaitingForBoot, SETTLE_MS);
}

/** Resolves once ComfyUI stopped loading workflows, or when nothing loads. */
function whenBootIsDone() {
    return new Promise((resolve) => {
        bootResolver = resolve;
        bootTimer = setTimeout(stopWaitingForBoot, BOOT_TIMEOUT_MS);
    });
}

/**
 * ComfyUI's own test for an API graph: every entry is a node. A UI graph has a
 * "nodes" array instead, and its own entries carry no class_type.
 */
function isApiWorkflow(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
    if (Array.isArray(data.nodes)) return false;

    const nodes = Object.values(data);
    return nodes.length > 0 && nodes.every((node) =>
        node && typeof node === 'object' && !Array.isArray(node) && typeof node.class_type === 'string');
}

/** Tell the user something, without relying on ComfyUI's own CSS. */
function notice(message) {
    const card = document.createElement('div');
    card.textContent = message;
    card.style.cssText = [
        'position:fixed',
        'right:16px',
        'bottom:16px',
        'z-index:10000',
        'max-width:min(420px, calc(100vw - 32px))',
        'padding:12px 16px',
        'border-left:4px solid #ff7a18',
        'border-radius:6px',
        'background:#1f2430',
        'color:#f2f4f8',
        'font:13px/1.5 system-ui, -apple-system, sans-serif',
        'box-shadow:0 6px 24px rgba(0, 0, 0, .35)',
    ].join(';');

    document.body.appendChild(card);
    setTimeout(() => card.remove(), NOTICE_MS);
}

/** Reads the parameter once, and takes it out of the address bar. */
function workflowUrlFromAddressBar() {
    const here = new URL(window.location.href);
    const workflowUrl = here.searchParams.get(QUERY_PARAM);
    if (!workflowUrl) return null;

    here.searchParams.delete(QUERY_PARAM);
    history.replaceState(null, '', `${here.pathname}${here.search}${here.hash}`);
    return workflowUrl;
}

/**
 * Hand the workflow over. The null tells ComfyUI the graph belongs to a
 * workflow of its own: it opens a new (unsaved) tab for it instead of
 * replacing the workflow this window restored.
 */
async function openInNewWorkflowTab(data) {
    if (isApiWorkflow(data)) {
        await app.loadApiJson(data, null);
        return;
    }

    if (await app.loadGraphData(data, true, true, null) === false) {
        throw new Error('ComfyUI could not read it');
    }
}

/** Only the two shapes this feature produces, and never a traversal. */
function isAllowedWorkflowPath(url) {
    let pathname = url.pathname;
    try {
        pathname = decodeURIComponent(pathname);   // %2e%2e must not slip through
    } catch (error) {
        return false;
    }

    if (pathname.split('/').includes('..')) return false;
    return ALLOWED_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/** Refuses anything that cannot be a workflow, before ComfyUI sees it. */
function assertLooksLikeWorkflow(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('the file does not hold a workflow');
    }

    // An API graph is keyed by node id; a UI graph holds a "nodes" array.
    const nodes = Array.isArray(data.nodes) ? data.nodes.length : Object.keys(data).length;
    if (nodes === 0) {
        throw new Error('the file holds no nodes');
    }
    if (nodes > MAX_WORKFLOW_NODES) {
        throw new Error(`it holds ${nodes} nodes, far more than a workflow ever has`);
    }
}

/** Reads the workflow - only if it really is a workflow-shaped JSON document. */
async function fetchWorkflowJson(target) {
    const response = await fetch(target.href, { headers: { Accept: 'application/json' } });
    if (!response.ok) {
        throw new Error(`ComfyUI answered ${response.status}`);
    }

    const contentType = (response.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (contentType && contentType !== 'application/json') {
        throw new Error(`it is served as ${contentType}, not as JSON`);
    }

    const declared = Number(response.headers.get('Content-Length'));
    if (Number.isFinite(declared) && declared > MAX_WORKFLOW_BYTES) {
        throw new Error('it is too large to be a workflow');
    }

    const text = await response.text();
    if (text.length > MAX_WORKFLOW_BYTES) {
        throw new Error('it is too large to be a workflow');
    }

    return JSON.parse(text);
}

async function openWorkflowFromAddressBar(workflowUrl) {
    await whenBootIsDone();

    if (typeof app.loadGraphData !== 'function' || typeof app.loadApiJson !== 'function') {
        throw new Error('this version of ComfyUI cannot open a workflow by itself');
    }

    const target = new URL(workflowUrl, window.location.origin);
    if (target.origin !== window.location.origin) {
        throw new Error('it lives outside ComfyUI');
    }
    if (!isAllowedWorkflowPath(target)) {
        throw new Error('it is not a workflow file of ComfyUI or of a SAUS app');
    }

    const data = await fetchWorkflowJson(target);
    assertLooksLikeWorkflow(data);

    await openInNewWorkflowTab(data);
}

app.registerExtension({
    name: 'saus.open_workflow',
    afterLoadGraph() {
        bootIsLoadingAWorkflow();
    },
    setup() {
        const workflowUrl = workflowUrlFromAddressBar();
        if (!workflowUrl) return;

        // Not awaited on purpose: ComfyUI is still starting up here, and
        // blocking setup() would also block the workflow load we wait for.
        openWorkflowFromAddressBar(workflowUrl).catch((error) => {
            console.error('[SAUS] Could not open the app workflow:', error);
            notice(`SAUS could not open this app's workflow: ${error.message}`);
        });
    },
});
