import { CanvasManager } from './CanvasManager.js';
import { store } from '../../scripts/stateManagerMain.js';

const loadScript = (src, name = '') => {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => {
            resolve();
        };
        script.onerror = () => {
            const error = `Failed to load ${name || src}`;
            console.error(error);
            reject(new Error(error));
        };
        document.head.appendChild(script);
    });
};

const loadDependencies = async () => {
    try {
        await Promise.all([
            loadScript('/core/js/common/components/canvas/fabric.5.2.4.min.js', 'Fabric.js'),
        ]);
    } catch (error) {
        console.error('Failed to load dependencies:', error);
    }
};

function setView(viewType) {
    const canvasWrapper = document.getElementById("canvasWrapper");
    const imageContainer = document.getElementById("image-container");

    if (!canvasWrapper || !imageContainer) {
        console.warn("Required elements not found: 'canvasWrapper' or 'image-container'.");
        return;
    }

    switch(viewType) {
        case 'standardView':
            imageContainer.style.display = "flex"; 
            canvasWrapper.style.display = "none"; 
            break;
        case 'canvasView':
            canvasWrapper.style.display = "flex"; 
            imageContainer.style.display = "none";
            break;
        case 'splitView':
            canvasWrapper.style.display = "flex";
            imageContainer.style.display = "flex";
            break;
        default:
            console.warn(`Unknown viewType state: ${viewType}. Defaulting to 'standardView'.`);
            imageContainer.style.display = "flex"; 
            canvasWrapper.style.display = "none"; 
    }
}

export class CanvasLoader {
    constructor(canvasId, appConfig) {
        this.canvasId = canvasId;
        this.appConfig = appConfig;
        this.isInitialized = false;
        this.initPromise = this.init();

        store.subscribe((state) => {
            setView(state.viewType);
        });

        setView(this.appConfig.initialView || store.getState().viewType);
    }

    determineCanvasOptions(appConfig) {
        const options = {
            canvasControls: true,
            imageLoader: false, 
            undo: true,           
            maskBrush: false,     
            customBrush: false,
            imageAdder: false,
            canvasScaleForSave: false,
            imageCompareSlider: false,
            switchViewToggleButton: false, 
        };

        //img2img
        // **Case 1**: Load customBrush if canvasOutputs are present
        if (appConfig.canvasOutputs && Array.isArray(appConfig.canvasOutputs) && appConfig.canvasOutputs.length > 0) {
            options.customBrush = true;
            options.imageLoader = true;
            options.canvasScaleForSave = true;
            options.switchViewToggleButton = true; // Enable toggle button
            store.dispatch({
                type: 'SET_VIEW',
                payload: 'splitView'
            });
            store.dispatch({
                type: 'SET_MASKING_TYPE',
                payload: 'none'
            });
        }
        
        //full alpha mask inpaint
        // **Case 2**: Load maskBrush if canvasLoadedImages and canvasAlphaOutputs are present
        if (appConfig.canvasLoadedImages && Array.isArray(appConfig.canvasLoadedImages) && appConfig.canvasLoadedImages.length > 0 &&
            appConfig.canvasAlphaOutputs && Array.isArray(appConfig.canvasAlphaOutputs) && appConfig.canvasAlphaOutputs.length > 0) {
            options.maskBrush = true;
            options.imageLoader = true;
            options.switchViewToggleButton = true; // Enable toggle button

            store.dispatch({
                type: 'SET_VIEW',
                payload: 'canvasView'
            });
            store.dispatch({
                type: 'SET_MASKING_TYPE',
                payload: 'full'
            });
        }

        //cropped bw mask inpaint
        // **Case 4**: Load canvasCroppedImageOutputs and canvasCroppedMaskOutputs and canvasLoadedImages are present
        if (appConfig.canvasCroppedImageOutputs && Array.isArray(appConfig.canvasCroppedImageOutputs) && appConfig.canvasCroppedImageOutputs.length > 0 &&
            appConfig.canvasCroppedMaskOutputs && Array.isArray(appConfig.canvasCroppedMaskOutputs) && appConfig.canvasCroppedMaskOutputs.length > 0 &&
            appConfig.canvasLoadedImages && Array.isArray(appConfig.canvasLoadedImages) && appConfig.canvasLoadedImages.length > 0) {
                options.maskBrush = true;
                options.imageLoader = true;
                options.switchViewToggleButton = true; // Enable toggle button

                store.dispatch({
                    type: 'SET_VIEW',
                    payload: 'canvasView'
                });
                store.dispatch({
                    type: 'SET_MASKING_TYPE',
                    payload: 'cropped'
                });
                
        }
        //cropped alpha mask inpaint 

        // **Case 5**: Load canvasCroppedImageOutputs and canvasCroppedAlphaOnImageOutputs and canvasLoadedImages are present
        if (appConfig.canvasCroppedImageOutputs && Array.isArray(appConfig.canvasCroppedImageOutputs) && appConfig.canvasCroppedImageOutputs.length > 0 &&
            appConfig.canvasCroppedAlphaOnImageOutputs && Array.isArray(appConfig.canvasCroppedAlphaOnImageOutputs) && appConfig.canvasCroppedAlphaOnImageOutputs.length > 0 &&
            appConfig.canvasLoadedImages && Array.isArray(appConfig.canvasLoadedImages) && appConfig.canvasLoadedImages.length > 0) {
                options.maskBrush = true;
                options.imageLoader = true;
                options.imageCompareSlider= true;
                options.switchViewToggleButton = true; // Enable toggle button

                store.dispatch({
                    type: 'SET_VIEW',
                    payload: 'canvasView'
                });
                store.dispatch({
                    type: 'SET_MASKING_TYPE',
                    payload: 'full'
                });
        }
        return options;
    }

    async init() {
        try {
            this.options = this.determineCanvasOptions(this.appConfig);

            if (!this.options.maskBrush && !this.options.customBrush) {
                console.warn("No relevant fields in appConfig. Canvas will not be displayed or initialized.");
                this.hideCanvasUI();
                return;
            }

            await loadDependencies();
            const canvasWrapper = document.getElementById('canvasWrapper');
            const pluginUIContainer = document.getElementById('pluginUIContainer');

            if (!canvasWrapper || !pluginUIContainer) {
                throw new Error('Required DOM elements (canvasWrapper or pluginUIContainer) are missing.');
            }

            canvasWrapper.style.display = 'block';
            pluginUIContainer.style.display = 'flex';

            this.canvasManager = new CanvasManager({ canvasId: this.canvasId });

            // Every plugin is imported at the moment its option says it is wanted.
            // Together they are ~200 KB of brush / mask / compare code that only a
            // masking or reference app ever needs, and they used to be part of the
            // page's module graph for *every* app - a text-to-image app downloaded
            // the brushes it can never show. Each import is awaited, so
            // `isInitialized` still means "the canvas and its plugins are ready".
            if (this.options.imageLoader) {
                const { ImageLoaderPlugin } = await import('./ImageLoaderPlugin.js');
                const imageLoaderPlugin = new ImageLoaderPlugin({
                    mode: 'Single' // Set to 'Single' or 'Multi' as needed
                });
                this.canvasManager.registerPlugin(imageLoaderPlugin);
            }

            if (this.options.canvasControls) {
                const { CanvasControlsPlugin } = await import('./CanvasControlsPlugin.js');
                const canvasControlsPlugin = new CanvasControlsPlugin({
                    switchViewToggleButton: this.options.switchViewToggleButton
                });
                this.canvasManager.registerPlugin(canvasControlsPlugin);
            }

            if (this.options.undo) {
                const { UndoRedoPlugin } = await import('./UndoRedoPlugin.js');
                const undoRedoPlugin = new UndoRedoPlugin({
                    maxHistory: 100,
                });
                this.canvasManager.registerPlugin(undoRedoPlugin);
            }
            if (this.options.canvasScaleForSave) {
                const { CanvasScaleForSavePlugin } = await import('./CanvasScaleForSavePlugin.js');
                const canvasScaleForSave = new CanvasScaleForSavePlugin({
                    defaultScale: 1,
                    showDownloadButton: true,
                });
                this.canvasManager.registerPlugin(canvasScaleForSave);
            }
            if (this.options.maskBrush) {
                const { MaskBrushPlugin } = await import('./MaskBrushPlugin.js');
                const maskBrushPlugin = new MaskBrushPlugin({
                    brushSize: 75,
                    brushOpacity: 0.5,
                    cursorOutlineType: 'dashed',
                    cursorPrimaryColor: '#000000',
                    cursorSecondaryColor: '#FFFFFF',
                    cursorLineWidth: 1,
                    cursorFill: true,
                    useBrushColorPrimaryColor: true,
                    brushColor: '#FF0000',
                    useBrushColorForCursorRing: false,
                });
                this.canvasManager.registerPlugin(maskBrushPlugin);
            }

            if (this.options.customBrush) {
                const { CustomBrushPlugin } = await import('./CustomBrushPlugin.js');
                const customBrushPlugin = new CustomBrushPlugin({
                    brushSize: 25,
                    brushOpacity: 1,
                    cursorOutlineType: 'dotted',
                    cursorPrimaryColor: '#000000',
                    cursorSecondaryColor: '#FFFFFF',
                    cursorLineWidth: 1,
                    cursorFill: true,
                    useBrushColorPrimaryColor: true,
                    brushColor: '#64D813',
                    useBrushColorForCursorRing: false,
                });
                this.canvasManager.registerPlugin(customBrushPlugin);
            }

            if (this.options.imageCompareSlider) {
                const { ImageCompareSliderPlugin } = await import('./ImageCompareSliderPlugin.js');
                const imageCompareSliderPlugin = new ImageCompareSliderPlugin({
                    sliderColor: '#570d7b',
                    sliderWidth: 2,
                    handleRadius: 18,
                    handleStrokeWidth: 4,
                    handleStrokeColor: '#fff',
                    topMargin: 23,
                    bottomMargin: 23,
                    mode: 'Pairs' // 'Pairs', 'Replace', or 'Multi'
                });
                this.canvasManager.registerPlugin(imageCompareSliderPlugin);
            }

            if (this.options.imageAdder) {
                const { ImageAdderPlugin } = await import('./ImageAdderPlugin.js');
                const imageAdderPlugin = new ImageAdderPlugin();
                this.canvasManager.registerPlugin(imageAdderPlugin);
            }


            this.canvasManager.on('switchView', (newView) => {
                setView(newView);

                store.dispatch({
                    type: 'SET_VIEW',
                    payload: newView
                });



            });
            this.canvasManager.on('switchMaskingPreviewType', (PreviewType) => {

                store.dispatch({
                    type: 'SET_MASKING_TYPE',
                    payload: PreviewType
                });



            });

            this.isInitialized = true;
        } catch (error) {
            console.error('Error initializing CanvasLoader:', error);
            this.hideCanvasUI();
        }
    }

    hideCanvasUI() {
        const canvasWrapper = document.getElementById('canvasWrapper');
        const pluginUIContainer = document.getElementById('pluginUIContainer');

        if (canvasWrapper) {
            canvasWrapper.style.display = 'none';
        }

        if (pluginUIContainer) {
            pluginUIContainer.style.display = 'none';
        }
    }

    getOriginalImage(id) {
        const imageLoaderPlugin = this.canvasManager.getPluginByName('ImageLoaderPlugin');
        if (imageLoaderPlugin && imageLoaderPlugin.getOriginalImage) {
            return imageLoaderPlugin.getOriginalImage(id);
        } else {
            console.error('ImageLoaderPlugin is not registered or does not have getOriginalImage.');
            return null;
        }
    }

    getMaskImage() {
        const maskBrushPlugin = this.canvasManager.getPluginByName('MaskBrushPlugin');
        if (maskBrushPlugin) {
            const exportFunction = maskBrushPlugin.getExportFunction('saveAllMasksCombined');
            if (exportFunction) {
                return exportFunction();
            } else {
                console.error('Failed to get export function for saveMaskAlphaOnImage.');
                return null;
            }
        }
        return null;
    }

    getMaskAlphaOnImage() {
        const maskBrushPlugin = this.canvasManager.getPluginByName('MaskBrushPlugin');
        if (maskBrushPlugin) {
            const exportFunction = maskBrushPlugin.getExportFunction('saveAllMasksCombinedAlphaOnImage');
            if (exportFunction) {
                return exportFunction();
            } else {
                console.error('Failed to get export function for saveMaskAlphaOnImage.');
                return null;
            }
        }
        return null;
    }

    getCroppedMask(){
        const maskBrushPlugin = this.canvasManager.getPluginByName('MaskBrushPlugin');
        if (maskBrushPlugin) {
            const exportFunction = maskBrushPlugin.getExportFunction('saveCroppedMask');
            if (exportFunction) {
                return exportFunction();
            } else {
                console.error('Failed to get export function for saveCroppedMask.');
                return null;
            }
        }
        return null;
    }

    getCroppedImage(){
        const maskBrushPlugin = this.canvasManager.getPluginByName('MaskBrushPlugin');
        if (maskBrushPlugin) {
            const exportFunction = maskBrushPlugin.getExportFunction('saveCroppedImage');
            if (exportFunction) {
                return exportFunction();
            } else {
                console.error('Failed to get export function for saveCroppedImage.');
                return null;
            }
        }
        return null;
    }

    getCroppedAlphaOnImage(){
        const maskBrushPlugin = this.canvasManager.getPluginByName('MaskBrushPlugin');
        if (maskBrushPlugin) {
            const exportFunction = maskBrushPlugin.getExportFunction('saveCroppedAlphaOnImage');
            if (exportFunction) {
                return exportFunction();
            } else {
                console.error('Failed to get export function for saveCroppedAlphaOnImage.');
                return null;
            }
        }
        return null;
    }

    getSelectedMaskAlphaOnImage() {
        const maskBrushPlugin = this.canvasManager.getPluginByName('MaskBrushPlugin');
        if (maskBrushPlugin) {
            const selectedOption = maskBrushPlugin.saveOptionsSelect.value;
            const exportFunction = maskBrushPlugin.getExportFunction(selectedOption);
            if (exportFunction) {
                return exportFunction();
            } else {
                console.error('Unknown save option selected in MaskBrushPlugin.');
                return null;
            }
        } 
    }

    getCanvasOutImage() {
        return this.getCanvasImage();
    }

    getCanvasImage() {
        if (this.canvasManager && this.canvasManager.getCanvasImage) {
            return this.canvasManager.getCanvasImage();
        } else {
            console.error('CanvasManager is not initialized or getCanvasImage method is unavailable.');
            return null;
        }
    }  


}
