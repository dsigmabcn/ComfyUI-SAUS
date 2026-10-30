/**
 * Which files each kind of media surface may show, and how to ask the server for a
 * small preview of one.
 *
 * Three places used to answer "is this an image?" their own way - the input picker
 * (which offered every file in `input/`, whatever the node was), the Recent panel
 * (which pointed 90 px tiles at full-size originals) and the File Manager - and the
 * server has a fourth list of its own in `saus/file_system.py`. The extension sets here
 * mirror `MEDIA_EXTENSIONS`/`IMAGE_THUMB_EXTENSIONS` there; `tests/test_media_drag.py`
 * fails if they drift apart.
 *
 * Nothing here touches the DOM, so it runs in a headless harness
 * (`tests/js/media_kinds.harness.mjs`).
 */

/** What a `Load*` node can load, by extension (lower-case, no dot). */
export const MEDIA_EXTENSIONS = {
  image: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp', 'gif'],
  video: ['mp4', 'webm', 'ogg', 'mov', 'mkv'],
  audio: ['mp3', 'wav', 'flac', 'm4a', 'ogg'],
};

/** The extension of a name or path, lower-cased, '' when it has none. */
export function extensionOf(name) {
  const text = String(name || '');
  const dot = text.lastIndexOf('.');
  if (dot < 0 || dot === text.length - 1) return '';
  return text.slice(dot + 1).toLowerCase();
}

/** 'image' | 'video' | 'audio' for a file name, or null when it is none of them. */
export function mediaKindOf(name) {
  const ext = extensionOf(name);
  if (!ext) return null;
  for (const [kind, extensions] of Object.entries(MEDIA_EXTENSIONS)) {
    if (extensions.includes(ext)) return kind;
  }
  return null;
}

/** The files of `files` a surface of that kind can actually show. */
export function filterByKind(files, kind) {
  const allowed = MEDIA_EXTENSIONS[kind];
  if (!allowed) return files;
  return files.filter((name) => allowed.includes(extensionOf(name)));
}

/** The `accept` attribute for the upload input, so the OS dialog filters too. */
export function acceptForKind(kind) {
  const allowed = MEDIA_EXTENSIONS[kind];
  if (!allowed) return '';
  return `${kind}/*,` + allowed.map((ext) => `.${ext}`).join(',');
}

/**
 * A compressed preview of a server-side file, resized and cached by the server
 * (`/saus/api/thumbnail`, which answers 304 for a tile it already encoded).
 *
 * `path` is root-qualified and posix-separated, e.g. `input/photo.png` or
 * `output/2026-10-30/result.png` - the same shape `parseMediaUrl()` produces.
 */
export function thumbnailUrlForPath(path, size = 256) {
  return `/saus/api/thumbnail?path=${encodeURIComponent(path)}&size=${size}`;
}
