"""The File Manager's view mode: remembered per pane, and two modes that look different."""

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
    """The mode is picked from the buttons, so *their* glyphs have to differ."""
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


def test_the_dialog_buttons_do_not_look_alike():
    """Cancel is an outline and the confirm is filled - or they read as one button.

    The page loads only its own stylesheet, so `btn-modal-primary` /
    `-secondary` mean nothing here until they are defined in it: with just the
    plain `.modal-content button` rule both buttons came out the same grey and
    "Create" was not visibly the action that does the work.
    """
    css = FM_CSS.read_text(encoding='utf-8')
    js = FM_JS.read_text(encoding='utf-8')

    secondary = css.split('.modal-content .btn-modal-secondary {', 1)[1].split('}', 1)[0]
    primary = css.split('.modal-content .btn-modal-primary {', 1)[1].split('}', 1)[0]

    assert 'background: transparent' in secondary, 'Cancel stays an outline'
    assert 'border: 1px solid var(--color-border)' in secondary
    assert 'var(--color-button-primary)' in primary, 'the confirm is the filled one'
    assert 'transparent' not in primary, 'so the two cannot render the same'
    assert 'font-weight: bold' in primary, 'and it reads as the primary action'
    assert '.modal-content .btn-modal-primary.delete' in css, \
        'Delete keeps its own colour through a modifier class'

    assert js.count('class="btn-modal-primary"') == 2, 'New folder + Rename confirms'
    assert 'class="btn-modal-primary delete"' in js, 'and Delete uses the variant'
    assert js.count('class="btn-modal-secondary"') == 3
    assert 'style="padding: 8px 16px; cursor: pointer;"' not in js, \
        'the classes carry the padding, so no dialog needs an inline style'


def test_both_panes_can_create_a_folder_left_of_rename():
    """New folder is a toolbar button in each pane, immediately left of Rename."""
    html = FM_HTML.read_text(encoding='utf-8')
    js = FM_JS.read_text(encoding='utf-8')

    acts = {}
    for chunk in html.split('<section class="fm-pane"')[1:]:
        pane = chunk.split('data-pane="', 1)[1].split('"', 1)[0]
        toolbar = chunk.split('</section>', 1)[0]
        acts[pane] = [part.split('"', 1)[0] for part in toolbar.split('data-act="')[1:]]

    assert set(acts) == {'input', 'output'}, f'both panes have a toolbar: {acts}'
    for pane, order in acts.items():
        assert 'newfolder' in order, f'the {pane} pane needs a New folder button'
        assert order.index('newfolder') == order.index('rename') - 1, \
            f'the {pane} button has to sit immediately left of Rename: {order}'
        assert 'disabled' not in html.split('data-act="newfolder"', 1)[1].split('>', 1)[0], \
            'it acts on the open folder, so it is never disabled'

    assert "case 'newfolder':" in js, 'the toolbar click has to be wired up'
    assert "'/saus/api/create-folder'" in js, 'and it has to reach the server route'
    assert 'id="newfolder-modal"' in js and 'createNewFolderModal();' in js, \
        'the dialog is built at boot, like the upload / delete / rename ones'
    assert 'await reloadPane(root, folderName)' in js, \
        'the new folder is shown selected, the way a rename keeps its file selected'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)}/{len(tests)} file-manager-view tests passed')


if __name__ == '__main__':
    main()
