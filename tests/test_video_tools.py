"""The video tools: what every one of them must keep.

Six of these seven apps are ComfyUI ``utility_*`` templates, which are not quite usable
as they ship. Each needs **Start Time / Duration** as Basic options, so a live
``Video Slice`` must sit right after ``LoadVideo`` (the depth template caps it at 5 s,
the SeedVR2 one ships it bypassed behind a ``ComfySwitchNode``);
``utility_video_segment_sam3`` has no save node at all and outputs a MASK, so
``MaskToImage`` + ``SaveImage`` are added; and ``utility-gan_upscaler`` upscales every
frame at once - what runs a long clip out of VRAM - so it is rebuilt as
``RebatchImages`` -> upscale -> ``CreateVideo`` -> ``ConcatenateVideo``.

A regeneration of these graphs would silently undo all three, so they are asserted here.
"""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APPS = ROOT / 'web' / 'apps'
DATA = ROOT / 'web' / 'saus_browser' / 'data'
SIDEBAR = ROOT / 'web' / 'saus_browser' / 'js' / 'sidebar.js'

UPSCALE_MODELS = ['RealESRGAN_x4plus.safetensors', 'RealESRGAN_x2.pth',
                  '4x-UltraSharp.pth', '4x-AnimeSharp.pth']
INTERP_MODELS = ['film_net_fp16.safetensors', 'rife_v4.26.safetensors',
                 'rife_v4.26_heavy.safetensors', 'rife_v4.25.safetensors',
                 'rife_v4.25_heavy.safetensors', 'rife_v4.25_lite.safetensors']

VIDEO_APPS = [
    'video-upscale-seedvr2',
    'video-depth-anything',
    'video-to-pose',
    'video-upscale-with-model',
    'video-frame-interpolation',
    'video-segmentation',
    'video-interpolate-upscale',
]
BATCHED = ['video-upscale-with-model', 'video-interpolate-upscale']


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


def test_all_seven_are_filed_under_video_tools():
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
        assert (APPS / url / 'index.html').exists(), url
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
    assert bound(combo, '1.inputs.model_name')['options'] == UPSCALE_MODELS
    assert bound(combo, '16_1.inputs.model_name')['options'] == INTERP_MODELS


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


