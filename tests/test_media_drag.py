"""Dragging a result onto a Load Image input, across tabs."""

import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / 'web' / 'core' / 'js' / 'common'
DRAG_JS = CORE / 'scripts' / 'appDrag.js'
LOADER_JS = CORE / 'components' / 'widgets' / 'ImageLoader.js'
RECENT_JS = CORE / 'components' / 'imagedisplay.js'
TABS_JS = ROOT / 'web' / 'saus_browser' / 'js' / 'tabs.js'
FM_JS = ROOT / 'web' / 'file_manager' / 'js' / 'main.js'
MAIN_CSS = ROOT / 'web' / 'core' / 'css' / 'main.css'
KINDS_JS = CORE / 'scripts' / 'mediaKinds.js'
COMP_JS = CORE / 'components' / 'widgets' / 'imageLoaderComp.js'
FILE_SYSTEM_PY = ROOT / 'saus' / 'file_system.py'
HARNESS = ROOT / 'tests' / 'js' / 'upload_guard.harness.mjs'
KINDS_HARNESS = ROOT / 'tests' / 'js' / 'media_kinds.harness.mjs'


class SkippedTest(Exception):
    """Raised when the harness cannot run here (node is missing)."""


def _skip(reason):
    if 'pytest' in sys.modules:
        import pytest
        pytest.skip(reason)
    raise SkippedTest(reason)


def test_the_payload_survives_a_dragover():
    source = DRAG_JS.read_text(encoding='utf-8')

    assert "export const MEDIA_MIME = 'application/x-saus-media'" in source
    assert 'let active = null;' in source, \
        'module state is the whole point: dragover cannot read dataTransfer'
    assert "document.body.classList.add('saus-dragging')" in source, \
        'the body class is what CSS and the tab strip key off'
    assert 'export function mediaDrag()' in source and 'export function endMediaDrag()' in source


def test_the_recent_panel_offers_its_results():
    source = RECENT_JS.read_text(encoding='utf-8')

    assert 'parseMediaUrl(imageUrl)' in source, 'the payload comes from the viewer URL'
    assert 'thumbnailDiv.draggable = true;' in source
    assert 'setMediaDrag(payload, event.dataTransfer)' in source
    assert 'endMediaDrag()' in source, 'the flag must not outlive the drag'


def test_a_drop_points_the_loader_at_the_file():
    source = LOADER_JS.read_text(encoding='utf-8')

    drop = source.split('onDrop(e) {', 1)[1].split('\n  }', 1)[0]
    assert drop.index('getMediaDrag(e.dataTransfer)') < drop.index('e.dataTransfer.files[0]'), \
        'an internal drag carries no file, an OS drop carries no payload'

    assert "'/upload/image'" in source, \
        "the bytes go through ComfyUI's own upload, the route the browse button uses"
    assert "'/saus/api/move-file'" not in source, \
        'the File Manager endpoint refuses a *root* target, and input/ is one (HTTP 403)'
    assert "payload.type === 'input'" in source, \
        'a file already in input/ needs no round trip at all'
    assert 'this.onImageLoaded(src, { name })' in source, \
        'the filename still has to reach the workflow'
    assert 'image-loader-placeholder' in source, \
        'the empty state is marked so CSS can draw it as a hint, not content'
    assert 'fas fa-folder' in source, \
        "the loader wears the File Manager's folder glyph, not an emoji"
    assert 'image-loader-placeholder' in MAIN_CSS.read_text(encoding='utf-8'), \
        'and the stylesheet styles it'


def test_a_hovered_tab_opens_for_media_only():
    source = TABS_JS.read_text(encoding='utf-8')

    assert "import { isMediaDrag } from '/core/js/common/scripts/appDrag.js';" in source
    assert 'if (draggedTabId)' in source, 'reordering still wins'
    assert 'if (!isMediaDrag(event.dataTransfer)) return;' in source, \
        'only a media drag opens a tab on hover'
    assert 'if (mediaDrag())' not in source, \
        'the module flag does not exist in the parent document - an app is an iframe'
    assert 'armMediaHover(tab.id, btn)' in source
    assert 'cancelMediaHover()' in source, 'leaving the tab or dropping must cancel it'
    assert "document.addEventListener('dragend', cancelMediaHover)" in source


def test_the_file_manager_publishes_its_drags_too():
    source = FM_JS.read_text(encoding='utf-8')

    assert "from '/core/js/common/scripts/appDrag.js'" in source
    assert 'setMediaDrag({' in source, 'a file dragged out of the File Manager is usable too'
    assert "item.type !== 'folder'" in source, 'a folder is not media'
    assert 'endMediaDrag()' in source, 'and a folder drag clears any previous payload'


def test_the_guard_against_script_uploads_matches_the_server():
    """`/upload/image` is ComfyUI's route and screens nothing, so the loader must."""
    loader = LOADER_JS.read_text(encoding='utf-8')
    constants = (ROOT / 'saus' / 'constants.py').read_text(encoding='utf-8')

    server_block = re.search(r'BLOCKED_UPLOAD_EXTENSIONS = \{(.*?)\}', constants, re.S)
    assert server_block, 'the server list moved - update this test'
    server_exts = set(re.findall(r"'([a-z0-9]+)'", server_block.group(1)))
    assert 'py' in server_exts and 'so' in server_exts, 'sanity: the server list is real'

    client_block = re.search(r'BLOCKED_UPLOAD_EXTENSIONS = new Set\(\[(.*?)\]\)', loader, re.S)
    assert client_block, 'the loader no longer mirrors the server list'
    client_exts = set(re.findall(r"'([a-z0-9]+)'", client_block.group(1)))

    assert client_exts == server_exts, (
        'the loader list must mirror saus/constants.py - '
        f'server only: {sorted(server_exts - client_exts)}, '
        f'loader only: {sorted(client_exts - server_exts)}'
    )

    # Both ways into /upload/image are guarded: the browse / OS-drop handler (which shows
    # the error itself), and the copy-into-input path a dragged result takes (which
    # throws, and the caller catches it into the same message).
    assert 'isBlockedUploadName(file.name)' in loader, 'the drop handler is unguarded'
    assert 'isBlockedUploadName(payload.filename)' in loader, 'the drag path is unguarded'
    assert len(re.findall(r'isBlockedUploadName\(', loader)) == 3, \
        'one definition plus exactly two call sites'
    assert 'lastIndexOf' in loader and 'toLowerCase()' in loader, \
        'same parse as the server: last dot, lower-cased (so .htaccess is caught)'


def test_the_upload_guard_behaves_like_the_server():
    """The guard's behaviour, not only its presence: run the node harness."""
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{HARNESS.name} needs node, which is not installed here')

    result = subprocess.run([node, str(HARNESS)], cwd=str(ROOT), capture_output=True, text=True)
    assert result.returncode == 0, f'{HARNESS.name} failed:\n{result.stdout}\n{result.stderr}'
    assert 'upload guard: all scenarios passed' in result.stdout, result.stdout


def test_the_media_kinds_agree_with_the_server():
    """Three JS lists and one Python list answered "is this an image?" on their own."""
    kinds = KINDS_JS.read_text(encoding='utf-8')
    server = FILE_SYSTEM_PY.read_text(encoding='utf-8')

    block = re.search(r'IMAGE_THUMB_EXTENSIONS = \{(.*?)\}', server, re.S)
    assert block, 'the server list moved - update this test'
    server_exts = {ext.lstrip('.') for ext in re.findall(r"'\.([a-z0-9]+)'", block.group(1))}

    image_block = re.search(r"image: \[(.*?)\]", kinds, re.S)
    assert image_block, 'mediaKinds.js no longer lists the image extensions'
    client_exts = set(re.findall(r"'([a-z0-9]+)'", image_block.group(1)))

    assert client_exts == server_exts, (
        'the thumbnail endpoint refuses anything outside its own list, so the UI must not '
        'offer it - '
        f'server only: {sorted(server_exts - client_exts)}, '
        f'client only: {sorted(client_exts - server_exts)}'
    )
    assert 'video:' in kinds and 'audio:' in kinds, 'the other input nodes are covered too'


def test_a_recent_tile_asks_for_a_preview():
    """"Recent" is a 90 px column: the tile used to fetch the original."""
    source = RECENT_JS.read_text(encoding='utf-8')

    assert 'thumbnailUrlFor(src)' in source, 'the tile goes through the preview endpoint'
    assert "img.src = thumb || src;" in source, 'and falls back to the original URL'
    assert "img.dataset.fullSrc = src;" in source, \
        'the full-size URL stays on the element, so the lightbox and the drag keep it'
    assert "img.dataset.fellBack = 'true';" in source, \
        'the fallback happens once, then the download route - a flag, not `img.src !== src`'
    assert "img.src = src;\n        img.alt = 'History Image';" not in source, \
        'the viewer URL is no longer put straight into the tile'


def test_the_picker_shows_a_preview_and_the_right_kind():
    """A LoadVideo input was offered every picture in input/, and vice versa."""
    loader = LOADER_JS.read_text(encoding='utf-8')

    assert "from '/core/js/common/scripts/mediaKinds.js'" in loader, \
        'the kind rules are shared, not written here'
    assert 'this.fileInputElement.accept = acceptForKind(this.config.allowedFileType);' in loader, \
        'the commented-out `accept` is back, so the OS dialog filters'
    assert 'filterByKind(files, this.config.allowedFileType)' in loader, \
        'and the modal lists only what this node can load'
    assert 'thumbnailUrl(filename)' in loader, \
        'the 120 px cells are server-side previews now'
    assert 'thumbnailUrlForPath(`input/${name}`' in loader, \
        'an input file\'s path is root-qualified for the endpoint'
    assert 'mediaEl.preload = \'metadata\';' in loader, \
        'a video tile fetches its metadata, not the whole clip'


def test_the_drop_rectangle_opens_the_picker_on_one_click():
    """Only the small header button opened it, so the rectangle read as decoration."""
    loader = LOADER_JS.read_text(encoding='utf-8')

    assert "this.imageDropArea.addEventListener('click', this.handleClick, false);" in loader
    assert "this.imageDropArea.addEventListener('keydown', this.handleKeyDown, false);" in loader
    assert "'Enter' && e.key !== ' '" in loader or "e.key !== 'Enter' && e.key !== ' '" in loader, \
        'Enter and Space open it too'
    assert "setAttribute('role', 'button')" in loader and "setAttribute('tabindex', '0')" in loader
    assert 'dblclick' not in loader, \
        'a double click cannot open the picker *and* the file dialog any more'
    assert 'openFileDialog()' in loader, 'the file dialog is offered from inside the picker'
    assert "uploadBtn.innerHTML = '<i class=\"fas fa-upload\"></i> Upload'" in loader, \
        'which is where the old double click went'
    assert 'No ${this.config.allowedFileType' in loader, 'an empty list says so'


def test_the_app_tells_the_picker_what_the_node_loads():
    """The node class is the only thing that knows: LoadVideo vs LoadImage."""
    source = COMP_JS.read_text(encoding='utf-8')

    assert "const kind = nodeType === 'LoadVideo' ? 'video'" in source
    assert "nodeType === 'LoadAudio' ? 'audio' : 'image'" in source
    assert 'allowedFileType: kind,' in source, 'and it is passed to the loader'
    assert "allowedFileType: 'image'," not in source, 'a LoadVideo input is not an image input'


def test_the_preview_endpoint_is_cacheable():
    """The grids ask for the same tiles on every visit: re-encoding them is waste."""
    source = FILE_SYSTEM_PY.read_text(encoding='utf-8')

    thumb = source.split('async def thumbnail_handler', 1)[1].split('\nasync def ', 1)[0]
    assert 'etag = f\'W/"{size}-{int(stat.st_mtime)}-{stat.st_size}"\'' in thumb, \
        'the ETag carries the size *and* the file\'s identity'
    assert "request.headers.get('If-None-Match') == etag" in thumb, 'so a repeat is free'
    assert 'return web.Response(status=304, headers=cache_headers)' in thumb
    assert "'Cache-Control': 'max-age=86400'" in thumb, 'and the browser may keep it'
    assert thumb.count('headers=cache_headers') >= 3, \
        'every exit (original-file fallbacks included) carries the same cache headers'


def test_the_media_kinds_behave_like_that():
    """The rule's behaviour, not only its presence: run the node harness."""
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{KINDS_HARNESS.name} needs node, which is not installed here')

    result = subprocess.run([node, str(KINDS_HARNESS)], cwd=str(ROOT),
                            capture_output=True, text=True)
    assert result.returncode == 0, (
        f'{KINDS_HARNESS.name} failed:' + result.stdout + result.stderr)
    assert 'media kinds: all scenarios passed' in result.stdout, result.stdout


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
    print(f'{passed}/{len(tests)} media-drag tests passed')


if __name__ == '__main__':
    main()
