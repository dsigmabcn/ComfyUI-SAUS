/**
 * Theme controller: Night (default), Day, Fire.
 *
 * The palette itself lives in /core/css/themes.css; this module only decides
 * which of the three a document shows:
 *
 *     <html>                 -> :root, i.e. Night
 *     <html data-theme="day"> -> the Day block
 *     <html data-theme="fire">-> the Fire block
 *
 * The choice is a device preference rather than a per-app one, so the app
 * browser, every app and the File Manager always agree. They are all served
 * from the ComfyUI origin, which is also why a change can be pushed into the
 * iframes the browser owns without reloading them.
 *
 * Kept dependency-free on purpose: the app pages load it before anything else.
 */

/* A plain string, so the tiny inline script in the pages' <head> can read it
 * without parsing JSON (that script is what avoids a flash of the wrong theme). */
const STORAGE_KEY = 'SausTheme';
const URL_PARAM = 'theme';

export const THEMES = [
    { id: 'night', label: 'Night', hint: 'Neutral dark' },
    { id: 'day', label: 'Day', hint: 'Light' },
    { id: 'fire', label: 'Fire', hint: 'The original orange and ice look' },
];

export const DEFAULT_THEME = 'night';

const THEME_IDS = THEMES.map((theme) => theme.id);

export function isTheme(themeId) {
    return THEME_IDS.includes(themeId);
}

/** The remembered theme, or null when there is none (or storage is blocked). */
export function storedTheme() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return isTheme(stored) ? stored : null;
    } catch (error) {
        return null;        // private mode, storage disabled, ...
    }
}

/**
 * What this document should show: a ?theme= handed over by the page embedding
 * it, else what the user chose, else the default.
 */
export function currentTheme() {
    const fromUrl = new URLSearchParams(window.location.search).get(URL_PARAM);
    if (isTheme(fromUrl)) return fromUrl;
    return storedTheme() || DEFAULT_THEME;
}

/** Show a theme on one document (this one by default). */
function applyToDocument(themeId, doc = document) {
    if (!isTheme(themeId) || !doc) return false;
    doc.documentElement.dataset.theme = themeId;
    return true;
}

/**
 * Push a theme into the same-origin documents around this one: the iframes it
 * contains (the shell owns the app tabs) and the page it is embedded in (the
 * File Manager's settings panel lives in a tab of the shell). Anything on
 * another origin is skipped - it decides for itself.
 */
export function syncFrames(themeId = currentTheme(), doc = document) {
    let synced = 0;

    doc.querySelectorAll('iframe').forEach((frame) => {
        try {
            if (frame.contentDocument) {
                applyToDocument(themeId, frame.contentDocument);
                synced += 1;
            }
        } catch (error) {
            // Another origin: leave it alone.
        }
    });

    try {
        if (window.parent && window.parent !== window && window.parent.document) {
            applyToDocument(themeId, window.parent.document);
            synced += 1;
        }
    } catch (error) {
        // Another origin: leave it alone.
    }

    return synced;
}

/** Choose a theme: remember it, show it here and everywhere it is embedded. */
export function applyTheme(themeId) {
    if (!isTheme(themeId)) return false;

    try {
        localStorage.setItem(STORAGE_KEY, themeId);
    } catch (error) {
        console.warn('[SAUS] the theme could not be remembered:', error);
    }

    applyToDocument(themeId);
    syncFrames(themeId);
    return true;
}

/** Called once by every SAUS page while it boots. */
export function initTheme() {
    const themeId = currentTheme();
    applyToDocument(themeId);
    return themeId;
}
