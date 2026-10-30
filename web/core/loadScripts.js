import { coreScriptsPath } from '/core/js/common/scripts/corePath.js';
import { initTheme } from '/core/js/common/scripts/theme.js';

// Night / Day / Fire, before anything renders (palette: /core/css/themes.css).
initTheme();

const urlParams = new URLSearchParams(window.location.search);
const appName = urlParams.get('app');

// Opened inside a tab of the SAUS browser? That page already provides the
// logo, the navigation bar and the footer, so the app drops its own (see
// .saus-embedded in main.css).
if (urlParams.get('embed') === '1') {
    document.documentElement.classList.add('saus-embedded');
}

const isBuilder = appName !== undefined && appName !== null;

const config = {
    // The runtime as **one generated file** (tools/bundle_core.py in the builder repo).
    // ComfyUI serves static files uncompressed, so the modules were ~42 requests and
    // ~300 KB on a cold open; the bundle is one request, minified, and the canvas
    // plugins stay lazy chunks of their own. Everything the build writes lives in
    // /core/js/dist/ - the source tree keeps only main.js and its modules.
    scripts: ['/core/js/dist/core.bundle.min.js'],
    // What a bundle that cannot be *loaded* falls back to (a stale artifact, an
    // interrupted upload). The modules it was built from are always shipped beside
    // it, so the page still runs - just unbatched. This is an error path, never a
    // silent choice: a bundle that loads but misbehaves is a bug to fix, not to hide.
    moduleFallback: '/core/main.js',
    coreScripts: isBuilder
        ? coreScriptsPath.filter(src => !src.includes('init.js'))
        : coreScriptsPath,
    appName: appName
};

/** The entry script is the one that carries the app name in its query. */
const isEntry = (src) => src === config.scripts[0] || src === config.moduleFallback;

const loadScript = (src) => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.type = 'module';
        script.src = isEntry(src) && config.appName
            ? `${src}?app=${encodeURIComponent(config.appName)}`
            : src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

const loadCoreScripts = async () => {
    for (const src of config.coreScripts) {
        await loadScript(src);
    }
};

const loadAppScripts = async () => {
    for (const src of config.scripts) {
        try {
            await loadScript(src);
        } catch (error) {
            if (!config.moduleFallback) throw error;
            console.warn('[SAUS] the runtime bundle did not load; falling back to its modules:', error);
            await loadScript(config.moduleFallback);
        }
    }
};

const init = async () => {
    try {
        await loadCoreScripts();
        await loadAppScripts();
        console.log('All scripts loaded successfully');
    } catch (error) {
        console.error('Error loading scripts:', error);
    }
};

init();
