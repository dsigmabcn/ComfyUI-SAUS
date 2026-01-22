import subprocess
import tempfile
import shutil
import json
import asyncio
from aiohttp import web
from pathlib import Path
from .constants import FLOWS_DOWNLOAD_PATH, FLOWS_DOWNLOAD_PRIVATE_PATH, FLOWS_PATH, FLOWS_TO_REMOVE, FLOWMSG, logger, DATA_DIR, APP_CONFIGS, FLOWS_CONFIG_FILE
from .api_handlers import decrypt_value
from .route_manager import RouteManager

def find_destination_path(item_name: str) -> Path:
    p = FLOWS_PATH / item_name
    if p.exists():
        return p
    for p in FLOWS_PATH.rglob(item_name):
        if p.is_dir() and p.name == item_name:
            return p
    return FLOWS_PATH / item_name

def download_update_flows() -> None:
    # Remove deprecated flows
    try:
        for flow in FLOWS_TO_REMOVE:
            flow_path = find_destination_path(flow)
            if flow_path.exists() and flow_path.is_dir():
                # logger.info(f"{FLOWMSG}: Removing existing flow directory '{flow}'")
                shutil.rmtree(flow_path)
                # logger.debug(f"{FLOWMSG}: Successfully removed '{flow}'")
    except Exception as e:
        logger.error(f"{FLOWMSG}: Error removing deprecated flows: {e}")

    # Download Public Flows (Log errors but don't stop)
    try:
        _download_repo(FLOWS_DOWNLOAD_PATH, "Open")
    except Exception as e:
        logger.error(f"{FLOWMSG}: Public flows update failed: {e}")

    # Download Private Flows (Propagate errors for UI feedback)
    settings_file = DATA_DIR / "settings.json"
    if settings_file.exists():
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
            
            token = decrypt_value(settings.get('saus_token'))
            if token:
                # Insert token into URL
                auth_url = FLOWS_DOWNLOAD_PRIVATE_PATH.replace("https://github.com", f"https://oauth2:{token}@github.com")
                _download_repo(auth_url, "Private")
        except Exception as e:
            logger.error(f"{FLOWMSG}: Error checking private flows: {e}")
            raise e # Re-raise to notify caller

def _download_repo(repo_url: str, repo_type: str) -> None:
    with tempfile.TemporaryDirectory() as tmpdirname:
        temp_repo_path = Path(tmpdirname) / "Flows"
        logger.info(f"{FLOWMSG}: Downloading and Uploading {repo_type} Flows")

        result = subprocess.run(
            ['git', 'clone', repo_url, str(temp_repo_path)],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            safe_url = repo_url.split('@')[-1] if '@' in repo_url else repo_url
            msg = f"Failed to clone {repo_type} flows repository ({safe_url}):\n{result.stderr}"
            logger.error(f"{FLOWMSG}: {msg}")
            raise Exception(msg)

        if not FLOWS_PATH.exists():
            FLOWS_PATH.mkdir(parents=True)

        for item in temp_repo_path.iterdir():
            if item.name in ['.git', '.github']:
                continue
            dest_item = find_destination_path(item.name)
            if item.is_dir():
                if dest_item.exists():
                    _copy_directory(item, dest_item)
                else:
                    shutil.copytree(item, dest_item)
            else:
                shutil.copy2(item, dest_item)
        
        logger.info(f"{FLOWMSG}: {repo_type} Flows have been updated successfully.")

def _copy_directory(src: Path, dest: Path) -> None:
    for item in src.iterdir():
        if item.name in ['.git', '.github']:
            continue
        dest_item = dest / item.name
        if item.is_dir():
            if not dest_item.exists():
                dest_item.mkdir()
            _copy_directory(item, dest_item)
        else:
            shutil.copy2(item, dest_item)

def _load_config(conf_file: Path) -> dict:
    try:
        with conf_file.open('r') as f:
            return json.load(f)
    except json.JSONDecodeError as e:
        logger.error(f"{FLOWMSG}: Invalid JSON in {conf_file}: {e}")
        return {}
    except Exception as e:
        logger.error(f"{FLOWMSG}: Error loading config from {conf_file}: {e}")
        return {}

def refresh_flows(app: web.Application) -> None:
    """
    Scans for new flows that are not yet in APP_CONFIGS and registers them.
    Also removes flows from APP_CONFIGS that no longer exist on disk.
    """
    # 1. Scan disk for current valid flows
    disk_flows = {}
    for conf_file in FLOWS_PATH.rglob(FLOWS_CONFIG_FILE):
        flow_dir = conf_file.parent
        conf = _load_config(conf_file)
        url = conf.get('url')
        if url:
            disk_flows[url] = (flow_dir, conf)

    # 2. Remove stale entries from APP_CONFIGS
    disk_urls = set(disk_flows.keys())
    current_urls = {c.get('url') for c in APP_CONFIGS}
    
    for i in range(len(APP_CONFIGS) - 1, -1, -1):
        if APP_CONFIGS[i].get('url') not in disk_urls:
            removed = APP_CONFIGS.pop(i)
            # logger.info(f"{FLOWMSG}: Removed stale flow from list: {removed.get('url')}")

    # 3. Add new flows
    for url, (flow_dir, conf) in disk_flows.items():
        if url not in current_urls:
            try:
                rel_path = flow_dir.relative_to(FLOWS_PATH)
                conf['flow_type'] = rel_path.parts[0] if len(rel_path.parts) > 1 else 'open'
            except Exception:
                conf['flow_type'] = 'open'

            try:
                # Note: Adding routes dynamically works, but removing them is not supported by aiohttp.
                # Stale routes will remain active until restart, but they won't appear in the UI list.
                app.add_routes(RouteManager.create_routes(f"flow/{url}", flow_dir))
                APP_CONFIGS.append(conf)
                logger.info(f"{FLOWMSG}: Dynamically registered new flow: {url}")
            except Exception as e:
                logger.error(f"{FLOWMSG}: Error registering new flow {url}: {e}")

async def sync_flows_handler(request: web.Request) -> web.Response:
    try:
        await asyncio.to_thread(download_update_flows)
        
        # Dynamically refresh flows in the app without requiring a restart
        refresh_flows(request.app)
        
        return web.json_response({"status": "success", "message": "Flows synced successfully."})
    except Exception as e:
        logger.error(f"{FLOWMSG}: Error syncing flows: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)
