from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()



class User(Base):
    __tablename__ = "users"

    id        = Column(String, primary_key=True)          # UUID
    name      = Column(String, nullable=False)
    role      = Column(String, nullable=False)             # "picker" | "supervisor"
    picker_id = Column(String, nullable=True)             # matches picker registry; pickers only
    pin_hash  = Column(String, nullable=False)            # SHA-256 hex of PIN/password


class CartType(Base):
    __tablename__ = "cart_types"

    id           = Column(String, primary_key=True)       # UUID
    name         = Column(String, nullable=False)         # e.g. "Push Cart"
    max_weight   = Column(Float, nullable=False)
    weight_unit  = Column(String, nullable=False, default="kg")   # "kg" | "lb"
    length_cm    = Column(Float, nullable=False, default=0)
    width_cm     = Column(Float, nullable=False, default=0)
    height_cm    = Column(Float, nullable=False, default=0)
    dim_unit     = Column(String, nullable=False, default="cm")   # "cm" | "in"
    active       = Column(Boolean, nullable=False, default=True)


class AiConfig(Base):
    __tablename__ = "ai_config"

    id                      = Column(Integer, primary_key=True, default=1)
    provider                = Column(String, nullable=False, default="none")
    endpoint_url            = Column(String, nullable=False, default="")
    api_key                 = Column(String, nullable=False, default="")
    model                   = Column(String, nullable=False, default="")
    scan_mandatory_ai       = Column(Boolean, nullable=False, default=False)
    batch_strategy_ai       = Column(Boolean, nullable=False, default=False)
    validation_threshold_ai = Column(Boolean, nullable=False, default=False)
    voice_mode_ai           = Column(Boolean, nullable=False, default=False)


class WorkflowConfig(Base):
    __tablename__ = "workflow_config"

    id                      = Column(Integer, primary_key=True, default=1)
    batch_mode              = Column(String, nullable=False, default="single")
    validation_threshold    = Column(Integer, nullable=False, default=5)
    voice_enabled_default   = Column(Boolean, nullable=False, default=True)
    haptic_enabled_default  = Column(Boolean, nullable=False, default=True)
    mid_pick_validate_after = Column(Integer, nullable=False, default=5)
    instance_profile        = Column(String, nullable=False, default="")   # "" | "bobs-tiny-treasures"
    demo_scenario           = Column(String, nullable=False, default="web-demo")  # "web-demo" | "physical-demo"


class Product(Base):
    __tablename__ = "products"

    barcode      = Column(String, primary_key=True)       # Code 128 value e.g. "WH-00001"
    description  = Column(String, nullable=False)
    sku          = Column(String, nullable=False)
    weight_kg    = Column(Float, nullable=False)
    location     = Column(String, nullable=True)          # sortable shelf ref e.g. "A03-B2-S4"
    volume_cm3   = Column(Float, nullable=True)           # for cart bin-pack
    size_class   = Column(String, nullable=True)          # S / M / L / XL fallback
    value_class  = Column(String, nullable=False, default="standard")  # "standard" | "high"
    size_inches  = Column(String, nullable=True)          # BTT physical footprint: "1x1" | "2x1" | "2x2"


class StagingContainer(Base):
    __tablename__ = "staging_containers"

    code = Column(String(4), primary_key=True)          # 4-letter code e.g. "ALPH"
    label = Column(String, nullable=False)              # human name e.g. "Alpha Bay 1"
    staging_type = Column(String, nullable=False)       # "area" or "container"
    qr_payload = Column(String, nullable=False)         # full QR string e.g. "STAGING:ALPH"
    status = Column(String, nullable=False, default="available")  # available | in_use | locked


class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True)               # UUID
    reference = Column(String, nullable=False)          # human reference e.g. "ORD-2024-001"
    customer = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending | picking | complete | packed
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    lines = relationship("OrderLine", back_populates="order")


class OrderLine(Base):
    __tablename__ = "order_lines"

    id = Column(String, primary_key=True)               # UUID
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    product_barcode = Column(String, ForeignKey("products.barcode"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    quantity_picked = Column(Integer, nullable=False, default=0)
    staging_code = Column(String(4), ForeignKey("staging_containers.code"), nullable=True)  # pre-pack hint; nullable for BTT tote workflow
    status = Column(String, nullable=False, default="pending")  # pending | picked | error
    order = relationship("Order", back_populates="lines")
    tote_assignments = relationship("ToteLineAssignment", back_populates="line")


# ---------------------------------------------------------------------------
# Bob's Tiny Treasures — tote packing models
# ---------------------------------------------------------------------------

class OrderTote(Base):
    """One physical Tiny Tote assigned to an order at pack time.

    Created by packer.py when an order transitions complete → packing.
    Multiple totes per order are allowed; each has its own 100 g weight cap.
    """
    __tablename__ = "order_totes"

    id                  = Column(String, primary_key=True)            # UUID
    order_id            = Column(String, ForeignKey("orders.id"), nullable=False)
    staging_code        = Column(String(4), ForeignKey("staging_containers.code"), nullable=True)  # delivery zone
    tote_seq            = Column(Integer, nullable=False, default=1)  # 1-based within order
    max_weight_kg       = Column(Float, nullable=False, default=0.1)  # 100 g cap
    assigned_weight_kg  = Column(Float, nullable=False, default=0.0)  # sum at plan time
    status              = Column(String, nullable=False, default="pending")  # pending | packing | verified | sealed
    layers              = relationship("ToteLayer", back_populates="tote", order_by="ToteLayer.layer_seq")
    assignments         = relationship("ToteLineAssignment", back_populates="tote")


class ToteLayer(Base):
    """One verifiable horizontal layer inside a tote (max 2 items).

    The picker is guided to place exactly these items, then verbally or
    visually verify before proceeding to the next layer.
    """
    __tablename__ = "tote_layers"

    id                  = Column(String, primary_key=True)            # UUID
    tote_id             = Column(String, ForeignKey("order_totes.id"), nullable=False)
    layer_seq           = Column(Integer, nullable=False)             # 1-based within tote
    status              = Column(String, nullable=False, default="pending")  # pending | verified | skipped
    verification_method = Column(String, nullable=True)               # "voice" | "camera" | "none"
    verification_result = Column(String, nullable=True)               # raw transcript / result
    tote                = relationship("OrderTote", back_populates="layers")
    assignments         = relationship("ToteLineAssignment", back_populates="layer",
                                       primaryjoin="ToteLayer.id == foreign(ToteLineAssignment.layer_id)")


class ToteLineAssignment(Base):
    """Maps an OrderLine (and a specific quantity) to a tote and layer.

    A single OrderLine may be split across totes if it spans the weight cap
    (e.g. qty=5 items where 3 fit in tote 1 and 2 spill to tote 2).
    """
    __tablename__ = "tote_line_assignments"

    id               = Column(String, primary_key=True)               # UUID
    tote_id          = Column(String, ForeignKey("order_totes.id"), nullable=False)
    line_id          = Column(String, ForeignKey("order_lines.id"), nullable=False)
    layer_id         = Column(String, ForeignKey("tote_layers.id"), nullable=True)  # set after layer creation
    quantity_in_tote = Column(Integer, nullable=False, default=1)     # may be < line.quantity
    layer_seq        = Column(Integer, nullable=False, default=1)      # which layer within this tote
    tote             = relationship("OrderTote", back_populates="assignments")
    line             = relationship("OrderLine", back_populates="tote_assignments")
    layer            = relationship("ToteLayer", back_populates="assignments",
                                    primaryjoin="ToteLineAssignment.layer_id == ToteLayer.id",
                                    foreign_keys="[ToteLineAssignment.layer_id]")


class WarehouseScenario(Base):
    """Named snapshot of a warehouse grid layout and stock assignments.

    The special row id='scratch' is upserted during live inventory scanning.
    Named rows are copies saved by the supervisor for reuse across test runs.
    """
    __tablename__ = "warehouse_scenarios"

    id         = Column(String, primary_key=True)                     # UUID or "scratch"
    name       = Column(String, nullable=False, unique=True)          # e.g. "3x3 Alpha Run"
    grid_rows  = Column(Integer, nullable=False, default=3)
    grid_cols  = Column(Integer, nullable=False, default=3)
    payload    = Column(String, nullable=False, default="[]")         # JSON: [{location_code, product_barcode, qty_on_hand}]
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
