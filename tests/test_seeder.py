"""The seed widget's R switch has to read as a switch.

Randomising the seed on every run (the default) is filled with a halo and a solid
border; keeping the seed in the field is hollow, dashed and dimmed. Two rules make
that true: one in the stylesheet (two visibly different states, painted with
palette variables that *every* theme overrides - see test_themes.py for the
palette itself) and one in the component (class, aria-pressed and tooltip follow
the state). The behaviour is covered by the browser-free harness next to this file
(``tests/js/seeder.harness.mjs``), run through node when it is installed.
Runs under pytest or directly (``python tests/test_seeder.py``).
"""

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_CSS = ROOT / 'web' / 'core' / 'css' / 'main.css'
THEMES_CSS = ROOT / 'web' / 'core' / 'css' / 'themes.css'
SEEDER_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'widgets' / 'Seeder.js'
HARNESS = ROOT / 'tests' / 'js' / 'seeder.harness.mjs'

OFF_RULE = '.seeder-container button[id$="RandomSeedButton"]'
ON_RULE = '.seeder-container button[id$="RandomSeedButton"].active'


class SkippedTest(Exception):
    """Raised when the harness cannot run here (node is missing)."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


def _declarations(selector, source=None):
    """{property: value} for one rule, as written in the stylesheet."""
    source = source if source is not None else APP_CSS.read_text(encoding='utf-8')
    body = re.search(re.escape(selector) + r'\s*\{([^}]*)\}', source)
    assert body, f'{selector} is missing from main.css'
    return {name: value.strip() for name, value in
            re.findall(r'([\w-]+)\s*:\s*([^;]+);', body.group(1))}


def _themed_variables():
    """Every variable the three theme blocks override."""
    source = THEMES_CSS.read_text(encoding='utf-8')
    blocks = re.findall(r':root(?:\[data-theme="(\w+)"\])?\s*\{(.*?)\n\}', source, re.S)
    themes = {name or 'night': set(re.findall(r'(--[\w-]+)\s*:', body)) for name, body in blocks}
    assert len(themes) == 3, f'expected 3 themes, found {sorted(themes)}'
    return set.intersection(*themes.values())


def _method_body(source, name):
    """One method's body, from its signature to the closing brace."""
    marker = f'{name}() {{'
    assert marker in source, f'{name}() is missing'
    return source.split(marker, 1)[1].split('\n    }', 1)[0]


def test_the_off_state_is_hollow_and_dimmed():
    off = _declarations(OFF_RULE)
    assert off['background-color'] == 'transparent', 'an inactive R should not look filled'
    assert off['border-style'] == 'dashed', 'the dashed border is the "off" tell'
    assert off['color'] == 'var(--color-text-faint)', 'and the R is dimmed'


def test_the_on_state_is_filled_and_ringed():
    on = _declarations(ON_RULE)
    off = _declarations(OFF_RULE)

    assert on['background-color'] == 'var(--color-accent)', 'an active R is filled'
    assert on['border-style'] == 'solid'
    assert on['box-shadow'], 'a halo makes the active state readable at 30px'
    assert on['color'] == 'var(--color-background)', \
        'the label is painted in the page colour, which contrasts in every theme'

    for prop in ('background-color', 'color', 'border-style'):
        assert on[prop] != off[prop], f'{prop} has to change between the two states'

    # No dot in the corner any more: the fill, the halo and the solid border are
    # the whole difference between the two states.
    assert ON_RULE + '::after' not in APP_CSS.read_text(encoding='utf-8'), \
        'the R button should not grow an ::after decoration'


def test_both_states_use_colours_every_theme_overrides():
    themed = _themed_variables()
    rules = (
        '.seeder-container button',
        '.seeder-container button:hover',
        OFF_RULE,
        OFF_RULE + ':hover',
        ON_RULE,
        ON_RULE + ':hover',
    )

    used = set()
    for selector in rules:
        for value in _declarations(selector).values():
            used |= set(re.findall(r'var\((--[\w-]+)', value))

    assert used, 'the switch should be painted with the palette'
    unthemed = {name for name in used if name.startswith('--color-') and name not in themed}
    assert not unthemed, f'the switch would not follow a theme: {sorted(unthemed)}'


def test_the_component_announces_the_state():
    source = SEEDER_JS.read_text(encoding='utf-8')
    helper = _method_body(source, 'syncRandomSeedButton')

    assert "setAttribute('aria-pressed'" in helper, 'the switch is exposed to screen readers'
    assert 'title =' in helper, 'and the tooltip says which way it is'
    assert 'Random seed each run: ON' in helper, 'the on state is spelled out'
    assert 'Random seed each run: OFF' in helper, 'and so is the off state'

    assert 'this.syncRandomSeedButton();' in _method_body(source, 'buildUI'), \
        'the initial state goes through it'
    assert 'this.syncRandomSeedButton();' in _method_body(source, 'toggleAutoRandomSeed'), \
        'and so does a long press'
    assert "classList.add('active')" not in source, 'no second way to set the class'


def test_seeder_harness():
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
    print(f'{passed}/{len(tests)} seeder tests passed')


if __name__ == '__main__':
    main()
