import os
import json
import socket
import asyncio
import ipaddress
from urllib.parse import urlparse, urljoin
from pathlib import Path
from aiohttp import web
import aiohttp
from server import PromptServer

from .constants import (
    SAUSMSG, logger, MODELS_DIRECTORY, COMFYUI_DIRECTORY, DATA_DIR
)
from .helpers import (
    extract_filename_from_response, resolve_within_roots, require_json
)
from .model_lookup import find_model, destination_for, resolves_inside

ALLOWED_HOSTS_FILE = DATA_DIR / "allowed_download_hosts.json"

# One explorer render can ask about every model of every visible app; cap the
# batch so a single request can never turn into an unbounded disk scan loop.
MAX_STATUS_BATCH_FILES = 500

# Hosts that may receive the user-supplied API token. Kept in a file on disk so
# the list can be reviewed or extended without touching the code.
DEFAULT_ALLOWED_DOWNLOAD_HOSTS = [
    "civitai.com",
    "huggingface.co",
    "hf.co",
]


def load_allowed_download_hosts():
    hosts = list(DEFAULT_ALLOWED_DOWNLOAD_HOSTS)
    try:
        if ALLOWED_HOSTS_FILE.exists():
            data = json.loads(ALLOWED_HOSTS_FILE.read_text(encoding='utf-8'))
            if isinstance(data, dict):
                data = data.get("hosts", [])
            if isinstance(data, list):
                hosts = [str(h).lower().strip() for h in data if str(h).strip()]
    except Exception as e:
        logger.error(f"{SAUSMSG}: Could not read {ALLOWED_HOSTS_FILE}: {e}")
    return hosts


def host_allowed_for_token(hostname) -> bool:
    """True when the domain (or a sub-domain of it) may receive the API token."""
    if not hostname:
        return False
    hostname = str(hostname).lower().rstrip('.')
    for allowed in load_allowed_download_hosts():
        allowed = allowed.lstrip('*.').lower()
        if hostname == allowed or hostname.endswith('.' + allowed):
            return True
    return False


def _is_blocked_address(ip) -> bool:
    return bool(ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified)


def validate_public_url(url: str) -> None:
    """Raise ValueError when ``url`` must not be fetched (SSRF guard).

    Refuses non-http(s) schemes, localhost, literal private/local addresses and
    any host name that resolves to a private / local / reserved address.
    """
    parsed = urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        raise ValueError(f"Invalid URL scheme: {parsed.scheme or 'none'}. Only http and https are allowed.")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL has no host")
    hostname = hostname.lower()
    if hostname == 'localhost' or hostname.endswith('.localhost'):
        raise ValueError("Access to localhost is denied")

    addresses = []
    try:
        addresses.append(ipaddress.ip_address(hostname))
    except ValueError:
        # Not a literal IP: resolve it and check every returned address.
        try:
            for info in socket.getaddrinfo(hostname, None):
                try:
                    addresses.append(ipaddress.ip_address(info[4][0]))
                except ValueError:
                    continue
        except socket.gaierror as e:
            raise ValueError(f"Could not resolve host '{hostname}': {e}")

    if not addresses:
        raise ValueError(f"Could not determine the address of '{hostname}'")

    for ip in addresses:
        if _is_blocked_address(ip):
            raise ValueError(f"Access to private/local address {ip} is denied")


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

    # Never trust a caller/remote supplied name.
    if filename:
        filename = os.path.basename(str(filename).replace('\\', '/'))

    # Validate the URL to prevent Server Side Request Forgery (SSRF).
    try:
        validate_public_url(url)
    except Exception as e:
        logger.error(f"[Downloader] Security validation failed for {url}: {e}")
        error_sender(filename or "unknown", str(e))
        return False
    
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
                async with session.get(url, headers=request_headers, allow_redirects=False) as resp:
                    if resp.status in (301, 302, 303, 307, 308):
                        location = resp.headers.get('Location')
                        if not location:
                            error_sender(filename or "unknown", "Redirect response without a Location header")
                            return False
                        url = urljoin(url, location)
                        try:
                            validate_public_url(url)
                        except Exception as e:
                            logger.error(f"[Downloader] Blocked redirect to {url}: {e}")
                            error_sender(filename or "unknown", str(e))
                            return False
                        logger.info(f"[Downloader] Following validated redirect to {url}")
                        continue

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
                        # Reduce the remote-supplied name to a base name and refuse
                        # empty / traversal names.
                        current_filename = os.path.basename(str(current_filename).replace('\\', '/'))
                        if not current_filename or current_filename in ('.', '..'):
                            error_sender(filename or "unknown", "Server returned an unsafe file name")
                            return False
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
        # JSON-only: forces a CORS preflight for cross-site callers, which this
        # server never answers (CSRF guard).
        guard = require_json(request)
        if guard is not None:
            return guard

        data = await request.json()
        url = data.get('url')
        target_path = data.get('targetPath')
        api_token = data.get('apiToken')

        logger.info(f"[API] Received download request for: {url}")

        if not url or not target_path:
            return web.json_response({'error': 'Missing url or targetPath'}, status=400)

        # Confined to input / output / models (realpath + commonpath).
        try:
            resolved_target = resolve_within_roots(target_path)
        except ValueError as e:
            logger.warning(f"{SAUSMSG}: download target denied: {e}")
            return web.json_response(
                {"error": "Access denied: target path must be inside input, output or models"},
                status=403,
            )

        headers = {}

        # SAUS no longer stores API tokens. The only token that can be attached
        # is the one the user typed for this request, and it is only sent to the
        # hosts listed in allowed_download_hosts.json.
        if api_token and isinstance(api_token, str) and api_token.strip():
            request_host = (urlparse(url).hostname or '')
            if host_allowed_for_token(request_host):
                headers['Authorization'] = f'Bearer {api_token.strip()}'
                logger.info(f"[Downloader] API token attached for {request_host}")
            else:
                logger.warning(
                    f"[Downloader] Token not sent: {request_host} is not listed in "
                    f"{ALLOWED_HOSTS_FILE.name}"
                )

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
            target_path=str(resolved_target),
            progress_sender=progress_sender,
            completion_sender=completion_sender,
            error_sender=error_sender,
            resolve_filename_from_header=True,
            max_retries=10,
        ))

        return web.json_response({'message': 'Download initiated in background'})

    except Exception as e:
        return web.json_response({'error': str(e)}, status=500)

async def download_model_handler(request: web.Request) -> web.Response:
    guard = require_json(request)
    if guard is not None:
        return guard

    try:
        data = await request.json()

        component_type = data.get('component_type')
        url_model = data.get('url_model')
        model_path = (data.get('model_path') or '').strip()
        file_name = data.get('file_name')

        if not all([component_type, url_model]):
            return web.json_response({
                'status': 'error',
                'message': f'Missing model URL or component type. Received: type={component_type}, url={url_model}'
            }, status=400)

        # Already installed in *any* folder ComfyUI looks at? Then the registry
        # folder is only a hint and there is nothing to fetch (no duplicate copy).
        if file_name:
            existing = find_model(file_name, component_type, model_path)
            if existing:
                logger.info(
                    f"{SAUSMSG}: '{file_name}' is already installed at "
                    f"{existing['relative_name']} ({existing['folder_type']}); download skipped"
                )
                return web.json_response({
                    'status': 'already_installed',
                    'found_at': existing['relative_name'],
                    'message': f"'{file_name}' is already installed.",
                })

        # Destination: the registry hint when it is usable, otherwise the folder
        # ComfyUI uses for this kind of model (respects --models-directory and
        # extra_model_paths.yaml).
        target_path = None
        if model_path:
            candidate = (MODELS_DIRECTORY / model_path.strip('/\\')).resolve()
            try:
                candidate.relative_to(MODELS_DIRECTORY.resolve())
                target_path = candidate
            except ValueError:
                target_path = None

        if target_path is None:
            target_path = destination_for(component_type, model_path)
        if target_path is None:
            target_path = MODELS_DIRECTORY / 'diffusion_models'

        target_path = Path(target_path)
        try:
            target_path.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            logger.error(f"{SAUSMSG}: Could not create download folder {target_path}: {e}")
            return web.json_response({'status': 'error', 'message': 'Could not create the target folder'}, status=500)

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
    """Is the model installed? Any folder, any sub-folder counts."""
    file_id = request.query.get('file_id', '')
    if not file_id:
        return web.json_response({'status': 'error', 'message': 'Missing file_id'}, status=400)

    model_path = request.query.get('model_path', '')
    model_type = request.query.get('type', '')

    hit = find_model(file_id, model_type, model_path)
    if hit:
        return web.json_response({
            'status': 'ready',
            'found_at': hit['relative_name'],
            'folder_type': hit['folder_type'],
        })
    return web.json_response({'status': 'missing'})


async def check_model_status_batch_handler(request: web.Request) -> web.Response:
    """Batch form of ``check_model_status_handler``.

    The explorer asks about every model of every visible app at once, so one
    request replaces dozens of round-trips (each of which walks the model
    folders).

    Body: ``{"files": [{"file_id": "...", "model_path": "...", "type": "..."}]}``
    Response: ``{"statuses": {"<file_id>": "ready" | "missing"}}``
    """
    guard = require_json(request)
    if guard is not None:
        return guard

    try:
        data = await request.json()
    except Exception:
        return web.json_response({'status': 'error', 'message': 'Invalid JSON body'}, status=400)

    entries = data.get('files') if isinstance(data, dict) else None
    if not isinstance(entries, list):
        return web.json_response({'status': 'error', 'message': 'Missing files list'}, status=400)
    if len(entries) > MAX_STATUS_BATCH_FILES:
        return web.json_response(
            {'status': 'error', 'message': f'Too many files (max {MAX_STATUS_BATCH_FILES})'},
            status=413,
        )

    statuses = {}
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        file_id = str(entry.get('file_id') or '')
        if not file_id or file_id in statuses:
            continue
        model_path = str(entry.get('model_path') or '')
        model_type = str(entry.get('type') or '')
        statuses[file_id] = 'ready' if find_model(file_id, model_type, model_path) else 'missing'

    return web.json_response({'statuses': statuses})



async def delete_model_handler(request: web.Request) -> web.Response:
    try:
        data = await request.json()
        file_id = data.get('file_id')
        model_path = (data.get('model_path') or '').strip()

        if not file_id:
            return web.json_response({'status': 'error', 'message': 'Missing file_id'}, status=400)

        hit = find_model(file_id, data.get('type', ''), model_path)
        if not hit:
            return web.json_response(
                {'status': 'error', 'message': f'File {file_id} not found in any model folder.'},
                status=404,
            )

        target = Path(hit['path'])
        # Only ever delete inside a folder ComfyUI registered for this type --
        # never a request-supplied path.
        if not resolves_inside(target, hit['directories']):
            return web.json_response(
                {'status': 'error', 'message': 'Refusing to delete outside the model folders.'},
                status=403,
            )

        if target.is_file():
            os.remove(target)
            return web.json_response({
                'status': 'success',
                'message': f'File {file_id} deleted from {hit["relative_name"]}.',
            })

        return web.json_response({'status': 'error', 'message': f'File not found at {target}'}, status=404)

    except Exception as e:
        logger.error(f"Error during file deletion: {e}")
        return web.json_response({'status': 'error', 'message': 'Internal Server Error'}, status=500)
