import os
import re
import io
import shutil
import json
from pathlib import Path
from typing import Optional

from aiohttp import web

from .constants import (
    logger, SAUSMSG,
    INPUT_FILES_DIRECTORY, OUTPUT_FILES_DIRECTORY, MODELS_DIRECTORY,
    COMFUI_LOGS_PATH
)
from .helpers import allowed_file, resolve_within_roots, require_json, require_saus_header

TEMP_UPLOAD_DIR = "/tmp/app_uploads"

# Extensions the thumbnail endpoint will try to shrink (everything else is
# served as-is, or rejected). avif is here because the File Manager must at
# least *recognise* it; Pillow usually cannot decode it, and the handler then
# falls back to serving the original.
IMAGE_THUMB_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.webp', '.avif', '.bmp', '.gif'}

# Uploads arrive in 20 MB chunks from the File Manager; refuse anything much
# larger so a single request can never be buffered into memory.
MAX_UPLOAD_CHUNK_BYTES = 64 * 1024 * 1024
MAX_UPLOAD_FIELD_BYTES = 8 * 1024


async def read_part_capped(part, limit: int) -> bytes:
    """Read a multipart part without ever buffering more than ``limit`` bytes.

    Raises ``ValueError`` when the part is too big (the caller turns that into a
    413) instead of reading the whole thing first.
    """
    blocks = []
    total = 0
    while True:
        block = await part.read_chunk(256 * 1024)
        if not block:
            break
        total += len(block)
        if total > limit:
            raise ValueError(f"part exceeds {limit} bytes")
        blocks.append(block)
    return b"".join(blocks)


def scratch_dir_for(file_id: str) -> Optional[Path]:
    """The scratch folder for an upload's ``fileId``, or ``None`` when unusable.

    ``.`` and ``..`` survive the handler's character filter but would put the
    scratch folder outside the upload root (``/tmp/app_uploads/..`` *is* ``/tmp``),
    so they are refused here - as is anything that resolves away from that root.
    """
    if not file_id or file_id in ('.', '..'):
        return None
    root = Path(TEMP_UPLOAD_DIR)
    candidate = root / file_id
    if candidate.resolve().parent != root.resolve():
        return None
    return candidate

async def directory_listing_handler(request: web.Request) -> web.Response:
    path_param = request.query.get("path")
    if not path_param:
        return web.json_response({"error": "Missing 'path' parameter"}, status=400)

    try:
        # Confined to the user-data folders (input / output / models).
        requested_path = resolve_within_roots(path_param)
    except ValueError as e:
        logger.warning(f"{SAUSMSG}: directory listing denied for {path_param!r}: {e}")
        return web.json_response({"error": "Access denied"}, status=403)

    try:
        if not requested_path.exists() or not requested_path.is_dir():
            return web.json_response({"error": "Directory not found"}, status=404)

        items = []
        for item in requested_path.iterdir():
            if item.name.startswith('.'):
                continue
            entry = {
                "name": item.name,
                "type": "folder" if item.is_dir() else "file",
                "size": None,
                "mtime": None
            }
            try:
                stat = item.stat()
                if not item.is_dir():
                    entry["size"] = stat.st_size
                entry["mtime"] = stat.st_mtime
            except OSError:
                pass
            items.append(entry)

        return web.json_response(items)

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def thumbnail_handler(request: web.Request) -> web.Response:
    """A small, compressed preview of an input/output image (icon views).

    Uses Pillow when available (it ships with ComfyUI); otherwise it falls back
    to serving the original file so the grid still shows *something*.
    """
    path_param = request.query.get('path')
    if not path_param:
        return web.json_response({'error': "Missing 'path' parameter"}, status=400)

    try:
        file_path = resolve_within_roots(path_param)
    except ValueError as e:
        logger.warning(f"{SAUSMSG}: thumbnail denied for {path_param!r}: {e}")
        return web.json_response({'error': 'Access denied'}, status=403)

    # Probe: keep the call on its own line so the sink's location is *new* in the
    # diff. A trailing comment leaves the location unchanged, and CodeQL then
    # matches the alert to the pre-existing one - which would report "no new
    # alerts" whether or not the model pack works.
    file_exists = file_path.is_file()  # confined by resolve_within_roots()
    if not file_exists:
        return web.json_response({'error': 'File not found'}, status=404)

    if file_path.suffix.lower() not in IMAGE_THUMB_EXTENSIONS:
        return web.json_response({'error': 'Not an image'}, status=415)

    try:
        size = max(48, min(1024, int(request.query.get('size', '256'))))
    except (TypeError, ValueError):
        size = 256

    try:
        from PIL import Image
    except Exception:
        # No Pillow: hand back the original file (no compression).
        return web.FileResponse(file_path, headers={'Cache-Control': 'max-age=600'})

    try:
        with Image.open(file_path) as img:
            rgb = img.convert('RGB')
            rgb.thumbnail((size, size))
            buffer = io.BytesIO()
            try:
                rgb.save(buffer, format='WEBP', quality=72, method=4)
                content_type = 'image/webp'
            except Exception:
                buffer = io.BytesIO()
                rgb.save(buffer, format='JPEG', quality=72)
                content_type = 'image/jpeg'
        return web.Response(
            body=buffer.getvalue(),
            content_type=content_type,
            headers={'Cache-Control': 'max-age=600'},
        )
    except Exception as e:
        # An image Pillow cannot open (avif without its plugin, or anything
        # broken): hand the original back so the browser - which does decode
        # avif - can still show it, instead of failing the tile outright.
        logger.warning(f"{SAUSMSG}: thumbnail failed for {file_path} ({e}); serving the original")
        return web.FileResponse(file_path, headers={'Cache-Control': 'max-age=600'})


async def move_copy_handler(request: web.Request) -> web.Response:
    """Move (default) or copy files/folders between the allowed roots.

    Body: ``{ "sourcePaths": [...], "targetDir": "...", "copy": bool }``.
    Used by the File Manager's drag & drop (plain drag = move, Ctrl+drag = copy).
    """
    guard = require_json(request)
    if guard is not None:
        return guard

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'error': 'Invalid JSON'}, status=400)

    sources = data.get('sourcePaths')
    if isinstance(sources, str):
        sources = [sources]
    if not isinstance(sources, list) or not sources:
        return web.json_response({'error': 'Missing sourcePaths'}, status=400)

    copy = bool(data.get('copy'))

    try:
        target_dir = resolve_within_roots(data.get('targetDir'))
    except ValueError as e:
        logger.warning(f"{SAUSMSG}: transfer denied (target): {e}")
        return web.json_response({'error': 'Access denied'}, status=403)

    if not target_dir.exists() or not target_dir.is_dir():
        return web.json_response({'error': 'Target folder not found'}, status=404)

    moved = 0
    errors = []
    for source in sources:
        try:
            src = resolve_within_roots(source)
        except ValueError as e:
            errors.append(f'{source}: access denied')
            continue

        if not src.exists():
            errors.append(f'{src.name}: not found')
            continue

        dest = target_dir / src.name
        try:
            if src.resolve() == dest.resolve():
                continue  # dropped back into its own folder
        except OSError:
            pass

        if src.is_dir():
            try:
                dest.resolve().relative_to(src.resolve())
                errors.append(f'{src.name}: cannot move a folder into itself')
                continue
            except ValueError:
                pass

        if dest.exists():
            errors.append(f'{src.name}: already exists in the target folder')
            continue

        try:
            if copy:
                if src.is_dir():
                    shutil.copytree(src, dest)
                else:
                    shutil.copy2(src, dest)
            else:
                shutil.move(str(src), str(dest))
            moved += 1
        except Exception as e:
            errors.append(f'{src.name}: {e}')

    return web.json_response({'moved': moved, 'errors': errors})


async def rename_file_handler(request: web.Request) -> web.Response:
    guard = require_json(request)
    if guard is not None:
        return guard

    try:
        data = await request.json()
        new_name = data.get("newName")

        if not new_name or not isinstance(new_name, str):
            return web.json_response({"error": "Missing newName"}, status=400)

        if (os.path.sep in new_name or (os.path.altsep and os.path.altsep in new_name)
                or '/' in new_name or '\\' in new_name or new_name in ('.', '..')):
            return web.json_response({"error": "Invalid newName"}, status=400)

        if not allowed_file(new_name):
            return web.json_response({"error": "File type not allowed"}, status=400)

        # Confined to input / output / models (realpath + commonpath).
        try:
            current_path = resolve_within_roots(data.get("currentPath"))
        except ValueError as e:
            logger.warning(f"{SAUSMSG}: rename denied: {e}")
            return web.json_response({"error": "Access denied"}, status=403)

        if not current_path.exists():
            return web.json_response({"error": "File not found"}, status=404)

        new_path = current_path.parent / new_name

        current_path.rename(new_path)

        return web.json_response({"message": "Rename successful", "newPath": str(new_path)})

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)


async def delete_file_handler(request: web.Request) -> web.Response:
    guard = require_json(request)
    if guard is not None:
        return guard

    try:
        data = await request.json()

        # Confined to input / output / models (realpath + commonpath).
        try:
            file_path = resolve_within_roots(data.get("filePath"))
        except ValueError as e:
            logger.warning(f"{SAUSMSG}: delete denied: {e}")
            return web.json_response({"error": "Access denied"}, status=403)

        if not file_path.exists():
            return web.json_response({"error": "File not found"}, status=404)

        if file_path.is_dir():
            shutil.rmtree(file_path)
        else:
            file_path.unlink()

        return web.json_response({"message": "Delete successful"})

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def download_file_handler(request: web.Request) -> web.Response:
    """Serve a file for preview/download.

    Already confined to input / output / models (realpath + relative_to), which
    is why absolute paths from ComfyUI's executor are still accepted here.
    """
    file_path_str = request.query.get('filePath')

    if not file_path_str:
        return web.json_response({'error': 'Missing filePath parameter'}, status=400)

    if request.query.get('force_find'):
        target_filename = os.path.basename(file_path_str)
        for root, dirs, files in os.walk(OUTPUT_FILES_DIRECTORY):
            if target_filename in files:
                file_path_str = os.path.join(root, target_filename)
                break

    file_path = Path(file_path_str).resolve()
    allowed_dirs = [
        INPUT_FILES_DIRECTORY.resolve(),
        OUTPUT_FILES_DIRECTORY.resolve(),
        MODELS_DIRECTORY.resolve()
    ]
    
    is_allowed = False
    for allowed_dir in allowed_dirs:
        try:
            file_path.relative_to(allowed_dir)
            is_allowed = True
            break
        except ValueError:
            continue
            
    if not is_allowed:
        return web.json_response({'error': 'Invalid file path'}, status=403)

    file_name = file_path.name

    try:
        return web.FileResponse(file_path, headers={
            'Content-Disposition': f'inline; filename="{file_name}"',
            'Cache-Control': 'no-cache',
            'X-Content-Type-Options': 'nosniff'
        })
    except FileNotFoundError:
        return web.json_response({'error': 'File not found'}, status=404)
    except Exception as e:
        return web.json_response({'error': f'An error occurred: {e}'}, status=500)

async def upload_chunk_handler(request: web.Request) -> web.Response:
    guard = require_saus_header(request)
    if guard is not None:
        return guard

    try:
        reader = await request.multipart()
    except ValueError:
        return web.json_response({'error': 'Invalid content type'}, status=400)

    data = {}
    try:
        while True:
            field = await reader.next()
            if field is None:
                break

            if field.name == 'fileChunk':
                data['chunk'] = await read_part_capped(field, MAX_UPLOAD_CHUNK_BYTES)
                data['filename'] = field.filename
            else:
                raw = await read_part_capped(field, MAX_UPLOAD_FIELD_BYTES)
                data[field.name] = raw.decode('utf-8', errors='replace')
    except ValueError as e:
        logger.warning(f"{SAUSMSG}: upload rejected: {e}")
        return web.json_response(
            {'error': f'Upload part too large (limit {MAX_UPLOAD_CHUNK_BYTES // (1024 * 1024)} MB per chunk)'},
            status=413,
        )

    file_id = re.sub(r'[^A-Za-z0-9_.-]', '_', str(data.get('fileId') or ''))
    target_path = data.get('targetPath')
    chunk_index = re.sub(r'[^0-9]', '', str(data.get('chunkIndex') or '0')) or '0'
    is_last = data.get('isLast') == 'true'
    
    if not file_id or not data.get('chunk'):
        return web.json_response({'error': 'Missing fileId or chunk data'}, status=400)
    
    temp_file_dir = scratch_dir_for(file_id)
    if temp_file_dir is None:
        logger.warning(f"{SAUSMSG}: upload rejected: unusable fileId")
        return web.json_response({'error': 'Invalid fileId'}, status=400)
    temp_file_dir.mkdir(parents=True, exist_ok=True)
    
    chunk_path = temp_file_dir / f"chunk_{chunk_index}.part"
    with open(chunk_path, 'wb') as f:
        f.write(data['chunk'])

    if is_last:
        # Confined to input / output / models (realpath + commonpath).
        try:
            resolved_target = resolve_within_roots(target_path)
        except ValueError as e:
            logger.warning(f"{SAUSMSG}: upload denied: {e}")
            return web.json_response({'error': 'Access denied'}, status=403)

        safe_name = os.path.basename(str(data.get('fileName') or ''))
        if not safe_name or safe_name in ('.', '..') or not allowed_file(safe_name):
            return web.json_response({'error': 'File name not allowed'}, status=400)

        final_file_path = resolved_target / safe_name
        final_file_path.parent.mkdir(parents=True, exist_ok=True)
        
        try:
            with open(final_file_path, 'wb') as outfile:
                for i in range(int(chunk_index) + 1):
                    part_path = temp_file_dir / f"chunk_{i}.part"
                    with open(part_path, 'rb') as infile:
                        shutil.copyfileobj(infile, outfile)
            
            shutil.rmtree(temp_file_dir)
            
            return web.json_response({'status': 'success', 'message': 'File assembled successfully'})
            
        except Exception as e:
            logger.error(f"Assembly error for {file_id}: {e}")
            return web.json_response({'error': 'File assembly failed'}, status=500)
    
    return web.json_response({'status': 'chunk_received', 'chunk': chunk_index})

async def list_input_files_handler(request: web.Request) -> web.Response:
    try:
        files = []
        if INPUT_FILES_DIRECTORY.exists():
            for item in INPUT_FILES_DIRECTORY.iterdir():
                if item.is_file() and not item.name.startswith('.'):
                    if item.suffix.lower() in ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.bmp', '.gif', '.mp4', '.webm', '.ogg', '.mov', '.mkv']:
                        files.append(item.name)
        return web.json_response(files)
    except Exception as e:
        logger.error(f"Error listing input files: {e}")
        return web.json_response({"error": str(e)}, status=500)

def _resolve_comfyui_log():
    """Newest ComfyUI log file (ComfyUI names it comfyui_<port>.log when a port
    is set, so ``user/comfyui.log`` may not exist)."""
    if COMFUI_LOGS_PATH.exists():
        return COMFUI_LOGS_PATH
    try:
        candidates = sorted(
            COMFUI_LOGS_PATH.parent.glob("comfyui*.log"),
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
    except Exception:
        candidates = []
    return candidates[0] if candidates else None


async def get_logs_handler(request: web.Request) -> web.Response:
    try:
        log_path = _resolve_comfyui_log()
        if log_path is not None and log_path.exists():
            with open(log_path, 'r', encoding='utf-8', errors='replace') as f:
                logs = f.read()
            return web.json_response({"logs": logs, "path": str(log_path)})
        return web.json_response({"logs": "Log file not found."})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
