"""Regional Simulation batch generator.

Generates months of synthetic pick history for a named preset of stores and
pickers, writes it to Postgres in a single bulk insert, and returns the
completed RegionalSimulation record.

Usage
-----
    from simulator import generate_simulation
    rs = generate_simulation(preset="simple", months=3, db_url="postgresql://...")
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import random
import time
import uuid
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import create_engine, func, text
from sqlalchemy.orm import Session

from rs_models import RSBase, RSPickEvent, RSPickerProfile, RegionalSimulation

logger = logging.getLogger("simulator")

# ---------------------------------------------------------------------------
# Preset definitions
# ---------------------------------------------------------------------------

PRESETS: dict[str, Any] = {
    "simple": {
        "stores": [
            {
                "store_id": "CHI-001",
                "name": "Chicago",
                "shift_start": "08:00",
                "shift_end": "20:00",
                "cutoff": "17:00",
                "pickers": [
                    {"baseline": 22, "miscan": 0.08, "multi": 0.20, "fatigue": 0.05},
                    {"baseline": 14, "miscan": 0.15, "multi": 0.30, "fatigue": 0.08},
                    {"baseline": 31, "miscan": 0.05, "multi": 0.15, "fatigue": 0.03},
                ],
            },
            {
                "store_id": "DET-001",
                "name": "Detroit",
                "shift_start": "08:00",
                "shift_end": "20:00",
                "cutoff": "17:00",
                "pickers": [
                    {"baseline": 18, "miscan": 0.10, "multi": 0.25, "fatigue": 0.05},
                    {"baseline": 20, "miscan": 0.09, "multi": 0.22, "fatigue": 0.04},
                    {"baseline": 16, "miscan": 0.12, "multi": 0.28, "fatigue": 0.06},
                    {"baseline": 24, "miscan": 0.07, "multi": 0.18, "fatigue": 0.04},
                ],
            },
            {
                "store_id": "CLE-001",
                "name": "Cleveland",
                "shift_start": "08:00",
                "shift_end": "19:30",
                "cutoff": "16:30",
                "pickers": [
                    {"baseline": 28, "miscan": 0.06, "multi": 0.20, "fatigue": 0.04},
                ],
            },
        ]
    },
    "busy": {
        "stores": [
            {
                "store_id": "CHI-001",
                "name": "Chicago",
                "shift_start": "06:00",
                "shift_end": "22:00",
                "cutoff": "18:00",
                "pickers": [
                    {"baseline": 35, "miscan": 0.10, "multi": 0.25, "fatigue": 0.07},
                    {"baseline": 28, "miscan": 0.08, "multi": 0.20, "fatigue": 0.05},
                    {"baseline": 40, "miscan": 0.06, "multi": 0.15, "fatigue": 0.04},
                    {"baseline": 22, "miscan": 0.12, "multi": 0.28, "fatigue": 0.08},
                ],
            },
            {
                "store_id": "DET-001",
                "name": "Detroit",
                "shift_start": "07:00",
                "shift_end": "21:00",
                "cutoff": "17:00",
                "pickers": [
                    {"baseline": 30, "miscan": 0.09, "multi": 0.22, "fatigue": 0.06},
                    {"baseline": 25, "miscan": 0.11, "multi": 0.26, "fatigue": 0.07},
                    {"baseline": 35, "miscan": 0.07, "multi": 0.18, "fatigue": 0.05},
                ],
            },
            {
                "store_id": "CLE-001",
                "name": "Cleveland",
                "shift_start": "08:00",
                "shift_end": "20:00",
                "cutoff": "16:30",
                "pickers": [
                    {"baseline": 32, "miscan": 0.07, "multi": 0.20, "fatigue": 0.05},
                    {"baseline": 28, "miscan": 0.09, "multi": 0.23, "fatigue": 0.06},
                ],
            },
            {
                "store_id": "MKE-001",
                "name": "Milwaukee",
                "shift_start": "08:00",
                "shift_end": "20:00",
                "cutoff": "17:00",
                "pickers": [
                    {"baseline": 20, "miscan": 0.13, "multi": 0.30, "fatigue": 0.09},
                    {"baseline": 26, "miscan": 0.10, "multi": 0.24, "fatigue": 0.06},
                    {"baseline": 33, "miscan": 0.06, "multi": 0.16, "fatigue": 0.04},
                    {"baseline": 18, "miscan": 0.14, "multi": 0.32, "fatigue": 0.10},
                ],
            },
            {
                "store_id": "IND-001",
                "name": "Indianapolis",
                "shift_start": "07:00",
                "shift_end": "21:00",
                "cutoff": "17:30",
                "pickers": [
                    {"baseline": 27, "miscan": 0.10, "multi": 0.22, "fatigue": 0.06},
                    {"baseline": 31, "miscan": 0.08, "multi": 0.18, "fatigue": 0.04},
                    {"baseline": 24, "miscan": 0.11, "multi": 0.27, "fatigue": 0.07},
                    {"baseline": 19, "miscan": 0.13, "multi": 0.31, "fatigue": 0.09},
                    {"baseline": 38, "miscan": 0.05, "multi": 0.14, "fatigue": 0.03},
                ],
            },
        ]
    },
    "edge": {
        "stores": [
            {
                "store_id": "OVR-001",
                "name": "Overwhelmed",
                "shift_start": "08:00",
                "shift_end": "20:00",
                "cutoff": "15:00",
                "pickers": [
                    {"baseline": 8,  "miscan": 0.30, "multi": 0.50, "fatigue": 0.20},
                    {"baseline": 10, "miscan": 0.25, "multi": 0.45, "fatigue": 0.18},
                ],
            },
            {
                "store_id": "CAP-001",
                "name": "Spare Capacity",
                "shift_start": "08:00",
                "shift_end": "20:00",
                "cutoff": "18:00",
                "pickers": [
                    {"baseline": 45, "miscan": 0.02, "multi": 0.08, "fatigue": 0.01},
                    {"baseline": 50, "miscan": 0.01, "multi": 0.05, "fatigue": 0.01},
                    {"baseline": 42, "miscan": 0.03, "multi": 0.10, "fatigue": 0.02},
                ],
            },
        ]
    },
}

# ---------------------------------------------------------------------------
# Engine / session helpers
# ---------------------------------------------------------------------------

_engines: dict[str, Any] = {}


def _get_engine(db_url: str):
    if db_url not in _engines:
        engine = create_engine(db_url, pool_pre_ping=True)
        RSBase.metadata.create_all(engine)
        _engines[db_url] = engine
    return _engines[db_url]


# ---------------------------------------------------------------------------
# Core generator
# ---------------------------------------------------------------------------

def generate_simulation(preset: str, months: int, db_url: str) -> RegionalSimulation:
    """Generate a full Regional Simulation and persist it to Postgres.

    Returns the committed RegionalSimulation ORM object (detached after session
    closes — access scalar columns only).
    """
    if preset not in PRESETS:
        raise ValueError(f"Unknown preset {preset!r}. Valid: {list(PRESETS)}")

    engine = _get_engine(db_url)
    config = PRESETS[preset]
    t0 = time.monotonic()

    with Session(engine) as session:
        # Assign next RS number
        max_rs = session.execute(
            text("SELECT MAX(rs_id) FROM regional_simulation")
        ).scalar()
        if max_rs is None:
            next_num = 1
        else:
            # rs_id format "RS-01" → extract int
            try:
                next_num = int(max_rs.split("-")[-1]) + 1
            except (ValueError, AttributeError):
                next_num = 1
        rs_id = f"RS-{next_num:02d}"

        # Salt: sha256(rs_id + timestamp)[:16]
        salt_raw = hashlib.sha256(f"{rs_id}{time.time()}".encode()).hexdigest()[:16]

        sim_id = str(uuid.uuid4())
        sim = RegionalSimulation(
            id=sim_id,
            rs_id=rs_id,
            preset=preset,
            months=months,
            generated_at=datetime.utcnow(),
            config_json=json.dumps(config),
            salt=salt_raw,
        )
        session.add(sim)
        session.flush()  # write sim so FK is valid

        # Determine date range — end = today, start = months back
        end_date = date.today()
        # Approximate months → days
        start_date = end_date - timedelta(days=months * 30)

        _BATCH = 2000  # flush events every N rows — keeps peak memory flat

        profile_rows: list[dict] = []
        total_events = 0
        event_batch:  list[dict] = []

        for store in config["stores"]:
            store_id = store["store_id"]
            shift_start_h, shift_start_m = map(int, store["shift_start"].split(":"))
            shift_end_h,   shift_end_m   = map(int, store["shift_end"].split(":"))
            shift_seconds = ((shift_end_h * 60 + shift_end_m) -
                             (shift_start_h * 60 + shift_start_m)) * 60

            for p_idx, picker_def in enumerate(store["pickers"], start=1):
                picker_id = f"{rs_id}-{store_id}-P{p_idx}"

                # Seeded RNG — deterministic per picker in this RS
                rng = random.Random(salt_raw + picker_id)

                baseline_hr = picker_def["baseline"]
                miscan_rate = picker_def["miscan"]
                multi_rate  = picker_def["multi"]
                fatigue_rate = picker_def["fatigue"]
                base_interval = 3600.0 / baseline_hr  # seconds per pick at baseline

                profile_rows.append({
                    "id":               str(uuid.uuid4()),
                    "simulation_id":    sim_id,
                    "picker_id":        picker_id,
                    "store_id":         store_id,
                    "baseline_picks_hr": baseline_hr,
                    "miscan_rate":      miscan_rate,
                    "multi_scan_rate":  multi_rate,
                    "fatigue_rate":     fatigue_rate,
                    "shift_hours":      shift_seconds / 3600.0,
                })

                # Generate picks for every working day in the date range
                current = start_date
                while current <= end_date:
                    # Shift start datetime
                    shift_dt = datetime(
                        current.year, current.month, current.day,
                        shift_start_h, shift_start_m
                    )
                    shift_elapsed = 0.0  # seconds since shift start

                    while shift_elapsed < shift_seconds:
                        # Fatigue factor: flat for first 2 hrs, then drops
                        hrs_worked = shift_elapsed / 3600.0
                        if hrs_worked <= 2.0:
                            fatigue_factor = 1.0
                        else:
                            drop = (hrs_worked - 2.0) * fatigue_rate
                            fatigue_factor = max(0.40, 1.0 - drop)

                        # Predicted interval (no jitter) — what model expects
                        predicted_interval = base_interval / fatigue_factor

                        # Actual interval with ±15% Gaussian jitter
                        jitter = rng.gauss(1.0, 0.15)
                        actual_interval = predicted_interval * max(0.1, jitter)

                        shift_elapsed += actual_interval
                        if shift_elapsed > shift_seconds:
                            break

                        simulated_at = shift_dt + timedelta(seconds=shift_elapsed)

                        event_batch.append({
                            "id":                    str(uuid.uuid4()),
                            "simulation_id":         sim_id,
                            "picker_id":             picker_id,
                            "store_id":              store_id,
                            "simulated_at":          simulated_at,
                            "interval_sec":          round(actual_interval, 3),
                            "predicted_interval_sec": round(predicted_interval, 3),
                            "miscan":   rng.random() < miscan_rate,
                            "multi_scan": rng.random() < multi_rate,
                        })

                        if len(event_batch) >= _BATCH:
                            session.bulk_insert_mappings(RSPickEvent, event_batch)  # type: ignore[arg-type]
                            session.flush()
                            total_events += len(event_batch)
                            event_batch.clear()

                    current += timedelta(days=1)

        # Insert profiles and flush any remaining events
        if profile_rows:
            session.bulk_insert_mappings(RSPickerProfile, profile_rows)  # type: ignore[arg-type]
        if event_batch:
            session.bulk_insert_mappings(RSPickEvent, event_batch)        # type: ignore[arg-type]
            total_events += len(event_batch)
            event_batch.clear()

        session.commit()

    elapsed = time.monotonic() - t0
    logger.info(
        "generate_simulation: rs_id=%s preset=%s months=%d stores=%d events=%d elapsed=%.2fs",
        rs_id, preset, months,
        len(config["stores"]), total_events, elapsed,
    )

    # Return a lightweight dict-like record so caller doesn't need a live session
    return _SimResult(
        id=sim_id,
        rs_id=rs_id,
        preset=preset,
        months=months,
        generated_at=datetime.utcnow().isoformat(),
        salt=salt_raw,
        pick_count=total_events,
        elapsed_sec=round(elapsed, 3),
    )


class _SimResult:
    """Lightweight result object returned by generate_simulation (no open session needed)."""

    def __init__(self, **kwargs: Any):
        for k, v in kwargs.items():
            setattr(self, k, v)

    def to_dict(self) -> dict:
        return {k: v for k, v in self.__dict__.items() if not k.startswith("_")}


# ---------------------------------------------------------------------------
# Query helpers used by capacity.py and main.py
# ---------------------------------------------------------------------------

def list_simulations(db_url: str) -> list[dict]:
    """Return all RS records, most recent first."""
    engine = _get_engine(db_url)
    with Session(engine) as session:
        rows = session.execute(
            text("""
                SELECT id, rs_id, preset, months, generated_at, salt
                FROM regional_simulation
                ORDER BY generated_at DESC
            """)
        ).fetchall()
        return [
            {
                "id":           r.id,
                "rs_id":        r.rs_id,
                "preset":       r.preset,
                "months":       r.months,
                "generated_at": r.generated_at.isoformat() if r.generated_at else None,
                "salt":         r.salt,
            }
            for r in rows
        ]


def get_simulation(rs_id: str, db_url: str) -> dict | None:
    """Return RS record + picker profiles for rs_id."""
    engine = _get_engine(db_url)
    with Session(engine) as session:
        sim = session.execute(
            text("SELECT * FROM regional_simulation WHERE rs_id = :rs_id"),
            {"rs_id": rs_id},
        ).fetchone()
        if not sim:
            return None

        profiles = session.execute(
            text("""
                SELECT picker_id, store_id, baseline_picks_hr, miscan_rate,
                       multi_scan_rate, fatigue_rate, shift_hours
                FROM rs_picker_profile
                WHERE simulation_id = :sid
                ORDER BY store_id, picker_id
            """),
            {"sid": sim.id},
        ).fetchall()

        config = {}
        try:
            config = json.loads(sim.config_json)
        except Exception:
            pass

        return {
            "id":           sim.id,
            "rs_id":        sim.rs_id,
            "preset":       sim.preset,
            "months":       sim.months,
            "generated_at": sim.generated_at.isoformat() if sim.generated_at else None,
            "salt":         sim.salt,
            "config":       config,
            "picker_profiles": [
                {
                    "picker_id":        p.picker_id,
                    "store_id":         p.store_id,
                    "baseline_picks_hr": p.baseline_picks_hr,
                    "miscan_rate":      p.miscan_rate,
                    "multi_scan_rate":  p.multi_scan_rate,
                    "fatigue_rate":     p.fatigue_rate,
                    "shift_hours":      p.shift_hours,
                }
                for p in profiles
            ],
        }


def delete_simulation(rs_id: str, db_url: str) -> bool:
    """Delete RS and all its pick events + profiles. Returns True if deleted."""
    engine = _get_engine(db_url)
    with Session(engine) as session:
        sim = session.execute(
            text("SELECT id FROM regional_simulation WHERE rs_id = :rs_id"),
            {"rs_id": rs_id},
        ).fetchone()
        if not sim:
            return False
        sim_id = sim.id
        # Delete child rows first (Postgres FK constraints; no ON DELETE CASCADE on column level)
        session.execute(text("DELETE FROM rs_pick_event WHERE simulation_id = :id"), {"id": sim_id})
        session.execute(text("DELETE FROM rs_picker_profile WHERE simulation_id = :id"), {"id": sim_id})
        session.execute(text("DELETE FROM regional_simulation WHERE id = :id"), {"id": sim_id})
        session.commit()
    return True
