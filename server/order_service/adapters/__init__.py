"""Adapter factory.

Returns a configured adapter instance based on the USE_SAP_ADAPTER environment
variable.  Default is the local SQLite adapter.
"""

import os


def get_adapter():
    """Return the appropriate adapter based on env config."""
    if os.getenv("USE_SAP_ADAPTER", "false").lower() == "true":
        from .sap_adapter import SapAdapter
        return SapAdapter()
    from .local_adapter import LocalAdapter
    return LocalAdapter()


# Convenience re-exports for direct imports
from .base_adapter import BaseAdapter  # noqa: E402
from .local_adapter import LocalAdapter  # noqa: E402
from .sap_adapter import SapAdapter  # noqa: E402

__all__ = ["get_adapter", "BaseAdapter", "LocalAdapter", "SapAdapter"]
