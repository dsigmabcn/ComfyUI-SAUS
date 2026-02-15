from aiohttp import web
import json
from .constants import SAUS_BROWSER_PATH, SAUSMSG, logger, SAUS_APPS_PATH, APPS_CONFIG_FILE

SAUS_BROWSER_DATA_PATH = SAUS_BROWSER_PATH / "data"
APP_LIST_PATH = SAUS_BROWSER_DATA_PATH / "app_list.json"
ARCHITECTURES_PATH = SAUS_BROWSER_DATA_PATH / "architectures.json"
MODELS_DATA_PATH = SAUS_BROWSER_DATA_PATH / "models_data.json"

async def get_all_arc_data_handler(request):
    """
    Handler to fetch data from all three JSON configuration files.
    """
    try:
        with open(APP_LIST_PATH, 'r', encoding='utf-8') as f:
            app_list = json.load(f)
        with open(ARCHITECTURES_PATH, 'r', encoding='utf-8') as f:
            architectures = json.load(f)
        with open(MODELS_DATA_PATH, 'r', encoding='utf-8') as f:
            models_data = json.load(f)

        return web.json_response({
            "apps": app_list,
            "architectures": architectures,
            "models": models_data
        })
    except FileNotFoundError as e:
        logger.error(f"{SAUSMSG}: Configuration file not found: {e}")
        return web.Response(status=404, text=f"Configuration file not found: {e}")
    except Exception as e:
        logger.error(f"{SAUSMSG}: Error reading configuration files: {e}")
        return web.Response(status=500, text=f"Error reading configuration files: {e}")

async def save_all_arc_data_handler(request):
    """
    Handler to save updated data to all three JSON configuration files.
    """
    try:
        data = await request.json()
        
        app_list = data.get("apps")
        architectures = data.get("architectures")
        models_data = data.get("models")

        if app_list is None or architectures is None or models_data is None:
            return web.Response(status=400, text="Invalid data format. 'apps', 'architectures', and 'models' keys are required.")

        with open(APP_LIST_PATH, 'w', encoding='utf-8') as f:
            json.dump(app_list, f, indent=2)
        with open(ARCHITECTURES_PATH, 'w', encoding='utf-8') as f:
            json.dump(architectures, f, indent=2)
        with open(MODELS_DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(models_data, f, indent=2)

        return web.json_response({"status": "success", "message": "All configurations saved successfully."})
    except json.JSONDecodeError as e:
        logger.error(f"{SAUSMSG}: Invalid JSON received for saving: {e}")
        return web.Response(status=400, text=f"Invalid JSON format received: {e}")
    except Exception as e:
        logger.error(f"{SAUSMSG}: Error saving configuration files: {e}")
        return web.Response(status=500, text=f"Error saving configuration files: {e}")

async def get_available_apps_handler(request):
    try:
        apps = set()
        for conf_file in SAUS_APPS_PATH.rglob(APPS_CONFIG_FILE):
            apps.add(conf_file.parent.name)
        return web.json_response({"apps": sorted(list(apps))})
    except Exception as e:
        logger.error(f"{SAUSMSG}: Error scanning apps: {e}")
        return web.Response(status=500, text=f"Error scanning apps: {e}")
