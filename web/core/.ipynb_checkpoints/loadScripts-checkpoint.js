import { coreScriptsPath } from '/core/js/common/scripts/corePath.js';

const urlParams = new URLSearchParams(window.location.search);
const appName = urlParams.get('flow');

const isLinker = appName !== undefined && appName !== null;

const config = {
    scripts: ['/core/main.js'],
    coreScripts: isLinker
        ? coreScriptsPath.filter(src => !src.includes('init.js'))
        : coreScriptsPath,
    appName: appName
};

const loadScript = (src) => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.type = 'module';
        if (src.includes('main.js')) {
            script.src = `${src}${config.appName ? '?flow=' + encodeURIComponent(config.appName) : ''}`;
        } else {
            script.src = src;
        }
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
        // console.log(`${src} loaded`);
    });
};

const loadCoreScripts = async () => {
    for (const src of config.coreScripts) {
        await loadScript(src);
    }
};

const loadAppScripts = async () => {
    for (const src of config.scripts) {
        await loadScript(src);
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
