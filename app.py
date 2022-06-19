""" The relay web app module. """
from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.responses import HTMLResponse
from starlette.routing import Route
import settings


async def verto(request):
    """ Serve the verto call page. """
    callee = request.query_params.get("callee")
    if not callee:
        raise HTTPException(400, detail="Missing callee")
    html = settings.templates['verto'].substitute({
        "callee": callee,
        "adapter": settings.versions['adapter'],
        "client": settings.versions['client']
    })
    return HTMLResponse(html)


app = Starlette(routes=[
    Route("/verto", verto, methods=["GET"]),
])
