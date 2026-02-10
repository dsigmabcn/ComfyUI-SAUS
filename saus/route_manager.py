from aiohttp import web
from pathlib import Path

class RouteManager:

    @staticmethod
    def create_routes(base_path: str, app_dir: Path) -> web.RouteTableDef:
        routes = web.RouteTableDef()
        index_html = app_dir / 'index.html'

        @routes.get(f"/{base_path}")
        async def serve_html(request: web.Request) -> web.FileResponse:
            return web.FileResponse(index_html, headers={'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache'})

        routes.static(f"/{base_path}/", path=app_dir, show_index=False)
        return routes
