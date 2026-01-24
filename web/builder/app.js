import { initializeSaveOptions, updateWorkflowConfig } from './configHandler.js';
import { initializeFileHandlers } from './fileHandler.js';
import { displayNodes, displayNodeInfo } from './nodeHandler.js';
import { initializeMultiComponentHandler } from './multiComponentHandler.js';

const state = {
    nodeToCustomNodeMap: {},
    assignedComponents: [],
    multiComponents: [],
    components: [],
    appId: '',
    appName: '',
    appUrl: '',
    componentCounters: {},
    appDescription: '',
    thumbnail: null, 
};

function generateAppId() {
    return Math.random().toString(36).substring(2, 7);
}

function toKebabCase(str) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
}

function generateappUrl(appId, appName) {
    return `${appId}-${toKebabCase(appName)}`;
}

function initializeApp() {
    const nodeDropdown = document.getElementById('nodeDropdown');
    const nodeInfoElement = document.getElementById('nodeInfo');
    const flowNameInput = document.getElementById('appName');
    const appDescriptionInput = document.getElementById('appDescription');

    if (!nodeDropdown || !nodeInfoElement || !flowNameInput || !appDescriptionInput) return;

    initializeSaveOptions(state);

    flowNameInput.addEventListener('input', () => {
        state.appName = flowNameInput.value.trim();
        if (!state.appName) {
            state.appId = '';
            state.appUrl = '';
        } else {
            if (!state.appId) state.appId = generateAppId();
            state.appUrl = generateappUrl(state.appId, state.appName);
        }
        updateWorkflowConfig(state);
    });

    appDescriptionInput.addEventListener('input', () => {
        state.appDescription = appDescriptionInput.value.trim();
        updateWorkflowConfig(state);
    });

    initializeFileHandlers(state, displayNodes);

    nodeDropdown.addEventListener('change', function () {
        const nodeId = this.value;
        if (nodeId) {
            const nodeInfo = state.nodeToCustomNodeMap[nodeId];
            displayNodeInfo(nodeId, nodeInfo, state);
        } else {
            nodeInfoElement.innerHTML = '';
        }
    });

    initializeMultiComponentHandler(state);
}

document.addEventListener('DOMContentLoaded', initializeApp);
export { state };
