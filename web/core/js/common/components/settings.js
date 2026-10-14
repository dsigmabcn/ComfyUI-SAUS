import { THEMES, applyTheme, currentTheme } from '../scripts/theme.js';

/* The project links of the Settings pane. The icons are inline SVG that inherit
 * their colour (currentColor), so they follow the theme like everything else. */
const SOCIAL_LINKS = `
    <a href="https://ko-fi.com/koalanation/shop" target="_blank" rel="noopener noreferrer"
       title="Support SAUS on ko-fi" aria-label="Support SAUS on ko-fi">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 504.36 504.36" fill="currentColor" aria-hidden="true">
        <circle cx="252.18" cy="252.18" r="252.18" opacity="0.2" />
        <g>
          <path d="M380.19,276.5A196.26,196.26,0,0,1,352,277.78V185.62h19.2a38.37,38.37,0,0,1,32,15.36,45.65,45.65,0,0,1,10.24,29.44A42.87,42.87,0,0,1,380.19,276.5Zm79.37-64a83.86,83.86,0,0,0-37.13-57.61A98.23,98.23,0,0,0,366.11,137H84.49a16.37,16.37,0,0,0-14.08,15.36v3.84s-1.28,124.17,1.28,192a42.11,42.11,0,0,0,42.24,39.68s129.29,0,190.73-1.28h9c35.84-9,38.4-42.24,38.4-60.16C422.43,329,472.36,279.06,459.56,212.5Z"/>
          <path d="M208.66,334.11c3.84,1.28,5.12,0,5.12,0s44.8-41,65.28-65.29c17.92-21.76,19.2-56.32-11.52-70.4s-56.32,15.36-56.32,15.36a50.44,50.44,0,0,0-70.41-7.68l-1.28,1.28c-15.36,16.64-10.24,44.8,1.28,60.16a771.87,771.87,0,0,0,65.29,64Z"/>
        </g>
      </svg>
    </a>
    <a href="https://github.com/dsigmabcn/ComfyUI-SAUS" target="_blank" rel="noopener noreferrer"
       title="SAUS on GitHub" aria-label="SAUS on GitHub">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" fill="currentColor"/>
      </svg>
    </a>
    <a href="https://www.youtube.com/@koalanation" target="_blank" rel="noopener noreferrer"
       title="SAUS on YouTube" aria-label="SAUS on YouTube">
      <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 640 640" fill="currentColor" aria-hidden="true">
        <path d="M633.468 192.038s-6.248-44.115-25.477-63.485c-24.366-25.477-51.65-25.642-64.123-27.118-89.493-6.52-223.904-6.52-223.904-6.52h-.236s-134.352 0-223.893 6.52c-12.52 1.523-39.768 1.63-64.123 27.118-19.24 19.37-25.358 63.485-25.358 63.485S-.012 243.806-.012 295.681v48.509c0 51.768 6.366 103.643 6.366 103.643s6.248 44.114 25.358 63.52c24.355 25.477 56.363 24.65 70.655 27.367 51.237 4.89 217.644 6.366 217.644 6.366s134.529-.237 224.022-6.638c12.52-1.477 39.756-1.63 64.123-27.119 19.24-19.37 25.476-63.532 25.476-63.532S640 396.03 640 344.154v-48.508c-.13-51.769-6.497-103.643-6.497-103.643l-.035.035zm-379.8 211.007V223.173L426.56 313.41l-172.892 89.635z" />
      </svg>
    </a>
`;

export class SettingsComponent {
    constructor(containerSelector) {
        this.containerSelector = containerSelector;
        this.container = document.querySelector(containerSelector);
        this.settings = {};
        this.version = null;        // read once from /saus/api/saus-version
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
                background-color: var(--color-surface);
                color: var(--color-primary-text);
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
                background-color: var(--color-success);
                color: var(--color-text-on-accent);
            }
            .saus-toast.toast-error {
                background-color: var(--color-danger);
                color: var(--color-text-on-accent);
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

        this.injectSettingsStyles();

        const current = currentTheme();

        view.innerHTML = `
            <div class="settings-content">
                <h1>Settings</h1>
                <div class="settings-form">
                    <section class="settings-section">
                        <h2>Theme</h2>
                        <p class="settings-hint">Used by the app browser, the apps and the File Manager.</p>
                        <div class="theme-options">
                            ${THEMES.map((theme) => `
                                <button type="button" class="theme-option${theme.id === current ? ' active' : ''}"
                                        data-theme-id="${theme.id}" title="${theme.hint}">
                                    <span class="theme-swatch theme-swatch-${theme.id}"></span>
                                    <span class="theme-option-text">
                                        <span class="theme-option-name">${theme.label}</span>
                                        <span class="theme-option-hint">${theme.hint}</span>
                                    </span>
                                </button>`).join('')}
                        </div>
                    </section>
                    <section class="settings-section">
                        <h2>Version</h2>
                        <p class="settings-version">Installed version:
                            <strong id="saus-version">${this.version || '…'}</strong></p>
                    </section>
                    <section class="settings-section">
                        <h2>Social</h2>
                        <div class="settings-social">${SOCIAL_LINKS}</div>
                    </section>
                    <div class="form-actions" style="margin-top: 20px;">
                        <button id="restart-server-btn" class="btn-action settings-danger">
                            <i class="fas fa-power-off"></i> Restart Server
                        </button>
                    </div>
                </div>
            </div>
        `;

        view.querySelectorAll('.theme-option').forEach((button) => {
            button.addEventListener('click', () => {
                if (!applyTheme(button.dataset.themeId)) return;

                view.querySelectorAll('.theme-option').forEach((option) => {
                    option.classList.toggle('active', option === button);
                });
                this.showToast(`Theme: ${button.querySelector('.theme-option-name').textContent}`,
                    'success', 1500);
            });
        });

        const restartBtn = view.querySelector('#restart-server-btn');
        restartBtn.addEventListener('click', () => this.restartServer(restartBtn));

        this.loadVersion(view);
    }

    /** The installed version, read once and then cached: the pane re-renders. */
    async loadVersion(view) {
        const target = view.querySelector('#saus-version');
        if (!target) return;

        if (this.version) {
            target.textContent = this.version;
            return;
        }

        try {
            const response = await fetch('/saus/api/saus-version');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.version = data.version || 'unknown';
        } catch (error) {
            console.error('Could not read the SAUS version:', error);
            this.version = 'unknown';
        }

        target.textContent = this.version;
    }

    /**
     * Styles for the settings UI itself. Injected rather than expected from the
     * host page: this component is used by the app browser *and* by the File
     * Manager, and both must look the same without duplicating rules.
     */
    injectSettingsStyles() {
        if (document.getElementById('saus-settings-styles')) return;

        const style = document.createElement('style');
        style.id = 'saus-settings-styles';
        style.innerHTML = `
            .settings-section { margin-bottom: 22px; }
            .settings-hint {
                margin: 4px 0 12px;
                color: var(--color-text-muted);
                font-size: 0.85em;
            }
            .theme-options { display: flex; flex-wrap: wrap; gap: 10px; }
            .theme-option {
                display: flex;
                align-items: center;
                gap: 10px;
                flex: 1 1 150px;
                min-width: 0;
                padding: 10px 12px;
                background-color: var(--color-surface);
                color: var(--color-primary-text);
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                cursor: pointer;
                text-align: left;
                transition: border-color 0.15s ease, background-color 0.15s ease;
            }
            .theme-option:hover { border-color: var(--color-accent); }
            .theme-option.active {
                border-color: var(--color-accent);
                box-shadow: inset 0 0 0 1px var(--color-accent);
            }
            .theme-option-text { display: flex; flex-direction: column; min-width: 0; }
            .theme-option-name { font-weight: 600; }
            .theme-option-hint {
                color: var(--color-text-muted);
                font-size: 0.8em;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
            /* One swatch per theme: a sample of that theme, so the literal
               colours here are the point, not a themeable value. */
            .theme-swatch {
                flex: 0 0 auto;
                width: 26px;
                height: 26px;
                border-radius: 6px;
                border: 1px solid rgba(127, 127, 127, 0.45);
            }
            .theme-swatch-night { background: linear-gradient(135deg, #14171c 55%, #e7eaee 55%); }
            .theme-swatch-day { background: linear-gradient(135deg, #f4f6f9 55%, #1b2430 55%); }
            .theme-swatch-fire { background: linear-gradient(135deg, #0b1622 55%, #ff4500 55%); }
            .settings-danger {
                width: 100%;
                background-color: var(--color-danger-strong);
                border-color: var(--color-danger-strong);
                color: var(--color-text-on-accent);
            }
            .settings-version {
                margin: 0;
                color: var(--color-text-muted);
                font-size: 0.9em;
            }
            .settings-version strong { color: var(--color-primary-text); }
            .settings-social { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
            .settings-social a {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 42px;
                height: 42px;
                border: 1px solid var(--color-border);
                border-radius: var(--border-radius);
                background-color: var(--color-surface);
                color: var(--color-social-icons);
                transition: color 0.15s ease, border-color 0.15s ease, background-color 0.15s ease;
            }
            .settings-social a:hover,
            .settings-social a:focus-visible {
                color: var(--color-accent);
                border-color: var(--color-accent);
                background-color: var(--color-surface-hover);
            }
        `;
        document.head.appendChild(style);
    }
}