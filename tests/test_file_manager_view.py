"""The File Manager's view mode: remembered per pane, and two modes that look different.

Two small things the browser asked for, both easy to undo by accident:

* the pane's view mode (list / medium / large) is restored on boot, so a refresh or a
  restart does not silently drop the user back into the list;
* ``medium`` and ``large`` are visually distinct - column width, thumbnail height and
  caption size all move together. The old 150px vs 220px pair produced the same number of
  columns on a wide pane, which is why they read as one mode.

Runs under pytest or directly (``python tests/test_file_manager_view.py``).
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FM_JS = ROOT / 'web' / 'file_manager' / 'js' / 'main.js'
FM_CSS = ROOT / 'web' / 'file_manager' / 'css' / 'styles.css'


def test_the_view_mode_is_remembered_per_pane():
    source = FM_JS.read_text(encoding='utf-8')

    assert "viewMode: rememberedViewMode('input')" in source and \
        "viewMode: rememberedViewMode('output')" in source, \
        'both panes restore their own mode as they are built'
    assert "localStorage.getItem('SausFileManagerViews')" in source
    assert 'saveViewModes();' in source, 'and the choice is written when it is made'
    assert "['list', 'medium', 'large'].includes(saved[root])" in source, \
        'a stored value has to be one we know, or boot falls back to list'
    assert 'return \'list\';' in source, 'the fallback matters: this runs before first paint'


def test_medium_and_large_are_visibly_different():
    css = FM_CSS.read_text(encoding='utf-8')

    for fragment in ('.fm-list.view-medium .fm-tile-thumb { height: 110px; }',
                     '.fm-list.view-large .fm-tile-thumb { height: 200px; }',
                     '.fm-list.view-medium .fm-tile-name { font-size: 0.75rem; }',
                     '.fm-list.view-large .fm-tile-name { font-size: 0.95rem; }'):
        assert fragment in css, f'the two icon modes must differ: {fragment}'

    assert 'minmax(140px, 1fr)' in css and 'minmax(260px, 1fr)' in css, \
        'and their column widths have to be far enough apart to change the layout'


FM_HTML = ROOT / 'web' / 'file_manager' / 'index.html'


def test_the_view_buttons_do_not_look_alike():
    """The mode is picked from the buttons, so *their* glyphs have to differ.

    The pair is Font Awesome's own: `fa-table-cells` (a fine grid) next to
    `fa-table-cells-large` (few big cells). The old `fa-border-all` was a third box-shaped
    glyph and read as the same button as `fa-table-cells-large`.
    """
    html = FM_HTML.read_text(encoding='utf-8')

    icons = {}
    for line in html.splitlines():
        if 'fm-view-btn' not in line:
            continue
        view = line.split('data-view="', 1)[1].split('"', 1)[0]
        icon = line.split('class="fas ', 1)[1].split('"', 1)[0]
        icons.setdefault(view, set()).add(icon)

    assert set(icons) == {'list', 'medium', 'large'}, f'unexpected view buttons: {icons}'
    assert icons['medium'] == {'fa-table-cells'}, \
        f'medium icons get the fine grid: {icons}'
    assert icons['large'] == {'fa-table-cells-large'}, \
        f'large icons get the big cells: {icons}'
    assert len({next(iter(icons[v])) for v in icons}) == 3, \
        'all three buttons have to be distinguishable at a glance'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)}/{len(tests)} file-manager-view tests passed')


if __name__ == '__main__':
    main()
