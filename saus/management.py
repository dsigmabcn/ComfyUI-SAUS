import json
from pathlib import Path
from aiohttp import web

from .constants import (
    APP_CONFIGS, SAUSMSG, logger,
    SAUS_BROWSER_PATH, SAUS_APPS_PATH, APPS_CONFIG_FILE
)

SAUS_BROWSER_DATA_PATH = SAUS_BROWSER_PATH / "data"


def _load_app_configs():
    """Read every app's appConfig.json from disk (includes the ``metadata`` block)."""
    configs = []
    for conf_file in sorted(SAUS_APPS_PATH.rglob(APPS_CONFIG_FILE)):
        try:
            configs.append(json.loads(conf_file.read_text(encoding='utf-8')))
        except Exception as e:
            logger.warning(f"{SAUSMSG}: Skipping invalid appConfig {conf_file}: {e}")
    return configs


async def apps_handler(request: web.Request) -> web.Response:
    # Re-read on every request so newly created / edited apps (and their
    # metadata) appear without a ComfyUI restart.
    configs = _load_app_configs() or APP_CONFIGS
    return web.json_response(configs, headers={'Cache-Control': 'no-cache'})

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

        return web.json_response(data, status=200, headers={'Cache-Control': 'no-cache'})

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

MODEL_DATA_FILE = SAUS_BROWSER_PATH / "data" / "models_data.json"

async def get_model_data_handler(request: web.Request) -> web.Response:
    try:
        if not MODEL_DATA_FILE.exists():
            return web.json_response(
                {"error": "Data Model file not found."},
                status=404
            )

        with open(MODEL_DATA_FILE , 'r', encoding='utf-8') as f:
            data = json.load(f)

        return web.json_response(data, status=200, headers={'Cache-Control': 'no-cache'})

    except json.JSONDecodeError:
        return web.json_response(
            {"error": "Invalid JSON format in the Models Data file."},
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
    return web.json_response(_read_json_file(TAXONOMY_FILE, {}), headers={'Cache-Control': 'no-cache'})


async def get_models_registry_handler(request: web.Request) -> web.Response:
    """The filename-keyed model registry (``models.json``)."""
    data = _read_json_file(MODELS_REGISTRY_FILE, {})
    models = data.get("models", data) if isinstance(data, dict) else {}
    return web.json_response(models, headers={'Cache-Control': 'no-cache'})


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