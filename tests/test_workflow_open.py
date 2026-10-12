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
SAUS_DIR = ROOT / 'saus'
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


def test_the_parameter_only_reaches_workflow_files():
    source = OPEN_WORKFLOW_JS.read_text(encoding='utf-8')

    assert re.search(r"ALLOWED_PATH_PREFIXES = \['/api/userdata/', '/saus/'\]", source), \
        'the parameter must be restricted to the shapes this feature produces'
    assert re.search(r'target\.origin !== window\.location\.origin', source), \
        'and to this origin'
    assert re.search(r"includes\('\.\.'\)", source), 'and never a traversal'
    assert re.search(r"get\('Content-Type'\)", source), 'only JSON is read'
    assert re.search(r'MAX_WORKFLOW_BYTES', source) and re.search(r'MAX_WORKFLOW_NODES', source), \
        'and only a workflow-sized document'


def test_the_copy_never_overwrites_a_user_workflow():
    shell = EXPORT_JS.read_text(encoding='utf-8')

    assert 'overwrite=false' in shell, \
        'the save must ask ComfyUI not to overwrite an existing workflow'
    assert re.search(r'status !== 409', shell), 'and number the copy when the name is taken'
    assert re.search(r'\bopener = null', shell), \
        'the opened ComfyUI page must not keep a handle back on the app browser'


def test_every_post_handler_has_a_csrf_guard():
    """POST is a "simple" CORS method, so a cross-site page can send one without a
    preflight and no custom header. Requiring a JSON body - or the SAUS header for
    multipart uploads - forces the preflight this server never answers. (DELETE is
    not a simple method, so the browser preflights those anyway.)
    """
    sources = {path.name: path.read_text(encoding='utf-8') for path in SAUS_DIR.glob('*.py')}

    routes = re.findall(r"\(f?'(/saus/api/[^']+)',\s*'(GET|POST|DELETE)',\s*(\w+)\)", sources['app_manager.py'])
    posts = [(path, name) for path, method, name in routes if method == 'POST']
    assert len(posts) >= 8, f'the route table should list the POST routes, found {len(posts)}'

    for path, name in posts:
        body = next((text for text in sources.values() if f'async def {name}(' in text), None)
        assert body is not None, f'{name} ({path}) has no handler in saus/'

        start = body.index(f'async def {name}(')
        rest = body[start:]
        ends = [index for index in (rest.find('\nasync def '), rest.find('\ndef ')) if index != -1]
        handler = rest[:min(ends) if ends else len(rest)]

        assert re.search(r'require_json\(request\)|require_saus_header\(request\)', handler), \
            f'{name} ({path}) does not guard against cross-site POSTs'


def test_every_handler_that_reads_a_json_body_requires_one():
    """A handler that parses a JSON body must first demand a JSON content type:
    that is what forces the CORS preflight a cross-site page cannot get answered.
    Covers the handlers whose route is not a POST as well (a DELETE that reads a
    body is not protected by the method alone).
    """
    handlers = 0
    for path in sorted(SAUS_DIR.glob('*.py')):
        text = path.read_text(encoding='utf-8')
        for match in re.finditer(r'\n(async def (\w+)_handler\(.*?)\n(?=\nasync def |\ndef |\Z)',
                                 text, re.S):
            handler, name = match.group(1), match.group(2)
            if 'await request.json()' not in handler:
                continue

            handlers += 1
            before_reading = handler[:handler.index('await request.json()')]
            assert re.search(r'require_json\(request\)|require_saus_header\(request\)', before_reading), \
                f'{name}_handler in {path.name} reads a JSON body without requiring one first'

    assert handlers >= 8, f'expected to find the JSON handlers, found {handlers}'


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
