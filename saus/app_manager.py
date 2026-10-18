''' General routing of the apps '''
import re
import json
from pathlib import Path
from aiohttp import web
from typing import Dict, Any
from .constants import (
    SAUS_APPS_PATH, CORE_PATH, SAUS_BROWSER_PATH, APP_CONFIGS, SAUSMSG, APPS_CONFIG_FILE, logger, FILE_MANAGER_PATH,
    APP_PAGE_TEMPLATE
)
from .route_manager import RouteManager
from .static_cache import install as install_revalidate_middleware
from .file_system import (
    directory_listing_handler, rename_file_handler, delete_file_handler,
    download_file_handler, upload_chunk_handler, list_input_files_handler,
    get_logs_handler, thumbnail_handler, move_copy_handler
)
from .management import (
    apps_handler,
    get_architectures_handler,
    get_taxonomy_handler, get_models_registry_handler, get_app_models_handler
)
from .downloads import (
    download_generic_handler, download_model_handler, check_model_status_handler,
    check_model_status_batch_handler, delete_model_handler
)
from .system import (
    saus_version_handler, restart_server_handler
)

# aiohttp serves static files without a Cache-Control header, which leaves a
# browser free to reuse its own copy for a while (heuristic caching). A changed
# CSS or HTML file could then stay invisible until a hard refresh, so an update
# to the shell looked like it "did not arrive". The middleware in static_cache
# makes those responses revalidate (see that module).
class AppManager:
    # An app's folder name comes from its appConfig.json, which may be hand
    # edited or shipped by somebody else. Only accept the characters the builder
    # allows before using it as a route path / folder name.
    SAFE_APP_URL_REGEX = re.compile(r'^[\w\-]+$')

    @staticmethod
    def setup_app_routes(app: web.Application) -> None:
        try:
            AppManager._setup_revalidate_middleware(app)

            AppManager._setup_apps_routes(app)
            
            AppManager._setup_core_routes(app)
            
            AppManager._setup_api_routes(app)
            
            AppManager._setup_additional_routes(app)

        except Exception as e:
            logger.error(f"{SAUSMSG}: Failed to set up routes: {e}")

    @staticmethod
    def _setup_revalidate_middleware(app: web.Application) -> None:
        """Serve the shell's own files with Cache-Control: no-cache."""
        try:
            install_revalidate_middleware(app)
        except Exception as e:
            # A frozen application (setup after startup) keeps serving; only the
            # revalidation is lost, so never let this break the routes.
            logger.warning(f"{SAUSMSG}: Could not add the static revalidation middleware: {e}")

    @staticmethod
    def _setup_apps_routes(app: web.Application) -> None:
        for conf_file in SAUS_APPS_PATH.rglob(APPS_CONFIG_FILE):
            app_dir = conf_file.parent
            conf = AppManager._load_config(conf_file)
            SAUS_url = conf.get('url')
            if not SAUS_url:
                logger.warning(f"{SAUSMSG}: Missing 'url' in config for {app_dir}")
                continue

            if not AppManager.SAFE_APP_URL_REGEX.match(str(SAUS_url)):
                logger.warning(
                    f"{SAUSMSG}: Skipping {conf_file}: unsafe 'url' {SAUS_url!r} "
                    "(only letters, numbers, dashes and underscores are allowed)"
                )
                continue

            app.add_routes(RouteManager.create_routes(f"saus/{SAUS_url}", app_dir, APP_PAGE_TEMPLATE))
            APP_CONFIGS.append(conf)

    @staticmethod
    def _setup_core_routes(app: web.Application) -> None:
        if CORE_PATH.is_dir():
            app.router.add_static('/core/', path=CORE_PATH, name='core')

    @staticmethod
    def _setup_api_routes(app: web.Application) -> None:
        api_routes = [
            (f'/saus/api/apps', 'GET', apps_handler),
            (f'/saus/api/saus-version', 'GET', saus_version_handler),
            (f"/saus/api/directory", "GET", directory_listing_handler),
            (f'/saus/api/thumbnail', 'GET', thumbnail_handler),
            (f'/saus/api/move-file', 'POST', move_copy_handler),
            (f'/saus/api/download', 'POST', download_generic_handler),
            (f'/saus/api/rename-file', 'POST', rename_file_handler),
            (f'/saus/api/delete-file', 'POST', delete_file_handler),
            (f'/saus/api/download-file', 'GET', download_file_handler),
            (f'/saus/api/upload-chunk', 'POST', upload_chunk_handler),
            (f'/saus/api/architectures', 'GET', get_architectures_handler),
            (f'/saus/api/taxonomy', 'GET', get_taxonomy_handler),
            (f'/saus/api/models', 'GET', get_models_registry_handler),
            (f'/saus/api/app-models', 'GET', get_app_models_handler),
            (f'/saus/api/model-status', 'GET', check_model_status_handler),
            (f'/saus/api/model-status-batch', 'POST', check_model_status_batch_handler),
            (f'/saus/api/delete-model', 'DELETE', delete_model_handler),
            (f'/saus/api/download-model', 'POST', download_model_handler),
            (f'/saus/api/restart', 'POST', restart_server_handler),
            (f'/saus/api/files/input', 'GET', list_input_files_handler),
            (f'/saus/api/logs', 'GET', get_logs_handler),
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
        if SAUS_BROWSER_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('saus', SAUS_BROWSER_PATH))
        else:
            logger.error(f"{SAUSMSG}: SAUS Browser path not found at {SAUS_BROWSER_PATH}")
        if FILE_MANAGER_PATH.is_dir():
            app.add_routes(RouteManager.create_routes('saus/file_manager', FILE_MANAGER_PATH))

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