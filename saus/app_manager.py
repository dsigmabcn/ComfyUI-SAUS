''' General routing of the apps '''
import json
from pathlib import Path
from aiohttp import web
from typing import Dict, Any
from .constants import (
    SAUS_APPS_PATH, CORE_PATH, BUILDER_PATH, SAUS_BROWSER_PATH, MODEL_MANAGER_PATH, APP_CONFIGS, SAUSMSG, APPS_CONFIG_FILE, logger, FILE_MANAGER_PATH, ARC_MANAGER_PATH
)
from .route_manager import RouteManager
from .downloader import sync_apps_handler
from .file_system import (
    directory_listing_handler, rename_file_handler, delete_file_handler, upload_file_handler,
    download_file_handler, upload_chunk_handler, list_input_files_handler,
    get_logs_handler
)
from .management import (
    apps_handler, extension_node_map_handler,
    install_package_handler, update_package_handler, uninstall_package_handler,
    installed_custom_nodes_handler, preview_app_handler,
    reset_preview_handler, create_app_handler, update_app_handler, delete_app_handler,
    get_apps_list_handler, get_architectures_handler, get_model_data_handler
)
from .downloads import (
    download_generic_handler, download_model_handler, check_model_status_handler,
    delete_model_handler
)
from .system import (
    saus_version_handler, set_model_preview_handler, clear_model_preview_handler,
    list_model_previews_handler, get_model_preview_handler, get_settings_handler,
    save_settings_handler, restart_server_handler
)
from .arc_manager_handler import get_all_arc_data_handler, save_all_arc_data_handler, get_available_apps_handler

class AppManager:
    @staticmethod
    def setup_app_routes(app: web.Application) -> None:
        try:
            AppManager._setup_apps_routes(app)
            
            AppManager._setup_core_routes(app)
            
            AppManager._setup_api_routes(app)
            
            AppManager._setup_additional_routes(app)

        except Exception as e:
            logger.error(f"{SAUSMSG}: Failed to set up routes: {e}")

    @staticmethod
    def _setup_apps_routes(app: web.Application) -> None:
        for app_dir in filter(lambda d: d.is_dir(), SAUS_APPS_PATH.iterdir()):
            conf_file = app_dir / APPS_CONFIG_FILE
            if not conf_file.is_file():
                # logger.warning(f"{SAUSMSG}: Config file not found in {app_dir}")
                continue
                
        for conf_file in SAUS_APPS_PATH.rglob(APPS_CONFIG_FILE):
            app_dir = conf_file.parent
            conf = AppManager._load_config(conf_file)
            SAUS_url = conf.get('url')
            if not SAUS_url:
                logger.warning(f"{SAUSMSG}: Missing 'url' in config for {app_dir}")
                continue
            
            try:
                rel_path = app_dir.relative_to(SAUS_APPS_PATH)
                if len(rel_path.parts) > 1:
                    conf['app_type'] = rel_path.parts[0]
                else:
                    conf['app_type'] = 'open'
            except Exception:
                conf['app_type'] = 'open'
                
            app.add_routes(RouteManager.create_routes(f"saus/{SAUS_url}", app_dir))
            APP_CONFIGS.append(conf)

    @staticmethod
    def _setup_core_routes(app: web.Application) -> None:
        if CORE_PATH.is_dir():
            app.router.add_static('/core/', path=CORE_PATH, name='core')

    @staticmethod
    def _setup_api_routes(app: web.Application) -> None:
        api_routes = [
            (f'/saus/api/apps', 'GET', apps_handler),
            (f'/saus/api/extension-node-map', 'GET', extension_node_map_handler),
            (f'/saus/api/install-package', 'POST', install_package_handler),
            (f'/saus/api/update-package', 'POST', update_package_handler),
            (f'/saus/api/uninstall-package', 'POST', uninstall_package_handler),
            (f'/saus/api/saus-version', 'GET', saus_version_handler),
            (f'/saus/api/installed-custom-nodes', 'GET', installed_custom_nodes_handler),
            (f'/saus/api/preview-app', 'POST', preview_app_handler),
            (f'/saus/api/reset-preview', 'POST', reset_preview_handler),
            (f'/saus/api/create-app', 'POST', create_app_handler),
            (f'/saus/api/update-app', 'POST', update_app_handler),
            (f'/saus/api/delete-app', 'DELETE', delete_app_handler),
            (f'/saus/api/model-preview', 'POST', set_model_preview_handler),
            (f'/saus/api/model-preview', 'DELETE', clear_model_preview_handler),
            (f'/saus/api/model-previews', 'POST', list_model_previews_handler),
            (f'/saus/api/model-preview', 'GET', get_model_preview_handler),
            (f"/saus/api/directory", "GET", directory_listing_handler),
            (f'/saus/api/download', 'POST', download_generic_handler),
            (f'/saus/api/rename-file', 'POST', rename_file_handler),
            (f'/saus/api/delete-file', 'POST', delete_file_handler),
            (f'/saus/api/upload', 'POST', upload_file_handler),
            (f'/saus/api/apps-list', 'GET', get_apps_list_handler),
            (f'/saus/api/download-file', 'GET', download_file_handler),
            (f'/saus/api/upload-chunk', 'POST', upload_chunk_handler),
            (f'/saus/api/architectures', 'GET', get_architectures_handler),
            (f'/saus/api/data-model-info', 'GET', get_model_data_handler),
            (f'/saus/api/model-status', 'GET', check_model_status_handler),
            (f'/saus/api/delete-model', 'DELETE', delete_model_handler),
            (f'/saus/api/download-model', 'POST', download_model_handler),
            (f'/saus/api/settings', 'GET', get_settings_handler),
            (f'/saus/api/settings', 'POST', save_settings_handler),
            (f'/saus/api/sync-apps', 'POST', sync_apps_handler),
            (f'/saus/api/restart', 'POST', restart_server_handler),
            (f'/saus/api/files/input', 'GET', list_input_files_handler),
            (f'/saus/api/logs', 'GET', get_logs_handler),          
            (f'/saus/api/arc-manager/data', 'GET', get_all_arc_data_handler),
            (f'/saus/api/arc-manager/data', 'POST', save_all_arc_data_handler),
            (f'/saus/api/arc-manager/available-apps', 'GET', get_available_apps_handler),

        ]

        for path, method, handler in api_routes:
            if method == 'GET':
                app.router.add_get(path, handler)
            elif method == 'POST':
                app.router.add_post(path, handler)
            elif method == 'DELETE':
                app.router.add_delete(path, handler)

    @staticmethod
    def _setup_additional_routes(app: web.Application) -> None:
        if BUILDER_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('saus/builder', BUILDER_PATH))
        if SAUS_BROWSER_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('saus', SAUS_BROWSER_PATH))
        else:
            logger.error(f"{SAUSMSG}: SAUS Browser path not found at {SAUS_BROWSER_PATH}")
        if MODEL_MANAGER_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('saus/model_manager', MODEL_MANAGER_PATH))
        if ARC_MANAGER_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('saus/arc_manager', ARC_MANAGER_PATH))
        if FILE_MANAGER_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('saus/file_manager', FILE_MANAGER_PATH)) #Added for FILE_MANAGER

    @staticmethod
    def _load_config(conf_file: Path) -> Dict[str, Any]:
        try:
            with conf_file.open('r') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"{SAUSMSG}: Invalid JSON in {conf_file}: {e}")
            return {}
        except Exception as e:
            logger.error(f"{SAUSMSG}: Error loading config from {conf_file}: {e}")
            return {}