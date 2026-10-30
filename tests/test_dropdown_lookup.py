"""A combo has to survive a node type ``/object_info`` cannot answer for."""

import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WIDGETS = ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'widgets'
DROPDOWN_JS = WIDGETS / 'Dropdown.js'
RATIO_JS = WIDGETS / 'AspectRatioSelector.js'
HARNESS = ROOT / 'tests' / 'js' / 'dropdown_lookup.harness.mjs'


class SkippedTest(Exception):
    """Raised when the harness cannot run here (node is missing)."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


def test_the_two_guesses_are_read_from_the_config_then_the_workflow():
    source = DROPDOWN_JS.read_text(encoding='utf-8')

    assert 'get nodeId()' in source and "split('.')[0]" in source, \
        'the node is the first segment of the nodePath'
    assert 'get workflowNodeType()' in source and 'class_type' in source, \
        'the class comes from the graph being run'
    assert 'get nodeTypeCandidates()' in source, 'and both are offered as candidates'

    candidates = source.split('get nodeTypeCandidates()', 1)[1].split('\n  }', 1)[0]
    assert '[this.config.url, this.workflowNodeType]' in candidates, \
        'the config url is tried first, the workflow class second'
    assert 'new Set(' in candidates, 'the same guess twice is one lookup'


def test_the_other_combo_widget_uses_the_same_fallback():
    ratio = RATIO_JS.read_text(encoding='utf-8')

    assert 'this.config.url || this.workflow?.[this.nodeId]?.class_type' in ratio, \
        'AspectRatioSelector derives the class the same way - keep them in step'


def test_an_unusable_type_is_retried_then_reported():
    source = DROPDOWN_JS.read_text(encoding='utf-8')

    assert 'encodeURIComponent(nodeType)' in source, 'node types go into the URL encoded'
    assert 'this.tryNextNodeType(candidates, index)' in source, \
        'a candidate that cannot answer is followed by the next one'
    assert 'loaderData.input.required' not in source, \
        'an unknown type answers with {} - never dereference it unguarded'
    assert 'if (!loaderData || !loaderData.input)' in source, 'the guard that does it'

    message = source.split('displayMissingComponentMessage()', 1)[1]
    assert 'Missing input' in message, 'the wording the UI always had'
    assert 'looked.join' in message, 'and it names every type it asked for'


def test_a_dropdown_can_be_narrowed_to_an_allow_list():
    """An app may offer only the models it is built around."""
    source = DROPDOWN_JS.read_text(encoding='utf-8')

    assert 'this.allowedOptions(options)' in source, \
        'populate() must narrow the combo before it reaches the widget'
    assert 'const only = this.config.options;' in source, 'reading the app allow-list'
    assert 'Array.isArray(only)' in source, 'which is only honoured as a real list'
    assert 'only.filter((name) => available.has(name))' in source, \
        'a name the node does not offer is dropped'
    assert 'return options;' in source, 'and the full list is the fallback'

    # The app that needs it pins exactly the four ESRGAN-family models it is built for.
    config = json.loads((ROOT / 'web' / 'apps' / 'image-upscale-with-model'
                         / 'appConfig.json').read_text(encoding='utf-8'))
    model_dropdown = next(d for d in config['dropdowns'] if d.get('options'))
    assert model_dropdown['options'] == [
        'RealESRGAN_x4plus.safetensors', 'RealESRGAN_x2.pth',
        '4x-UltraSharp.pth', '4x-AnimeSharp.pth',
    ], 'Upscale with Model offers exactly its four models'


def test_dropdown_harness():
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{HARNESS.name} needs node, which is not installed here')

    result = subprocess.run([node, str(HARNESS)], cwd=str(ROOT), capture_output=True, text=True)
    assert result.returncode == 0, f'{HARNESS.name} failed:\n{result.stdout}\n{result.stderr}'


def test_one_object_info_request_per_node_type():
    """Every combo on a page shares one answer per node type - see scripts/objectInfo.js.

    An app with six dropdowns over four classes made ~10 requests for 4 answers, and
    the mode selector then re-asked for the loader classes the dropdowns had just
    fetched. A loader class answers with *every* model on disk, so the repeats are the
    expensive ones.
    """
    shared = (ROOT / 'web' / 'core' / 'js' / 'common' / 'scripts' / 'objectInfo.js')
    source = shared.read_text(encoding='utf-8')

    assert 'export async function getObjectInfo(' in source, 'the one place that asks'
    assert 'cache.has(key)' in source and 'cache.set(key, entry)' in source, 'it caches by key'
    assert 'if (answerable) cache.set' in source, \
        'and never caches an unanswered request, so a retry is still possible'
    assert 'export function clearObjectInfoCache()' in source, \
        'a harness (or a deliberate refresh) can start over'

    # Both combo widgets, and the app runtime's model checks, go through it.
    for name, path in (('Dropdown', DROPDOWN_JS), ('the aspect ratio picker', RATIO_JS)):
        consumer = path.read_text(encoding='utf-8')
        assert 'getObjectInfo(' in consumer, f'{name} uses the shared lookup'
        assert 'fetch(' not in consumer, f'{name} no longer fetches /object_info itself'

    runtime = (ROOT / 'web' / 'core' / 'main.js').read_text(encoding='utf-8')
    assert 'getObjectInfo(' in runtime, 'the mode selector uses it too'
    assert '/object_info/' not in runtime, 'and builds no URL of its own any more'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    passed = 0
    for name, fn in tests:
        try:
            fn()
        except SkippedTest as skipped:
            print(f'  skip  {name}: {skipped}')
            continue
        passed += 1
        print(f'  ok  {name}')
    print(f'{passed}/{len(tests)} combo lookup tests passed')


if __name__ == '__main__':
    main()
