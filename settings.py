""" The relay settings module. """
import fnmatch
import os
import logging
from jinja2 import Environment, FileSystemLoader


# Basics

base_dir = os.path.dirname(os.path.abspath(__file__))
logger = logging.getLogger("uvicorn.error")


# Templates

templates = {}
env = Environment(
    loader=FileSystemLoader("templates"),
    autoescape=True
)
for tpl in env.list_templates():
    templates[tpl] = env.get_template(tpl)
logger.info("Loaded templates %s", templates)


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
    js_dir = os.path.join(base_dir, "static", "js")
    for script in os.listdir(js_dir):
        if fnmatch.fnmatch(script, "relay-client-*.js"):
            logger.info("Found client %s", script)
            return script
    raise ValueError("No client")


scripts['client'] = get_client()
