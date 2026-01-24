import os
from .saus.saus_node import NODE_CLASS_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS
from .saus.constants import WEB_DIRECTORY
from .saus.server_setup import setup_server

setup_server()
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']
