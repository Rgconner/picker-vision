from datetime import datetime

from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Product(Base):
    __tablename__ = "products"

    barcode = Column(String, primary_key=True)          # Code 128 value e.g. "WH-00001"
    description = Column(String, nullable=False)
    sku = Column(String, nullable=False)
    weight_kg = Column(Float, nullable=False)


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
