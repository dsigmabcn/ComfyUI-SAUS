import hashlib
import json
import os
from pathlib import Path
from aiohttp import web

from .constants import (
    APP_CONFIGS, DATA_DIR, SAUSMSG, logger,
    SAUS_BROWSER_PATH, SAUS_APPS_PATH, APPS_CONFIG_FILE
)
from .helpers import require_json

SAUS_BROWSER_DATA_PATH = SAUS_BROWSER_PATH / "data"

# The thumbnail names an app may ship, in tie-break order. They sit *next to*
# appConfig.json: a folder of its own (``media/``) only ever held these, so the app
# is a flat set of files now. The App Builder writes ``thumbnail.jpg``; apps are
# free to bring webp / avif / png.
APP_THUMBNAIL_NAMES = (
    'thumbnail.row.webp',
    'thumbnail.webp',
    'thumbnail.avif',
    'thumbnail.png',
    'thumbnail.jpg',
    'thumbnail.jpeg',
    'thumbnail.gif',
)

# The small copy the explorer row paints (tools/thumbnail.py writes it, 128px): the
# row must not download the ~23 KB master to draw a 40px square.
ROW_THUMBNAIL_NAME = 'thumbnail.row.webp'

# Apps may be parked in a ``web/apps/deprecated/`` folder when a newer model
# supersedes them. They are still discovered and still get their route - the
# explorer just hides them until "Show deprecated apps" is switched on.
DEPRECATED_DIR_NAME = 'deprecated'


def _is_deprecated(app_folder: Path) -> bool:
    """True when the app sits inside a ``deprecated/`` folder under ``web/apps``.

    Derived from the folder rather than an appConfig flag, so moving an app in or
    out of ``deprecated/`` is the only action needed and there is nothing to drift
    out of step. The *nearest* ancestors below the apps root decide, so a nested
    ``deprecated`` anywhere in the chain counts, while an app that merely happens
    to be named ``deprecated`` is not one itself (its own name is excluded).
    """
    try:
        relative = app_folder.relative_to(SAUS_APPS_PATH)
    except ValueError:
        return False
    return DEPRECATED_DIR_NAME in relative.parts[:-1]


def _find_app_thumbnail(app_folder: Path, names=APP_THUMBNAIL_NAMES, exclude=()) -> str:
    """The app's thumbnail as a file name in the app folder ('' when it has none).

    Only the known names are considered, so an appConfig cannot point the browser
    somewhere else. When an app ships several, the newest wins - that is the one
    someone just dropped in.
    """
    found = [name for name in names if (app_folder / name).is_file() and name not in exclude]
    if not found:
        return ''
    return max(found, key=lambda name: (app_folder / name).stat().st_mtime_ns)


def _load_app_configs():
    """Read every app's appConfig.json from disk (includes the ``metadata`` block)."""
    configs = []
    for conf_file in sorted(SAUS_APPS_PATH.rglob(APPS_CONFIG_FILE)):
        try:
            config = json.loads(conf_file.read_text(encoding='utf-8'))
        except Exception as e:
            logger.warning(f"{SAUSMSG}: Skipping invalid appConfig {conf_file}: {e}")
            continue
        # Derived at read time, never written back: the browser needs to know
        # which thumbnail file the app actually ships (jpg, webp, avif, ...) - and
        # which small copy it may use for the explorer row.
        config['thumbnail'] = _find_app_thumbnail(conf_file.parent, exclude=(ROW_THUMBNAIL_NAME,))
        config['thumbnailRow'] = (_find_app_thumbnail(conf_file.parent, names=(ROW_THUMBNAIL_NAME,))
                                  or config['thumbnail'])
        # An app in the deprecated/ folder is still listed and still routable; the
        # explorer filters it out unless the user has switched on "Show deprecated
        # apps" (see web/saus_browser/js/ui.js -> filterCurrentApps).
        config['deprecated'] = _is_deprecated(conf_file.parent)
        configs.append(config)
    return configs


# --------------------------------------------------------------------------- #
# Revalidation for the catalogs
#
# The shell and *every app page* re-read these catalogs, and `no-cache` (see
# static_cache.py) means the browser has to ask each time. Without a validator that
# question costs the whole body - ~201 KB for the apps, ~55 KB for the architectures,
# ~30 KB for the registry - so a validator is what makes "re-read on every request"
# (above) affordable: the answer is still never cached, only the *question* is cheap.
#
# The tag is derived from (mtime, size) of the files the payload is built from: free
# to compute, and it changes exactly when the content does.
# --------------------------------------------------------------------------- #

def _files_etag(paths) -> str:
    """One entity tag over a set of files, whatever order they arrive in."""
    digest = hashlib.sha1()
    for path in sorted(str(p) for p in paths):
        try:
            stat = os.stat(path)
        except OSError:
            continue
        digest.update(f'{path}:{stat.st_mtime_ns}:{stat.st_size}\n'.encode('utf-8'))
    return '"%s"' % digest.hexdigest()


def _file_etag(path: Path) -> str:
    """The tag for one file, or None when it is not there yet."""
    return _files_etag([path]) if Path(path).exists() else None


def _json_unless_fresh(request: web.Request, payload, etag) -> web.Response:
    """The payload as JSON, or a bodyless 304 when the caller already has it."""
    headers = {'Cache-Control': 'no-cache'}
    if etag:
        headers['ETag'] = etag
        if request.headers.get('If-None-Match') == etag:
            return web.Response(status=304, headers=headers)
    return web.json_response(payload, headers=headers)


async def apps_handler(request: web.Request) -> web.Response:
    # Re-read on every request so newly created / edited apps (and their
    # metadata) appear without a ComfyUI restart.
    configs = _load_app_configs() or APP_CONFIGS
    etag = _files_etag(SAUS_APPS_PATH.rglob(APPS_CONFIG_FILE))
    return _json_unless_fresh(request, configs, etag)



# The App Manager's hidden-app list. It is server-side, so every browser that
# opens this ComfyUI sees the same panel, and it lives in the node's own data dir
# (never user files); ``.gitignore`` already ignores ``**/data/settings.json``.
# The list is a *deny* list of app ids: an app that leaves the disk simply stops
# matching, so there is nothing to migrate and no stale state to clean up.
SETTINGS_FILE = DATA_DIR / "settings.json"
SETTINGS_SCHEMA_VERSION = 1
# Longer than the app set is nonsense, so it is refused before anything is written.
MAX_HIDDEN_APP_IDS = 500


def _known_app_ids() -> set:
    """The ids of the apps actually installed under ``web/apps``."""
    return {str(config['id']) for config in _load_app_configs() if config.get('id')}


def _stored_hidden_app_ids() -> list:
    """The deny list on disk, pruned to apps that still exist.

    Pruning on *read* as well as write means the answer to "what is hidden" never
    depends on an app having been deleted since the list was saved.
    """
    stored = _read_json_file(SETTINGS_FILE, {})
    stored = stored.get('hiddenAppIds') if isinstance(stored, dict) else None
    if not isinstance(stored, list):
        return []

    known = _known_app_ids()
    hidden = []
    for value in stored:
        if isinstance(value, str) and value in known and value not in hidden:
            hidden.append(value)
    return hidden


def _write_settings(hidden_app_ids: list) -> None:
    """Write the deny list atomically (tmp + replace), so a crash keeps the old one."""
    SETTINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
    payload = {'schemaVersion': SETTINGS_SCHEMA_VERSION, 'hiddenAppIds': hidden_app_ids}
    temporary = SETTINGS_FILE.with_name(SETTINGS_FILE.name + '.tmp')
    temporary.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    os.replace(temporary, SETTINGS_FILE)


async def get_app_visibility_handler(request: web.Request) -> web.Response:
    """Which apps the App Manager hides (install-wide, not per browser)."""
    return web.json_response({'hiddenAppIds': _stored_hidden_app_ids()},
                             headers={'Cache-Control': 'no-cache'})


async def set_app_visibility_handler(request: web.Request) -> web.Response:
    """Replace the hidden-app list. Display only: no app file is ever touched.

    Every entry has to be an *installed* app's id, so the file can only ever hold
    apps that exist - it is a display filter, not somewhere to park a path or a
    name of our own choosing. An id that no longer matches an app is dropped (and
    the reply carries the list that was actually stored), while a malformed
    payload is refused outright.
    """
    guard = require_json(request)
    if guard is not None:
        return guard

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Body must be JSON'}, status=400)

    if not isinstance(data, dict):
        return web.json_response({'error': 'Body must be a JSON object'}, status=400)

    hidden_app_ids = data.get('hiddenAppIds')
    if not isinstance(hidden_app_ids, list):
        return web.json_response({'error': 'hiddenAppIds must be a list'}, status=400)
    if len(hidden_app_ids) > MAX_HIDDEN_APP_IDS:
        return web.json_response({'error': 'hiddenAppIds is too long'}, status=400)
    if any(not isinstance(value, str) for value in hidden_app_ids):
        return web.json_response({'error': 'hiddenAppIds entries must be app ids'}, status=400)

    known = _known_app_ids()
    stored = []
    for value in hidden_app_ids:
        if value in known and value not in stored:
            stored.append(value)

    try:
        _write_settings(stored)
    except Exception as e:
        logger.error(f"{SAUSMSG}: could not write the app visibility setting: {e}")
        return web.json_response({'error': 'Could not save the setting'}, status=500)

    return web.json_response({'hiddenAppIds': stored})


ARCHITECTURES_FILE = SAUS_BROWSER_PATH / "data" / "architectures.json"

async def get_architectures_handler(request: web.Request) -> web.Response:
    try:
        if not ARCHITECTURES_FILE.exists():
            return web.json_response(
                {"error": "Architectures data file not found."},
                status=404
            )

        with open(ARCHITECTURES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        return _json_unless_fresh(request, data, _file_etag(ARCHITECTURES_FILE))

    except json.JSONDecodeError:
        return web.json_response(
            {"error": "Invalid JSON format in the architectures file."},
            status=500
        )
    except Exception as e:
        return web.json_response(
            {"error": f"An unexpected error occurred: {e}"},
            status=500
        )

# --------------------------------------------------------------------------- #
# New (metadata-era) read endpoints
# --------------------------------------------------------------------------- #
TAXONOMY_FILE = SAUS_BROWSER_DATA_PATH / "taxonomy.json"
MODELS_REGISTRY_FILE = SAUS_BROWSER_DATA_PATH / "models.json"


def _read_json_file(path: Path, default):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as e:
        logger.error(f"{SAUSMSG}: Invalid JSON in {path}: {e}")
        return default


async def get_taxonomy_handler(request: web.Request) -> web.Response:
    """Shared category / tag vocabulary (drives sidebar + builder dropdowns)."""
    return _json_unless_fresh(request, _read_json_file(TAXONOMY_FILE, {}),
                              _file_etag(TAXONOMY_FILE))


async def get_models_registry_handler(request: web.Request) -> web.Response:
    """The filename-keyed model registry (``models.json``)."""
    data = _read_json_file(MODELS_REGISTRY_FILE, {})
    models = data.get("models", data) if isinstance(data, dict) else {}
    return _json_unless_fresh(request, models, _file_etag(MODELS_REGISTRY_FILE))


async def get_app_models_handler(request: web.Request) -> web.Response:
    """Resolve an app's required models (``metadata.models``) against the registry."""
    url = request.rel_url.query.get("url", "")
    if not url:
        return web.Response(status=400, text="Missing 'url' parameter")

    conf = None
    for conf_file in SAUS_APPS_PATH.rglob(APPS_CONFIG_FILE):
        try:
            candidate = json.loads(conf_file.read_text(encoding='utf-8'))
        except Exception:
            continue
        if candidate.get("url") == url:
            conf = candidate
            break
    if conf is None:
        return web.Response(status=404, text=f"App '{url}' not found")

    filenames = (conf.get("metadata") or {}).get("models", []) or []
    registry = _read_json_file(MODELS_REGISTRY_FILE, {})
    registry = registry.get("models", registry) if isinstance(registry, dict) else {}

    resolved = []
    for filename in filenames:
        entry = dict(registry.get(filename) or {})
        entry["filename"] = filename
        entry.setdefault("name", filename)
        entry.setdefault("type", "")
        entry.setdefault("url", "")
        entry.setdefault("directory", "")
        resolved.append(entry)

    return web.json_response({"url": url, "models": resolved}, headers={'Cache-Control': 'no-cache'})