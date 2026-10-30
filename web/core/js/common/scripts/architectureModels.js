/**
 * Which file a model group contributes to the graph.
 *
 * A group is a requirement, not a preference: `pick` (from a variant) names the file it
 * wants, and when that file is not installed the first *installed* alternative is used -
 * a variant that names an absent model would otherwise bind a file ComfyUI cannot load.
 * With no pick at all (an architecture with no variants, i.e. its implicit "Base") the
 * first installed file is chosen for the same reason; only a group nothing needs
 * (`need: "none"`) is left alone.
 */
export function groupFile(group, pick, isInstalled) {
    const files = (group.files || [])
        .map((file) => (typeof file === 'string' ? file : (file || {}).file))
        .filter(Boolean);
    if (!files.length) return null;

    const wanted = (pick || {})[group.id];
    if (wanted && isInstalled(wanted)) return wanted;
    if (wanted) return files.find(isInstalled) || wanted;
    if (group.need === 'none') return null;
    return files.find(isInstalled) || files[0];
}

/**
 * The appConfig dropdown a group's file should be written through.
 *
 * A graph can hold more than one loader of the same class and input - a Minimax H3 or
 * Qwen app has a **video VAE and an audio VAE**, both `VAELoader.vae_name`, and a pose
 * app has a transformer and a person detector, both `UNETLoader.unet_name`. The app
 * config then holds two dropdowns that look identical to this lookup, so groups and
 * dropdowns are paired **in declaration order** (the architecture's order must match the
 * app's). Always taking the first wrote the audio VAE's file into the video VAE's node.
 *
 * `null` means the group has no dropdown of its own, which is how a LoRA group is told
 * apart: LoRAs are attached through the "+Lora" button, so a file with no dropdown
 * becomes a LoRA block rather than a combo value.
 */
export function dropdownForGroup(group, dropdowns, used = new Set()) {
    const node = (group && group.node) || {};
    if (!node.nodeType) return null;
    const candidates = (dropdowns || [])
        .filter((d) => d && d.url === node.nodeType && d.key === node.input);
    return candidates.find((d) => !used.has(d.id)) || candidates[0] || null;
}
