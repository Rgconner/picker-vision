"""Local SQLite adapter — implements BaseAdapter against the SQLAlchemy models."""

import os
from datetime import datetime, timezone, timedelta
from typing import Any

from sqlalchemy import create_engine, text
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
        """Return all orders with status 'pending' or 'picking'.

        Orphaned demo orders — picking-status orders whose customer name matches
        the demo pattern and that were created more than 2 hours ago — are
        excluded.  They accumulate when a guest browser session ends without
        completing the order, and would otherwise appear on every new visitor's
        pick list indefinitely.
        """
        session = _get_session()
        try:
            orders = (
                session.query(Order)
                .filter(Order.status.in_(["pending", "picking"]))
                .all()
            )
            cutoff = datetime.now(timezone.utc) - timedelta(hours=2)
            result = []
            for o in orders:
                # Suppress orphaned demo orders older than 2 hours
                if (
                    o.customer and o.customer.startswith("Demo (")
                    and o.status == "picking"
                    and o.created_at is not None
                ):
                    created = o.created_at
                    # created_at may be naive (no tzinfo) — normalise to UTC
                    if created.tzinfo is None:
                        created = created.replace(tzinfo=timezone.utc)
                    if created < cutoff:
                        continue
                result.append(_order_to_dict(o, session))
            return result
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

            # Only include orders that are still active (pending/picking/packing).
            # Completed, packed, and cancelled orders are historical noise that
            # made the staging detail look permanently occupied.
            active_statuses = ("pending", "picking", "packing")
            lines = (
                session.query(OrderLine)
                .join(Order, OrderLine.order_id == Order.id)
                .filter(
                    OrderLine.staging_code == code,
                    Order.status.in_(active_statuses),
                )
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
        """Atomically increment quantity_picked by 1.

        Uses a conditional UPDATE (WHERE quantity_picked < quantity) so that
        concurrent requests for the same line are safe: only one write succeeds
        per pick slot.  A second concurrent call for an already-full line is a
        no-op — it returns the current line state without error or double-credit.

        * When quantity_picked reaches quantity → line status becomes "picked".
        * When all lines in the order are "picked" → order status becomes "complete".

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

            # Atomic conditional increment — only fires when there is still
            # capacity.  Returns the number of rows actually updated (0 or 1).
            rows_updated = session.execute(
                text(
                    "UPDATE order_lines "
                    "SET quantity_picked = quantity_picked + 1 "
                    "WHERE id = :lid "
                    "  AND order_id = :oid "
                    "  AND quantity_picked < quantity"
                ),
                {"lid": line_id, "oid": order_id},
            ).rowcount

            if rows_updated:
                session.refresh(line)
                if line.quantity_picked >= line.quantity:
                    line.status = "picked"

                all_lines = session.query(OrderLine).filter(
                    OrderLine.order_id == order_id
                ).all()
                if all(ln.status == "picked" for ln in all_lines):
                    order.status = "complete"

                session.commit()
                session.refresh(line)
            # rows_updated == 0: line already at capacity — return current
            # state unchanged; no commit needed.

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
