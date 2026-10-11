from aiohttp import web
from pathlib import Path

class RouteManager:

    @staticmethod
    def create_routes(base_path: str, app_dir: Path) -> web.RouteTableDef:
        routes = web.RouteTableDef()
        index_html = app_dir / 'index.html'
        headers = {'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache'}

        # The page routes MUST be registered before the static mount.
        # aiohttp's static handler answers a request that resolves to a directory
        # with "403 Forbidden" when show_index=False, and the bare "<mount>" and
        # "<mount>/" URLs both resolve to the app directory. Without these two
        # routes, /saus/, /saus/<app>/ and similar return 403 instead of the page.
        @routes.get(f"/{base_path}")
        async def serve_html(request: web.Request) -> web.FileResponse:
            return web.FileResponse(index_html, headers=headers)

        @routes.get(f"/{base_path}/")
        async def serve_html_trailing_slash(request: web.Request) -> web.FileResponse:
            return web.FileResponse(index_html, headers=headers)

        routes.static(f"/{base_path}/", path=app_dir, show_index=False)
        return routes

