""" The relay web app module. """
import os
import logging
from string import Template
from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.responses import HTMLResponse
from starlette.routing import Route


logger = logging.getLogger("uvicorn.error")
base_dir = os.path.dirname(os.path.abspath(__file__))


def get_verto_template():
    """ Load the verto template """
    tpl_path = os.path.join(base_dir, "html", "verto.html")
    with open(tpl_path, encoding="utf-8") as tpl_fd:
        return Template(tpl_fd.read())


verto_template = get_verto_template()


async def verto(request):
    """ Serve the verto call page. """
    callee = request.query_params.get("callee")
    if not callee:
        raise HTTPException(400, detail="Missing callee")
    html = verto_template.substitute({"callee": callee})
    return HTMLResponse(html)


app = Starlette(routes=[
    Route("/verto", verto, methods=["GET"]),
])
