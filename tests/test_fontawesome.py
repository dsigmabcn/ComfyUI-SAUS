"""Font Awesome: vendored under /core, and every icon it draws is really there.

The UI's icons came from ``cdnjs.cloudflare.com`` - the one cross-origin,
render-blocking request in the whole shell, and the one thing that could hang on a
slow or offline box. They are served from ``/core/media/vendor/fontawesome/`` now,
written by ``tools/vendor_fontawesome.py`` in the builder.

The icons are the part that rots silently: a new ``fa-*`` class with no rule is a
blank box with no error anywhere, so the last test here fails instead.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'web'
CORE = WEB / 'core'
BROWSER_HTML = WEB / 'saus_browser' / 'index.html'
FM_HTML = WEB / 'file_manager' / 'index.html'
APP_MAIN_JS = CORE / 'main.js'
VENDOR = CORE / 'media' / 'vendor' / 'fontawesome'
VENDOR_CSS = VENDOR / 'css' / 'all.min.css'
VENDOR_URL = '/core/media/vendor/fontawesome/css/all.min.css'

# The hosts the icons used to be pulled from. Any of them coming back is the whole
# bug again, so the scan is on the hostname (prose may still mention cdnjs).
CDN_HOSTS = ('cdnjs.cloudflare.com', 'kit.fontawesome.com', 'use.fontawesome.com')

# The fonts the checkout's own classes need: `fas` and `far` only. No `fab` icon is
# used anywhere, so the brands webfont (~108 KB) must not be shipped.
SHIPPED_FONTS = {'fa-solid-900.woff2', 'fa-regular-400.woff2'}

SCANNED_SUFFIXES = ('.js', '.mjs', '.html', '.css')


def _assets():
    """Every file that could carry an icon class, the vendored CSS aside."""
    for path in sorted(WEB.rglob('*')):
        if not path.is_file() or path.suffix not in SCANNED_SUFFIXES:
            continue
        if 'min.js' in path.name or path.name == 'all.min.css':
            continue
        yield path


def _text(path):
    return path.read_text(encoding='utf-8', errors='ignore')


def test_no_page_reaches_for_the_cdn_any_more():
    for path in list(_assets()) + [BROWSER_HTML, FM_HTML, APP_MAIN_JS]:
        source = _text(path)
        for host in CDN_HOSTS:
            assert host not in source, (
                '%s still loads Font Awesome from %s' % (path.relative_to(ROOT), host))


def test_every_page_loads_the_vendored_copy():
    for path in (BROWSER_HTML, FM_HTML):
        assert VENDOR_URL in _text(path), (
            '%s has to link the vendored stylesheet' % path.name)
    assert VENDOR_URL in _text(APP_MAIN_JS), 'and so does every app page it opens'


def test_only_the_families_the_ui_uses_are_shipped():
    fonts = {path.name for path in (VENDOR / 'webfonts').iterdir() if path.is_file()}
    assert fonts == SHIPPED_FONTS, (
        'the vendored webfonts should be exactly what fas/far need, got %s'
        % sorted(fonts))


def test_the_css_points_only_at_fonts_that_are_really_there():
    """A @font-face src is resolved relative to the stylesheet, inside /core."""
    css = _text(VENDOR_CSS)
    sources = re.findall(r'url\(([^)]+)\)', css)
    assert sources, 'the vendored stylesheet has to point at its own fonts'
    assert all(source.endswith('.woff2') for source in sources), (
        'only woff2 is shipped, so no source may name a format that is not here')

    mount = CORE.resolve()
    for source in sources:
        target = (VENDOR_CSS.parent / source).resolve()
        assert target.is_file(), '%s is missing from the checkout' % source
        assert str(target).startswith(str(mount) + '/'), (
            '%s escapes the /core mount' % source)


def test_every_icon_the_ui_asks_for_is_in_the_vendored_css():
    """A class with no rule draws nothing, and nothing anywhere says so."""
    css = _text(VENDOR_CSS)
    missing = set()
    for path in _assets():
        for name in re.findall(r'\bfa-[a-z0-9-]+', _text(path)):
            if not re.search(r'[.]' + re.escape(name) + r'([:{])', css):
                missing.add('%s (in %s)' % (name, path.name))

    assert not missing, (
        'these icons have no rule in the vendored stylesheet, so they would render '
        'as blank boxes - re-run tools/vendor_fontawesome.py: %s' % sorted(missing))


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print('  ok  ' + name)
    print('%d fontawesome tests passed' % len(tests))


if __name__ == '__main__':
    main()
