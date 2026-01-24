import { showSpinner, hideSpinner } from './utils.js';
import { updateWorkflow } from './workflowManager.js';
import { messageHandler } from './messageHandler.js';

function dataURLToBlob(dataURL) {
    const [header, data] = dataURL.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    if (!mimeMatch) {
        throw new Error('Invalid data URL.');
    }
    const mime = mimeMatch[1];
    const binary = atob(data);
    const array = [];
    for (let i = 0; i < binary.length; i++) {
        array.push(binary.charCodeAt(i));
    }
    return new Blob([new Uint8Array(array)], { type: mime });
}

async function processAndUpload(
    items,
    getImage,
    uploadDescription,
    defaultErrorMessage,
    successMessagePrefix,
    workflow,
    postUploadCallback = null
) {
    for (const item of items) {
        const { id, label, nodePath } = item;

        try {
            showSpinner();

            const imageDataURL = getImage();
            // console.log(`${uploadDescription} Data URL for ${id}:`, imageDataURL);
            if (!imageDataURL) {
                throw new Error(`${uploadDescription} data is unavailable.`);
            }

            const blob = dataURLToBlob(imageDataURL);

            const formData = new FormData();
            formData.append('image', blob, `${id}.png`);

            const response = await fetch('/upload/image', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                let errorMessage = defaultErrorMessage;
                try {
                    const errorResponse = await response.json();
                    errorMessage = errorResponse.message || errorMessage;
                } catch (e) {
                    console.error('Failed to parse error response:', e);
                }
                throw new Error(errorMessage);
            }

            let result;
            try {
                result = await response.json();
                // console.log(`Server Response for ${id}:`, result);
            } catch (e) {
                throw new Error('Invalid JSON response from server.');
            }

            // console.log(`${successMessagePrefix} ${id} uploaded successfully:`, result);
            if (result && result.name) {
                updateWorkflow(workflow, nodePath, result.name);
                switch (uploadDescription) {
                    case 'Original Image':
                        messageHandler.setOriginalImage(imageDataURL);
                        // console.log('Original Image set in MessageHandler');
                        break;
                    case 'Cropped Mask Image':
                        messageHandler.setCroppedMaskImage(imageDataURL);
                        // console.log('Cropped Mask Image set in MessageHandler');
                        break;                        
                    case 'Mask Alpha Image':
                        messageHandler.setAlphaMaskImage(imageDataURL);
                        // console.log('Mask Alpha Image set in MessageHandler');
                        break;
                    // case 'Mask Image':
                    //     messageHandler.setMaskImage(imageDataURL);
                    //     console.log('Mask Image set in MessageHandler');
                    //     break;
                    // case 'Selected Mask Alpha Image':
                    //     messageHandler.setCanvasSelectedMaskOutputs(imageDataURL);
                    //     // console.log('Selected Mask Alpha Image added to CanvasSelectedMaskOutputs in MessageHandler');
                    //     messageHandler.setMaskImage(imageDataURL);
                    //     // console.log('Mask Image set in MessageHandler');
                    //     break;
                    default:
                        // console.warn(`No setter defined for upload description: ${uploadDescription}`);
                }
            } else {
                throw new Error('Server response did not include imageUrl or imageName.');
            }
            if (postUploadCallback) {
                postUploadCallback(result);
            }
        } catch (error) {
            console.error(`Error uploading ${uploadDescription.toLowerCase()} ${id}:`, error);
            // alert(`Error uploading ${label}: ${error.message}`);
        } finally {
            hideSpinner();
        }
    }
}


export default async function CanvasComponent(appConfig, workflow, canvasLoader) {
    if (appConfig.canvasOutputs && Array.isArray(appConfig.canvasOutputs)) {
        await processAndUpload(
            appConfig.canvasOutputs,
            () => canvasLoader.getCanvasOutImage(),
            'Canvas Output Image',
            'Canvas upload failed.',
            'Canvas',
            workflow
        );
    }

    if (appConfig.canvasMaskOutputs && Array.isArray(appConfig.canvasMaskOutputs)) {
        await processAndUpload(
            appConfig.canvasMaskOutputs,
            () => canvasLoader.getMaskImage(),
            'Mask Image',
            'Mask image upload failed.',
            'Mask Image',
            workflow
        );
    }

    if (appConfig.canvasAlphaOutputs && Array.isArray(appConfig.canvasAlphaOutputs)) {
        await processAndUpload(
            appConfig.canvasAlphaOutputs,
            () => canvasLoader.getMaskAlphaOnImage(),
            'Mask Alpha Image',
            'Mask alpha image upload failed.',
            'Mask Alpha Image',
            workflow
        );
    }

    if  (appConfig.canvasCroppedMaskOutputs && Array.isArray(appConfig.canvasCroppedMaskOutputs)) {
        await processAndUpload(
            appConfig.canvasCroppedMaskOutputs,
            () => canvasLoader.getCroppedMask(),
            'Cropped Mask Image',
            'Cropped mask image upload failed.',
            'Cropped Mask Image',
            workflow
        );
    }

    if  (appConfig.canvasCroppedImageOutputs && Array.isArray(appConfig.canvasCroppedImageOutputs)) {
        await processAndUpload(
            appConfig.canvasCroppedImageOutputs,
            () => canvasLoader.getCroppedImage(),
            'Cropped Image',
            'Cropped image upload failed.',
            'Cropped Image',
            workflow
        );
    }

    if  (appConfig.canvasCroppedAlphaOnImageOutputs && Array.isArray(appConfig.canvasCroppedAlphaOnImageOutputs)) {
        await processAndUpload(
            appConfig.canvasCroppedAlphaOnImageOutputs,
            () => canvasLoader.getCroppedAlphaOnImage(),
            'Cropped Alpha Image',
            'Cropped alpha image upload failed.',
            'Cropped Alpha Image',
            workflow
        );
    }

    if (appConfig.canvasSelectedMaskOutputs && Array.isArray(appConfig.canvasSelectedMaskOutputs)) {
        await processAndUpload(
            appConfig.canvasSelectedMaskOutputs,
            () => canvasLoader.getSelectedMaskAlphaOnImage(),
            'Selected Mask Alpha Image',
            'Selected mask alpha image upload failed.',
            'Selected Mask Alpha Image',
            workflow
        );
    }

    // ** ( Case 1 ) **
    if (
        appConfig.canvasLoadedImages && Array.isArray(appConfig.canvasLoadedImages) &&
        appConfig.canvasAlphaOutputs && Array.isArray(appConfig.canvasAlphaOutputs)
    ) {
        await processAndUpload(
            appConfig.canvasLoadedImages,
            () => canvasLoader.getOriginalImage(),
            'Original Image',
            'Original image upload failed.',
            'Original Image',
            workflow
        );

        await processAndUpload(
            appConfig.canvasAlphaOutputs,
            () => canvasLoader.getMaskAlphaOnImage(),
            'Mask Alpha Image',
            'Mask alpha image upload failed.',
            'Mask Alpha Image',
            workflow
        );
    }

    // ** ( Case 3 ) **
    // if (
    //     appConfig.canvasCroppedImageOutputs && Array.isArray(appConfig.canvasCroppedImageOutputs) &&
    //     appConfig.canvasCroppedMaskOutputs && Array.isArray(appConfig.canvasCroppedMaskOutputs)
    // ) {
    //     await processAndUpload(
    //         appConfig.canvasCroppedImageOutputs,
    //         () => canvasLoader.getCroppedImage(),
    //         'Cropped Image',
    //         'Cropped image upload failed.',
    //         'Cropped Image',
    //         workflow
    //     );

    //     await processAndUpload(
    //         appConfig.canvasCroppedMaskOutputs,
    //         () => canvasLoader.getCroppedMask(),
    //         'Cropped Mask Image',
    //         'Cropped mask image upload failed.',
    //         'Cropped Mask Image',
    //         workflow
    //     );
    // }

    // ** ( Case 4 ) **
    if (
        appConfig.canvasCroppedImageOutputs && Array.isArray(appConfig.canvasCroppedImageOutputs) &&
        appConfig.canvasCroppedMaskOutputs && Array.isArray(appConfig.canvasCroppedMaskOutputs) &&
        appConfig.canvasLoadedImages && Array.isArray(appConfig.canvasLoadedImages)
    ) {
        await processAndUpload(
            appConfig.canvasCroppedImageOutputs,
            () => canvasLoader.getCroppedImage(),
            'Cropped Image',
            'Cropped image upload failed.',
            'Cropped Image',
            workflow
        );

        await processAndUpload(
            appConfig.canvasCroppedMaskOutputs,
            () => canvasLoader.getCroppedMask(),
            'Cropped Mask Image',
            'Cropped mask image upload failed.',
            'Cropped Mask Image',
            workflow
        );

        await processAndUpload(
            appConfig.canvasLoadedImages,
            () => canvasLoader.getOriginalImage(),
            'Original Image',
            'Original image upload failed.',
            'Original Image',
            workflow
        );
    }

    // ** ( Case 5 ) **
    if (
        appConfig.canvasCroppedImageOutputs && Array.isArray(appConfig.canvasCroppedImageOutputs) &&
        appConfig.canvasCroppedAlphaOnImageOutputs && Array.isArray(appConfig.canvasCroppedAlphaOnImageOutputs) &&
        appConfig.canvasLoadedImages && Array.isArray(appConfig.canvasLoadedImages)
    ) {
        await processAndUpload(
            appConfig.canvasCroppedImageOutputs,
            () => canvasLoader.getCroppedImage(),
            'Cropped Image',
            'Cropped image upload failed.',
            'Cropped Image',
            workflow
        );

        await processAndUpload(
            appConfig.canvasCroppedAlphaOnImageOutputs,
            () => canvasLoader.getCroppedAlphaOnImage(),
            'Cropped Alpha Image',
            'Cropped alpha image upload failed.',
            'Cropped Alpha Image',
            workflow
        );

        await processAndUpload(
            appConfig.canvasLoadedImages,
            () => canvasLoader.getOriginalImage(),
            'Original Image',
            'Original image upload failed.',
            'Original Image',
            workflow
        );
    }

}
