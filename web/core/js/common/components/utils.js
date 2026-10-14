export function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}

/**
 * Escape a value so it is safe to place inside HTML text or a quoted
 * attribute. Use it for anything that comes from data (model/file names,
 * app config fields, taxonomy, registry entries) before putting it in a
 * template string that is assigned to innerHTML.
 */
export function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Elements under ``root`` whose ``data-model-path`` equals ``path`` -- or, when
 * ``descendantSelector`` is given, those descendants inside them.
 *
 * Model names come from ComfyUI's file listings, so they may contain quotes or
 * brackets that would be parsed as CSS syntax inside a
 * ``[data-model-path="…"]`` selector. Comparing the attribute value directly
 * avoids that entirely.
 */
export function modelPathElements(root, path, descendantSelector = null) {
    if (!root || path === null || path === undefined) return [];
    const wanted = String(path);
    const matches = [];
    root.querySelectorAll('[data-model-path]').forEach((node) => {
        if (node.getAttribute('data-model-path') !== wanted) return;
        if (descendantSelector) {
            matches.push(...node.querySelectorAll(descendantSelector));
        } else {
            matches.push(node);
        }
    });
    return matches;
}
export function showSpinner() {
    document.getElementById('spinner').classList.add('spin');
}
export function hideSpinner() {
    document.getElementById('spinner').classList.remove('spin');
}

export async function detectMimeType(blob) {
    const signatureMap = {
        '89504E47': 'image/png',
        'FFD8FF': 'image/jpeg',
        '47494638': 'image/gif',
        '424D': 'image/bmp',
        '52494646': 'audio/wav',
        '00000018': 'video/mp4',
        '00000020': 'video/mp4',
        '66747970': 'video/mp4',
    };

    const arrayBuffer = await blob.slice(0, 8).arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let hex = '';
    uint8Array.forEach(byte => {
        hex += byte.toString(16).padStart(2, '0').toUpperCase();
    });

    for (const signature in signatureMap) {
        if (hex.startsWith(signature)) {
            return signatureMap[signature];
        }
    }

    return null;
}
