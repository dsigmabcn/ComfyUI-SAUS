export class SettingsComponent {
    constructor(containerSelector) {
        this.containerSelector = containerSelector;
        this.container = document.querySelector(containerSelector);
        this.settings = {};
    }

    async show() {
        if (!this.container) {
            this.container = document.querySelector(this.containerSelector);
        }
        if (!this.container) return;

        let view = document.getElementById('settings-view');
        if (!view) {
            view = document.createElement('div');
            view.id = 'settings-view';
            view.className = 'settings-container';
            this.container.appendChild(view);
        }
        
        view.style.display = 'block';
        
        await this.loadSettings();
        this.render(view);
    }

    hide() {
        const view = document.getElementById('settings-view');
        if (view) {
            view.style.display = 'none';
        }
    }

    async loadSettings() {
        try {
            const response = await fetch('/flow/api/settings');
            if (response.ok) {
                this.settings = await response.json();
            }
        } catch (e) {
            console.error("Error loading settings:", e);
        }
    }

    async saveSettings(newSettings) {
        try {
            const response = await fetch('/flow/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSettings)
            });
            if (response.ok) {
                alert('Settings saved successfully.');
                await this.loadSettings();
                this.render(document.getElementById('settings-view'));
            } else {
                alert('Failed to save settings.');
            }
        } catch (e) {
            console.error("Error saving settings:", e);
            alert('Error saving settings.');
        }
    }

    async syncFlows(btn) {
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        
        try {
            const response = await fetch('/flow/api/sync-flows', { method: 'POST' });
            const result = await response.json();
            if (response.ok) {
                alert(result.message || 'Flows synced successfully.');
                window.dispatchEvent(new CustomEvent('flowsSynced'));
            } else {
                alert('Error syncing flows: ' + (result.message || response.statusText));
            }
        } catch (e) {
            console.error("Sync error:", e);
            alert('Error syncing flows.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    async restartServer(btn) {
        if (!confirm("Are you sure you want to restart the server?")) return;
        
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restarting...';
        
        try {
            const response = await fetch('/flow/api/restart', { method: 'POST' });
            if (response.ok) {
                alert('Server is restarting. Please refresh the page in a few moments.');
            } else {
                alert('Failed to trigger restart.');
            }
        } catch (e) {
            console.error("Restart error:", e);
            alert('Server is restarting (connection lost). Please refresh shortly.');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    render(view) {
        if (!view) return;
        
        const showSyncButton = !!this.settings.saus_token;
        
        view.innerHTML = `
            <div class="settings-content">
                <h1>Settings</h1>
                <div class="settings-form">
                    <div class="form-group">
                        <label for="civitai_api_key">Civitai API Key</label>
                        <input type="password" id="civitai_api_key" value="${this.settings.civitai_api_key || ''}" placeholder="Enter API Key">
                    </div>
                    <div class="form-group">
                        <label for="huggingface_api_key">Hugging Face API Key</label>
                        <input type="password" id="huggingface_api_key" value="${this.settings.huggingface_api_key || ''}" placeholder="Enter API Key">
                    </div>
                    <div class="form-group">
                        <label for="saus_token">SAUS Token (Private Flows)</label>
                        <input type="password" id="saus_token" value="${this.settings.saus_token || ''}" placeholder="Enter Token">
                    </div>
                    <div class="form-actions" style="margin-top: 20px;">
                        <button id="save-settings-btn" class="btn-action">Save Settings</button>
                    </div>
                    ${showSyncButton ? `
                    <div class="form-actions" style="margin-top: 10px; border-top: 1px dashed #444; padding-top: 10px;">
                        <button id="sync-flows-btn" class="btn-action" style="width: 100%; background-color: var(--color-accent); border-color: var(--color-accent);">
                            <i class="fas fa-sync"></i> Sync Private Flows
                        </button>
                    </div>
                    ` : ''}
                    <div class="form-actions" style="margin-top: 10px; border-top: 1px dashed #444; padding-top: 10px;">
                        <button id="restart-server-btn" class="btn-action" style="width: 100%; background-color: #d32f2f; border-color: #d32f2f; color: white;">
                            <i class="fas fa-power-off"></i> Restart Server
                        </button>
                    </div>
                </div>
            </div>
        `;

        const saveBtn = view.querySelector('#save-settings-btn');
        saveBtn.addEventListener('click', () => {
            const newSettings = {
                civitai_api_key: view.querySelector('#civitai_api_key').value,
                huggingface_api_key: view.querySelector('#huggingface_api_key').value,
                saus_token: view.querySelector('#saus_token').value
            };
            this.saveSettings(newSettings);
        });

        if (showSyncButton) {
            const syncBtn = view.querySelector('#sync-flows-btn');
            syncBtn.addEventListener('click', () => this.syncFlows(syncBtn));
        }
        
        const restartBtn = view.querySelector('#restart-server-btn');
        restartBtn.addEventListener('click', () => this.restartServer(restartBtn));
    }
}