/**
 * One `/object_info/<node type>` request per node type, per page load.
 *
 * Every widget that draws a combo asked for the same node class separately: an app
 * with six dropdowns over four classes made ~10 requests for 4 answers, and its
 * `setupModeSelector()` then asked again for the loader classes the dropdowns had
 * just fetched. A loader class answers with *every* model on disk, so those repeats
 * are the expensive ones.
 *
 * The cache is a module-level Map, so it lives exactly as long as the page: opening
 * the app again (or reloading it) starts from a fresh answer. A type ComfyUI does not
 * know answers `200 {}` and *is* remembered - the caller walks its own candidate list
 * and must not re-ask for a type it already knows is unknown. A real failure (a bad
 * status or a rejected fetch) is never remembered, so a retry is possible.
 */
const cache = new Map();

/** The route for a node type, encoded the way every caller builds it. */
export function objectInfoPath(nodeType) {
    return `/object_info/${encodeURIComponent(nodeType)}`;
}

/**
 * Forget every answer. For a caller that deliberately wants a fresh look - and for
 * the DOM harnesses, which drive several page-loads' worth of widgets in one process.
 */
export function clearObjectInfoCache() {
    cache.clear();
}

/** The node's `/object_info` entry, or null when ComfyUI has no such node type. */
export async function getObjectInfo(path) {
    const key = String(path || '');
    if (!key) return null;
    if (cache.has(key)) return cache.get(key);

    let entry = null;
    let answerable = false;
    try {
        const response = await fetch(`${window.location.origin}${key}`);
        if (!response.ok) {
            console.warn(`[SAUS] ${key} answered ${response.status}`);
            return null;
        }
        const data = await response.json();
        // ComfyUI keys the answer by the class it matched; one key, one entry.
        const values = data ? Object.values(data) : [];
        entry = values.length ? values[0] : null;
        answerable = true;
    } catch (error) {
        // Not answerable: a transient failure must not be cached as "unknown".
        console.warn(`[SAUS] ${key} failed:`, error);
        return null;
    }

    if (answerable) cache.set(key, entry);
    return entry;
}
