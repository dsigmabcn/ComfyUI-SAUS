"""Cache headers for SAUS's own files.

aiohttp serves static files without a ``Cache-Control`` header, which leaves a
browser free to reuse its own copy for a while (heuristic caching). A changed
CSS, JS or HTML file could then stay invisible until a hard refresh, so a fix to
the shell looked like it "did not arrive" - and an older ``content.html`` could
even bring an older layout back. Revalidating every time costs a 304 and always
serves the current file.

``/core/`` (the shared page shell) and everything mounted under ``/saus/`` (the
browser, the file manager, the apps themselves) are covered; the JSON APIs keep
their own headers.
"""

from aiohttp import web

REVALIDATE_PREFIXES = ('/core/', '/saus/')
API_PREFIX = '/saus/api/'

MIDDLEWARE_FLAG = '_saus_revalidate_middleware'


def should_revalidate(path: str) -> bool:
    """True for the files the shell is built from, never for an API response."""
    path = path or ''
    return path.startswith(REVALIDATE_PREFIXES) and not path.startswith(API_PREFIX)


@web.middleware
async def revalidate_middleware(request, handler):
    response = await handler(request)
    if should_revalidate(request.path):
        response.headers['Cache-Control'] = 'no-cache'
    return response


def install(app) -> bool:
    """Add the middleware once. Returns False when it was already installed."""
    if getattr(app, MIDDLEWARE_FLAG, False):
        return False
    app.middlewares.append(revalidate_middleware)
    setattr(app, MIDDLEWARE_FLAG, True)
    return True
