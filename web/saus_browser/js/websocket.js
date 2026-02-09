export class PromptServerClient {
    constructor() {
        const isSecure = window.location.protocol.startsWith("https");
        const protocol = isSecure ? "wss:" : "ws:";
        const host = window.location.hostname;
        const port = window.location.port ? `:${window.location.port}` : '';
        const wsUrl = `${protocol}//${host}${port}/ws`;

        this.ws = null;
        this.wsUrl = wsUrl;
        this.listeners = {};
        this.connect();
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

        try {
            this.ws = new WebSocket(this.wsUrl);
        } catch (e) {
            console.error(`[WS] Connection failed: ${e.message}`);
            return;
        }

        this.ws.onopen = () => {
            console.log("[WS] Connected");
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const eventType = data.type;
                if (eventType) {
                    this.dispatchEvent(eventType, data.data);
                }
            } catch (e) {
                console.error("[WS] Error parsing message:", e);
            }
        };

        this.ws.onclose = () => {
            setTimeout(() => this.connect(), 5000);
        };
    }

    on(eventType, callback) {
        if (!this.listeners[eventType]) {
            this.listeners[eventType] = [];
        }
        this.listeners[eventType].push(callback);
    }

    dispatchEvent(eventType, detail) {
        if (this.listeners[eventType]) {
            this.listeners[eventType].forEach(listener => {
                try {
                    listener({ detail });
                } catch (e) {
                    console.error("[WS] Error in listener for %s:", eventType, e);                }
            });
        }
    }
}