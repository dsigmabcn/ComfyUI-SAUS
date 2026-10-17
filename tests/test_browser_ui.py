"""The browser / app UI contracts behind the last round of fixes.

Half of these are static on purpose: the browser modules (``sidebar.js``,
``tabs.js``) and the app runtime (``main.js``) import DOM-bound modules, so they
cannot be loaded in a bare node. What is checked is therefore the shape of the
code that implements each behaviour - the call, the event, the guard - plus the
palette numbers where a colour was the bug. The console dock's resize maths,
which is pure arithmetic over a stubbed DOM, is executed for real by
``tests/js/console_dock.harness.mjs`` (run through node when it is installed).

Runs under pytest or directly (``python tests/test_browser_ui.py``).
"""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BROWSER = ROOT / 'web' / 'saus_browser' / 'js'
FM_MAIN_JS = ROOT / 'web' / 'file_manager' / 'js' / 'main.js'
APP_MAIN_JS = ROOT / 'web' / 'core' / 'main.js'
RAIL_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'scripts' / 'ui_utils.js'
APP_CSS = ROOT / 'web' / 'core' / 'css' / 'main.css'
CONTENT_HTML = ROOT / 'web' / 'core' / 'content.html'
SHELL_CSS = ROOT / 'web' / 'saus_browser' / 'css' / 'shell.css'
DETAILS_CSS = ROOT / 'web' / 'saus_browser' / 'css' / 'details.css'
MODALS_CSS = ROOT / 'web' / 'saus_browser' / 'css' / 'modals.css'
BROWSER_HTML = ROOT / 'web' / 'saus_browser' / 'index.html'
THEMES_CSS = ROOT / 'web' / 'core' / 'css' / 'themes.css'
TAXONOMY_JSON = ROOT / 'web' / 'saus_browser' / 'data' / 'taxonomy.json'
CONSOLE_HARNESS = ROOT / 'tests' / 'js' / 'console_dock.harness.mjs'
MODEL_CARDS_HARNESS = ROOT / 'tests' / 'js' / 'model_status_cards.harness.mjs'
DROPDOWN_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'widgets' / 'dropdownHandler.js'
SETTINGS_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'settings.js'
TOGGLE_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'widgets' / 'ToggleComponent.js'
NOTICES_CSS = ROOT / 'web' / 'core' / 'css' / 'notices.css'
FM_HEADER_JS = ROOT / 'web' / 'file_manager' / 'js' / 'header.js'
DOWNLOADS_PY = ROOT / 'saus' / 'downloads.py'
MODELS_JS = BROWSER / 'models.js'
BROWSER_MAIN_JS = BROWSER / 'main.js'


class SkippedTest(Exception):
    """Raised when the harness cannot run here (node is missing)."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


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
    source = RAIL_JS.read_text(encoding='utf-8')

    assert 'registerSidebarTab' in source, 'SimpleApp belongs on ComfyUI\'s own rail'
    assert "id: 'saus-apps'" in source, 'the internal id stays "saus"'
    assert "title: 'Simple App'" in source and "tooltip: 'Open Simple App U See\\n(SAUS)'" in source, \
        'the rail entry is labelled Simple App, and the tooltip spells it out'
    assert 'onToggle' in source and 'return true' in source, \
        'an action entry: no panel is opened for it'
    assert source.count("tooltip: 'Launch Simple App'") == 3, \
        'and the three fallback buttons say SimpleApp too'
    assert re.search(r"if \(registerSidebarTab\(\)\) return;\s*\n\s*initializeWidgets\(\);", source) \
        or re.search(r'if \(registerSidebarTab\(\)\) \{', source), \
        'the toolbar buttons stay only as the fallback for frontends without the API'
    assert 'openSaus' in source and 'window.open(sausUrl()' in source, \
        'and the rail entry really opens the SAUS page'


def test_the_rail_entry_wears_a_solid_flame():
    """A bigger, filled flame - and nothing else about the tab is disturbed."""
    source = RAIL_JS.read_text(encoding='utf-8')

    assert 'injectRailIconStyle' in source
    assert re.search(r'if \(registerSidebarTab\(\)\) \{[^}]*injectRailIconStyle\(\);', source), \
        'the style only goes in once the tab is really registered'

    style = source.split('style.textContent = `', 1)[1].split('`;', 1)[0]

    # Every rule targets our tab, so no other rail icon (or label) is touched.
    selectors = [part.strip() for part in re.findall(r'([^{}]+)\{', style)]
    assert selectors and all('data-testid="saus-apps-tab-button"' in sel for sel in selectors), \
        f'a rule escapes our tab: {selectors}'

    assert '--sidebar-icon-size' not in style, \
        "the flame keeps ComfyUI's own 1rem (an override moved the label too)"
    assert 'font-size: 1.5rem' not in style and 'font-size: 1.25rem' not in style, \
        'no font-size either, which would grow the label'
    assert 'fill: currentColor' in style and 'stroke: none' in style, \
        'the outline lucide draws is filled in'
    assert 'border-radius' not in style, 'and there is no disc behind it'
    assert '.side-bar-button-label' in style and 'font-size: inherit' in style, \
        "and the label is explicitly left at ComfyUI's own size (it is clipped to the item)"


def test_the_rail_entry_opens_the_app_instead_of_a_panel():
    """ComfyUI's tab API has no action hook: a tab click toggles its side panel.

    The click is therefore taken in the capture phase (before the tab's own
    handler) and turned into opening the app page.
    """
    source = RAIL_JS.read_text(encoding='utf-8')

    assert 'bindRailEntry' in source, 'the click binding exists'
    assert 'bindRailEntry();' in source, 'and is wired when the tab registers'
    assert "document.addEventListener('click'" in source and '}, true);' in source, \
        'the click is captured at the document, so it runs first'
    assert "'[data-testid=\"saus-apps-tab-button\"]'" in source, 'only ours is taken'
    assert 'event.stopPropagation()' in source, 'the panel toggle never happens'
    assert 'openSaus()' in source, 'and the app page is opened'


def test_a_confirmation_opened_from_the_information_modal_stays_in_front():
    """Deleting a model asks "are you sure?" while the information modal is open.

    The information overlay sits at 20000, so the generic modal overlay - the one
    every confirmation uses - has to be above it. It used to be at 2000, which
    hid the question behind the very panel it was asked about.
    """
    details = _rule(DETAILS_CSS, '.app-details-overlay')
    modal = _rule(MODALS_CSS, '.modal-overlay')

    assert details['position'] == 'fixed' and modal['position'] == 'fixed', \
        'both are overlays'
    assert int(modal['z-index']) > int(details['z-index']), \
        f"the confirmation ({modal['z-index']}) is behind the information modal ({details['z-index']})"


def test_a_toast_reports_in_front_of_the_information_modal():
    """A toast says what a button inside the information modal just did.

    The panel sits at 20000 and a confirmation opened from it at 21000, so every
    surface that shows a toast has to clear both. ``#toast-container`` used to sit at
    2100 and ``#saus-notices`` at 10000, so "deleted successfully" arrived *behind* the
    panel it was about.
    """
    details = int(_rule(DETAILS_CSS, '.app-details-overlay')['z-index'])
    confirm = int(_rule(MODALS_CSS, '.modal-overlay')['z-index'])

    for path, selector in ((MODALS_CSS, '#toast-container'), (NOTICES_CSS, '#saus-notices')):
        layer = int(_rule(path, selector)['z-index'])
        assert layer > details, \
            f'{selector} ({layer}) is behind the information panel ({details})'
        assert layer > confirm, \
            f'{selector} ({layer}) is behind a confirmation opened from it ({confirm})'


def test_the_information_panel_closes_when_the_app_opens_in_a_tab():
    """The panel is the way *to* an app, not a place to stay.

    ``handleModelActionClick`` opens the app by dispatching ``saus:open-app`` - the same
    route an explorer row takes - so the panel subscribes to that event and takes itself
    down; otherwise the tab the user asked for stays hidden behind the panel.
    """
    source = MODELS_JS.read_text(encoding='utf-8')

    assert "document.addEventListener('saus:open-app', close);" in source, \
        'the panel listens for the event its own Open App button dispatches'
    assert "document.removeEventListener('saus:open-app', close);" in source, \
        'and unsubscribes when it closes, instead of leaving a dead listener behind'


def test_the_app_toggle_takes_a_click_anywhere_on_it():
    """A click on the visible switch has to reach its checkbox.

    The checkbox is stretched invisibly behind the track, and the track painted over it
    with no ``pointer-events: none`` - so it swallowed every click and the app toggles
    (Prompt Enhance, every pose switch) answered only the keyboard. The row is a
    ``<label>`` now too, like the Settings switch, so its text toggles it as well.
    """
    track = _rule(APP_CSS, '.toggle-track')
    assert track.get('pointer-events') == 'none', \
        'the track must not take the click away from the checkbox behind it'

    widget = TOGGLE_JS.read_text(encoding='utf-8')
    assert '<label class="toggle-component-wrapper">' in widget, \
        'the row is a label, so its text toggles the switch too'
    assert _rule(APP_CSS, '.toggle-component .toggle:checked + .toggle-track'), \
        'and the visual still follows the checkbox'


def test_the_dots_recover_after_a_delete():
    """Dropping the status cache has to come with a re-check, or the dots stay grey.

    ``invalidateStatusCache()`` fires the status-change handler with an empty
    cache; repainting alone would leave every visible row on "checking" until the
    panel was rebuilt. The handler therefore warms the visible rows as well.
    """
    source = (BROWSER / 'sidebar.js').read_text(encoding='utf-8')
    handler = re.search(r'setStatusChangeHandler\(\(\) => \{(.*?)\}\)', source, re.S)

    assert handler, 'the explorer still reacts to download/delete'
    body = handler.group(1)
    assert 'refreshVisibleStatuses()' in body, 'what we know is repainted at once'
    assert 'warmVisibleStatuses()' in body, \
        'and the invalidated rows are re-checked, instead of hanging on "checking"'
    assert re.search(r'async function warmVisibleStatuses\(\)[\s\S]*?await warmAppStatuses\(', source), \
        'the warm-up really asks the backend'


def test_the_console_docks_over_the_workspace_instead_of_a_tab():
    """The console floats over the bottom of the workspace, ComfyUI-style.

    The panes keep their size (absolute, not a flex sibling), it is reachable
    from the rail, and it is no longer a tab kind.
    """
    markup = BROWSER_HTML.read_text(encoding='utf-8')

    assert 'id="consoleDock"' in markup and 'id="consoleDockBody"' in markup, \
        'the dock container exists'
    assert markup.index('id="consoleDock"') > markup.index('id="paneContainer"'), \
        'and lives inside the workspace, after the panes'

    dock = _rule(SHELL_CSS, '.console-dock')
    assert dock['position'] == 'absolute', \
        'floating over the panes: opening it must not resize the workspace'
    assert dock['height'] == '25%', 'about a quarter of the workspace'
    assert int(dock['z-index']) > 1, 'and in front of the panes it covers'
    assert int(dock['z-index']) < int(_rule(DETAILS_CSS, '.app-details-overlay')['z-index']), \
        'but under the modals'
    assert dock['border-top'].startswith('2px solid var('), \
        'the seam with the workspace is a solid themed line, not the faint dashed one'
    assert '--color-border-hover' in dock['border-top'], \
        'and it uses the strongest neutral border token (grey in all three themes)'
    assert _rule(SHELL_CSS, '.workspace')['position'] == 'relative', \
        'the dock is anchored to the workspace'
    assert _rule(SHELL_CSS, '.console-dock-body')['min-height'] == '0', \
        'the log still scrolls inside it'

    console = (BROWSER / 'console.js').read_text(encoding='utf-8')
    assert 'export function toggleConsoleDock()' in console, 'the rail toggles it'
    assert 'renderConsolePane({ onClose: hideConsoleDock })' in console, \
        'it reuses the very same pane'
    assert "typeof onClose === 'function'" in console, \
        'docked, the pane carries its own close button'
    assert re.search(r'export function hideConsoleDock\(\)[\s\S]*?teardownConsole\(\);', console), \
        'closing it stops the polling'

    main = (BROWSER / 'main.js').read_text(encoding='utf-8')
    assert re.search(r"case 'console':[\s\S]{0,240}?toggleConsoleDock\(\);", main), \
        'the rail tool opens the dock'
    assert "openBuiltIn('console')" not in main, 'and no longer a workspace tab'

    tabs = (BROWSER / 'tabs.js').read_text(encoding='utf-8')
    built_ins = re.search(r'const BUILT_INS = \{(.*?)\};', tabs, re.S)
    assert built_ins and 'console' not in built_ins.group(1), \
        'the console is not a tab kind any more'
    assert 'renderConsolePane' not in tabs and "kind === 'console'" not in tabs, \
        'and no console tab pane is left behind'

    state = (BROWSER / 'state.js').read_text(encoding='utf-8')
    assert "entry.kind !== 'console'" in state, \
        'a console tab restored from an older session is dropped'

    # The divider resizes the dock - and nothing else does.
    assert 'id="consoleDockGrip"' in markup and 'role="separator"' in markup, \
        'the top edge carries a grip'
    assert markup.index('id="consoleDockGrip"') < markup.index('id="consoleDockBody"'), \
        'above the log, on the seam itself'
    grip = _rule(SHELL_CSS, '.console-dock-grip')
    assert grip['position'] == 'absolute' and grip['top'].startswith('-'), \
        'it straddles the seam, so the hit area is the division'
    assert grip['cursor'] == 'ns-resize', 'and it says so under the pointer'
    assert _rule(SHELL_CSS, 'body.resizing-console .panes')['pointer-events'] == 'none', \
        'while dragging, the pane iframes must not swallow the moves leaving the grip'

    assert "grip.addEventListener('mousedown', startDockResize)" in console, \
        'the grip is the handle'
    assert not re.search(r'consoleDockBody[^\n]*addEventListener', console), \
        'the log is not: only the division resizes'
    assert 'MIN_DOCK_HEIGHT' in console and 'MIN_PANE_HEIGHT' in console, \
        'the drag is clamped to the workspace'
    floor = re.search(r'MIN_DOCK_HEIGHT = (\d+);', console)
    assert floor and dock['min-height'] == f'{floor.group(1)}px', \
        'and the CSS floor is the very same number the drag clamps to'
    assert 'saveDockHeight' in console and 'localStorage.setItem' in console, \
        'and the size is remembered'


def test_console_dock_harness():
    """The resize maths, executed for real: the clamp, the memory, the arrows."""
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{CONSOLE_HARNESS.name} needs node, which is not installed here')

    result = subprocess.run([node, str(CONSOLE_HARNESS)], cwd=str(ROOT),
                            capture_output=True, text=True)
    assert result.returncode == 0, \
        f'{CONSOLE_HARNESS.name} failed:\n{result.stdout}\n{result.stderr}'


def test_the_app_info_button_asks_the_browser_for_the_panel():
    """The (i) in an app tab opens the shell's information panel.

    The app runs in an iframe and cannot draw the model list with its install
    buttons, so it asks the shell for it - keeping its own small dialog for the case
    where the page is opened on its own (no shell around it).
    """
    app = APP_MAIN_JS.read_text(encoding='utf-8')
    assert 'askParentForAppInfo' in app, 'the app needs a way to ask the shell'
    assert re.search(r"if \(!url \|\| window\.parent === window\) return false;", app), \
        'and it only asks when it really is embedded'
    assert "'saus:app-info'" in app, 'the request travels as a document event'
    assert 'window.parent.document.dispatchEvent' in app, 'dispatched on the shell document'
    assert re.search(r"if \(!askParentForAppInfo\(config\.url\)\) \{\s*\n\s*fill\(\);\s*\n\s*dialog\.showModal\(\);", app), \
        'the local dialog stays as the fallback'

    shell = BROWSER_MAIN_JS.read_text(encoding='utf-8')
    assert 'showAppDetails' in shell, 'the shell owns the panel'
    assert "document.addEventListener('saus:app-info', handleAppInfoEvent)" in shell, \
        'and listens for the request'
    assert 'state.allApps.find' in shell, 'to find the app that asked'


def test_the_model_picker_lists_names_only():
    """No pictures in the picker lists; nesting, search and the row thumbnail stay."""
    handler = DROPDOWN_JS.read_text(encoding='utf-8')

    assert 'dropdownCardImage' not in handler, \
        'the list cards are the name (and its folder), not a 100x100 image'
    assert 'applyPreviewImagesToList' not in handler, 'and the code that filled them is gone'
    assert 'dropdownElementPreviewImage' in handler, 'the row thumbnail is untouched'
    assert re.search(r"DROPDOW_ELM_PREVIEW_WORKFLOW_PATHS = \[\s*\n\s*'ckpt_name',\s*\n\s*'unet_name',", handler), \
        'the paths whose previews are fetched are unchanged'
    assert 'createNestedList' in handler and 'createLeanList' in handler, \
        'both list shapes survive'
    assert 'leanListItem' in handler, 'so does the CLIP/VAE style plain list'
    assert 'dropdownCardImage' not in APP_CSS.read_text(encoding='utf-8'), \
        'and its dead rule left the stylesheet'


def test_a_model_in_several_variants_updates_every_card():
    """A download or a delete has to reach every card that lists the model.

    The same file appears once per variant (plus the shared compulsory section), so
    stopping at the first match left the other cards stale - one red where three
    should be. The in-flight download is remembered too, so a panel that is closed
    and reopened shows the card as it was.
    """
    source = MODELS_JS.read_text(encoding='utf-8')

    assert 'const activeDownloads = new Map();' in source, 'downloads in flight are remembered'
    assert re.search(r"rememberDownload\(fileId, status, progress\);[\s\S]*?const items = scope", source), \
        'and remembered before any card is looked up, so a closed panel keeps it'
    assert re.search(r"const items = scope\s*\n\s*\? \[\.\.\.scope\.querySelectorAll\('\.component-item'\)\]\.filter", source), \
        'every matching card is collected'
    assert 'items.forEach((item) => applyStatusToItem(item, status, progress));' in source, \
        'and each of them is painted'
    assert 'function applyStatusToItem(item, status, progress)' in source, \
        'the per-card painting is its own function'
    assert 'if (el.dataset.fileId === fileId) { item = el; break; }' not in source, \
        'nothing stops at the first match any more'
    assert 'const progress = downloadProgressOf(filename);' in source, \
        'the card renderer asks about a download in flight'
    assert 'const ready = isReady && progress === null;' in source, \
        'and such a card is not ready, whatever the disk says'


def test_a_download_is_written_as_a_part_file():
    """A half-written model must never look installed (nor be loaded by ComfyUI)."""
    source = DOWNLOADS_PY.read_text(encoding='utf-8')

    assert "PART_SUFFIX = '.part'" in source, 'the partial name is declared once'
    assert 'with open(part_path, mode) as f:' in source, 'the bytes go to the .part file'
    assert re.search(r"os\.replace\(part_path, save_path\)", source), \
        'and it takes the real name only when it is complete'
    assert 'downloaded_size = part_path.stat().st_size' in source, 'resume measures the .part file'
    assert 'with open(save_path, mode)' not in source, 'the real name is never written into'
    assert 'model_download_error' in source, 'a failure is announced'
    assert "'model_download_error'" in BROWSER_MAIN_JS.read_text(encoding='utf-8'), \
        'and the browser clears the card when it arrives'


def test_the_kofi_link_points_at_the_shop():
    for path in (SETTINGS_JS, FM_HEADER_JS):
        source = path.read_text(encoding='utf-8')
        assert 'https://ko-fi.com/koalanation/shop' in source, \
            '%s should link to the ko-fi shop' % path.name
        assert 'ko-fi.com/s/f242d26788' not in source, \
            '%s still carries the old ko-fi link' % path.name


def test_model_status_cards_harness():
    """The multi-card update, executed: one model, three variant cards."""
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{MODEL_CARDS_HARNESS.name} needs node, which is not installed here')

    result = subprocess.run([node, str(MODEL_CARDS_HARNESS)], cwd=str(ROOT),
                            capture_output=True, text=True)
    assert result.returncode == 0, \
        f'{MODEL_CARDS_HARNESS.name} failed:\n{result.stdout}\n{result.stderr}'


def test_the_explorer_thumbnail_is_small_and_cacheable():
    """The row paints a small copy, and the browser may keep it.

    It used to ask for the ~23 KB master with a per-session cache-buster, while the
    shell marked every /saus/ file no-cache - so opening the panel re-downloaded all
    the thumbnails every time (29 apps, ~666 KB).
    """
    ui = (BROWSER / 'ui.js').read_text(encoding='utf-8')
    assert 'app.thumbnailRow' in ui, 'the row asks for the small copy'
    assert "thumb.loading = 'lazy'" in ui and "thumb.decoding = 'async'" in ui, \
        'and still loads it lazily and off the main thread'
    assert '?t=${state.sessionTimestamp}' not in ui, 'the per-session cache-buster is gone'

    cache = (ROOT / 'saus' / 'static_cache.py').read_text(encoding='utf-8')
    assert 'MEDIA_MAX_AGE = 3600' in cache, 'images may be reused for an hour'
    assert re.search(r"if path\.lower\(\)\.endswith\(MEDIA_SUFFIXES\):\s*\n\s*return 'public, max-age=%d'", cache), \
        'which is what the middleware hands them'
    assert "return 'no-cache'" in cache, 'while html / js / css keep revalidating'


def test_the_app_list_reports_both_thumbnail_sizes():
    source = (ROOT / 'saus' / 'management.py').read_text(encoding='utf-8')
    assert "ROW_THUMBNAIL_NAME = 'thumbnail.row.webp'" in source, 'the row name is declared'
    assert "'thumbnail.row.webp'," in source, 'and is one of the known names'
    assert 'exclude=(ROW_THUMBNAIL_NAME,)' in source, \
        'the master never resolves to the small copy'
    assert "config['thumbnailRow']" in source and "or config['thumbnail']" in source, \
        'and the row falls back to the master when an app ships only one'


def test_the_information_panels_open_app_button_opens_a_workspace_tab():
    """The "Open App" button of the details modal must not leave the shell.

    It opened a new browser window, which stranded the user in a bare app page -
    no rail, no tabs, no console. The shell's own route is the ``saus:open-app``
    document event, the same one the explorer row dispatches.
    """
    source = MODELS_JS.read_text(encoding='utf-8')

    assert "'saus:open-app'" in source, \
        'the panel asks the shell to open the app, the way the explorer row does'
    assert 'document.dispatchEvent(new CustomEvent(' in source, \
        'through a document event, so models.js needs no tabs.js import'
    assert "state.allApps.find" in source, \
        'and the catalog entry is resolved, not taken from the data attribute'
    assert not re.search(r"window\.open\(\s*`saus/", source), \
        'no window.open() on an app url: that is the new-window bug'
    assert 'openAppByUrl' not in source, \
        'tabs.js owns the tab; models.js only asks for it'


def test_open_app_reaches_the_tab_strip():
    """The event the panel dispatches is the one tabs.js turns into a tab.

    Read together: models.js emits ``saus:open-app``, main.js listens for it and
    tabs.js implements the handler, so the chain the button relies on is whole.
    """
    shell = BROWSER_MAIN_JS.read_text(encoding='utf-8')
    assert "document.addEventListener('saus:open-app', handleOpenAppEvent)" in shell, \
        'main.js wires the event to the tab handler'

    tabs = (BROWSER / 'tabs.js').read_text(encoding='utf-8')
    assert 'export function handleOpenAppEvent(event)' in tabs, \
        'tabs.js owns the handler'
    assert re.search(r"openAppByUrl\(detail\.url, detail\.name, detail\.id\)", tabs), \
        'which opens the app in the workspace, not a new window'


def test_deprecated_apps_are_hidden_until_the_switch_is_on():
    """Apps in web/apps/deprecated/ stay out of every explorer list by default.

    The API keeps reporting them (`deprecated: true`) - that is what lets the switch
    bring them back - so the filter belongs in `filterCurrentApps()`, the single
    place the explorer asks for its list, and the switch must reach the shell through
    a document event (core/ must not import the browser's modules).
    """
    state = (BROWSER / 'state.js').read_text(encoding='utf-8')
    assert 'showDeprecatedApps: false' in state, \
        'deprecated apps are hidden unless the user opts in'

    ui = (BROWSER / 'ui.js').read_text(encoding='utf-8')
    assert "preferencesManager.get('showDeprecatedApps')" in ui, \
        'the explorer consults the preference'
    assert 'filteredApps.filter(app => !app.deprecated)' in ui, \
        'and drops the apps the API flagged deprecated'

    settings = SETTINGS_JS.read_text(encoding='utf-8')
    assert 'show-deprecated-apps' in settings, 'the Settings pane owns the switch'
    assert 'showDeprecatedSwitch' in settings, \
        'and offers it only where it means something (the browser, not the File Manager)'
    assert "'saus:preference-changed'" in settings, \
        'flipping it tells the shell through a document event'

    shell = BROWSER_MAIN_JS.read_text(encoding='utf-8')
    assert "document.addEventListener('saus:preference-changed'" in shell, 'the shell listens'
    assert 'preferencesManager.reload()' in shell, 're-reads its stale copy'
    assert 'renderExplorer();' in shell, 'and repaints the side panel'

    tabs = (BROWSER / 'tabs.js').read_text(encoding='utf-8')
    assert '{ showDeprecatedSwitch: true }' in tabs, \
        'the app browser is the host that opts in'


def test_the_settings_switch_actually_renders():
    """The switch must survive the host's own `.settings-form label` rule.

    `web/saus_browser/css/settings.css` sets `.settings-form label { display: block }`
    (specificity 0,1,1), which beats a bare `.settings-switch` (0,1,0): the label stops
    being a flex row, the track span stays `inline` so its width/height are ignored, and
    the knob ends up floating over the label text - a switch that is not there. So the
    component's rules must be scoped at least as specifically, and the text comes first
    with the track after it (hence `~`, not `+`, for the checked state).
    """
    settings = SETTINGS_JS.read_text(encoding='utf-8')

    for selector in ('.settings-form .settings-switch {',
                     '.settings-form .settings-switch-track {'):
        assert selector in settings, \
            f'{selector} must be scoped, or .settings-form label wins and collapses it'
    assert '.settings-form .settings-switch input:checked ~ .settings-switch-track' in settings, \
        'the checked state needs `~`: the text sits between the input and the track'
    assert 'var(--color-neutral)' in settings, 'off is grey'
    assert 'var(--color-success)' in settings, 'on is green'

    text_at = settings.index('<span class="settings-switch-text">')
    track_at = settings.index('<span class="settings-switch-track"')
    assert text_at < track_at, 'the label reads "Show deprecated apps" and then the toggle'

    block = settings.split('showDeprecatedSwitch ?')[1].split('` : ')[0]
    assert 'settings-switch-text' in block, 'the Apps section holds the switch'
    assert 'settings-hint' not in block, 'and no explanatory paragraph under it'


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
    print(f'{passed}/{len(tests)} browser UI tests passed')


if __name__ == '__main__':
    main()

