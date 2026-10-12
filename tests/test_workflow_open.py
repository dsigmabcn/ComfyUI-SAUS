"""Opening a SAUS app's workflow in ComfyUI.

The feature is cut in two: ``web/saus_browser/js/workflow_export.js`` (the ⤴
button) saves the app's graph and opens ComfyUI with a ``?saus_workflow=``
parameter, and ``web/core/js/common/scripts/saus_open_workflow.js`` (injected
into the ComfyUI page) reads it and puts the graph in a new workflow tab.

The contract between the two halves is checked here, cheaply. The behaviour
itself needs a running ComfyUI and a browser, so it is covered by the two
browser-free JS harnesses next to this file, which are run through node when it
is installed. Runs under pytest or directly
(``python tests/test_workflow_open.py``).
"""

import importlib.util
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OPEN_WORKFLOW_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'scripts' / 'saus_open_workflow.js'
EXPORT_JS = ROOT / 'web' / 'saus_browser' / 'js' / 'workflow_export.js'
TABS_JS = ROOT / 'web' / 'saus_browser' / 'js' / 'tabs.js'
MAIN_JS = ROOT / 'web' / 'core' / 'main.js'
HARNESSES = ROOT / 'tests' / 'js'
CONSTANTS_PY = ROOT / 'saus' / 'constants.py'

QUERY_PARAM = 'saus_workflow'


class SkippedTest(Exception):
    """Raised when a harness cannot run here (node is missing)."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


def _constants():
    """saus/constants.py on its own: importing the package pulls in ComfyUI."""
    spec = importlib.util.spec_from_file_location('saus_constants_for_tests', CONSTANTS_PY)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_both_halves_use_the_same_parameter():
    writer = EXPORT_JS.read_text(encoding='utf-8')
    reader = OPEN_WORKFLOW_JS.read_text(encoding='utf-8')

    assert re.search(rf"searchParams\.set\('{QUERY_PARAM}'", writer), \
        'the ⤴ button must pass the workflow url to ComfyUI'
    assert re.search(rf"QUERY_PARAM = '{QUERY_PARAM}'", reader), \
        'the extension must read the parameter the ⤴ button writes'


def test_comfyui_serves_the_extension():
    # ComfyUI imports every .js file of a node's WEB_DIRECTORY, which is how the
    # extension gets into the ComfyUI page at all.
    web_directory = _constants().WEB_DIRECTORY
    served = (ROOT / web_directory / OPEN_WORKFLOW_JS.name).resolve()

    assert served == OPEN_WORKFLOW_JS.resolve(), \
        f'{OPEN_WORKFLOW_JS.name} is outside {web_directory}, so ComfyUI would never load it'


def test_the_app_hands_over_the_graph_it_is_running():
    source = MAIN_JS.read_text(encoding='utf-8')

    assert 'window.SAUS' in source, 'the app must expose the workflow it runs'
    for part in ('isReady', 'getVariant', 'getWorkflow'):
        assert re.search(rf'window\.SAUS\.{part} = ', source), f'window.SAUS.{part} is missing'

    # The graph must be copied before it is touched: the export may never
    # mutate the workflow the app is running with.
    assert re.search(r'const snapshot = JSON\.parse\(JSON\.stringify\(workflow\)\);\s*'
                     r'collectPromptValues\(snapshot\)', source), \
        'getWorkflow must collect the prompt boxes into a copy, not into the live workflow'

    # ...and collecting them the same way a Run does, so the export matches it.
    assert re.search(r'collectPromptValues\(workflow\)', source), \
        'a Run must collect the prompt boxes through the same helper'


def test_the_browser_reads_what_the_app_exposes():
    shell = EXPORT_JS.read_text(encoding='utf-8')

    assert re.search(r'contentWindow[\s\S]{0,60}\.SAUS', shell), \
        'the browser must read the app workflow from the app page itself'
    assert re.search(r'isReady', shell), 'and wait for the app to be ready'
    assert re.search(r'exportWorkflowToComfyUI\(tab, \(\) =>', TABS_JS.read_text(encoding='utf-8')), \
        'the app tab must pass its own iframe to the export'


def test_the_workflow_lands_in_a_new_tab():
    source = OPEN_WORKFLOW_JS.read_text(encoding='utf-8')

    # A null target is what makes ComfyUI build a new workflow for the graph
    # instead of replacing the workflow the window restored.
    assert re.search(r'loadApiJson\(data,\s*null\)', source), \
        'an API graph must be handed over as a workflow of its own'
    assert re.search(r'loadGraphData\(data,\s*true,\s*true,\s*null\)', source), \
        'a UI graph must be handed over as a workflow of its own'


def test_the_window_is_reserved_before_the_first_await():
    body = EXPORT_JS.read_text(encoding='utf-8')
    body = body[body.index('export async function exportWorkflowToComfyUI('):]
    code = re.sub(r'^\s*//[^\n]*', '', body, flags=re.M)      # comments mention awaits too

    assert code.index("window.open('', '_blank')") < code.index('await '), \
        'the ComfyUI window must be opened during the click: after an await the browser blocks it'


def _run_harness(harness):
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{harness.name} needs node, which is not installed here')

    result = subprocess.run([node, str(harness)], cwd=str(ROOT), capture_output=True, text=True)
    assert result.returncode == 0, f'{harness.name} failed:\n{result.stdout}\n{result.stderr}'


def test_open_workflow_harness():
    _run_harness(HARNESSES / 'open_workflow.harness.mjs')


def test_workflow_export_harness():
    _run_harness(HARNESSES / 'workflow_export.harness.mjs')


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
    print(f'{passed}/{len(tests)} workflow-open tests passed')


if __name__ == '__main__':
    main()
