"""The App Manager: a Settings button, a built-in tab, and a display-only switch.

The store's own rules live in `test_app_visibility.py`; this suite is about the
shell wiring - and about the App Manager staying what its description says: a
view that hides and shows apps, never one that deletes or changes them.
"""

import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BROWSER = ROOT / 'web' / 'saus_browser'
CORE = ROOT / 'web' / 'core'
SETTINGS_JS = CORE / 'js' / 'common' / 'components' / 'settings.js'
STATE_JS = BROWSER / 'js' / 'state.js'
UI_JS = BROWSER / 'js' / 'ui.js'
MAIN_JS = BROWSER / 'js' / 'main.js'
TABS_JS = BROWSER / 'js' / 'tabs.js'
MANAGER_JS = BROWSER / 'js' / 'app_manager.js'
MANAGERS_CSS = BROWSER / 'css' / 'managers.css'
STYLES_CSS = BROWSER / 'css' / 'styles.css'


def _text(path):
    return path.read_text(encoding='utf-8')


def test_settings_offers_the_managers_only_where_tabs_exist():
    settings = _text(SETTINGS_JS)
    tabs = _text(TABS_JS)
    file_manager = _text(ROOT / 'web' / 'file_manager' / 'js' / 'main.js')

    assert 'this.options.showManagers ?' in settings, 'the section is opt-in'
    assert 'id="open-app-manager"' in settings
    assert "this.openManager('appmanager')" in settings
    assert 'id="open-model-manager"' in settings, 'the second button is there too'
    assert "this.openManager('modelmanager')" in settings
    assert "new CustomEvent('saus:open-manager'" in settings

    # The buttons carry their name only - the subtitle line was noise.
    managers_section = settings.split('showManagers ? `', 1)[1].split("` : ''", 1)[0]
    assert 'theme-option-name' in managers_section, 'the name is there'
    assert 'theme-option-hint' not in managers_section, 'and no subtitle under it'
    assert 'settings-hint' not in managers_section, 'nor a line explaining the obvious'

    # Only the browser has workspace tabs, so only it passes the option.
    assert 'showManagers: true' in tabs, 'the shell shows the Managers section'
    assert 'showManagers' not in file_manager, \
        'the File Manager mounts the same pane and must not offer a tab it cannot open'

    imports = '\n'.join(line for line in settings.splitlines() if line.startswith('import '))
    assert 'tabs' not in imports, \
        'the component asks for a tab through the event, never by importing the tab manager'


def test_both_managers_are_built_in_tabs_not_iframes():
    tabs = _text(TABS_JS)

    built_ins = tabs.split('const BUILT_INS = {', 1)[1].split('};', 1)[0]
    expected = {
        'appmanager': ('App Manager', 'mountAppManager', 'refreshAppManager'),
        'modelmanager': ('Model Manager', 'mountModelManager', 'refreshModelManager'),
    }
    for kind, (label, mount, refresh) in expected.items():
        assert f"{kind}: {{ name: '{label}', icon: 'fas " in built_ins, \
            f'{kind} needs a tab name and icon'

        branch = tabs.split(f"if (tab.kind === '{kind}') {{", 1)[1].split('return pane;', 1)[0]
        assert f'{mount}(host)' in branch, f'{kind} is mounted in the shell pane'
        assert "createElement('iframe')" not in branch, \
            'a manager needs the shell state, not a frame'
        assert tabs.index(f"if (tab.kind === '{kind}')") < tabs.index("document.createElement('iframe')"), \
            f'{kind} is handled before the iframe path'
        assert f"if (tab.kind === '{kind}') {refresh}();" in tabs, \
            f'coming back to the {kind} tab re-reads and repaints'

    assert "addEventListener('saus:open-manager'" in tabs, \
        'the shell listens for the request and turns it into a tab'
    assert 'if (kind && BUILT_INS[kind]) openBuiltIn(kind);' in tabs


def test_the_hidden_list_is_read_while_the_shell_boots():
    main = _text(MAIN_JS)

    assert 'loadAppVisibility' in main.split('\n', 3)[1], 'imported from state.js'
    assert 'await loadAppVisibility();' in main, 'read with the catalogs, before the first paint'
    assert "addEventListener('saus:app-visibility-changed'" in main, \
        'a change made in the manager repaints the panel'
    assert 'renderExplorer();' in main and 'renderTagsFilter();' in main


def test_state_owns_the_visibility_calls():
    state = _text(STATE_JS)

    assert "const VISIBILITY_URL = '/saus/api/app-visibility';" in state
    assert 'export async function loadAppVisibility()' in state
    assert 'export async function setAppHidden(' in state
    assert "'Content-Type': 'application/json'" in state, 'the POST carries the JSON guard'
    assert 'state.hiddenAppIds = previous;' in state, 'a failed write puts the list back'
    assert "new CustomEvent('saus:app-visibility-changed'" in state
    assert 'state.hiddenAppIds = new Set();' in state, 'an unreadable list hides nothing'


def test_the_panel_and_the_manager_share_one_predicate():
    ui = _text(UI_JS)
    manager = _text(MANAGER_JS)

    assert 'export function isAppListed(app)' in ui, 'listed = the deprecated gate'
    assert 'export function isAppShown(app)' in ui, 'shown = listed and not hidden'
    assert 'let filteredApps = state.allApps.filter(isAppShown);' in ui, \
        'the panel filters through the shared predicate'
    assert 'state.hiddenAppIds.has(app.id) || !app.tags' in ui, \
        'a hidden app contributes no tag chip'

    assert 'isAppListed' in manager, 'the manager lists exactly the apps the panel may offer'


def test_the_manager_only_hides_and_shows():
    """The one write this view may make: the id list. It never touches an app."""
    manager = _text(MANAGER_JS)

    for forbidden in ('move-file', 'delete-file', 'rename-file', 'delete-model',
                      'download-model', 'create-folder'):
        assert forbidden not in manager, f'the App Manager must not reach {forbidden}'
    assert 'fetch(' not in manager, 'its only I/O is state.js -> setAppHidden'
    assert 'setAppHidden(' in manager and 'isAppHidden(' in manager
    assert 'showAppDetails(app)' in manager, 'the (i) opens the same info panel as a panel row'


def test_the_manager_reuses_the_panel_row():
    ui = _text(UI_JS)
    manager = _text(MANAGER_JS)

    assert 'export function appThumbSrc(app)' in ui, 'the one thumbnail rule'
    assert 'thumb.src = appThumbSrc(app);' in ui, 'the panel row uses it'
    assert 'appThumbSrc(app)' in manager, 'and so does the manager'
    assert 'thumbnailRow' not in manager and 'thumbnail.' not in manager, \
        'neither one re-derives which file to request'
    assert "createElement('div', 'app-row')" in manager, 'the same row class as the panel'
    assert 'applyAppRowStatus(' in manager and 'subscribeStatusChanges(' in manager, \
        'the dot comes from the same status cache, and repaints after a download'


def test_the_switch_carries_the_theme():
    import re

    css = _text(MANAGERS_CSS)
    styles = _text(STYLES_CSS)

    assert "@import 'managers.css';" in styles, 'the shell loads the new stylesheet'
    assert '.manager-switch input:checked ~ .manager-switch-track' in css
    assert 'background-color: var(--color-success)' in css, 'shown = the theme green'
    assert 'background-color: var(--color-neutral)' in css, 'hidden = the theme grey'
    literals = re.findall(r'#[0-9a-fA-F]{3,8}', css)
    assert not literals, f'a manager colour has to come from the palette: {literals}'


MODEL_MANAGER_JS = BROWSER / 'js' / 'model_manager.js'
NOTIF_JS = CORE / 'js' / 'common' / 'scripts' / 'notifications.js'


def test_toggling_never_rebuilds_the_list_and_show_all_is_one_way():
    """A switch two thirds down must not scroll the list; Show all only ever shows."""
    manager = _text(MANAGER_JS)
    state = _text(STATE_JS)

    # A toggle repaints the rows in place, and any rebuild keeps the scroll position.
    assert "document.addEventListener('saus:app-visibility-changed', applyRowVisibility);" in manager
    assert 'function applyRowVisibility()' in manager and 'row.classList.toggle' in manager, \
        'the switch is updated where it is, never by re-rendering the pane'
    assert 'const scrollTop = previousList ? previousList.scrollTop : 0;' in manager
    assert 'list.scrollTop = scrollTop;' in manager
    assert 'list.scrollTop = scrollTop;' in _text(MODEL_MANAGER_JS), \
        'the model manager rebuilds on a status change too, so it keeps it as well'

    # "Show all": greyed out while nothing is hidden; clicking it on shows everything
    # in one write; the off direction stays refused in code as a safety net.
    assert "createElement('span', 'manager-showall-text', 'Show all')" in manager
    assert 'await showAllApps();' in manager and 'export async function showAllApps()' in state
    assert 'input.disabled = nothingHidden;' in manager, 'a no-op switch is greyed out'
    assert "showAllWrap.classList.toggle('manager-showall-disabled', nothingHidden);" in manager
    assert 'showAll.disabled = nothingHidden;' in manager, 'kept in step in place'
    assert '.manager-showall-disabled' in _text(MANAGERS_CSS)
    assert 'input.checked = true;' in manager, 'the off direction springs back on'
    assert "showNotice('Apps are hidden one at a time" in manager
    assert 'export function showNotice(' in _text(NOTIF_JS), \
        'the shell breadcrumb is shared, not copied'

    # The hint lines are gone from both managers.
    assert 'manager-hint' not in manager
    assert 'manager-hint' not in _text(MODEL_MANAGER_JS)


def test_the_app_manager_groups_by_section_and_subcategory():
    """The panel's filing, in columns as wide as the explorer panel."""
    manager = _text(MANAGER_JS)
    css = _text(MANAGERS_CSS)

    assert 'function appendGroups(container, apps, sections)' in manager, \
        'the list is grouped, not flat'
    assert 'manager-section-title' in manager and 'manager-group-title' in manager, \
        'a heading per section and per subcategory'
    assert "'manager-grid'" in manager and 'manager-group-head' in manager
    assert 'grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));' in css, \
        'flexible columns, each as wide as the side panel (300px)'
    assert '.manager-subgroup' in css and 'border: 1px solid var(--color-border)' in css, \
        'each subcategory is boxed, so its apps cannot be read as the next group'
    assert 'manager-section-title' in css and 'manager-group-count' in css
    assert 'Uncategorised' in manager, 'a category the taxonomy lacks must not hide the app'
    assert 'turn on "Show deprecated apps" in Settings to manage them' not in manager, \
        'the deprecated notice in the hint is gone (the head still counts them)'


def test_the_app_manager_row_click_opens_nothing():
    """The click is executed, not just asserted: see tests/js/app_manager.harness.mjs."""
    manager = _text(MANAGER_JS)
    assert "new CustomEvent('saus:open-app'" not in manager, \
        'the manager never dispatches the open-app event'

    node = (shutil.which('node') or shutil.which('nodejs')
            or next((candidate for candidate in ('/workspace/code-server/lib/node',
                                                 '/usr/local/bin/node', '/usr/bin/node')
                     if Path(candidate).is_file()), None))
    if node is None:
        print('  skip  app_manager.harness.mjs needs node, which is not installed here')
        return

    harness = ROOT / 'tests' / 'js' / 'app_manager.harness.mjs'
    result = subprocess.run([node, str(harness)], cwd=str(ROOT),
                            capture_output=True, text=True)
    assert result.returncode == 0, \
        f'{harness.name} failed:\n{result.stdout}\n{result.stderr}'
    assert '4/4 OK' in result.stdout, 'the four cases have to run'


def test_the_model_manager_cards_are_flexible_with_app_chips():
    """Like the App Manager: flexible columns, each card naming the apps that need it."""
    manager = _text(MODEL_MANAGER_JS)
    models = _text(BROWSER / 'js' / 'models.js')
    css = _text(MANAGERS_CSS)

    # A card is the model band on top and the apps below it.
    assert "createElement('div', 'manager-model-card')" in manager
    assert "item.className = 'component-item manager-model-row';" in manager, \
        'the top band is the .component-item, so the red/green only covers it'
    assert "createElement('div', 'manager-model-uses')" in manager
    assert 'grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));' in css
    assert '.manager-model-card' in css and '.manager-app-thumb' in css
    assert 'manager-uses-label' not in manager and "'Used by'" not in manager, \
        'the label is gone - the chips speak for themselves'

    # The apps are thumbnails + names, filed by category; the category is only in the tooltip.
    assert 'function appChip(app, categoryLabelText = ' in manager
    assert 'appThumbSrc(app)' in manager and 'thumb.title = tooltip' in manager
    assert 'manager-app-list' in manager
    assert 'manager-app-category' not in manager, 'no category label written on the card'
    assert 'function orderedCategoryIds(byCategory)' in manager, 'filed in taxonomy order'
    assert 'const APP_CHIPS_SHOWN' in manager and 'manager-app-more' in manager, \
        'a long list is counted, with every name in the tooltip'

    # The list itself is grouped by model kind, in boxed sections like the App Manager.
    assert 'function appendTypeGroups(container, files, usage)' in manager
    assert 'function orderedTypes(byType)' in manager, 'a stable order per kind'
    assert "createElement('section', 'manager-subgroup')" in manager, 'each kind is boxed'
    assert 'manager-group-title' in manager and 'prettyType(type)' in manager

    # Architectures are counted (for the Unused chip) but never named.
    assert 'Architecture:' not in manager and 'usesTooltip' not in manager
    assert 'architectures.push(value)' in manager

    # A variant's LoRA belongs to the app whose architecture names it.
    assert 'variantBlocks' in manager and 'export function variantBlocks(app)' in models, \
        'the variant files (picks and LoRAs) are what makes "used by" truthful'

    # The kind is the section heading and the folder is a lookup hint only.
    assert 'function folderOf(model)' not in manager, 'the folder is not shown on a card'
    assert "'no download URL'" in manager, 'only a real problem gets a line'

    assert 'let typeFilter' in manager and 'function typeBar(files)' in manager
    assert 'matchesType' in manager and 'prettyType(type)' in manager
    assert 'All types' in manager


def test_the_model_manager_reuses_the_model_plumbing():
    """No second implementation: the rows and the actions belong to models.js."""
    manager = _text(MODEL_MANAGER_JS)
    models = _text(BROWSER / 'js' / 'models.js')

    assert 'fetch(' not in manager, 'every call goes through models.js'
    for shared in ('handleModelActionClick', 'statusEntry', 'fetchModelStatuses',
                   'applyStatusToItem', 'downloadProgressOf'):
        assert shared in manager, f'the manager uses {shared}'
        assert (f'export function {shared}' in models
                or f'export async function {shared}' in models), \
            f'{shared} is exported by models.js'

    assert "item.className = 'component-item manager-model-row';" in manager, \
        'the row is the markup the app details panel paints'
    assert 'item.dataset.fileId = file;' in manager and \
        "item.dataset.listType = 'compulsory';" in manager
    assert 'handleModelActionClick)' in manager, 'one delegated dispatcher for the buttons'


def test_the_model_manager_knows_who_uses_each_model():
    manager = _text(MODEL_MANAGER_JS)

    assert 'state.allApps' in manager, 'apps come from their metadata.models'
    assert 'state.ARCHITECTURES' in manager, 'architectures from their model groups'
    assert 'variant.pick' in manager and 'variant.loras' in manager, \
        'variant picks and LoRAs count as usage too'
    assert "id: 'unused', label: 'Unused'" in manager, 'the orphan view'
    assert "filter === 'unused'" in manager and '!usage.has(file)' in manager
    assert 'downloadProgressOf(file)' in manager, 'a download in flight shows here as well'


def test_progress_reaches_every_row_that_lists_the_model():
    """A download started in one view paints in the other: same rows, same lookup."""
    models = _text(BROWSER / 'js' / 'models.js')

    body = models.split('export function updateComponentStatus', 1)[1].split('\n}', 1)[0]
    assert "document.querySelectorAll('.component-item')" in body, \
        'the rows of whichever view is open have to update'
    assert "getElementById('app-details-content')" not in body, \
        'the old lookup only ever saw the details modal'
    assert 'el.dataset.fileId === fileId' in body, \
        'looked up by property, never parsed as a selector'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)} managers-view tests passed')


if __name__ == '__main__':
    main()
