import json
import logging
import queue
import threading

import requests

logger = logging.getLogger(__name__)

_QUEUE_MAXSIZE = 10


class EventPublisher:
    """Posts detection events to the server in a background thread.

    Usage::

        pub = EventPublisher(server_url, picker_id)
        pub.start()
        pub.register()
        # ... in main loop:
        pub.publish(event_dict)
    """

    def __init__(self, server_url: str, picker_id: str):
        self._server_url = server_url.rstrip("/")
        self._picker_id = picker_id
        self._queue: queue.Queue[dict] = queue.Queue(maxsize=_QUEUE_MAXSIZE)
        self._stream_url = f"http://localhost:8080/stream"  # overridden after start

    # ── Public API ────────────────────────────────────────────────────────

    def set_stream_url(self, url: str) -> None:
        self._stream_url = url

    def publish(self, event: dict) -> None:
        """Non-blocking: enqueue *event*.  Drops the oldest item if full."""
        try:
            self._queue.put_nowait(event)
        except queue.Full:
            try:
                self._queue.get_nowait()  # drop oldest
            except queue.Empty:
                pass
            try:
                self._queue.put_nowait(event)
            except queue.Full:
                pass

    def start(self) -> None:
        """Start the background draining thread."""
        thread = threading.Thread(target=self._drain, daemon=True)
        thread.start()
        logger.info("EventPublisher started (server=%s)", self._server_url)

    def register(self) -> None:
        """POST to {server_url}/pickers/register with picker_id and stream_url."""
        payload = {
            "picker_id":  self._picker_id,
            "stream_url": self._stream_url,
        }
        try:
            resp = requests.post(
                f"{self._server_url}/pickers/register",
                json=payload,
                timeout=5,
            )
            resp.raise_for_status()
            logger.info("Registered picker %s with server", self._picker_id)
        except requests.RequestException as exc:
            logger.warning("Picker registration failed: %s", exc)

    # ── Internal ──────────────────────────────────────────────────────────

    def _drain(self) -> None:
        while True:
            event = self._queue.get()  # blocks until an item is available
            self._post(event)

    def _post(self, event: dict) -> None:
        url = f"{self._server_url}/events/detection"
        try:
            resp = requests.post(
                url,
                data=json.dumps(event, default=str),
                headers={"Content-Type": "application/json"},
                timeout=3,
            )
            if resp.status_code >= 400:
                logger.warning(
                    "Event POST returned %d: %s", resp.status_code, resp.text[:200]
                )
        except requests.RequestException as exc:
            logger.warning("Event POST failed (%s): %s", url, exc)
