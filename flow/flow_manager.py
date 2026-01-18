import json
from pathlib import Path
from aiohttp import web
from typing import Dict, Any
from .constants import (
    FLOWS_PATH, CORE_PATH, LINKER_PATH, FLOW_PATH, MODEL_MANAGER_PATH, APP_CONFIGS, FLOWMSG, FLOWS_CONFIG_FILE, logger, FILE_MANAGER_PATH
)
from .route_manager import RouteManager
from .api_handlers import (
    list_themes_handler, get_theme_css_handler, flow_version_handler,
    apps_handler, extension_node_map_handler,
    install_package_handler, update_package_handler, uninstall_package_handler,
    installed_custom_nodes_handler, preview_flow_handler,
    reset_preview_handler, create_flow_handler, update_flow_handler, delete_flow_handler,
    set_model_preview_handler,
    clear_model_preview_handler,
    list_model_previews_handler,
    get_model_preview_handler,
    directory_listing_handler,
    download_model_handler,
    rename_file_handler,
    delete_file_handler,
    upload_file_handler,
    get_flows_list_handler,
    download_file_handler,
    upload_chunk_handler,
    get_architectures_handler,
    get_model_data_handler,
    check_model_status_handler, delete_model_handler, download_model_handler #Used in model manager for the cards
)

class FlowManager:
    @staticmethod
    def setup_app_routes(app: web.Application) -> None:
        try:
            FlowManager._setup_flows_routes(app)
            
            FlowManager._setup_core_routes(app)
            
            FlowManager._setup_api_routes(app)
            
            FlowManager._setup_additional_routes(app)

        except Exception as e:
            logger.error(f"{FLOWMSG}: Failed to set up routes: {e}")

    @staticmethod
    def _setup_flows_routes(app: web.Application) -> None:
        for flow_dir in filter(lambda d: d.is_dir(), FLOWS_PATH.iterdir()):
            conf_file = flow_dir / FLOWS_CONFIG_FILE
            if not conf_file.is_file():
                # logger.warning(f"{FLOWMSG}: Config file not found in {flow_dir}")
                continue
                
        for conf_file in FLOWS_PATH.rglob(FLOWS_CONFIG_FILE):
            flow_dir = conf_file.parent
            conf = FlowManager._load_config(conf_file)
            flow_url = conf.get('url')
            if not flow_url:
                logger.warning(f"{FLOWMSG}: Missing 'url' in config for {flow_dir}")
                continue
                
            app.add_routes(RouteManager.create_routes(f"flow/{flow_url}", flow_dir))
            APP_CONFIGS.append(conf)

    @staticmethod
    def _setup_core_routes(app: web.Application) -> None:
        if CORE_PATH.is_dir():
            app.router.add_get('/core/css/themes/list', list_themes_handler)
            app.router.add_get('/core/css/themes/{filename}', get_theme_css_handler)
            app.router.add_static('/core/', path=CORE_PATH, name='core')

    @staticmethod
    def _setup_api_routes(app: web.Application) -> None:
        api_routes = [
            (f'/flow/api/apps', 'GET', apps_handler),
            (f'/flow/api/extension-node-map', 'GET', extension_node_map_handler),
            (f'/flow/api/install-package', 'POST', install_package_handler),
            (f'/flow/api/update-package', 'POST', update_package_handler),
            (f'/flow/api/uninstall-package', 'POST', uninstall_package_handler),
            (f'/flow/api/flow-version', 'GET', flow_version_handler),
            (f'/flow/api/installed-custom-nodes', 'GET', installed_custom_nodes_handler),
            (f'/flow/api/preview-flow', 'POST', preview_flow_handler),
            (f'/flow/api/reset-preview', 'POST', reset_preview_handler),
            (f'/flow/api/create-flow', 'POST', create_flow_handler),
            (f'/flow/api/update-flow', 'POST', update_flow_handler),
            (f'/flow/api/delete-flow', 'DELETE', delete_flow_handler),
            (f'/flow/api/model-preview', 'POST', set_model_preview_handler),
            (f'/flow/api/model-preview', 'DELETE', clear_model_preview_handler),
            (f'/flow/api/model-previews', 'POST', list_model_previews_handler),
            (f'/flow/api/model-preview', 'GET', get_model_preview_handler),
            (f"/flow/api/directory", "GET", directory_listing_handler),
            (f'/flow/api/download', 'POST', download_model_handler),
            (f'/flow/api/rename-file', 'POST', rename_file_handler),
            (f'/flow/api/delete-file', 'POST', delete_file_handler),
            (f'/flow/api/upload', 'POST', upload_file_handler),
            (f'/flow/api/flows-list', 'GET', get_flows_list_handler),
            (f'/flow/api/download-file', 'GET', download_file_handler),
            (f'/flow/api/upload-chunk', 'POST', upload_chunk_handler),
            (f'/flow/api/architectures', 'GET', get_architectures_handler),
            (f'/flow/api/data-model-info', 'GET', get_model_data_handler),
            (f'/flow/api/model-status', 'GET', check_model_status_handler),
            (f'/flow/api/delete-model', 'DELETE', delete_model_handler),
            (f'/flow/api/download-model', 'POST', download_model_handler),

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
        if LINKER_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('flow/linker', LINKER_PATH))
        if FLOW_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('flow', FLOW_PATH))
        if MODEL_MANAGER_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('flow/model_manager', MODEL_MANAGER_PATH))
        if FILE_MANAGER_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('flow/file_manager', FILE_MANAGER_PATH)) #Added for FILE_MANAGER

    @staticmethod
    def _load_config(conf_file: Path) -> Dict[str, Any]:
        try:
            with conf_file.open('r') as f:
                return json.load(f)
        except json.JSONDecodeError as e:
            logger.error(f"{FLOWMSG}: Invalid JSON in {conf_file}: {e}")
            return {}
        except Exception as e:
            logger.error(f"{FLOWMSG}: Error loading config from {conf_file}: {e}")
            return {}
        
        