"""avif, and the thumbnail names an app actually ships.

Two format bugs that the browser found: the File Manager did not recognise
``.avif`` (it was missing from its image regexes, and the thumbnail endpoint
answered 415 for the extension), and an app whose thumbnail is not called
``thumbnail.jpg`` showed no thumbnail at all - the row fell back to the SAUS
logo. Both come down to *where the accepted names live*, so both are checked
here: the regexes in the File Manager, the extension set in the endpoint, and
the discovery helper the app list uses.

The discovery helper is imported for real (``saus.management`` needs nothing
from ComfyUI). Runs under pytest or directly
(``python tests/test_media_formats.py``).
"""

import ast
import os
import re
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FM_JS = ROOT / 'web' / 'file_manager' / 'js' / 'main.js'
FILE_SYSTEM = ROOT / 'saus' / 'file_system.py'
IMAGE_LOADER = ROOT / 'web' / 'core' / 'js' / 'common' / 'components' / 'widgets' / 'ImageLoader.js'
UI_JS = ROOT / 'web' / 'saus_browser' / 'js' / 'ui.js'
MODELS_JS = ROOT / 'web' / 'saus_browser' / 'js' / 'models.js'

sys.path.insert(0, str(ROOT))


def _thumbnail_helper():
    """`APP_THUMBNAIL_NAMES` + `_find_app_thumbnail` out of saus/management.py.

    Importing the module would drag aiohttp (and ComfyUI) in, and this suite has
    to run under a bare python3, so its two top-level blocks are executed on
    their own. The helper only needs ``Path``.
    """
    source = (ROOT / 'saus' / 'management.py').read_text(encoding='utf-8')
    start = source.index('APP_THUMBNAIL_NAMES = (')
    block = source[start:source.index('def _load_app_configs():')]

    namespace = {'Path': Path}
    exec(block, namespace)
    return namespace['APP_THUMBNAIL_NAMES'], namespace['_find_app_thumbnail']


APP_THUMBNAIL_NAMES, _find_app_thumbnail = _thumbnail_helper()


def _js_regex(name):
    """`const <name> = /.../i;` from the File Manager, as a python pattern."""
    source = FM_JS.read_text(encoding='utf-8')
    match = re.search(rf'const {name} = /(.+)/i;', source)
    assert match, f'{name} is missing from {FM_JS.name}'
    return re.compile(match.group(1), re.I)


def test_the_file_manager_recognises_avif():
    for name in ('IMAGE_RE', 'MEDIA_RE'):
        pattern = _js_regex(name)
        assert pattern.search('shot.avif'), f'{name} rejects .avif'
        assert pattern.search('shot.avif'.upper()), f'{name} is case sensitive'
        assert pattern.search('shot.webp'), f'{name} lost webp'


def test_the_thumbnail_endpoint_accepts_avif_and_never_hard_fails():
    source = FILE_SYSTEM.read_text(encoding='utf-8')

    extensions = ast.literal_eval(
        re.search(r'IMAGE_THUMB_EXTENSIONS = (\{[^}]*\})', source).group(1)
    )
    assert '.avif' in extensions, 'the endpoint would answer 415 for an avif'

    handler = source.split('async def thumbnail_handler', 1)[1].split('\nasync def ', 1)[0]
    assert 'Image.open' in handler, 'Pillow is still tried first'
    assert 'status=415' in handler, 'a file that is no image is still refused'
    assert 'web.FileResponse(file_path' in handler, \
        'an image Pillow cannot decode (avif) has to be served as-is, not failed'


def test_the_app_runtime_accepts_avif_as_an_input():
    source = IMAGE_LOADER.read_text(encoding='utf-8')

    assert "'image/avif'" in source, 'the ImageLoader would refuse an avif upload'
    assert "'avif'" in source, 'nor give it a MIME type'


def test_an_app_thumbnail_is_found_under_any_of_its_names():
    with tempfile.TemporaryDirectory() as tmp:
        app = Path(tmp)
        assert _find_app_thumbnail(app) == '', 'no media folder, no thumbnail'

        media = app / 'media'
        media.mkdir()
        (media / 'thumbnail.webp').write_bytes(b'x')
        assert _find_app_thumbnail(app) == 'media/thumbnail.webp', 'a webp counts'


def test_the_newest_thumbnail_wins():
    with tempfile.TemporaryDirectory() as tmp:
        app = Path(tmp)
        media = app / 'media'
        media.mkdir()
        webp = media / 'thumbnail.webp'
        jpg = media / 'thumbnail.jpg'
        webp.write_bytes(b'x')
        jpg.write_bytes(b'x')

        # Timestamps are set explicitly: writing order is not a contract.
        os.utime(webp, ns=(1_000, 1_000))
        os.utime(jpg, ns=(2_000, 2_000))
        assert _find_app_thumbnail(app) == 'media/thumbnail.jpg', 'the newest wins'

        os.utime(jpg, ns=(500, 500))
        assert _find_app_thumbnail(app) == 'media/thumbnail.webp', 'either way round'


def test_only_the_known_names_are_considered():
    with tempfile.TemporaryDirectory() as tmp:
        app = Path(tmp)
        media = app / 'media'
        media.mkdir()
        (media / 'anything.webp').write_bytes(b'x')

        assert _find_app_thumbnail(app) == '', 'an app may not point anywhere it likes'
        assert {'thumbnail.jpg', 'thumbnail.webp', 'thumbnail.avif'} <= set(APP_THUMBNAIL_NAMES)


def test_the_browser_uses_the_thumbnail_it_is_given():
    for path in (UI_JS, MODELS_JS):
        source = path.read_text(encoding='utf-8')
        assert 'app.thumbnail' in source, f'{path.name} still guesses the file name'
        assert 'media/thumbnail.jpg' in source, 'but the old name stays as the fallback'


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    passed = 0
    for name, fn in tests:
        fn()
        passed += 1
        print(f'  ok  {name}')
    print(f'{passed}/{len(tests)} media-format tests passed')


if __name__ == '__main__':
    main()
