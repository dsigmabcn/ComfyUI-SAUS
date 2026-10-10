// sausAppBuilder.js
// SAUS App Builder — a ComfyUI frontend extension.
//
// It does NOT draw its own graph: it drives the *live* ComfyUI canvas using the
// same APIs ComfyUI itself uses (app.canvas.convertEventToCanvasOffset,
// graph.getNodeOnPos, node.getWidgetOnPos) and exports the workflow with
// app.graphToPrompt(). Flow: 1) pick inputs  2) pick outputs  3) preview/save.
import { app } from "../../scripts/app.js";

const PANEL_ID = "saus-app-builder";

/* ------------------------------------------------------------------ state */
const state = {
    open: false,
    step: 1,
    mode: null,             // 'inputs' | 'outputs' | null
    inputs: new Map(),      // `nodeId::widgetName` -> { nodeId, nodeType, name, kind }
    outputs: new Set(),     // nodeId strings
    hover: null,            // { nodeId, name } under the cursor
    readOnlyPrev: null,
    imageLoaders: new Map() // `nodeId::inputName` -> { nodeId, nodeType, name, kind:'imageLoader' }
};

const KIND_ORDER = ["prompt", "stepper", "dropdown", "seeder", "imageLoader", "toggle", "input"];

/* ------------------------------------------------------------- tiny utils */
function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

function toast(message, isError) {
    try {
        const t = el("div", "saus-ab-toast" + (isError ? " err" : ""), message);
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    } catch (e) { console.warn("[SAUS builder]", message); }
}

function inputKey(nodeId, name) { return `${nodeId}::${name}`; }

/* ------------------------------------------------------ widget classification */
const SEED_NAMES = new Set(["seed", "noise_seed", "rand_seed"]);
const STEPPER_NAMES = new Set([
    "steps", "cfg", "denoise", "guidance", "guidance_scale", "img_guidance_scale",
    "megapixels", "strength", "strength_model", "strength_clip", "start_percent",
    "end_percent", "width", "height", "batch_size", "shift", "max_shift", "base_shift",
    "fps", "frame_rate", "duration", "num_frames", "length", "motion_bucket_id", "scale"
]);
const PROMPT_NAMES = new Set(["text", "prompt", "positive", "negative", "caption", "string"]);

function guessKind(nodeType, name, widgetType) {
    const n = String(name || "").toLowerCase();
    const t = String(widgetType || "").toLowerCase();
    if (SEED_NAMES.has(n)) return "seeder";
    if (t === "combo" || t === "select") return "dropdown";
    if (t === "toggle" || t === "boolean" || t === "checkbox") return "toggle";
    if (t === "number" || t === "slider" || t === "int" || t === "float") {
        return STEPPER_NAMES.has(n) ? "stepper" : "stepper";
    }
    if (PROMPT_NAMES.has(n)) return "prompt";
    if (t === "string" || t === "text") return PROMPT_NAMES.has(n) ? "prompt" : "input";
    if (n.includes("name")) return "dropdown";
    return "input";
}

/* ----------------------------------------------------------- canvas helpers */
function isLinkedInputWidget(node, widgetName) {
    // a widget that is currently overridden by a link is not user-settable
    const slot = (node.inputs || []).find((i) => i.name === widgetName || i.widget?.name === widgetName);
    return !!(slot && slot.link != null);
}

function hitTest(event) {
    try {
        const canvas = app.canvas;
        const graph = app.graph;
        if (!canvas || !graph) return null;
        const [x, y] = canvas.convertEventToCanvasOffset(event);
        const node = graph.getNodeOnPos(x, y, canvas.visible_nodes);
        if (!node) return null;
        const widget = node.getWidgetOnPos ? node.getWidgetOnPos(x, y, true) : null;
        return { node, widget, x, y };
    } catch (e) {
        console.warn("[SAUS builder] hitTest failed", e);
        return null;
    }
}

function widgetKindFor(node, widget) {
    return guessKind(node.comfyClass || node.type, widget.name, widget.type);
}

/* ----------------------------------------------------------------- styles */
function injectStyles() {
    if (document.getElementById(PANEL_ID + "-style")) return;
    const style = document.createElement("style");
    style.id = PANEL_ID + "-style";
    style.textContent = `
        #${PANEL_ID}{position:fixed;top:56px;right:12px;width:380px;max-height:calc(100vh - 80px);z-index:10000;
            display:flex;flex-direction:column;background:#1b1b1f;color:#ddd;border:1px solid #4a3a5a;border-radius:10px;
            box-shadow:0 8px 30px rgba(0,0,0,.5);font:12px/1.4 Arial,Helvetica,sans-serif;overflow:hidden}
        #${PANEL_ID} header{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#241d2e;border-bottom:1px solid #3a2a4a}
        #${PANEL_ID} header b{flex:1;font-size:13px;color:#fff}
        #${PANEL_ID} .saus-ab-x{background:transparent;border:0;color:#bbb;font-size:16px;cursor:pointer}
        #${PANEL_ID} .saus-ab-steps{display:flex;gap:6px;padding:8px 10px}
        #${PANEL_ID} .saus-ab-steps button{flex:1;padding:6px 4px;background:#232227;color:#9a8aa5;border:1px solid #3a2a4a;
            border-radius:6px;cursor:pointer;font-size:11px}
        #${PANEL_ID} .saus-ab-steps button.on{background:#8621b7;color:#fff;border-color:#8621b7}
        #${PANEL_ID} .saus-ab-body{padding:0 12px 12px;overflow:auto}
        #${PANEL_ID} section{display:none}
        #${PANEL_ID} section.on{display:block}
        #${PANEL_ID} h4{margin:8px 0 6px;font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#c9b6dd}
        #${PANEL_ID} .saus-ab-hint{color:#9a8aa5;font-size:11px;margin:6px 0}
        #${PANEL_ID} label{display:block;margin-bottom:6px;color:#9a8aa5;font-size:11px}
        #${PANEL_ID} .saus-ab-list{border:1px solid #3a2a4a;border-radius:6px;max-height:190px;overflow:auto;background:#151518}
        #${PANEL_ID} .row{display:grid;grid-template-columns:1fr 92px 22px;gap:6px;align-items:center;padding:4px 6px;border-bottom:1px solid #2a2432}
        #${PANEL_ID} .row:last-child{border-bottom:0}
        #${PANEL_ID} .row .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        #${PANEL_ID} select,#${PANEL_ID} input[type=text],#${PANEL_ID} textarea{width:100%;background:#232227;color:#ddd;
            border:1px solid #3a2a4a;border-radius:4px;padding:4px 6px;font-size:11px}
        #${PANEL_ID} .del{background:transparent;border:0;color:#ff6b6b;cursor:pointer}
        #${PANEL_ID} .saus-ab-live{background:#121213;border:1px solid #3a2a4a;border-radius:6px;padding:8px;margin:8px 0;font-size:11px;color:#9a8aa5}
        #${PANEL_ID} .saus-ab-live b{color:#fff}
        #${PANEL_ID} footer{display:flex;gap:6px;padding:10px 12px;border-top:1px solid #3a2a4a;background:#17171a}
        #${PANEL_ID} footer .sp{flex:1}
        #${PANEL_ID} button.b{padding:6px 12px;background:#232227;color:#ddd;border:1px solid #3a2a4a;border-radius:6px;cursor:pointer;font-size:11px}
        #${PANEL_ID} button.p{background:#8621b7;border-color:#8621b7;color:#fff}
        #${PANEL_ID} button[disabled]{opacity:.45;cursor:not-allowed}
        .saus-ab-toast{position:fixed;bottom:70px;left:50%;transform:translateX(-50%);background:#8621b7;color:#fff;
            padding:8px 16px;border-radius:6px;z-index:10001;font:12px Arial,sans-serif}
        .saus-ab-toast.err{background:#c62828}
        .saus-ab-floating{position:fixed;right:12px;bottom:76px;z-index:9999;padding:8px 14px;
            background:#8621b7;color:#fff;border:0;border-radius:8px;cursor:pointer;
            font:12px Arial,Helvetica,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4)}
        body.saus-ab-picking .graph-canvas-container,body.saus-ab-picking canvas#graph-canvas{cursor:crosshair!important}
    `;
    document.head.appendChild(style);
}

/* ------------------------------------------------------------------ panel */
let panel = null;

function buildPanel() {
    if (panel) return panel;
    injectStyles();
    panel = el("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
        <header><b>SAUS App Builder</b><button class="saus-ab-x" title="Close">&#10005;</button></header>
        <div class="saus-ab-steps">
            <button data-step="1" class="on">1 &middot; Inputs</button>
            <button data-step="2">2 &middot; Outputs</button>
            <button data-step="3">3 &middot; Preview</button>
        </div>
        <div class="saus-ab-body">
            <section data-p="1" class="on">
                <p class="saus-ab-hint">Load your workflow on the canvas (drag &amp; drop a JSON anywhere), then
                    <b>click a parameter</b> on a node to expose it as an app input.</p>
                <div class="saus-ab-live" id="saus-ab-hover">Hover a widget&hellip;</div>
                <h4>Exposed inputs</h4>
                <div class="saus-ab-list" id="saus-ab-inputs"></div>
            </section>
            <section data-p="2">
                <p class="saus-ab-hint"><b>Click the node(s)</b> whose results the app should display.
                    Select none to show every output.</p>
                <h4>Output nodes</h4>
                <div class="saus-ab-list" id="saus-ab-outputs"></div>
            </section>
            <section data-p="3">
                <h4>App</h4>
                <label>Name<input type="text" id="saus-ab-name" placeholder="My App"></label>
                <label>URL<input type="text" id="saus-ab-url" placeholder="auto-generated"></label>
                <label>Description<textarea id="saus-ab-desc" rows="2"></textarea></label>
                <div class="saus-ab-live" id="saus-ab-preview"></div>
                <div class="row" style="grid-template-columns:1fr 1fr">
                    <button class="b" id="saus-ab-copy">Copy appConfig</button>
                    <button class="b" id="saus-ab-open">Open preview</button>
                </div>
            </section>
        </div>
        <footer>
            <button class="b" id="saus-ab-prev">&larr; Back</button>
            <div class="sp"></div>
            <button class="b p" id="saus-ab-save">Save App</button>
            <button class="b p" id="saus-ab-next">Next &rarr;</button>
        </footer>`;
    document.body.appendChild(panel);

    panel.querySelector(".saus-ab-x").onclick = closePanel;
    panel.querySelectorAll(".saus-ab-steps button").forEach((b) => {
        b.onclick = () => setStep(parseInt(b.dataset.step, 10));
    });
    panel.querySelector("#saus-ab-prev").onclick = () => setStep(state.step - 1);
    panel.querySelector("#saus-ab-next").onclick = () => setStep(state.step + 1);
    panel.querySelector("#saus-ab-save").onclick = () => saveApp(panel.querySelector("#saus-ab-save"));
    panel.querySelector("#saus-ab-copy").onclick = () => {
        navigator.clipboard.writeText(JSON.stringify(buildAppConfig(), null, 2))
            .then(() => toast("appConfig copied.")).catch(() => toast("Copy failed.", true));
    };
    panel.querySelector("#saus-ab-open").onclick = () => {
        const url = appUrl();
        if (!url) { toast("Give the app a name first.", true); return; }
        window.open("/saus/" + encodeURIComponent(url), "_blank");
    };
    ["saus-ab-name", "saus-ab-url", "saus-ab-desc"].forEach((id) => {
        panel.querySelector("#" + id).addEventListener("input", () => {
            panel.querySelector("#saus-ab-url").value = appUrl();
            updateAppConfigPreview();
        });
    });
    return panel;
}

function openPanel() {
    buildPanel();
    panel.style.display = "flex";
    state.open = true;
    setStep(1);
}
function closePanel() {
    stopSelecting();
    if (panel) panel.style.display = "none";
    state.open = false;
}
function setStep(n) {
    state.step = Math.max(1, Math.min(3, n));
    buildPanel();
    panel.querySelectorAll(".saus-ab-steps button").forEach((b) => {
        b.classList.toggle("on", parseInt(b.dataset.step, 10) === state.step);
    });
    panel.querySelectorAll("section[data-p]").forEach((s) => {
        s.classList.toggle("on", parseInt(s.getAttribute("data-p"), 10) === state.step);
    });
    panel.querySelector("#saus-ab-prev").style.visibility = state.step === 1 ? "hidden" : "visible";
    panel.querySelector("#saus-ab-next").style.visibility = state.step === 3 ? "hidden" : "visible";

    if (state.step === 1) startSelecting("inputs");
    else if (state.step === 2) startSelecting("outputs");
    else stopSelecting();

    if (state.step === 3) updateAppConfigPreview();
    renderLists();
}

/* --------------------------------------------------- selecting on the canvas */
let listenersAttached = false;

function canvasEl() {
    try { return app.canvasEl || (app.canvas && app.canvas.canvas) || null; } catch (e) { return null; }
}

function nodeById(id) {
    try {
        const g = app.graph;
        if (!g || !g.nodes) return null;
        return g.nodes.find((n) => String(n.id) === String(id)) || null;
    } catch (e) { return null; }
}

function redraw() { try { app.canvas.setDirty(true, true); } catch (e) { /* ignore */ } }

function startSelecting(mode) {
    state.mode = mode;
    document.body.classList.add("saus-ab-picking");
    try {
        const c = app.canvas;
        if (c) {
            if (state.readOnlyPrev === null) state.readOnlyPrev = !!c.read_only;
            c.read_only = true;            // same trick ComfyUI's own builder uses
        }
    } catch (e) { /* ignore */ }
    installOverlay();
    attachCanvasListeners();
    updateHoverLine();
    redraw();
}

function stopSelecting() {
    state.mode = null;
    document.body.classList.remove("saus-ab-picking");
    try {
        const c = app.canvas;
        if (c && state.readOnlyPrev !== null) c.read_only = state.readOnlyPrev;
    } catch (e) { /* ignore */ }
    state.readOnlyPrev = null;
    state.hover = null;
    redraw();
}

function attachCanvasListeners() {
    const c = canvasEl();
    if (!c || listenersAttached) return;
    c.addEventListener("pointerdown", onCanvasDown, true);
    c.addEventListener("pointermove", onCanvasMove, true);
    c.addEventListener("pointerleave", onCanvasLeave, true);
    listenersAttached = true;
}

function onCanvasDown(e) {
    if (!state.mode || e.button !== 0) return;
    const hit = hitTest(e);
    if (!hit || !hit.node) return;

    if (state.mode === "inputs") {
        if (!hit.widget) { toast("Click directly on a widget of the node.", true); return; }
        const name = hit.widget.name;
        if (isLinkedInputWidget(hit.node, name)) { toast("That input is driven by a link.", true); return; }
        const key = inputKey(hit.node.id, name);
        if (state.inputs.has(key)) state.inputs.delete(key);
        else {
            state.inputs.set(key, {
                nodeId: String(hit.node.id),
                nodeType: hit.node.comfyClass || hit.node.type,
                name,
                kind: widgetKindFor(hit.node, hit.widget)
            });
        }
    } else if (state.mode === "outputs") {
        const id = String(hit.node.id);
        if (state.outputs.has(id)) state.outputs.delete(id);
        else state.outputs.add(id);
    }

    renderLists();
    redraw();
    e.preventDefault();
    e.stopPropagation();
}

function onCanvasMove(e) {
    if (!state.mode) return;
    const hit = hitTest(e);
    state.hover = hit && hit.node
        ? { nodeId: String(hit.node.id), name: hit.widget ? hit.widget.name : null, type: hit.node.comfyClass || hit.node.type }
        : null;
    updateHoverLine();
    redraw();
}

function onCanvasLeave() { state.hover = null; updateHoverLine(); }

function updateHoverLine() {
    if (!panel) return;
    const box = panel.querySelector("#saus-ab-hover");
    if (!box) return;
    if (!state.hover) {
        box.textContent = state.mode === "outputs" ? "Hover a node…" : "Hover a widget…";
        return;
    }
    const h = state.hover;
    box.textContent = state.mode === "outputs"
        ? "#" + h.nodeId + "  " + h.type
        : "#" + h.nodeId + "  " + h.type + (h.name ? "  ·  " + h.name : "  (no widget here)");
}

/* ------------------------------------------------------------ canvas overlay */
function installOverlay() {
    let canvas;
    try { canvas = app.canvas; } catch (e) { canvas = null; }
    if (!canvas || canvas.__sausOverlay) return;
    const orig = canvas.onDrawForeground;
    canvas.onDrawForeground = function (ctx) {
        try { if (orig) orig.apply(this, arguments); } catch (e) { /* ignore */ }
        try { drawHighlights(ctx); } catch (e) { /* ignore */ }
    };
    canvas.__sausOverlay = true;
}

function drawHighlights(ctx) {
    if (!state.open || !ctx) return;
    const rowH = 20;

    for (const key of state.inputs.keys()) {
        const parts = key.split("::");
        const node = nodeById(parts[0]);
        const w = node && node.widgets && node.widgets.find((x) => x.name === parts[1]);
        if (!node || !w || w.last_y == null) continue;
        const x = node.pos[0];
        const y = node.pos[1] + w.last_y;
        ctx.fillStyle = "rgba(29, 209, 161, 0.22)";
        ctx.strokeStyle = "#1DD1A1";
        ctx.lineWidth = 1.5;
        ctx.fillRect(x, y, node.size[0], rowH);
        ctx.strokeRect(x, y, node.size[0], rowH);
    }

    for (const id of state.outputs) {
        const node = nodeById(id);
        if (!node) continue;
        ctx.strokeStyle = "#a732c5";
        ctx.lineWidth = 3;
        ctx.strokeRect(node.pos[0] - 1, node.pos[1] - 1, node.size[0] + 2, node.size[1] + 2);
    }

    if (state.hover) {
        const node = nodeById(state.hover.nodeId);
        if (node) {
            ctx.strokeStyle = "rgba(255,255,255,0.35)";
            ctx.lineWidth = 1;
            ctx.strokeRect(node.pos[0] - 2, node.pos[1] - 2, node.size[0] + 4, node.size[1] + 4);
        }
    }
}

/* ------------------------------------------------------------- list rendering */
const PLURAL = {
    prompt: "prompts", stepper: "steppers", dropdown: "dropdowns",
    seeder: "seeders", imageLoader: "imageLoaders", toggle: "toggles", input: "inputs"
};

function prettyLabel(name) {
    return String(name).replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderLists() {
    if (!panel) return;

    const inList = panel.querySelector("#saus-ab-inputs");
    if (inList) {
        inList.textContent = "";
        if (!state.inputs.size) {
            inList.appendChild(el("div", "saus-ab-hint", "Nothing selected yet."));
        }
        for (const [key, rec] of state.inputs) {
            const row = el("div", "row");
            const cell = el("div", "n", "#" + rec.nodeId + "  " + rec.name);
            cell.title = rec.nodeType + " · " + rec.name;

            const sel = document.createElement("select");
            KIND_ORDER.forEach((k) => {
                const o = document.createElement("option");
                o.value = k;
                o.textContent = k;
                if (k === rec.kind) o.selected = true;
                sel.appendChild(o);
            });
            sel.onchange = () => { rec.kind = sel.value; updateAppConfigPreview(); };

            const del = el("button", "del", "\u00d7");
            del.title = "Remove";
            del.onclick = () => { state.inputs.delete(key); renderLists(); redraw(); updateAppConfigPreview(); };

            row.appendChild(cell); row.appendChild(sel); row.appendChild(del);
            inList.appendChild(row);
        }
    }

    const outList = panel.querySelector("#saus-ab-outputs");
    if (outList) {
        outList.textContent = "";
        if (!state.outputs.size) {
            outList.appendChild(el("div", "saus-ab-hint", "Nothing selected — all outputs will be shown."));
        }
        for (const id of state.outputs) {
            const node = nodeById(id);
            const row = el("div", "row");
            row.appendChild(el("div", "n", "#" + id + "  " + ((node && (node.title || node.comfyClass)) || "")));
            row.appendChild(el("span"));
            const del = el("button", "del", "\u00d7");
            del.onclick = () => { state.outputs.delete(id); renderLists(); redraw(); };
            row.appendChild(del);
            outList.appendChild(row);
        }
    }
}

/* -------------------------------------------------------------- app config */
let builderAppId = null;

function appUrl() {
    const name = panel ? panel.querySelector("#saus-ab-name").value.trim() : "";
    if (!name) return "";
    if (!builderAppId) builderAppId = Math.random().toString(36).substring(2, 7);
    return builderAppId + "-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, "");
}

function buildAppConfig() {
    const name = (panel && panel.querySelector("#saus-ab-name").value.trim()) || "Builder App";
    const desc = (panel && panel.querySelector("#saus-ab-desc").value.trim()) || "";
    const url = appUrl() || "saus-app";
    const config = { id: builderAppId || "saus-app", name, url, description: desc };
    for (const plural of Object.values(PLURAL)) config[plural] = [];

    let order = 0;
    for (const rec of state.inputs.values()) {
        const plural = PLURAL[rec.kind] || "inputs";
        const base = {
            id: rec.kind + Math.random().toString(36).substring(2, 8),
            label: prettyLabel(rec.name),
            nodePath: rec.nodeId + ".inputs." + rec.name
        };
        let comp;
        if (rec.kind === "dropdown") comp = Object.assign(base, { url: rec.nodeType, key: rec.name });
        else if (rec.kind === "prompt") comp = Object.assign(base, { default: "" });
        else if (rec.kind === "toggle") comp = Object.assign(base, { defaultValue: false });
        else if (rec.kind === "stepper") comp = Object.assign(base, {
            minValue: 0, maxValue: 100, step: 1, defValue: 0, precision: 0, scaleFactor: 1
        });
        else if (rec.kind === "input") comp = Object.assign(base, { defValue: "" });
        else comp = base;                                    // seeder / imageLoader
        comp.layout = { region: rec.kind === "prompt" ? "prompts" : "basic", order: order++ };
        config[plural].push(comp);
    }

    if (state.outputs.size) {
        config.outputs = [...state.outputs].map((id) => {
            const node = nodeById(id);
            return {
                id: "output" + id,
                label: (node && (node.title || node.comfyClass)) || ("Node " + id),
                nodeId: String(id),
                type: "media"
            };
        });
    }
    return config;
}

function updateAppConfigPreview() {
    if (!panel) return;
    const box = panel.querySelector("#saus-ab-preview");
    if (!box) return;
    const n = state.inputs.size;
    const o = state.outputs.size;
    box.textContent = n + " input" + (n === 1 ? "" : "s") + " · " +
        o + " output" + (o === 1 ? "" : "s") + (o ? "" : " (all shown)");
    if (panel.querySelector("#saus-ab-url").value !== appUrl()) {
        panel.querySelector("#saus-ab-url").value = appUrl();
    }
}

/* ------------------------------------------------------------------- saving */
async function saveApp(btn) {
    if (!panel) return;
    const name = panel.querySelector("#saus-ab-name").value.trim();
    if (!name) { toast("Give the app a name first.", true); setStep(3); return; }
    if (!state.inputs.size) toast("Heads-up: no inputs selected.", false);

    let promptObj;
    try {
        const res = await app.graphToPrompt();
        promptObj = (res && res.output) ? res.output : res;
    } catch (e) {
        toast("Could not export the workflow: " + (e && e.message ? e.message : e), true);
        return;
    }

    const config = buildAppConfig();
    const form = new FormData();
    form.append("appConfig", new Blob([JSON.stringify(config)], { type: "application/json" }));
    form.append("wf", new Blob([JSON.stringify(promptObj)], { type: "application/json" }));

    const label = btn ? btn.textContent : "";
    if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
    try {
        let r = await fetch("/saus/api/create-app", { method: "POST", body: form });
        if (!r.ok) {
            const txt = await r.text();
            if (/exist/i.test(txt)) r = await fetch("/saus/api/update-app", { method: "POST", body: form });
            if (!r.ok) throw new Error(await r.text());
        }
        toast("App saved: " + config.url);
    } catch (e) {
        toast("Save failed: " + (e && e.message ? e.message : e), true);
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = label; }
    }
}

/* ----------------------------------------------------------- launch button */
function addLaunchButton() {
    const inject = () => {
        if (document.querySelector(".saus-ab-launch")) return true;
        const bar = document.querySelector(".comfyui-menu-right") ||
                    document.querySelector(".actionbar-container") ||
                    document.querySelector(".comfy-menu");
        if (!bar) return false;
        const group = bar.querySelector(".comfyui-button-group") || bar;
        group.appendChild(makeLaunchButton("comfyui-button comfyui-menu-mobile-collapse saus-ab-launch"));
        return true;
    };
    if (inject()) return;

    const obs = new MutationObserver(() => { if (inject()) obs.disconnect(); });
    obs.observe(document.body, { childList: true, subtree: true });

    // Fallback: if the top bar never appears, add a small floating button so the
    // builder is always reachable (this page may also be embedded in an iframe).
    setTimeout(() => {
        if (document.querySelector(".saus-ab-launch")) return;
        document.body.appendChild(makeLaunchButton("saus-ab-launch saus-ab-floating"));
    }, 6000);
}

function makeLaunchButton(className) {
    const btn = document.createElement("button");
    btn.className = className;
    btn.title = "SAUS App Builder";
    btn.textContent = "SAUS Builder";
    btn.addEventListener("click", () => (state.open ? closePanel() : openPanel()));
    return btn;
}

/* --------------------------------------------------------------- register */
app.registerExtension({
    name: "saus.appBuilder",
    async setup() {
        addLaunchButton();
        try {
            if (app.graph && app.graph.events && app.graph.events.addEventListener) {
                app.graph.events.addEventListener("configured", () => { renderLists(); redraw(); });
            }
        } catch (e) { /* ignore */ }
    }
});

// Handy for debugging from the browser console: __sausAppBuilder.open()
window.__sausAppBuilder = { open: openPanel, close: closePanel, state };

