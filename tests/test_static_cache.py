"""The static cache middleware: the shell's own files must revalidate."""

import asyncio
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _install_aiohttp_stub():
    if 'aiohttp' not in sys.modules:
        aiohttp = types.ModuleType('aiohttp')
        web = types.ModuleType('aiohttp.web')
        web.middleware = lambda fn: fn          # keep the function itself
        web.Request = object
        aiohttp.web = web
        sys.modules['aiohttp'] = aiohttp
        sys.modules['aiohttp.web'] = web


_install_aiohttp_stub()

from saus import static_cache  # noqa: E402  (after the stub)


class FakeRequest:
    def __init__(self, path):
        self.path = path


class FakeResponse:
    def __init__(self):
        self.headers = {}


def _run(path, headers=None):
    """Drive the middleware with a stub handler and return the response."""
    response = FakeResponse()
    if headers:
        response.headers.update(headers)

    async def handler(request):
        return response

    return asyncio.run(static_cache.revalidate_middleware(FakeRequest(path), handler))


def test_core_files_revalidate():
    assert static_cache.should_revalidate('/core/css/main.css') is True
    assert static_cache.should_revalidate('/core/content.html') is True


def test_saus_pages_and_assets_revalidate():
    assert static_cache.should_revalidate('/saus/js/main.js') is True
    assert static_cache.should_revalidate('/saus/file_manager/css/styles.css') is True


def test_vendored_fonts_are_cached_like_media():
    """A webfont never changes, so revalidating it is a round trip for nothing."""
    assert static_cache.cache_control_for(
        '/core/media/vendor/fontawesome/webfonts/fa-solid-900.woff2') == 'public, max-age=3600'
    assert static_cache.cache_control_for(
        '/core/media/vendor/fontawesome/css/all.min.css') == 'no-cache', \
        'the stylesheet that points at them still revalidates'


def test_api_responses_keep_their_own_headers():
    assert static_cache.should_revalidate('/saus/api/model-status-batch') is False
    assert static_cache.should_revalidate('/saus/api/saus-version') is False


def test_unrelated_paths_are_untouched():
    # ComfyUI's own routes and the bare page URL (that route sets the header itself)
    assert static_cache.should_revalidate('/') is False
    assert static_cache.should_revalidate('/saus') is False
    assert static_cache.should_revalidate('/history') is False
    assert static_cache.should_revalidate('') is False


def test_middleware_sets_no_cache_on_a_static_file():
    response = _run('/core/css/main.css')
    assert response.headers['Cache-Control'] == 'no-cache'


def test_middleware_leaves_the_api_alone():
    response = _run('/saus/api/apps')
    assert 'Cache-Control' not in response.headers


def test_middleware_does_not_clobber_an_existing_header():
    response = _run('/core/content.html', headers={'Cache-Control': 'no-cache'})
    assert response.headers['Cache-Control'] == 'no-cache'


class FakeApp:
    def __init__(self):
        self.middlewares = []


def test_install_adds_the_middleware_once():
    app = FakeApp()

    assert static_cache.install(app) is True
    assert app.middlewares == [static_cache.revalidate_middleware]

    assert static_cache.install(app) is False        # a second setup adds nothing
    assert app.middlewares == [static_cache.revalidate_middleware]


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)} static-cache tests passed')


if __name__ == '__main__':
    main()
