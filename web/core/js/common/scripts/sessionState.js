/**
 * What an app remembers while the browser session lasts.
 *
 * Closing an app tab destroys its iframe (see tabs.js), so a mistaken close used to
 * lose everything: the settings, the prompt, the variant, the LoRAs and the results
 * panel. This keeps them in `sessionStorage` - the same place the shell keeps its open
 * tabs - so a page reload or a re-opened tab gets them back, while closing the browser
 * or a new server stamp (a ComfyUI restart, /saus/api/session) really is a new session.
 *
 * Nothing here is a whole-graph copy: only *values* are collected (a link is [id, slot]
 * and never something a user chose), so what is restored is exactly the settings a
 * person could have changed. Anything that no longer exists in the app that comes back
 * (it was rebuilt, its node ids moved) is dropped with a warning - an old snapshot must
 * never stop an app opening.
 */
const PREFIX = 'saus.appstate.v1.';
const VERSION = 1;

/** The storage key for one app. */
export function keyFor(url) {
    return `${PREFIX}${url}`;
}

/** True when the stamp on disk is not this server run any more. */
export function isNewServerSession(stored, current) {
    if (!current) return false;         // the caller could not ask: keep what we have
    return String(stored || '') !== String(current);
}

/**
 * Forget every remembered app. Called when the server answers with a new stamp: the
 * apps themselves are still open in their tabs, this is only their *memory*.
 */
export function clearAll() {
    try {
        const doomed = [];
        for (let index = 0; index < sessionStorage.length; index += 1) {
            const key = sessionStorage.key(index);
            if (key && key.startsWith(PREFIX)) doomed.push(key);
        }
        doomed.forEach((key) => sessionStorage.removeItem(key));
        return doomed.length;
    } catch (error) {
        console.warn('[SAUS] could not clear the remembered app state:', error);
        return 0;
    }
}

/**
 * The user-chosen values in a workflow: every primitive input, per node.
 * Links (`[id, slot]`) and node structure are left out on purpose.
 */
export function collectValues(workflow) {
    const values = {};
    Object.entries(workflow || {}).forEach(([nodeId, node]) => {
        const inputs = node && node.inputs;
        if (!inputs || typeof inputs !== 'object') return;
        const picked = {};
        Object.entries(inputs).forEach(([key, value]) => {
            const type = typeof value;
            if (value === null || type === 'string' || type === 'number' || type === 'boolean') {
                picked[key] = value;
            }
        });
        if (Object.keys(picked).length) values[nodeId] = picked;
    });
    return values;
}

/**
 * Split a saved set of values into what this workflow can still take and what it
 * cannot. A node (or an input) the app no longer has is reported, never applied.
 */
export function pluckValues(values, workflow) {
    const apply = {};
    const dropped = [];
    Object.entries(values || {}).forEach(([nodeId, inputs]) => {
        const node = (workflow || {})[nodeId];
        if (!node) {
            dropped.push(nodeId);
            return;
        }
        const known = (node.inputs && typeof node.inputs === 'object') ? node.inputs : {};
        const picked = {};
        Object.entries(inputs || {}).forEach(([key, value]) => {
            if (key in known) picked[key] = value;
            else dropped.push(`${nodeId}.${key}`);
        });
        if (Object.keys(picked).length) apply[nodeId] = picked;
    });
    return { apply, dropped };
}

/** A cheap, stable summary of a graph's shape: which inputs exist where. */
export function fingerprint(workflow) {
    const parts = Object.entries(workflow || {})
        .map(([nodeId, node]) => `${nodeId}:${Object.keys((node && node.inputs) || {}).sort().join(',')}`)
        .sort();
    const text = parts.join('|');
    let hash = 5381;
    for (let index = 0; index < text.length; index += 1) {
        hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0;
    }
    return hash.toString(36);
}

/** Write one app's snapshot. Never throws: losing the memory must not break the app. */
export function save(url, session, snapshot) {
    try {
        sessionStorage.setItem(keyFor(url), JSON.stringify({
            version: VERSION,
            session: String(session || ''),
            ...snapshot,
        }));
        return true;
    } catch (error) {
        console.warn('[SAUS] could not remember the app state:', error);
        return false;
    }
}

/** Read one app's snapshot, or null when there is none for *this* session. */
export function load(url, session) {
    let raw = null;
    try {
        raw = sessionStorage.getItem(keyFor(url));
    } catch (error) {
        return null;
    }
    if (!raw) return null;

    let data = null;
    try {
        data = JSON.parse(raw);
    } catch (error) {
        console.warn('[SAUS] ignoring an unreadable app snapshot:', error);
        return null;
    }

    if (!data || typeof data !== 'object') return null;
    if (data.version !== VERSION) return null;
    if (String(data.session || '') !== String(session || '')) return null;
    return data;
}
