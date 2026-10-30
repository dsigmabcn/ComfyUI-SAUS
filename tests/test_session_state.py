"""The app's memory for a browser session: what it keeps, and what ends it.

Closing an app tab destroys its iframe, so a mistaken close used to lose the settings,
the prompt, the variant, the LoRAs and the results panel. The state lives in
`sessionStorage`, scoped to the server run the shell was handed by
`/saus/api/session` - a reload keeps it, a ComfyUI restart does not.
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / 'tests' / 'js' / 'session_state.harness.mjs'
SESSION_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'scripts' / 'sessionState.js'
APP_MAIN = ROOT / 'web' / 'core' / 'main.js'
SHELL_MAIN = ROOT / 'web' / 'saus_browser' / 'js' / 'main.js'
TABS_JS = ROOT / 'web' / 'saus_browser' / 'js' / 'tabs.js'
SETTINGS_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'settings.js'
SYSTEM_PY = ROOT / 'saus' / 'system.py'
APP_MANAGER_PY = ROOT / 'saus' / 'app_manager.py'


class SkippedTest(Exception):
    """Raised when the harness cannot run here (node is missing)."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


def test_session_state_harness():
    """The store's own behaviour: see tests/js/session_state.harness.mjs."""
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{HARNESS.name} needs node, which is not installed here')

    result = subprocess.run([node, str(HARNESS)], cwd=str(ROOT),
                            capture_output=True, text=True)
    assert result.returncode == 0, (
        f'{HARNESS.name} failed: {result.stdout} {result.stderr}')


def test_the_server_names_the_run_it_is():
    """One stamp per server start - that is what a "new session" is."""
    system = SYSTEM_PY.read_text(encoding='utf-8')
    assert 'SESSION_STAMP = str(int(time.time() * 1000))' in system, \
        'the stamp is computed once, at import'
    assert 'async def session_handler(' in system, 'and served'
    assert "web.json_response({'stamp': SESSION_STAMP}" in system, 'as an opaque value'

    routes = APP_MANAGER_PY.read_text(encoding='utf-8')
    assert "/saus/api/session', 'GET', session_handler" in routes, 'the shell reads it'


def test_the_shell_scopes_the_state_to_that_run():
    shell = SHELL_MAIN.read_text(encoding='utf-8')
    assert "'/saus/api/session'" in shell, 'the shell asks which run this is'
    assert 'isNewServerSession(stored, current)' in shell, 'and compares it with what it had'
    assert 'clearAll()' in shell, 'forgetting the remembered state on a new run'

    tabs = TABS_JS.read_text(encoding='utf-8')
    assert '&session=${encodeURIComponent(state.sessionStamp' in tabs, \
        'every app tab is handed the stamp it should scope its memory to'


def test_an_app_saves_and_restores_its_own_state():
    source = APP_MAIN.read_text(encoding='utf-8')

    assert 'restoreAppState();' in source, 'the app puts its state back while booting'
    assert 'captureAppState()' in source, 'and captures it from what is on screen'
    snapshot = source.split('return {', 1)[1].split('};', 1)[0]
    for kept in ('values', 'prompts', 'mode', 'loras', 'recent'):
        assert re.search(r'\b%s\b' % kept, snapshot), \
            'the snapshot carries "%s"' % kept
    assert "window.addEventListener('pagehide'" in source, \
        'a tab being closed writes it out at once'
    assert 'setTimeout(rememberAppState, 500)' in source, \
        'and a quiet moment after any change, not on every keystroke'
    assert 'pluckValues(remembered.values, workflow)' in source, \
        'a rebuilt app only gets back what it still has'
    assert 'restoreHistory(remembered.recent)' in source, \
        'the results panel comes back with it'
    assert 'queue(' not in source.split('restoreAppState()')[1].split('restoreHistory')[0], \
        'restoring never queues a generation'

    store = SESSION_JS.read_text(encoding='utf-8')
    assert "const PREFIX = 'saus.appstate.v1.'" in store, 'one namespace for the memory'
    assert 'sessionStorage' in store, 'kept where the shell keeps its open tabs'


def test_the_switch_is_there_and_on_by_default():
    """An app page reads the preference itself; the switch only writes it."""
    settings = SETTINGS_JS.read_text(encoding='utf-8')

    assert 'id="remember-app-state"' in settings, 'the Apps section offers the switch'
    assert "get('rememberAppState') !== false" in settings, \
        'on by default: a fresh install remembers'
    assert 'setRememberAppState(' in settings, 'and it persists through the manager'
    assert "set('rememberAppState', on)" in settings

    runtime = APP_MAIN.read_text(encoding='utf-8')
    assert "new PreferencesManager({ rememberAppState: true })" in runtime, \
        'the app page reads the same preference, with the same default'


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
        print('  ok  ' + name)
    print(f'{passed}/{len(tests)} session-state tests passed')


if __name__ == '__main__':
    main()
