"""Local SQLite adapter — implements BaseAdapter against the SQLAlchemy models."""

import os
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from .base_adapter import BaseAdapter

# Import models relative to the order_service package root.
# When running inside the container, sys.path includes the service root, so
# a direct import works; when imported as a sub-package we go one level up.
try:
    from models import Order, OrderLine, Product, StagingContainer
except ImportError:
    import sys
    import pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
    from models import Order, OrderLine, Product, StagingContainer

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./picker.db")

_engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # required for SQLite
)
_SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)


def _get_session() -> Session:
    return _SessionLocal()


# ---------------------------------------------------------------------------
# Helper: serialise an OrderLine row to a plain dict
# ---------------------------------------------------------------------------

def _line_to_dict(line: OrderLine, product: Product | None, staging: StagingContainer | None) -> dict[str, Any]:
    return {
        "id": line.id,
        "order_id": line.order_id,
        "product_barcode": line.product_barcode,
        "product_description": product.description if product else None,
        "product_sku": product.sku if product else None,
        "quantity": line.quantity,
        "quantity_picked": line.quantity_picked,
        "staging_code": line.staging_code,
        "staging_label": staging.label if staging else None,
        "status": line.status,
    }


def _order_to_dict(order: Order, session: Session) -> dict[str, Any]:
    lines = []
    for line in order.lines:
        product = session.get(Product, line.product_barcode)
        staging = session.get(StagingContainer, line.staging_code)
        lines.append(_line_to_dict(line, product, staging))

    return {
        "id": order.id,
        "reference": order.reference,
        "customer": order.customer,
        "status": order.status,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "lines": lines,
    }


# ---------------------------------------------------------------------------
# Adapter implementation
# ---------------------------------------------------------------------------

class LocalAdapter(BaseAdapter):
    """SQLite-backed adapter using SQLAlchemy.  Thread-safe: each call opens
    and closes its own session so the adapter is safe for use with FastAPI's
    synchronous request handlers."""

    # ------------------------------------------------------------------
    # get_orders
    # ------------------------------------------------------------------

    def get_orders(self) -> list[dict[str, Any]]:
        """Return all orders with status 'pending' or 'picking'."""
        session = _get_session()
        try:
            orders = (
                session.query(Order)
                .filter(Order.status.in_(["pending", "picking"]))
                .all()
            )
            return [_order_to_dict(o, session) for o in orders]
        finally:
            session.close()

    # ------------------------------------------------------------------
    # get_order
    # ------------------------------------------------------------------

    def get_order(self, order_id: str) -> dict[str, Any] | None:
        session = _get_session()
        try:
            order = session.get(Order, order_id)
            if order is None:
                return None
            return _order_to_dict(order, session)
        finally:
            session.close()

    # ------------------------------------------------------------------
    # get_product
    # ------------------------------------------------------------------

    def get_product(self, barcode: str) -> dict[str, Any] | None:
        session = _get_session()
        try:
            product = session.get(Product, barcode)
            if product is None:
                return None
            return {
                "barcode": product.barcode,
                "description": product.description,
                "sku": product.sku,
                "weight_kg": product.weight_kg,
            }
        finally:
            session.close()

    # ------------------------------------------------------------------
    # get_staging
    # ------------------------------------------------------------------

    def get_staging(self, code: str) -> dict[str, Any] | None:
        session = _get_session()
        try:
            staging = session.get(StagingContainer, code)
            if staging is None:
                return None

            # Collect current order references for this staging target
            lines = (
                session.query(OrderLine)
                .filter(OrderLine.staging_code == code)
                .all()
            )
            order_ids = list({line.order_id for line in lines})

            return {
                "code": staging.code,
                "label": staging.label,
                "staging_type": staging.staging_type,
                "qr_payload": staging.qr_payload,
                "status": staging.status,
                "order_ids": order_ids,
            }
        finally:
            session.close()

    # ------------------------------------------------------------------
    # mark_picked
    # ------------------------------------------------------------------

    def mark_picked(self, order_id: str, line_id: str) -> dict[str, Any]:
        """Increment quantity_picked by 1.

        * When quantity_picked >= quantity → set line status to "picked".
        * When all lines in the order are "picked" → set order status to "complete".
        Returns the updated line dict.

        Raises ValueError if order or line is not found.
        """
        session = _get_session()
        try:
            order = session.get(Order, order_id)
            if order is None:
                raise ValueError(f"Order {order_id!r} not found")

            line = session.get(OrderLine, line_id)
            if line is None or line.order_id != order_id:
                raise ValueError(f"Line {line_id!r} not found in order {order_id!r}")

            # Increment and update status
            line.quantity_picked = min(line.quantity_picked + 1, line.quantity)
            if line.quantity_picked >= line.quantity:
                line.status = "picked"

            # Check if the whole order is now complete
            all_lines = session.query(OrderLine).filter(OrderLine.order_id == order_id).all()
            if all(ln.status == "picked" for ln in all_lines):
                order.status = "complete"

            session.commit()
            session.refresh(line)

            product = session.get(Product, line.product_barcode)
            staging = session.get(StagingContainer, line.staging_code)
            return _line_to_dict(line, product, staging)
        finally:
            session.close()

    # ------------------------------------------------------------------
    # confirm_packed
    # ------------------------------------------------------------------

    def confirm_packed(self, order_id: str) -> dict[str, Any]:
        """Set order status to 'packed' and lock all staging targets used by the order.

        Raises ValueError if order is not found.
        Returns the updated order dict.
        """
        session = _get_session()
        try:
            order = session.get(Order, order_id)
            if order is None:
                raise ValueError(f"Order {order_id!r} not found")

            order.status = "packed"

            # Lock every staging container referenced by the order's lines
            staging_codes = {line.staging_code for line in order.lines}
            for code in staging_codes:
                staging = session.get(StagingContainer, code)
                if staging is not None:
                    staging.status = "locked"

            session.commit()
            session.refresh(order)
            return _order_to_dict(order, session)
        finally:
            session.close()
