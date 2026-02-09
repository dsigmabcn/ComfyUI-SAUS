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
            const response = await fetch('/saus/api/settings');
            if (response.ok) {
                this.settings = await response.json();
            }
        } catch (e) {
            console.error("Error loading settings:", e);
        }
    }

    async saveSettings(newSettings) {
        try {
            const response = await fetch('/saus/api/settings', {
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

    async syncApps(btn) {
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
        
        try {
            const response = await fetch('/saus/api/sync-apps', { method: 'POST' });
            const result = await response.json();
            if (response.ok) {
                this.showSyncResultModal(
                    "Sync Successful",
                    (result.message || 'Apps synced successfully.') /* + '<br><br>A server restart is required to load the new apps.' */,
                    true
                );
                window.dispatchEvent(new CustomEvent('appsSynced'));
            } else {
                this.showSyncResultModal("Sync Failed", 'Error syncing apps: ' + (result.message || response.statusText), false);
            }
        } catch (e) {
            console.error("Sync error:", e);
            this.showSyncResultModal("Sync Error", "An unexpected error occurred while syncing apps.", false);
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    }

    showSyncResultModal(title, message, isSuccess) {
        const existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        let buttonsHtml = '';
        if (isSuccess) {
            buttonsHtml = `
                <button class="btn-modal-secondary">Close</button>
                <!-- <button class="btn-modal-primary restart-btn" style="background-color: #d32f2f; border-color: #d32f2f;"><i class="fas fa-power-off"></i> Restart Server</button> -->
            `;
        } else {
            buttonsHtml = `
                <button class="btn-modal-primary close-btn">Close</button>
            `;
        }

        overlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    ${buttonsHtml}
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const close = () => overlay.remove();

        const closeBtn = overlay.querySelector('.modal-close');
        if (closeBtn) closeBtn.onclick = close;

        const secondaryBtn = overlay.querySelector('.btn-modal-secondary');
        if (secondaryBtn) secondaryBtn.onclick = close;

        const primaryCloseBtn = overlay.querySelector('.close-btn');
        if (primaryCloseBtn) primaryCloseBtn.onclick = close;
        
        const restartBtn = overlay.querySelector('.restart-btn');
        if (restartBtn) {
            restartBtn.onclick = async () => {
                const originalText = restartBtn.innerHTML;
                restartBtn.disabled = true;
                restartBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restarting...';
                
                try {
                    const response = await fetch('/saus/api/restart', { method: 'POST' });
                    if (response.ok) {
                        alert('Server is restarting. Please refresh the page in a few moments.');
                        close();
                    } else {
                        alert('Failed to trigger restart.');
                        restartBtn.disabled = false;
                        restartBtn.innerHTML = originalText;
                    }
                } catch (e) {
                    console.error("Restart error:", e);
                    alert('Server is restarting (connection lost). Please refresh shortly.');
                    close();
                }
            };
        }
        
        overlay.onclick = (e) => {
            if (e.target === overlay) close();
        };
    }

    async restartServer(btn) {
        this.showConfirmationModal(
            "Restart Server",
            "Are you sure you want to restart the server? This will interrupt any active processes.",
            async () => {
                const originalText = btn.innerHTML;
                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restarting...';
                
                try {
                    const response = await fetch('/saus/api/restart', { method: 'POST' });
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
            },
            'restart'
        );
    }

    showConfirmationModal(title, message, onConfirm, type = 'info') {
        const existing = document.querySelector('.modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        
        let confirmBtnText = 'Confirm';
        let icon = '<i class="fas fa-check"></i>';
        let btnClass = '';

        if (type === 'restart') {
            confirmBtnText = 'Restart';
            icon = '<i class="fas fa-power-off"></i>';
            btnClass = 'delete';
        }

        overlay.innerHTML = `
            <div class="modal-container">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn-modal-secondary">Cancel</button>
                    <button class="btn-modal-primary ${btnClass}">${icon} ${confirmBtnText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closeBtn = overlay.querySelector('.modal-close');
        const cancelBtn = overlay.querySelector('.btn-modal-secondary');
        const confirmBtn = overlay.querySelector('.btn-modal-primary');

        const close = () => overlay.remove();

        closeBtn.onclick = close;
        cancelBtn.onclick = close;
        
        confirmBtn.onclick = () => {
            onConfirm();
            close();
        };
        
        overlay.onclick = (e) => {
            if (e.target === overlay) close();
        };
    }

    render(view) {
        if (!view) return;
        
        const showSyncButton = !!this.settings.saus_token;
        
        view.innerHTML = `
            <div class="settings-content">
                <h1>Settings</h1>
                <p style="color:rgb(255, 0, 0); font-size: 0.9em; margin-bottom: 20px; border: 1px solid rgb(255, 0, 0); padding: 10px; border-radius: 4px; background: rgba(255, 152, 0, 0.1);">
                    <i class="fas fa-exclamation-triangle"></i> <strong>Warning:</strong> The software encrypts your keys locally, but you are responsible for ensuring the security of your system. If you are not comfortable storing them here, please do not save them.
                </p>
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
                        <label for="saus_token">SAUS Token (Private Apps)</label>
                        <input type="password" id="saus_token" value="${this.settings.saus_token || ''}" placeholder="Enter Token">
                    </div>
                    <div class="form-actions" style="margin-top: 20px;">
                        <button id="save-settings-btn" class="btn-action">Save Settings</button>
                    </div>
                    ${showSyncButton ? `
                    <div class="form-actions" style="margin-top: 10px; border-top: 1px dashed #444; padding-top: 10px;">
                        <button id="sync-apps-btn" class="btn-action" style="width: 100%; background-color: var(--color-accent); border-color: var(--color-accent);">
                            <i class="fas fa-sync"></i> Validate SAUS token and Sync Private Apps
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
            const syncBtn = view.querySelector('#sync-apps-btn');
            syncBtn.addEventListener('click', () => this.syncApps(syncBtn));
        }
        
        const restartBtn = view.querySelector('#restart-server-btn');
        restartBtn.addEventListener('click', () => this.restartServer(restartBtn));
    }
}