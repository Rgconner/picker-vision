"""Regional Simulation SQLAlchemy models.

Separate Base from order-service models — these tables live in Postgres
(LOAD_GEN_DATABASE_URL), not in the order-service SQLite database.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base, relationship

RSBase = declarative_base()


class RegionalSimulation(RSBase):
    """Top-level record for one Regional Simulation run."""

    __tablename__ = "regional_simulation"

    id           = Column(String, primary_key=True)          # UUID
    rs_id        = Column(String, nullable=False, unique=True)  # "RS-01", "RS-02"
    preset       = Column(String, nullable=False)            # "simple" | "busy" | "edge"
    months       = Column(Integer, nullable=False)
    generated_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    config_json  = Column(Text, nullable=False, default="{}")  # full preset config snapshot
    salt         = Column(String(16), nullable=False)        # hex string seeding picker RNG

    picker_profiles = relationship("RSPickerProfile", back_populates="simulation",
                                   cascade="all, delete-orphan")
    pick_events     = relationship("RSPickEvent", back_populates="simulation",
                                   cascade="all, delete-orphan")


class RSPickerProfile(RSBase):
    """Per-picker velocity profile for one Regional Simulation."""

    __tablename__ = "rs_picker_profile"

    id              = Column(String, primary_key=True)       # UUID
    simulation_id   = Column(String, ForeignKey("regional_simulation.id"), nullable=False)
    picker_id       = Column(String, nullable=False)         # "RS-01-CHI-001-P1"
    store_id        = Column(String, nullable=False)         # "CHI-001"
    baseline_picks_hr  = Column(Float, nullable=False)
    miscan_rate        = Column(Float, nullable=False)
    multi_scan_rate    = Column(Float, nullable=False)
    fatigue_rate       = Column(Float, nullable=False)       # % drop per hour after hour 2
    shift_hours        = Column(Float, nullable=False, default=12.0)

    simulation = relationship("RegionalSimulation", back_populates="picker_profiles")


class RSPickEvent(RSBase):
    """One synthetic pick event within a Regional Simulation."""

    __tablename__ = "rs_pick_event"

    id              = Column(String, primary_key=True)       # UUID
    simulation_id   = Column(String, ForeignKey("regional_simulation.id"), nullable=False)
    picker_id       = Column(String, nullable=False)
    store_id        = Column(String, nullable=False)
    simulated_at    = Column(DateTime, nullable=False)       # synthetic wall-clock time
    interval_sec    = Column(Float, nullable=False)          # post-fatigue, post-jitter
    predicted_interval_sec = Column(Float, nullable=False)   # what the model predicted
    miscan          = Column(Boolean, nullable=False, default=False)
    multi_scan      = Column(Boolean, nullable=False, default=False)

    simulation = relationship("RegionalSimulation", back_populates="pick_events")
