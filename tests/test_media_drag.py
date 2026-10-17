"""Dragging a result onto a Load Image input, across tabs.

The pieces are spread over four files and each one has a reason to be the way it is:

* ``appDrag.js`` keeps the payload in **module state**, because a ``dragover`` may not
  read ``dataTransfer.getData()`` - only a ``drop`` can - and the tab strip has to ask
  "is this one of ours?" *during* the drag to decide whether to open a tab.
* the Recent panel marks its thumbnails draggable and derives the payload from
  ComfyUI's own ``/view?filename=...&type=...`` URL; ``temp/`` is refused because the
  File Manager API may not copy from it, so a LoadImage could never use it.
* the loader checks the payload **before** ``dataTransfer.files`` (an internal drag has
  no files, and an OS drop has no payload), and copies anything outside ``input/`` into
  ``input/`` first, because that is the folder ``LoadImage`` reads.
* the tab strip only arms the hover for a media drag, never while reordering tabs.

Runs under pytest or directly (``python tests/test_media_drag.py``).
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CORE = ROOT / 'web' / 'core' / 'js' / 'common'
DRAG_JS = CORE / 'scripts' / 'appDrag.js'
LOADER_JS = CORE / 'components' / 'widgets' / 'ImageLoader.js'
RECENT_JS = CORE / 'components' / 'imagedisplay.js'
TABS_JS = ROOT / 'web' / 'saus_browser' / 'js' / 'tabs.js'
FM_JS = ROOT / 'web' / 'file_manager' / 'js' / 'main.js'
MAIN_CSS = ROOT / 'web' / 'core' / 'css' / 'main.css'


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


def main():
    tests = [(name, fn) for name, fn in sorted(globals().items())
             if name.startswith('test_') and callable(fn)]
    for name, fn in tests:
        fn()
        print(f'  ok  {name}')
    print(f'{len(tests)}/{len(tests)} media-drag tests passed')


if __name__ == '__main__':
    main()
