import subprocess
import os
import re
import json
import shutil
import sys
from pathlib import Path
from aiohttp import web
from io import BytesIO
from PIL import Image

from .constants import (
    APP_CONFIGS, EXTENSION_NODE_MAP_PATH,
    CUSTOM_NODES_DIR, SAUSMSG, logger,
    SAFE_FOLDER_NAME_REGEX, APPS_CONFIG_FILE, CORE_PATH, WEBROOT,
    SAUS_BROWSER_PATH
)
from .helpers import find_app_path, remove_readonly

async def apps_handler(request: web.Request) -> web.Response:
    return web.json_response(APP_CONFIGS)

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

async def preview_app_handler(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
        app_config = None
        wf_file = None
        thumbnail_data = None
        thumbnail_extension = None

        while True:
            part = await reader.next()
            if part is None:
                break

            if part.name == 'appConfig':
                app_config_content = await part.read(decode=True)
                try:
                    app_config = json.loads(app_config_content)
                except json.JSONDecodeError:
                    return web.Response(status=400, text="Invalid JSON format in 'appConfig'")
                
                SAUS_url = app_config.get('url', None)
                if not SAUS_url:
                    return web.Response(status=400, text="Missing 'url' in 'appConfig'")

            elif part.name == 'wf':
                wf_file = await part.read(decode=False)

            elif part.name == 'thumbnail':
                thumbnail_str = await part.text()
                match = re.match(r'data:(image/\w+);base64,(.+)', thumbnail_str)
                if match:
                    mime_type = match.group(1)
                    base64_data = match.group(2)
                    thumbnail_extension = mime_type.split('/')[1]

                    try:
                        thumbnail_data = base64.b64decode(base64_data)
                    except base64.binascii.Error:
                        return web.Response(status=400, text="Invalid Base64 encoding in 'thumbnail'")
                else:
                    return web.Response(status=400, text="Invalid data URL format for 'thumbnail'")

        if not app_config or not wf_file:
            return web.Response(status=400, text="Missing 'appConfig' or 'wf' in request")

        app_id = "builder"
        if not app_id:
            return web.Response(status=400, text="Missing 'id' in request body")

        if not SAFE_FOLDER_NAME_REGEX.match(app_id):
            return web.Response(status=400, text="Invalid 'app_id'. Only letters, numbers, dashes, and underscores are allowed.")

        SAUS_BROWSER_PATH = WEBROOT / app_id
        if not SAUS_BROWSER_PATH.exists():
            return web.Response(status=404, text=f"App directory '{app_id}' not found")

        config_path = SAUS_BROWSER_PATH / APPS_CONFIG_FILE
        with config_path.open('w', encoding='utf-8') as f:
            json.dump(app_config, f, indent=2)

        if wf_file:
            wf_json_path = SAUS_BROWSER_PATH / 'wf.json'
            with wf_json_path.open('wb') as f:
                f.write(wf_file)

        if thumbnail_data and thumbnail_extension:
            thumbnail_filename = f"thumbnail.{thumbnail_extension}"
            thumbnail_path = SAUS_BROWSER_PATH / thumbnail_filename
            with thumbnail_path.open('wb') as f:
                f.write(thumbnail_data)
            app_config['thumbnail'] = thumbnail_filename
            with config_path.open('w', encoding='utf-8') as f:
                json.dump(app_config, f, indent=2)

            logger.info(f"Thumbnail saved as '{thumbnail_filename}' in app '{app_id}'")

        return web.json_response({
            'status': 'success',
            'message': f"Configuration for previewing app '{app_id}' saved successfully.",
            'thumbnail': f"thumbnail.{thumbnail_extension}" if thumbnail_extension else None
        })

    except Exception as e:
        logger.error(f"{SAUSMSG}: Error saving configuration: {e}")
        return web.Response(status=500, text=f"{SAUSMSG}: Error saving configuration: {str(e)}")

async def reset_preview_handler(request: web.Request) -> web.Response:
    try:
        app_id = "builder"
        SAUS_BROWSER_PATH = WEBROOT / app_id

        if not SAUS_BROWSER_PATH.exists():
            return web.Response(status=404, text=f"App directory '{app_id}' not found")

        defwf_path = SAUS_BROWSER_PATH / 'defwf.json'
        wf_path = SAUS_BROWSER_PATH / 'wf.json'
        def_app_config_path = SAUS_BROWSER_PATH / 'defFlowConfig.json'
        app_config_path = SAUS_BROWSER_PATH / APPS_CONFIG_FILE

        if not defwf_path.exists():
            return web.Response(status=404, text=f"Default workflow file 'defwf.json' not found in '{app_id}'")

        if not def_app_config_path.exists():
            return web.Response(status=404, text=f"Default app configuration file 'defFlowConfig.json' not found in '{app_id}'")

        shutil.copy2(defwf_path, wf_path)
        shutil.copy2(def_app_config_path, app_config_path)

        logger.info(f"{SAUSMSG}: Preview reset successfully for app '{app_id}'.")
        return web.json_response({
            'status': 'success',
            'message': f"Preview has been reset successfully for app '{app_id}'."
        })

    except Exception as e:
        logger.error(f"{SAUSMSG}: Error resetting preview: {e}")
        return web.Response(status=500, text=f"{SAUSMSG}: Error resetting preview: {str(e)}")

async def create_app_handler(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
        app_config = None
        wf_file = None
        SAUS_url = None
        thumbnail_data = None

        while True:
            part = await reader.next()
            if part is None:
                break

            if part.name == 'appConfig':
                app_config_content = await part.read(decode=True)
                try:
                    app_config = json.loads(app_config_content)
                except json.JSONDecodeError:
                    return web.Response(status=400, text="Invalid JSON format in 'appConfig'")
                
                SAUS_url = app_config.get('url', None)
                if not SAUS_url:
                    return web.Response(status=400, text="Missing 'url' in 'appConfig'")

            elif part.name == 'wf':
                wf_file = await part.read(decode=False)

            elif part.name == 'thumbnail':
                thumbnail_str = await part.text()
                match = re.match(r'data:(image/\w+);base64,(.+)', thumbnail_str)
                if match:
                    mime_type = match.group(1)
                    base64_data = match.group(2)
                    try:
                        thumbnail_bytes = base64.b64decode(base64_data)
                        image = Image.open(BytesIO(thumbnail_bytes))
                        if image.mode in ("RGBA", "P"):
                            image = image.convert("RGB")
                        width_percent = (468 / float(image.size[0]))
                        new_height = int((float(image.size[1]) * float(width_percent)))
                        image = image.resize((468, new_height), Image.Resampling.LANCZOS)
                        buffered = BytesIO()
                        image.save(buffered, format="JPEG")
                        thumbnail_data = buffered.getvalue()
                    except Exception as e:
                        logger.error(f"{SAUSMSG}: Error processing thumbnail: {e}")
                        return web.Response(status=400, text="Invalid image data in 'thumbnail'")
                else:
                    return web.Response(status=400, text="Invalid data URL format for 'thumbnail'")

        if not app_config or not wf_file:
            return web.Response(status=400, text="Missing 'appConfig' or 'wf' in request")

        if not SAFE_FOLDER_NAME_REGEX.match(SAUS_url):
            return web.Response(status=400, text="Invalid 'url' in 'appConfig'. Only letters, numbers, dashes, and underscores are allowed.")

        if find_app_path(SAUS_url):
            return web.Response(status=400, text=f"App with url '{SAUS_url}' already exists")

        from .constants import SAUS_APPS_PATH
        app_folder = SAUS_APPS_PATH / 'user' / SAUS_url
        app_folder.parent.mkdir(parents=True, exist_ok=True)
        app_folder.mkdir(parents=True, exist_ok=False)

        app_config_path = app_folder / APPS_CONFIG_FILE
        with app_config_path.open('w', encoding='utf-8') as f:
            json.dump(app_config, f, indent=2)

        wf_json_path = app_folder / 'wf.json'
        with wf_json_path.open('wb') as f:
            f.write(wf_file)

        if thumbnail_data:
            media_folder = app_folder / 'media'
            media_folder.mkdir(exist_ok=True)
            thumbnail_filename = "thumbnail.jpg"
            thumbnail_path = media_folder / thumbnail_filename
            with thumbnail_path.open('wb') as f:
                f.write(thumbnail_data)

            with app_config_path.open('w', encoding='utf-8') as f:
                json.dump(app_config, f, indent=2)

            logger.info(f"Thumbnail saved as '{thumbnail_filename}' in app '{SAUS_url}'")

        index_template_path = CORE_PATH / 'templates' / 'index.html'
        if not index_template_path.exists():
            return web.Response(status=500, text="Template 'index.html' not found")
        
        index_destination_path = app_folder / 'index.html'
        shutil.copy2(index_template_path, index_destination_path)

        logger.info(f"{SAUSMSG}: App '{SAUS_url}' created successfully.")
        return web.json_response({'status': 'success', 'message': f"App '{SAUS_url}' created successfully."})

    except Exception as e:
        logger.error(f"{SAUSMSG}: Error creating app: {e}")
        return web.Response(status=500, text=f"{SAUSMSG}: Error creating app: {str(e)}")

async def update_app_handler(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
        app_config = None
        wf_file = None
        SAUS_url = None
        thumbnail_data = None

        while True:
            part = await reader.next()
            if part is None:
                break

            if part.name == 'appConfig':
                app_config_content = await part.read(decode=True)
                try:
                    app_config = json.loads(app_config_content)
                except json.JSONDecodeError:
                    return web.Response(status=400, text="Invalid JSON format in 'appConfig'")
                
                SAUS_url = app_config.get('url', None)
                if not SAUS_url:
                    return web.Response(status=400, text="Missing 'url' in 'appConfig'")

            elif part.name == 'wf':
                wf_file = await part.read(decode=False)

            elif part.name == 'thumbnail':
                thumbnail_str = await part.text()
                match = re.match(r'data:(image/\w+);base64,(.+)', thumbnail_str)
                if match:
                    mime_type = match.group(1)
                    base64_data = match.group(2)
                    try:
                        thumbnail_bytes = base64.b64decode(base64_data)
                        image = Image.open(BytesIO(thumbnail_bytes))
                        if image.mode in ("RGBA", "P"):
                            image = image.convert("RGB")
                        width_percent = (468 / float(image.size[0]))
                        new_height = int((float(image.size[1]) * float(width_percent)))
                        image = image.resize((468, new_height), Image.Resampling.LANCZOS)
                        buffered = BytesIO()
                        image.save(buffered, format="JPEG")
                        thumbnail_data = buffered.getvalue()
                    except Exception as e:
                        logger.error(f"{SAUSMSG}: Error processing thumbnail: {e}")
                        return web.Response(status=400, text="Invalid image data in 'thumbnail'")
                else:
                    return web.Response(status=400, text="Invalid data URL format for 'thumbnail'")

        if not app_config:
            return web.Response(status=400, text="Missing 'appConfig' in request")

        if not SAFE_FOLDER_NAME_REGEX.match(SAUS_url):
            return web.Response(status=400, text="Invalid 'url' in 'appConfig'. Only letters, numbers, dashes, and underscores are allowed.")

        app_folder = find_app_path(SAUS_url)
        if not app_folder:
            return web.Response(status=400, text=f"App with url '{SAUS_url}' does not exist")

        app_config_path = app_folder / APPS_CONFIG_FILE
        with app_config_path.open('w', encoding='utf-8') as f:
            json.dump(app_config, f, indent=2)

        if wf_file:
            wf_json_path = app_folder / 'wf.json'
            with wf_json_path.open('wb') as f:
                f.write(wf_file)

        if thumbnail_data:
            media_folder = app_folder / 'media'
            media_folder.mkdir(exist_ok=True)
            thumbnail_filename = "thumbnail.jpg"
            thumbnail_path = media_folder / thumbnail_filename
            with thumbnail_path.open('wb') as f:
                f.write(thumbnail_data)

            with app_config_path.open('w', encoding='utf-8') as f:
                json.dump(app_config, f, indent=2)

            logger.info(f"Thumbnail updated as '{thumbnail_filename}' in app '{SAUS_url}'")

        logger.info(f"{SAUSMSG}: App '{SAUS_url}' updated successfully.")
        return web.json_response({'status': 'success', 'message': f"App '{SAUS_url}' updated successfully."})

    except Exception as e:
        logger.error(f"{SAUSMSG}: Error updating app: {e}")
        return web.Response(status=500, text=f"{SAUSMSG}: Error updating app: {str(e)}")

async def delete_app_handler(request: web.Request) -> web.Response:
    try:
        SAUS_url = request.query.get('url', None)
        if not SAUS_url:
            return web.Response(status=400, text="Missing 'url' parameter")

        if not SAFE_FOLDER_NAME_REGEX.match(SAUS_url):
            return web.Response(status=400, text="Invalid 'url' parameter.")

        app_folder = find_app_path(SAUS_url)
        if not app_folder:
            return web.Response(status=400, text=f"App with url '{SAUS_url}' does not exist")

        shutil.rmtree(app_folder)

        logger.info(f"{SAUSMSG}: App '{SAUS_url}' deleted successfully.")
        return web.json_response({'status': 'success', 'message': f"App '{SAUS_url}' deleted successfully."})

    except Exception as e:
        logger.error(f"{SAUSMSG}: Error deleting app: {e}")
        return web.Response(status=500, text=f"{SAUSMSG}: Error deleting app: {str(e)}")

async def get_apps_list_handler(request):
    file_path = SAUS_BROWSER_PATH / "data/app_list.json"

    if not file_path.exists():
        return web.Response(text=json.dumps({"error": "File not found"}), status=404, content_type='application/json')
    
    try:
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        return web.json_response(data)
    except Exception as e:
        return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type='application/json')

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