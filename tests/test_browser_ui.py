"""The browser / app UI contracts behind the last round of fixes.

Half of these are static on purpose: the browser modules (``sidebar.js``,
``tabs.js``) and the app runtime (``main.js``) import DOM-bound modules, so they
cannot be loaded in a bare node. What is checked is therefore the shape of the
code that implements each behaviour - the call, the event, the guard - plus the
palette numbers where a colour was the bug.

Runs under pytest or directly (``python tests/test_browser_ui.py``).
"""

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BROWSER = ROOT / 'web' / 'saus_browser' / 'js'
FM_MAIN_JS = ROOT / 'web' / 'file_manager' / 'js' / 'main.js'
APP_MAIN_JS = ROOT / 'web' / 'core' / 'main.js'
APP_CSS = ROOT / 'web' / 'core' / 'css' / 'main.css'
CONTENT_HTML = ROOT / 'web' / 'core' / 'content.html'
SHELL_CSS = ROOT / 'web' / 'saus_browser' / 'css' / 'shell.css'
DETAILS_CSS = ROOT / 'web' / 'saus_browser' / 'css' / 'details.css'
THEMES_CSS = ROOT / 'web' / 'core' / 'css' / 'themes.css'
TAXONOMY_JSON = ROOT / 'web' / 'saus_browser' / 'data' / 'taxonomy.json'


def _function(path, signature):
    """The body of one function, from its signature to the closing brace."""
    source = path.read_text(encoding='utf-8')
    start = source.index(f'{signature}(')
    body = source[start:].split('\n}', 1)[0]
    assert body, f'{signature}() is missing from {path.name}'
    return body


def _rule(path, selector):
    """{property: value} for one rule (comments stripped first)."""
    source = re.sub(r'/\*.*?\*/', '', path.read_text(encoding='utf-8'), flags=re.S)
    body = re.search(re.escape(selector) + r'\s*\{([^}]*)\}', source)
    assert body, f'{selector} is missing from {path.name}'
    return {name: value.strip() for name, value in
            re.findall(r'([\w-]+)\s*:\s*([^;]+);', body.group(1))}


def _rules(path, selector):
    """Every declaration for a selector (a file may refine a rule later on)."""
    source = re.sub(r'/\*.*?\*/', '', path.read_text(encoding='utf-8'), flags=re.S)
    merged = {}
    for body in re.findall(re.escape(selector) + r'\s*\{([^}]*)\}', source):
        merged.update(dict(re.findall(r'([\w-]+)\s*:\s*([^;]+);', body)))
    assert merged, f'{selector} is missing from {path.name}'
    return merged


def _contrast(first, second):
    high, low = sorted((_luminance(first), _luminance(second)), reverse=True)
    return (high + 0.05) / (low + 0.05)


def _palette(theme):
    source = THEMES_CSS.read_text(encoding='utf-8')
    selector = ':root' if theme == 'night' else f':root[data-theme="{theme}"]'
    block = re.search(re.escape(selector) + r'\s*\{(.*?)\n\}', source, re.S)
    assert block, f'theme {theme} is missing from themes.css'
    return dict(re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', block.group(1)))


def _luminance(value):
    value = value.strip().lstrip('#')
    channels = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]

    def linear(c):
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    red, green, blue = (linear(c) for c in channels)
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue


def test_del_removes_the_file_manager_selection():
    body = _function(FM_MAIN_JS, 'function onGlobalKeyDown')

    assert "'Delete'" in body and 'doDelete(focusedPane)' in body, \
        'Del has to delete the selected files'
    assert "'F2'" in body and 'doRename(focusedPane)' in body, 'F2 still renames'
    assert "['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)" in body, \
        'typing in a field must not delete files'


def test_turbo_disappears_when_the_architecture_has_none():
    source = APP_MAIN_JS.read_text(encoding='utf-8')
    branch = source.split('} else if (arch) {', 1)[1].split('const defaultButton', 1)[0]

    assert 'arch.turbo_settings' in branch, 'Turbo is only offered when it exists'
    assert branch.count('staticButtons.turbo?.remove()') == 2, \
        'and its button is removed when it does not (both fallbacks)'
    assert "setButton(staticButtons.hd, 'HD', true)" in branch, \
        'with no variants the app simply runs as HD'

    content = CONTENT_HTML.read_text(encoding='utf-8')
    assert 'data-mode="custom"' in content, 'Custom stays, so parameters stay reachable'


def test_the_app_heading_and_its_info_dialog():
    content = CONTENT_HTML.read_text(encoding='utf-8')
    for element in ('id="app-heading-name"', 'id="app-info-btn"', 'id="app-info-dialog"'):
        assert element in content, f'the app page is missing {element}'

    source = APP_MAIN_JS.read_text(encoding='utf-8')
    assert 'setupAppHeading(appConfig);' in source, 'the heading is filled while booting'
    assert source.count('setupAppHeading(appConfig);') == 2, \
        'wired both at boot and on DOMContentLoaded - a page whose scripts load late ' \
        'never fires the listener, and the heading would stay empty'
    heading = _function(APP_MAIN_JS, 'function setupAppHeading')
    assert 'config.name' in heading, 'with the app name'
    assert 'showModal()' in heading, 'and the (i) opens the dialog'
    assert 'dataset.wired' in heading, 'the listeners are attached only once'
    assert heading.index('config.name') < heading.index('return;'), \
        'the name is set before any early return'

    # The same size as the mode buttons it sits above, as asked.
    assert _rule(APP_CSS, '.app-heading-name')['font-size'] == _rule(APP_CSS, '.mode-button')['font-size'], \
        'the heading should be the size of the variant buttons'
    assert _rule(APP_CSS, '.app-info-dialog')['background-color'] == 'var(--color-surface)', \
        'and the dialog is painted from the palette'


def test_favourites_only_show_for_the_open_section():
    body = _function(BROWSER / 'sidebar.js', 'function renderFavorites')

    assert 'sectionOfApp(app, cfg)' in body, 'a favourite from another section is not shown'
    assert 'filterCurrentApps()' in body, 'and the active search / tag filter applies too'

    helper = _function(BROWSER / 'sidebar.js', 'function sectionOfApp')
    assert 'sections[sections.length - 1]' in helper, \
        'an unknown category is filed under the last section, like the tree does'


def test_the_panel_steps_aside_when_an_app_opens():
    sidebar = (BROWSER / 'sidebar.js').read_text(encoding='utf-8')
    assert 'export function closePanel()' in sidebar
    assert "document.addEventListener('saus:app-activated', closePanel)" in sidebar, \
        'the panel closes itself when an app is activated'

    tabs = (BROWSER / 'tabs.js').read_text(encoding='utf-8')
    assert "if (tab.kind === 'app') {" in tabs and "'saus:app-activated'" in tabs, \
        'only apps announce it - the built-in panes keep the panel'


def test_tabs_can_be_dragged_into_a_new_order():
    tabs = (BROWSER / 'tabs.js').read_text(encoding='utf-8')

    assert 'btn.draggable = true;' in tabs
    for event in ("addEventListener('dragstart'", "addEventListener('dragover'", "addEventListener('drop'"):
        assert event in tabs, f'the strip does not handle {event}'

    move = _function(BROWSER / 'tabs.js', 'function moveTab')
    assert 'state.openApps.splice' in move and 'saveOpenApps()' in move, \
        'the new order is kept in state (and in the session)'

    assert _rule(SHELL_CSS, '.tab.dragging'), 'the tab in hand needs a visible state'
    assert _rule(SHELL_CSS, '.tab.drop-target'), 'and so does the tab it would land on'


def test_app_tabs_wear_their_section_icon():
    body = _function(BROWSER / 'tabs.js', 'function tabIconClass')

    assert 'BUILT_INS[tab.kind]' in body, 'built-in panes keep their own icons'
    assert 'taxonomy.sections' in body and 'entry.section' in body, \
        'apps take the icon of their section'
    assert "'fas fa-cube'" in body, 'with the cube as the fallback'

    # The sections the user named: landscape / camera / shapes.
    taxonomy = json.loads(TAXONOMY_JSON.read_text(encoding='utf-8'))
    icons = {section['id']: section['icon'] for section in taxonomy['sections']}
    assert icons.get('AI Image') == 'fas fa-image'
    assert icons.get('AI Video') == 'fas fa-video'
    assert icons.get('Other') == 'fas fa-shapes'


def test_option_lists_use_body_text_not_button_label_colour():
    # --color-button-primary-text is the label *on* a primary button: it is white
    # in Day and near-black in Night, so as plain text it vanishes.
    for path, selector in ((APP_CSS, '.dropdownDialogContainer'),
                           (APP_CSS, '.dropdownDialogSearchInput'),
                           (APP_CSS, '.dropdownFolderTitle'),
                           (DETAILS_CSS, '.model-type')):
        colour = _rule(path, selector)['color']
        assert colour == 'var(--color-primary-text)', \
            f'{selector} in {path.name} should read as body text, not as a button label'


def test_the_day_theme_is_softer_without_losing_its_white_surfaces():
    day = _palette('day')

    assert day['--color-surface'] == '#ffffff', \
        'cards, modals and inputs stay white so they stand out'
    for name in ('--color-background', '--color-background-secondary', '--color-header-background'):
        assert day[name] != '#ffffff', f'{name} is still glaring white in Day'

    canvas = _luminance(day['--color-background'])
    panels = _luminance(day['--color-background-secondary'])
    assert canvas > panels, 'the panels still step away from the canvas'
    assert canvas < _luminance('#f4f6f9') and panels < _luminance('#e9edf2'), \
        'the big areas should be a step softer than they were'


def test_the_panel_handles_are_visible_in_the_light_themes():
    """The handle's glyph has to contrast with the handle, not with the page.

    --color-primary-text was used here: near-white on Night's *light* handle and
    near-black on Day's *dark* one, so the chevron vanished in both. The handle
    is painted with --color-button-primary, so it needs that button's own label
    colour. (Fire keeps the pairing it always had.)
    """
    handle = _rules(APP_CSS, '.toggle-button')
    assert handle['background-color'] == 'var(--color-button-primary)'
    assert handle['color'] == 'var(--color-button-primary-text)', \
        'the chevron must use the colour that goes with the handle background'
    assert _rules(APP_CSS, '.toggle-button .arrow')['fill'] == 'currentColor', \
        'and the SVG follows it instead of hardcoding a fill'

    for theme in ('night', 'day'):
        palette = _palette(theme)
        ratio = _contrast(palette['--color-button-primary-text'],
                          palette['--color-button-primary'])
        assert ratio >= 4.5, f'{theme}: the panel handle chevron is only {ratio:.1f}:1'


def test_the_prompt_arrow_has_a_theme_colour():
    rule = _rule(APP_CSS, '.expand-arrow-bottom')
    assert rule['color'] == 'var(--color-primary-text)', \
        'the ▼ prompt handle is plain text and needs its own theme colour'
    assert _rule(APP_CSS, '.expand-arrow-bottom:hover')['color'] == 'var(--color-accent)'


def test_saus_opens_from_comfyuis_left_toolbar():
    source = (ROOT / 'web' / 'core' / 'js' / 'common' / 'scripts' / 'ui_utils.js')\
        .read_text(encoding='utf-8')

    assert 'registerSidebarTab' in source, 'SAUS belongs on ComfyUI\'s own rail'
    assert "id: 'saus-apps'" in source and "title: 'SAUS'" in source
    assert 'onToggle' in source and 'return true' in source, \
        'an action entry: no panel is opened for it'
    assert re.search(r"if \(registerSidebarTab\(\)\) return;\s*\n\s*initializeWidgets\(\);", source), \
        'the toolbar buttons stay only as the fallback for frontends without the API'
    assert 'openSaus' in source and 'window.open(sausUrl()' in source, \
        'and the rail entry really opens the SAUS page'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    passed = 0
    for name, fn in tests:
        fn()
        passed += 1
        print(f'  ok  {name}')
    print(f'{passed}/{len(tests)} browser UI tests passed')


if __name__ == '__main__':
    main()

