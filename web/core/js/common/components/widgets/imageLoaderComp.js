import ImageLoader from './ImageLoader.js';
import {updateWorkflow} from '../workflowManager.js';

let imageLoader = null;
let isLoadMediaVisible = true;
let destroyOnHide = false;

export default function imageLoaderComp(appConfig, workflow) {
    if (!appConfig.imageLoaders || appConfig.imageLoaders.length === 0) {
        return; 
    }

    const displayMediaMain = document.getElementById('display-media-main');
    if (!displayMediaMain) {
        console.error('display-media-main container not found.');
        return;
    }

    let loadImageContainer = document.getElementById('load-image-container');
    if (!loadImageContainer) {
        loadImageContainer = document.createElement('div');
        loadImageContainer.id = 'load-image-container';

        const imageContainer = document.getElementById('image-container');

        if (imageContainer && imageContainer.parentElement === displayMediaMain) {
            displayMediaMain.insertBefore(loadImageContainer, imageContainer);
        } else {
            displayMediaMain.appendChild(loadImageContainer);
        }
    }

    appConfig.imageLoaders.forEach((imageConfig, index) => {
        const containerId = loadImageContainer.id;

        // this.imageDropAreaTitle.textContent = 'Drop an image or video here';
        const imageLoader = new ImageLoader(containerId, {
            allowedFileType: 'image',
            defaultImageSrc: '/core/media/ui/drop_image_rect_no_border_trans.png',
            label: imageConfig.label,
            // What the app actually loads: a LoadVideo input gets the video glyph,
            // anything else the image one (the same node lookup the dropdowns use).
            placeholderIcon: (workflow?.[String(imageConfig.nodePath).split('.')[0]]
                ?.class_type === 'LoadVideo') ? 'fas fa-video' : 'fas fa-image',
            showIndicator: true,
        }, (localSrc, serverResult) => {
            console.log(`Image ${index + 1} loaded:`, serverResult);
            if (serverResult && serverResult.name) {
                console.log(appConfig.imageLoaders[index].nodePath, imageConfig.nodePath);
                updateWorkflow(workflow, imageConfig.nodePath, serverResult.name);
            } else {
                console.error("Server did not return a valid result");
            }
        });
    });
}



const loadMediaToggleBtn = document.getElementById('load-media-toggle-btn');
const displayMediaMain = document.getElementById('display-media-main');

function toggleLoadMedia() {
    isLoadMediaVisible = !isLoadMediaVisible;

    const loadImageContainer = document.getElementById('load-image-container');
    
    if (isLoadMediaVisible) {
        if (!loadImageContainer) {
            const newLoadImageContainer = document.createElement('div');
            newLoadImageContainer.id = 'load-image-container';
            displayMediaMain.insertBefore(newLoadImageContainer, displayMediaMain.firstChild);
            imageLoaderComp();
        } else {
            loadImageContainer.style.display = 'block'; 
        }
    } else {
        if (destroyOnHide) {
            if (loadImageContainer) {
                loadImageContainer.parentNode.removeChild(loadImageContainer);
            }
            if (imageLoader) {
                imageLoader.destroy();
                imageLoader = null;
            }
        } else {
            if (loadImageContainer) {
                loadImageContainer.style.display = 'none';
            }
        }
    }
}

function setDestroyOnHide(shouldDestroy) {
    destroyOnHide = shouldDestroy;
}