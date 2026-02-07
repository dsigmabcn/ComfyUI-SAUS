export async function getVersion() {
    try {
        const response = await fetch('/saus/api/saus-version');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const versionData = await response.json();
        return versionData.version; 
    } catch (error) {
        console.error('Error fetching version:', error);
        throw error; 
    }
}

export async function showVersion() {
    const currentVersion = await getVersion();
    const copyrightEl = document.getElementById('copyright');
    if (copyrightEl) copyrightEl.innerText = currentVersion;
}

function isNewerVersion(current, latest) {
    const currentParts = current.split('.').map(Number);
    const latestParts = latest.split('.').map(Number);
    for (let i = 0; i < Math.max(currentParts.length, latestParts.length); i++) {
        const curr = currentParts[i] || 0;
        const lat = latestParts[i] || 0;
        if (lat > curr) return true;
        if (lat < curr) return false;
    }
    return false;
}

function createFloatingCharacter(currentVersion) {
    const floatingHTML = `
        <div class="floating-update-character">
            <img src="/core/media/ui/update_logo.png" alt="Update Character" />
            <div class="update-indicator">
                <span class="update-dot"></span>
                <span class="version-label">${currentVersion}</span>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', floatingHTML);

    const floatingCharacter = document.querySelector('.floating-update-character');
    return floatingCharacter;
}

function showUpdateDialog(currentVersion, latestVersion) {
    const dialogHTML = `
        <div class="update-dialog-overlay">
            <div class="update-dialog-container">
                <div class="update-character">
                    <img src="/core/media/ui/update_logo.png" alt="Update Avatar" />
                </div>
                <div class="update-dialog">
                    <div class="update-content">
                        <h2>New Update Available!</h2>
                        <p>Version ${latestVersion} is ready to install</p>
                        <p class="version-info">Current version: ${currentVersion}</p>
                        
                        <div class="update-actions">
                            <button class="update-now-btn">
                                <span class="btn-text">Send me to ComfyUI to Update Now</span>
                                <span class="btn-icon">→</span>
                            </button>
                            <button class="remind-later-btn">Later</button>
                        </div>
                    </div>
                </div>
                <button class="close-dialog-btn" aria-label="Close">&times;</button>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    const overlay = document.querySelector('.update-dialog-overlay');
    const updateNowBtn = document.querySelector('.update-now-btn');
    const remindLaterBtn = document.querySelector('.remind-later-btn');
    const closeBtn = document.querySelector('.close-dialog-btn');

    function closeDialog() {
        overlay.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => overlay.remove(), 300); 
    }

    updateNowBtn.addEventListener('click', () => {
        const origin = window.location.origin;
        const urlToOpen = `${origin}`;
        window.open(urlToOpen, '_blank');
        closeDialog();
        setFloatingCharacter(currentVersion, latestVersion)
    });

    remindLaterBtn.addEventListener('click', () => {
        closeDialog();
        setFloatingCharacter(currentVersion, latestVersion)
    });

    closeBtn.addEventListener('click', () => {
        closeDialog();
        setFloatingCharacter(currentVersion, latestVersion)
    });
}

function setFloatingCharacter(currentVersion, latestVersion) {
    if (isNewerVersion(currentVersion, latestVersion)) {
        if (!document.querySelector('.floating-update-character')) {
            const floatingCharacter = createFloatingCharacter(`New Update Available!`);
            
            floatingCharacter.addEventListener('click', () => {
                floatingCharacter.style.animation = 'moveUp  0.3s ease-out forwards';
                setTimeout(() => {
                    showUpdateDialog(currentVersion, latestVersion);
                    floatingCharacter.remove();
                }, 300);
            });
        }
    }
}

export async function checkForUpdate() {
    try {
        const currentVersion = await getVersion();
        const rawURL = 'https://raw.githubusercontent.com/dsigmabcn/ComfyUI-SAUS/refs/heads/main/pyproject.toml';
        
        const response = await fetch(rawURL);
        if (!response.ok) {
            throw new Error(`Failed to fetch version info. HTTP status: ${response.status}`);
        }

        const tomlText = await response.text();
        const versionMatch = tomlText.match(/^version\s*=\s*"([^"]+)"/m);
        
        if (!versionMatch || versionMatch.length < 2) {
            throw new Error('Version information not found in pyproject.toml.');
        }

        const latestVersion = versionMatch[1];
        setFloatingCharacter(currentVersion, latestVersion)

    } catch (error) {
        console.error('Error checking for updates:', error);
    }
}