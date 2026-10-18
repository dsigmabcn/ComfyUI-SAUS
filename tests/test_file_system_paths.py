"""The file API's path rules, from the registry review."""

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

    class _FileResponse:
        def __init__(self, path, **kwargs):
            self.path = path
            self.status = 200

    web.FileResponse = _FileResponse
    aiohttp = types.ModuleType('aiohttp')
    aiohttp.web = web
    sys.modules['aiohttp'] = aiohttp
    sys.modules['aiohttp.web'] = web


_stub_aiohttp()

from saus import file_system as FS  # noqa: E402
from saus import helpers  # noqa: E402


class _Request:
    def __init__(self, payload=None, query=None, content_type='application/json'):
        self.headers = {'Content-Type': content_type} if content_type else {}
        self.query = query or {}
        self._payload = payload

    async def json(self):
        return self._payload


def _status(response):
    return getattr(response, 'status', None)


def _use_tree():
    """Point the allowed roots at a fresh temp tree; return it."""
    tmp = tempfile.TemporaryDirectory(prefix='saus-fs-')
    _use_tree.keep = tmp  # stay alive for the duration of the test
    root = Path(tmp.name)
    inp, out, models = root / 'input', root / 'output', root / 'models'
    for directory in (inp, out, models):
        directory.mkdir(parents=True, exist_ok=True)
    helpers.ALLOWED_FILE_ROOTS = (inp, out, models)
    helpers.COMFYUI_DIRECTORY = root
    FS.INPUT_FILES_DIRECTORY = inp
    FS.OUTPUT_FILES_DIRECTORY = out
    FS.MODELS_DIRECTORY = models
    return root, inp, out, models


def test_download_file_rejects_unc_paths_as_strings():
    _use_tree()
    for value in (r'\\server\share\model.safetensors',
                  '//server/share/model.safetensors',
                  r'\\?\UNC\server\share\x'):
        response = asyncio.run(FS.download_file_handler(_Request(query={'filePath': value})))
        assert _status(response) == 403, f'{value!r} must be refused'


def test_download_file_still_serves_an_in_root_path():
    root, inp, out, models = _use_tree()
    image = out / 'shot.png'
    image.write_text('x')
    response = asyncio.run(FS.download_file_handler(_Request(query={'filePath': str(image)})))
    assert _status(response) == 200, 'a normal in-root absolute path must still be served'


def test_rename_refuses_the_roots():
    root, inp, out, models = _use_tree()
    (inp / 'a.png').write_text('x')
    for name in ('input', 'output', 'models'):
        response = asyncio.run(FS.rename_file_handler(
            _Request({'currentPath': name, 'newName': 'renamed.png'})))
        assert _status(response) == 403, f'renaming the {name} root must be refused'
        assert (root / name).is_dir(), f'the {name} root must be left alone'
    assert (inp / 'a.png').exists()


def test_rename_still_works_inside_a_root():
    root, inp, out, models = _use_tree()
    (inp / 'a.png').write_text('x')
    response = asyncio.run(FS.rename_file_handler(
        _Request({'currentPath': 'input/a.png', 'newName': 'b.png'})))
    assert _status(response) == 200, 'renaming a file inside a root must still work'
    assert (inp / 'b.png').exists()


def test_delete_refuses_the_roots():
    root, inp, out, models = _use_tree()
    for name in ('input', 'output', 'models'):
        response = asyncio.run(FS.delete_file_handler(_Request({'filePath': name})))
        assert _status(response) == 403, f'deleting the {name} root must be refused'
        assert (root / name).is_dir(), f'the {name} root must still exist'


def test_delete_still_works_inside_a_root():
    root, inp, out, models = _use_tree()
    (out / 'a.png').write_text('x')
    response = asyncio.run(FS.delete_file_handler(_Request({'filePath': 'output/a.png'})))
    assert _status(response) == 200, 'deleting a file inside a root must still work'
    assert not (out / 'a.png').exists()


def test_move_refuses_a_root_source_or_target():
    root, inp, out, models = _use_tree()
    (out / 'sub').mkdir()

    # a root as the source
    response = asyncio.run(FS.move_copy_handler(
        _Request({'sourcePaths': ['input'], 'targetDir': 'output/sub'})))
    body = json.loads(response.text())
    assert _status(response) == 200 and body['moved'] == 0 and body['errors']
    assert (root / 'input').is_dir(), 'the input root must not have been moved'

    # a *folder* dropped on a root: refused, because that nests one root inside another
    response = asyncio.run(FS.move_copy_handler(
        _Request({'sourcePaths': ['output/sub'], 'targetDir': 'input'})))
    body = json.loads(response.text())
    assert _status(response) == 200 and body['moved'] == 0 and body['errors'], \
        'a folder must not be moved into a root'

    # a *file* into a root is the normal way to feed a result back in (the File
    # Manager's output -> input drag), so it has to be allowed
    (out / 'shot.png').write_bytes(b'x')
    response = asyncio.run(FS.move_copy_handler(
        _Request({'sourcePaths': ['output/shot.png'], 'targetDir': 'input'})))
    body = json.loads(response.text())
    assert _status(response) == 200 and body['moved'] == 1 and not body['errors'], \
        'a file must be movable into the input root'
    assert (inp / 'shot.png').is_file(), 'and it lands in the root itself'


def test_create_folder_refuses_bad_names():
    root, inp, out, models = _use_tree()
    for name in ('', '   ', '.', '..', 'a/b', 'a\\b', 'a\x00b', 'a\nb'):
        response = asyncio.run(FS.create_folder_handler(
            _Request({'parentPath': 'output', 'folderName': name})))
        assert _status(response) == 400, f'{name!r} must be refused'
    assert list(out.iterdir()) == [], 'a refused name must create nothing'


def test_create_folder_refuses_paths_outside_the_roots():
    root, inp, out, models = _use_tree()
    for parent in ('', '..', '/etc', 'input/../../etc', 'models/../..'):
        response = asyncio.run(FS.create_folder_handler(
            _Request({'parentPath': parent, 'folderName': 'evil'})))
        assert _status(response) == 403, f'{parent!r} must not be a valid parent'
    assert not (root / 'evil').exists() and not (inp / 'evil').exists()


def test_create_folder_needs_a_real_folder_as_parent():
    root, inp, out, models = _use_tree()
    (out / 'shot.png').write_text('x')
    response = asyncio.run(FS.create_folder_handler(
        _Request({'parentPath': 'output/shot.png', 'folderName': 'sub'})))
    assert _status(response) == 404, 'a file is not a parent folder'
    response = asyncio.run(FS.create_folder_handler(
        _Request({'parentPath': 'output/missing', 'folderName': 'sub'})))
    assert _status(response) == 404, 'neither is a folder that is not there'


def test_create_folder_works_inside_a_root():
    root, inp, out, models = _use_tree()

    # a root itself is the normal parent: the pane is showing it
    response = asyncio.run(FS.create_folder_handler(
        _Request({'parentPath': 'output', 'folderName': 'renders'})))
    assert _status(response) == 200, 'creating a folder in a root must work'
    assert (out / 'renders').is_dir()
    assert json.loads(response.text())['path'].endswith('renders')

    # and inside a folder of a folder
    response = asyncio.run(FS.create_folder_handler(
        _Request({'parentPath': 'output/renders', 'folderName': 'v1'})))
    assert _status(response) == 200, 'a nested folder must work too'
    assert (out / 'renders' / 'v1').is_dir()


def test_create_folder_refuses_an_existing_name():
    root, inp, out, models = _use_tree()
    (out / 'renders').mkdir()
    (out / 'shot.png').write_text('x')
    for name in ('renders', 'shot.png'):
        response = asyncio.run(FS.create_folder_handler(
            _Request({'parentPath': 'output', 'folderName': name})))
        assert _status(response) == 400, f'{name!r} is taken and must be refused'
    assert (out / 'shot.png').is_file(), 'and the file that was there must survive'


def test_the_create_folder_route_is_registered():
    """The File Manager posts here, so the route has to exist (and be guarded)."""
    root = Path(__file__).resolve().parents[1]
    source = (root / 'saus' / 'app_manager.py').read_text(encoding='utf-8')
    assert "'/saus/api/create-folder', 'POST', create_folder_handler" in source, \
        'the New folder button would post into nothing'
    handler = (root / 'saus' / 'file_system.py').read_text(encoding='utf-8')
    assert 'async def create_folder_handler' in handler
    body = handler.split('async def create_folder_handler', 1)[1].split('\nasync def ', 1)[0]
    assert 'require_json(request)' in body, \
        'a route that writes carries the same JSON guard as rename'
    assert 'resolve_within_roots(' in body, 'and the same root confinement'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)} file-system-path tests passed')


if __name__ == '__main__':
    main()
