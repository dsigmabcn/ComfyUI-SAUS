"""A combo has to survive a node type that /object_info cannot answer for.

An app config names the node a dropdown reads its option list from in `url`, and
that value is not always a node type: the App Builder used to save ComfyUI's
per-node uuid (`c291ceec-...`), which turned the widget into "Missing input ..."
where the Advanced tab should show a dropdown. The widget therefore keeps the
config's url as its first guess - several apps point a combo at another node on
purpose, e.g. a `sampler_name` list served by KSampler for a KSamplerSelect -
and falls back to the class the workflow itself names for the node, which is the
fallback ``AspectRatioSelector`` already used.

The behaviour is covered by the browser-free harness next to this file
(``tests/js/dropdown_lookup.harness.mjs``), run through node when it is
installed. Runs under pytest or directly (``python tests/test_dropdown_lookup.py``).
"""

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


def test_dropdown_harness():
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{HARNESS.name} needs node, which is not installed here')

    result = subprocess.run([node, str(HARNESS)], cwd=str(ROOT), capture_output=True, text=True)
    assert result.returncode == 0, f'{HARNESS.name} failed:\n{result.stdout}\n{result.stderr}'


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
