
document.addEventListener('DOMContentLoaded', () => {    
    displayDirectory('/workspace/ComfyUI/output', 'file-explorer');
});

let currentDirectory = '/workspace/ComfyUI/output'; // sets initial drectory

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
    const button = document.getElementById('download-button');

    const progressContainer = document.getElementById('download-progress-container');
    const progressBar = document.getElementById('download-progress-bar');
    const progressText = document.getElementById('download-progress-text');
    const progressLabel = document.getElementById('download-progress-label');

    if (!url) {
        alert("Please enter a URL.");
        return;
    }

    // UI: Start progress
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    progressText.textContent = '';
    progressLabel.style.display = 'block';
    button.disabled = true;

    // Simulate progress (since we can't track real download progress from server)
    let fakeProgress = 0;
    const interval = setInterval(() => {
        fakeProgress += Math.floor(Math.random() * 10) + 5;
        if (fakeProgress >= 90) fakeProgress = 90;
        progressBar.style.width = `${fakeProgress}%`;
        progressText.textContent = `${fakeProgress}%`;
    }, 200);

    try {
        const response = await fetch('/flow/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, targetPath: currentDirectory })
        });

        clearInterval(interval);

        if (!response.ok) {
            throw new Error(`Download failed: ${response.statusText}`);
        }

        progressBar.style.width = '100%';
        progressText.textContent = '100%';

        setTimeout(() => {
            window.closeModal();
            displayDirectory(currentDirectory);
            progressBar.style.width = '0%';
            progressText.textContent = '';
            progressContainer.style.display = 'none';
            button.disabled = false;
        }, 1000);
    } catch (error) {
        clearInterval(interval);
        console.error("Download error:", error);
        alert("Failed to start download.");
        progressBar.style.width = '0%';
        progressText.textContent = '';
        progressContainer.style.display = 'none';
        button.disabled = false;
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

/*window.handleFileUpload = function () {
    const fileInput = document.getElementById('hidden-upload');
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-progress-text');


    if (!fileInput.files.length) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetPath', currentDirectory);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/flow/api/upload', true);
    xhr.timeout = 7200000; //max timeout = 2 hours, should be enough
    //xhr.setRequestHeader('Connection', 'keep-alive');


    xhr.upload.onprogress = function (event) {
        if (event.lengthComputable) {
            const percent = Math.floor((event.loaded / event.total) * 100);
            progressBar.style.width = `${percent}%`;
            progressText.textContent = `${percent}%`;

        }
    };

    xhr.onloadstart = function () {
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';
    };

    xhr.onloadend = function () {
        progressBar.style.width = '100%';
        setTimeout(() => {
            progressContainer.style.display = 'none';
            progressBar.style.width = '0%';
            fileInput.value = '';
        }, 1000);
    };

    xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
            if (xhr.status === 200) {
                displayDirectory(currentDirectory);
                alert("Upload successful!");
            } else {
                alert("Upload failed.");
            }
        }
    };

    xhr.send(formData);
};*/





/*functions for the navigation of folders */

//async function displayDirectory(path, explorerId = 'file-explorer') {
window.displayDirectory = async function displayDirectory(path, explorerId = 'file-explorer') {
     // Get the title element
    const titleElement = document.getElementById('current-path-title');

    // Update the title with the new path
    if (titleElement) {
        titleElement.textContent = '' + path;
    }   
    
    
    
    
    currentDirectory = path;
    const explorer = document.getElementById(explorerId);
    if (!explorer) {
        console.warn(`Explorer element with ID "${explorerId}" not found.`);
        return;
    }
    explorer.innerHTML = ''; /* Clear current contents*/


    // Add "Go Up" link if not at root
    //const rootPath = '/workspace/ComfyUI/models';
    const rootPath = '/workspace/ComfyUI';
    if (path !== rootPath) {
        const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
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
    nameSpan.textContent = name;
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

        document.addEventListener('DOMContentLoaded', () => {
            const headerContainer = document.querySelector('header');
            insertElement(headerContainer);

            // Delay the update to ensure the header is fully rendered
            setTimeout(() => {
                const appNameElement = document.querySelector('.appName');
                if (appNameElement) {
                    appNameElement.textContent = 'File Manager';
                    appNameElement.style.fontSize = '1.5em'; // or '20px', '24px', etc.

                }
            }, 300);
        });

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

