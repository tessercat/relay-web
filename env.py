""" The relay env module. """
import fnmatch
import os
import logging
from starlette.templating import Jinja2Templates


# Basics

base_dir = os.path.dirname(os.path.abspath(__file__))
logger = logging.getLogger("uvicorn.error")


# Templates

templates = Jinja2Templates(
    directory='templates',
    trim_blocks=True,
    lstrip_blocks=True
)
logger.info("Loaded templates %s", templates.env.list_templates())


# Scripts

scripts = {}


def get_adapter():
    """ Return the adapter filename. """
    script_dir = os.path.join(base_dir, "static", "js")
    for script in os.listdir(script_dir):
        if fnmatch.fnmatch(script, "adapter-*.js"):
            logger.info("Found adapter %s", script)
            return script
    raise ValueError("No adapter")


scripts['adapter'] = get_adapter()


def get_client():
    """ Return the client filename. """
    script_dir = os.path.join(base_dir, "static", "js")
    for script in os.listdir(script_dir):
        if fnmatch.fnmatch(script, "relay-client-*.js"):
            logger.info("Found client %s", script)
            return script
    raise ValueError("No client")


scripts['client'] = get_client()
