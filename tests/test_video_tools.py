"""The video tools: what every one of them must keep."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APPS = ROOT / 'web' / 'apps'
DATA = ROOT / 'web' / 'saus_browser' / 'data'
SIDEBAR = ROOT / 'web' / 'saus_browser' / 'js' / 'sidebar.js'

UPSCALE_MODELS = ['RealESRGAN_x4plus.safetensors', 'RealESRGAN_x2.pth',
                  '4x-UltraSharp.pth', '4x-AnimeSharp.pth']
# The two the apps offer as variants now: FILM net and the RIFE build ComfyUI's own
# node ships with. The other RIFE builds (4.25, its lite/heavy, 4.26 heavy) are gone
# from the architecture *and* the registry - they were never anything but a dropdown.
INTERP_MODELS = ['film_net_fp16.safetensors', 'rife_v4.26.safetensors']
# The interpolate+upscale app pairs one interpolation model with ESRGAN x2.
COMBO_UPSCALE_MODELS = ['RealESRGAN_x2.pth']

VIDEO_APPS = [
    'video-upscale-seedvr2',
    'video-depth-anything',
    'video-to-pose',
    'video-upscale-with-model',
    'video-frame-interpolation',
    'video-segmentation',
    'video-interpolate-upscale',
    'video-to-canny',
]
BATCHED = ['video-upscale-with-model', 'video-interpolate-upscale']
# The video-to-video half of the family: one graph, a clip in and a clip out.
VIDEO_TO_VIDEO_APPS = [
    'video-wan-animate',
    'video-minimax-h3-fun-control',
]


def config(url):
    return json.loads((APPS / url / 'appConfig.json').read_text(encoding='utf-8'))


def workflow(url):
    return json.loads((APPS / url / 'wf.json').read_text(encoding='utf-8'))


def bound(cfg, node_path):
    """The component (of any group) bound to `node_path`, or None."""
    for entries in cfg.values():
        if not isinstance(entries, list):
            continue
        for e in entries:
            if isinstance(e, dict) and e.get('nodePath') == node_path:
                return e
    return None


def nodes_of_type(wf, class_type):
    return {k: v for k, v in wf.items() if v['class_type'] == class_type}


def source_of(value):
    """The (node id, slot) an input link points at, or None."""
    if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str):
        return value[0], value[1]
    return None


def test_every_video_tool_is_filed_under_video_tools():
    taxonomy = json.loads((DATA / 'taxonomy.json').read_text(encoding='utf-8'))
    cats = {c['id']: c for c in taxonomy['categories']}
    assert 'Video tools' in cats, 'the panel shows the category id, so the id is the name'
    assert cats['Video tools']['section'] == 'Other'

    # The panel renders category.id; the constants it falls back to when the taxonomy
    # cannot be fetched have to agree, or the open section loses a heading.
    sidebar = SIDEBAR.read_text(encoding='utf-8')
    for marker in ('"Video tools": "fas fa-photo-video"', '"Video tools",'):
        assert marker in sidebar, f'sidebar.js lacks {marker}'

    for url in VIDEO_APPS:
        cfg = config(url)
        assert cfg['metadata']['category'] == 'Video tools', url
        assert (APPS / url / 'wf.json').exists(), url
        assert list((APPS / url).glob('thumbnail*')), f'{url} ships no thumbnail'


def test_every_video_app_can_slice_the_clip():
    """Start Time / Duration are Basic options, and 0 duration means the whole clip."""
    for url in VIDEO_APPS:
        wf = workflow(url)
        slices = nodes_of_type(wf, 'Video Slice')
        assert len(slices) == 1, f'{url}: expected exactly one Video Slice'
        slice_id, node = next(iter(slices.items()))
        assert node['inputs']['duration'] == 0, \
            f'{url}: duration must default to 0 (unlimited), never a hidden cap'

        cfg = config(url)
        for key in ('start_time', 'duration'):
            entry = bound(cfg, '%s.inputs.%s' % (slice_id, key))
            assert entry, f'{url}: {key} is not bound to {slice_id}'
            assert entry['layout']['region'] == 'basic', \
                f'{url}: {key} belongs among the Basic options'
        assert '0 = whole clip' in bound(cfg, '%s.inputs.duration' % slice_id)['label'], \
            'the label has to say what 0 means'

        loader_id = next(iter(nodes_of_type(wf, 'LoadVideo')))
        assert source_of(node['inputs']['video']) == (loader_id, 0), \
            f'{url}: the slice must read the loaded clip'


def test_the_sam3_app_can_save_its_masks():
    """The template has no save node, and a MASK cannot go straight into SaveImage."""
    wf = workflow('video-segmentation')
    mask_to_image = nodes_of_type(wf, 'MaskToImage')
    save = nodes_of_type(wf, 'SaveImage')
    assert len(mask_to_image) == 1, 'the mask save needs a MaskToImage'
    assert len(save) == 1, 'and a SaveImage (SaveVideo cannot take a MASK)'

    m2i_id, m2i = next(iter(mask_to_image.items()))
    save_id = next(iter(save))
    assert source_of(save[save_id]['inputs']['images']) == (m2i_id, 0)
    assert source_of(m2i['inputs']['mask'])[0] in nodes_of_type(wf, 'SAM3_Detect'), \
        'the mask comes from the segmenter, not a placeholder'

    entry = bound(config('video-segmentation'), '%s.inputs.filename_prefix' % save_id)
    assert entry and entry['layout']['region'] == 'basic', \
        'the mask filename is a Basic option'


def test_the_upscale_apps_process_frames_in_batches():
    """A whole clip through ImageUpscaleWithModel is what runs a long one out of VRAM."""
    for url in BATCHED:
        wf = workflow(url)
        rebatch = nodes_of_type(wf, 'RebatchImages')
        concat = nodes_of_type(wf, 'ConcatenateVideo')
        assert len(rebatch) == 1 and len(concat) == 1, url
        rebatch_id, rb = next(iter(rebatch.items()))
        concat_id, cc = next(iter(concat.items()))

        entry = bound(config(url), '%s.inputs.batch_size' % rebatch_id)
        assert entry and entry['layout']['region'] == 'advanced', \
            f'{url}: Frame Batch Size is an Advanced option'

        # frames: GetVideoComponents -> RebatchImages -> upscaler
        gvc_id, _ = source_of(rb['inputs']['images'])
        assert wf[gvc_id]['class_type'] == 'GetVideoComponents'
        up_id, up = next(iter(nodes_of_type(wf, 'ImageUpscaleWithModel').items()))
        assert source_of(up['inputs']['image']) == (rebatch_id, 0)

        # each chunk becomes its own video, then the chunks are stitched back together.
        # (The combined app has a second CreateVideo downstream of the interpolation,
        # so pick the one reading the upscaler instead of assuming there is only one.)
        cv_id, cv = next((k, v) for k, v in nodes_of_type(wf, 'CreateVideo').items()
                         if source_of(v['inputs']['images']) == (up_id, 0))
        assert 'audio' not in cv['inputs'], \
            'a per-chunk video must not carry the whole track (it would repeat)'
        assert source_of(cc['inputs']['videos.video0']) == (cv_id, 0), \
            'the chunk videos are handed to ConcatenateVideo as a list '\
            '(its autogrow group is 0-based: videos.video0, not video1)'
        assert source_of(cc['inputs']['complete_audio']) == (gvc_id, 1), \
            'the soundtrack is restored once, at the end'

        # the stitched video goes straight to the save (standalone) or on into the
        # interpolation half (combined) - either way something must consume it
        consumers = [k for k, v in wf.items() for val in v['inputs'].values()
                     if source_of(val) == (concat_id, 0)]
        assert consumers, 'the stitched video has to feed the rest of the pipeline'
        if url == 'video-upscale-with-model':
            save_id = next(k for k, v in wf.items() if v['class_type'] == 'SaveVideo')
            assert source_of(wf[save_id]['inputs']['video']) == (concat_id, 0)

    # Interpolation is deliberately not chunked: FrameInterpolate works pair by pair,
    # so a chunk boundary would drop the pair joining two chunks.
    assert not nodes_of_type(workflow('video-frame-interpolation'), 'RebatchImages')


def test_the_model_dropdowns_offer_only_their_models():
    assert bound(config('video-frame-interpolation'),
                 '16_1.inputs.model_name')['options'] == INTERP_MODELS
    assert bound(config('video-upscale-with-model'),
                 '1.inputs.model_name')['options'] == UPSCALE_MODELS

    combo = config('video-interpolate-upscale')
    assert bound(combo, '1.inputs.model_name')['options'] == COMBO_UPSCALE_MODELS
    assert bound(combo, '16_1.inputs.model_name')['options'] == INTERP_MODELS


def test_the_variants_are_what_makes_the_model_choice_obvious():
    """A dropdown of four models is a question; a row of variants is an answer.

    Each of these apps is one model choice, so the choice is a mode button now - and
    the dropdown lists exactly what its variants can bind.
    """
    architectures = json.loads((DATA / 'architectures.json').read_text(encoding='utf-8'))

    upscalers = architectures['UPSCALE MODELS']['variants']
    assert [v['label'] for v in upscalers.values()] == \
        ['ESRGAN x2', 'ESRGAN x4', 'UltraSharp x4', 'AnimeSharp x4'], \
        'the upscale apps offer one variant per model'
    assert sorted(p for v in upscalers.values() for p in v['pick'].values()) == \
        sorted(UPSCALE_MODELS), 'covering every model they declare'

    interp = architectures['FRAME INTERPOLATION']['variants']
    assert [v['label'] for v in interp.values()] == ['FILM net', 'RIFE 4.26']
    assert sorted(p for v in interp.values() for p in v['pick'].values()) == \
        sorted(INTERP_MODELS), 'and nothing else: the other RIFE builds are deleted'

    combo = architectures['VIDEO INTERPOLATE UPSCALE']['variants']
    assert len(combo) == 2, 'one variant per interpolation model'
    for variant in combo.values():
        assert variant['pick']['upscale_model'] == 'RealESRGAN_x2.pth', \
            'both pair the interpolation model with ESRGAN x2'
    assert sorted(v['pick']['interpolation_model'] for v in combo.values()) == \
        sorted(INTERP_MODELS)

    # And the apps themselves are no longer the place the choice lives: their model
    # dropdowns are what Custom mode offers, not the only way in.
    for url in ('video-frame-interpolation', 'video-interpolate-upscale'):
        assert config(url)['metadata']['architecture'] in architectures


def test_the_combined_app_runs_both_stages():
    wf = workflow('video-interpolate-upscale')
    assert len(nodes_of_type(wf, 'LoadVideo')) == 1, 'one clip in'
    assert len(nodes_of_type(wf, 'SaveVideo')) == 1, 'one video out'

    concat_id = next(iter(nodes_of_type(wf, 'ConcatenateVideo')))
    frames = [k for k, v in nodes_of_type(wf, 'GetVideoComponents').items()
              if source_of(v['inputs']['video']) == (concat_id, 0)]
    assert len(frames) == 1, 'the interpolation half reads the stitched (upscaled) video'

    interp_id, interp = next(iter(nodes_of_type(wf, 'FrameInterpolate').items()))
    assert source_of(interp['inputs']['images']) == (frames[0], 0)

    final = [k for k, v in nodes_of_type(wf, 'CreateVideo').items()
             if source_of(v['inputs']['images']) == (interp_id, 0)]
    assert len(final) == 1, 'the interpolated frames are turned back into a video'
    save_id = next(k for k, v in wf.items() if v['class_type'] == 'SaveVideo')
    assert source_of(wf[save_id]['inputs']['video']) == (final[0], 0), \
        'the saved video is the interpolated one'


def test_the_result_pane_names_the_save_node():
    """A video app's output must not read "Save Image" (make_app's old default)."""
    for url in VIDEO_APPS:
        cfg, wf = config(url), workflow(url)
        out = cfg['outputs'][0]
        save_class = wf[out['nodeId']]['class_type']
        assert out['label'] == {'SaveVideo': 'Save Video', 'SaveImage': 'Save Image'}[save_class], \
            f'{url}: output labelled {out["label"]!r} for a {save_class}'


def test_the_canny_tools_need_no_model():
    """Both are pure node graphs, so nothing is downloaded and nothing can be gated."""
    architectures = json.loads((DATA / 'architectures.json').read_text(encoding='utf-8'))
    arch = architectures['CANNY EDGES']
    assert arch['models'] == [], 'ComfyUI ships the Canny node itself'
    assert arch['variants'] == {}

    for url in ('image-to-canny', 'video-to-canny'):
        cfg = config(url)
        assert cfg['metadata']['architecture'] == 'CANNY EDGES', url
        assert cfg['metadata']['models'] == [], f'{url} must declare no models'

        canny = nodes_of_type(workflow(url), 'Canny')
        assert len(canny) == 1, f'{url}: expected exactly one Canny node'
        node_id, node = next(iter(canny.items()))
        assert node['inputs']['low_threshold'] == 0.4 and node['inputs']['high_threshold'] == 0.8

        for threshold in ('low_threshold', 'high_threshold'):
            entry = bound(cfg, '%s.inputs.%s' % (node_id, threshold))
            assert entry, f'{url}: {threshold} is not bound'
            assert entry['precision'] == 2, 'a threshold is a two-decimal number'


def test_the_animate_app_offers_base_and_distilled_in_one_graph():
    """Two templates, one app: the variant swaps the model and the step count.

    The base template wires a LightX2V distill LoRA into the graph, the distilled one
    carries a different transformer and no LoRA. The LoRA node is bypassed in the
    app's copy (the *variant* attaches it), so the distilled variant never asks for a
    file its graph would not use.
    """
    cfg = config('video-wan-animate')
    wf = workflow('video-wan-animate')
    architectures = json.loads((DATA / 'architectures.json').read_text(encoding='utf-8'))
    variants = architectures['WAN ANIMATE 2']['variants']

    assert list(variants) == ['BASE', 'DISTILLED'], 'Base first, then Distilled'
    assert variants['BASE']['pick']['Diffusion_model'] == 'wan_animate_2_int8_convrot.safetensors'
    assert variants['DISTILLED']['pick']['Diffusion_model'] == \
        'wan_animate_2_distill_int8_convrot.safetensors'
    assert variants['BASE']['loras'], 'the base model needs its 4-step distill LoRA'
    assert 'loras' not in variants['DISTILLED'], 'the distilled transformer needs none'
    for variant in variants.values():
        assert variant['settings']['Steps'], 'each variant sets its own step count'

    assert not nodes_of_type(wf, 'LoraLoaderModelOnly'), \
        'the in-graph LoRA node is bypassed: the variant attaches it'
    unets = {k: v for k, v in wf.items() if v['class_type'] == 'UNETLoader'}
    assert len(unets) == 1, 'one transformer node, whichever variant is picked'

    # The variant settings are label-matched, so the labels have to exist.
    labels = {s['label'].lower() for s in cfg['steppers']}
    for key in (variants['BASE']['settings']):
        assert key.lower() in labels, f'no stepper is labelled {key!r}'

    # Both media inputs are bound, and the driving clip can be trimmed.
    loaders = {entry['nodePath'] for entry in cfg['imageLoaders']}
    assert loaders == {'189.inputs.image', '240.inputs.file'}, \
        'a reference image and a driving video'
    slice_id = next(iter(nodes_of_type(wf, 'Video Slice')))
    assert wf[slice_id]['inputs']['duration'] == 0, 'the whole clip by default'
    assert bound(cfg, '%s.inputs.start_time' % slice_id), 'Start Time is offered'
    for reader in nodes_of_type(wf, 'GetVideoComponents'):
        assert wf[reader]['inputs']['video'][0] == slice_id, \
            'every component reader must read the sliced clip'


def test_the_fun_control_app_binds_every_loader_it_needs():
    """A pose-driven app: the union patch, the pose pack and the detector are all real."""
    cfg = config('video-minimax-h3-fun-control')
    wf = workflow('video-minimax-h3-fun-control')
    architectures = json.loads((DATA / 'architectures.json').read_text(encoding='utf-8'))
    arch = architectures['MINIMAX H3 FUN CONTROL']

    # Every group's file is declared by the app's metadata, so the panel can offer it.
    declared = set(cfg['metadata']['models'])
    for group in arch['models']:
        for entry in group['files']:
            assert entry['file'] in declared, entry['file']

    # ... and every loader the graph uses has a dropdown to bind it through.
    loaders = {(g['node']['nodeType'], g['node']['input']) for g in arch['models']}
    dropdowns = {(d['url'], d['key']) for d in cfg['dropdowns']}
    for node_type, input_name in loaders:
        assert (node_type, input_name) in dropdowns, \
            '%s.%s has no dropdown, so its variant/Base binding would be skipped' % (node_type, input_name)

    # Two VAEs share VAELoader.vae_name: the binding pairs them in declaration order,
    # so the video VAE must be declared before the audio one.
    vae_dropdowns = [d['nodePath'] for d in cfg['dropdowns'] if d['url'] == 'VAELoader']
    assert vae_dropdowns == ['119.inputs.vae_name', '120.inputs.vae_name'], vae_dropdowns
    vae_groups = [g['id'] for g in arch['models'] if g['node']['nodeType'] == 'VAELoader']
    assert vae_groups == ['video_vae', 'audio_vae'], vae_groups

    assert nodes_of_type(wf, 'MiniMaxH3FunControlNetApply'), 'the control patch is applied'
    assert nodes_of_type(wf, 'Video Slice'), 'the clip can be trimmed'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    passed = 0
    for name, fn in tests:
        fn()
        passed += 1
        print(f'  ok  {name}')
    print(f'{passed}/{len(tests)} video-tool tests passed')


if __name__ == '__main__':
    main()


