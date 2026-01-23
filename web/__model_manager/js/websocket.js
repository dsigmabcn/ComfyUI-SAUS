// ======================================================================================
// 📦 websocket.js
// 🛑 WEBSOCKET CLIENT IMPLEMENTATION (PromptServerClient)
// ======================================================================================

/**
 * PromptServerClient Class
 * Defines window.PromptServer and fixes the HTTPS/WSS security error.
 * Uses a simple event-listener pattern for handling incoming messages.
 */
export class PromptServerClient {
    constructor() {
        // FIX: SecurityError. If the page is loaded over HTTPS, we MUST use WSS.
        const isSecure = window.location.protocol.startsWith("https");
        const protocol = isSecure ? "wss:" : "ws:";
        
        // Use hostname for security, assuming the WebSocket is proxied to the host at the root /ws path.
        const host = window.location.hostname;
        const wsUrl = `${protocol}//${host}/ws`; 

        this.ws = null;
        this.wsUrl = wsUrl;
        this.listeners = {}; 
        this.connect();
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

        console.log(`[WS-INIT] Attempting to connect to WebSocket: ${this.wsUrl}`);
        
        try {
            this.ws = new WebSocket(this.wsUrl);
        } catch (e) {
            console.error(`[WS-INIT] WebSocket connection failed: ${e.message}`);
            return;
        }

        this.ws.onopen = () => {
            console.log("[WS-INIT] WebSocket connected successfully.");
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const eventType = data.type;
                
                if (eventType) {
                    // This creates a CustomEvent but we use the internal dispatchEvent
                    const customEvent = new CustomEvent(eventType, { detail: data.data });
                    this.dispatchEvent(customEvent);
                }
            } catch (e) {
                console.error("[WS-RECEIVE] Error parsing message:", e, event.data);
            }
        };

        this.ws.onclose = () => {
            console.warn("[WS-DISCONNECT] WebSocket disconnected. Reconnecting in 5 seconds...");
            setTimeout(() => this.connect(), 5000);
        };

        this.ws.onerror = (error) => {
            console.error("[WS-ERROR] WebSocket error:", error);
        };
    }

    on(eventType, callback) {
        if (!this.listeners[eventType]) {
            this.listeners[eventType] = [];
        }
        this.listeners[eventType].push(callback);
        console.log(`[WS-LISTEN] Registered listener for event: ${eventType}`);
    }

    dispatchEvent(event) {
        const eventType = event.type;
        if (this.listeners[eventType]) {
            this.listeners[eventType].forEach(listener => {
                try {
                    // The listener function receives the CustomEvent object
                    listener(event); 
                } catch (e) {
                    console.error(`[WS-ERROR] Error executing listener for ${eventType}: ${e.message}`);
                }
            });
        }
    }
}

// 🚨 Create the global instance immediately
// This is kept here so main.js doesn't have to worry about creating the instance
window.PromptServer = new PromptServerClient();

// --- WEBSOCKET STATUS HANDLER --- 
/**
 * Initializes WebSocket listeners with a polling mechanism to ensure window.PromptServer is available.
 * It relies on the globally available functions: updateCardStatus and window.loadArchitecture
 * @param {number} retryCount - Current retry attempt count.
 */
export function initializeWebSocketListener(retryCount = 0) {
    const MAX_RETRIES = 200;
    const RETRY_DELAY_MS = 200;
    
    // Ensure the necessary global dependencies are available before setting up listeners
    const dependenciesExist = typeof updateCardStatus === 'function' && 
                              typeof window.loadArchitecture === 'function' &&
                              window.currentActiveArchitecture;


    if (window.PromptServer && window.PromptServer.on && dependenciesExist) {
        // SUCCESS PATH
        console.log("[DEBUG: WS Init] PromptServer and UI dependencies available. Registering listeners.");

        // Listener for the progress updates
        window.PromptServer.on("model_download_progress", (event) => {
            console.log("[DEBUG: WS Receive] Received 'model_download_progress' event.", event.detail);

            const { model_path, progress } = event.detail; 
            updateCardStatus(model_path, 'downloading', Math.round(progress)); 
        });

        // Listener for the completion status
        window.PromptServer.on("model_download_complete", (event) => {
            console.log("[DEBUG: WS Receive] Received 'model_download_complete' event.", event.detail);

            const { model_path } = event.detail; 
            updateCardStatus(model_path, 'ready');
            
            // Call loadArchitecture to refresh the entire component list and UI state
            window.loadArchitecture(window.currentActiveArchitecture); 
        });

        // Listener for the error status
        window.PromptServer.on("model_download_error", (event) => {
            console.error("[DEBUG: WS Receive] Received 'model_download_error' event.", event.detail);

            const { model_path } = event.detail; 
            updateCardStatus(model_path, 'error');
        });

        console.log("WebSocket listeners for download status initialized.");

    } else if (retryCount < MAX_RETRIES) {
        // RETRY PATH
        console.warn(`[DEBUG: WS Init] Waiting for PromptServer or UI dependencies on attempt ${retryCount + 1}/${MAX_RETRIES}. Retrying in ${RETRY_DELAY_MS}ms...`);
        setTimeout(() => initializeWebSocketListener(retryCount + 1), RETRY_DELAY_MS);
    } else {
        // FAILURE PATH
        console.error("[DEBUG: WS Init] Failed to initialize WebSocket listener after maximum retries. Dependencies are missing.");
    }
}