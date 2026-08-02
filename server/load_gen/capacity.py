"""Capacity metrics derivation for Regional Simulations.

Provides:
    store_capacity_signal(db_url, rs_id, store_id) → ARCH-003 shaped dict
    gantt_data(db_url, rs_id, granularity, start, end) → Gantt grid dict
"""

from __future__ import annotations

import json
import math
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from simulator import _get_engine


# ---------------------------------------------------------------------------
# ARCH-003 capacity signal
# ---------------------------------------------------------------------------

def store_capacity_signal(db_url: str, rs_id: str, store_id: str) -> dict | None:
    """Return current capacity signal for a single store — ARCH-003 shape.

    Based on the last 30 pick events in the simulation for that store.
    Returns None if the RS or store does not exist.
    """
    engine = _get_engine(db_url)
    with Session(engine) as session:
        # Resolve simulation ID
        sim_row = session.execute(
            text("""
                SELECT rs.id, rs.config_json
                FROM regional_simulation rs
                WHERE rs.rs_id = :rs_id
            """),
            {"rs_id": rs_id},
        ).fetchone()
        if not sim_row:
            return None

        config = {}
        try:
            config = json.loads(sim_row.config_json)
        except Exception:
            pass

        # Find store config for cutoff
        store_cfg = next(
            (s for s in config.get("stores", []) if s["store_id"] == store_id),
            None,
        )
        if store_cfg is None:
            return None

        cutoff = store_cfg.get("cutoff", "17:00")

        # Last 30 pick events for this store in this RS
        events = session.execute(
            text("""
                SELECT interval_sec, predicted_interval_sec, picker_id, simulated_at
                FROM rs_pick_event
                WHERE simulation_id = :sid
                  AND store_id = :store_id
                ORDER BY simulated_at DESC
                LIMIT 30
            """),
            {"sid": sim_row.id, "store_id": store_id},
        ).fetchall()

        if not events:
            return None

        # Active pickers — distinct picker IDs in last 30 events
        active_pickers = list({e.picker_id for e in events})
        picks_last_hour = len(events)  # last 30 serves as proxy

        avg_interval_sec = sum(e.interval_sec for e in events) / len(events)
        avg_pick_min = avg_interval_sec / 60.0

        # Estimate open_orders from config store pickers
        open_orders = len(store_cfg.get("pickers", [])) * 3  # rough proxy

        # How long to clear open_orders at current pace?
        estimated_clear_min = open_orders * avg_pick_min
        clear_dt = datetime.utcnow() + timedelta(minutes=estimated_clear_min)

        # Capacity score — inversely proportional to avg interval vs baseline
        picker_profiles = session.execute(
            text("""
                SELECT baseline_picks_hr FROM rs_picker_profile
                WHERE simulation_id = :sid AND store_id = :store_id
            """),
            {"sid": sim_row.id, "store_id": store_id},
        ).fetchall()

        if picker_profiles:
            avg_baseline_hr = sum(p.baseline_picks_hr for p in picker_profiles) / len(picker_profiles)
            # score = actual_rate / baseline_rate, capped [0, 1]
            actual_hr = 3600.0 / avg_interval_sec if avg_interval_sec > 0 else 0
            capacity_score = round(min(1.0, actual_hr / avg_baseline_hr), 2)
        else:
            capacity_score = 0.5

        accept_new = capacity_score >= 0.60

        return {
            "store_id":             store_id,
            "open_orders":          open_orders,
            "avg_pick_time_min":    round(avg_pick_min, 2),
            "next_carrier_cutoff":  cutoff,
            "estimated_clear_time": clear_dt.strftime("%H:%M"),
            "accept_new":           accept_new,
            "capacity_score":       capacity_score,
            "pickers_active":       len(active_pickers),
            "picks_last_hour":      picks_last_hour,
            "_meta": {
                "rs_id":         rs_id,
                "source":        "regional-simulation",
                "generated_at":  datetime.utcnow().isoformat(),
                "events_sampled": len(events),
            },
        }


def all_store_capacity_signals(db_url: str, rs_id: str) -> list[dict]:
    """Return capacity signals for all stores in a given RS."""
    engine = _get_engine(db_url)
    with Session(engine) as session:
        sim_row = session.execute(
            text("SELECT id, config_json FROM regional_simulation WHERE rs_id = :rs_id"),
            {"rs_id": rs_id},
        ).fetchone()
        if not sim_row:
            return []

        config = {}
        try:
            config = json.loads(sim_row.config_json)
        except Exception:
            pass

    store_ids = [s["store_id"] for s in config.get("stores", [])]
    results = []
    for sid in store_ids:
        signal = store_capacity_signal(db_url, rs_id, sid)
        if signal:
            results.append(signal)
    return results


def latest_rs_id(db_url: str) -> str | None:
    """Return the rs_id of the most recently generated simulation, or None."""
    engine = _get_engine(db_url)
    with Session(engine) as session:
        row = session.execute(
            text("SELECT rs_id FROM regional_simulation ORDER BY generated_at DESC LIMIT 1")
        ).fetchone()
        return row.rs_id if row else None


# ---------------------------------------------------------------------------
# Gantt grid
# ---------------------------------------------------------------------------

def gantt_data(
    db_url: str,
    rs_id: str,
    granularity: str,
    start: date,
    end: date,
) -> dict | None:
    """Return grid data for the Gantt chart.

    granularity: "hour" | "day" | "week"
    Returns:
        {
            stores: [{"store_id": ..., "name": ...}],
            buckets: [ISO timestamp str],
            cells: {
                "{store_id}:{bucket}": {
                    actual_picks, actual_avg_interval_sec,
                    predicted_picks, predicted_avg_interval_sec,
                    deviation_sigma
                }
            },
            std_dev_thresholds: {"green": 1.0, "yellow": 2.0}
        }
    """
    if granularity not in ("hour", "day", "week"):
        granularity = "day"

    engine = _get_engine(db_url)
    with Session(engine) as session:
        sim_row = session.execute(
            text("SELECT id, config_json FROM regional_simulation WHERE rs_id = :rs_id"),
            {"rs_id": rs_id},
        ).fetchone()
        if not sim_row:
            return None

        config = {}
        try:
            config = json.loads(sim_row.config_json)
        except Exception:
            pass

        stores = [
            {"store_id": s["store_id"], "name": s["name"]}
            for s in config.get("stores", [])
        ]
        store_ids = [s["store_id"] for s in stores]

        # Fetch all events in the date range
        start_dt = datetime(start.year, start.month, start.day, 0, 0, 0)
        end_dt   = datetime(end.year,   end.month,   end.day,   23, 59, 59)

        events = session.execute(
            text("""
                SELECT store_id, simulated_at, interval_sec, predicted_interval_sec
                FROM rs_pick_event
                WHERE simulation_id = :sid
                  AND simulated_at >= :start_dt
                  AND simulated_at <= :end_dt
                ORDER BY simulated_at
            """),
            {"sid": sim_row.id, "start_dt": start_dt, "end_dt": end_dt},
        ).fetchall()

        # Compute global stddev of predicted_interval_sec for the entire RS
        # (used as denominator for sigma calculation)
        global_stats = session.execute(
            text("""
                SELECT AVG(predicted_interval_sec) as mean_pred,
                       STDDEV_POP(predicted_interval_sec) as stddev_pred
                FROM rs_pick_event
                WHERE simulation_id = :sid
            """),
            {"sid": sim_row.id},
        ).fetchone()

    global_stddev = (global_stats.stddev_pred or 1.0) if global_stats else 1.0
    if global_stddev == 0:
        global_stddev = 1.0

    # Build bucket list
    buckets = _build_buckets(start, end, granularity)
    bucket_strs = [b.isoformat() for b in buckets]

    # Assign each event to its bucket
    # cells[store_id][bucket_str] → list of (interval_sec, predicted_interval_sec)
    cells_raw: dict[str, dict[str, list[tuple[float, float]]]] = {
        s: {b: [] for b in bucket_strs} for s in store_ids
    }

    for ev in events:
        bucket_str = _assign_bucket(ev.simulated_at, buckets, granularity)
        if bucket_str and ev.store_id in cells_raw:
            cells_raw[ev.store_id][bucket_str].append(
                (ev.interval_sec, ev.predicted_interval_sec)
            )

    # Build output cells
    cells: dict[str, Any] = {}
    for s_id in store_ids:
        for b_str in bucket_strs:
            ev_list = cells_raw[s_id][b_str]
            if not ev_list:
                continue
            actual_intervals    = [e[0] for e in ev_list]
            predicted_intervals = [e[1] for e in ev_list]

            actual_avg    = sum(actual_intervals) / len(actual_intervals)
            predicted_avg = sum(predicted_intervals) / len(predicted_intervals)

            deviation_sigma = abs(actual_avg - predicted_avg) / global_stddev

            cells[f"{s_id}:{b_str}"] = {
                "actual_picks":               len(ev_list),
                "actual_avg_interval_sec":    round(actual_avg, 2),
                "predicted_picks":            len(ev_list),  # same count
                "predicted_avg_interval_sec": round(predicted_avg, 2),
                "deviation_sigma":            round(deviation_sigma, 2),
            }

    return {
        "stores":    stores,
        "buckets":   bucket_strs,
        "cells":     cells,
        "std_dev_thresholds": {"green": 1.0, "yellow": 2.0},
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _build_buckets(start: date, end: date, granularity: str) -> list[datetime]:
    """Return ordered list of bucket start datetimes."""
    buckets: list[datetime] = []
    current = datetime(start.year, start.month, start.day, 0, 0, 0)
    end_dt  = datetime(end.year,   end.month,   end.day,   23, 59, 59)

    if granularity == "hour":
        while current <= end_dt:
            buckets.append(current)
            current += timedelta(hours=1)
    elif granularity == "day":
        while current <= end_dt:
            buckets.append(current)
            current += timedelta(days=1)
    elif granularity == "week":
        while current <= end_dt:
            buckets.append(current)
            current += timedelta(weeks=1)

    return buckets


def _assign_bucket(
    dt: datetime,
    buckets: list[datetime],
    granularity: str,
) -> str | None:
    """Return the ISO string of the bucket dt falls into."""
    if not buckets:
        return None

    if granularity == "hour":
        # Truncate to the hour
        key = datetime(dt.year, dt.month, dt.day, dt.hour)
    elif granularity == "day":
        key = datetime(dt.year, dt.month, dt.day)
    elif granularity == "week":
        # Monday of the week
        monday = dt - timedelta(days=dt.weekday())
        key = datetime(monday.year, monday.month, monday.day)
    else:
        key = datetime(dt.year, dt.month, dt.day)

    key_str = key.isoformat()
    # Only return if this bucket was in our precomputed list
    bucket_strs = {b.isoformat() for b in buckets}
    return key_str if key_str in bucket_strs else None
