"""Dragging a result onto a Load Image input, across tabs.

One reason per file involved: ``appDrag.js`` keeps the payload in module state, because
only a ``drop`` may read ``dataTransfer.getData()`` while the tab strip has to ask
*during* the drag; the Recent panel derives its payload from ComfyUI's own
``/view?filename=...&type=...`` URL and refuses ``temp/`` (the File Manager API may not
copy from there); the loader checks the payload **before** ``dataTransfer.files`` and
copies anything outside ``input/`` in; the tab strip arms the hover for a media drag
only, never while reordering tabs.
"""

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
HARNESS = ROOT / 'tests' / 'js' / 'upload_guard.harness.mjs'


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
    """`/upload/image` is ComfyUI's route and screens nothing, so the loader must.

    A script dropped on the control would land in `input/`, which the server can read but
    never imports - so this closes a policy hole, not a sandbox hole. The list is
    duplicated on purpose (the server is Python, the control is a browser module), and
    this test is what keeps the two copies equal.
    """
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
    """The guard's behaviour, not only its presence: run the node harness.

    Skipped - never failed - when node is absent, because only the *environment* decides
    that. `tools/check_all.py` puts node on PATH, so inside the gate this always runs.
    """
    node = shutil.which('node') or shutil.which('nodejs')
    if node is None:
        _skip(f'{HARNESS.name} needs node, which is not installed here')

    result = subprocess.run([node, str(HARNESS)], cwd=str(ROOT), capture_output=True, text=True)
    assert result.returncode == 0, f'{HARNESS.name} failed:\n{result.stdout}\n{result.stderr}'
    assert 'upload guard: all scenarios passed' in result.stdout, result.stdout


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
