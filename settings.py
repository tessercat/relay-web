""" The relay settings module. """
import fnmatch
import os
import logging
from string import Template


base_dir = os.path.dirname(os.path.abspath(__file__))
logger = logging.getLogger("uvicorn.error")
templates = {}
versions = {}


def get_verto_template():
    """ Return the verto template """
    tpl_path = os.path.join(base_dir, "html", "verto.html")
    with open(tpl_path, encoding="utf-8") as tpl_fd:
        return Template(tpl_fd.read())


templates['verto'] = get_verto_template()


def get_adapter_version():
    """ Return the adapter filename. """
    js_dir = os.path.join(base_dir, "static", "js")
    for script in os.listdir(js_dir):
        if fnmatch.fnmatch(script, "adapter-*.js"):
            logger.info("Found %s", script)
            return script
    raise ValueError("No adapter")


versions['adapter'] = get_adapter_version()


def get_client_version():
    """ Return the client filename. """
    js_dir = os.path.join(base_dir, "static", "js")
    for script in os.listdir(js_dir):
        if fnmatch.fnmatch(script, "relay-client-*.js"):
            logger.info("Found %s", script)
            return script
    raise ValueError("No client")


versions['client'] = get_client_version()
