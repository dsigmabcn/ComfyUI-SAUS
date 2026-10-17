from aiohttp import web
from pathlib import Path

class RouteManager:

    @staticmethod
    def create_routes(base_path: str, app_dir: Path,
                      page_template: Path = None) -> web.RouteTableDef:
        routes = web.RouteTableDef()
        # An app may ship its own index.html; the shipped apps all use the shared page.
        index_html = app_dir / 'index.html'
        if not index_html.is_file() and page_template is not None:
            index_html = page_template
        headers = {'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache'}

        # The page routes MUST be registered before the static mount: aiohttp answers a
        # request that resolves to a directory with "403 Forbidden" when show_index=False,
        # and the bare, trailing-slash and "/index.html" URLs all need the page.
        @routes.get(f"/{base_path}")
        async def serve_html(request: web.Request) -> web.FileResponse:
            return web.FileResponse(index_html, headers=headers)

        @routes.get(f"/{base_path}/")
        async def serve_html_trailing_slash(request: web.Request) -> web.FileResponse:
            return web.FileResponse(index_html, headers=headers)

        @routes.get(f"/{base_path}/index.html")
        async def serve_html_named(request: web.Request) -> web.FileResponse:
            return web.FileResponse(index_html, headers=headers)

        routes.static(f"/{base_path}/", path=app_dir, show_index=False)
        return routes

