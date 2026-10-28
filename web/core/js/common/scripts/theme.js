/**
 * Theme controller: Night (default), Day, Fire - by setting `data-theme` on <html>,
 * which picks a block in /core/css/themes.css. One device-wide choice, so the shell,
 * every app and the File Manager agree (they share an origin, so a change can also be
 * pushed into the iframes). Dependency-free on purpose: app pages load it first.
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
