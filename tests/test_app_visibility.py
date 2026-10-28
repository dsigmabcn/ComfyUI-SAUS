"""The App Manager's hidden-app store: display only, install-wide, and strict.

The list lives in the node's own data dir and can only ever hold ids of apps that
are actually installed - so it can never become a place to park a path or a name
of a caller's choosing.
"""

import asyncio
import json
import sys
import tempfile
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class _Response:
    def __init__(self, payload, status=200):
        self.status = status
        self._payload = payload

    def text(self):
        return json.dumps(self._payload)


def _stub_aiohttp():
    if 'aiohttp' in sys.modules:
        return
    web = types.ModuleType('aiohttp.web')
    web.Request = object
    web.Response = _Response
    web.json_response = lambda payload=None, status=200, **kwargs: _Response(payload, status)
    aiohttp = types.ModuleType('aiohttp')
    aiohttp.web = web
    sys.modules['aiohttp'] = aiohttp
    sys.modules['aiohttp.web'] = web


_stub_aiohttp()

from saus import management as MG  # noqa: E402


class _Request:
    def __init__(self, payload=None, content_type='application/json'):
        self.headers = {'Content-Type': content_type} if content_type else {}
        self._payload = payload

    async def json(self):
        if isinstance(self._payload, Exception):
            raise self._payload
        return self._payload


def _status(response):
    return getattr(response, 'status', None)


def _body(response):
    return json.loads(response.text())


def _use_apps(*app_ids):
    """Point the app root and the settings file at a fresh temp tree."""
    tmp = tempfile.TemporaryDirectory(prefix='saus-visibility-')
    _use_apps.keep = tmp  # stay alive for the duration of the test
    root = Path(tmp.name)
    apps = root / 'apps'
    for app_id in (app_ids or ('app-a', 'app-b')):
        folder = apps / app_id
        folder.mkdir(parents=True)
        (folder / 'appConfig.json').write_text(json.dumps({
            'id': app_id, 'name': app_id, 'url': app_id, 'metadata': {'models': []},
        }), encoding='utf-8')
    MG.SAUS_APPS_PATH = apps
    MG.SETTINGS_FILE = root / 'data' / 'settings.json'
    return root, apps


def _hidden(response):
    return _body(response)['hiddenAppIds']


def test_nothing_is_hidden_before_the_first_save():
    root, apps = _use_apps()
    response = asyncio.run(MG.get_app_visibility_handler(_Request()))
    assert _status(response) == 200 and _hidden(response) == []
    assert not MG.SETTINGS_FILE.exists(), 'reading must not create the file'


def test_hiding_and_showing_an_app_round_trips():
    root, apps = _use_apps()

    response = asyncio.run(MG.set_app_visibility_handler(_Request({'hiddenAppIds': ['app-a']})))
    assert _status(response) == 200 and _hidden(response) == ['app-a']
    assert _hidden(asyncio.run(MG.get_app_visibility_handler(_Request()))) == ['app-a'], \
        'the GET has to report what the POST stored'

    stored = json.loads(MG.SETTINGS_FILE.read_text(encoding='utf-8'))
    assert stored['hiddenAppIds'] == ['app-a'] and stored['schemaVersion'] == 1

    response = asyncio.run(MG.set_app_visibility_handler(_Request({'hiddenAppIds': []})))
    assert _status(response) == 200 and _hidden(response) == []
    assert _hidden(asyncio.run(MG.get_app_visibility_handler(_Request()))) == []


def test_only_installed_apps_are_stored():
    root, apps = _use_apps()
    response = asyncio.run(MG.set_app_visibility_handler(
        _Request({'hiddenAppIds': ['app-a', 'ghost', 'app-a/../../etc', 'app-b']})))
    assert _status(response) == 200
    assert _hidden(response) == ['app-a', 'app-b'], 'unknown ids are dropped, order kept'
    assert json.loads(MG.SETTINGS_FILE.read_text(encoding='utf-8'))['hiddenAppIds'] == \
        ['app-a', 'app-b']


def test_hidden_ids_are_deduped():
    root, apps = _use_apps()
    response = asyncio.run(MG.set_app_visibility_handler(
        _Request({'hiddenAppIds': ['app-b', 'app-a', 'app-b', 'app-a']})))
    assert _status(response) == 200 and _hidden(response) == ['app-b', 'app-a']


def test_the_store_keys_on_the_app_id_not_the_folder():
    """Ids are short codes (`mosssft` lives in the folder `moss-text-to-image`).

    Every shipped app has an id different from its url, so the list has to hold ids -
    a folder name is not an app id and must never be stored as one.
    """
    import shutil

    tmp = tempfile.TemporaryDirectory(prefix='saus-visibility-')
    _use_apps.keep = tmp
    root = Path(tmp.name)
    apps = root / 'apps'
    folder = apps / 'some-long-folder-name'
    folder.mkdir(parents=True)
    (folder / 'appConfig.json').write_text(json.dumps({
        'id': 'shortcode', 'name': 'App', 'url': 'some-long-folder-name',
    }), encoding='utf-8')
    MG.SAUS_APPS_PATH = apps
    MG.SETTINGS_FILE = root / 'data' / 'settings.json'

    response = asyncio.run(MG.set_app_visibility_handler(
        _Request({'hiddenAppIds': ['shortcode', 'some-long-folder-name']})))
    assert _hidden(response) == ['shortcode'], 'the id is the currency, not the folder name'


def test_a_deprecated_app_can_be_hidden_too():
    """Parking an app does not stop it being managed: the manager filters, not the store."""
    root, apps = _use_apps('app-a')
    folder = apps / 'deprecated' / 'old-app'
    folder.mkdir(parents=True)
    (folder / 'appConfig.json').write_text(json.dumps(
        {'id': 'old-app', 'name': 'old-app', 'url': 'old-app'}), encoding='utf-8')

    response = asyncio.run(MG.set_app_visibility_handler(_Request({'hiddenAppIds': ['old-app']})))
    assert _status(response) == 200 and _hidden(response) == ['old-app']


def test_a_malformed_payload_is_refused_and_changes_nothing():
    good = _Request({'hiddenAppIds': ['app-a']})
    asyncio.run(MG.set_app_visibility_handler(good))
    before = MG.SETTINGS_FILE.read_text(encoding='utf-8')

    payloads = [
        [],                                        # not an object
        'app-a',                                   # not an object
        {},                                        # missing the key
        {'hiddenAppIds': 'app-a'},                 # not a list
        {'hiddenAppIds': ['app-a', 42]},           # not ids
        {'hiddenAppIds': ['app-a', None]},
        {'hiddenAppIds': ['app-a'] * (MG.MAX_HIDDEN_APP_IDS + 1)},
    ]
    for payload in payloads:
        response = asyncio.run(MG.set_app_visibility_handler(_Request(payload)))
        assert _status(response) == 400, f'{payload!r} must be refused'
        assert MG.SETTINGS_FILE.read_text(encoding='utf-8') == before, \
            'a refused payload must not touch the stored list'

    response = asyncio.run(MG.set_app_visibility_handler(_Request(ValueError('bad json'))))
    assert _status(response) == 400, 'a body that is not JSON at all is refused too'


def test_a_non_json_content_type_is_refused():
    """The CSRF guard: a cross-site form cannot send this content type."""
    root, apps = _use_apps()
    for content_type in ('application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain', ''):
        response = asyncio.run(MG.set_app_visibility_handler(
            _Request({'hiddenAppIds': ['app-a']}, content_type=content_type)))
        assert _status(response) == 415, f'{content_type!r} must be refused'
    assert not MG.SETTINGS_FILE.exists(), 'nothing may be written without the JSON guard'


def test_the_write_is_atomic_and_stays_in_the_data_dir():
    root, apps = _use_apps()
    asyncio.run(MG.set_app_visibility_handler(_Request({'hiddenAppIds': ['app-a']})))

    assert MG.SETTINGS_FILE.parent == root / 'data', 'the store lives in the node data dir'
    assert list(MG.SETTINGS_FILE.parent.glob('*.tmp')) == [], 'no temporary file is left behind'
    assert list(apps.rglob('settings.json')) == [], 'and nothing is written next to the apps'


def test_an_app_that_disappears_stops_being_hidden():
    import shutil

    root, apps = _use_apps()
    asyncio.run(MG.set_app_visibility_handler(_Request({'hiddenAppIds': ['app-a']})))

    # The app is uninstalled (folder gone) while its id is still in the file.
    shutil.rmtree(apps / 'app-a')
    assert _hidden(asyncio.run(MG.get_app_visibility_handler(_Request()))) == [], \
        'a stale id must not keep hiding anything'

    response = asyncio.run(MG.set_app_visibility_handler(
        _Request({'hiddenAppIds': ['app-a', 'app-b']})))
    assert _hidden(response) == ['app-b'], 'and the next write prunes it for good'


def test_the_visibility_write_cannot_touch_an_app_folder():
    """The App Manager only hides: this store never writes to ``web/apps``."""
    root = Path(__file__).resolve().parents[1]
    source = (root / 'saus' / 'management.py').read_text(encoding='utf-8')

    # The whole settings block: the constant, its helpers and both handlers - and
    # nothing after it (the app-model handlers do read SAUS_APPS_PATH).
    body = source.split('SETTINGS_FILE = DATA_DIR', 1)[1].split('\nARCHITECTURES_FILE', 1)[0]
    for forbidden in ('shutil', 'rmtree', 'unlink', 'rmdir', 'os.remove', 'SAUS_APPS_PATH'):
        assert forbidden not in body, f'the visibility store must not use {forbidden}'
    assert 'require_json(request)' in body, 'and the write keeps the JSON guard'
    assert body.count('os.replace') == 1, 'the one write is the atomic replace'


def test_the_app_visibility_routes_are_registered():
    """The shell posts here, so both routes have to exist (and be the only new ones)."""
    root = Path(__file__).resolve().parents[1]
    source = (root / 'saus' / 'app_manager.py').read_text(encoding='utf-8')

    assert "'/saus/api/app-visibility', 'GET', get_app_visibility_handler" in source
    assert "'/saus/api/app-visibility', 'POST', set_app_visibility_handler" in source
    for destructive in ('/saus/api/delete-app', '/saus/api/move-app', '/saus/api/remove-app'):
        assert destructive not in source, 'an app is never deleted or moved - only hidden'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)} app-visibility tests passed')


if __name__ == '__main__':
    main()
