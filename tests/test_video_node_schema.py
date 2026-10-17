"""The video graphs, checked against ComfyUI's own node definitions.

The frame-batching chain (`RebatchImages` -> per-chunk `CreateVideo` ->
`ConcatenateVideo`) could not be *executed* when it was written (ComfyUI was down), so
it is checked against the schemas on disk: every input key a graph writes must exist on
the node - autogrow groups and dotted dynamic-combo keys included - and the
list-execution pair (`is_output_list` / `is_input_list`) is what makes batching work.

Skipped when ComfyUI is not on disk.
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APPS = ROOT / 'web' / 'apps'
COMFY_EXTRAS = Path('/workspace/ComfyUI/comfy_extras')

# Every video app graph, plus the image tools (same nodes, same rules).
APP_GLOBS = ('video-*', 'image-*')

INPUT_RE = re.compile(r'\.Input\(\s*"([^"]+)"')


class Skipped(Exception):
    """ComfyUI is not on disk here, so there is nothing to check against."""


def declared_inputs():
    """({node_id: (file, {names})}, {file: {names}}) out of comfy_extras' schemas.

    The names come from ``<Type>.Input("name")``, which covers ComfyUI's custom IO
    types (``FrameInterpolationModel.Input("interp_model")``) as well as the plain
    ``io.Image.Input(...)``. Two shapes need the extra fallback map:

    * an input built by a **helper** (``SaveVideo``'s ``codec`` comes from
      ``_save_video_codec_input``), and
    * a schema whose window runs past the node.

    So a key counts as declared when *the node* declares it or *the file defining the
    node* does - which still catches a genuine typo while ignoring how it was written.
    """
    if not COMFY_EXTRAS.is_dir():
        raise Skipped('ComfyUI is not on disk')
    per_node, per_file = {}, {}
    for path in COMFY_EXTRAS.glob('*.py'):
        source = path.read_text(encoding='utf-8', errors='replace')
        per_file[path.name] = {m.group(1) for m in INPUT_RE.finditer(source)}
        for match in re.finditer(r'node_id="([A-Za-z0-9_]+)"', source):
            # Stop at the node's own methods, and never cross into the next node.
            block = source[match.end():match.end() + 4000]
            block = block.split('def execute', 1)[0]
            block = re.split(r'node_id="', block)[0]
            names = {m.group(1) for m in INPUT_RE.finditer(block)}
            if names:
                per_node.setdefault(match.group(1), (path.name, set()))[1].update(names)
    return per_node, per_file


def graph_files():
    for pattern in APP_GLOBS:
        for folder in sorted(APPS.glob(pattern)):
            wf = folder / 'wf.json'
            if wf.is_file():
                yield folder.name, json.loads(wf.read_text(encoding='utf-8'))


def test_every_bound_input_exists_on_the_node():
    """A key the node does not declare is a graph that dies at queue time."""
    per_node, per_file = declared_inputs()
    unknown = []
    checked = 0
    seen = set()

    for url, wf in graph_files():
        for node_id, node in wf.items():
            class_type = node['class_type']
            entry = per_node.get(class_type)
            if not entry:
                continue                      # a node defined outside comfy_extras
            source_file, node_names = entry
            declared = node_names | per_file.get(source_file, set())
            seen.add(class_type)
            for key in node['inputs']:
                checked += 1
                # Autogrow and dynamic combo children are addressed as "group.field";
                # only the part before the dot is a declared input name.
                if key.split('.')[0] in declared:
                    continue
                unknown.append(f'{url}.{node_id} ({class_type}) writes {key!r}, '
                               f'but {source_file} declares {sorted(node_names)}')

    assert seen, 'no graph node matched a schema - the parser is broken'
    assert checked > 200, f'only {checked} bindings checked - the parser is too narrow'
    assert not unknown, '\n'.join(unknown[:10])


def test_batching_relies_on_the_list_execution_pair():
    source = (COMFY_EXTRAS / 'nodes_rebatch.py').read_text(encoding='utf-8')
    images = source.split('node_id="RebatchImages"', 1)[1].split('class ', 1)[0]
    assert 'is_input_list=True' in images
    assert 'is_output_list=True' in images, 'the chunks are handed out as a list'

    video = (COMFY_EXTRAS / 'nodes_video.py').read_text(encoding='utf-8')
    concat = video.split('node_id="ConcatenateVideo"', 1)[1].split('class ', 1)[0]
    assert 'is_input_list=True' in concat, 'the chunk videos arrive as one list'
    assert 'complete_audio' in concat, 'the soundtrack is restored once, at the end'

    upscale = (COMFY_EXTRAS / 'nodes_upscale_model.py').read_text(encoding='utf-8')
    node = upscale.split('node_id="ImageUpscaleWithModel"', 1)[1].split('class ', 1)[0]
    assert 'is_input_list' not in node, \
        'no flag is exactly why a list handed to it runs once per chunk'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    passed = 0
    for name, fn in tests:
        try:
            fn()
        except Skipped as skipped:
            print(f'  skip  {name}: {skipped}')
            continue
        passed += 1
        print(f'  ok  {name}')
    print(f'{passed}/{len(tests)} node-schema tests passed')


if __name__ == '__main__':
    main()
