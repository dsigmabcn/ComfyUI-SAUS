"""Deprecated apps: hidden from the explorer, still discovered and routable."""

import json
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _install_aiohttp_stub():
    if 'aiohttp' not in sys.modules:
        aiohttp = types.ModuleType('aiohttp')
        web = types.ModuleType('aiohttp.web')
        web.Response = object
        web.Request = object
        aiohttp.web = web
        sys.modules['aiohttp'] = aiohttp
        sys.modules['aiohttp.web'] = web


_install_aiohttp_stub()

from saus import management  # noqa: E402  (after the stub)


# Superseded families, parked when their successor arrived:
#   FLUX 2 Klein            -> FLUX 3 Image Klein
#   Qwen Image / Qwen Image Edit -> Qwen Image 2.1 (and its Edit app)
#   Flux Redux              -> the newer FLUX image-to-image apps
#   Flux Dev                -> FLUX 2 / FLUX 3 Klein
#   Stable Diffusion XL     -> the newer Z-Image / Qwen Image apps
#   FLUX USO (both apps)    -> FLUX 2 / FLUX 3 Klein Edit
DEPRECATED_URLS = (
    'flux3-klein-text-to-image',
    'flux3-klein-edit-image',
    'flux3-klein-edit-2-images',
    'qwen-image-text-to-image',
    'qwen-image-edit',
    'qwen-image-edit-2-images',
    'flux-redux-2-images',
    'flux-dev-text-to-image',
    'stable-diffusion-xl',
    'flux-uso-2-references',
    'flux-uso-subject-reference',
)


def _config_url(folder):
    """The `url` field of an app folder's appConfig (the route path)."""
    config = json.loads((folder / management.APPS_CONFIG_FILE).read_text(encoding='utf-8'))
    return config.get('url')


def test_the_flag_is_derived_from_the_folder():
    """A `deprecated/` ancestor means deprecated - and nothing else does."""
    apps_root = management.SAUS_APPS_PATH
    assert management._is_deprecated(apps_root / 'deprecated' / 'an-app') is True, \
        'an app directly inside deprecated/ is deprecated'
    assert management._is_deprecated(apps_root / 'deprecated' / 'deeper' / 'an-app') is True, \
        'nor a nested deprecated/ - the whole chain below web/apps counts'
    assert management._is_deprecated(apps_root / 'an-app') is False, \
        'a top-level app is not deprecated'
    assert management._is_deprecated(apps_root / 'deprecated') is False, \
        'an app named "deprecated" is not itself one (its own name is excluded)'
    assert management._is_deprecated(Path('/somewhere/deprecated/an-app')) is False, \
        'a path outside web/apps must not deprecate anything'


def test_the_api_still_lists_them_and_flags_them():
    """Hidden in the UI, still in `/saus/api/apps` - that is how the switch works."""
    configs = {c['url']: c for c in management._load_app_configs()}
    for url in DEPRECATED_URLS:
        assert url in configs, \
            f'{url} must still be listed: the explorer filters it, the API does not'
        assert configs[url]['deprecated'] is True, f'{url} must be flagged deprecated'
    others = [url for url in configs if url not in DEPRECATED_URLS]
    assert others, 'the checkout ships other apps'
    flagged = [url for url in others if configs[url]['deprecated']]
    assert not flagged, \
        'only apps under web/apps/deprecated/ may be flagged, but got %s' % flagged


def test_they_really_live_under_deprecated():
    for url in DEPRECATED_URLS:
        folder = management.SAUS_APPS_PATH / 'deprecated' / url
        assert (folder / management.APPS_CONFIG_FILE).is_file(), \
            f'{url} is expected in web/apps/deprecated/'
        assert not (management.SAUS_APPS_PATH / url).exists(), \
            f'{url} must not also sit at the top level (the flag would go with it)'
        # The route is built from the appConfig's `url`, so nesting never moves it.
        assert _config_url(folder) == url, \
            f'{url}: url field must equal the folder name, or the route 404s'


if __name__ == '__main__':
    failures = 0
    for name, fn in sorted(list(globals().items())):
        if name.startswith('test_') and callable(fn):
            try:
                fn()
                print('  OK   ' + name)
            except AssertionError as exc:
                failures += 1
                print('  FAIL ' + name + ' -> ' + repr(exc))
    print('%s' % ('ALL PASSED' if not failures else '%d FAILED' % failures))
    sys.exit(1 if failures else 0)
