"""The "+Lora" button has to work on a graph exported from a subgraph."""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANAGER_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'LoraWorkflowManager.js'
MOSS_WF = ROOT / 'web' / 'apps' / 'moss-text-to-image' / 'wf.json'
HARNESS = ROOT / 'tests' / 'js' / 'lora_manager.harness.mjs'


class SkippedTest(Exception):
    """Raised when the harness cannot run here (node is missing)."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


def test_a_graph_key_is_never_read_as_a_number():
    """`"18_1"` is a key, and `parseInt("18_1", 10)` is `18` - a key nothing holds.

    The builder expands a subgraph instance to `<outer>_<inner>` (see `ui_to_api.py`),
    so every id in such an app is that shape. Only the "next free id" may look at the
    numeric part, through the one helper that says so.
    """
    source = MANAGER_JS.read_text(encoding='utf-8')

    assert 'const numericId = (id) => parseInt(id, 10) || 0;' in source, \
        'the numeric part is read in one named place'
    assert 'parseInt(id, 10)' not in source.replace(
        'const numericId = (id) => parseInt(id, 10) || 0;', ''), \
        'no lookup may parse a workflow key - that is how "18_1" became 18'
    assert 'parseInt(modelInput[0], 10)' not in source, \
        'a link holds the id as written in the graph'
    assert 'String(modelInput[0]) === String(' in source, \
        'links are matched as text'

    # The loader a block is built for keeps the key it was found under...
    assert '.map(([id, node]) => ({ id, ...node }))' in source, \
        'the loader carries its raw key'
    # ...and `addLora` looks exactly that key up, which is the check that failed.
    assert 'if (!this.workflow[modelLoaderId])' in source, \
        'the loader is looked up by key'
    assert 'Model loader node with ID ${modelLoaderId} does not exist.' in source, \
        'the message the "+Lora" alert showed'


def test_the_next_free_id_ignores_the_expanded_part():
    """An added node is a plain id, so it may only be compared by number."""
    source = MANAGER_JS.read_text(encoding='utf-8')

    highest = source.split('_getHighestNodeId() {', 1)[1].split('\n    }', 1)[0]
    assert 'numericId' in highest, 'the high-water mark reads the numeric part'
    assert 'Math.max(' in highest, 'and takes the highest of them'


def test_the_reported_app_is_one_of_them():
    """moss-text-to-image is the app that failed; keep the harness pointed at it."""
    workflow = json.loads(MOSS_WF.read_text(encoding='utf-8'))
    keys = list(workflow)

    assert any(re.fullmatch(r'\d+_\d+', key) for key in keys), \
        'a subgraph-exported app has "<outer>_<inner>" keys'
    loaders = [key for key, node in workflow.items()
               if node.get('class_type') in ('UNETLoader', 'CheckpointLoaderSimple')]
    assert loaders, 'and one of its nodes is the model loader the button needs'
    assert re.fullmatch(r'\d+_\d+', loaders[0]), \
        'that loader is an inner node, which is the key the button failed to find'


def test_lora_manager_harness():
    """The click itself, executed: see tests/js/lora_manager.harness.mjs."""
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
    print(f'{passed}/{len(tests)} LoRA manager tests passed')


if __name__ == '__main__':
    main()
