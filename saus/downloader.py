import subprocess
import tempfile
import shutil
import json
import asyncio
from aiohttp import web
from pathlib import Path
from packaging.version import parse as parse_version
from .constants import OPEN_APPS_ORIGIN, GOLD_BETA_APPS_ORIGIN, SAUS_APPS_PATH, APPS_TO_REMOVE, SAUSMSG, logger, DATA_DIR, APP_CONFIGS, APPS_CONFIG_FILE, SAUS_BROWSER_PATH, SAUS_ORIGIN, APP_VERSION
from .helpers import decrypt_value
from .route_manager import RouteManager

def find_destination_path(item_name: str) -> Path:
    p = SAUS_APPS_PATH / item_name
    if p.exists():
        return p
    for p in SAUS_APPS_PATH.rglob(item_name):
        if p.is_dir() and p.name == item_name:
            return p
    return SAUS_APPS_PATH / item_name

def download_update_apps(raise_on_error: bool = False) -> None:
    # Remove deprecated apps
    try:
        for apps in APPS_TO_REMOVE:
            SAUS_BROWSER_PATH = find_destination_path(apps)
            if SAUS_BROWSER_PATH.exists() and SAUS_BROWSER_PATH.is_dir():                
                shutil.rmtree(SAUS_BROWSER_PATH)                
    except Exception as e:
        logger.error(f"{SAUSMSG}: Error removing deprecated apps: {e}")

    # Update Data Files from SAUS Core
    _update_data_files_from_saus()

    # Download Public Apps (Log errors but don't stop)
    try:
        _download_repo(OPEN_APPS_ORIGIN, "Open")
    except Exception as e:
        logger.error(f"{SAUSMSG}: Public apps update failed: {e}")

    # Download Private Apps (Propagate errors for UI feedback)
    settings_file = DATA_DIR / "settings.json"
    if settings_file.exists():
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                settings = json.load(f)
            
            token = decrypt_value(settings.get('saus_token'))
            if token:
                # Insert token into URL
                auth_url = GOLD_BETA_APPS_ORIGIN.replace("https://github.com", f"https://oauth2:{token}@github.com")
                _download_repo(auth_url, "Private")
        except Exception as e:
            logger.error(f"{SAUSMSG}: Error checking private apps: {e}")
            if raise_on_error:
                raise e # Re-raise to notify caller

def _check_and_update_data_file(filename: str, temp_repo_path: Path, repo_type: str, version_mismatch: bool = False) -> None:
    src = temp_repo_path / filename
    if not src.exists():
        return

    dest = SAUS_BROWSER_PATH / "data" / filename
    should_update = False
    reason = ""

    if not dest.exists():
        should_update = True
        reason = "New file"
    elif version_mismatch:
        should_update = True
        reason = "Version mismatch"

    if should_update:
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dest)
            logger.info(f"{SAUSMSG}: Updated {filename} from {repo_type} repository. ({reason})")
        except Exception as e:
            logger.error(f"{SAUSMSG}: Failed to update {filename}: {e}")

def _update_data_files_from_saus() -> None:
    try:
        with tempfile.TemporaryDirectory() as tmpdirname:
            temp_repo_path = Path(tmpdirname) / "SAUS_Core"
            logger.info(f"{SAUSMSG}: Checking for data file updates from SAUS Core...")

            result = subprocess.run(
                ['git', 'clone', SAUS_ORIGIN, str(temp_repo_path)],
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                logger.error(f"{SAUSMSG}: Failed to clone SAUS Core repository: {result.stderr}")
                return

            # Check version from pyproject.toml
            remote_version = None
            pyproject_path = temp_repo_path / "pyproject.toml"
            if pyproject_path.exists():
                try:
                    with open(pyproject_path, 'r', encoding='utf-8') as f:
                        for line in f:
                            if line.strip().startswith("version"):
                                parts = line.split('=')
                                if len(parts) > 1:
                                    remote_version = parts[1].strip().strip('"\'')
                                break
                except Exception as e:
                    logger.warning(f"{SAUSMSG}: Failed to parse version from remote pyproject.toml: {e}")

            version_update_needed = False
            if remote_version:
                try:
                    if parse_version(remote_version) > parse_version(APP_VERSION):
                        version_update_needed = True
                        logger.info(f"{SAUSMSG}: Newer version detected (Local: {APP_VERSION}, Remote: {remote_version}). Updating data files.")
                except Exception as e:
                    logger.warning(f"{SAUSMSG}: Could not compare versions ('{remote_version}' vs '{APP_VERSION}'): {e}")

            source_dir = temp_repo_path / "web" / "saus_browser" / "data"
            if source_dir.exists():
                data_files = ["app_list.json", "architectures.json", "models_data.json"]
                for df in data_files:
                    _check_and_update_data_file(df, source_dir, "SAUS Core", version_update_needed)
    except Exception as e:
        logger.error(f"{SAUSMSG}: Failed to update data files from SAUS Core: {e}")

def _download_repo(repo_url: str, repo_type: str) -> None:
    with tempfile.TemporaryDirectory() as tmpdirname:
        temp_repo_path = Path(tmpdirname) / "Apps"
        logger.info(f"{SAUSMSG}: Downloading and Uploading {repo_type} Apps")

        result = subprocess.run(
            ['git', 'clone', repo_url, str(temp_repo_path)],
            capture_output=True,
            text=True
        )
        if result.returncode != 0:
            safe_url = repo_url.split('@')[-1] if '@' in repo_url else repo_url
            msg = f"Failed to clone {repo_type} Apps repository ({safe_url}):\n{result.stderr}"
            logger.error(f"{SAUSMSG}: {msg}")
            raise Exception(msg)

        if not SAUS_APPS_PATH.exists():
            SAUS_APPS_PATH.mkdir(parents=True)

        data_files = ["app_list.json", "architectures.json", "models_data.json"]

        for item in temp_repo_path.iterdir():
            if item.name in ['.git', '.github'] + data_files:
                continue
            dest_item = find_destination_path(item.name)
            if item.is_dir():
                if dest_item.exists():
                    _copy_directory(item, dest_item)
                else:
                    shutil.copytree(item, dest_item)
            else:
                shutil.copy2(item, dest_item)
        
        logger.info(f"{SAUSMSG}: {repo_type} Apps have been updated successfully.")

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
        logger.error(f"{SAUSMSG}: Invalid JSON in {conf_file}: {e}")
        return {}
    except Exception as e:
        logger.error(f"{SAUSMSG}: Error loading config from {conf_file}: {e}")
        return {}

def refresh_apps(app: web.Application) -> None:
    """
    Scans for new apps that are not yet in APP_CONFIGS and registers them.
    Also removes apps from APP_CONFIGS that no longer exist on disk.
    """
    # 1. Scan disk for current valid apps
    disk_apps = {}
    for conf_file in SAUS_APPS_PATH.rglob(APPS_CONFIG_FILE):
        app_dir = conf_file.parent
        conf = _load_config(conf_file)
        url = conf.get('url')
        if url:
            disk_apps[url] = (app_dir, conf)

    # 2. Remove stale entries from APP_CONFIGS
    disk_urls = set(disk_apps.keys())
    current_urls = {c.get('url') for c in APP_CONFIGS}
    
    for i in range(len(APP_CONFIGS) - 1, -1, -1):
        if APP_CONFIGS[i].get('url') not in disk_urls:
            removed = APP_CONFIGS.pop(i)           

    # 3. Add new apps
    for url, (app_dir, conf) in disk_apps.items():
        if url not in current_urls:
            try:
                rel_path = app_dir.relative_to(SAUS_APPS_PATH)
                conf['app_type'] = rel_path.parts[0] if len(rel_path.parts) > 1 else 'open'
            except Exception:
                conf['app_type'] = 'open'

            try:
                # Note: Adding routes dynamically works, but removing them is not supported by aiohttp.
                # Stale routes will remain active until restart, but they won't appear in the UI list.
                app.add_routes(RouteManager.create_routes(f"{url}", app_dir))
                APP_CONFIGS.append(conf)
                logger.info(f"{SAUSMSG}: Dynamically registered new app: {url}")
            except Exception as e:
                logger.error(f"{SAUSMSG}: Error registering new app {url}: {e}")
async def sync_apps_handler(request: web.Request) -> web.Response:
    try:
        await asyncio.to_thread(download_update_apps, True)
        
        # Dynamically refresh apps in the app without requiring a restart
        refresh_apps(request.app)
        
        return web.json_response({"status": "success", "message": "Apps synced successfully."})
    except Exception as e:
        logger.error(f"{SAUSMSG}: Error syncing apps: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)
