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
        
        this.render(view);
    }

    hide() {
        const view = document.getElementById('settings-view');
        if (view) {
            view.style.display = 'none';
        }
    }

    showToast(message, type = 'info', duration = 3000) {
        this.injectToastStyles();

        const toast = document.createElement('div');
        toast.className = `saus-toast toast-${type}`;
        
        let icon = '';
        if (type === 'success') {
            icon = '<i class="fas fa-check-circle"></i> ';
        } else if (type === 'error') {
            icon = '<i class="fas fa-times-circle"></i> ';
        }

        toast.innerHTML = icon + message;

        document.body.appendChild(toast);

        // Animate in
        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        // Animate out and remove
        setTimeout(() => {
            toast.classList.remove('show');
            toast.addEventListener('transitionend', () => toast.remove());
        }, duration);
    }

    injectToastStyles() {
        if (document.getElementById('saus-toast-styles')) return;

        const style = document.createElement('style');
        style.id = 'saus-toast-styles';
        style.innerHTML = `
            .saus-toast {
                position: fixed;
                top: 20px;
                right: 20px;
                background-color: #333;
                color: white;
                padding: 15px 20px;
                border-radius: 5px;
                z-index: 10000;
                opacity: 0;
                transform: translateY(-20px);
                transition: opacity 0.3s ease, transform 0.3s ease;
                box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                font-family: sans-serif;
                font-size: 1em;
                display: flex;
                align-items: center;
            }
            .saus-toast.show {
                opacity: 1;
                transform: translateY(0);
            }
            .saus-toast.toast-success {
                background-color: #28a745;
                color: white;
            }
            .saus-toast.toast-error {
                background-color: #dc3545;
                color: white;
            }
            .saus-toast i {
                margin-right: 8px;
            }
        `;
        document.head.appendChild(style);
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
                    const response = await fetch('/saus/api/restart', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ confirm: true })
                    });
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

        view.innerHTML = `
            <div class="settings-content">
                <h1>Settings</h1>
                <div class="settings-form">
                    <div class="form-actions" style="margin-top: 20px;">
                        <button id="restart-server-btn" class="btn-action" style="width: 100%; background-color: #d32f2f; border-color: #d32f2f; color: white;">
                            <i class="fas fa-power-off"></i> Restart Server
                        </button>
                    </div>
                </div>
            </div>
        `;

        const restartBtn = view.querySelector('#restart-server-btn');
        restartBtn.addEventListener('click', () => this.restartServer(restartBtn));
    }
}