"""The app runtime bundle: committed, generated, and never silently stale.

ComfyUI serves static files uncompressed (its `compress_body` middleware only touches
a buffered body, and a `FileResponse` streams from disk), so the runtime really was
~42 module requests / ~300 KB on a cold open. `tools/bundle_core.py` builds them into
one file; this suite keeps that file honest.

The check needs a bundler. `--no-download` is deliberately *not* passed, so a fresh
CI machine fetches esbuild once and the check runs for real; with neither a bundler
nor network the suite skips with a reason rather than passing quietly.
"""

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT.parent / 'ComfyUI-SAUS-builder' / 'tools' / 'bundle_core.py'
BUNDLE = ROOT / 'web' / 'core' / 'js' / 'dist' / 'core.bundle.min.js'
SOURCE_JS_DIR = ROOT / 'web' / 'core' / 'js'
BOOT = ROOT / 'web' / 'core' / 'loadScripts.js'
ENTRY = ROOT / 'web' / 'core' / 'main.js'


class SkippedTest(Exception):
    """Raised when the check cannot run here (no bundler, no network)."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


def test_the_bundle_is_there_and_wears_its_manifest():
    assert BUNDLE.is_file(), (
        'web/core/js/dist/core.bundle.min.js is the runtime the page loads - build it with '
        'python tools/bundle_core.py --apply')
    head = BUNDLE.read_text(encoding='utf-8')[:300]
    assert re.search(r'/\* saus-bundle:[0-9a-f]{40} ', head), \
        'the manifest the staleness check reads'
    assert ENTRY.is_file(), 'the sources it was built from ship beside it'


def test_every_chunk_the_bundle_imports_is_committed():
    """The lazy canvas plugins are chunks: a missing one is a broken masking app."""
    reachable, frontier = set(), [BUNDLE]
    while frontier:
        current = frontier.pop()
        if not current.is_file():
            continue
        for name in re.findall(r'\./(core\.chunk-[^"]+\.js)', current.read_text(encoding='utf-8')):
            if name not in reachable:
                reachable.add(name)
                frontier.append(BUNDLE.parent / name)
    assert reachable, 'the bundle imports the chunks it split out'

    for name in sorted(reachable):
        assert (BUNDLE.parent / name).is_file(), '%s is missing from the checkout' % name

    committed = {path.name for path in BUNDLE.parent.glob('core.chunk-*.js')}
    assert committed == reachable, (
        'a chunk nothing reaches is left over from an older build: %s'
        % sorted(committed - reachable))


def test_the_source_tree_holds_no_build_output():
    """The generated files live in one folder of their own (web/core/js/dist/).

    A build that writes beside its sources turns a listing of `web/core/js/` into a
    dozen hashed names, and a leftover from an older build cannot be told from a file
    somebody put there on purpose.
    """
    assert BUNDLE.parent.name == 'dist', 'the build writes into dist/'
    assert (BUNDLE.parent / 'core.bundle.min.js').is_file(), 'and it is there'

    strays = sorted(path.name for path in SOURCE_JS_DIR.glob('core.*.js'))
    assert not strays, 'build output beside the sources: %s' % strays
    assert not (SOURCE_JS_DIR / 'core.bundle.min.js').exists(), \
        'the bundle has moved out of the source directory'


def test_the_page_loads_the_bundle_and_keeps_a_way_back():
    boot = BOOT.read_text(encoding='utf-8')

    assert "scripts: ['/core/js/dist/core.bundle.min.js']" in boot, 'the page loads the bundle'
    assert "moduleFallback: '/core/main.js'" in boot, 'and knows what it was built from'
    assert 'await loadScript(config.moduleFallback);' in boot, \
        'so a bundle that cannot be fetched still yields a working page'
    assert 'encodeURIComponent(config.appName)' in boot, \
        'the entry keeps the app name in its query'


def test_the_committed_bundle_matches_its_sources():
    """A core JS edit that forgets to re-bundle must fail here, not ship stale."""
    if not TOOL.is_file():
        _skip('the builder checkout is not beside this one')

    result = subprocess.run([sys.executable, str(TOOL), '--saus', str(ROOT)],
                            capture_output=True, text=True)
    if result.returncode == 3:
        _skip('no bundler available here: %s' % result.stdout.strip())
    assert result.returncode == 0, (
        '%s\n%s' % (result.stdout.strip(), result.stderr.strip()))


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    passed = 0
    for name, fn in tests:
        try:
            fn()
        except SkippedTest as skipped:
            print('  skip  %s: %s' % (name, skipped))
            continue
        passed += 1
        print('  ok  ' + name)
    print('%d/%d bundle tests passed' % (passed, len(tests)))


if __name__ == '__main__':
    main()
