import os
import json
import asyncio
from pathlib import Path
from aiohttp import web
import aiohttp
from server import PromptServer

from .constants import (
    SAUSMSG, logger, MODELS_DIRECTORY, COMFYUI_DIRECTORY, DATA_DIR
)
from .helpers import extract_filename_from_response, decrypt_value

async def _download_worker(
    url,
    headers,
    target_path,
    progress_sender,
    completion_sender,
    error_sender,
    filename=None,
    resolve_filename_from_header=False,
    max_retries=5,
    connect_timeout=60,
    total_timeout=3600,
    retry_sleep=5
):
    logger.info(f"[Downloader] Background task started for URL: {url}")
    
    timeout = aiohttp.ClientTimeout(total=total_timeout, connect=connect_timeout)
    save_path = None
    
    if filename:
        save_path = Path(target_path) / filename

    async with aiohttp.ClientSession(timeout=timeout) as session:
        for attempt in range(max_retries):
            try:
                request_headers = headers.copy()
                mode = 'wb'
                downloaded_size = 0
                
                if save_path and os.path.exists(save_path):
                    downloaded_size = os.path.getsize(save_path)
                    if downloaded_size > 0:
                        request_headers['Range'] = f'bytes={downloaded_size}-'
                        mode = 'ab'
                        logger.info(f"[Downloader] Resuming {filename or 'file'} from byte {downloaded_size}")

                logger.info(f"[Downloader] Attempt {attempt+1}/{max_retries} connecting...")
                async with session.get(url, headers=request_headers) as resp:
                    if resp.status not in (200, 206):
                        error_msg = f"HTTP Error {resp.status}"
                        logger.error(f"[Downloader] {error_msg}")
                        if resp.status in [401, 403, 404]:
                            error_sender(filename or "unknown", error_msg)
                            return False
                        raise Exception(error_msg)
                    
                    current_filename = filename
                    if not current_filename:
                        if resolve_filename_from_header:
                            current_filename = extract_filename_from_response(resp, url)
                        else:
                            current_filename = Path(url).name
                        save_path = Path(target_path) / current_filename
                        logger.info(f"[Downloader] Resolved filename: {current_filename}, Saving to: {save_path}")

                    save_path.parent.mkdir(parents=True, exist_ok=True)
                    
                    total_size = int(resp.headers.get('Content-Length', 0))
                    if resp.status == 206:
                        content_range = resp.headers.get('Content-Range', '')
                        if content_range:
                            try:
                                total_size = int(content_range.split('/')[-1])
                            except (ValueError, IndexError):
                                pass
                    elif resp.status == 200 and downloaded_size > 0:
                        downloaded_size = 0
                        mode = 'wb'
                        logger.warning("[Downloader] Server ignored Range header, restarting download.")

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
                                    progress_sender(current_filename, current_total, total_size, progress)
                    
                    logger.info(f"[Downloader] Complete: {current_filename}")
                    completion_sender(current_filename, str(save_path))
                    return True

            except Exception as e:
                logger.error(f"[Downloader] Attempt {attempt + 1} failed: {e}")
                if attempt == max_retries - 1:
                    error_sender(filename or "unknown", str(e))
                
                if downloaded_size == 0 and save_path and save_path.exists():
                    os.remove(save_path)
                    
                await asyncio.sleep(retry_sleep)
    
    logger.error(f"Download failed after {max_retries} attempts for {filename or url}.")
    return False

#### API HANDLERS TO MANAGE DOWNLOADS OF FILES/MODELS ##################

async def download_generic_handler(request):
    try:
        data = await request.json()
        url = data.get('url')
        target_path = data.get('targetPath')
        api_token = data.get('apiToken')
        token_source = data.get('tokenSource')

        logger.info(f"[API] Received download request for: {url}")

        if not url or not target_path:
            return web.json_response({'error': 'Missing url or targetPath'}, status=400)

        resolved_target = Path(target_path).resolve()
        if not str(resolved_target).startswith(str(COMFYUI_DIRECTORY.resolve())):
             return web.json_response({"error": "Access denied: Target path outside allowed directories"}, status=403)

        headers = {}
        
        final_token = None
        if token_source in ['civitai', 'huggingface']:
            settings_file = DATA_DIR / "settings.json"
            if settings_file.exists():
                try:
                    with open(settings_file, 'r', encoding='utf-8') as f:
                        settings = json.load(f)
                    
                    key_map = {
                        'civitai': 'civitai_api_key',
                        'huggingface': 'huggingface_api_key'
                    }
                    encrypted_token = settings.get(key_map.get(token_source))
                    final_token = decrypt_value(encrypted_token)
                except Exception as e:
                    logger.error(f"Error reading stored token: {e}")
        elif api_token:
            final_token = api_token

        if final_token:
            headers['Authorization'] = f'Bearer {final_token}'

        def progress_sender(filename, downloaded, total, progress):
            PromptServer.instance.send_sync("file_download_progress", {
                "filename": filename,
                "progress": progress,
                "total_bytes": total,
                "downloaded_bytes": downloaded
            })

        def completion_sender(filename, path):
            PromptServer.instance.send_sync("file_download_complete", {
                "filename": filename,
                "path": path
            })

        def error_sender(filename, error):
            PromptServer.instance.send_sync("file_download_error", {"filename": filename, "error": error})

        asyncio.create_task(_download_worker(
            url=url,
            headers=headers,
            target_path=target_path,
            progress_sender=progress_sender,
            completion_sender=completion_sender,
            error_sender=error_sender,
            resolve_filename_from_header=True
        ))

        return web.json_response({'message': 'Download initiated in background'})

    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)

async def download_model_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        
        component_type = data.get('component_type')
        url_model = data.get('url_model')
        model_path = data.get('model_path')
        file_name = data.get('file_name')

        if not all([component_type, url_model, model_path]):
            return web.json_response({
                'status': 'error', 
                'message': f'Missing model URL, destination path, or component type. Received: type={component_type}, url={url_model}, path={model_path}'
            }, status=400)

        target_path = MODELS_DIRECTORY / model_path.strip('/\\')

        def progress_sender(filename, downloaded, total, progress):
            PromptServer.instance.send_sync("model_download_progress", {
                "component_type": component_type,
                "model_path": model_path,
                "file_name": filename,
                "progress": progress
            })

        def completion_sender(filename, path):
            PromptServer.instance.send_sync("model_download_complete", {
                "component_type": component_type,
                "model_path": model_path,
                "file_name": filename
            })

        def error_sender(filename, error):
            # The original function did not send an error notification via WebSocket.
            # Logging is handled by the worker.
            pass

        asyncio.create_task(_download_worker(
            url=url_model,
            headers={},
            target_path=target_path,
            progress_sender=progress_sender,
            completion_sender=completion_sender,
            error_sender=error_sender,
            filename=file_name,
            resolve_filename_from_header=False,
            retry_sleep=10 # Use longer sleep as in original function
        ))

        return web.json_response({'status': 'initiated', 'message': 'Download started in the background.'})

    except Exception as e:
        logger.error(f"Error handling download request: {e}", exc_info=True)
        return web.json_response({'status': 'error', 'message': 'Internal Server Error'}, status=500)

async def check_model_status_handler(request: web.Request) -> web.Response:
    model_path = request.query.get('model_path', '')
    file_id = request.query.get('file_id', '')

    if not model_path or not file_id:
        return web.json_response({'status': 'error', 'message': 'Missing model_path or file_id'}, status=400)

    full_file_path = MODELS_DIRECTORY / model_path.strip('/\\') / file_id 

    try:
        full_file_path.resolve().relative_to(MODELS_DIRECTORY.resolve())
    except ValueError:
        return web.json_response({'status': 'error', 'message': 'Invalid file path.'}, status=403)

    if full_file_path.exists() and full_file_path.is_file():
        status = 'ready'
    else:
        status = 'missing'

    return web.json_response({'status': status})

async def delete_model_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        file_id = data.get('file_id')
        model_path = data.get('model_path')

        if not file_id or not model_path:
            return web.json_response({'status': 'error', 'message': 'Missing file_id or model_path'}, status=400)

        full_file_path = MODELS_DIRECTORY / model_path.strip('/\\') / file_id

        try:
            full_file_path.resolve().relative_to(MODELS_DIRECTORY.resolve())
        except ValueError:
            return web.json_response({'status': 'error', 'message': 'Invalid file path or security violation.'}, status=403)

        if full_file_path.exists() and full_file_path.is_file():
            os.remove(full_file_path)
            return web.json_response({'status': 'success', 'message': f'File {file_id} deleted.'})
        else:
            return web.json_response({'status': 'error', 'message': f'File not found at {full_file_path}'}, status=404)

    except Exception as e:
        logger.error(f"Error during file deletion: {e}")
        return web.json_response({'status': 'error', 'message': 'Internal Server Error'}, status=500)