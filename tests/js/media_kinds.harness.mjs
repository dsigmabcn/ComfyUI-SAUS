/**
 * Headless harness for web/core/js/common/scripts/mediaKinds.js and the preview URL
 * `appDrag.thumbnailUrlFor()` derives from a viewer URL.
 *
 * What it protects: a Recent tile (90 px) and an input-picker tile (120 px) used to
 * request the *original* file through `/view`, so a panel of 4000x3000 results
 * downloaded all of them at full size on every visit. The preview now goes through
 * `/saus/api/thumbnail`, which resizes and caches server-side; the extension sets that
 * decide "is this an image at all" live in one place (and are mirrored in
 * `saus/file_system.py`).
 *
 * Run it with ``node tests/js/media_kinds.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// appDrag.js parses viewer URLs against `window.location`, which a browser has and node
// does not. Set it before the module is imported.
globalThis.window = { location: { href: 'http://localhost:8188/' } };

const kinds = await import(
    pathToFileURL(join(ROOT, 'web/core/js/common/scripts/mediaKinds.js')).href
);
const { parseMediaUrl, thumbnailUrlFor, HISTORY_THUMB_SIZE } = await import(
    pathToFileURL(join(ROOT, 'web/core/js/common/scripts/appDrag.js')).href
);

/* 1. Which files each kind of surface may show */
{
    assert.equal(kinds.mediaKindOf('photo.PNG'), 'image', 'case does not matter');
    assert.equal(kinds.mediaKindOf('clip.mp4'), 'video');
    assert.equal(kinds.mediaKindOf('voice.mp3'), 'audio');
    assert.equal(kinds.mediaKindOf('notes.txt'), null, 'a text file is not media');
    assert.equal(kinds.mediaKindOf('no-extension'), null);
    assert.equal(kinds.mediaKindOf('1.2.3'), null, 'a trailing non-extension is not one');

    assert.deepEqual(
        kinds.filterByKind(['a.png', 'b.mp4', 'c.txt', 'd.webp'], 'image'),
        ['a.png', 'd.webp'],
        'a LoadImage input is offered the pictures only');
    assert.deepEqual(
        kinds.filterByKind(['a.png', 'b.mp4'], 'video'), ['b.mp4'],
        'and a LoadVideo input the videos only');
    assert.deepEqual(
        kinds.filterByKind(['a.png', 'b.mp4'], undefined), ['a.png', 'b.mp4'],
        'an unknown kind filters nothing rather than everything');
    console.log('1. a surface is offered what it can load: OK');
}

/* 2. The OS dialog is filtered too (the `<input accept>` that was commented out) */
{
    const accept = kinds.acceptForKind('video');
    assert.ok(accept.startsWith('video/*,'), 'the type comes first');
    assert.ok(accept.includes('.mkv') && accept.includes('.mp4'), 'and every extension');
    assert.equal(kinds.acceptForKind('nonsense'), '', 'an unknown kind says nothing');
    console.log('2. the upload dialog filters by kind: OK');
}

/* 3. A tile asks for a preview, not the original */
{
    const viewerUrl = '/view?filename=result.png&subfolder=2026-10-30&type=output';
    const thumb = thumbnailUrlFor(viewerUrl);

    assert.ok(thumb, 'an output image gets a preview');
    assert.ok(thumb.startsWith('/saus/api/thumbnail?'), 'through the resizing endpoint');
    assert.equal(new URL(thumb, 'http://x').searchParams.get('path'), 'output/2026-10-30/result.png',
        'the path is root-qualified, which is what resolve_within_roots() expects');
    assert.equal(new URL(thumb, 'http://x').searchParams.get('size'), String(HISTORY_THUMB_SIZE),
        'and asks for a tile-sized preview, not a 4000 px original');

    assert.equal(thumbnailUrlFor('/view?filename=clip.mp4&type=output'), null,
        'a video tile stays a real <video>: there is nothing to resize');
    assert.equal(thumbnailUrlFor('/view?filename=notes.txt&type=output'), null,
        'and nothing the thumbnail endpoint would refuse');
    assert.equal(thumbnailUrlFor('not a url'), null, 'no URL, no preview');
    assert.equal(thumbnailUrlFor(''), null);

    assert.equal(parseMediaUrl('/view?filename=in.png&type=input').path, 'input/in.png',
        'an input file resolves the same way');
    console.log('3. a small preview is requested instead of the original: OK');
}

console.log('\nmedia kinds: all scenarios passed');
