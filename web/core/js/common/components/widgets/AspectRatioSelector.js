import { updateWorkflow, getValueFromWorkflow } from '../workflowManager.js';
import { extractComboOptions } from './comboOptions.js';

const RATIO_RE = /(\d+)\s*[:x×]\s*(\d+)/;
const DEFAULT_QUICK_RATIOS = '1:1, 16:9, 9:16';
const DEFAULT_MEGAPIXELS = 1.0;
const DEFAULT_MULTIPLE = 8;
const MEGAPIXELS_KEY = 'megapixels';
const MULTIPLE_KEY = 'multiple';
const MAX_BOX_W = 34;
const MAX_BOX_H = 26;

const escapeHtml = (value) =>
    String(value).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));

/** "16:9 (Widescreen)" -> { w: 16, h: 9 }; null when there is no ratio. */
function parseRatio(text) {
    const match = String(text).match(RATIO_RE);
    if (!match) return null;
    const w = parseInt(match[1], 10);
    const h = parseInt(match[2], 10);
    return w > 0 && h > 0 ? { w, h } : null;
}

const ratioKey = (w, h) => `${w}:${h}`;

/** Proportional rectangle, scaled into the icon box (falls back to a square). */
function shapeHtml(ratio, extraClass) {
    const cls = extraClass ? ` ${extraClass}` : '';
    if (!ratio) return `<span class="ratio-shape ratio-shape-unknown${cls}"></span>`;
    const scale = Math.min(MAX_BOX_W / ratio.w, MAX_BOX_H / ratio.h);
    const w = Math.max(6, Math.round(ratio.w * scale));
    const h = Math.max(6, Math.round(ratio.h * scale));
    return `<span class="ratio-shape${cls}" style="width:${w}px;height:${h}px"></span>`;
}

/**
 * Visual aspect-ratio picker.
 *
 * Reads the combo options of a node input (e.g. ResolutionSelector.aspect_ratio)
 * and renders the ratios listed in `quickRatios` as proportional shape buttons;
 * every other option lives in a compact "Custom" dropdown. Each tile shows the
 * ratio on one line and the resolution the node will compute on the next.
 *
 * Only the selected aspect-ratio value is written to the workflow -- width and
 * height stay the node's job at execution time.
 */
class AspectRatioSelector {
    constructor(config = {}, workflow) {
        this.config = config;
        this.workflow = workflow;
        this.container = null;
        this.options = [];
        this.selected = null;
        this.retries = 0;
        this._sig = null;
        // null = decide automatically (open when a non-quick ratio is selected).
        this._otherOpen = null;

        this._onWorkflowUpdate = this.handleWorkflowUpdate.bind(this);

        window.addEventListener('workflowValueUpdate', this._onWorkflowUpdate);

        // Steppers / number inputs write straight into the workflow without
        // dispatching an event, so also watch any interaction in the app and
        // re-check whether the previewed sizes need refreshing.
        this._onAnyUiEvent = this.handleWorkflowUpdate.bind(this);
        ['input', 'change', 'click'].forEach((type) =>
            document.addEventListener(type, this._onAnyUiEvent, true));

        // Belt and braces: a widget that only mutates the workflow (no DOM event
        // we can observe) is still caught by re-checking the values we read.
        this._watchedSig = null;
        this._watchTimer = setInterval(() => this.watchDependencies(), 500);

        this.loadOptions();
    }

    // ------------------------------------------------------------ workflow refs
    get nodePath() {
        return this.config.nodePath || '';
    }

    get nodeId() {
        return this.nodePath.split('.')[0];
    }

    get key() {
        const parts = this.nodePath.split('.');
        if (parts.length > 2) return parts.slice(2).join('.');
        return this.config.key || '';
    }

    get nodeType() {
        return this.config.url || this.workflow?.[this.nodeId]?.class_type || '';
    }

    readPath(path) {
        return path
            .split('.')
            .reduce((acc, k) => (acc && acc[k] !== undefined ? acc[k] : undefined), this.workflow);
    }

    currentMegapixels() {
        const value = parseFloat(this.readPath(`${this.nodeId}.inputs.${MEGAPIXELS_KEY}`));
        return Number.isFinite(value) && value > 0 ? value : DEFAULT_MEGAPIXELS;
    }

    currentMultiple() {
        const value = parseInt(this.readPath(`${this.nodeId}.inputs.${MULTIPLE_KEY}`), 10);
        return Number.isFinite(value) && value > 0 ? value : DEFAULT_MULTIPLE;
    }

    /** Mirror the ResolutionSelector node's maths (informational only). */
    sizeFor(wr, hr) {
        const totalPixels = this.currentMegapixels() * 1024 * 1024;
        const multiple = this.currentMultiple();
        const scale = Math.sqrt(totalPixels / (wr * hr));
        return {
            width: Math.round((wr * scale) / multiple) * multiple,
            height: Math.round((hr * scale) / multiple) * multiple
        };
    }

    // -------------------------------------------------------------- quick picks
    /** Ratios listed in config.quickRatios (falls back to 1:1, 16:9, 9:16). */
    parseQuickRatios() {
        const raw = this.config.quickRatios;
        const list = Array.isArray(raw)
            ? raw
            : String(raw || DEFAULT_QUICK_RATIOS).split(',');
        return list.map((item) => parseRatio(item)).filter(Boolean);
    }

    describe(value) {
        const label = String(value);
        const ratio = parseRatio(label);
        return {
            value: label,
            ratio,
            size: ratio ? this.sizeFor(ratio.w, ratio.h) : null
        };
    }

    /** One entry per quick ratio that actually exists in the node's options. */
    quickEntries() {
        const available = {};
        this.options.forEach((option) => {
            const ratio = parseRatio(String(option));
            if (ratio) available[ratioKey(ratio.w, ratio.h)] = String(option);
        });
        return this.parseQuickRatios()
            .map((ratio) => available[ratioKey(ratio.w, ratio.h)])
            .filter((value) => value !== undefined)
            .map((value) => this.describe(value));
    }

    sizeText(entry) {
        return entry.size ? `${entry.size.width}×${entry.size.height}` : '';
    }

    loadOptions() {
        const url = this.nodeType;
        const key = this.key;

        if (!url || !key) {
            this.options = this.config.options || [];
            this.renderComponent();
            return;
        }

        fetch(`${window.location.origin}/object_info/${url}`)
            .then((response) => {
                if (!response.ok) throw new Error(response.statusText);
                return response.json();
            })
            .then((data) => {
                const info = data[url] || Object.values(data)[0];
                const spec =
                    info?.input?.required?.[key] ?? info?.input?.optional?.[key];
                this.options = extractComboOptions(spec) || this.config.options || [];
                this.ensureInitialValue();
                this.renderComponent();
            })
            .catch((error) => {
                console.warn(`AspectRatioSelector [${this.config.id}]:`, error);
                this.options = this.config.options || [];
                this.renderComponent();
            });
    }

    ensureInitialValue() {
        const value = getValueFromWorkflow(this.workflow, this.nodePath);
        if (value === undefined || value === null || value === '') {
            const first = this.options[0];
            if (first !== undefined) {
                updateWorkflow(this.workflow, this.nodePath, first);
                this.selected = first;
            }
        }
    }

    currentSelection() {
        if (this.selected !== null) return this.selected;
        const value = getValueFromWorkflow(this.workflow, this.nodePath);
        if (value !== undefined && value !== null && value !== '') return value;
        return this.options[0] ?? null;
    }
    // ------------------------------------------------------------------- render
    renderComponent() {
        this.container = document.getElementById(this.config.id);
        if (!this.container) {
            if (this.retries++ < 12) setTimeout(() => this.renderComponent(), 300);
            return;
        }
        this.render();
    }

    render() {
        const selected = this.currentSelection();
        const quick = this.quickEntries();
        const quickValues = quick.map((entry) => entry.value);

        // Everything that is not a quick pick lives behind the "Other" button.
        const others = this.options
            .map((option) => this.describe(option))
            .filter((entry) => quickValues.indexOf(entry.value) < 0);

        // No quick pick matches this node's options -> show them all as tiles.
        const tiles = quick.length
            ? quick
            : this.options.map((option) => this.describe(option));

        const hasOthers = quick.length > 0 && others.length > 0;
        const otherSelected = others.some((entry) => entry.value === selected);
        const open = !hasOthers
            ? false
            : (this._otherOpen === null ? otherSelected : this._otherOpen);

        // Skip the DOM work when nothing visible would change (the app fires an
        // event on every interaction, and sizes depend on other widgets).
        const signature = [
            selected,
            open ? 'open' : 'closed',
            tiles.map((e) => `${e.value}@${this.sizeText(e)}`).join(','),
            others.map((e) => `${e.value}@${this.sizeText(e)}`).join(',')
        ].join('#');
        if (signature === this._sig) return;
        this._sig = signature;

        const otherTile = hasOthers ? `
                <button class="ratio-icon-btn ratio-other ${open ? 'active' : ''}" data-other="1" title="Other aspect ratios">
                    ${shapeHtml(null)}
                    <span class="ratio-ratio">Other</span>
                    <span class="ratio-size"></span>
                </button>` : '';

        // Same pattern as the Dimension Selector: the extra ratios live in a
        // panel that the "Other" button reveals.
        const panel = hasOthers ? `
            <div class="ratio-other-panel" style="display:${open ? 'flex' : 'none'}">
                ${others.map((entry) => this.tileHtml(entry, selected)).join('')}
            </div>` : '';

        const empty = !tiles.length && !others.length
            ? '<span class="ratio-icon-label">No options</span>'
            : '';

        this.container.innerHTML = `
            ${this.config.label ? `<label class="ratio-title">${escapeHtml(this.config.label)}</label>` : ''}
            <div class="ratio-icons-container">
                ${tiles.map((entry) => this.tileHtml(entry, selected)).join('')}${otherTile}${empty}
            </div>${panel}`;

        this.container.querySelectorAll('.ratio-icon-btn[data-value]').forEach((btn) => {
            btn.addEventListener('click', () => this.select(btn.dataset.value));
        });
        const otherBtn = this.container.querySelector('.ratio-other');
        if (otherBtn) {
            otherBtn.addEventListener('click', () => {
                this._otherOpen = !open;
                this.render();
            });
        }
    }

    tileHtml(entry, selected) {
        const label = entry.ratio
            ? ratioKey(entry.ratio.w, entry.ratio.h)
            : entry.value;
        return `<button class="ratio-icon-btn ${entry.value === selected ? 'active' : ''}" data-value="${escapeHtml(entry.value)}" title="${escapeHtml(entry.value)}">
                    ${shapeHtml(entry.ratio)}
                    <span class="ratio-ratio">${escapeHtml(label)}</span>
                    <span class="ratio-size">${escapeHtml(this.sizeText(entry))}</span>
                </button>`;
    }

    select(value) {
        const quickValues = this.quickEntries().map((entry) => entry.value);
        this.selected = value;
        // Picking a quick ratio hides the panel again (like the Dimension
        // Selector); picking one of the extra ratios keeps it open.
        this._otherOpen = quickValues.indexOf(value) < 0;
        updateWorkflow(this.workflow, this.nodePath, value);
        this.render();
        window.dispatchEvent(new CustomEvent('workflowValueUpdate', {
            detail: { path: this.nodePath, value }
        }));
    }

    handleWorkflowUpdate() {
        if (this.container) this.render();
    }

    /** Re-render when megapixels / multiple change behind our back. */
    watchDependencies() {
        if (!this.container) return;
        const sig = `${this.currentMegapixels()}|${this.currentMultiple()}|${this.currentSelection()}`;
        if (sig === this._watchedSig) return;
        this._watchedSig = sig;
        this.render();
    }

}
export default AspectRatioSelector;

