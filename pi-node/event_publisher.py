"""Event publisher for the Picker Vision Pi node.

Design goals for headless / unattended operation
-------------------------------------------------
1. **Exponential backoff** — when the server is unreachable, retries slow
   from 2 s up to 60 s maximum.  Only one log line per state transition
   ("server offline" / "server back online") rather than a warning every frame.

2. **Offline buffer** — events are written to a local JSONL file while the
   server is unreachable.  When connectivity is restored the buffer is drained
   first so no detections are silently lost.

3. **Non-blocking** — publish() is always instant; all network I/O happens in
   a background daemon thread.

4. **Graceful registration retry** — register() retries with backoff rather
   than firing once and giving up.
"""

import json
import logging
import os
import queue
import threading
import time
import uuid
from pathlib import Path

import requests

logger = logging.getLogger(__name__)

_QUEUE_MAXSIZE   = 50          # in-memory queue depth before dropping
_OFFLINE_BUFFER  = Path(os.environ.get("OFFLINE_BUFFER_PATH", "/tmp/picker-events-offline.jsonl"))
_BACKOFF_START   = 2.0         # seconds before first retry after failure
_BACKOFF_MAX     = 60.0        # maximum retry interval
_BACKOFF_FACTOR  = 2.0         # multiply interval on each consecutive failure


class EventPublisher:
    """Posts detection events to the server in a background thread."""

    def __init__(self, server_url: str, picker_id: str, version: str = "unknown"):
        self._server_url  = server_url.rstrip("/")
        self._picker_id   = picker_id
        self._version     = version
        self._queue: queue.Queue[dict] = queue.Queue(maxsize=_QUEUE_MAXSIZE)
        self._stream_url   = ""
        self._control_url  = ""

        # Connectivity state — only log on transitions, not every frame
        self._server_online = False
        self._backoff        = _BACKOFF_START
        self._state_lock     = threading.Lock()

    # ── Public API ────────────────────────────────────────────────────────────

    def set_stream_url(self, url: str) -> None:
        self._stream_url = url

    def set_control_url(self, url: str) -> None:
        self._control_url = url

    def publish(self, event: dict) -> None:
        """Non-blocking: enqueue *event*. Drops oldest if queue is full."""
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            try:
                self._queue.get_nowait()   # drop oldest
            except queue.Empty:
                pass
            try:
                self._queue.put_nowait(event)
            except queue.Full:
                pass

    def start(self) -> None:
        """Start the background drain thread."""
        thread = threading.Thread(target=self._drain, daemon=True, name="event-publisher")
        thread.start()
        heartbeat = threading.Thread(target=self._heartbeat_loop, daemon=True, name="picker-heartbeat")
        heartbeat.start()
        logger.info("EventPublisher started (server=%s, offline_buffer=%s)",
                    self._server_url, _OFFLINE_BUFFER)

    def wait_for_server(self, timeout: float = 0) -> bool:
        """Block until the server health endpoint responds.

        Args:
            timeout: Maximum seconds to wait. 0 = wait forever.

        Returns:
            True once the server responds.  Never returns False (loops forever
            if timeout=0, which is the right behaviour for a headless device).
        """
        url      = f"{self._server_url}/health"
        deadline = time.monotonic() + timeout if timeout > 0 else None
        interval = _BACKOFF_START
        attempt  = 0

        while True:
            attempt += 1
            try:
                resp = requests.get(url, timeout=3)
                if resp.status_code == 200:
                    if attempt > 1:
                        logger.info("Server is reachable at %s (after %d attempt(s))",
                                    self._server_url, attempt)
                    return True
            except requests.RequestException:
                pass

            if deadline and time.monotonic() >= deadline:
                return False

            logger.warning(
                "Server not reachable at %s — retrying in %.0fs (attempt %d)...",
                self._server_url, interval, attempt,
            )
            time.sleep(interval)
            interval = min(interval * _BACKOFF_FACTOR, _BACKOFF_MAX)

    def register(self, retries: int = 10) -> bool:
        """POST to /pickers/register with exponential backoff.

        Args:
            retries: Maximum attempts before giving up (0 = unlimited).

        Returns:
            True if registration succeeded.
        """
        payload  = {
            "picker_id":   self._picker_id,
            "stream_url":  self._stream_url,
            "control_url": self._control_url,
            "version":     self._version,
        }
        logger.debug("Registration payload: %s", payload)
        interval = _BACKOFF_START
        attempt  = 0

        while retries == 0 or attempt < retries:
            attempt += 1
            try:
                resp = requests.post(
                    f"{self._server_url}/pickers/register",
                    json=payload,
                    timeout=5,
                )
                if not resp.ok:
                    logger.warning(
                        "Registration attempt %d failed: HTTP %d — response: %s",
                        attempt, resp.status_code, resp.text,
                    )
                    resp.raise_for_status()
                logger.info("Registered picker '%s' with server (attempt %d)",
                            self._picker_id, attempt)
                return True
            except requests.RequestException as exc:
                logger.warning(
                    "Registration attempt %d failed: %s — retrying in %.0fs",
                    attempt, exc, interval,
                )
                time.sleep(interval)
                interval = min(interval * _BACKOFF_FACTOR, _BACKOFF_MAX)

        logger.error("Picker registration gave up after %d attempts", retries)
        return False

    # ── Internal ──────────────────────────────────────────────────────────────

    def _drain(self) -> None:
        """Drain the in-memory queue; write to offline buffer when server is down."""
        while True:
            event = self._queue.get()

            # Drain any offline buffer before sending new events
            self._flush_offline_buffer()

            if not self._post(event):
                # Server unreachable — persist to local buffer
                self._write_offline(event)

    def _post(self, event: dict) -> bool:
        """POST a single event.  Returns True on success.

        Logs only on state transitions (online ↔ offline), not every failure.
        Uses exponential backoff between retries within a single call.
        """
        url = f"{self._server_url}/events/detection"
        try:
            resp = requests.post(
                url,
                data=json.dumps(event, default=str),
                headers={"Content-Type": "application/json"},
                timeout=3,
            )
            resp.raise_for_status()

            # Transition: offline → online
            with self._state_lock:
                if not self._server_online:
                    logger.info("Server connection restored (%s)", url)
                    self._server_online = True
                    self._backoff = _BACKOFF_START
            return True

        except requests.RequestException as exc:
            with self._state_lock:
                if self._server_online:
                    # Transition: online → offline — log once
                    logger.warning(
                        "Server offline (%s): %s — buffering events locally",
                        url, exc,
                    )
                    self._server_online = False
                    self._backoff = _BACKOFF_START
                else:
                    # Still offline — back off silently
                    time.sleep(self._backoff)
                    self._backoff = min(self._backoff * _BACKOFF_FACTOR, _BACKOFF_MAX)
            return False

    def _write_offline(self, event: dict) -> None:
        """Append an event to the offline JSONL buffer file."""
        try:
            with _OFFLINE_BUFFER.open("a") as fh:
                fh.write(json.dumps(event, default=str) + "\n")
        except OSError as exc:
            logger.error("Could not write to offline buffer %s: %s", _OFFLINE_BUFFER, exc)

    def _flush_offline_buffer(self) -> None:
        """Replay buffered events to the server, then delete the buffer file."""
        if not _OFFLINE_BUFFER.exists():
            return

        try:
            lines = _OFFLINE_BUFFER.read_text().splitlines()
        except OSError:
            return

        if not lines:
            _OFFLINE_BUFFER.unlink(missing_ok=True)
            return

        logger.info("Flushing %d offline-buffered events to server...", len(lines))
        sent = 0
        for line in lines:
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            if self._post(event):
                sent += 1
            else:
                # Server went down again mid-flush — re-buffer remaining lines
                remaining = lines[sent:]
                try:
                    _OFFLINE_BUFFER.write_text("\n".join(remaining) + "\n")
                except OSError as exc:
                    logger.error("Could not re-write offline buffer: %s", exc)
                logger.warning("Server went offline during flush — %d events re-buffered",
                               len(remaining))
                return

        logger.info("Offline buffer flushed (%d events sent)", sent)
        _OFFLINE_BUFFER.unlink(missing_ok=True)

    def _heartbeat_loop(self) -> None:
        time.sleep(30)
        while True:
            self.register(retries=0)
            time.sleep(30)
