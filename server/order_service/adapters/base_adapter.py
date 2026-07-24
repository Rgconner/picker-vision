from abc import ABC, abstractmethod
from typing import Any


class BaseAdapter(ABC):

    @abstractmethod
    def get_orders(self) -> list[dict[str, Any]]:
        """Return all active orders (status pending or picking) with their lines."""
        ...

    @abstractmethod
    def get_order(self, order_id: str) -> dict[str, Any] | None:
        """Return a single order by ID, or None if not found."""
        ...

    @abstractmethod
    def get_product(self, barcode: str) -> dict[str, Any] | None:
        """Return product metadata by barcode, or None if not found."""
        ...

    @abstractmethod
    def get_staging(self, code: str) -> dict[str, Any] | None:
        """Return staging container info by 4-letter code, or None if not found."""
        ...

    @abstractmethod
    def mark_picked(self, order_id: str, line_id: str) -> dict[str, Any]:
        """Increment quantity_picked by 1 on the given line.

        When quantity_picked >= quantity the line status is set to "picked".
        When all lines in the order reach "picked" the order status is set to "complete".
        Returns the updated line dict.
        """
        ...

    @abstractmethod
    def confirm_packed(self, order_id: str) -> dict[str, Any]:
        """Mark the order as packed and lock all associated staging targets.

        Returns the updated order dict.
        """
        ...
