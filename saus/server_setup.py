from aiohttp import web
import asyncio
import server
import os
from .app_manager import AppManager
from .downloader import download_update_apps
from .constants import SAUSMSG, logger

# Redirect handler for port 7771
async def redirect_handler(request):    
    host = request.headers.get('X-Forwarded-Host', request.host)
    print (f"host is {host}")
    SAUS_host = host.replace('-7771', '-8188')
    print (f"SAUS_host is {host}")
    SAUS_url = f"https://{SAUS_host}/saus"
    print (f"SAUS_url is {host}")
    raise web.HTTPFound(location=SAUS_url)

def start_redirect_server():
    async def run():
        app = web.Application()
        app.router.add_get('/', redirect_handler)

        runner = web.AppRunner(app)
        await runner.setup()
        site = web.TCPSite(runner, '0.0.0.0', 7771)
        await site.start()
        logger.info(f"{SAUSMSG}: Redirect server running on port 7771")

        # Keep the server running
        while True:
            await asyncio.sleep(3600)

    # Run the redirect server in a background thread
    import threading
    threading.Thread(target=lambda: asyncio.run(run()), daemon=True).start()

def setup_server() -> None:
    try:
        server_instance = server.PromptServer.instance
    except Exception as e:
        logger.error(f"{SAUSMSG}: Failed to get server instance: {e}")
        return

    if os.environ.get("RUNPOD_POD_ID"):
        # Set the maximum client request body size on the main application.
        # 50 GB = 53,687,091,200 bytes
        MAX_UPLOAD_SIZE = 53687091200 
        
        # Set the size limit on the existing application instance
        server_instance.app.client_max_size = MAX_UPLOAD_SIZE
        logger.info(f"{SAUSMSG}: Set client_max_size to {MAX_UPLOAD_SIZE} bytes for uploads.")
        TARGET_KEEPALIVE_TIMEOUT = 3600 
        
        try:
            # Check if the internal handler exists and modify its setting
            if hasattr(server_instance.app, '_handler') and server_instance.app._handler is not None:
                 server_instance.app._handler.keep_alive_timeout = TARGET_KEEPALIVE_TIMEOUT
                 logger.info(f"{SAUSMSG}: Successfully set server keep_alive_timeout to {TARGET_KEEPALIVE_TIMEOUT}s.")
            else:
                 # If the handler hasn't been created yet, this may be too early.
                 logger.warning(f"{SAUSMSG}: Application handler not yet available to set keep_alive_timeout.")
        except Exception as e:
             logger.error(f"{SAUSMSG}: Error setting keep_alive_timeout: {e}")

    download_update_apps()

    try:
        AppManager.setup_app_routes(server_instance.app)
    except Exception as e:
        logger.error(f"{SAUSMSG}: Failed to set up app routes: {e}")

    if os.environ.get("RUNPOD_POD_ID"):
        # If we are in Runpod, we start redirect server
        start_redirect_server()
