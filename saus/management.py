import subprocess
import os
import json
import shutil
import sys
from pathlib import Path
from aiohttp import web

from .constants import (
    APP_CONFIGS, EXTENSION_NODE_MAP_PATH,
    CUSTOM_NODES_DIR, SAUSMSG, logger,
    SAUS_BROWSER_PATH, SAUS_APPS_PATH, APPS_CONFIG_FILE
)
from .helpers import remove_readonly

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

async def extension_node_map_handler(request: web.Request) -> web.Response:
    if EXTENSION_NODE_MAP_PATH.exists():
        with EXTENSION_NODE_MAP_PATH.open('r') as f:
            extension_node_map = json.load(f)
        return web.json_response(extension_node_map)
    else:
        logger.error(f"{SAUSMSG}: extension-node-map.json not found at {EXTENSION_NODE_MAP_PATH}")
        return web.Response(status=404, text="extension-node-map.json not found")

async def installed_custom_nodes_handler(request: web.Request) -> web.Response:
    try:
        installed_nodes = [item.name for item in CUSTOM_NODES_DIR.iterdir() if item.is_dir()]
        return web.json_response({'installedNodes': installed_nodes})
    except Exception as e:
        logger.error(f"{SAUSMSG}: Error fetching installed custom nodes: {e}")
        return web.Response(status=500, text="Internal Server Error")

async def install_package_handler(request: web.Request) -> web.Response:
    data = await request.json()
    package_url = data.get('packageUrl')
    if not package_url:
        return web.Response(status=400, text="Missing 'packageUrl' in request body")
    
    package_name = package_url.rstrip('/').split('/')[-1]
    install_path = CUSTOM_NODES_DIR / package_name

    if install_path.exists():
        return web.json_response({'status': 'already_installed', 'message': f"Custom node '{package_name}' is already installed."})

    try:
        subprocess.check_call(['git', 'clone', package_url, str(install_path)])
        logger.info(f"{SAUSMSG}: Custom node '{package_name}' cloned successfully.")
        requirements_file = install_path / 'requirements.txt'
        if requirements_file.exists():
            try:
                subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', str(requirements_file)])
                logger.info(f"{SAUSMSG}: Requirements for '{package_name}' installed successfully.")
            except subprocess.CalledProcessError as e:
                logger.error(f"{SAUSMSG}: Failed to install requirements for '{package_name}': {e}")
                shutil.rmtree(install_path)
                return web.json_response({
                    'status': 'error',
                    'message': f"Failed to install requirements for '{package_name}'. The package has been removed. Please try installing manually."
                }, status=500)
        else:
            logger.info(f"{SAUSMSG}: No requirements.txt found for '{package_name}'.")
       
        return web.json_response({'status': 'success', 'message': f"Custom node '{package_name}' installed successfully."})
    except subprocess.CalledProcessError as e:
        if install_path.exists():
            shutil.rmtree(install_path)
        logger.error(f"{SAUSMSG}: Failed to install package '{package_name}': {e}")
        return web.json_response({'status': 'error', 'message': f"Failed to install custom node '{package_name}': {e}"}, status=500)
    except Exception as e:
        if install_path.exists():
            shutil.rmtree(install_path)
        logger.error(f"{SAUSMSG}: An unexpected error occurred while installing '{package_name}': {e}")
        return web.json_response({'status': 'error', 'message': f"An unexpected error occurred while installing '{package_name}': {e}"}, status=500)

async def update_package_handler(request: web.Request) -> web.Response:
    data = await request.json()
    package_url = data.get('packageUrl')
    if not package_url:
        return web.Response(status=400, text="Missing 'packageUrl' in request body")
    
    package_name = package_url.rstrip('/').split('/')[-1]
    install_path = CUSTOM_NODES_DIR / package_name

    if not install_path.exists():
        return web.json_response({'status': 'not_installed', 'message': f"Package '{package_name}' is not installed."})

    try:
        result = subprocess.run(['git', '-C', str(install_path), 'pull'], capture_output=True, text=True)
        if result.returncode == 0:
            return web.json_response({'status': 'success', 'message': f"Package '{package_name}' updated successfully."})
        else:
            logger.error(f"{SAUSMSG}: Failed to update package '{package_name}':\n{result.stderr}")
            return web.json_response({'status': 'error', 'message': f"Failed to update package '{package_name}': {result.stderr}"}, status=500)
    except Exception as e:
        logger.error(f"{SAUSMSG}: An error occurred while updating package '{package_name}': {e}")
        return web.json_response({'status': 'error', 'message': f"An error occurred while updating package '{package_name}': {e}"}, status=500)

async def uninstall_package_handler(request: web.Request) -> web.Response:
    data = await request.json()
    package_url = data.get('packageUrl')
    if not package_url:
        logger.warning(f"{SAUSMSG}: Uninstall request received with missing 'packageUrl'.")
        return web.Response(status=400, text="Missing 'packageUrl' in request body")
    
    package_name = package_url.rstrip('/').split('/')[-1]
    install_path = CUSTOM_NODES_DIR / package_name

    if not install_path.exists():
        logger.info(f"{SAUSMSG}: Attempt to uninstall non-existent package '{package_name}'.")
        return web.json_response({'status': 'not_installed', 'message': f"Custom node '{package_name}' is not installed."})

    try:
        logger.info(f"{SAUSMSG}: Uninstalling custom node '{package_name}'...")
        shutil.rmtree(install_path, onerror=remove_readonly)
        logger.info(f"{SAUSMSG}: Custom node '{package_name}' uninstalled successfully.")
        return web.json_response({'status': 'success', 'message': f"Custom node '{package_name}' uninstalled successfully."})
    except Exception as e:
        logger.error(f"{SAUSMSG}: An error occurred while uninstalling '{package_name}': {e}")
        return web.json_response({'status': 'error', 'message': f"An error occurred while uninstalling custom node '{package_name}': {e}"}, status=500)

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