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
    ensure_data_folders, require_json
)

# Guard rails for client-supplied preview images.
MAX_PREVIEW_BASE64_CHARS = 32 * 1024 * 1024   # ~24 MB of image data
MAX_PREVIEW_BYTES = 24 * 1024 * 1024
MAX_PREVIEW_PIXELS = 20_000_000               # ~60 MB once decoded as RGB
MAX_PREVIEW_SIDE = 12_000                     # px, either side
PREVIEW_THUMB_WIDTH = 128


class PreviewTooLarge(ValueError):
    """An image that is too big to be processed safely."""


def make_preview_thumbnail(raw_image: bytes):
    """Return a ``PREVIEW_THUMB_WIDTH``-wide thumbnail for ``raw_image``.

    Raises ``PreviewTooLarge`` for anything that could exhaust memory (a few KB
    of PNG can declare a huge bitmap -- a "decompression bomb") and ``ValueError``
    for data that is not a usable image. The dimensions come from the header
    *before* the pixels are decoded, so a bomb is refused without allocating it.
    """
    if not raw_image:
        raise ValueError("empty image")
    if len(raw_image) > MAX_PREVIEW_BYTES:
        raise PreviewTooLarge("image data is too large")

    try:
        image = Image.open(BytesIO(raw_image))
    except Image.DecompressionBombError as e:
        raise PreviewTooLarge("image is too large") from e
    except Exception as e:
        raise ValueError(f"not a readable image ({e})") from e

    try:
        width, height = image.size
        if width < 1 or height < 1:
            raise ValueError("image has invalid dimensions")
        if (width > MAX_PREVIEW_SIDE or height > MAX_PREVIEW_SIDE
                or width * height > MAX_PREVIEW_PIXELS):
            raise PreviewTooLarge(f"image is too large ({width}x{height})")

        # Formats that support it (JPEG) can decode at a reduced scale.
        try:
            image.draft("RGB", (PREVIEW_THUMB_WIDTH, PREVIEW_THUMB_WIDTH))
        except Exception:
            pass
        image.load()

        if image.mode not in ("RGB", "L"):
            image = image.convert("RGB")
        new_height = max(1, int(round(image.size[1] * (PREVIEW_THUMB_WIDTH / float(image.size[0])))))
        return image.resize((PREVIEW_THUMB_WIDTH, new_height), Image.Resampling.LANCZOS)
    except (PreviewTooLarge, ValueError):
        raise
    except Image.DecompressionBombError as e:
        raise PreviewTooLarge("image is too large") from e
    except Exception as e:
        raise ValueError(f"could not process image ({e})") from e
    finally:
        try:
            image.close()
        except Exception:
            pass


async def set_model_preview_handler(request: web.Request) -> web.Response:
    guard = require_json(request)
    if guard is not None:
        return guard

    try:
        ensure_data_folders()
        data = await request.json()
        rawPath = data.get("modelPath")
        base64_data = data.get("base64Data")
        if not rawPath or not base64_data:
            return web.Response(status=400, text="Missing 'modelPath' or 'base64Data'")

        if len(base64_data) > MAX_PREVIEW_BASE64_CHARS:
            return web.Response(status=413, text="Preview image is too large")

        pid = get_preview_id(rawPath)
        registry_json, image_folder = get_preview_paths(pid)

        match = re.match(r"data:(image/\w+);base64,(.+)", base64_data)
        if not match:
            return web.Response(status=400, text="Invalid data URL format")

        mime_type = match.group(1)
        encoded = match.group(2)
        try:
            raw_image = base64.b64decode(encoded)
        except Exception:
            return web.Response(status=400, text="Error decoding base64 image")

        # Everything is validated BEFORE anything is written to disk.
        try:
            img = make_preview_thumbnail(raw_image)
        except PreviewTooLarge as e:
            logger.warning(f"{SAUSMSG}: Rejected oversized preview for {rawPath!r}: {e}")
            return web.Response(status=413, text=f"Preview image rejected: {e}")
        except ValueError as e:
            logger.warning(f"{SAUSMSG}: Rejected invalid preview for {rawPath!r}: {e}")
            return web.Response(status=400, text=f"Invalid image: {e}")

        registry_json.parent.mkdir(parents=True, exist_ok=True)
        image_folder.mkdir(parents=True, exist_ok=True)

        full_path = image_folder / "full.jpg"
        with full_path.open("wb") as f:
            f.write(raw_image)

        thumb_path = image_folder / "thumbnail.jpg"
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
            guard = require_json(request)
            if guard is not None:
                return guard
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

async def restart_server_handler(request: web.Request) -> web.Response:
    try:
        # Requiring a JSON body forces a CORS preflight for cross-site callers,
        # which this server never answers, so a third-party page cannot trigger
        # a restart (CSRF). Anything else is refused outright.
        guard = require_json(request)
        if guard is not None:
            return guard
        data = await request.json()
        if not isinstance(data, dict) or data.get("confirm") is not True:
            return web.json_response(
                {"status": "error", "message": "Restart must be confirmed"},
                status=400,
            )

        def do_restart():
            import time
            import sys
            import os
            time.sleep(1)
            # Pin relative script arguments to absolute paths so the re-exec
            # works even if the working directory changed meanwhile.
            argv = [sys.executable] + [
                os.path.abspath(arg) if arg.endswith('.py') else arg for arg in sys.argv
            ]
            os.execv(sys.executable, argv)

        import threading
        threading.Thread(target=do_restart).start()

        return web.json_response({"status": "success", "message": "Server restarting..."})
    except Exception as e:
        logger.error(f"{SAUSMSG}: Error restarting server: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)
