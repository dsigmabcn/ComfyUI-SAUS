import os
import re
import base64
import json
import shutil
import urllib.parse
from pathlib import Path
from aiohttp import web
from io import BytesIO
from PIL import Image

from .constants import (
    APP_VERSION, SAUSMSG, logger,
)
from .helpers import (
    pathToKey, get_preview_id, get_preview_paths,
    encrypt_value, decrypt_value, ensure_data_folders
)

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
        logger.error(f"{SAUSMSG}: Error in set_model_preview_handler: {e}")
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
        logger.error(f"{SAUSMSG}: Error in clear_model_preview_handler: {e}")
        return web.Response(status=500, text=str(e))

async def list_model_previews_handler(request: web.Request) -> web.Response:
    try:
        ensure_data_folders()
        result_map = {}

        if request.method == 'POST':
            data = await request.json()
            raw_paths = data.get('paths', [])
            if not isinstance(raw_paths, list):
                return web.Response(status=400, text="Invalid JSON: 'paths' must be an array")

            for rp in raw_paths:
                rp = pathToKey(urllib.parse.unquote(rp).strip())                
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


            return web.json_response(result_map)

        paths_param = request.rel_url.query.get('paths', None)
        if paths_param:
            raw_split = paths_param.split(',')
            for rp in raw_split:
                if not rp:
                    continue
                rp = pathToKey(urllib.parse.unquote(rp).strip())
                pid = get_preview_id(rp)
                _, image_folder = get_preview_paths(pid)
                thumb = image_folder / "thumbnail.jpg"
                if thumb.exists():
                    with thumb.open("rb") as tf:
                        b = tf.read()
                    b64 = base64.b64encode(b).decode("utf-8")
                    result_map[rp] = f"data:image/jpeg;base64,{b64}"

            return web.json_response(result_map)

        from .constants import PREVIEWS_REGISTRY_DIR
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

                    except Exception as ex:
                        logger.error(f"{SAUSMSG}: Error reading registry {regp}: {ex}")
                        continue

        return web.json_response(result_map)

    except Exception as e:
        logger.error(f"{SAUSMSG}: Error in list_model_previews_handler: {e}")
        return web.Response(status=500, text=str(e))

async def get_model_preview_handler(request: web.Request) -> web.Response:
    try:
        ensure_data_folders()
        rawPath = request.query.get("modelPath", None)

        if not rawPath:
            return web.Response(status=400, text="Missing 'modelPath'")

        rawPath = pathToKey(rawPath)

        pid = get_preview_id(rawPath)

        _, image_folder = get_preview_paths(pid)

        thumb = image_folder / "thumbnail.jpg"
        if thumb.exists():
            with thumb.open("rb") as tf:
                b = tf.read()
            b64 = base64.b64encode(b).decode("utf-8")
            data_url = f"data:image/jpeg;base64,{b64}"


            return web.json_response({rawPath: data_url})
        else:
            return web.Response(status=404, text="Preview not found")

    except Exception as e:
        logger.error(f"{SAUSMSG}: Error in get_model_preview_handler: {e}")
        return web.Response(status=500, text=str(e))

async def saus_version_handler(request: web.Request) -> web.Response:
    return web.json_response({'version': APP_VERSION}, headers={'Cache-Control': 'no-cache'})

async def get_settings_handler(request: web.Request) -> web.Response:
    from .constants import DATA_DIR
    settings_file = DATA_DIR / "settings.json"
    if settings_file.exists():
        try:
            with open(settings_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            response_data = data.copy()
            sensitive_keys = ['civitai_api_key', 'huggingface_api_key', 'saus_token']
            for key in sensitive_keys:
                if response_data.get(key):
                    response_data[key] = "********"
            
            return web.json_response(response_data)
        except Exception as e:
            logger.error(f"{SAUSMSG}: Error reading settings: {e}")
            return web.json_response({}, status=500)
    return web.json_response({})

async def save_settings_handler(request: web.Request) -> web.Response:
    try:
        from .constants import DATA_DIR
        new_data = await request.json()
        settings_file = DATA_DIR / "settings.json"
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        
        existing_data = {}
        if settings_file.exists():
            try:
                with open(settings_file, 'r', encoding='utf-8') as f:
                    existing_data = json.load(f)
            except Exception:
                existing_data = {}

        sensitive_keys = ['civitai_api_key', 'huggingface_api_key', 'saus_token']
        
        for key, value in new_data.items():
            if key in sensitive_keys and value == "********":
                continue
            
            if key in sensitive_keys:
                existing_data[key] = encrypt_value(value)
            else:
                existing_data[key] = value

        with open(settings_file, 'w', encoding='utf-8') as f:
            json.dump(existing_data, f, indent=2)
        return web.json_response({"status": "success"})
    except Exception as e:
        logger.error(f"{SAUSMSG}: Error saving settings: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)

async def restart_server_handler(request: web.Request) -> web.Response:
    try:
        def do_restart():
            import time
            import sys
            import os
            time.sleep(1)
            os.execv(sys.executable, [sys.executable] + sys.argv)
            
        import threading
        threading.Thread(target=do_restart).start()
        
        return web.json_response({"status": "success", "message": "Server restarting..."})
    except Exception as e:
        logger.error(f"{SAUSMSG}: Error restarting server: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)