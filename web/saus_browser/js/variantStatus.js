/**
 * Is a variant complete? One rule, for every dot in the UI.
 *
 * A variant's entries come in three kinds, and the kind decides what "complete" means:
 *
 *   compulsory    every file has to be installed
 *   at_least_one  the group needs *one* of its files (a VAE, a sampler, a family of
 *                 interpolation models); the rest are alternatives, not requirements
 *   optional      never blocks anything
 *
 * Two things this module exists to keep true, both of which were wrong before:
 *
 *  - **A group is (listType, label), not just listType.** Six interpolation models and
 *    four upscalers are two requirements - "one of each" - and merging them into one
 *    "choose one of ten" group called `video-interpolate-upscale` ready with only an
 *    upscaler installed. The label is what `variantBlocks()` files each entry under,
 *    and what the panel paints above it.
 *  - **The panel and the explorer ask the same question.** They used to count
 *    differently, so a card could be orange while the row beside it was green (and an
 *    uninstalled *optional* model could turn a card orange on its own).
 */

/** A group key: the kind of requirement plus which group it is. */
const groupKey = (entry) => `${entry.listType}\u0000${entry.label || ''}`;

const isRequired = (listType) => listType === 'compulsory' || listType === 'at_least_one';

/** Map(fileId -> 'ready' | else) from the information panel's per-file answers. */
export function statusesFromReadyMap(readyByFile) {
    const statuses = new Map();
    Object.entries(readyByFile || {}).forEach(([file, ready]) => {
        statuses.set(file, ready ? 'ready' : 'missing');
    });
    return statuses;
}

/** Per-group tally: how many of each requirement are ready, and what is missing. */
export function variantBuckets(entries, statuses) {
    const buckets = new Map();
    (entries || []).forEach((entry) => {
        const key = groupKey(entry);
        const bucket = buckets.get(key) || { listType: entry.listType, ready: 0, missing: [] };
        if ((statuses || new Map()).get(entry.file) === 'ready') {
            bucket.ready += 1;
        } else {
            bucket.missing.push(entry.label || entry.file);
        }
        buckets.set(key, bucket);
    });
    return buckets;
}

/** Every compulsory file present, and every "one of" group satisfied. */
export function bucketsComplete(buckets) {
    for (const bucket of buckets.values()) {
        if (bucket.listType === 'optional') continue;
        if (bucket.listType === 'at_least_one') {
            if (bucket.ready === 0) return false;
        } else if (bucket.missing.length > 0) {
            return false;
        }
    }
    return true;
}

/** What a variant still needs: a satisfied "one of" group stays silent. */
export function bucketsMissing(buckets) {
    const missing = [];
    buckets.forEach((bucket) => {
        if (bucket.listType === 'optional') return;
        if (bucket.listType === 'at_least_one' && bucket.ready > 0) return;
        missing.push(...bucket.missing);
    });
    return missing;
}

/**
 * The entries a variant still needs, as entries (not labels): a compulsory file that is
 * not installed, and every member of a "one of" group that nothing satisfies. This is
 * what "Download All" fetches and what the button's count is.
 */
export function missingEntries(entries, statuses) {
    const seen = new Set();
    const unsatisfied = new Set();
    variantBuckets(entries, statuses).forEach((bucket, key) => {
        if (bucket.listType === 'optional') return;
        if (bucket.listType === 'at_least_one' ? bucket.ready === 0 : bucket.missing.length) {
            unsatisfied.add(key);
        }
    });

    return (entries || []).filter((entry) => {
        if (!unsatisfied.has(groupKey(entry))) return false;
        if ((statuses || new Map()).get(entry.file) === 'ready') return false;
        if (!entry.file || seen.has(entry.file)) return false;
        seen.add(entry.file);
        return true;
    });
}

/**
 * One variant, as the dots read it:
 *
 *   ready    every requirement is met
 *   partial  something of what it needs is installed, but not all of it
 *   missing  nothing it needs is installed
 */
export function variantState(entries, statuses) {
    const required = (entries || []).filter((entry) => isRequired(entry.listType));
    const buckets = variantBuckets(entries, statuses);

    if (!required.length) {
        return { state: 'ready', ready: 0, total: 0, missing: [] };
    }
    const installed = required.filter((entry) => (statuses || new Map()).get(entry.file) === 'ready');
    const missing = bucketsMissing(buckets);
    const state = bucketsComplete(buckets) ? 'ready' : (installed.length ? 'partial' : 'missing');
    return { state, ready: installed.length, total: required.length, missing };
}

/** The theme-independent colour the three states have always used. */
export const STATE_COLOURS = {
    ready: '#4caf50',
    partial: '#ff9800',
    missing: '#f44336',
};

/** entries + statuses -> the colour a dot is painted. */
export function variantColour(entries, statuses) {
    if (!(entries || []).length) return '#9e9e9e';
    return STATE_COLOURS[variantState(entries, statuses).state];
}
