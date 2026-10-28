"""What the SAUS pages must (not) do to the ComfyUI page and to the UI."""

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXTENSION_DIR = ROOT / 'web' / 'core' / 'js' / 'common' / 'scripts'
FAVICON_JS = EXTENSION_DIR / 'favicon.js'
APP_MAIN_JS = ROOT / 'web' / 'core' / 'main.js'
SIDEBAR_JS = ROOT / 'web' / 'saus_browser' / 'js' / 'sidebar.js'
SETTINGS_HARNESS = ROOT / 'tests' / 'js' / 'settings.harness.mjs'


class SkippedTest(Exception):
    """Raised when a harness cannot run here (node is missing)."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


def _module_level_lines(path):
    """Lines that are not inside a function/object (rough: no leading indent)."""
    return [line for line in path.read_text(encoding='utf-8').split('\n')
            if line and not line[0].isspace() and not line.startswith(('//', '/*', '*', 'import', 'export', '}'))]


def test_nothing_touches_the_page_when_comfyui_imports_it():
    # The favicon is set by the app pages themselves, never on import.
    assert 'setFaviconStatus.Default();' in APP_MAIN_JS.read_text(encoding='utf-8'), \
        'the app runtime should ask for the SAUS favicon'
    assert 'setFaviconStatus.Default();' not in FAVICON_JS.read_text(encoding='utf-8'), \
        'favicon.js runs on every ComfyUI page - it must not set a favicon on import'

    # No other module in the extension folder should run code on import either.
    for path in sorted(EXTENSION_DIR.glob('*.js')):
        for line in _module_level_lines(path):
            stripped = line.rstrip()
            is_declaration = re.match(
                r'(const|let|var|function|async function|class)\b', stripped)
            is_side_effect = re.match(r'[\w$.]+\(.*\)\s*;?$', stripped) \
                and 'registerExtension' not in stripped
            assert is_declaration or not is_side_effect, (
                f'{path.name} runs "{stripped.strip()}" at import time, which would '
                f'also happen on every ComfyUI page'
            )


def test_the_rail_switches_sections_on_a_click():
    source = SIDEBAR_JS.read_text(encoding='utf-8')

    assert re.search(r"rail\.addEventListener\('click'", source), \
        'clicking a rail icon must switch the section'
    assert re.search(r'toggleSection\(', source), 'the click handler switches the section'

    hover_switching = re.search(
        r"rail\.addEventListener\('(mouseover|mouseenter|focusin)',[\s\S]{0,220}?(setOpenSection|previewSection)",
        source)
    assert not hover_switching, \
        'hovering a rail icon must not change the section - only a click does'


def test_the_app_page_ships_no_chrome_of_its_own():
    """Opening ``/saus/<app>`` directly shows the workflow UI, nothing else."""
    content = (ROOT / 'web' / 'core' / 'content.html').read_text(encoding='utf-8')
    assert '<header' not in content, 'the app page should not carry a header element'

    boot = (EXTENSION_DIR / 'corePath.js').read_text(encoding='utf-8')
    assert 'header.js' not in boot, 'nor should the app load a header script'
    assert 'footer.js' in boot, 'the version footer stays'
    assert not (ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'header.js').exists(), \
        'the shared header module should be gone from core'

    app_css = (ROOT / 'web' / 'core' / 'css' / 'main.css').read_text(encoding='utf-8')
    for pattern in (r'^header\s*\{', r'\.header-nav', r'\.logo-text', r'#logo\b', r'#img-logo\b',
                    r'\.appName', r'#right-header', r'#mid\b'):
        assert not re.search(pattern, app_css, re.M), \
            f'the app stylesheet still carries {pattern}'

    fm_header = ROOT / 'web' / 'file_manager' / 'js' / 'header.js'
    assert fm_header.exists(), 'the File Manager keeps the header it shows'
    assert 'insertElement' in fm_header.read_text(encoding='utf-8'), \
        'as the module that fills its <header>'
    fm_main = (ROOT / 'web' / 'file_manager' / 'js' / 'main.js').read_text(encoding='utf-8')
    assert "from './header.js'" in fm_main, 'and it is imported from the page folder'


def test_the_settings_tab_owns_the_version_and_social_sections():
    settings = (ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'settings.js')\
        .read_text(encoding='utf-8')

    assert '<h2>Version</h2>' in settings and 'saus-version' in settings, \
        'the Settings tab shows the installed version'
    assert "'/saus/api/saus-version'" in settings, 'read from the SAUS version endpoint'

    assert '<h2>Social</h2>' in settings and 'settings-social' in settings, \
        'the Settings tab shows the project links'
    for link in ('ko-fi.com', 'github.com/dsigmabcn/ComfyUI-SAUS', 'youtube.com/@koalanation'):
        assert link in settings, f'the Social section is missing {link}'

    # Links that open a new window must not hand it a handle on the page.
    for tag in re.findall(r'<a [^>]*target="_blank"[^>]*>', settings):
        assert 'rel="noopener' in tag, f'external link without rel=noopener: {tag[:60]}'

    # The old separate "settings info" block is gone, not merely unused.
    assert not (ROOT / 'web' / 'saus_browser' / 'js' / 'settings_info.js').exists(), \
        'the settings info block should have been folded into the Settings tab'
    shell = (ROOT / 'web' / 'saus_browser' / 'js' / 'tabs.js').read_text(encoding='utf-8')
    assert 'settings_info' not in shell and 'renderSettingsInfo' not in shell, \
        'nothing should still import the removed settings info block'


def test_settings_harness():
    """The Settings pane's own behaviour (sections, version, styles)."""
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{SETTINGS_HARNESS.name} needs node, which is not installed here')

    result = subprocess.run([node, str(SETTINGS_HARNESS)], cwd=str(ROOT),
                            capture_output=True, text=True)
    assert result.returncode == 0, \
        f'{SETTINGS_HARNESS.name} failed:\n{result.stdout}\n{result.stderr}'


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
    print(f'{passed}/{len(tests)} page-behaviour tests passed')


if __name__ == '__main__':
    main()
