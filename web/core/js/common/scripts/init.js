export class ConfigurationLoader {
    constructor() {
        this.basePath = window.location.pathname.split('/saus/')[1];
        this.configPath = `/saus/${this.basePath}/appConfig.json`;
    }
    async load() {
        try {
            const response = await fetch(this.configPath);
            if (!response.ok) {
                throw new Error(`Failed to load config from ${this.configPath}: ${response.statusText}`);
            }
            return await response.json();
        } catch (error) {
            console.error('Error loading configuration:', error);
            throw error;
        }
    }
}

export class UIUpdater {
    static updateTitle(title) {
        document.title = title;
    }
}

(async function initApp() {
    if (!window.location.pathname.includes('/saus/')) return;
    try {
        const configLoader = new ConfigurationLoader();
        const config = await configLoader.load();
        UIUpdater.updateTitle(config.name);
    } catch (error) {
        console.error('Initialization failed:', error);
    }
})();
