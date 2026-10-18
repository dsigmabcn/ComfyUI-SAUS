"""avif, and the thumbnail names an app actually ships."""

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
    """`APP_THUMBNAIL_NAMES` + `_find_app_thumbnail` out of saus/management.py."""
    source = (ROOT / 'saus' / 'management.py').read_text(encoding='utf-8')
    start = source.index('APP_THUMBNAIL_NAMES = (')
    block = source[start:source.index('def _load_app_configs():')]

    namespace = {'Path': Path}
    exec(block, namespace)
    return (namespace['APP_THUMBNAIL_NAMES'], namespace['_find_app_thumbnail'],
            namespace['ROW_THUMBNAIL_NAME'])


APP_THUMBNAIL_NAMES, _find_app_thumbnail, ROW_THUMBNAIL_NAME = _thumbnail_helper()


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
        assert _find_app_thumbnail(app) == '', 'no thumbnail file, no thumbnail'

        (app / 'thumbnail.webp').write_bytes(b'x')
        assert _find_app_thumbnail(app) == 'thumbnail.webp', 'a webp counts'


def test_the_newest_thumbnail_wins():
    with tempfile.TemporaryDirectory() as tmp:
        app = Path(tmp)
        webp = app / 'thumbnail.webp'
        jpg = app / 'thumbnail.jpg'
        webp.write_bytes(b'x')
        jpg.write_bytes(b'x')

        # Timestamps are set explicitly: writing order is not a contract.
        os.utime(webp, ns=(1_000, 1_000))
        os.utime(jpg, ns=(2_000, 2_000))
        assert _find_app_thumbnail(app) == 'thumbnail.jpg', 'the newest wins'

        os.utime(jpg, ns=(500, 500))
        assert _find_app_thumbnail(app) == 'thumbnail.webp', 'either way round'


def test_only_the_known_names_are_considered():
    with tempfile.TemporaryDirectory() as tmp:
        app = Path(tmp)
        (app / 'anything.webp').write_bytes(b'x')

        assert _find_app_thumbnail(app) == '', 'an app may not point anywhere it likes'
        assert {'thumbnail.jpg', 'thumbnail.webp', 'thumbnail.avif'} <= set(APP_THUMBNAIL_NAMES)

        # The thumbnails live next to appConfig.json: a folder of their own is no
        # longer consulted, which is why tools/thumbnail.py has --flatten-old.
        media = app / 'media'
        media.mkdir()
        (media / 'thumbnail.webp').write_bytes(b'x')
        assert _find_app_thumbnail(app) == '', 'a media/ folder is ignored now'


def test_the_browser_uses_the_thumbnail_it_is_given():
    """A guessed name is a 404: the API says what the app ships, or reports nothing."""
    for path in (UI_JS, MODELS_JS):
        source = path.read_text(encoding='utf-8')
        assert 'app.thumbnail' in source, f'{path.name} does not use the reported name'
        assert "'thumbnail.jpg'" not in source, \
            f'{path.name} guesses a file name - that is a 404 for a webp master'
        assert 'saus_logo.png' in source, f'{path.name} needs the logo for apps without one'


def test_the_row_copy_is_resolved_separately():
    """The explorer row gets the 128px copy, the information panel keeps the master."""
    with tempfile.TemporaryDirectory() as tmp:
        app = Path(tmp)
        master = app / 'thumbnail.webp'
        row = app / ROW_THUMBNAIL_NAME
        master.write_bytes(b'x')
        row.write_bytes(b'x')
        os.utime(master, ns=(2_000, 2_000))
        os.utime(row, ns=(1_000, 1_000))

        assert ROW_THUMBNAIL_NAME in APP_THUMBNAIL_NAMES, 'the row name is a known one'
        assert _find_app_thumbnail(app, exclude=(ROW_THUMBNAIL_NAME,)) == 'thumbnail.webp', \
            'the master is the information panel\'s'
        assert _find_app_thumbnail(app, names=(ROW_THUMBNAIL_NAME,)) == ROW_THUMBNAIL_NAME, \
            'and the row copy is the explorer row\'s, even though it is older'


def test_no_shipped_app_keeps_a_thumbnail_in_a_media_folder():
    """The thumbnails were flattened on purpose: a leftover media/ loses the picture."""
    apps = ROOT / 'web' / 'apps'
    # Keyed on appConfig.json and walked recursively: apps parked in
    # web/apps/deprecated/ must stay covered too, and the deprecated/ folder itself
    # is not an app.
    app_folders = sorted(conf.parent for conf in apps.rglob('appConfig.json'))
    stragglers, unresolved = [], []
    for app in app_folders:
        label = app.relative_to(apps).as_posix()
        media = app / 'media'
        if media.is_dir() and any(f.name.startswith('thumbnail') for f in media.iterdir()):
            stragglers.append(label)
        if not _find_app_thumbnail(app, exclude=(ROW_THUMBNAIL_NAME,)):
            unresolved.append(label + ' (no master)')
        elif not _find_app_thumbnail(app, names=(ROW_THUMBNAIL_NAME,)):
            unresolved.append(label + ' (no row copy)')
    assert not stragglers, ('these apps still keep a thumbnail in media/ - run '
                            'python tools/thumbnail.py --flatten-old: ' + ', '.join(stragglers))
    assert not unresolved, ('these apps have no flat thumbnail next to appConfig.json - run '
                            'python tools/thumbnail.py --rebuild-rows: ' + ', '.join(unresolved))


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
