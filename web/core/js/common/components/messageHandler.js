import { WebSocketHandler } from './webSocketHandler.js';
import './progressbar.js'; 
import { hideSpinner, detectMimeType } from './utils.js';
import { store } from '../scripts/stateManagerMain.js';

import { PreviewManager } from './previewManager.js';

class IMessageProcessor {
    process(data) {
        throw new Error('Method not implemented.');
    }
}

class JSONMessageProcessor extends IMessageProcessor {
    constructor(messageHandler) {
        super();
        this.messageHandler = messageHandler;
    }

    async process(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            switch (data.type) {
                case 'progress':
                    this.messageHandler.handleProgress(data.data);
                    break;
                case 'crystools.monitor':
                    this.messageHandler.handleMonitor(data.data);
                    break;
                case 'executed':
                    this.messageHandler.handleExecuted(data.data);
                    break;
                case 'execution_interrupted':
                    this.messageHandler.handleInterrupted();
                    break;
                case 'status':
                    this.messageHandler.handleStatus();
                    break;
                case 'executing':
                    this.messageHandler.handleExecuting(data.data);
                    break;
                case 'execution_start':
                    this.messageHandler.handleExecutionStart(data.data);
                    break;
                case 'execution_cached':
                    this.messageHandler.handleExecutionCached(data.data);
                    break;
                case 'execution_success':
                    break;
                case 'execution_error':
                    this.messageHandler.handleExecutionError(data.data);
                    hideSpinner();
                    break;
                case 'progress_state':
                    this.messageHandler.handleProgressState(data.data);
                    break;
                default:
                    console.log('Unhandled message type:', data.type);
            }
        } catch (error) {
            console.error('Error parsing JSON message:', error);
            hideSpinner();
        }
    }
}

class BlobMessageProcessor extends IMessageProcessor {
    constructor(messageHandler) {
        super();
        this.messageHandler = messageHandler;
    }

    async process(blob) {
        try {
            let result = {};

            if (!blob.type) {
                const headerSize = 8; 
                if (blob.size <= headerSize) {
                    console.error('Blob size is too small to contain valid image data.');
                    hideSpinner();
                    result.error = 'Blob size is too small to contain valid image data.';
                    return result;
                }

                const slicedBlob = blob.slice(headerSize);
                const detectedType = await detectMimeType(slicedBlob);
                const objectURL = URL.createObjectURL(slicedBlob);
                if (detectedType) {
                    result = {
                        objectURL,
                        detectedType,
                        isTypeDetected: true
                    };
                } else {
                    console.error('Could not detect MIME type of Blob.');
                    hideSpinner();
                    result.error = 'Could not detect MIME type of Blob.';
                }
                return result;
            }

            if (blob.type.startsWith('image/') || blob.type.startsWith('video/')) {
                const objectURL = URL.createObjectURL(blob);
                result = {
                    objectURL,
                    detectedType: blob.type,
                    isTypeDetected: true
                };
            } else {
                console.error('Unsupported Blob type:', blob.type);
                hideSpinner();
                result.error = 'Unsupported Blob type: ' + blob.type;
            }
            return result;
        } catch (error) {
            console.error('Error processing Blob message:', error);
            hideSpinner();
            return { error };
        }
    }
}

export class MessageHandler {
    constructor() {
        this.lastImageFilenames = [];
        this.spinnerHidden = false;
        this.jsonProcessor = new JSONMessageProcessor(this);
        this.blobProcessor = new BlobMessageProcessor(this);
        this.previewManager = new PreviewManager();
        this.progressUpdater = new window.ProgressUpdater('main-progress', 'progress-text');
        this.nodeMap = new Map();
    }

    setOriginalImage(dataURL) {
        this.previewManager.setOriginalImage(dataURL);
    }

    setAlphaMaskImage(dataURL) {
        this.previewManager.setAlphaMaskImage(dataURL);
    }

    setCanvasSelectedMaskOutputs(dataURL) {
        this.previewManager.setCanvasSelectedMaskOutputs(dataURL);
    }

    setCroppedMaskImage(dataURL) {
        this.previewManager.setCroppedMaskImage(dataURL);
    }

    setMaskImage(dataURL) {
        this.previewManager.setMaskImage(dataURL);
    }

    handlePreviewOutputMessage(event) {
        if (typeof event.data === 'string') {
            this.jsonProcessor.process(event.data);
        } else if (event.data instanceof Blob) {
            this.blobProcessor.process(event.data).then(result => {
                this.previewManager.handlePreviewOutput(result);
            });
        } else {
            console.warn('Unknown message type:', typeof event.data);
        }
    }

    handleProgress(data) {
        this.hideSpinnerOnce();
        this.updateProgress(data);
    }

    handleStatus() {
        // Optional additional handling
    }
    handleMonitor(data) {
        console.log('Monitor data received:', data);
    }

    handleExecuting(data) {
        if (data && data.node) {
            const nodeId = data.node.toString();
            const nodeTitle = this.nodeMap.get(nodeId) || `Node ${nodeId}`;
            this.progressUpdater.updateStatus(`Processing: ${nodeTitle}`);
        } else {
            this.progressUpdater.updateStatus('');
        }
    }

    handleExecutionStart(data) {
        if (data && data.prompt) {
            this.nodeMap.clear();
            try {
                for (const [id, node] of Object.entries(data.prompt)) {
                    const title = node._meta?.title || node.class_type || `Node ${id}`;
                    this.nodeMap.set(id.toString(), title);
                }
            } catch (e) {
                console.warn('Failed to parse prompt for node titles', e);
            }
        }
        this.progressUpdater.updateStatus('Starting execution...');
    }

    handleExecutionCached(data) {
        const count = data.nodes ? data.nodes.length : 0;
        this.progressUpdater.updateStatus(`Using ${count} cached nodes...`);
    }

    handleExecutionError(data) {
        const msg = data.exception_message || data.error || 'Unknown error';
        this.progressUpdater.updateStatus(`Error: ${msg}`);
    }

    handleProgressState(data) {
        if (data && data.message) {
            this.progressUpdater.updateStatus(data.message);
        }
    }

    updateNodeMap(workflow) {
        if (!workflow) return;
        this.nodeMap.clear();
        try {
            for (const [id, node] of Object.entries(workflow)) {
                const title = node._meta?.title || node.title || node.class_type || node.classType || `Node ${id}`;
                this.nodeMap.set(id.toString(), title);
            }
        } catch (e) {
            console.warn('Failed to parse workflow for node titles', e);
        }
    }

    hideSpinnerOnce() {
        if (!this.spinnerHidden) {
            hideSpinner();
            this.spinnerHidden = true;
        }
    }

    handleExecuted(data) {
        if (data.output) {
            if ('images' in data.output) {
                this.processFinalImageOutput(data.output.images);
            }
            if ('gifs' in data.output) {
                this.processFinalVideoOutput(data.output.gifs);
            }
        }

        hideSpinner();
        const event = new CustomEvent('jobCompleted');
        window.dispatchEvent(event);
    }

    async processFinalImageOutput(images) {
        const newImageFilenames = [];
        const imageUrls = images.map(image => {
            const { filename } = image;
            if (filename.includes('ComfyUI_temp')) return null;
            if (this.lastImageFilenames.includes(filename)) return null;

            newImageFilenames.push(filename);
            const imageUrl = `/view?filename=${encodeURIComponent(filename)}`;
            //console.log('processImages Image URL:', imageUrl);
            return imageUrl;
        }).filter(url => url !== null);

        if (imageUrls.length > 0) {
            this.previewManager.displayFinalMediaOutput(imageUrls);
            this.displayPreviewOutput(imageUrls);
            this.lastImageFilenames = newImageFilenames;
            return imageUrls;
        }
    }

    displayPreviewOutput(imageUrls) {
        for (const url of imageUrls) {
            try {
                const { viewType } = store.getState();
                if (viewType === 'canvasView') {
                    this.previewManager.setImageDataType('finalImageData');
                    this.previewManager.emitCombinedImage(url);
                }
            } catch (error) {
                console.error('Error overlaying preview on image:', url, error);
            }
        }
    }

    processFinalVideoOutput(videos) {
        const videosUrls = videos.map(video => {
            const { filename } = video;
            return `/view?filename=${encodeURIComponent(filename)}`;
        });

        this.previewManager.displayFinalMediaOutput(videosUrls); 
    }

    handleInterrupted() {
        hideSpinner();
        console.log('Execution Interrupted');
        const event = new CustomEvent('jobInterrupted');
        window.dispatchEvent(event);
    }

    updateProgress(data = {}) {
        this.progressUpdater.update(data);
    }
}

const messageHandler = new MessageHandler();
export { messageHandler };

export function initializeWebSocket(clientId) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const serverAddress = `${window.location.hostname}:${window.location.port}`;
    const wsHandler = new WebSocketHandler(
        `${protocol}://${serverAddress}/ws?clientId=${encodeURIComponent(clientId)}`,
        (event) => messageHandler.handlePreviewOutputMessage(event)
    );
    wsHandler.connect();
    return wsHandler;
}
