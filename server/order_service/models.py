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
    staging_code = Column(String(4), ForeignKey("staging_containers.code"), nullable=False)
    status = Column(String, nullable=False, default="pending")  # pending | picked | error
    order = relationship("Order", back_populates="lines")
