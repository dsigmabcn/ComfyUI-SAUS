import os
import re
import urllib.parse
from pathlib import Path

try:  # aiohttp is always present inside ComfyUI; stay importable without it.
    from aiohttp import web
except Exception:  # pragma: no cover
    web = None

from .constants import (
    BLOCKED_UPLOAD_EXTENSIONS, ALLOWED_FILE_ROOTS,
    COMFYUI_DIRECTORY, logger, SAUSMSG,
)

def allowed_file(filename: str) -> bool:
    """Reject scripts and native libraries on upload (see BLOCKED_UPLOAD_EXTENSIONS)."""
    if not filename or not isinstance(filename, str):
        return False
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    return ext not in BLOCKED_UPLOAD_EXTENSIONS

def _check_user_path_shape(user_path: str) -> str:
    """Reject absolute / drive-letter / UNC / parent-traversal paths *before*
    touching the filesystem."""
    if not isinstance(user_path, str) or not user_path.strip():
        raise ValueError("Missing or empty path")
    raw = user_path.strip()
    if raw.startswith('/') or raw.startswith('\\'):
        raise ValueError("Absolute paths are not allowed")
    if re.match(r'^[A-Za-z]:', raw):
        raise ValueError("Drive-letter paths are not allowed")
    if raw.startswith('//') or raw.startswith('\\\\'):
        raise ValueError("UNC paths are not allowed")
    if '..' in Path(raw.replace('\\', '/')).parts:
        raise ValueError("Parent directory references ('..') are not allowed")
    return raw


def reject_unc_path(raw: str) -> str:
    """Refuse a UNC path supplied as *text*, before anything resolves it.

    ``Path('\\\\host\\share\\file').resolve()`` makes Windows contact that host, so
    the check has to run on the string, not on the resolved path. Covers the plain
    ``\\\\host\\share`` / ``//host/share`` forms and the ``\\\\?\\`` device-prefixed
    ones. Single-slash absolute and drive-letter paths are left alone: the
    download-file endpoint legitimately receives those from ComfyUI's executor.
    """
    text = (raw or '').strip()
    if text.startswith('//') or text.startswith('\\\\'):
        raise ValueError("UNC paths are not allowed")
    return text


def is_root_path(path) -> bool:
    """True when ``path`` resolves to one of the user-data roots themselves.

    ``resolve_within_roots()`` accepts a root (it is *inside* itself), so without
    this a rename / delete / move could act on ``input``, ``output`` or ``models``
    as a whole.
    """
    try:
        target = Path(path).resolve()
    except Exception:
        return False
    for root in ALLOWED_FILE_ROOTS:
        try:
            if target == Path(root).resolve():
                return True
        except Exception:
            continue
    return False


def resolve_within_roots(user_path: str, roots=None) -> Path:
    """Resolve a caller-supplied path and confine it to the allowed user-data
    folders (input / output / models) using realpath + commonpath.

    Relative paths are resolved against the ComfyUI root (never against the
    server's working directory). Returns a resolved ``Path``, or raises
    ``ValueError`` when the path is unsafe or outside the allowed folders.
    """
    allowed_roots = [Path(r).resolve() for r in (roots if roots is not None else ALLOWED_FILE_ROOTS)]
    raw = _check_user_path_shape(user_path)

    candidate = Path(raw)
    if not candidate.is_absolute():
        candidate = COMFYUI_DIRECTORY / candidate
    resolved = candidate.resolve()

    for root in allowed_roots:
        try:
            resolved.relative_to(root)
            return resolved
        except ValueError:
            continue
    raise ValueError("Path is outside the allowed folders (input, output, models)")


def is_json_request(request) -> bool:
    """True when the caller explicitly declares a JSON body.

    Requiring ``Content-Type: application/json`` forces a CORS preflight for
    cross-site callers, which this server never answers, so it blocks
    CSRF-style POSTs from third-party pages without breaking the SAUS UI
    (which always sends JSON) or plain ``curl``.
    """
    ctype = (request.headers.get('Content-Type') or '').split(';')[0].strip().lower()
    return ctype == 'application/json'


def require_json(request):
    """Refuse a request that does not declare a JSON body (CSRF guard).

    Returns a 415 response, or ``None`` when the caller is fine. A browser sends
    cross-site ``<form>`` posts (urlencoded / multipart / text-plain) *without*
    any check, which is how CSRF happens; JSON is not a "simple" content type, so
    it forces a CORS preflight this server never answers.
    """
    if web is None or is_json_request(request):
        return None
    return web.json_response(
        {"status": "error", "message": "Content-Type must be application/json"},
        status=415,
    )


def require_saus_header(request):
    """Refuse a request without the ``X-SAUS-Request`` header (CSRF guard).

    Used for ``multipart/form-data`` posts (uploads): a ``<form>`` can send
    multipart natively, so a content-type check cannot help -- but a form cannot
    set a custom header, and a cross-site fetch that sets one triggers the same
    preflight.
    """
    if web is None or (request.headers.get('X-SAUS-Request') or '').strip() == '1':
        return None
    return web.json_response(
        {"status": "error", "message": "Missing X-SAUS-Request header"},
        status=415,
    )

def extract_filename_from_response(resp, url):
    for key, value in resp.headers.items():
        if 'content-disposition' in key.lower():
            match = re.search(r'filename="?([^"]+)"?', value)
            if match:
                return match.group(1)
    parsed_url = urllib.parse.urlparse(url)
    return os.path.basename(parsed_url.path)