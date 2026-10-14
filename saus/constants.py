import logging
import mimetypes
from pathlib import Path

APP_NAME = "SAUS"

CURRENT_DIR = Path(__file__).parent
ROOT_DIR = CURRENT_DIR.parent

def _get_app_version():
    """Reads the version from the local pyproject.toml file."""
    try:
        pyproject_path = ROOT_DIR / "pyproject.toml"
        if pyproject_path.exists():
            with open(pyproject_path, 'r', encoding='utf-8') as f:
                for line in f:
                    if line.strip().startswith("version"):
                        parts = line.split('=')
                        if len(parts) > 1:
                            return parts[1].strip().strip('"\'')
    except Exception:
        # Fallback if something goes wrong, so the app doesn't crash on startup.
        pass
    return "0.0.0" # Fallback version

APP_VERSION = _get_app_version()
SAUSMSG = f"\033[38;5;208mSAUS App - {APP_VERSION}\033[0m"
APP_CONFIGS = []

WEBROOT = ROOT_DIR / "web"
CORE_PATH = WEBROOT / "core"
SAUS_BROWSER_PATH = WEBROOT / "saus_browser"
SAUS_APPS_PATH = WEBROOT / "apps"

MODEL_MANAGER_PATH = WEBROOT / "model_manager"#Added to access the new model manager app - NOT ACTIVE, TO BE REPLACED BY LORA MANAGER IN FUTURE VERSIONS
FILE_MANAGER_PATH = WEBROOT / "file_manager" #Added for file_manager application
WEB_DIRECTORY = "web/core/js/common/scripts"

COMFYUI_DIRECTORY = ROOT_DIR.parent.parent
#added constant to point to the Models directory in the api handlers
MODELS_DIRECTORY = COMFYUI_DIRECTORY / "models"
INPUT_FILES_DIRECTORY = COMFYUI_DIRECTORY / "input"
OUTPUT_FILES_DIRECTORY = COMFYUI_DIRECTORY / "output"
COMFUI_LOGS_PATH = COMFYUI_DIRECTORY / "user" / "comfyui.log"

# The only folders the file/upload/rename/delete API may touch. Everything is
# validated with realpath + commonpath against these roots.
ALLOWED_FILE_ROOTS = (INPUT_FILES_DIRECTORY, OUTPUT_FILES_DIRECTORY, MODELS_DIRECTORY)

#Previously in api_handlers
DATA_DIR = Path(__file__).parent / "data"
PREVIEWS_REGISTRY_DIR = DATA_DIR / "model_previews_registry"
PREVIEWS_IMAGES_DIR = DATA_DIR / "model_previews"
# Paths for the file manager
FILE_REGISTRY_DIR = DATA_DIR / "file_registry"
FILE_IMAGES_DIR = DATA_DIR / "file_previews"


# Uploads land in user-data folders only, but we still refuse anything that
# could be imported/executed by the server (scripts, native libraries, ...).
BLOCKED_UPLOAD_EXTENSIONS = {
    'py', 'pyc', 'pyo', 'pyw', 'pyd', 'so', 'dll', 'dylib', 'exe', 'msi',
    'bat', 'cmd', 'com', 'scr', 'sh', 'bash', 'zsh', 'ksh', 'csh', 'ps1',
    'psm1', 'vbs', 'vbe', 'js', 'mjs', 'cjs', 'jar', 'class', 'php', 'pl',
    'rb', 'lua', 'htaccess', 'service', 'desktop',
}
mimetypes.add_type('application/javascript', '.js')
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
APPS_CONFIG_FILE = 'appConfig.json'

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
