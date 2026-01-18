import logging
import mimetypes
from pathlib import Path
import re
APP_NAME = "Flow"
APP_VERSION = "0.5.2" 
FLOWMSG = f"\033[38;5;129mFlow - {APP_VERSION}\033[0m"
APP_CONFIGS = []

CURRENT_DIR = Path(__file__).parent
ROOT_DIR = CURRENT_DIR.parent
WEBROOT = ROOT_DIR / "web"
CORE_PATH = WEBROOT / "core"
FLOW_PATH = WEBROOT / "flow"
FLOWS_PATH = WEBROOT / "flows"
LINKER_PATH = WEBROOT / "linker"
#Added to access the new model manager app
MODEL_MANAGER_PATH = WEBROOT / "model_manager"
FILE_MANAGER_PATH = WEBROOT / "file_manager" #Added for file_manager application
CUSTOM_THEMES_DIR = WEBROOT / 'custom-themes'
WEB_DIRECTORY = "web/core/js/common/scripts"

CUSTOM_NODES_DIR = ROOT_DIR.parent
EXTENSION_NODE_MAP_PATH = ROOT_DIR.parent / "ComfyUI-Manager" / "extension-node-map.json"
#added constant to point to the Models directory in the api handlers
MODELS_DIRECTORY = CUSTOM_NODES_DIR.parent / "models"
INPUT_FILES_DIRECTORY = CUSTOM_NODES_DIR.parent / "input"
OUTPUT_FILES_DIRECTORY = CUSTOM_NODES_DIR.parent / "output"
COMFYUI_DIRECTORY = CUSTOM_NODES_DIR.parent
#Previously in api_handlers
DATA_DIR = Path(__file__).parent / "data"
PREVIEWS_REGISTRY_DIR = DATA_DIR / "model_previews_registry"
PREVIEWS_IMAGES_DIR = DATA_DIR / "model_previews"
# Paths for the file manager
FILE_REGISTRY_DIR = DATA_DIR / "file_registry"
FILE_IMAGES_DIR = DATA_DIR / "file_previews"


#FLOWS_DOWNLOAD_PATH = 'https://github.com/diStyApps/flows_lib' #ORIGINAL CODE
#FLOWS_DOWNLOAD_PATH = 'https://github.com/dsigmabcn/lib_WanVACE_flows' #VACE REPO
FLOWS_DOWNLOAD_PATH = 'https://github.com/dsigmabcn/lib_all_flows' #APP REPO


SAFE_FOLDER_NAME_REGEX = re.compile(r'^[\w\-]+$')
ALLOWED_EXTENSIONS = {'css'}
mimetypes.add_type('application/javascript', '.js')
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
FLOWS_CONFIG_FILE = 'flowConfig.json'
FLOWS_TO_REMOVE = [
    "afl_CogVideoX-Fun-i2v-es",
    "afl_CogVideoX-Fun-i2v",
    "afl_MimicMotioni2v",
    "afl_abase",
    "afl_abasei2i",
    "afl_abasesd35t3v",
    "afl_abasevea",
    "afl_abaseveai2i",
    "afl_base-fluxd_at2i",
    "afl_base-fluxdggufi2i",
    "afl_base-fluxdgguft2i",
    "afl_base-fluxdi2i",
    "afl_base-fluxs_ai2t",
    "afl_base-fluxsi2i",
    "afl_baseAD",
    "afl_baseAdLcm",
    "afl_cogvidx_at2v",
    "afl_cogvidxi2v",
    "afl_cogvidxinteri2v",
    "afl_flowup",
    "afl_flux_dev",
    "afl_flux_dev_lora",
    "afl_genfill",
    "afl_ipivsMorph",
    "afl_mochi2v",
    "afl_pulid_flux",
    "afl_pulid_flux_GGUF",
    "afl_reactor"
    "5otvy-cogvideox-orbit-left-lora",
    "umbi9-hunyuan-text-to-video",
]

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
