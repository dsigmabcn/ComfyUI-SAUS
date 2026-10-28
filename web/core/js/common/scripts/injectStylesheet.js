function injectStylesheet(href, id = null) {
    if (id && document.getElementById(id)) {
        console.warn(`Stylesheet with id "${id}" is already injected.`);
        return;
    }

    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'style';
    link.href = href;

    if (id) {
        link.id = id;
    }

    link.onload = function() {
        this.onload = null;
        this.rel = 'stylesheet';
    };

    link.onerror = function() {
        console.error(`Failed to load stylesheet "${href}".`);
    };

    document.head.appendChild(link);
}

export default injectStylesheet;
