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
import sys
from typing import Any

_RING_SIZE = int(os.environ.get("LOG_RING_SIZE", "200"))


class _RingBufferHandler(logging.Handler):
    """Thread-safe in-memory ring buffer for log records.

    Guard flag ``_emitting`` prevents re-entrant calls (e.g. httpx's own
    logger firing *inside* emit, which caused handleError recursion).
    """

    def __init__(self, maxlen: int = _RING_SIZE):
        super().__init__()
        self._buf: collections.deque[dict[str, Any]] = collections.deque(maxlen=maxlen)
        self._emitting = False   # re-entrancy guard

    def emit(self, record: logging.LogRecord) -> None:
        if self._emitting:
            return
        self._emitting = True
        try:
            # Format human-readable time directly from the record — avoids
            # calling self.formatTime() which requires a Formatter attached.
            import time as _time
            t = _time.strftime("%Y-%m-%d %H:%M:%S", _time.localtime(record.created))
            ms = int((record.created % 1) * 1000)
            self._buf.append({
                "ts":      record.created,
                "time":    f"{t},{ms:03d}",
                "level":   record.levelname,
                "logger":  record.name,
                "message": record.getMessage(),
            })
        except Exception as _e:  # noqa: BLE001  — never crash the calling thread
            sys.stderr.write(f"log_ring emit error: {_e}\n")
        finally:
            self._emitting = False

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
