import { cacheQuery } from './cacheQuery.js';

export async function fetchappConfig(appName) {
    try {
        let app = appName;
        if (!app) {
            const paths = window.location.pathname.split('/').filter(Boolean);
            if (paths[0] === 'saus' && paths[1]) {
                app = paths[1];
            } else {
                throw new Error('Invalid path: Expected /saus/{name}');
            }
        }
        const jsonPath = `/saus/${encodeURIComponent(app)}/appConfig.json${cacheQuery(app)}`;
        const response = await fetch(jsonPath);
        if (!response.ok) {
            throw new Error(`Failed to fetch appConfig.json for app '${app}'. HTTP status: ${response.status}`);
        }
        const appConfig = await response.json();
        return appConfig;
    } catch (error) {
        console.error('Failed to load appConfig.json:', error);
        throw error;
    }
}
