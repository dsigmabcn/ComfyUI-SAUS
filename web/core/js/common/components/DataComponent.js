import { store } from '../scripts/stateManagerMain.js';
import { updateWorkflow } from './workflowManager.js';

function getNestedValue(obj, path) {
    return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined) ? acc[key] : undefined, obj);
}

class DataComponent {
    constructor(config, workflow) {
        this.id = config.id;
        this.name = config.name;
        this.nodePath = config.nodePath;
        this.dataPath = config.dataPath;
        this.workflow = workflow;

        this.handleStoreUpdate = this.handleStoreUpdate.bind(this);

        this.updateWorkflowWithStoreData();

        this.unsubscribe = store.subscribe(this.handleStoreUpdate);
    }

    updateWorkflowWithStoreData() {
        const state = store.getState();
        const data = getNestedValue(state, this.dataPath);

        if (data === undefined) {
            return;
        }

        updateWorkflow(this.workflow, this.nodePath, data);
    }

    handleStoreUpdate() {
        this.updateWorkflowWithStoreData();
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
    }
}

export default DataComponent;
