import logging
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_MJPEG_QUALITY = int(os.environ.get("MJPEG_QUALITY", "80"))
_BOUNDARY = b"--frame"


class MJPEGStreamer:
    """Simple HTTP MJPEG streaming server.

    Call ``update_frame(frame)`` from the main capture loop.
    Call ``start()`` once to launch the HTTP server in a daemon thread.
    """

    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self._host = host
        self._port = port
        self._frame_bytes: bytes | None = None
        self._lock = threading.Lock()
        self._fps = int(os.environ.get("FRAME_FPS", "15"))

    # ── Public API ────────────────────────────────────────────────────────

    def update_frame(self, frame: np.ndarray) -> None:
        """Encode *frame* as JPEG and store it for the stream."""
        encode_params = [int(cv2.IMWRITE_JPEG_QUALITY), _MJPEG_QUALITY]
        ok, buf = cv2.imencode(".jpg", frame, encode_params)
        if not ok:
            return
        with self._lock:
            self._frame_bytes = buf.tobytes()

    def get_frame_bytes(self) -> bytes | None:
        """Return the current JPEG bytes (thread-safe)."""
        with self._lock:
            return self._frame_bytes

    def start(self) -> None:
        """Start the HTTP server in a daemon thread."""
        streamer = self  # capture for handler closure
        fps = self._fps

        class _Handler(BaseHTTPRequestHandler):
            def log_message(self, fmt, *args):  # silence default access log
                pass

            def do_GET(self):
                if self.path == "/stream":
                    self._serve_stream()
                elif self.path == "/health":
                    self._serve_health()
                else:
                    self.send_error(404)

            def _serve_stream(self):
                self.send_response(200)
                self.send_header(
                    "Content-Type",
                    "multipart/x-mixed-replace; boundary=frame",
                )
                self.end_headers()
                interval = 1.0 / max(fps, 1)
                try:
                    while True:
                        jpg = streamer.get_frame_bytes()
                        if jpg:
                            chunk = (
                                _BOUNDARY + b"\r\n"
                                b"Content-Type: image/jpeg\r\n"
                                b"Content-Length: " + str(len(jpg)).encode() + b"\r\n"
                                b"\r\n" + jpg + b"\r\n"
                            )
                            self.wfile.write(chunk)
                            self.wfile.flush()
                        time.sleep(interval)
                except (BrokenPipeError, ConnectionResetError):
                    pass  # client disconnected

            def _serve_health(self):
                body = b'{"status": "ok"}'
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        server = HTTPServer((self._host, self._port), _Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        logger.info("MJPEG streamer listening on %s:%d", self._host, self._port)
