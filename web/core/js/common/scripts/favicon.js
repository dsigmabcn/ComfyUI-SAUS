const FAVICON_BASE_PATH = '/core/media/ui/';

const FAVICONS = {
    DEFAULT: 'saus_logo.png',  
    RUNNING: 'g_flow_logo.png',
    ERROR: 'r_flow_logo.png'
};

export const setFaviconStatus = {
    Default() {
        updateFavicon(FAVICONS.DEFAULT);
    },
    Running() {
        updateFavicon(FAVICONS.RUNNING);
    },
    Error() {
        updateFavicon(FAVICONS.ERROR);
    }
};

function updateFavicon(iconUrl) {
    const link = document.querySelector('link[rel="icon"]') || createFaviconLink();
    link.href = `${FAVICON_BASE_PATH}${iconUrl}`;
}

function createFaviconLink() {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.type = 'image/png';
    document.head.appendChild(link);
    return link;
}

/* Note: nothing happens on import on purpose. This file sits in the node's
 * WEB_DIRECTORY, so ComfyUI imports it as an extension on every ComfyUI page —
 * a call here would replace ComfyUI's own favicon with SAUS's. The app pages
 * ask for it explicitly instead (see web/core/main.js). */
