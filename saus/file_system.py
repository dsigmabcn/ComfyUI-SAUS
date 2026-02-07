import os
import shutil
import json
from pathlib import Path
from aiohttp import web

from .constants import (
    logger, COMFYUI_DIRECTORY, CUSTOM_THEMES_DIR,
    INPUT_FILES_DIRECTORY, OUTPUT_FILES_DIRECTORY, MODELS_DIRECTORY,
    COMFUI_LOGS_PATH
)
from .helpers import allowed_file

TEMP_UPLOAD_DIR = "/tmp/app_uploads"

async def directory_listing_handler(request: web.Request) -> web.Response:
    path_param = request.query.get("path")
    if not path_param:
        return web.json_response({"error": "Missing 'path' parameter"}, status=400)

    try:
        requested_path = Path(path_param).resolve()

        # Ensure the requested path is within the allowed models directory
        try:
            requested_path.relative_to(COMFYUI_DIRECTORY.resolve())
        except ValueError:
            return web.json_response({"error": "Access denied"}, status=403)


        if not requested_path.exists() or not requested_path.is_dir():
            return web.json_response({"error": "Directory not found"}, status=404)

        items = []
        for item in requested_path.iterdir():
            if item.name.startswith('.'):
                continue
            items.append({
                "name": item.name,
                "type": "folder" if item.is_dir() else "file"
            })

        return web.json_response(items)

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def rename_file_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        current_path = Path(data.get("currentPath")).resolve()
        new_name = data.get("newName")

        if not current_path.exists():
            return web.json_response({"error": "File not found"}, status=404)

        if not new_name:
            return web.json_response({"error": "Missing newName"}, status=400)

        if os.path.sep in new_name or (os.path.altsep and os.path.altsep in new_name) or new_name == '..':
            return web.json_response({"error": "Invalid newName"}, status=400)

        # Ensure the file is within the allowed directory
        try:
            current_path.relative_to(COMFYUI_DIRECTORY.resolve())
        except ValueError:
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
        try:
            file_path.relative_to(COMFYUI_DIRECTORY.resolve())
        except ValueError:
            return web.json_response({"error": "Access denied"}, status=403)

        if file_path.is_dir():
            shutil.rmtree(file_path)
        else:
            file_path.unlink()

        return web.json_response({"message": "Delete successful"})

    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)

async def upload_file_handler(request: web.Request) -> web.Response:
    try:
        reader = await request.multipart()
    except ValueError:
        return web.json_response({'error': 'Invalid content type'}, status=400)
    
    file_field = await reader.next()
    if not file_field or file_field.name != 'file':
        return web.json_response({'error': 'Missing or incorrect first field: expected file'}, status=400)
    
    file_content = await file_field.read()
    bytes_to_write = len(file_content)
    
    if bytes_to_write == 0:
        await reader.next() 
        return web.json_response({'error': 'File data stream empty (consumed by server).'}, status=500)

    target_path_field = await reader.next()
    
    if not target_path_field or target_path_field.name != 'targetPath':
        return web.json_response({'error': 'Missing or incorrect second field: expected targetPath'}, status=400)

    target_path = await target_path_field.text()
    resolved_target = Path(target_path).resolve()
    
    try:
        resolved_target.relative_to(COMFYUI_DIRECTORY.resolve())
    except ValueError:
        return web.json_response({'error': 'Access denied'}, status=403)
    
    filename = os.path.basename(file_field.filename)
    os.makedirs(resolved_target, exist_ok=True)
    file_path = resolved_target / filename

    try:
        with open(file_path, 'wb') as f:
            f.write(file_content)
    except Exception as e:
        return web.json_response({'error': f'Failed to save file: {e}'}, status=500)

    return web.json_response({'status': 'success', 'filename': filename})

async def download_file_handler(request: web.Request) -> web.Response:
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
    try:
        reader = await request.multipart()
    except ValueError:
        return web.json_response({'error': 'Invalid content type'}, status=400)

    data = {}
    while True:
        field = await reader.next()
        if field is None:
            break
        
        if field.name == 'fileChunk':
            data['chunk'] = await field.read()
            data['filename'] = field.filename
        else:
            data[field.name] = await field.text()

    file_id = data.get('fileId')
    target_path = data.get('targetPath')
    chunk_index = data.get('chunkIndex')
    is_last = data.get('isLast') == 'true'
    
    if not file_id or not data.get('chunk'):
        return web.json_response({'error': 'Missing fileId or chunk data'}, status=400)
    
    temp_file_dir = Path(TEMP_UPLOAD_DIR) / file_id
    temp_file_dir.mkdir(parents=True, exist_ok=True)
    
    chunk_path = temp_file_dir / f"chunk_{chunk_index}.part"
    with open(chunk_path, 'wb') as f:
        f.write(data['chunk'])

    if is_last:
        resolved_target = Path(target_path).resolve()
        try:
            resolved_target.relative_to(COMFYUI_DIRECTORY.resolve())
        except ValueError:
            return web.json_response({'error': 'Access denied'}, status=403)

        final_file_path = resolved_target / os.path.basename(data.get('fileName'))
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
                    if item.suffix.lower() in ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif', '.mp4', '.webm', '.ogg', '.mov', '.mkv']:
                        files.append(item.name)
        return web.json_response(files)
    except Exception as e:
        logger.error(f"Error listing input files: {e}")
        return web.json_response({"error": str(e)}, status=500)

async def get_logs_handler(request: web.Request) -> web.Response:
    try:
        if COMFUI_LOGS_PATH.exists():
            with open(COMFUI_LOGS_PATH, 'r', encoding='utf-8', errors='replace') as f:
                logs = f.read()
            return web.json_response({"logs": logs})
        else:
            return web.json_response({"logs": "Log file not found."})
    except Exception as e:
        return web.json_response({"error": str(e)}, status=500)
