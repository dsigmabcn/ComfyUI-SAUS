"""Themes: Night (default), Day, Fire.

One palette file that every surface imports, a small controller that puts the
choice on ``<html data-theme>``, and nothing else allowed to hardcode a colour.

The behaviour itself is covered by the browser-free harness next to this file
(``tests/js/theme.harness.mjs``), run through node when it is installed. The
rules about *where* colours may come from are checked here, cheaply. Runs under
pytest or directly (``python tests/test_themes.py``).
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
THEMES_CSS = ROOT / 'web' / 'core' / 'css' / 'themes.css'
THEME_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'scripts' / 'theme.js'
SETTINGS_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'settings.js'
SHELL_CSS = ROOT / 'web' / 'saus_browser' / 'css' / 'variables.css'
FM_CSS = ROOT / 'web' / 'file_manager' / 'css' / 'styles.css'
APP_CSS = ROOT / 'web' / 'core' / 'css' / 'main.css'
HARNESS = ROOT / 'tests' / 'js' / 'theme.harness.mjs'

# Pages that must show the remembered theme before their first paint.
EARLY_PAGES = (
    ROOT / 'web' / 'saus_browser' / 'index.html',
    ROOT / 'web' / 'file_manager' / 'index.html',
)

# Pages that must install the controller while they boot.
BOOT_SCRIPTS = (
    ROOT / 'web' / 'core' / 'loadScripts.js',
    ROOT / 'web' / 'saus_browser' / 'js' / 'main.js',
    ROOT / 'web' / 'file_manager' / 'js' / 'main.js',
)

# The only literal colours allowed outside the palette: the three preview
# swatches in the settings picker (they *show* a theme, so they are the point).
SWATCH_COLOURS = {'#14171c', '#e7eaee', '#f4f6f9', '#1b2430', '#0b1622', '#ff4500'}

STORAGE_KEY = 'SausTheme'


class SkippedTest(Exception):
    """Raised when the harness cannot run here (node is missing)."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


def _theme_blocks():
    """{theme id: set of variable names} straight out of themes.css."""
    source = THEMES_CSS.read_text(encoding='utf-8')
    blocks = re.findall(r':root(?:\[data-theme="(\w+)"\])?\s*\{(.*?)\n\}', source, re.S)

    themes = {}
    for name, body in blocks:
        themes[name or 'night'] = set(re.findall(r'(--[\w-]+)\s*:', body))
    return themes


def _declared_variables():
    """Every variable a document can resolve (the palette plus shared extras)."""
    names = set()
    for path in (THEMES_CSS, SHELL_CSS, APP_CSS):
        names |= set(re.findall(r'(--[\w-]+)\s*:', path.read_text(encoding='utf-8')))
    return names


def test_the_three_themes_share_one_variable_set():
    themes = _theme_blocks()
    assert set(themes) == {'night', 'day', 'fire'}, f'unexpected themes: {sorted(themes)}'
    assert '--color-primary' in themes['night'], 'Night must be the block that :root carries'

    themed = {name for name in themes['night']
              if name.startswith(('--color-', '--tag-', '--shadow-'))}
    assert themed, 'the default block should carry the themed variables'

    shared = themes['night'] - {'--border-radius'}
    for theme in ('day', 'fire'):
        missing = themed - themes[theme]
        assert not missing, f'{theme} does not override {sorted(missing)}'
        assert themes[theme] == shared, (
            f'{theme} should override exactly the shared set, off by '
            f'{sorted(themes[theme] ^ shared)}'
        )


def test_day_and_night_keep_their_accents_neutral():
    """Night and Day are *neutral*: the interactive accents are greys, while the
    colours that carry a meaning (danger / success / warning / info) stay hue-d.
    """
    themes = _theme_blocks()
    source = THEMES_CSS.read_text(encoding='utf-8')

    values = {}
    for name, body in re.findall(r':root(?:\[data-theme="(\w+)"\])?\s*\{(.*?)\n\}', source, re.S):
        values[name or 'night'] = dict(re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', body))

    interactive = ('--color-primary', '--color-accent', '--color-accent-hover',
                   '--color-highlight', '--color-button-primary',
                   '--color-button-primary-active', '--color-header-logo-text',
                   '--color-input-range-thumb', '--color-progress-value', '--color-spinner',
                   '--color-spinner-highlight', '--color-secondary',
                   '--color-accent-alt')
    semantic = ('--color-danger', '--color-success', '--color-warning', '--color-info')

    def is_greyscale(value):
        match = re.fullmatch(r'#([0-9a-fA-F]{6})', value.strip())
        if not match:
            return False
        r, g, b = (int(match.group(1)[i:i + 2], 16) for i in (0, 2, 4))
        return r == g == b

    for theme in ('night', 'day'):
        for name in interactive:
            assert is_greyscale(values[theme][name]), \
                f'{theme} {name} = {values[theme][name]} is not a neutral grey'
        for name in semantic:
            assert not is_greyscale(values[theme][name]), \
                f'{theme} {name} lost its colour - status colours stay coloured'

    assert set(themes) == {'night', 'day', 'fire'}


def test_every_surface_imports_the_single_palette():
    for path in (APP_CSS, FM_CSS, SHELL_CSS):
        source = path.read_text(encoding='utf-8')
        assert 'themes.css' in source, f'{path.name} does not use the shared palette'
        own_palette = re.search(r':root\s*\{[^}]*--color-primary', source, re.S)
        assert not own_palette, f'{path.name} defines its own palette again'


def test_no_component_hardcodes_a_colour():
    for path in sorted((ROOT / 'web').rglob('*.css')):
        if path.name == 'themes.css' or 'min.js' in path.name:
            continue
        source = re.sub(r'/\*.*?\*/', '', path.read_text(encoding='utf-8'), flags=re.S)
        literals = re.findall(r':[^;{}]*#[0-9a-fA-F]{3,8}\b', source)
        assert not literals, f'{path.relative_to(ROOT)} hardcodes {literals[:3]} - use var(--...)'

    literals = set(re.findall(r'#[0-9a-fA-F]{3,8}\b', SETTINGS_JS.read_text(encoding='utf-8')))
    assert literals <= SWATCH_COLOURS, \
        f'{SETTINGS_JS.name} hardcodes {sorted(literals - SWATCH_COLOURS)} - use var(--...)'


def test_every_variable_used_is_defined():
    # Room for ComfyUI's own tokens: the rail entry is styled *inside* ComfyUI,
    # so it may legitimately read a tone from the ComfyUI frontend one day rather
    # than from this palette. Empty today (it only sets --sidebar-icon-size).
    comfyui_tokens = set()

    defined = _declared_variables()
    missing = {}

    paths = list((ROOT / 'web').rglob('*.css')) + list((ROOT / 'web').rglob('*.js')) \
        + list((ROOT / 'web').rglob('*.html'))
    for path in paths:
        if 'min.js' in path.name:
            continue
        # Comments talk about variables too ("ComfyUI's rule reads
        # var(--sidebar-icon-size)") - only real usages count.
        source = re.sub(r'/\*.*?\*/', '', path.read_text(encoding='utf-8', errors='ignore'), flags=re.S)
        for name in set(re.findall(r'var\((--[\w-]+)', source)):
            if name not in defined and name not in comfyui_tokens:
                missing.setdefault(name, []).append(path.name)

    assert not missing, f'used but never defined: {missing}'


def test_the_choice_has_exactly_one_home():
    source = THEME_JS.read_text(encoding='utf-8')
    assert re.search(rf"STORAGE_KEY = '{STORAGE_KEY}'", source), 'theme.js must own the key'

    # The pages read the same key before painting (that is what avoids a flash),
    # so the literal has to keep matching.
    for path in EARLY_PAGES:
        assert f"localStorage.getItem('{STORAGE_KEY}')" in path.read_text(encoding='utf-8'), \
            f'{path.name} does not read the theme early'

    # ...and the picker must offer what theme.js knows, not its own list.
    settings = SETTINGS_JS.read_text(encoding='utf-8')
    assert 'THEMES.map(' in settings, 'the picker should render the exported THEMES'
    assert "'night'" not in settings and "'fire'" not in settings, \
        'the picker should not hardcode the theme ids'


def test_every_page_applies_the_theme_at_boot():
    for path in BOOT_SCRIPTS:
        assert 'initTheme' in path.read_text(encoding='utf-8'), \
            f'{path.relative_to(ROOT)} does not apply the theme while booting'

    tabs = (ROOT / 'web' / 'saus_browser' / 'js' / 'tabs.js').read_text(encoding='utf-8')
    assert re.search(r'\?embed=1&theme=', tabs), \
        'embedded apps should be handed the theme in their URL'


def test_theme_harness():
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
    print(f'{passed}/{len(tests)} theme tests passed')


if __name__ == '__main__':
    main()
