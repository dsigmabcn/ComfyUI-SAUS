/**
 * Dragging media inside SAUS: from an app's Recent panel (or the File Manager) onto a
 * "Load Image" / "Video" input, across workspace tabs. Two traps: `getData()` is empty
 * during `dragover`, so the payload is also held in module state for the drag (with
 * `.saus-dragging` on the body); and the graph needs a file in `input/`, while a Recent
 * result lives in `output/`.
 */

/** The private MIME type a SAUS media drag carries. */
export const MEDIA_MIME = 'application/x-saus-media';

/** Set while a SAUS media drag is in flight (see the note above). */
let active = null;

const MEDIA_ROOTS = ['input', 'output', 'models'];

/**
 * `/view?filename=a.png&subfolder=2026-10-16&type=output` -> what a drop needs.
 *
 * ComfyUI's own viewer URL is the one thing every media surface here already has,
 * so the payload is derived from it rather than threaded through the callers.
 * `temp/` is deliberately not offered: it is not one of the roots the File Manager
 * API may copy from, so a `LoadImage` could never be pointed at it.
 */
export function parseMediaUrl(url) {
    if (!url || typeof url !== 'string') return null;
    let parsed;
    try {
        parsed = new URL(url, window.location.href);
    } catch (_) {
        return null;
    }
    const filename = parsed.searchParams.get('filename');
    const type = (parsed.searchParams.get('type') || 'output').toLowerCase();
    if (!filename || !MEDIA_ROOTS.includes(type)) return null;

    const subfolder = parsed.searchParams.get('subfolder') || '';
    return {
        filename,
        subfolder,
        type,
        src: url,
        // The path the File Manager API speaks: root-qualified and posix-separated.
        path: [type, subfolder, filename].filter(Boolean).join('/'),
    };
}

/** Start a SAUS media drag on `dataTransfer` (a `dragstart`). */
export function setMediaDrag(payload, dataTransfer) {
    if (!payload || !payload.path) return false;
    active = payload;
    document.body.classList.add('saus-dragging');
    if (dataTransfer) {
        try {
            dataTransfer.effectAllowed = 'copy';
            dataTransfer.setData(MEDIA_MIME, JSON.stringify(payload));
            // Plain text so dropping on anything else (an editor, the desktop) still does something.
            dataTransfer.setData('text/plain', payload.filename);
        } catch (_) { /* a browser may refuse custom types */ }
    }
    return true;
}

/** The payload of the drag in flight, or null. Readable during `dragover`. */
export function mediaDrag() {
    return active;
}

/** The payload carried by a `drop` event, falling back to module state. */
export function getMediaDrag(dataTransfer) {
    if (dataTransfer) {
        try {
            const raw = dataTransfer.getData(MEDIA_MIME);
            if (raw) return JSON.parse(raw);
        } catch (_) { /* not ours */ }
    }
    return active;
}

/**
 * Is a SAUS media drag in flight? Askable during `dragover` *and* from another
 * document: `dataTransfer.types` crosses the iframe boundary, while this module's own
 * flag belongs to the source document only - which is what the tab strip needs.
 */
export function isMediaDrag(dataTransfer) {
    if (active) return true;
    if (!dataTransfer || !dataTransfer.types) return false;
    return Array.from(dataTransfer.types).includes(MEDIA_MIME);
}

/** End of drag: on `dragend` (anywhere) or once a drop has been handled. */
export function endMediaDrag() {
    active = null;
    document.body.classList.remove('saus-dragging');
}
