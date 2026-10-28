import { populateDropdown } from './dropdownHandler.js';
import { extractComboOptions } from './comboOptions.js';

// Re-exported for backwards compatibility (the helper now lives in its own module).
export { extractComboOptions };

export default class Dropdown {
  constructor(config, workflow) {
    this.config = config;
    this.workflow = workflow;
    this.loaderContainer = document.getElementById(config.id);
    if (this.loaderContainer) {
      this.loadDropdownData();
    }
  }

  /** The node this combo writes to: "459.inputs.seed" -> "459". */
  get nodeId() {
    return String(this.config.nodePath || '').split('.')[0];
  }

  /**
   * The class the graph itself names for that node, e.g. "UNETLoader" - what
   * the workflow's class_type holds and what /object_info can answer for. The
   * config's url is only ever a hint: it may point at a different node on
   * purpose (a `sampler_name` combo on a KSamplerSelect is often served by
   * KSampler's input list), but it can also be something no node is called at
   * all, which is what older app configs hold (a builder used to store
   * ComfyUI's per-node uuid instead of the class name).
   */
  get workflowNodeType() {
    const node = this.workflow?.[this.nodeId];
    return node && typeof node.class_type === 'string' ? node.class_type : '';
  }

  /** Node types worth asking /object_info about, best guess first. */
  get nodeTypeCandidates() {
    const candidates = [this.config.url, this.workflowNodeType]
      .map((value) => String(value || '').trim())
      .filter((value) => value.length);

    return [...new Set(candidates)];
  }

  loadDropdownData() {
    const candidates = this.nodeTypeCandidates;
    if (!candidates.length) {
      console.warn(`Dropdown "${this.config.id}" has no node type to look up.`);
      this.displayMissingComponentMessage();
      return;
    }

    this.tryNodeType(candidates, 0);
  }

  tryNodeType(candidates, index) {
    const nodeType = candidates[index];
    const url = `${window.location.origin}/object_info/${encodeURIComponent(nodeType)}`;

    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok ' + response.statusText);
        }
        return response.json();
      })
      .then(data => {
        // populate() reports whether the combo made it onto the page; if it did
        // not, the next candidate is worth a try.
        if (!this.populate(data)) {
          this.tryNextNodeType(candidates, index);
        }
      })
      .catch(error => {
        console.error(`Error loading data for ${this.config.id} (${nodeType}):`, error);
        this.tryNextNodeType(candidates, index);
      });
  }

  tryNextNodeType(candidates, index) {
    if (index + 1 < candidates.length) {
      this.tryNodeType(candidates, index + 1);
      return;
    }
    this.displayMissingComponentMessage();
  }

  /** @returns {boolean} true once the combo is on the page. */
  populate(data) {
    const firstKey = data ? Object.keys(data)[0] : undefined;
    const loaderData = firstKey ? data[firstKey] : null;
    if (!loaderData || !loaderData.input) {
      // An unknown node type comes back as {} - let the caller try its next guess.
      return false;
    }

    const inputs = loaderData.input;
    let inputData = inputs.required ? inputs.required[this.config.key] : undefined;
    if (!inputData) {
      console.warn(
        `Required input for key "${this.config.key}" is missing. Checking optional input.`
      );
      inputData = inputs.optional ? inputs.optional[this.config.key] : undefined;
    }

    if (!inputData) {
      return false;
    }

    const options = extractComboOptions(inputData);
    if (!options) {
      return false;
    }

    populateDropdown(
      this.config.id,
      this.allowedOptions(options),
      this.config.label,
      this.config.nodePath,
      this.workflow
    );
    return true;
  }

  /**
   * The node's option list, narrowed by the app's own `options` allow-list: the app's
   * order is the curated one, a name the node does not have is dropped (a stale entry
   * must never offer a file ComfyUI cannot load), and when *none* of them is installed
   * the full list is shown instead - an empty dropdown would make the app unrunnable.
   */
  allowedOptions(options) {
    const only = this.config.options;
    if (!Array.isArray(only) || !only.length) return options;

    const available = new Set(options);
    const picked = only.filter((name) => available.has(name));
    if (!picked.length) {
      console.warn(`[SAUS] Dropdown "${this.config.id}": none of its ${only.length} `
        + 'preferred models is installed, so the full list is shown.');
      return options;
    }
    return picked;
  }

  displayMissingComponentMessage() {
    if (this.loaderContainer) {
      this.loaderContainer.innerHTML = '';
      const messageElement = document.createElement('div');
      messageElement.style.fontWeight = 'bold';
      messageElement.style.textAlign = 'left';
      messageElement.style.display = 'block';
      this.loaderContainer.style.display = 'block';
      this.loaderContainer.style.textAlign = 'left';
      // Name what was actually asked for (there can be more than one guess) so a
      // wrong node type is visible in the UI instead of only in the console.
      const looked = this.nodeTypeCandidates;
      messageElement.textContent = looked.length
        ? `Missing input "${this.config.key}" on ${looked.join(' / ')}`
        : `Missing input "${this.config.key}" for ${this.config.nodePath}`;
      this.loaderContainer.appendChild(messageElement);
    }
  }
}
