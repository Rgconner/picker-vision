"""SAP/OMS adapter stub.

Swap in by setting the environment variable USE_SAP_ADAPTER=true.
Every method raises NotImplementedError until the real integration is wired up.
"""

from typing import Any

from .base_adapter import BaseAdapter

_MSG = "SAP adapter not implemented. Set USE_SAP_ADAPTER=false to use the local simulation."


class SapAdapter(BaseAdapter):
    """Placeholder SAP/OMS adapter. Replace method bodies with real SAP calls."""

    def get_orders(self) -> list[dict[str, Any]]:
        raise NotImplementedError(_MSG)

    def get_order(self, order_id: str) -> dict[str, Any] | None:
        raise NotImplementedError(_MSG)

    def get_product(self, barcode: str) -> dict[str, Any] | None:
        raise NotImplementedError(_MSG)

    def get_staging(self, code: str) -> dict[str, Any] | None:
        raise NotImplementedError(_MSG)

    def mark_picked(self, order_id: str, line_id: str) -> dict[str, Any]:
        raise NotImplementedError(_MSG)

    def confirm_packed(self, order_id: str) -> dict[str, Any]:
        raise NotImplementedError(_MSG)
