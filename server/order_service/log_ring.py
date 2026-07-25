"""In-memory log ring buffer handler.

Attaches to the root logger and captures up to LOG_RING_SIZE log records.
Exposes get_lines() which returns a list of serialisable dicts suitable for
the /logs HTTP endpoint.

Usage
-----
    import log_ring
    log_ring.attach()          # call once at startup, after basicConfig

    # In FastAPI:
    @app.get("/logs")
    def get_logs():
        return {"service": SERVICE_NAME, "lines": log_ring.get_lines()}
"""

import collections
import logging
import os
import time
from typing import Any

_RING_SIZE = int(os.environ.get("LOG_RING_SIZE", "200"))


class _RingBufferHandler(logging.Handler):
    def __init__(self, maxlen: int = _RING_SIZE):
        super().__init__()
        self._buf: collections.deque[dict[str, Any]] = collections.deque(maxlen=maxlen)

    def emit(self, record: logging.LogRecord) -> None:
        try:
            self._buf.append({
                "ts":      record.created,          # float epoch — sortable
                "time":    self.formatTime(record),  # human-readable
                "level":   record.levelname,
                "logger":  record.name,
                "message": record.getMessage(),
            })
        except Exception:  # noqa: BLE001
            self.handleError(record)

    def get_lines(self) -> list[dict[str, Any]]:
        return list(self._buf)


_handler: _RingBufferHandler | None = None


def attach(maxlen: int = _RING_SIZE) -> _RingBufferHandler:
    """Attach the ring-buffer handler to the root logger (idempotent)."""
    global _handler
    if _handler is None:
        _handler = _RingBufferHandler(maxlen=maxlen)
        _handler.setLevel(logging.DEBUG)
        logging.getLogger().addHandler(_handler)
    return _handler


def get_lines() -> list[dict[str, Any]]:
    """Return captured log lines (newest last). Safe to call before attach()."""
    if _handler is None:
        return []
    return _handler.get_lines()
