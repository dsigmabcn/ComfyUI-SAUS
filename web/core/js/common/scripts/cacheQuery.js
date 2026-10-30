/**
 * The cache query an app's own files (`wf.json`, `appConfig.json`) are fetched with.
 *
 * Everything under `/saus/` is served `no-cache` (see saus/static_cache.py), which
 * makes the browser *revalidate*: aiohttp answers a 304 when the file is unchanged,
 * so dropping the old unconditional `?cacheSaus=<now>` is what lets an unchanged app
 * open without re-downloading its graph. The one exception is the builder's live
 * preview: that app is rewritten under the browser's feet, and a file rewritten
 * within the same second would otherwise revalidate as "unchanged".
 */
export const LIVE_PREVIEW_APP = 'saus-builder-preview';

export function cacheQuery(app) {
    return String(app) === LIVE_PREVIEW_APP ? `?cacheSaus=${Date.now()}` : '';
}
