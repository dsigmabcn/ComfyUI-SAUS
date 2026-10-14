"""An upload's scratch folder must stay directly under the upload root.

The File Manager sends a ``fileId`` that becomes a folder name under
``/tmp/app_uploads``. The sanitiser only keeps ``[A-Za-z0-9_.-]``, so a literal
``..`` used to survive it and turn the scratch folder into ``/tmp`` itself -
``chunk_<n>.part`` was then written *outside* the folder it was meant to stay in.
The folder is now derived by ``scratch_dir_for()``, which refuses ``.`` / ``..``
and anything that does not resolve to a direct child of the root.

The handler is driven for real, with ``saus.file_system`` imported from these
sources; aiohttp is stubbed when there is no ComfyUI venv (the module imports it
unguarded, and the parts this suite exercises never touch it). Runs under pytest
or directly (``python tests/test_upload_scratch_dir.py``).
"""

import asyncio
import importlib.util
import os
import shutil
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


class SkippedTest(Exception):
    """Raised when the handler cannot be imported here."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


def _stub_aiohttp():
    """Stand in for aiohttp when the sandbox has no ComfyUI venv."""
    if importlib.util.find_spec('aiohttp') is not None:
        return False
    web = types.ModuleType('aiohttp.web')
    web.Request = type('Request', (), {})
    web.Response = type('Response', (), {})

    def json_response(payload=None, status=200, **kwargs):
        return {'payload': payload, 'status': status}

    web.json_response = json_response
    aiohttp = types.ModuleType('aiohttp')
    aiohttp.web = web
    sys.modules['aiohttp'] = aiohttp
    sys.modules['aiohttp.web'] = web
    return True


STUBBED = _stub_aiohttp()

try:
    from saus import file_system as FS  # noqa: E402
except Exception as exc:  # pragma: no cover - only without aiohttp and stub
    FS = None
    IMPORT_ERROR = exc
else:
    IMPORT_ERROR = None


def _status(response):
    """The status of a real aiohttp response, or of the stub's plain dict."""
    if isinstance(response, dict):
        return response.get('status')
    return getattr(response, 'status', None)


class _Part:
    """A multipart part that hands out at most ``CHUNK`` bytes per read."""

    CHUNK = 512

    def __init__(self, name, data=b'', filename=None):
        self.name = name
        self.filename = filename or f'{name}.part'
        self._data = bytes(data)
        self.reads = 0

    async def read_chunk(self, size):
        self.reads += 1
        step = min(size, self.CHUNK)
        chunk, self._data = self._data[:step], self._data[step:]
        return chunk

    def remaining(self):
        return len(self._data)


class _Reader:
    def __init__(self, parts):
        self._parts = list(parts)

    async def next(self):
        return self._parts.pop(0) if self._parts else None


class _Request:
    def __init__(self, parts, headers=None):
        self.headers = {'X-SAUS-Request': '1'} if headers is None else headers
        self._parts = parts

    async def multipart(self):
        return _Reader(self._parts)


def _upload(parts, headers=None):
    if FS is None:
        _skip('saus.file_system could not be imported (%s)' % IMPORT_ERROR)
    return asyncio.run(FS.upload_chunk_handler(_Request(parts, headers)))


def test_the_scratch_folder_refuses_dot_names():
    for bad in ('.', '..', ''):
        assert FS.scratch_dir_for(bad) is None, f'{bad!r} was accepted as a scratch id'


def test_the_scratch_folder_stays_a_direct_child():
    root = Path(FS.TEMP_UPLOAD_DIR)
    assert FS.scratch_dir_for('ab-12_3') == root / 'ab-12_3'
    # A separator that survived some other sanitiser still cannot climb out.
    assert FS.scratch_dir_for('a/b') is None
    assert FS.scratch_dir_for('../etc') is None


def test_a_dot_file_id_is_rejected_before_anything_is_written():
    stray = Path('/tmp') / 'chunk_0.part'
    stray.unlink(missing_ok=True)
    response = _upload([_Part('fileId', b'..'),
                        _Part('fileChunk', b'chunk-bytes', 'model.safetensors'),
                        _Part('chunkIndex', b'0'),
                        _Part('isLast', b'false')])
    assert _status(response) == 400, 'a ".." fileId must be refused'
    assert not stray.exists(), 'the upload wrote a chunk outside the scratch root'


def test_a_good_file_id_is_still_written_under_the_root():
    file_id = f'saus-test-{os.getpid()}'
    scratch = Path(FS.TEMP_UPLOAD_DIR) / file_id
    try:
        response = _upload([_Part('fileId', file_id.encode()),
                            _Part('fileChunk', b'hello-chunk', 'model.safetensors'),
                            _Part('fileName', b'model.safetensors'),
                            _Part('targetPath', b'input'),
                            _Part('chunkIndex', b'0'),
                            _Part('isLast', b'false')])
        assert _status(response) == 200, 'a normal chunk must still be accepted'
        assert (scratch / 'chunk_0.part').read_bytes() == b'hello-chunk'
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def test_the_handler_still_demands_the_csrf_header():
    response = _upload([], headers={})
    assert _status(response) == 415


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
    print(f'{passed}/{len(tests)} upload-scratch-dir tests passed')


if __name__ == '__main__':
    main()
