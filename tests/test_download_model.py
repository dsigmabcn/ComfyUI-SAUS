"""The model-download route, driven without ComfyUI."""

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


class _Request:
    def __init__(self, payload, content_type='application/json'):
        self.headers = {'Content-Type': content_type} if content_type else {}
        self._payload = payload

    async def json(self):
        return self._payload


class _WorkerCapture:
    """Stands in for ``_download_worker`` and for ``asyncio.create_task``."""

    def __init__(self):
        self.calls = []

    def worker(self, **kwargs):
        self.calls.append(kwargs)

        async def _never_run():
            return True

        return _never_run()

    def create_task(self, coro):
        coro.close()
        return None

    def __enter__(self):
        self._asyncio = downloads.asyncio
        self._worker = downloads._download_worker
        downloads._download_worker = self.worker
        downloads.asyncio = types.SimpleNamespace(create_task=self.create_task)
        return self

    def __exit__(self, *exc):
        downloads.asyncio = self._asyncio
        downloads._download_worker = self._worker
        return False


def _run(payload, content_type='application/json'):
    return asyncio.run(downloads.download_model_handler(_Request(payload, content_type)))


def _payload(**overrides):
    data = {
        'component_type': 'Diffusion model',
        'url_model': 'https://example.com/model.safetensors',
        'model_path': 'diffusion_models',
        'file_name': 'model.safetensors',
    }
    data.update(overrides)
    return data


def test_safe_download_name_reduces_and_refuses():
    sdn = downloads.safe_download_name
    assert sdn('model.safetensors') == 'model.safetensors'
    assert sdn('FLUX/model.safetensors') == 'model.safetensors'      # base-named
    assert sdn('a\\b\\model.safetensors') == 'model.safetensors'
    for bad in ('evil.py', 'x.so', 'x.dll', 'x.sh', 'x.js', '..', '.', '', None):
        assert sdn(bad) is None, f'{bad!r} must be refused as a download name'


def test_a_script_file_name_is_refused_before_anything_is_fetched():
    with _WorkerCapture() as cap:
        response = _run(_payload(file_name='evil.py'))
    assert getattr(response, 'status', None) == 400, 'a .py file_name must be refused'
    assert cap.calls == [], 'nothing may be scheduled for a refused name'


def test_a_normal_model_download_goes_to_a_model_folder():
    with _WorkerCapture() as cap:
        response = _run(_payload(model_path='', file_name='model.safetensors'))
    assert getattr(response, 'status', None) == 200, 'a normal model download must start'
    assert len(cap.calls) == 1
    target = Path(cap.calls[0]['target_path'])
    models_root = Path(downloads.MODELS_DIRECTORY).resolve()
    assert models_root == target or models_root in target.parents, \
        'the download must land inside the models folder'


def test_a_custom_nodes_destination_is_refused():
    """Even if destination_for() were fooled, the handler refuses a code folder."""
    original = downloads.destination_for
    downloads.destination_for = lambda *a, **k: downloads.COMFYUI_DIRECTORY / 'custom_nodes'
    try:
        with _WorkerCapture() as cap:
            response = _run(_payload(model_path='', file_name='model.safetensors'))
    finally:
        downloads.destination_for = original
    assert getattr(response, 'status', None) == 403, \
        'a destination outside the model folders must be refused'
    assert cap.calls == [], 'nothing may be scheduled for a refused destination'


def test_the_worker_refuses_a_script_name_without_fetching():
    """The shared worker is the door for a caller-supplied name, too."""
    errors = []

    async def _go():
        return await downloads._download_worker(
            url='https://example.com/evil.py',
            headers={},
            target_path=str(Path(downloads.MODELS_DIRECTORY) / 'diffusion_models'),
            progress_sender=lambda *a: None,
            completion_sender=lambda *a: None,
            error_sender=lambda name, error: errors.append(error),
            filename='evil.py',
            resolve_filename_from_header=False,
        )

    assert asyncio.run(_go()) is False, 'the worker must refuse a script name'
    assert errors and 'not allowed' in errors[0]


def test_requires_json_content_type():
    with _WorkerCapture():
        response = _run(_payload(), content_type='text/plain')
    assert getattr(response, 'status', None) == 415


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)} download-model tests passed')


if __name__ == '__main__':
    main()
