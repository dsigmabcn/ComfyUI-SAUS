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

# Images and media are content, not chrome: revalidating each one on every panel
# open is a round trip *per thumbnail* (29 of them), and the URL used to carry a
# cache-buster, which made it a full download instead of a 304. They may be reused
# for an hour; HTML, JS and CSS keep revalidating, so a fix is never invisible.
MEDIA_SUFFIXES = ('.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.svg', '.ico',
                  '.bmp', '.mp4', '.webm', '.ogg')
MEDIA_MAX_AGE = 3600

MIDDLEWARE_FLAG = '_saus_revalidate_middleware'


def should_revalidate(path: str) -> bool:
    """True for the files the shell is built from, never for an API response."""
    path = path or ''
    return path.startswith(REVALIDATE_PREFIXES) and not path.startswith(API_PREFIX)


def cache_control_for(path: str):
    """The Cache-Control for a served file, or None to leave its headers alone."""
    if not should_revalidate(path):
        return None
    if path.lower().endswith(MEDIA_SUFFIXES):
        return 'public, max-age=%d' % MEDIA_MAX_AGE
    return 'no-cache'


@web.middleware
async def revalidate_middleware(request, handler):
    response = await handler(request)
    header = cache_control_for(request.path)
    if header:
        response.headers['Cache-Control'] = header
    return response


def install(app) -> bool:
    """Add the middleware once. Returns False when it was already installed."""
    if getattr(app, MIDDLEWARE_FLAG, False):
        return False
    app.middlewares.append(revalidate_middleware)
    setattr(app, MIDDLEWARE_FLAG, True)
    return True
