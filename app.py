""" The relay web app module. """
import http
from starlette.applications import Starlette
from starlette.exceptions import HTTPException
from starlette.routing import Route
import env


# Routes

async def client(request):
    """ Render the client page. """
    callee = request.query_params.get("callee")
    if not callee:
        raise HTTPException(400, detail="Missing callee")
    context = {
        "request": request,
        "title": f"Call {callee}",
        "adapter": env.scripts['adapter'],
        "client": env.scripts['client']
    }
    return env.templates.TemplateResponse("client.html", context)


routes = [
    Route("/client", client, methods=["GET"]),
]


# Exception handlers

def error(request, exc):
    """ Render the error page. """
    phrase = http.HTTPStatus(exc.status_code).phrase
    context = {
        "request": request,
        "title": f"{exc.status_code} {phrase}",
        "detail": exc.detail
    }
    env.logger.info(exc)
    return env.templates.TemplateResponse(
        "error.html",
        context,
        status_code=exc.status_code
    )


handlers = {
    400: error,
    404: error,
    500: error
}


app = Starlette(
    routes=routes,
    exception_handlers=handlers
)
