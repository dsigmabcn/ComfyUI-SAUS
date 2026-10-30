import os
import time
from aiohttp import web

from .constants import (
    APP_VERSION, SAUSMSG, logger,
)
from .helpers import require_json

# When this module was first imported: on any server start it is a new value, which
# is what "a new session" means for the app state the browser keeps (see
# web/core/js/common/scripts/sessionState.js). Read once, never recomputed, so every
# request of one server run answers with the same stamp.
SESSION_STAMP = str(int(time.time() * 1000))


async def saus_version_handler(request: web.Request) -> web.Response:
    return web.json_response({'version': APP_VERSION}, headers={'Cache-Control': 'no-cache'})


async def session_handler(request: web.Request) -> web.Response:
    """The server run this browser is talking to, as an opaque stamp.

    A page reload or a closed tab keeps the remembered app state (the browser's own
    `sessionStorage`), while restarting ComfyUI invalidates it: the stamp is what
    tells the two apart. Nothing about the caller is stored here.
    """
    return web.json_response({'stamp': SESSION_STAMP}, headers={'Cache-Control': 'no-cache'})

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
