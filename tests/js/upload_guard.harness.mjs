/**
 * Headless harness for the upload guard in
 * web/core/js/common/components/widgets/ImageLoader.js: the control posts to ComfyUI's
 * own `/upload/image`, which screens nothing, so the deny-list is applied here as well,
 * read the way `saus/helpers.allowed_file()` reads a name (the text after the last dot,
 * lower-cased). The text checks in `tests/test_media_drag.py` keep the list itself equal
 * to the server's copy, and `_root_paths_loader.mjs` maps the module's `/core/...`
 * imports onto the checkout.
 * Run: `node tests/js/upload_guard.harness.mjs`.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { register } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
register('./_root_paths_loader.mjs', import.meta.url);

const LOADER = join(ROOT, 'web', 'core', 'js', 'common', 'components', 'widgets', 'ImageLoader.js');
const { isBlockedUploadName } = await import(pathToFileURL(LOADER).href);

/* 1. everything the server refuses is refused here too, whatever the case */
for (const name of ['payload.py', 'evil.SO', 't.Ps1', 'mod.dll', 'lib.dylib', 'tool.exe',
                    'job.bat', 'mod.jar', 'app.js', 's.sh', '.htaccess']) {
    assert.ok(isBlockedUploadName(name), `${name} must be refused`);
}
console.log('1. scripts and native libraries are refused: OK');

/* 2. media, dotless names and unknown extensions still upload */
for (const name of ['photo.png', 'clip.mp4', 'photo.JPG', 'no-extension', 'archive.tar.gz', 'a.']) {
    assert.ok(!isBlockedUploadName(name), `${name} must not be blocked`);
}
assert.ok(!isBlockedUploadName(''), "an unnamed file is ComfyUI's business, not ours");
console.log('2. media, dotless and unknown names still upload: OK');

/* 3. the last dot decides, exactly as in the server's allowed_file() */
assert.ok(isBlockedUploadName('holiday.photo.py'), 'an earlier dot hides nothing');
assert.ok(!isBlockedUploadName('run.py.png'), 'the extension is what follows the last dot');
console.log('3. the last dot decides, as on the server: OK');

console.log('\nupload guard: all scenarios passed');
