/**
 * Headless harness for web/saus_browser/js/variantStatus.js - the one rule behind every
 * dot in the UI.
 *
 * What it protects: a "one of these" group is (listType, **label**), not just listType.
 * `video-interpolate-upscale` offers six interpolation models *and* four upscalers - two
 * separate requirements - and merging them into one group called the app ready with only
 * an upscaler installed. The explorer's dot and the information panel's card dot also
 * used to be computed by two different implementations, so one could be green while the
 * other was orange.
 *
 * Run it with ``node tests/js/variant_status.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const {
    missingEntries, variantBuckets, variantColour, variantState,
} = await import(
    pathToFileURL(join(ROOT, 'web/saus_browser/js/variantStatus.js')).href
);

/** entries from a plain list, the way variantBlocks() builds them. */
const group = (label, listType, files) =>
    files.map((file) => ({ file, listType, label }));
const statuses = (ready) => new Map(ready.map((file) => [file, 'ready']));

const INTERPOLATION = group('Frame interpolation', 'at_least_one',
    ['film_net_fp16.safetensors', 'rife_v4.26.safetensors', 'rife_v4.25.safetensors',
     'rife_v4.25_lite.safetensors', 'rife_v4.26_heavy.safetensors', 'rife_v4.25_heavy.safetensors']);
const UPSCALERS = group('upscaler', 'at_least_one',
    ['RealESRGAN_x4plus.safetensors', 'RealESRGAN_x2.pth', '4x-UltraSharp.pth', '4x-AnimeSharp.pth']);
const VIDEO_INTERPOLATE = [...INTERPOLATION, ...UPSCALERS];

/* 1. Two "one of" groups are two requirements, whatever they are called */
{
    const withOnlyAnUpscaler = statuses(['RealESRGAN_x4plus.safetensors']);
    const state = variantState(VIDEO_INTERPOLATE, withOnlyAnUpscaler);

    assert.equal(variantBuckets(VIDEO_INTERPOLATE, withOnlyAnUpscaler).size, 2,
        'the six interpolation models and the four upscalers are two groups');
    assert.equal(state.state, 'partial',
        'an upscaler alone is not the whole variant - it cannot interpolate');
    assert.equal(variantColour(VIDEO_INTERPOLATE, withOnlyAnUpscaler), '#ff9800',
        'and the card says so in orange, as the explorer does');

    const missing = missingEntries(VIDEO_INTERPOLATE, withOnlyAnUpscaler).map((e) => e.file);
    assert.equal(missing.length, 6, 'what is missing is the whole interpolation group');
    assert.ok(!missing.includes('RealESRGAN_x4plus.safetensors'),
        'never the file that is already installed');
    console.log('1. two "one of" groups stay two requirements: OK');
}

/* 2. One of each is the whole variant */
{
    const oneOfEach = statuses(['rife_v4.26.safetensors', '4x-AnimeSharp.pth']);
    assert.equal(variantState(VIDEO_INTERPOLATE, oneOfEach).state, 'ready',
        'a runnable variant is green');
    assert.deepEqual(missingEntries(VIDEO_INTERPOLATE, oneOfEach), [],
        'and a satisfied group does not offer its leftovers');
    console.log('2. one of each group completes the variant: OK');
}

/* 3. Nothing installed is red, not orange */
{
    assert.equal(variantState(VIDEO_INTERPOLATE, statuses([])).state, 'missing', 'nothing at all');
    console.log('3. nothing installed reads as missing: OK');
}

/* 4. Compulsory files are all required; optional ones never are */
{
    const entries = [
        ...group('Diffusion model', 'compulsory', ['a.safetensors']),
        ...group('VAE', 'compulsory', ['v.safetensors']),
        ...group('Style', 'optional', ['style.safetensors']),
    ];

    assert.equal(variantState(entries, statuses(['a.safetensors', 'v.safetensors'])).state, 'ready',
        'both compulsory files present = complete');
    assert.equal(variantState(entries, statuses(['a.safetensors'])).state, 'partial',
        'one of two compulsory files is partial');
    assert.equal(variantState(entries, statuses(['a.safetensors', 'v.safetensors', 'style.safetensors'])).state,
        'ready', 'an installed optional model changes nothing');
    assert.equal(variantState(entries, statuses([])).state, 'missing', 'neither file');
    console.log('4. compulsory files are all required, optional never: OK');
}

/* 5. A variant that needs nothing is not "missing" */
{
    const empty = variantState([], statuses([]));
    assert.equal(empty.state, 'ready', 'a variant with no requirements never blocks an app');
    assert.equal(variantColour([], statuses([])), '#9e9e9e', 'and its dot is neutral');
    console.log('5. a variant with no models is neutral: OK');
}

console.log('\nvariant status: all scenarios passed');
