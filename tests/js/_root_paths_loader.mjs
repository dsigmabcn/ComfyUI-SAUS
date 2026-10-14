/**
 * A node ESM resolve hook for the SAUS harnesses.
 *
 * The frontend addresses core modules the way a browser does - by route, e.g.
 * `import { initTheme } from '/core/js/common/scripts/theme.js'` - which a bare
 * node run cannot resolve (node would look for `/core` at the filesystem root).
 * This maps such a specifier onto the checkout that serves it.
 *
 * A harness registers it before importing anything that crosses a route:
 *
 *     import { register } from 'node:module';
 *     register('./_root_paths_loader.mjs', import.meta.url);
 */
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SAUS = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Route prefix -> the directory ComfyUI serves it from (see app_manager.py).
const PREFIXES = {
    '/core/': join(SAUS, 'web', 'core'),
    '/saus/': join(SAUS, 'web', 'saus_browser'),
};

export async function resolve(specifier, context, next) {
    for (const [prefix, target] of Object.entries(PREFIXES)) {
        if (specifier.startsWith(prefix)) {
            const file = join(target, specifier.slice(prefix.length));
            return next(pathToFileURL(file).href, context);
        }
    }
    return next(specifier, context);
}
