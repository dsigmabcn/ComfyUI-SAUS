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
ARCHITECTURE_MODELS_JS = ROOT / 'web' / 'core' / 'js' / 'common' / 'scripts' / 'architectureModels.js'
ARCHITECTURE_HARNESS = ROOT / 'tests' / 'js' / 'architecture_models.harness.mjs'
ARCHITECTURES_JSON = ROOT / 'web' / 'saus_browser' / 'data' / 'architectures.json'
CORE_TEMPLATE = ROOT / 'web' / 'core' / 'templates' / 'index.html'
CORE_BOOT = ROOT / 'web' / 'core' / 'loadScripts.js'
BUILDER_TEMPLATE = (ROOT.parent / 'ComfyUI-SAUS-builder' / 'builder_assets'
                    / 'appTemplate' / 'index.html')


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


def test_the_app_page_preloads_its_entry_module():
    """The runtime is ~50 modules: start the graph before the document is parsed.

    Today the browser learns about them only once loadScripts.js runs, which is
    itself behind the content.html fetch - two round trips of nothing.
    """
    source = CORE_TEMPLATE.read_text(encoding='utf-8')
    boot = CORE_BOOT.read_text(encoding='utf-8')

    assert '<link rel="modulepreload" href="/core/loadScripts.js">' in source, \
        'the boot script is preloaded'
    assert "'/core/js/dist/core.bundle.min.js'" in source, 'and so is the entry module'
    assert "encodeURIComponent(config.appName)" in boot, \
        'the query loadScripts.js builds for the entry module'
    assert "encodeURIComponent(sausPreloadApp)" in source, \
        'which the preload mirrors, so the bundle is not fetched twice'

    # The builder keeps its own copy of this page: it has to get the same head.
    if BUILDER_TEMPLATE.is_file():
        builder = BUILDER_TEMPLATE.read_text(encoding='utf-8')
        assert "sausEntry.rel = 'modulepreload'" in builder, \
            'the builder preview page keeps the same head as the page SAUS serves'


CANVAS_DIR = ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'canvas'


def test_a_page_that_cannot_mask_does_not_download_the_brushes():
    """The canvas plugins are ~200 KB, and only a masking app can ever show them.

    They were static imports of CanvasLoader, so they were part of *every* app
    page's module graph - a text-to-image app downloaded the brushes it has no UI
    for. Each one is now imported by the branch that registers it.
    """
    loader = (CANVAS_DIR / 'CanvasLoader.js').read_text(encoding='utf-8')

    for plugin in ('MaskBrushPlugin', 'CustomBrushPlugin', 'ImageLoaderPlugin',
                   'ImageCompareSliderPlugin', 'CanvasControlsPlugin', 'UndoRedoPlugin',
                   'CanvasScaleForSavePlugin', 'ImageAdderPlugin'):
        assert "from './%s.js'" % plugin not in loader, \
            '%s must not be in the page-wide module graph' % plugin
        assert "await import('./%s.js')" % plugin in loader, \
            'and the branch that registers it still loads it'

    assert 'loadDependencies()' in loader, \
        'fabric is still only pulled in when the canvas is actually built'
    assert 'await import(' in (CANVAS_DIR / 'CanvasLoader.js').read_text(encoding='utf-8'), \
        'the plugin fetch happens during init(), which the Run path awaits'


def test_architecture_models_harness():
    """The group -> file rule, executed: see tests/js/architecture_models.harness.mjs."""
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{ARCHITECTURE_HARNESS.name} needs node, which is not installed here')

    result = subprocess.run([node, str(ARCHITECTURE_HARNESS)], cwd=str(ROOT),
                            capture_output=True, text=True)
    assert result.returncode == 0, (
        f'{ARCHITECTURE_HARNESS.name} failed:' + result.stdout + result.stderr)


def test_a_variant_less_app_still_binds_its_model():
    """Fifteen architectures have models but no variants: pick one *is* the choice.

    They used to be a dead end. The mode selector bound models only for a named
    variant, so an app on one of them ran whatever its graph happened to contain -
    and 'hd' hides the model selectors, so the user could neither see nor change it.
    """
    js = APP_MAIN_JS.read_text(encoding='utf-8')

    assert "from './js/common/scripts/architectureModels.js'" in js, \
        'the group -> file rule is shared, not written twice'
    assert 'groupFile' in js and 'dropdownForGroup' in js, \
        'both rules - which file, and which dropdown - come from that module'
    assert "if (variant || (mode !== 'custom' && !hasVariants)) {" in js, \
        'a variant-less architecture takes the same binding path, with an empty pick'
    assert 'groupFile(group, variant && variant.pick, fileInstalled)' in js, \
        'and asks the shared rule which file to bind'
    assert 'let file = (variant.pick || {})[group.id];' not in js, \
        'the hand-rolled pick is gone from the binding'
    assert "if (!file && group.need === 'all' && files.length) file = files[0];" not in js, \
        'and from the button gate'

    # The selectors are only taken away when HD really does pick the files itself.
    assert 'hdPicksModels = hasVariants;' in js, 'HD picks models only where variants do'
    assert "setModelWidgetsVisible(mode === 'custom' || !hdPicksModels);" in js, \
        'so a variant-less app keeps its model selectors'
    assert "else { // for 'hd' and 'turbo'" not in js, \
        'the unconditional hide is gone'


def test_every_variant_less_architecture_has_somewhere_to_bind():
    """The implicit Base only helps if each group names the node it fills."""
    import json

    architectures = json.loads(ARCHITECTURES_JSON.read_text(encoding='utf-8'))
    variant_less = {name: arch for name, arch in architectures.items()
                    if arch.get('models') and not arch.get('variants')}

    assert variant_less, 'the shape this fix exists for is real'
    for name, arch in variant_less.items():
        for group in arch['models']:
            assert (group.get('node') or {}).get('nodeType'), \
                '%s/%s names no node, so its file has nowhere to go' % (name, group.get('id'))


def test_a_control_that_fails_does_not_take_the_page_with_it():
    """The SeedVR2 input was missing and nothing said so: an exception aborted main()."""
    js = APP_MAIN_JS.read_text(encoding='utf-8')

    assert 'function buildControls(kind, configs, build) {' in js, 'one guarded loop per kind'
    assert 'failedControls.push(`${kind} "${label}"`)' in js, 'the failure is remembered'
    assert 'console.error(`[SAUS] ${kind} "${label}" failed:`, error)' in js, \
        'and named, so the console says which control and why'

    for kind in ('dropdown', 'stepper', 'dimension selector', 'aspect ratio', 'input',
                 'toggle', 'seeder', 'multi component', 'data component'):
        assert f"buildControls('{kind}'" in js, f'{kind} is built through the guard'

    assert 'appConfig.dropdowns.forEach(config => {' not in js, \
        'no kind is still built by a bare forEach'
    assert "failedControls.push('input loader')" in js, \
        'the drop area is the widget that was missing - it is guarded too'


def test_the_page_says_which_controls_never_rendered():
    """A configured control that is absent is a half-built app; name it."""
    js = APP_MAIN_JS.read_text(encoding='utf-8')

    assert 'function reportMissingControls() {' in js
    assert 'if (!id || !document.getElementById(id))' in js, \
        'a control counts as rendered when its container is in the DOM'
    assert "reportMissingControls();" in js, 'and the report runs'
    assert js.index('await setupModeSelector();') < js.index('reportMissingControls();'), \
        'after the mode selector: it is the last thing that can render a control'

    report = js.split('function reportMissingControls()', 1)[1].split('\n    }', 1)[0]
    assert 'data component' not in report.split('const wanted = [', 1)[1].split('];', 1)[0], \
        'a data component draws nothing on purpose, so its absence means nothing'
    assert 'multi component' in report.split('const wanted = [', 1)[1].split('];', 1)[0], \
        'a multi component does draw, so its absence means something'
    assert "getElementById('load-image-container')" in report, \
        'and the input loader is checked by the container it creates'
    assert 'failed: ' not in report and 'failedControls' in report, \
        'the report is both halves: what threw and what never appeared'


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
