import shutil
import os
import re
import base64
import json
import hashlib
import urllib.parse
from pathlib import Path
from aiohttp import web
from typing import Any
from io import BytesIO
from PIL import Image
from typing import Any
import sys
import asyncio
from server import PromptServer
import aiohttp


from .constants import (
    APP_CONFIGS, APP_VERSION, EXTENSION_NODE_MAP_PATH,
    CUSTOM_NODES_DIR, FLOWMSG, logger, FLOWS_PATH, WEBROOT, CORE_PATH,
    SAFE_FOLDER_NAME_REGEX, ALLOWED_EXTENSIONS, CUSTOM_THEMES_DIR, FLOWS_CONFIG_FILE, MODELS_DIRECTORY,
    INPUT_FILES_DIRECTORY, OUTPUT_FILES_DIRECTORY, COMFYUI_DIRECTORY, FILE_REGISTRY_DIR, FILE_IMAGES_DIR, #added for file_manager
    DATA_DIR, PREVIEWS_REGISTRY_DIR, PREVIEWS_IMAGES_DIR,
    MODEL_MANAGER_PATH,
)


def ensure_data_folders():
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        PREVIEWS_REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
        PREVIEWS_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
        FILE_REGISTRY_DIR.mkdir(parents=True, exist_ok=True)
        FILE_IMAGES_DIR.mkdir(parents=True, exist_ok=True)
    except Exception as e:
        logger.error(f"{FLOWMSG}: Could not create data dirs: {e}")

def pathToKey(model_path: str) -> str:
    return model_path.replace('\\', '/')

def find_flow_path(flow_url: str) -> Path:
    p = FLOWS_PATH / flow_url
    if p.exists() and p.is_dir():
        return p
    for p in FLOWS_PATH.rglob(flow_url):
        if p.is_dir() and p.name == flow_url:
            return p
    return None

def get_filename_only(model_path: str) -> str:
    fwd = pathToKey(model_path)
    return os.path.basename(fwd)

def get_preview_id(model_path: str) -> str:
    filename = get_filename_only(model_path)
    h = hashlib.sha1(filename.encode('utf-8')).hexdigest()
    return h[:16]

def get_preview_paths(preview_id: str):
    sub1 = preview_id[0]
    sub2 = preview_id[:2]
    registry_json = PREVIEWS_REGISTRY_DIR / sub1 / sub2 / f"{preview_id}.json"
    image_folder = PREVIEWS_IMAGES_DIR / sub1 / sub2 / preview_id
    return registry_json, image_folder

async def set_model_preview_handler(request: web.Request) -> web.Response:
    try:
        ensure_data_folders()
        data = await request.json()
        rawPath = data.get("modelPath") 
        base64_data = data.get("base64Data")
        if not rawPath or not base64_data:
            return web.Response(status=400, text="Missing 'modelPath' or 'base64Data'")

        pid = get_preview_id(rawPath) 
        registry_json, image_folder = get_preview_paths(pid)

        match = re.match(r"data:(image/\w+);base64,(.+)", base64_data)
        if not match:
            return web.Response(status=400, text="Invalid data URL format")

        mime_type = match.group(1)
        encoded = match.group(2)
        try:
            raw_image = base64.b64decode(encoded)
        except:
            return web.Response(status=400, text="Error decoding base64 image")

        registry_json.parent.mkdir(parents=True, exist_ok=True)
        image_folder.mkdir(parents=True, exist_ok=True)

        full_path = image_folder / "full.jpg"
        with full_path.open("wb") as f:
            f.write(raw_image)

        thumb_path = image_folder / "thumbnail.jpg"
        img = Image.open(BytesIO(raw_image))
        w_percent = 128.0 / float(img.size[0])
        h_new = int(float(img.size[1]) * w_percent)
        img = img.convert("RGB").resize((128, h_new), Image.Resampling.LANCZOS)
        img.save(thumb_path, format="JPEG")

        reg_data = {
            "modelPath": rawPath,
            "previewId": pid,
            "timestamp": int(os.path.getmtime(full_path)),
            "mime_type": mime_type
        }
        with registry_json.open("w", encoding="utf-8") as jf:
            json.dump(reg_data, jf, indent=2)

        return web.json_response({"status": "success", "previewId": pid})

    except Exception as e:
        logger.error(f"{FLOWMSG}: Error in set_model_preview_handler: {e}")
        return web.Response(status=500, text=str(e))

async def clear_model_preview_handler(request: web.Request) -> web.Response:
    try:
        ensure_data_folders()
        rawPath = request.query.get("modelPath", None)
        if not rawPath:
            return web.Response(status=400, text="Missing 'modelPath'")

        pid = get_preview_id(rawPath)
        registry_json, image_folder = get_preview_paths(pid)

        if registry_json.exists():
            registry_json.unlink()
        if image_folder.exists() and image_folder.is_dir():
            shutil.rmtree(image_folder)

        return web.json_response({"status": "success", "previewId": pid})
    except Exception as e:
        logger.error(f"{FLOWMSG}: Error in clear_model_preview_handler: {e}")
        return web.Response(status=500, text=str(e))

async def list_model_previews_handler(request: web.Request) -> web.Response:
    try:
        ensure_data_folders()
        result_map = {}

        if request.method == 'POST':
            data = await request.json()
            raw_paths = data.get('paths', [])
            print("************ raw paths:")
            print(raw_paths)
            if not isinstance(raw_paths, list):
                return web.Response(status=400, text="Invalid JSON: 'paths' must be an array")

            for rp in raw_paths:
                #rp = urllib.parse.unquote(rp).strip()
                rp = pathToKey(urllib.parse.unquote(rp).strip())
                print("/////// rp from post statement  ///////")
                print(rp)
                if not rp:
                    continue
                pid = get_preview_id(rp)
                _, image_folder = get_preview_paths(pid)
                thumb = image_folder / "thumbnail.jpg"
                if thumb.exists():
                    with thumb.open("rb") as tf:
                        b = tf.read()
                    b64 = base64.b64encode(b).decode("utf-8")
                    data_url = f"data:image/jpeg;base64,{b64}"
                    result_map[rp] = data_url
                    print("printing result map")
                    print(result_map)

            return web.json_response(result_map)

        paths_param = request.rel_url.query.get('paths', None)
        if paths_param:
            raw_split = paths_param.split(',')
            for rp in raw_split:
                #rp = rp.strip()
                if not rp:
                    continue
                #rp = urllib.parse.unquote(rp)
                rp = pathToKey(urllib.parse.unquote(rp).strip())
                print("/////// rp from paths param statement  ///////")
                print(rp)
                pid = get_preview_id(rp)
                _, image_folder = get_preview_paths(pid)
                thumb = image_folder / "thumbnail.jpg"
                if thumb.exists():
                    with thumb.open("rb") as tf:
                        b = tf.read()
                    b64 = base64.b64encode(b).decode("utf-8")
                    result_map[rp] = f"data:image/jpeg;base64,{b64}"
                print("printing result map")
                print(result_map)
            return web.json_response(result_map)

        for root, dirs, files in os.walk(PREVIEWS_REGISTRY_DIR):
            for filename in files:
                if filename.endswith(".json"):
                    regp = Path(root) / filename
                    try:
                        with regp.open("r", encoding="utf-8") as f:
                            reg_data = json.load(f)
                        mp = reg_data.get("modelPath")
                        pid = reg_data.get("previewId")
                        if not mp or not pid:
                            continue

                        _, folder = get_preview_paths(pid)
                        thumb = folder / "thumbnail.jpg"
                        if thumb.exists():
                            with thumb.open("rb") as tf:
                                b = tf.read()
                            b64 = base64.b64encode(b).decode("utf-8")
                            result_map[mp] = f"data:image/jpeg;base64,{b64}"
                            print("!!!!!!! from thumb.exists:")
                            print(result_map)
                    except Exception as ex:
                        logger.error(f"{FLOWMSG}: Error reading registry {regp}: {ex}")
                        continue

        return web.json_response(result_map)

    except Exception as e:
        logger.error(f"{FLOWMSG}: Error in list_model_previews_handler: {e}")
        return web.Response(status=500, text=str(e))

async def get_model_preview_handler(request: web.Request) -> web.Response:
    try:
        ensure_data_folders()
        rawPath = request.query.get("modelPath", None)
        print("*************get_model_preview")
        print(rawPath)
        if not rawPath:
            return web.Response(status=400, text="Missing 'modelPath'")

        rawPath = pathToKey(rawPath) # Add this line to normalize the path
        print("********** after path to Key")
        print(rawPath)
        pid = get_preview_id(rawPath)
        print("////////pid")
        print(pid)
        _, image_folder = get_preview_paths(pid)

        thumb = image_folder / "thumbnail.jpg"
        if thumb.exists():
            with thumb.open("rb") as tf:
                b = tf.read()
            b64 = base64.b64encode(b).decode("utf-8")
            data_url = f"data:image/jpeg;base64,{b64}"
            print("rawPath:")
            print(rawPath)
            print("data_url")
            print(data_url)
            return web.json_response({rawPath: data_url})
        else:
            return web.Response(status=404, text="Preview not found")

    except Exception as e:
        logger.error(f"{FLOWMSG}: Error in get_model_preview_handler: {e}")
        return web.Response(status=500, text=str(e))

async def apps_handler(request: web.Request) -> web.Response:
    return web.json_response(APP_CONFIGS)

async def flow_version_handler(request: web.Request) -> web.Response:
    return web.json_response({'version': APP_VERSION})

async def extension_node_map_handler(request: web.Request) -> web.Response:
    if EXTENSION_NODE_MAP_PATH.exists():
        with EXTENSION_NODE_MAP_PATH.open('r') as f:
            extension_node_map = json.load(f)
        return web.json_response(extension_node_map)
    else:
        logger.error(f"{FLOWMSG}: extension-node-map.json not found at {EXTENSION_NODE_MAP_PATH}")
        return web.Response(status=404, text="extension-node-map.json not found")

async def installed_custom_nodes_handler(request: web.Request) -> web.Response:
    try:
        installed_nodes = [item.name for item in CUSTOM_NODES_DIR.iterdir() if item.is_dir()]
        return web.json_response({'installedNodes': installed_nodes})
    except Exception as e:
        logger.error(f"{FLOWMSG}: Error fetching installed custom nodes: {e}")
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
        logger.info(f"{FLOWMSG}: Custom node '{package_name}' cloned successfully.")
        requirements_file = install_path / 'requirements.txt'
        if requirements_file.exists():
            try:
                subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-r', str(requirements_file)])
                logger.info(f"{FLOWMSG}: Requirements for '{package_name}' installed successfully.")
            except subprocess.CalledProcessError as e:
                logger.error(f"{FLOWMSG}: Failed to install requirements for '{package_name}': {e}")
                shutil.rmtree(install_path)
                return web.json_response({
                    'status': 'error',
                    'message': f"Failed to install requirements for '{package_name}'. The package has been removed. Please try installing manually."
                }, status=500)
        else:
            logger.info(f"{FLOWMSG}: No requirements.txt found for '{package_name}'.")
       
        return web.json_response({'status': 'success', 'message': f"Custom node '{package_name}' installed successfully."})
    except subprocess.CalledProcessError as e:
        if install_path.exists():
            shutil.rmtree(install_path)
        logger.error(f"{FLOWMSG}: Failed to install package '{package_name}': {e}")
        return web.json_response({'status': 'error', 'message': f"Failed to install custom node '{package_name}': {e}"}, status=500)
    except Exception as e:
        if install_path.exists():
            shutil.rmtree(install_path)
        logger.error(f"{FLOWMSG}: An unexpected error occurred while installing '{package_name}': {e}")
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
            logger.error(f"{FLOWMSG}: Failed to update package '{package_name}':\n{result.stderr}")
            return web.json_response({'status': 'error', 'message': f"Failed to update package '{package_name}': {result.stderr}"}, status=500)
    except Exception as e:
        logger.error(f"{FLOWMSG}: An error occurred while updating package '{package_name}': {e}")
        return web.json_response({'status': 'error', 'message': f"An error occurred while updating package '{package_name}': {e}"}, status=500)

async def uninstall_package_handler(request: web.Request) -> web.Response:
    data = await request.json()
    package_url = data.get('packageUrl')
    if not package_url:
        logger.warning(f"{FLOWMSG}: Uninstall request received with missing 'packageUrl'.")
        return web.Response(status=400, text="Missing 'packageUrl' in request body")
    
    package_name = package_url.rstrip('/').split('/')[-1]
    install_path = CUSTOM_NODES_DIR / package_name

    if not install_path.exists():
        logger.info(f"{FLOWMSG}: Attempt to uninstall non-existent package '{package_name}'.")
        return web.json_response({'status': 'not_installed', 'message': f"Custom node '{package_name}' is not installed."})

    try:
        logger.info(f"{FLOWMSG}: Uninstalling custom node '{package_name}'...")
        shutil.rmtree(install_path, onerror=remove_readonly)
        logger.info(f"{FLOWMSG}: Custom node '{package_name}' uninstalled successfully.")
        return web.json_response({'status': 'success', 'message': f"Custom node '{package_name}' uninstalled successfully."})
    except Exception as e:
        logger.error(f"{FLOWMSG}: An error occurred while uninstalling '{package_name}': {e}")
        return web.json_response({'status': 'error', 'message': f"An error occurred while uninstalling custom node '{package_name}': {e}"}, status=500)

async def list_themes_handler(request: web.Request) -> web.Response:
    themes_dir = CUSTOM_THEMES_DIR
    try:
        if not themes_dir.exists():
            logger.warning(f"Custom themes directory does not exist: {themes_dir}")
            return web.json_response([], status=200)
        
        css_files = [file.name for file in themes_dir.iterdir() if file.is_file() and allowed_file(file.name)]
        return web.json_response(css_files)
    
    except Exception as e:
        logger.error(f"Error listing theme files: {e}")
        return web.json_response({'error': 'Failed to list theme files.'}, status=500)

async def get_theme_css_handler(request: web.Request) -> web.Response:
    filename = request.match_info.get('filename')
    
    if not allowed_file(filename):
        logger.warning(f"Attempt to access disallowed file type: {filename}")
        raise web.HTTPNotFound()
    
    file_path = CUSTOM_THEMES_DIR / filename
    
    if not file_path.exists() or not file_path.is_file():
        logger.warning(f"CSS file not found: {file_path}")
        raise web.HTTPNotFound()
    
    try:
        return web.FileResponse(path=file_path)
    except Exception as e:
        logger.error(f"Error serving CSS file '{filename}': {e}")
        raise web.HTTPInternalServerError(text="Internal Server Error")

async def preview_flow_handler(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
        flow_config = None
        wf_file = None
        thumbnail_data = None
        thumbnail_extension = None

        while True:
            part = await reader.next()
            if part is None:
                break

            if part.name == 'flowConfig':
                flow_config_content = await part.read(decode=True)
                try:
                    flow_config = json.loads(flow_config_content)
                except json.JSONDecodeError:
                    return web.Response(status=400, text="Invalid JSON format in 'flowConfig'")
                
                flow_url = flow_config.get('url', None)
                if not flow_url:
                    return web.Response(status=400, text="Missing 'url' in 'flowConfig'")

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

        if not flow_config or not wf_file:
            return web.Response(status=400, text="Missing 'flowConfig' or 'wf' in request")

        flow_id = "linker"
        if not flow_id:
            return web.Response(status=400, text="Missing 'id' in request body")

        if not SAFE_FOLDER_NAME_REGEX.match(flow_id):
            return web.Response(status=400, text="Invalid 'flow_id'. Only letters, numbers, dashes, and underscores are allowed.")

        flow_path = WEBROOT / flow_id
        if not flow_path.exists():
            return web.Response(status=404, text=f"Flow directory '{flow_id}' not found")

        config_path = flow_path / FLOWS_CONFIG_FILE
        with config_path.open('w', encoding='utf-8') as f:
            json.dump(flow_config, f, indent=2)

        if wf_file:
            wf_json_path = flow_path / 'wf.json'
            with wf_json_path.open('wb') as f:
                f.write(wf_file)

        if thumbnail_data and thumbnail_extension:
            thumbnail_filename = f"thumbnail.{thumbnail_extension}"
            thumbnail_path = flow_path / thumbnail_filename
            with thumbnail_path.open('wb') as f:
                f.write(thumbnail_data)
            flow_config['thumbnail'] = thumbnail_filename
            with config_path.open('w', encoding='utf-8') as f:
                json.dump(flow_config, f, indent=2)

            logger.info(f"Thumbnail saved as '{thumbnail_filename}' in flow '{flow_id}'")

        return web.json_response({
            'status': 'success',
            'message': f"Configuration for previewing flow '{flow_id}' saved successfully.",
            'thumbnail': f"thumbnail.{thumbnail_extension}" if thumbnail_extension else None
        })

    except Exception as e:
        logger.error(f"{FLOWMSG}: Error saving configuration: {e}")
        return web.Response(status=500, text=f"{FLOWMSG}: Error saving configuration: {str(e)}")

async def reset_preview_handler(request: web.Request) -> web.Response:
    try:
        flow_id = "linker"
        flow_path = WEBROOT / flow_id

        if not flow_path.exists():
            return web.Response(status=404, text=f"Flow directory '{flow_id}' not found")

        defwf_path = flow_path / 'defwf.json'
        wf_path = flow_path / 'wf.json'
        def_flow_config_path = flow_path / 'defFlowConfig.json'
        flow_config_path = flow_path / FLOWS_CONFIG_FILE

        if not defwf_path.exists():
            return web.Response(status=404, text=f"Default workflow file 'defwf.json' not found in '{flow_id}'")

        if not def_flow_config_path.exists():
            return web.Response(status=404, text=f"Default flow configuration file 'defFlowConfig.json' not found in '{flow_id}'")

        shutil.copy2(defwf_path, wf_path)
        shutil.copy2(def_flow_config_path, flow_config_path)

        logger.info(f"{FLOWMSG}: Preview reset successfully for flow '{flow_id}'.")
        return web.json_response({
            'status': 'success',
            'message': f"Preview has been reset successfully for flow '{flow_id}'."
        })

    except Exception as e:
        logger.error(f"{FLOWMSG}: Error resetting preview: {e}")
        return web.Response(status=500, text=f"{FLOWMSG}: Error resetting preview: {str(e)}")

async def create_flow_handler(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
        flow_config = None
        wf_file = None
        flow_url = None
        thumbnail_data = None

        while True:
            part = await reader.next()
            if part is None:
                break

            if part.name == 'flowConfig':
                flow_config_content = await part.read(decode=True)
                try:
                    flow_config = json.loads(flow_config_content)
                except json.JSONDecodeError:
                    return web.Response(status=400, text="Invalid JSON format in 'flowConfig'")
                
                flow_url = flow_config.get('url', None)
                if not flow_url:
                    return web.Response(status=400, text="Missing 'url' in 'flowConfig'")

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
                        logger.error(f"{FLOWMSG}: Error processing thumbnail: {e}")
                        return web.Response(status=400, text="Invalid image data in 'thumbnail'")
                else:
                    return web.Response(status=400, text="Invalid data URL format for 'thumbnail'")

        if not flow_config or not wf_file:
            return web.Response(status=400, text="Missing 'flowConfig' or 'wf' in request")

        if not SAFE_FOLDER_NAME_REGEX.match(flow_url):
            return web.Response(status=400, text="Invalid 'url' in 'flowConfig'. Only letters, numbers, dashes, and underscores are allowed.")

        if find_flow_path(flow_url):
            return web.Response(status=400, text=f"Flow with url '{flow_url}' already exists")

        flow_folder = FLOWS_PATH / 'user' / flow_url
        flow_folder.parent.mkdir(parents=True, exist_ok=True)
        flow_folder.mkdir(parents=True, exist_ok=False)

        flow_config_path = flow_folder / FLOWS_CONFIG_FILE
        with flow_config_path.open('w', encoding='utf-8') as f:
            json.dump(flow_config, f, indent=2)

        wf_json_path = flow_folder / 'wf.json'
        with wf_json_path.open('wb') as f:
            f.write(wf_file)

        if thumbnail_data:
            media_folder = flow_folder / 'media'
            media_folder.mkdir(exist_ok=True)
            thumbnail_filename = "thumbnail.jpg"
            thumbnail_path = media_folder / thumbnail_filename
            with thumbnail_path.open('wb') as f:
                f.write(thumbnail_data)

            with flow_config_path.open('w', encoding='utf-8') as f:
                json.dump(flow_config, f, indent=2)

            logger.info(f"Thumbnail saved as '{thumbnail_filename}' in flow '{flow_url}'")

        index_template_path = CORE_PATH / 'templates' / 'index.html'
        if not index_template_path.exists():
            return web.Response(status=500, text="Template 'index.html' not found")
        
        index_destination_path = flow_folder / 'index.html'
        shutil.copy2(index_template_path, index_destination_path)

        logger.info(f"{FLOWMSG}: Flow '{flow_url}' created successfully.")
        return web.json_response({'status': 'success', 'message': f"Flow '{flow_url}' created successfully."})

    except Exception as e:
        logger.error(f"{FLOWMSG}: Error creating flow: {e}")
        return web.Response(status=500, text=f"{FLOWMSG}: Error creating flow: {str(e)}")

async def update_flow_handler(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
        flow_config = None
        wf_file = None
        flow_url = None
        thumbnail_data = None

        while True:
            part = await reader.next()
            if part is None:
                break

            if part.name == 'flowConfig':
                flow_config_content = await part.read(decode=True)
                try:
                    flow_config = json.loads(flow_config_content)
                except json.JSONDecodeError:
                    return web.Response(status=400, text="Invalid JSON format in 'flowConfig'")
                
                flow_url = flow_config.get('url', None)
                if not flow_url:
                    return web.Response(status=400, text="Missing 'url' in 'flowConfig'")

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
                        logger.error(f"{FLOWMSG}: Error processing thumbnail: {e}")
                        return web.Response(status=400, text="Invalid image data in 'thumbnail'")
                else:
                    return web.Response(status=400, text="Invalid data URL format for 'thumbnail'")

        if not flow_config:
            return web.Response(status=400, text="Missing 'flowConfig' in request")

        if not SAFE_FOLDER_NAME_REGEX.match(flow_url):
            return web.Response(status=400, text="Invalid 'url' in 'flowConfig'. Only letters, numbers, dashes, and underscores are allowed.")

        flow_folder = find_flow_path(flow_url)
        if not flow_folder:
            return web.Response(status=400, text=f"Flow with url '{flow_url}' does not exist")

        flow_config_path = flow_folder / FLOWS_CONFIG_FILE
        with flow_config_path.open('w', encoding='utf-8') as f:
            json.dump(flow_config, f, indent=2)

        if wf_file:
            wf_json_path = flow_folder / 'wf.json'
            with wf_json_path.open('wb') as f:
                f.write(wf_file)

        if thumbnail_data:
            media_folder = flow_folder / 'media'
            media_folder.mkdir(exist_ok=True)
            thumbnail_filename = "thumbnail.jpg"
            thumbnail_path = media_folder / thumbnail_filename
            with thumbnail_path.open('wb') as f:
                f.write(thumbnail_data)

            with flow_config_path.open('w', encoding='utf-8') as f:
                json.dump(flow_config, f, indent=2)

            logger.info(f"Thumbnail updated as '{thumbnail_filename}' in flow '{flow_url}'")

        logger.info(f"{FLOWMSG}: Flow '{flow_url}' updated successfully.")
        return web.json_response({'status': 'success', 'message': f"Flow '{flow_url}' updated successfully."})

    except Exception as e:
        logger.error(f"{FLOWMSG}: Error updating flow: {e}")
        return web.Response(status=500, text=f"{FLOWMSG}: Error updating flow: {str(e)}")

async def delete_flow_handler(request: web.Request) -> web.Response:
    try:
        flow_url = request.query.get('url', None)
        if not flow_url:
            return web.Response(status=400, text="Missing 'url' parameter")

        if not SAFE_FOLDER_NAME_REGEX.match(flow_url):
            return web.Response(status=400, text="Invalid 'url' parameter.")

        flow_folder = find_flow_path(flow_url)
        if not flow_folder:
            return web.Response(status=400, text=f"Flow with url '{flow_url}' does not exist")

        shutil.rmtree(flow_folder)

        logger.info(f"{FLOWMSG}: Flow '{flow_url}' deleted successfully.")
        return web.json_response({'status': 'success', 'message': f"Flow '{flow_url}' deleted successfully."})

    except Exception as e:
        logger.error(f"{FLOWMSG}: Error deleting flow: {e}")
        return web.Response(status=500, text=f"{FLOWMSG}: Error deleting flow: {str(e)}")

def allowed_file(filename: str) -> bool:
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def remove_readonly(func, path, excinfo):
    os.chmod(path, stat.S_IWRITE)
    func(path)

#this api handler is defined to be able to list the directories used in the manager
async def directory_listing_handler(request: web.Request) -> web.Response:
    path_param = request.query.get("path")
    if not path_param:
        return web.json_response({"error": "Missing 'path' parameter"}, status=400)

    try:
        requested_path = Path(path_param).resolve()

        # Ensure the requested path is within the allowed models directory
        #if not str(requested_path).startswith(str(MODELS_DIRECTORY.resolve())):
        #    return web.json_response({"error": "Access denied"}, status=403)
        if not str(requested_path).startswith(str(COMFYUI_DIRECTORY.resolve())):
            return web.json_response({"error": "Access denied"}, status=403)


        if not requested_path.exists() or not requested_path.is_dir():
            return web.json_response({"error": "Directory not found"}, status=404)

        items = []
        for item in requested_path.iterdir():
            items.append({
                "name": item.name,
                "type": "folder" if item.is_dir() else "file"
            })

        return web.json_response(items)

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def perform_generic_download(url, target_path, headers):
    logger.info(f"[Generic Download] Background task started for URL: {url}")
    
    timeout = aiohttp.ClientTimeout(total=3600, connect=60)
    max_retries = 5
    filename = None
    save_path = None

    async with aiohttp.ClientSession(timeout=timeout) as session:
        for attempt in range(max_retries):
            try:
                request_headers = headers.copy()
                mode = 'wb'
                downloaded_size = 0
                
                # Determine filename and path early if possible, or after first request
                # For resume logic to work, we need to know the path. 
                # If we don't have it yet, we can't resume on the very first try, but we can on retries if we set it.
                
                if save_path and os.path.exists(save_path):
                    downloaded_size = os.path.getsize(save_path)
                    if downloaded_size > 0:
                        request_headers['Range'] = f'bytes={downloaded_size}-'
                        mode = 'ab'
                        logger.info(f"[Generic Download] Resuming {filename} from byte {downloaded_size}")

                logger.info(f"[Generic Download] Attempt {attempt+1}/{max_retries} connecting...")
                async with session.get(url, headers=request_headers) as resp:
                    if resp.status not in (200, 206):
                        logger.error(f"[Generic Download] HTTP Error {resp.status}")
                        if resp.status in [401, 403, 404]:
                            # Fatal errors, stop retrying
                            PromptServer.instance.send_sync("file_download_error", {"filename": filename or "unknown", "error": f"HTTP {resp.status}"})
                            return
                        raise Exception(f"HTTP Error {resp.status}")
                    
                    if not filename:
                        filename = extract_filename_from_response(resp, url)
                        save_path = os.path.join(target_path, filename)
                        logger.info(f"[Generic Download] Resolved filename: {filename}, Saving to: {save_path}")
                    
                    total_size = int(resp.headers.get('Content-Length', 0))
                    if resp.status == 206:
                        content_range = resp.headers.get('Content-Range', '')
                        if content_range:
                            try:
                                total_size = int(content_range.split('/')[-1])
                            except:
                                pass
                    elif resp.status == 200 and downloaded_size > 0:
                        downloaded_size = 0
                        mode = 'wb'
                        logger.warning("[Generic Download] Server ignored Range header, restarting download.")

                    with open(save_path, mode) as f:
                        bytes_read_in_attempt = 0
                        last_progress_update = -1
                        
                        while True:
                            chunk = await resp.content.read(1024 * 1024)
                            if not chunk:
                                break
                            f.write(chunk)
                            bytes_read_in_attempt += len(chunk)
                            
                            current_total = downloaded_size + bytes_read_in_attempt
                            
                            if total_size > 0:
                                progress = int((current_total / total_size) * 100)
                                if progress > last_progress_update:
                                    last_progress_update = progress
                                    # Send progress to UI
                                    PromptServer.instance.send_sync("file_download_progress", {
                                        "filename": filename,
                                        "progress": progress,
                                        "total_bytes": total_size,
                                        "downloaded_bytes": current_total
                                    })
                    
                    logger.info(f"[Generic Download] Complete: {filename}")
                    PromptServer.instance.send_sync("file_download_complete", {
                        "filename": filename,
                        "path": save_path
                    })
                    return # Success

            except Exception as e:
                logger.error(f"[Generic Download] Attempt {attempt + 1} failed: {e}")
                if attempt == max_retries - 1:
                    PromptServer.instance.send_sync("file_download_error", {"filename": filename or "unknown", "error": str(e)})
                await asyncio.sleep(2)


async def download_generic_handler(request):
    try:
        data = await request.json()
        url = data.get('url')
        target_path = data.get('targetPath')
        api_token = data.get('apiToken')

        logger.info(f"[API] Received download request for: {url}")

        if not url or not target_path:
            return web.json_response({'error': 'Missing url or targetPath'}, status=400)

        # Security Check: Ensure target_path is within allowed directories
        resolved_target = Path(target_path).resolve()
        if not str(resolved_target).startswith(str(COMFYUI_DIRECTORY.resolve())):
             return web.json_response({"error": "Access denied: Target path outside allowed directories"}, status=403)

        headers = {}
        if api_token:
            headers['Authorization'] = f'Bearer {api_token}'

        # Start background task
        asyncio.create_task(perform_generic_download(url, target_path, headers))

        return web.json_response({'message': 'Download initiated in background'})

    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)


def extract_filename_from_response(resp, url):
    # Look for any header that contains 'content-disposition' (case-insensitive)
    for key, value in resp.headers.items():
        if 'content-disposition' in key.lower():
            match = re.search(r'filename="?([^"]+)"?', value)
            if match:
                return match.group(1)

    # Fallback to URL path
    parsed_url = urllib.parse.urlparse(url)
    return os.path.basename(parsed_url.path)

async def rename_file_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        current_path = Path(data.get("currentPath")).resolve()
        new_name = data.get("newName")

        if not current_path.exists():
            return web.json_response({"error": "File not found"}, status=404)

        if not new_name:
            return web.json_response({"error": "Missing newName"}, status=400)

        # Ensure the file is within the allowed directory
        #if not str(current_path).startswith(str(MODELS_DIRECTORY.resolve())):
        if not str(current_path).startswith(str(COMFYUI_DIRECTORY.resolve())):
            return web.json_response({"error": "Access denied"}, status=403)

        new_path = current_path.parent / new_name

        current_path.rename(new_path)

        return web.json_response({"message": "Rename successful", "newPath": str(new_path)})

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def delete_file_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        file_path = Path(data.get("filePath")).resolve()

        if not file_path.exists():
            return web.json_response({"error": "File not found"}, status=404)

        # Ensure the file is within the allowed directory
        #if not str(file_path).startswith(str(MODELS_DIRECTORY.resolve())):
        if not str(file_path).startswith(str(COMFYUI_DIRECTORY.resolve())):
            return web.json_response({"error": "Access denied"}, status=403)

        if file_path.is_dir():
            shutil.rmtree(file_path)
        else:
            file_path.unlink()

        return web.json_response({"message": "Delete successful"})

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

#This is the handler to upload a file
''' 
async def upload_file_handler(request: web.Request) -> web.Response:
    reader = await request.multipart()

    # Read file field
    field = await reader.next()
    if field.name != 'file':
        return web.json_response({'error': 'Missing file field'}, status=400)

    filename = field.filename
    if not filename:
        return web.json_response({'error': 'No filename provided'}, status=400)

    # Read targetPath field
    target_path_field = await reader.next()
    if target_path_field.name != 'targetPath':
        return web.json_response({'error': 'Missing targetPath field'}, status=400)

    target_path = await target_path_field.text()
    os.makedirs(target_path, exist_ok=True)

    file_path = os.path.join(target_path, filename)

    # Save file
    with open(file_path, 'wb') as f:
        while True:
            chunk = await field.read_chunk()
            if not chunk:
                break
            f.write(chunk)

    return web.json_response({'status': 'success', 'filename': filename})
'''


async def upload_file_handler(request: web.Request) -> web.Response:
    print("\n--- UPLOAD STARTED (Simple Sequential Read) ---")
    
    try:
        reader = await request.multipart()
    except ValueError:
        return web.json_response({'error': 'Invalid content type'}, status=400)
    
    # ----------------------------------------------------
    # 1. Read the 'file' field (The large stream)
    # ----------------------------------------------------
    file_field = await reader.next()
    if not file_field or file_field.name != 'file':
        print(f"DEBUG: ERROR - Expected 'file' field first, got '{file_field.name if file_field else 'None'}'")
        return web.json_response({'error': 'Missing or incorrect first field: expected file'}, status=400)
    
    # Read the ENTIRE file content into memory immediately
    file_content = await file_field.read()
    bytes_to_write = len(file_content)
    
    print(f"DEBUG: Read file content into memory. Size: {bytes_to_write} bytes")
    
    if bytes_to_write == 0:
        print("DEBUG: FATAL ERROR - Content read from stream was 0 bytes. Stream consumed elsewhere?")
        # Consume the next field (targetPath) to ensure connection doesn't hang
        await reader.next() 
        return web.json_response({'error': 'File data stream empty (consumed by server).'}, status=500)


    # ----------------------------------------------------
    # 2. Read the 'targetPath' field (The small text)
    # ----------------------------------------------------
    target_path_field = await reader.next()
    
    if not target_path_field or target_path_field.name != 'targetPath':
        print(f"DEBUG: ERROR - Expected 'targetPath' field next, got '{target_path_field.name if target_path_field else 'None'}'")
        return web.json_response({'error': 'Missing or incorrect second field: expected targetPath'}, status=400)

    target_path = await target_path_field.text()
    print(f"DEBUG: targetPath received: '{target_path}'")
    
    
    # ----------------------------------------------------
    # 3. Save the file
    # ----------------------------------------------------
    
    filename = file_field.filename
    os.makedirs(target_path, exist_ok=True)
    file_path = os.path.join(target_path, filename)
    print(f"DEBUG: Full save path constructed: '{file_path}'")

    try:
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        print(f"DEBUG: File close successful. Total bytes written: {bytes_to_write}")

    except Exception as e:
        print(f"DEBUG: FATAL ERROR during file save: {e}", file=sys.stderr)
        return web.json_response({'error': f'Failed to save file: {e}'}, status=500)

    return web.json_response({'status': 'success', 'filename': filename})



# This function handles the request for the list of flows
async def get_flows_list_handler(request):
    """
    Handles GET requests for the flows_list.json file.
    """
    file_path = FLOWS_PATH / "flows_list.json"
    
    # Check if the file exists
    if not file_path.exists():
        return web.Response(text=json.dumps({"error": "File not found"}), status=404, content_type='application/json')
    
    try:
        # Read the contents of the file
        with open(file_path, 'r') as f:
            data = json.load(f)
        
        # Return the data as a JSON response
        return web.json_response(data)
    except Exception as e:
        return web.Response(text=json.dumps({"error": str(e)}), status=500, content_type='application/json')

#Download files from the server to local computer:

async def download_file_handler(request: web.Request) -> web.Response:
    """Handles file download requests."""
    # Get the file path from the query parameters.
    file_path_str = request.query.get('filePath')

    if not file_path_str:
        return web.json_response({'error': 'Missing filePath parameter'}, status=400)

    # If force_find is requested, search for the filename in the output directory
    if request.query.get('force_find'):
        target_filename = os.path.basename(file_path_str)
        for root, dirs, files in os.walk(OUTPUT_FILES_DIRECTORY):
            if target_filename in files:
                file_path_str = os.path.join(root, target_filename)
                break

    # Use a secure path to prevent directory traversal attacks
    # For example, ensure the path is within your designated directories
    # like /workspace/ComfyUI/models or /workspace/ComfyUI/output
    if not file_path_str.startswith(('/workspace/ComfyUI/input', '/workspace/ComfyUI/output', '/workspace/ComfyUI/models')):
        return web.json_response({'error': 'Invalid file path'}, status=403)

    # Get the file name from the path for the Content-Disposition header
    file_name = os.path.basename(file_path_str)

    try:
        # Use web.FileResponse to serve the file efficiently
        return web.FileResponse(file_path_str, headers={
            'Content-Disposition': f'inline; filename="{file_name}"'
        })
    except FileNotFoundError:
        return web.json_response({'error': 'File not found'}, status=404)
    except Exception as e:
        return web.json_response({'error': f'An error occurred: {e}'}, status=500)



TEMP_UPLOAD_DIR = "/tmp/flow_uploads" # Use a dedicated temp path

async def upload_chunk_handler(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
    except ValueError:
        return web.json_response({'error': 'Invalid content type'}, status=400)

    # Dictionary to hold all required multipart data
    data = {}
    while True:
        field = await reader.next()
        if field is None:
            break
        
        if field.name == 'fileChunk':
            data['chunk'] = await field.read() # Read the chunk data
            data['filename'] = field.filename
        else:
            data[field.name] = await field.text() # Read text fields

    file_id = data.get('fileId')
    target_path = data.get('targetPath')
    chunk_index = data.get('chunkIndex')
    is_last = data.get('isLast') == 'true'
    
    if not file_id or not data.get('chunk'):
        return web.json_response({'error': 'Missing fileId or chunk data'}, status=400)
    
    # -----------------------------------------------
    # 1. Store the chunk in a temporary file
    # -----------------------------------------------
    
    # Create a sub-directory for this specific file upload session
    temp_file_dir = Path(TEMP_UPLOAD_DIR) / file_id
    temp_file_dir.mkdir(parents=True, exist_ok=True)
    
    # Write the chunk to a file named after its index
    chunk_path = temp_file_dir / f"chunk_{chunk_index}.part"
    with open(chunk_path, 'wb') as f:
        f.write(data['chunk'])

    # -----------------------------------------------
    # 2. Check for the final chunk and assemble
    # -----------------------------------------------
    
    if is_last:
        final_file_path = Path(target_path) / data.get('fileName')
        final_file_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Assemble all chunks in order
        try:
            with open(final_file_path, 'wb') as outfile:
                for i in range(int(chunk_index) + 1):
                    part_path = temp_file_dir / f"chunk_{i}.part"
                    with open(part_path, 'rb') as infile:
                        shutil.copyfileobj(infile, outfile)
            
            # Clean up the temporary files
            shutil.rmtree(temp_file_dir)
            
            return web.json_response({'status': 'success', 'message': 'File assembled successfully'})
            
        except Exception as e:
            logger.error(f"Assembly error for {file_id}: {e}")
            return web.json_response({'error': 'File assembly failed'}, status=500)
    
    return web.json_response({'status': 'chunk_received', 'chunk': chunk_index})


ARCHITECTURES_FILE = MODEL_MANAGER_PATH / "data" / "architectures.json"

async def get_architectures_handler(request: web.Request) -> web.Response:
    """
    Handles the GET request for the /flow/api/architectures endpoint.
    Reads the architectures data from a JSON file and returns it as a response.
    """
    try:
        # Check if the file exists before attempting to read it.
        if not ARCHITECTURES_FILE.exists():
            return web.json_response(
                {"error": "Architectures data file not found."},
                status=404
            )

        # Open, read, and parse the JSON file.
        with open(ARCHITECTURES_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Return the JSON data with a 200 OK status.
        return web.json_response(data, status=200)

    except json.JSONDecodeError:
        # Handle cases where the JSON file is malformed.
        return web.json_response(
            {"error": "Invalid JSON format in the architectures file."},
            status=500
        )
    except Exception as e:
        # Catch any other unexpected errors and return a 500 status.
        return web.json_response(
            {"error": f"An unexpected error occurred: {e}"},
            status=500
        )

MODEL_DATA_FILE = MODEL_MANAGER_PATH / "data" / "models_data.json"

async def get_model_data_handler(request: web.Request) -> web.Response:
    """
    Handles the GET request for the get_model_data_handler/flow/api/data-model-data/ endpoint.
    Reads the information of the models and from a JSON file and returns it as a response.
    """
    try:
        # Check if the file exists before attempting to read it.
        if not MODEL_DATA_FILE.exists():
            return web.json_response(
                {"error": "Data Model file not found."},
                status=404
            )

        # Open, read, and parse the JSON file.
        with open(MODEL_DATA_FILE , 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Return the JSON data with a 200 OK status.
        return web.json_response(data, status=200)

    except json.JSONDecodeError:
        # Handle cases where the JSON file is malformed.
        return web.json_response(
            {"error": "Invalid JSON format in the Models Data file."},
            status=500
        )
    except Exception as e:
        # Catch any other unexpected errors and return a 500 status.
        return web.json_response(
            {"error": f"An unexpected error occurred: {e}"},
            status=500
        )

#### TO CHECK IF THE MODEL IS AVAILABLE OR NOT

async def check_model_status_handler(request: web.Request) -> web.Response:
    model_path = request.query.get('model_path', '')
    file_id = request.query.get('file_id', '')

    if not model_path or not file_id:
        return web.json_response({'status': 'error', 'message': 'Missing model_path or file_id'}, status=400)

    # Construct the full absolute path
    # Note: Using Path() handles joining correctly and securely
    full_file_path = MODELS_DIRECTORY / model_path.lstrip('/') / file_id 

    # Ensure the path is safely inside the MODELS_DIRECTORY
    try:
        full_file_path.resolve().relative_to(MODELS_DIRECTORY.resolve())
    except ValueError:
        return web.json_response({'status': 'error', 'message': 'Invalid file path.'}, status=403)

    # Check existence
    if full_file_path.exists() and full_file_path.is_file():
        status = 'ready'
    else:
        status = 'missing'

    return web.json_response({'status': status})

#### TO DELETE THE MODEL HANDLER ###########

async def delete_model_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        file_id = data.get('file_id')
        model_path = data.get('model_path')

        if not file_id or not model_path:
            return web.json_response({'status': 'error', 'message': 'Missing file_id or model_path'}, status=400)

        # Construct the full absolute path
        full_file_path = MODELS_DIRECTORY / model_path.lstrip('/') / file_id

        # ⚠️ SECURITY CHECK: Ensure the path is safely inside the MODELS_DIRECTORY
        # This prevents directory traversal attacks (e.g., deleting files outside the 'models' folder)
        try:
            full_file_path.resolve().relative_to(MODELS_DIRECTORY.resolve())
        except ValueError:
            return web.json_response({'status': 'error', 'message': 'Invalid file path or security violation.'}, status=403)

        if full_file_path.exists() and full_file_path.is_file():
            os.remove(full_file_path) # Delete the file
            return web.json_response({'status': 'success', 'message': f'File {file_id} deleted.'})
        else:
            return web.json_response({'status': 'error', 'message': f'File not found at {full_file_path}'}, status=404)

    except Exception as e:
        logger.error(f"Error during file deletion: {e}")
        return web.json_response({'status': 'error', 'message': 'Internal Server Error'}, status=500)

### HELPER AND HANDLER FUNCTIONS TO DOWNLOAD THE MODELS ####

# ⚠️ Helper function to perform the actual file download 
async def perform_download(component_type, url_model, model_path, file_name=None): # 🚨 NOTE: Assuming component_type is passed here
    # 1. Setup paths and timeout
    if not file_name:
        file_name = Path(url_model).name
    destination_dir = MODELS_DIRECTORY / model_path.lstrip('/')
    destination_dir.mkdir(parents=True, exist_ok=True)
    full_file_path = destination_dir / file_name
    timeout = aiohttp.ClientTimeout(total=3600, connect=60) 

    max_retries = 5
    downloaded_size = 0
    total_size = 0
    
    logger.info(f"Initiating download/resume for {file_name}. Max retries: {max_retries}")

    for attempt in range(max_retries):
        try:
            # 2. Determine if we are resuming
            headers = {}
            file_mode = 'wb'
            if full_file_path.exists() and full_file_path.is_file():
                downloaded_size = full_file_path.stat().st_size
                headers['Range'] = f'bytes={downloaded_size}-'
                file_mode = 'ab'
                logger.info(f"Attempt {attempt + 1}: Resuming from byte {downloaded_size}")
            else:
                downloaded_size = 0
                logger.info(f"Attempt {attempt + 1}: Starting new download.")


            # 3. Start the session with timeout
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(url_model, headers=headers, allow_redirects=True) as response:
                    
                    # Handle status codes
                    status = response.status
                    if status not in (200, 206):
                        logger.error(f"Download failed with status: {status}")
                        return False
                    
                    # 4. Calculate total expected size
                    content_range = response.headers.get('Content-Range')
                    if status == 206 and content_range:
                        # Resumed: Total size is in Content-Range header (e.g., bytes 123-456/1000)
                        total_size = int(content_range.split('/')[-1])
                    else: 
                        # New download (200): Total size is in Content-Length
                        if downloaded_size > 0:
                            logger.warning("Server ignored Range header. Restarting download from byte 0.")
                            downloaded_size = 0
                            file_mode = 'wb'
                            
                        # Calculate total size based on full file download
                        total_size = int(response.headers.get('Content-Length', 0))

                    logger.info(f"File size expected: {total_size} bytes.")

                    # 5. Stream the data
                    bytes_read_in_attempt = 0
                    
                    # Use 'await response.content.read(CHUNK_SIZE)' approach for interruptible streaming
                    with open(full_file_path, file_mode) as f:
                        while True:
                            chunk = await response.content.read(1024 * 1024) 
                            if not chunk:
                                break
                            f.write(chunk)
                            bytes_read_in_attempt += len(chunk)
                            
                            # Update total size downloaded across all attempts
                            current_downloaded_total = downloaded_size + bytes_read_in_attempt
                            
                            if current_downloaded_total % (100 * 1024 * 1024) < len(chunk): 
                                
                                # 🚨 START OF NEW PROGRESS LOGIC 🚨
                                progress_percent = round((current_downloaded_total / total_size) * 100, 1) if total_size else 0
                                
                                # Send WebSocket notification to the frontend
                                PromptServer.instance.send_sync("model_download_progress", {
                                    "component_type": component_type,
                                    "model_path": model_path, # Key for targeting the card
                                    "file_name": file_name,
                                    "progress": progress_percent
                                })
                                # 🚨 END OF NEW PROGRESS LOGIC 🚨
                                
                                logger.info(f"Progress: {current_downloaded_total} / {total_size} bytes. ({progress_percent}%)")

                    # 6. Check for completion and successful transfer
                    if (downloaded_size + bytes_read_in_attempt) == total_size:
                        logger.info(f"Successfully downloaded and verified {file_name} in {attempt + 1} attempts.")
                        
                        # --- UPDATED COMPLETION NOTIFICATION ---
                        PromptServer.instance.send_sync("model_download_complete", {
                            "component_type": component_type,
                            "model_path": model_path, # Use this or some other unique key to re-identify the card
                            "file_name": file_name
                        })
                        
                        return True
                    else:
                        # Transfer interrupted (ContentLengthError manifests here)
                        downloaded_size += bytes_read_in_attempt # Update for next retry
                        logger.warning(f"Download interrupted at {downloaded_size}/{total_size}. Retrying...")
                        await asyncio.sleep(5) # Wait before next attempt

        except Exception as e:
            # Handle network errors, etc.
            logger.error(f"Error during download process on attempt {attempt + 1}: {e}")
            if downloaded_size == 0:
                # Clean up partial file on critical failure only if it's a fresh start
                if full_file_path.exists():
                    os.remove(full_file_path)
                return False
            await asyncio.sleep(10) # Wait a bit longer for network to recover

    # If the loop completes without success
    logger.error(f"Download failed after {max_retries} attempts.")
    return False

async def download_model_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        
        # 1. Extract the missing component_type
        component_type = data.get('component_type')
        url_model = data.get('url_model')
        model_path = data.get('model_path')
        file_name = data.get('file_name')

        if not all([component_type, url_model, model_path]):
            # Improved error logging to capture which parameter is missing
            return web.json_response({
                'status': 'error', 
                'message': f'Missing model URL, destination path, or component type. Received: type={component_type}, url={url_model}, path={model_path}'
            }, status=400)

        # 2. Pass all three arguments in the correct order
        asyncio.create_task(perform_download(component_type, url_model, model_path, file_name))

        return web.json_response({'status': 'initiated', 'message': 'Download started in the background.'})

    except Exception as e:
        logger.error(f"Error handling download request: {e}", exc_info=True)
        return web.json_response({'status': 'error', 'message': 'Internal Server Error'}, status=500)
