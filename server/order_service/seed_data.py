"""Seed the database on first run.

The Bob's Tiny Treasures scenario is seeded by the BTT fixture script
(fixtures/bobs-tiny-treasures/seed_btt.py) which runs as a one-shot Job
in Kubernetes or manually via:

    python fixtures/bobs-tiny-treasures/seed_btt.py

This module is retained so existing startup call-sites don't break.
"""

from models import Product  # noqa: F401 — kept for import compatibility


def run_seed(session) -> None:  # noqa: ARG001
    """No-op — seeding is handled by seed_btt.py."""
    return
