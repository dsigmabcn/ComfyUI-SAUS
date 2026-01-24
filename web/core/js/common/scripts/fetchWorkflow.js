import { loadWorkflow } from './workflowLoader.js';

export async function fetchWorkflow(appName) {
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
        const cacheBuster = `?cacheSaus=${Date.now()}`;
        const wfpath_url = `/saus/${encodeURIComponent(app)}/wf.json${cacheBuster}`;
        const workflow = await loadWorkflow(wfpath_url);
        return workflow;
    } catch (error) {
        console.error('Failed to load wf.json:', error);
        throw error;
    }
}
