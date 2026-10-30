/**
 * Headless harness for web/core/js/common/scripts/architectureModels.js - which file a
 * model group contributes to the graph.
 *
 * What it protects: an architecture with no variants (SEEDVR2, SDPOSE, the upscalers...)
 * never bound a model at all. Its groups were used for the "is this app installed?"
 * check and for the model *list*, but the mode selector only applied models for a named
 * variant, so such an app ran whatever the graph happened to contain - with its model
 * selectors hidden by HD, so the user could not see which model that was.
 *
 * Run it with ``node tests/js/architecture_models.harness.mjs``.
 */
import { strict as assert } from 'node:assert';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { groupFile, dropdownForGroup } = await import(
    pathToFileURL(join(ROOT, 'web/core/js/common/scripts/architectureModels.js')).href
);

const installed = (...names) => (file) => names.includes(file);

/* 1. A variant's pick wins while it is on disk */
{
    const group = { id: 'model', need: 'one', files: ['a.safetensors', 'b.safetensors'] };
    assert.equal(groupFile(group, { model: 'b.safetensors' }, installed('a.safetensors', 'b.safetensors')),
        'b.safetensors', 'the file the variant asked for');
    console.log('1. an installed pick is used as-is: OK');
}

/* 2. ... and degrades to an installed alternative */
{
    const group = { id: 'model', need: 'one', files: ['a.safetensors', 'b.safetensors'] };
    assert.equal(groupFile(group, { model: 'gone.safetensors' }, installed('b.safetensors')),
        'b.safetensors', 'a variant never binds a model that is not installed');
    assert.equal(groupFile(group, { model: 'gone.safetensors' }, installed()),
        'gone.safetensors', 'with nothing installed the author\'s choice stands, so it reads as missing');
    console.log('2. an absent pick falls back to an installed alternative: OK');
}

/* 3. No pick at all: the implicit "Base" of a variant-less architecture */
{
    const group = { id: 'upscale', need: 'one', files: ['RealESRGAN_x4plus.safetensors', '4x-UltraSharp.pth'] };
    assert.equal(groupFile(group, {}, installed('4x-UltraSharp.pth')), '4x-UltraSharp.pth',
        'a "one of" group binds the installed file - this is the SEEDVR2 / SDPOSE case');
    assert.equal(groupFile(group, {}, installed()), 'RealESRGAN_x4plus.safetensors',
        'with nothing installed it binds the declared default rather than nothing');

    const every = { id: 'vae', need: 'all', files: ['vae.safetensors'] };
    assert.equal(groupFile(every, {}, installed()), 'vae.safetensors', '"all" groups bind too');

    // Entries may be objects (name + url), as the app configs write them.
    const objects = { id: 'vae', need: 'all', files: [{ file: 'vae.safetensors', url: 'https://x' }] };
    assert.equal(groupFile(objects, {}, installed('vae.safetensors')), 'vae.safetensors',
        'a file may be declared as an object');
    console.log('3. a variant-less architecture binds its Base: OK');
}

/* 4. A group nothing needs is left alone */
{
    const lora = { id: 'style', need: 'none', files: ['style.safetensors'] };
    assert.equal(groupFile(lora, {}, installed('style.safetensors')), null,
        'an optional LoRA is not attached behind the user\'s back');
    assert.equal(groupFile(lora, { style: 'style.safetensors' }, installed('style.safetensors')),
        'style.safetensors', 'but a variant that asks for it gets it');

    assert.equal(groupFile({ id: 'x', need: 'all', files: ['', null] }, {}, installed()), null,
        'a group that lists no usable file binds nothing');
    console.log('4. optional groups stay the user\'s business: OK');
}

/* 5. Each group gets a dropdown of its own, in declaration order */
{
    // A Minimax H3 / Qwen app: one VAELoader node for the video, one for the audio.
    const videoVae = { id: 'video_vae', node: { nodeType: 'VAELoader', input: 'vae_name' } };
    const audioVae = { id: 'audio_vae', node: { nodeType: 'VAELoader', input: 'vae_name' } };
    const dropdowns = [
        { id: 'vae1', url: 'VAELoader', key: 'vae_name', nodePath: '119.inputs.vae_name' },
        { id: 'vae2', url: 'VAELoader', key: 'vae_name', nodePath: '120.inputs.vae_name' },
    ];
    const used = new Set();
    const first = dropdownForGroup(videoVae, dropdowns, used);
    used.add(first.id);
    const second = dropdownForGroup(audioVae, dropdowns, used);

    assert.equal(first.nodePath, '119.inputs.vae_name', 'the video VAE takes the first');
    assert.equal(second.nodePath, '120.inputs.vae_name',
        'and the audio VAE the second - taking the first twice wrote the audio file into the video node');

    // A group with a class/input no dropdown offers: a LoRA, attached as a block.
    const lora = { id: 'LORA', node: { nodeType: 'LoraLoaderModelOnly', input: 'lora_name' } };
    assert.equal(dropdownForGroup(lora, dropdowns, new Set()), null,
        'no dropdown means "attach it as a LoRA block"');
    assert.equal(dropdownForGroup({ id: 'x' }, dropdowns), null, 'a group with no node binds nothing');

    // One dropdown for two identical groups still resolves to that one, twice.
    const single = [dropdowns[0]];
    assert.equal(dropdownForGroup(videoVae, single, new Set()).id, 'vae1');
    assert.equal(dropdownForGroup(audioVae, single, new Set()).id, 'vae1');
    console.log('5. a group is paired with a dropdown of its own: OK');
}

console.log('\narchitecture models: all scenarios passed');
