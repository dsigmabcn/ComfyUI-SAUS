"""The batch model-status route: one request for a whole screenful of apps."""

import asyncio
import json
import sys
import types
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class _Response:
    def __init__(self, payload, status=200):
        self.status = status
        self.body = json.dumps(payload).encode('utf-8')

    def text(self):
        return self.body.decode('utf-8')


def _install_stubs():
    """Only the names ``saus.downloads`` actually touches."""
    if 'aiohttp' not in sys.modules:
        aiohttp = types.ModuleType('aiohttp')
        web = types.ModuleType('aiohttp.web')
        web.json_response = lambda payload, status=200, **kwargs: _Response(payload, status)
        web.Request = object
        web.Response = _Response
        aiohttp.web = web
        sys.modules['aiohttp'] = aiohttp
        sys.modules['aiohttp.web'] = web

    if 'server' not in sys.modules:
        server = types.ModuleType('server')

        class _PromptServer:
            instance = None

        server.PromptServer = _PromptServer
        sys.modules['server'] = server


_install_stubs()

from saus import downloads  # noqa: E402


class FakeRequest:
    def __init__(self, payload=None, content_type='application/json', broken=False):
        self.headers = {'Content-Type': content_type} if content_type else {}
        self._payload = payload
        self._broken = broken

    async def json(self):
        if self._broken:
            raise ValueError('not valid JSON')
        return self._payload


def _install_models(installed):
    """Replace the folder scan with a fixed set of installed files."""
    calls = []

    def fake_find_model(filename, model_type='', hint_dir=''):
        calls.append(filename)
        if filename in installed:
            return {
                'relative_name': filename,
                'path': Path('/models') / filename,
                'folder_type': 'checkpoints',
                'directories': [Path('/models')],
            }
        return None

    downloads.find_model = fake_find_model
    return calls


def _run(request):
    return asyncio.run(downloads.check_model_status_batch_handler(request))


def _statuses(response):
    return json.loads(response.text())['statuses']


def test_one_status_per_file():
    calls = _install_models({'a.safetensors'})
    response = _run(FakeRequest({'files': [
        {'file_id': 'a.safetensors', 'model_path': 'checkpoints', 'type': 'Checkpoint'},
        {'file_id': 'missing.safetensors'},
    ]}))

    assert response.status == 200
    assert _statuses(response) == {'a.safetensors': 'ready', 'missing.safetensors': 'missing'}
    assert calls == ['a.safetensors', 'missing.safetensors']


def test_duplicate_ids_are_looked_up_once():
    calls = _install_models({'shared.safetensors'})
    response = _run(FakeRequest({'files': [
        {'file_id': 'shared.safetensors'},
        {'file_id': 'shared.safetensors'},
    ]}))

    assert _statuses(response) == {'shared.safetensors': 'ready'}
    assert calls == ['shared.safetensors']


def test_entries_without_a_file_id_are_skipped():
    calls = _install_models({'a.safetensors'})
    response = _run(FakeRequest({'files': [
        {'model_path': 'checkpoints'},
        {'file_id': '', 'type': 'LORA'},
        'not-an-object',
        {'file_id': 'a.safetensors'},
    ]}))

    assert _statuses(response) == {'a.safetensors': 'ready'}
    assert calls == ['a.safetensors']


def test_requires_json_content_type():
    _install_models(set())
    response = _run(FakeRequest({'files': []}, content_type='text/plain'))
    assert response.status == 415


def test_invalid_json_is_rejected():
    _install_models(set())
    response = _run(FakeRequest(broken=True))
    assert response.status == 400


def test_missing_files_list_is_rejected():
    _install_models(set())
    assert _run(FakeRequest({})).status == 400
    assert _run(FakeRequest({'files': 'nope'})).status == 400
    assert _run(FakeRequest(['files'])).status == 400


def test_oversized_batch_is_rejected():
    calls = _install_models(set())
    too_many = [{'file_id': f'model-{i}.safetensors'} for i in range(downloads.MAX_STATUS_BATCH_FILES + 1)]

    response = _run(FakeRequest({'files': too_many}))

    assert response.status == 413
    assert calls == []  # nothing was looked up


def test_batch_at_the_limit_is_accepted():
    _install_models(set())
    at_limit = [{'file_id': f'model-{i}.safetensors'} for i in range(downloads.MAX_STATUS_BATCH_FILES)]

    response = _run(FakeRequest({'files': at_limit}))

    assert response.status == 200
    assert len(_statuses(response)) == downloads.MAX_STATUS_BATCH_FILES


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)} batch-status tests passed')


if __name__ == '__main__':
    main()
