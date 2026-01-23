import { SettingsComponent } from '../../../core/js/common/components/settings.js';

let settingsComponent = null;

document.addEventListener('DOMContentLoaded', () => {    
    displayDirectory('output', 'file-explorer');
    
    setTimeout(() => {
        const appNameElement = document.querySelector('.appName');
        if (appNameElement) {
            appNameElement.innerHTML = '<h2>File Manager</h2>';
        }
    }, 500);

    // Initialize Token UI
    initTokenUI();

    // Initialize Settings
    initializeSettings();

    // Initialize WebSocket for Progress
    setupWebSocket();
});

async function initTokenUI() {
    const tokenSourceSelect = document.getElementById('token-source');
    const tokenInput = document.getElementById('download-token');
    
    if (!tokenSourceSelect || !tokenInput) return;

    // Fetch settings to check for stored tokens
    try {
        const response = await fetch('/flow/api/settings');
        if (response.ok) {
            const settings = await response.json();
            
            if (settings.civitai_api_key) {
                const option = document.createElement('option');
                option.value = 'civitai';
                option.textContent = 'Stored Civitai Token';
                tokenSourceSelect.appendChild(option);
            }
            
            if (settings.huggingface_api_key) {
                const option = document.createElement('option');
                option.value = 'huggingface';
                option.textContent = 'Stored Hugging Face Token';
                tokenSourceSelect.appendChild(option);
            }
        }
    } catch (e) {
        console.error("Error fetching settings for token UI:", e);
    }

    tokenSourceSelect.addEventListener('change', () => {
        if (tokenSourceSelect.value === 'custom') {
            tokenInput.classList.remove('hidden-initial');
            tokenInput.style.display = 'block';
        } else {
            tokenInput.classList.add('hidden-initial');
            tokenInput.style.display = 'none';
        }
    });
}

function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    console.log(`[File Manager] Connecting to WebSocket: ${wsUrl}`);

    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'file_download_progress') {
                const { filename, progress } = msg.data;
                //console.log(`[WS] Progress for ${filename}: ${progress}%`);
                updateDownloadProgress(progress, `Downloading ${filename}...`);
            } else if (msg.type === 'file_download_complete') {
                const { filename } = msg.data;
                console.log(`[WS] Complete: ${filename}`);
                finishDownload(filename);
            } else if (msg.type === 'file_download_error') {
                console.error(`[WS] Error:`, msg.data);
                alert(`Download error: ${msg.data.error}`);
                resetDownloadUI();
            }
        } catch (e) {
            console.error("[WS] Error parsing message", e);
        }
    };

    ws.onclose = () => {
        console.warn("[File Manager] WebSocket closed. Reconnecting in 5s...");
        setTimeout(setupWebSocket, 5000);
    };
}

function updateDownloadProgress(percent, text) {
    const progressBar = document.getElementById('download-progress-bar');
    const progressText = document.getElementById('download-progress-text');
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${percent}%`;
    
    const statusDiv = document.getElementById('download-status');
    if (statusDiv && text) statusDiv.textContent = text;
}

function finishDownload(filename) {
    updateDownloadProgress(100);
    const statusDiv = document.getElementById('download-status');
    if (statusDiv) statusDiv.textContent = `Successfully downloaded: ${filename}`;
    
    setTimeout(() => {
        window.closeModal();
        displayDirectory(currentDirectory);
        resetDownloadUI();
    }, 1500);
}

function resetDownloadUI() {
    const progressContainer = document.getElementById('download-progress-container');
    const progressBar = document.getElementById('download-progress-bar');
    const progressText = document.getElementById('download-progress-text');
    const button = document.getElementById('download-button');
    const statusDiv = document.getElementById('download-status');

    if (progressBar) progressBar.style.width = '0%';
    if (progressText) progressText.textContent = '';
    if (progressContainer) {
        progressContainer.style.display = 'none';
        progressContainer.classList.add('hidden-initial');
    }
    if (button) {
        button.disabled = false;
        button.style.display = 'block';
    }
    if (statusDiv) statusDiv.textContent = '';
}

let currentDirectory = 'output'; // sets initial drectory

function loadManagerApp() {
    // Code to load the Manager app into the content area
    const content = document.querySelector('.content');
    content.innerHTML = '<div id="manager-app">Manager App Loaded</div>';
    // Add additional logic to initialize the Manager app
}

window.loadDownloadApp = function () {
    /* Show the modal instead of replacing the content*/
    document.getElementById('download-modal').classList.remove('hidden');
};

window.closeModal = function () {
    document.getElementById('download-modal').classList.add('hidden');
};

window.startDownload = async function () {
    const url = document.getElementById('download-url').value;
    const tokenSourceSelect = document.getElementById('token-source');
    const tokenInput = document.getElementById('download-token');
    
    const tokenSource = tokenSourceSelect ? tokenSourceSelect.value : 'none';
    let apiToken = '';
    
    if (tokenSource === 'custom' && tokenInput) {
        apiToken = tokenInput.value.trim();
    }
    
    const button = document.getElementById('download-button');

    const progressContainer = document.getElementById('download-progress-container');
    const progressBar = document.getElementById('download-progress-bar');
    const progressText = document.getElementById('download-progress-text');
    const progressLabel = document.getElementById('download-progress-label');
    const statusDiv = document.getElementById('download-status');

    if (!url) {
        alert("Please enter a URL.");
        return;
    }

    console.log(`[Download] Starting download for URL: ${url}`);

    // UI: Start progress
    if (progressContainer) {
        progressContainer.classList.remove('hidden-initial');
        progressContainer.style.display = 'block';
    }
    progressBar.style.width = '0%';
    progressText.textContent = '';
    progressLabel.style.display = 'block';
    if (statusDiv) statusDiv.textContent = "Initiating download...";
    
    button.disabled = true;
    button.style.display = 'none';

    try {
        const response = await fetch('/flow/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, targetPath: currentDirectory, apiToken, tokenSource })
        });

        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
        }
        
        console.log("[Download] Server accepted request. Waiting for WebSocket updates...");
        if (statusDiv) statusDiv.textContent = "Download started on server...";
        
        // We do NOT close the modal here. We wait for WS 'file_download_complete'.

    } catch (error) {
        console.error("Download error:", error);
        alert("Failed to start download.");
        resetDownloadUI();
    }
};


/* Function to workaround issues with uploading large files - connection timeout problem*/

window.handleChunkedUpload = function (file) {
    const CHUNK_SIZE = 1024 * 1024 * 20; // 5 MB chunks
    let start = 0;
    let end = CHUNK_SIZE;
    let chunkCount = 0;
    // 💥 ADDED: Record the start time 
    const startTime = Date.now(); 

    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const fileId = file.name + '-' + file.size + '-' + Date.now(); 

    const sendChunk = async () => {
        if (start < file.size) {
            const chunk = file.slice(start, end);
            const formData = new FormData();

            formData.append('fileChunk', chunk);
            formData.append('fileName', file.name);
            formData.append('fileId', fileId);          // Unique ID for assembly
            formData.append('targetPath', currentDirectory);
            formData.append('isLast', end >= file.size);
            formData.append('chunkIndex', chunkCount);
            
            // Use fetch for simpler async control flow
            const response = await fetch('/flow/api/upload-chunk', {
                method: 'POST',
                body: formData 
            });

            if (!response.ok) {
                // Handle failure (maybe retry or alert user)
                alert(`Upload failed at chunk ${chunkCount}.`);
                return;
            }

            // 💥 WHERE TO UPDATE PROGRESS BAR 💥
            // Calculate the percentage based on how many bytes have started uploading (the 'end' position)
            const uploadedBytes = Math.min(end, file.size);
            const percent = Math.floor((uploadedBytes / file.size) * 100);
            

            progressBar.style.width = `${percent}%`;
            progressText.textContent = `${percent}% (Chunk ${chunkCount + 1} of ${totalChunks})`;
            //progressText.textContent = `${percent}%`;

            // ------------------------------------
            // 💥 ADDED DEBUG LOG 💥
            const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[DEBUG UPLOAD] Chunk ${chunkCount + 1}/${totalChunks} | ${percent}% | Time: ${elapsedTime}s`);
            // -
            
            // ------------------------------------
            await new Promise(resolve => setTimeout(resolve, 50)); 

            // Move to the next chunk
            start = end;
            end = start + CHUNK_SIZE;
            chunkCount++;
            
            // Recursively send the next chunk
            await sendChunk(); 
        } else {
            // All chunks sent successfully
            alert("Chunked Upload successful!");
            displayDirectory(currentDirectory);
        }
    };

    sendChunk();
};

// You'd call this from window.handleFileUpload instead of the XHR method.
window.handleFileUpload = function () {
    const fileInput = document.getElementById('hidden-upload');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');

    if (fileInput.files.length) {
        // 💥 ADDED: Make the progress UI visible and reset it 💥
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        
        window.handleChunkedUpload(fileInput.files[0]);
    }
};


/*function for uploading files - OLD VERSION*/
window.triggerFileUpload = function () {
    document.getElementById('hidden-upload').click();
};

/*functions for the navigation of folders */

async function loadDirectory(path) {
    try {
        const response = await fetch(`/flow/api/directory?path=${encodeURIComponent(path)}`);
        if (!response.ok) {
            throw new Error(`Failed to load directory: ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error("Error loading directory:", error);
        return [];
    }
}

//async function displayDirectory(path, explorerId = 'file-explorer') {
window.displayDirectory = async function displayDirectory(path, explorerId = 'file-explorer') {
     // Get the title element
    const titleElement = document.getElementById('current-path-title');

    // Update the title with the new path
    if (titleElement) {
        titleElement.textContent = '' + path;
    }   

    // Ensure settings are hidden and explorer is shown
    const midCol = document.querySelector('.mid-col');
    if (settingsComponent) settingsComponent.hide();
    if (midCol) midCol.classList.remove('hidden');
    
    
    
    
    currentDirectory = path;
    const explorer = document.getElementById(explorerId);
    if (!explorer) {
        console.warn(`Explorer element with ID "${explorerId}" not found.`);
        return;
    }
    explorer.innerHTML = ''; /* Clear current contents*/


    // Add "Go Up" link if not at root
    const rootPath = '.';
    if (path !== rootPath) {
        let parentPath = path.substring(0, path.lastIndexOf('/'));
        if (!parentPath) parentPath = '.';

        const upItem = document.createElement('div');
        upItem.className = 'file-item up';

        // Create a span for the name and icon (like other items)
        const nameSpan = document.createElement('span');
        nameSpan.className = 'file-name';
        nameSpan.style.display = 'flex';
        nameSpan.style.alignItems = 'center';
        nameSpan.style.gap = 'center';

        // Add the icon inside the name span
        const upIcon = document.createElement('i');
        upIcon.className = 'fas fa-arrow-up';
        upIcon.title = 'Go Up';
        upIcon.style.marginRight = '6px'; // tighter spacing


        const upLabel = document.createElement('span');
        upLabel.textContent = 'Go Up';

        nameSpan.appendChild(upIcon);
        nameSpan.appendChild(upLabel);

        upItem.appendChild(nameSpan);
        upItem.onclick = () => displayDirectory(parentPath, explorerId);
        explorer.appendChild(upItem);

    }

    const directory = await loadDirectory(path);
    
    //directory.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    // The following sorts first folders, then files
    directory.sort((a, b) => {
    
    if (a.type === 'folder' && b.type !== 'folder') {
        return -1; // Place 'a' (folder) before 'b' (file)
    }
    
    if (a.type !== 'folder' && b.type === 'folder') {
        return 1; // Place 'a' (file) after 'b' (folder)
    }
    // If both are the same type (both folders or both files), sort them alphabetically by name
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });


    directory.forEach(item => {
        const fileItem = createFileItem(item.name, item.type, `${path}/${item.name}`, explorerId);
        explorer.appendChild(fileItem);
    });
}

function createFileItem(name, type, path) {
    const item = document.createElement('div');
    item.className = `file-item ${type}`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';

    if (type === 'folder') {
        const icon = document.createElement('i');
        icon.className = 'fas fa-folder';
        icon.style.marginRight = '8px';
        nameSpan.appendChild(icon);
    }
    nameSpan.appendChild(document.createTextNode(name));

    /*nameSpan.onclick = () => {
        if (type === 'folder') {
            displayDirectory(path);
        }*/
    // MODIFIED ONCLICK LOGIC HERE to show the preview panel
    nameSpan.onclick = () => {
        if (type === 'folder') {
            displayDirectory(path);
            
            // Hide preview when navigating into a folder
            document.getElementById('preview-col').classList.add('hidden');
            document.getElementById('preview-content').innerHTML = '';
            
        } else if (type === 'file') {
            // New: Show preview for files
            window.showPreview(path, type, name);
        }


    };

    const actions = document.createElement('span');
    actions.className = 'file-actions';

    if (type === 'file') {
        // Rename button
        const renameBtn = document.createElement('button');
        renameBtn.innerHTML = '<i class="fas fa-pen"></i>';
        renameBtn.title = 'Rename';
        renameBtn.onclick = async (e) => {
            e.stopPropagation();
            const newName = prompt("Enter new name:", name);
            if (newName && newName !== name) {
                await renameFile(path, newName);
            }
        };
        // Download link
        const downloadLink = document.createElement('a');
        //downloadLink.href = path;
        downloadLink.href = `/flow/api/download-file?filePath=${encodeURIComponent(path)}`;
        downloadLink.download = name; // tells the browser to download instead of open
        downloadLink.innerHTML = '<i class="fas fa-download"></i>';
        downloadLink.title = 'Download';

        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
        deleteBtn.title = 'Delete';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete "${name}"?`)) {
                await deleteFile(path);
            }
        };

        actions.appendChild(renameBtn);
        actions.appendChild(downloadLink);
        actions.appendChild(deleteBtn);
    }

    const nameAndActions = document.createElement('div');
    nameAndActions.style.display = 'flex';
    nameAndActions.style.alignItems = 'center';
    nameAndActions.style.gap = '8px';
    nameAndActions.appendChild(nameSpan);
    nameAndActions.appendChild(actions);
    item.appendChild(nameAndActions);


    return item;
}


function initializeSettings() {
    settingsComponent = new SettingsComponent('.content');

    // Handle Settings Link (Delegation since header is injected)
    document.addEventListener('click', (event) => {
        const target = event.target.closest('a');
        if (target && (target.id === 'settingsLink' || target.getAttribute('href') === '#settings')) {
            event.preventDefault();
            showSettings();
        }
    });
}

async function showSettings() {
    const midCol = document.querySelector('.mid-col');
    const previewCol = document.getElementById('preview-col');

    if (midCol) midCol.classList.add('hidden');
    if (previewCol) {
        previewCol.classList.add('hidden');
        previewCol.style.flex = '0';
    }
    
    if (settingsComponent) settingsComponent.show();
}

async function renameFile(currentPath, newName) {
    try {
        const response = await fetch('/flow/api/rename-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ currentPath, newName })
        });
        if (!response.ok) {
            throw new Error(`Rename failed: ${response.statusText}`);
        }
        await displayDirectory(currentDirectory);
    } catch (error) {
        console.error("Rename error:", error);
        alert("Failed to rename file.");
    }
}

async function deleteFile(filePath) {
    try {
        const response = await fetch('/flow/api/delete-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath })
        });
        if (!response.ok) {
            throw new Error(`Delete failed: ${response.statusText}`);
        }
        await displayDirectory(currentDirectory);
    } catch (error) {
        console.error("Delete error:", error);
        alert("Failed to delete file.");
    }
};


import { insertElement } from '../../../core/js/common/components/header.js';
import '../../../core/js/common/components/footer.js';
/// FUNCTION TO SHOW PREVIEWS IN THE RIGHT PANEL //////////////
window.showPreview = function(path, type, fileName) {
    const previewCol = document.getElementById('preview-col');
    const previewContent = document.getElementById('preview-content');
    const isImage = /\.(jpe?g|png|gif|webp)$/i.test(fileName);
    const isVideo = /\.(mp4|webm|ogg)$/i.test(fileName);
    
    if (!previewCol) return;

    if (isImage || isVideo) {
        // Use the same server endpoint pattern used for downloading files
        const fileUrl = `/flow/api/download-file?filePath=${encodeURIComponent(path)}`;

        previewCol.classList.remove('hidden');
        previewCol.style.flex = '1'; // Make the preview column visible and take space
        
        let mediaTag=''; // Added for showing the filanme over the image
        const infoId = 'media-info-' + Date.now(); // Unique ID for the info placeholder - RESOLUTION

        
        if (isImage) {
            mediaTag = `<img id="preview-media" src="${fileUrl}" alt="${fileName}" style="max-width: 100%; height: auto; display: block; margin-top: 10px;"/>`;
        } else if (isVideo) {
            mediaTag = `<video id="preview-media" controls src="${fileUrl}" style="max-width: 100%; height: auto; display: block; margin-top: 10px;"></video>`;
        }
        //Prepend the filename before the media element
        previewContent.innerHTML = `
            <div style="font-weight: bold; padding-bottom: 5px;">${fileName}</div>
            ${mediaTag}
            <div id="${infoId}" style="margin-top: 5px; font-size: 0.9em;">Loading resolution...</div>
        `;

        // ----------------------------------------------------
        // Metadata Retrieval Logic (Resolution Only)
        // ----------------------------------------------------
        const mediaElement = document.getElementById('preview-media');
        const infoElement = document.getElementById(infoId);

        // Function to update the info display
        const updateInfo = (width, height) => {
            infoElement.textContent = `Resolution: ${width}x${height}`;
        };

        // Event listener for images
        if (isImage) {
            mediaElement.onload = function() {
                updateInfo(this.naturalWidth, this.naturalHeight);
            };
            mediaElement.onerror = function() {
                infoElement.textContent = 'Error loading image.';
            };
        } 
        
        // Event listener for videos
        else if (isVideo) {
            // 'loadedmetadata' fires when the video's dimension data is loaded
            mediaElement.addEventListener('loadedmetadata', function() {
                updateInfo(this.videoWidth, this.videoHeight);
            });
            mediaElement.onerror = function() {
                infoElement.textContent = 'Error loading video.';
            };
        }
        // ----------------------------------------------------



    } else {
        // Hide the preview column if the file is not an image or video
        previewCol.classList.add('hidden');
        previewContent.innerHTML = '';
        previewCol.style.flex = '0'; // Ensure it takes no space when hidden
    }
};
