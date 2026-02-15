document.addEventListener('DOMContentLoaded', () => {
    // Global state object
    let state = {
        apps: [],
        architectures: {},
        models: {}
    };

    const modelTypePaths = {
        'CHECKPOINT': '/checkpoints/',
        'Clipvision': '/clip_vision/',
        'CONTROLNET': '/controlnet/',
        'Diffusion model': '/diffusion_models/',
        'Latent Upscaler': '/latent_upscale_models/',
        'LORA': '/loras/',
        'MOTION_MODULE': '/animatediff_models/',
        'Style': '/style_models/',        
        'TEXT ENCODER': '/text_encoders/',
        'Upscaler': '/upscale_models/',
        'VAE': '/vae/'
    };

    // DOM Elements
    const appsListEl = document.getElementById('apps-list');
    const architecturesListEl = document.getElementById('architectures-list');
    const modelsListEl = document.getElementById('models-list');

    // Modal Elements
    const appModal = document.getElementById('app-modal');
    const archModal = document.getElementById('arch-modal');
    const modelModal = document.getElementById('model-modal');
    const relationshipsModal = document.getElementById('relationships-modal');

    // Context to track what is being edited
    let currentContext = {
        index: null, // For Apps
        key: null,   // For Arch/Models
        isNew: false
    };

    // --- Data Fetching and Saving ---

    async function fetchData() {
        try {
            const response = await fetch('/saus/api/arc-manager/data');
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            state = data;
            renderAll();
        } catch (error) {
            console.error("Error fetching data:", error);
            alert("Could not load configuration data. Check the server logs.");
        }
    }

    async function saveAllData() {
        try {
            const response = await fetch('/saus/api/arc-manager/data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state)
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            await fetchData(); // Refresh data from server
        } catch (error) {
            console.error("Error saving data:", error);
            alert("Could not save changes. Check the server logs.");
        }
    }

    // --- Rendering ---

    function renderAll() {
        renderApps();
        renderArchitectures();
        renderModels();
    }

    function renderApps() {
        appsListEl.innerHTML = '';
        state.apps.forEach((app, index) => {
            const el = document.createElement('div');
            el.className = 'item-card';
            el.innerHTML = `
                <div class="item-card-header">
                    <span class="item-title">${app.name || 'Untitled App'}</span>
                    <div>
                        <button class="edit-button" data-type="app" data-index="${index}">Edit</button>
                        <button class="delete-button" data-type="app" data-index="${index}">Delete</button>
                    </div>
                </div>
            `;
            appsListEl.appendChild(el);
        });
    }

    function renderArchitectures() {
        architecturesListEl.innerHTML = '';
        Object.keys(state.architectures).forEach(key => {
            const arch = state.architectures[key];
            const el = document.createElement('div');
            el.className = 'item-card';
            el.innerHTML = `
                <div class="item-card-header">
                    <span class="item-title">${key}</span>
                     <div>
                        <button class="edit-button" data-type="architecture" data-key="${key}">Edit</button>
                        <button class="delete-button" data-type="architecture" data-key="${key}">Delete</button>
                    </div>
                </div>
            `;
            architecturesListEl.appendChild(el);
        });
    }

    function renderModels() {
        modelsListEl.innerHTML = '';
        Object.keys(state.models).forEach(key => {
            const model = state.models[key];
            const el = document.createElement('div');
            el.className = 'item-card';
            el.innerHTML = `
                <div class="item-card-header">
                    <span class="item-title">${key}</span>
                     <div>
                        <button class="edit-button" data-type="model" data-key="${key}">Edit</button>
                        <button class="delete-button" data-type="model" data-key="${key}">Delete</button>
                    </div>
                </div>
            `;
            modelsListEl.appendChild(el);
        });
    }

    // --- Form Helpers ---

    const FormBuilder = {
        createTextField: (key, label, value = null) => `
            <div class="form-field">
                <label for="form-${key}">${label}</label>
                <input type="text" id="form-${key}" name="${key}" value="${value !== null ? value : ''}">
            </div>`,

        createTextarea: (key, label, value) => `
            <div class="form-field">
                <label for="form-${key}">${label}</label>
                <textarea id="form-${key}" name="${key}" class="json-textarea">${value ? (typeof value === 'object' ? JSON.stringify(value, null, 2) : value) : ''}</textarea>
            </div>`,

        createSelectField: (key, label, options, selectedValue) => {
            const optionsHtml = options.map(opt => 
                `<option value="${opt}" ${opt === selectedValue ? 'selected' : ''}>${opt}</option>`
            ).join('');
            return `
            <div class="form-field">
                <label for="form-${key}">${label}</label>
                <select id="form-${key}" name="${key}">
                    <option value="">-- Select --</option>
                    ${optionsHtml}
                </select>
            </div>`;
        },

        createTagsField: (tags) => {
            tags = tags || {};
            const typeVal = tags.type || '';
            const baseVal = Array.isArray(tags.base_models) ? tags.base_models.join(', ') : (tags.base_models || '');
            const otherVal = Array.isArray(tags.other) ? tags.other.join(', ') : (tags.other || '');
            
            return `<div style="border: 1px solid #555; padding: 10px; margin-bottom: 15px; border-radius: 4px;">
                <label style="display:block; margin-bottom:5px; color:#ccc;">Tags</label>
                ${FormBuilder.createTextField('tags-type', 'Type', typeVal)}
                ${FormBuilder.createTextField('tags-base_models', 'Base Models (comma separated)', baseVal)}
                ${FormBuilder.createTextField('tags-other', 'Other (comma separated)', otherVal)}
            </div>`;
        },

        createModelPicker: (category, label, selectedModels) => {
            const allModels = Object.keys(state.models).sort();
            const options = allModels.map(m => {
                const model = state.models[m];
                const display = model.id ? `${m} (${model.id})` : m;
                return `<option value="${m}">${display}</option>`;
            }).join('');
            
            const selectedHtml = selectedModels.map(m => `
                <div class="selected-model-item" style="background: #444; padding: 2px 5px; margin: 2px; border-radius: 3px; display: inline-block;">
                    ${m} <span class="remove-model-btn" style="cursor:pointer; color:#ff6b6b; margin-left:5px; font-weight:bold;">&times;</span>
                    <input type="hidden" name="components-${category}[]" value="${m}">
                </div>
            `).join('');

            return `
                <div class="form-field-group" style="border: 1px solid #555; padding: 10px; margin-bottom: 10px; border-radius: 4px;">
                    <label style="display:block; margin-bottom:5px; color:#ccc;">${label}</label>
                    <div class="selected-models-list" id="list-${category}" style="margin-bottom: 5px;">
                        ${selectedHtml}
                    </div>
                    <div style="display:flex;">
                        <input type="text" id="input-${category}" list="datalist-${category}" placeholder="Type to search model..." style="flex:1; margin-right:5px; padding: 5px; background: #383838; color: #e0e0e0; border: 1px solid #555;">
                        <datalist id="datalist-${category}">
                            ${options}
                        </datalist>
                        <button type="button" class="add-model-btn" data-category="${category}" style="padding: 5px 10px; background: #008CBA; color: white; border: none; border-radius: 3px; cursor: pointer;">Add</button>
                    </div>
                </div>
            `;
        },

        createSettingsComponentPicker: (settingType, field, label, selectedValues, allComponents) => {
            const options = allComponents.map(c => `<option value="${c}">${c}</option>`).join('');
            
            const selectedHtml = (selectedValues || []).map(v => `
                <div class="selected-model-item" style="background: #444; padding: 2px 5px; margin: 2px; border-radius: 3px; display: inline-block;">
                    ${v} <span class="remove-setting-item-btn" style="cursor:pointer; color:#ff6b6b; margin-left:5px; font-weight:bold;">&times;</span>
                    <input type="hidden" name="${settingType}-${field}[]" value="${v}">
                </div>
            `).join('');

            return `
                <div class="form-field-group" style="border: 1px solid #555; padding: 5px; margin-bottom: 5px; border-radius: 4px;">
                    <label style="display:block; margin-bottom:5px; color:#ccc; font-size: 0.9em;">${label}</label>
                    <div class="selected-settings-list" id="list-${settingType}-${field}" style="margin-bottom: 5px;">
                        ${selectedHtml}
                    </div>
                    <div style="display:flex;">
                        <select id="select-${settingType}-${field}" style="flex:1; margin-right:5px; padding: 5px; background: #383838; color: #e0e0e0; border: 1px solid #555;">
                            <option value="">-- Select --</option>
                            ${options}
                        </select>
                        <button type="button" class="add-setting-item-btn" data-setting="${settingType}" data-field="${field}" style="padding: 5px 10px; background: #008CBA; color: white; border: none; border-radius: 3px; cursor: pointer;">Add</button>
                    </div>
                </div>
            `;
        },

        createSettingsBlock: (settingType, label, data, allComponents) => {
            data = data || {};
            return `
            <div style="border: 1px solid #666; padding: 10px; margin-bottom: 15px; border-radius: 5px; background: #2a2a2a;">
                <h4 style="margin-top:0; margin-bottom:10px; color: #fff; border-bottom: 1px solid #444; padding-bottom: 5px;">${label}</h4>
                ${FormBuilder.createTextField(`${settingType}-name`, 'Name', data.name)}
                ${FormBuilder.createTextField(`${settingType}-steps`, 'Steps', data.steps)}
                ${FormBuilder.createTextField(`${settingType}-cfg`, 'CFG', data.cfg)}
                ${FormBuilder.createSettingsComponentPicker(settingType, 'model', 'Models', data.model, allComponents)}
                ${FormBuilder.createSettingsComponentPicker(settingType, 'lora', 'LoRAs', data.lora, allComponents)}
            </div>`;
        }
    };

    // --- APP Logic ---

    async function openAppModal(index = null) {
        const isNew = index === null;
        currentContext = { index, isNew };
        let item = isNew ? { name: '', url: '', architecture: '', id: '', tags: {} } : state.apps[index];
        let availableApps = [];

        if (isNew) {
            try {
                const response = await fetch('/saus/api/arc-manager/available-apps');
                if (response.ok) {
                    const data = await response.json();
                    const currentUrls = state.apps.map(app => app.url);
                    availableApps = data.apps.filter(url => !currentUrls.includes(url));
                }
            } catch (e) {
                console.error("Error fetching available apps:", e);
            }
        }

        document.getElementById('app-modal-title').textContent = isNew ? 'Add App' : 'Edit App';
        const contentEl = document.getElementById('app-modal-content');
        
        contentEl.innerHTML = renderAppForm(item, isNew, availableApps);
        appModal.style.display = 'block';

        // Attach event handler for app selection
        const appSelect = document.getElementById('app-folder-select');
        if (appSelect) {
            appSelect.addEventListener('change', (e) => {
                const val = e.target.value;
                if (val) {
                    const urlInput = document.getElementById('form-url');
                    const idInput = document.getElementById('form-id');
                    if (urlInput) urlInput.value = val;
                    if (idInput) idInput.value = val.substring(0, 5);
                }
            });
        }

        // Attach event handler for URL input to auto-fill ID
        const urlInput = document.getElementById('form-url');
        if (urlInput) {
            urlInput.addEventListener('input', (e) => {
                const val = e.target.value;
                const idInput = document.getElementById('form-id');
                if (idInput && val) {
                    idInput.value = val.substring(0, 5);
                }
            });
        }
    }

    function renderAppForm(item, isNew, availableApps) {
        let formHtml = '';
        if (isNew && availableApps.length > 0) {
            const options = availableApps.map(app => `<option value="${app}">${app}</option>`).join('');
            formHtml += `
            <div class="form-field" style="margin-bottom: 15px; border-bottom: 1px solid #555; padding-bottom: 15px;">
                <label for="app-folder-select">Select Existing App Folder</label>
                <select id="app-folder-select">
                    <option value="">-- Select Folder --</option>
                    ${options}
                </select>
            </div>`;
        }

        formHtml += FormBuilder.createTextField('name', 'Name', item.name);
        formHtml += FormBuilder.createTextField('url', 'URL', item.url);
        formHtml += FormBuilder.createTextField('id', 'ID', item.id);
        formHtml += FormBuilder.createSelectField('architecture', 'architecture', Object.keys(state.architectures), item.architecture);
        formHtml += FormBuilder.createTagsField(item.tags);

        return formHtml;
    }

    async function saveApp() {
        const form = document.getElementById('app-modal-content');
        const newItem = {};
        const inputs = form.querySelectorAll('input, textarea, select');
        
        inputs.forEach(input => {
            if (!input.name) return;
            if (input.name.startsWith('tags-')) {
                if (!newItem.tags) newItem.tags = {};
                const tagKey = input.name.replace('tags-', '');
                let val = input.value;
                if (tagKey === 'base_models' || tagKey === 'other') {
                    val = val.split(',').map(s => s.trim()).filter(s => s);
                }
                newItem.tags[tagKey] = val;
            } else {
                newItem[input.name] = input.value;
            }
        });

        if (currentContext.isNew) state.apps.push(newItem);
        else state.apps[currentContext.index] = newItem;

        await saveAllData();
        closeModal('app-modal');
    }

    // --- ARCHITECTURE Logic ---

    function openArchModal(key = null) {
        const isNew = key === null;
        currentContext = { key, isNew };
        let item = isNew ? { title: '', description: '', categories: [], components: { compulsory: [], at_least_one: [], optional: [] }, base_settings: {}, turbo_settings: {} } : state.architectures[key];

        document.getElementById('arch-modal-title').textContent = isNew ? 'Add Architecture' : 'Edit Architecture';
        const contentEl = document.getElementById('arch-modal-content');
        contentEl.innerHTML = renderArchForm(item, key, isNew);
        archModal.style.display = 'block';
    }

    function renderArchForm(item, key, isNew) {
        let formHtml = '';
        formHtml += `
            <div class="form-field">
                <label for="form-key">Unique Key</label>
                <input type="text" id="form-key" name="key" value="${key || ''}" ${isNew ? '' : 'disabled'}>
            </div>`;
        
        formHtml += FormBuilder.createTextField('title', 'Title', item.title);
        formHtml += FormBuilder.createTextarea('description', 'Description', item.description);
        
        const catVal = Array.isArray(item.categories) ? item.categories.join(', ') : '';
        formHtml += FormBuilder.createTextField('categories', 'Categories (comma separated)', catVal);

        const comps = item.components || { compulsory: [], at_least_one: [], optional: [] };
        formHtml += FormBuilder.createModelPicker('compulsory', 'Compulsory Components', Array.isArray(comps.compulsory) ? comps.compulsory : []);
        formHtml += FormBuilder.createModelPicker('at_least_one', 'At Least One Component', Array.isArray(comps.at_least_one) ? comps.at_least_one : []);
        formHtml += FormBuilder.createModelPicker('optional', 'Optional Components', Array.isArray(comps.optional) ? comps.optional : []);

        const allArchComponents = [
            ...(Array.isArray(comps.compulsory) ? comps.compulsory : []),
            ...(Array.isArray(comps.at_least_one) ? comps.at_least_one : []),
            ...(Array.isArray(comps.optional) ? comps.optional : [])
        ].sort();

        formHtml += FormBuilder.createSettingsBlock('base_settings', 'Base Settings', item.base_settings, allArchComponents);
        formHtml += FormBuilder.createSettingsBlock('turbo_settings', 'Turbo Settings', item.turbo_settings, allArchComponents);

        return formHtml;
    }

    async function saveArch() {
        const form = document.getElementById('arch-modal-content');
        const newKey = form.querySelector('#form-key').value;
        if (!newKey) { alert("Unique Key is required."); return; }

        const newItem = {};
        const inputs = form.querySelectorAll('input, textarea, select');

        inputs.forEach(input => {
            if (input.name === 'key' || !input.name) return;
            if (input.name.startsWith('components-') || input.name.startsWith('base_settings-') || input.name.startsWith('turbo_settings-')) return;

            if (input.name === 'categories') {
                newItem[input.name] = input.value.split(',').map(s => s.trim()).filter(s => s);
            } else {
                newItem[input.name] = input.value;
            }
        });

        // Components
        const components = { compulsory: [], at_least_one: [], optional: [] };
        form.querySelectorAll('input[name="components-compulsory[]"]').forEach(i => components.compulsory.push(i.value));
        form.querySelectorAll('input[name="components-at_least_one[]"]').forEach(i => components.at_least_one.push(i.value));
        form.querySelectorAll('input[name="components-optional[]"]').forEach(i => components.optional.push(i.value));
        newItem.components = components;

        // Settings
        ['base_settings', 'turbo_settings'].forEach(settingType => {
            const settingObj = {
                name: form.querySelector(`input[name="${settingType}-name"]`)?.value || '',
                steps: form.querySelector(`input[name="${settingType}-steps"]`)?.value || '',
                cfg: form.querySelector(`input[name="${settingType}-cfg"]`)?.value || '',
                model: [],
                lora: []
            };
            form.querySelectorAll(`input[name="${settingType}-model[]"]`).forEach(i => settingObj.model.push(i.value));
            form.querySelectorAll(`input[name="${settingType}-lora[]"]`).forEach(i => settingObj.lora.push(i.value));
            newItem[settingType] = settingObj;
        });

        if (!currentContext.isNew && currentContext.key !== newKey) {
            delete state.architectures[currentContext.key];
        }
        state.architectures[newKey] = newItem;
        
        await saveAllData();
        closeModal('arch-modal');
    }

    // --- MODEL Logic ---

    function openModelModal(key = null) {
        const isNew = key === null;
        currentContext = { key, isNew };
        let item = isNew ? { url_model: '', id: '', name: '', type: '', model_path: '', thumbnail_path: '' } : state.models[key];

        document.getElementById('model-modal-title').textContent = isNew ? 'Add Model' : 'Edit Model';
        const contentEl = document.getElementById('model-modal-content');
        contentEl.innerHTML = renderModelForm(item, key, isNew);
        modelModal.style.display = 'block';

        // Attach event handler for model URL to auto-fill ID
        const urlModelInput = document.getElementById('form-url_model');
        if (urlModelInput) {
            urlModelInput.addEventListener('input', (e) => {
                const val = e.target.value;
                if (val) {
                    try {
                        const filename = val.substring(val.lastIndexOf('/') + 1).split('?')[0];
                        const idInput = document.getElementById('form-id');
                        if (idInput) idInput.value = filename;
                    } catch (err) {
                        console.error("Error parsing URL:", err);
                    }
                }
            });
        }

        // Attach event handler for model Type to auto-fill model_path
        const typeModelInput = document.getElementById('form-type');
        if (typeModelInput) {
            typeModelInput.addEventListener('change', (e) => {
                const val = e.target.value;
                const pathInput = document.getElementById('form-model_path');
                if (pathInput && modelTypePaths[val]) {
                    pathInput.value = modelTypePaths[val];
                }
            });
        }
    }

    function renderModelForm(item, key, isNew) {
        let formHtml = '';
        formHtml += `
            <div class="form-field">
                <label for="form-key">Unique Key</label>
                <input type="text" id="form-key" name="key" value="${key || ''}" ${isNew ? '' : 'disabled'}>
            </div>`;
        
        formHtml += FormBuilder.createTextField('url_model', 'Model URL', item.url_model);
        formHtml += FormBuilder.createTextField('id', 'ID', item.id);
        formHtml += FormBuilder.createTextField('name', 'Name', item.name);
        formHtml += FormBuilder.createSelectField('type', 'Type', Object.keys(modelTypePaths), item.type);
        formHtml += FormBuilder.createTextField('model_path', 'Model Path', item.model_path);
        formHtml += FormBuilder.createTextField('thumbnail_path', 'Thumbnail Path', item.thumbnail_path);

        return formHtml;
    }

    async function saveModel() {
        const form = document.getElementById('model-modal-content');
        const newKey = form.querySelector('#form-key').value;
        if (!newKey) { alert("Unique Key is required."); return; }

        const newItem = {};
        const inputs = form.querySelectorAll('input, textarea, select');
        inputs.forEach(input => {
            if (input.name === 'key' || !input.name) return;
            newItem[input.name] = input.value;
        });

        if (!currentContext.isNew && currentContext.key !== newKey) {
            delete state.models[currentContext.key];
        }
        state.models[newKey] = newItem;

        await saveAllData();
        closeModal('model-modal');
    }

    // --- RELATIONSHIPS Logic ---

    function openRelationshipsModal() {
        const content = document.getElementById('relationships-content');
        
        // 1. Calculate Usage
        const usedArchs = new Set();
        state.apps.forEach(app => {
            if (app.architecture) usedArchs.add(app.architecture);
        });

        const usedModels = new Set();
        Object.values(state.architectures).forEach(arch => {
            const comps = arch.components || {};
            [
                ...(comps.compulsory || []),
                ...(comps.at_least_one || []),
                ...(comps.optional || [])
            ].forEach(m => usedModels.add(m));
            
            ['base_settings', 'turbo_settings'].forEach(st => {
                if (arch[st]) {
                    (arch[st].model || []).forEach(m => usedModels.add(m));
                    (arch[st].lora || []).forEach(m => usedModels.add(m));
                }
            });
        });

        // 2. Find Orphans
        const unusedArchs = Object.keys(state.architectures).filter(k => !usedArchs.has(k));
        const unusedModels = Object.keys(state.models).filter(k => !usedModels.has(k));

        // 3. Render
        let html = '';

        // Unlinked Architectures
        html += `<div class="rel-section">
            <h4>⚠️ Unlinked Architectures (${unusedArchs.length})</h4>
            <div class="orphan-list">
                ${unusedArchs.length > 0 ? unusedArchs.map(k => `<div class="orphan-item">${k}</div>`).join('') : '<span style="color:#888;">All architectures are linked to apps.</span>'}
            </div>
        </div>`;

        // Unlinked Models
        html += `<div class="rel-section">
            <h4>⚠️ Unlinked Models (${unusedModels.length})</h4>
            <div class="orphan-list">
                ${unusedModels.length > 0 ? unusedModels.map(k => `<div class="orphan-item">${k}</div>`).join('') : '<span style="color:#888;">All models are used in architectures.</span>'}
            </div>
        </div>`;

        // App -> Arch Hierarchy
        html += `<div class="rel-section">
            <h4>🔗 App Connections</h4>
            <div style="max-height: 300px; overflow-y: auto;">
                <table style="width:100%; border-collapse: collapse; text-align: left;">
                    <tr style="border-bottom: 1px solid #555; color: #aaa;">
                        <th style="padding: 5px;">App Name</th>
                        <th style="padding: 5px;">Architecture</th>
                        <th style="padding: 5px;">Status</th>
                    </tr>
                    ${state.apps.map(app => {
                        const archExists = state.architectures[app.architecture];
                        return `<tr>
                            <td style="padding: 5px;">${app.name || 'Untitled'}</td>
                            <td style="padding: 5px; color: #008CBA;">${app.architecture || '-'}</td>
                            <td style="padding: 5px;">${archExists ? '<span style="color:green">✔ Linked</span>' : '<span style="color:red">✖ Broken Link</span>'}</td>
                        </tr>`;
                    }).join('')}
                </table>
            </div>
        </div>`;

        content.innerHTML = html;
        relationshipsModal.style.display = 'block';
    }

    // --- Common Modal Logic ---

    function closeModal(modalId) {
        document.getElementById(modalId).style.display = 'none';
    }

    async function handleDelete(type, keyOrIndex) {
        if (!confirm(`Are you sure you want to delete this ${type}?`)) return;

        if (type === 'app') {
            state.apps.splice(keyOrIndex, 1);
        } else {
            delete state[type === 'architecture' ? 'architectures' : 'models'][keyOrIndex];
        }
        await saveAllData();
    }


    // --- Event Listeners ---

    document.querySelectorAll('.close-button').forEach(btn => {
        btn.addEventListener('click', (e) => closeModal(e.target.dataset.target));
    });

    document.getElementById('app-save-btn').addEventListener('click', saveApp);
    document.getElementById('arch-save-btn').addEventListener('click', saveArch);
    document.getElementById('model-save-btn').addEventListener('click', saveModel);
    document.getElementById('relationships-btn').addEventListener('click', openRelationshipsModal);

    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) closeModal(event.target.id);
    });

    document.body.addEventListener('click', (e) => {
        const target = e.target;
        
        // Add buttons
        if (target.matches('.add-button')) {
            const type = target.dataset.type;
            if (type === 'app') openAppModal();
            else if (type === 'architecture') openArchModal();
            else if (type === 'model') openModelModal();
        }
        
        // Edit buttons
        if (target.matches('.edit-button')) {
            const type = target.dataset.type;
            if (type === 'app') openAppModal(target.dataset.index);
            else if (type === 'architecture') openArchModal(target.dataset.key);
            else if (type === 'model') openModelModal(target.dataset.key);
        }

        // Delete buttons
        if(target.matches('.delete-button')) {
            handleDelete(target.dataset.type, target.dataset.key || target.dataset.index);
        }
    });

    // Model Picker Event Delegation
    // We attach to body or a common parent since modals are separate now, or attach to each modal content
    document.body.addEventListener('click', (e) => {
        if (e.target.classList.contains('add-model-btn')) {
            const category = e.target.dataset.category;
            const container = e.target.closest('.modal-content');
            const input = container.querySelector(`#input-${category}`);
            const val = input.value;
            if (val) {
                const list = container.querySelector(`#list-${category}`);
                if (!list.querySelector(`input[value="${val}"]`)) {
                    const div = document.createElement('div');
                    div.className = 'selected-model-item';
                    div.style.cssText = "background: #444; padding: 2px 5px; margin: 2px; border-radius: 3px; display: inline-block;";
                    div.innerHTML = `${val} <span class="remove-model-btn" style="cursor:pointer; color:#ff6b6b; margin-left:5px; font-weight:bold;">&times;</span>
                                     <input type="hidden" name="components-${category}[]" value="${val}">`;
                    list.appendChild(div);
                }
                input.value = '';
            }
        } else if (e.target.classList.contains('remove-model-btn')) {
            e.target.parentElement.remove();
        } else if (e.target.classList.contains('add-setting-item-btn')) {
            const setting = e.target.dataset.setting;
            const field = e.target.dataset.field;
            const container = e.target.closest('.modal-content');
            const select = container.querySelector(`#select-${setting}-${field}`);
            const val = select.value;
            if (val) {
                const list = container.querySelector(`#list-${setting}-${field}`);
                if (!list.querySelector(`input[value="${val}"]`)) {
                    const div = document.createElement('div');
                    div.className = 'selected-model-item';
                    div.style.cssText = "background: #444; padding: 2px 5px; margin: 2px; border-radius: 3px; display: inline-block;";
                    div.innerHTML = `${val} <span class="remove-setting-item-btn" style="cursor:pointer; color:#ff6b6b; margin-left:5px; font-weight:bold;">&times;</span>
                                     <input type="hidden" name="${setting}-${field}[]" value="${val}">`;
                    list.appendChild(div);
                }
                select.value = '';
            }
        } else if (e.target.classList.contains('remove-setting-item-btn')) {
            e.target.parentElement.remove();
        }
    });

    // --- Initial Load ---
    fetchData();
});
