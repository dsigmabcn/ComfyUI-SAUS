"""The catalogs answer a revalidation with a bodyless 304.

The shell and every app page re-read `/saus/api/apps` (~201 KB of appConfigs),
`/architectures` (~55 KB) and `/models` (~30 KB), and `Cache-Control: no-cache`
means the browser has to ask each time. Without a validator that question costs the
whole body, so these tags are what make the re-read affordable.
"""

import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _install_aiohttp_stub():
    if 'aiohttp' in sys.modules:
        return
    aiohttp = types.ModuleType('aiohttp')
    web = types.ModuleType('aiohttp.web')

    class Response:
        def __init__(self, status=200, headers=None, **kwargs):
            self.status = status
            self.headers = dict(headers or {})
            self.payload = None

    def json_response(payload, status=200, headers=None):
        response = Response(status=status, headers=headers)
        response.payload = payload
        return response

    web.Response = Response
    web.Request = object
    web.json_response = json_response
    web.middleware = lambda fn: fn
    aiohttp.web = web
    sys.modules['aiohttp'] = aiohttp
    sys.modules['aiohttp.web'] = web


_install_aiohttp_stub()

from saus import management  # noqa: E402  (after the stub)


class FakeRequest:
    def __init__(self, headers=None):
        self.headers = dict(headers or {})


def test_a_tag_follows_the_files_not_the_order():
    first = ROOT / 'web' / 'saus_browser' / 'data' / 'taxonomy.json'
    second = ROOT / 'web' / 'saus_browser' / 'data' / 'models.json'

    assert management._files_etag([first, second]) == management._files_etag([second, first]), \
        'the same set of files is the same tag, whatever order it is walked in'
    assert management._files_etag([first]) != management._files_etag([first, second]), \
        'and adding a file changes it'


def test_an_absent_file_has_no_tag():
    missing = ROOT / 'web' / 'saus_browser' / 'data' / 'nope.json'
    assert management._file_etag(missing) is None, 'nothing to validate against'


def test_a_fresh_caller_gets_a_bodyless_304():
    payload = {'a': 1}
    tag = management._files_etag([ROOT / 'web' / 'saus_browser' / 'data' / 'taxonomy.json'])

    first = management._json_unless_fresh(FakeRequest(), payload, tag)
    assert first.status == 200 and first.payload == payload, 'the first ask gets the body'
    assert first.headers['ETag'] == tag, 'and the tag to ask with next time'
    assert first.headers['Cache-Control'] == 'no-cache', 'the answer is never cached'

    again = management._json_unless_fresh(FakeRequest({'If-None-Match': tag}), payload, tag)
    assert again.status == 304, 'a matching tag means "you already have it"'
    assert again.payload is None, 'and the body is not sent again'
    assert again.headers['Cache-Control'] == 'no-cache', 'the 304 carries the policy too'

    changed = management._json_unless_fresh(
        FakeRequest({'If-None-Match': '"something-else"'}), payload, tag)
    assert changed.status == 200 and changed.payload == payload, \
        'a tag from another version still gets the body'


def test_every_catalog_endpoint_uses_the_validator():
    source = (ROOT / 'saus' / 'management.py').read_text(encoding='utf-8')

    assert source.count('_json_unless_fresh(request,') == 4, \
        'apps, architectures, taxonomy and models all answer revalidations'
    for handler in ('async def apps_handler', 'async def get_architectures_handler',
                    'async def get_taxonomy_handler', 'async def get_models_registry_handler'):
        body = source.split(handler, 1)[1].split('async def ', 1)[0]
        assert '_json_unless_fresh(request' in body, '%s is validated' % handler
    assert 'def _file_etag(' in source and 'def _files_etag(' in source, \
        'one place computes the tag'


def test_the_apps_own_files_revalidate_except_the_live_preview():
    """`wf.json` / `appConfig.json` are revalidated, never re-downloaded blindly."""
    scripts = ROOT / 'web' / 'core' / 'js' / 'common' / 'scripts'
    cache_query = (scripts / 'cacheQuery.js').read_text(encoding='utf-8')

    assert "LIVE_PREVIEW_APP = 'saus-builder-preview'" in cache_query, \
        'one app is rewritten under the browser, and it is named here'

    for name in ('fetchWorkflow.js', 'fetchappConfig.js'):
        source = (scripts / name).read_text(encoding='utf-8')
        assert 'cacheQuery(app)' in source, '%s asks for the (usually empty) query' % name
        assert 'cacheSaus=${Date.now()}' not in source, \
            '%s no longer busts the cache unconditionally' % name

    builder = ROOT.parent / 'ComfyUI-SAUS-builder' / 'builder_paths.py'
    if builder.is_file():
        assert 'PREVIEW_NAME = "saus-builder-preview"' in builder.read_text(encoding='utf-8'), \
            'the builder names its preview app the same, or a live edit revalidates as unchanged'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print('  ok  ' + name)
    print('%d catalog-cache tests passed' % len(tests))


if __name__ == '__main__':
    main()
