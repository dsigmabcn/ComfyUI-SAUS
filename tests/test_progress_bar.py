"""The progress readout has to stay legible *on the bar*.

The text is centred over the bar, and the bar is two colours at once: the filled
part (``--color-progress-value``) and the empty track (``--color-progress-background``).
No single colour can contrast with both a near-white and a near-black bar, so the
rule paints the glyph in the page colour and its outline in the *fill* colour:
wherever the text lands, either the glyph or its edge contrasts.

The contrast is computed here from the palette itself, for all three themes, so
a future palette edit cannot quietly make the readout unreadable. Runs under
pytest or directly (``python tests/test_progress_bar.py``).
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APP_CSS = ROOT / 'web' / 'core' / 'css' / 'main.css'
THEMES_CSS = ROOT / 'web' / 'core' / 'css' / 'themes.css'

# WCAG AA: 4.5:1 for text, 3:1 for graphical objects (the outline).
MIN_TEXT_CONTRAST = 4.5
MIN_OUTLINE_CONTRAST = 3.0


def _rgb(value):
    value = value.strip().lstrip('#')
    if len(value) == 3:
        value = ''.join(char * 2 for char in value)
    assert len(value) == 6 and re.fullmatch(r'[0-9a-fA-F]{6}', value), \
        f'{value!r} is not a plain hex colour'
    return tuple(int(value[i:i + 2], 16) / 255 for i in (0, 2, 4))


def _luminance(value):
    def linear(channel):
        return channel / 12.92 if channel <= 0.03928 else ((channel + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(channel) for channel in _rgb(value))
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def _contrast(first, second):
    high, low = sorted((_luminance(first), _luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def _palette():
    """{theme: {variable: value}} straight out of themes.css."""
    source = THEMES_CSS.read_text(encoding='utf-8')
    blocks = re.findall(r':root(?:\[data-theme="(\w+)"\])?\s*\{(.*?)\n\}', source, re.S)
    themes = {name or 'night': dict(re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', body))
              for name, body in blocks}
    assert set(themes) == {'night', 'day', 'fire'}, f'found {sorted(themes)}'
    return themes


def _rule(selector):
    """The declarations of one rule in the app stylesheet."""
    source = APP_CSS.read_text(encoding='utf-8')
    body = re.search(re.escape(selector) + r'\s*\{([^}]*)\}', source)
    assert body, f'{selector} is missing from main.css'
    return {name: value.strip() for name, value in re.findall(r'([\w-]+)\s*:\s*([^;]+);', body.group(1))}


def test_the_glyph_contrasts_with_the_filled_half():
    for theme, values in _palette().items():
        ratio = _contrast(values['--color-background'], values['--color-progress-value'])
        assert ratio >= MIN_TEXT_CONTRAST, \
            f'{theme}: the readout on the bar is only {ratio:.1f}:1'


def test_the_outline_contrasts_with_the_empty_half():
    for theme, values in _palette().items():
        ratio = _contrast(values['--color-progress-value'], values['--color-progress-background'])
        assert ratio >= MIN_OUTLINE_CONTRAST, \
            f'{theme}: the outline is only {ratio:.1f}:1 against the track, so the ' \
            'readout is unreadable there'


def test_the_rule_paints_those_two_colours_without_a_literal():
    rule = _rule('#progress-text')

    assert rule['color'] == 'var(--color-background)', \
        'the glyph wears the page colour (the one that contrasts with the fill)'
    assert rule['text-shadow'].count('var(--color-progress-value)') == 4, \
        'and a four-way outline wears the fill colour'
    assert '#' not in rule['text-shadow'] and 'rgba(' not in rule['text-shadow'], \
        'no literal colour left in the readout'


def test_the_bar_keeps_its_two_palette_colours():
    rule = _rule('#main-progress')
    assert rule['background-color'] == 'var(--color-progress-background)'

    value = _rule('#main-progress::-webkit-progress-value')
    assert value['background'] == 'var(--color-progress-value)'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    passed = 0
    for name, fn in tests:
        fn()
        passed += 1
        print(f'  ok  {name}')
    print(f'{passed}/{len(tests)} progress-bar tests passed')


if __name__ == '__main__':
    main()
