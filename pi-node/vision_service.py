import logging
import os
import pathlib
import threading
import time
from datetime import datetime, timezone

import cv2
import uvicorn
from fastapi import FastAPI
from pydantic import BaseModel

import barcode_detector
import camera_probe
import config_loader
import event_publisher as ep_module
import frame_annotator
import log_ring as _log_ring
import mjpeg_streamer as ms_module
import network_utils
import staging_detector

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

# ── Version ───────────────────────────────────────────────────────────────────
_VERSION_FILE = pathlib.Path(__file__).parent / "VERSION"
SERVICE_VERSION = (
    _VERSION_FILE.read_text().strip()
    if _VERSION_FILE.exists()
    else os.getenv("SERVICE_VERSION", "unknown")
)

# ── Configuration (env vars > config file > defaults) ─────────────────────────
_cfg         = config_loader.load()
SERVER_URL   = config_loader.require("SERVER_URL")   # hard-fail if missing
PICKER_ID    = _cfg["PICKER_ID"]
FRAME_WIDTH  = int(_cfg["FRAME_WIDTH"])
FRAME_HEIGHT = int(_cfg["FRAME_HEIGHT"])
FRAME_FPS    = int(_cfg["FRAME_FPS"])
STREAM_PORT  = int(_cfg["STREAM_PORT"])
CONTROL_PORT = int(_cfg["CONTROL_PORT"])

# ── Camera index resolution ───────────────────────────────────────────────────
_raw_index   = int(_cfg["CAMERA_INDEX"])
CAMERA_INDEX = camera_probe.find_camera(prefer_index=_raw_index if _raw_index >= 0 else None)

# ── Shared mutable state (guarded by a lock where needed) ─────────────────────
_running              = True
_validate_next_frame  = False
_locked_staging_codes: set[str] = set()
_state_lock           = threading.Lock()

# ── Telemetry counters ────────────────────────────────────────────────────────
import time as _time
from datetime import timezone as _tz
_STARTED_AT    = __import__("datetime").datetime.now(_tz.utc).isoformat()
_START_MONO    = _time.monotonic()
_frames_captured   = 0
_events_published  = 0
_last_event_at: str | None = None

# ── FastAPI control app ───────────────────────────────────────────────────────
_log_ring.attach()
app = FastAPI(title="Pi Vision Control", version=SERVICE_VERSION)


class ControlBody(BaseModel):
    action:       str
    staging_code: str | None = None


@app.get("/health")
def health():
    with _state_lock:
        frames   = _frames_captured
        events   = _events_published
        last_evt = _last_event_at
        running  = _running
    return {
        "status":           "ok",
        "service":          "pi-vision",
        "version":          SERVICE_VERSION,
        "picker_id":        PICKER_ID,
        "started_at":       _STARTED_AT,
        "uptime_seconds":   round(_time.monotonic() - _START_MONO),
        "camera_index":     CAMERA_INDEX,
        "running":          running,
        "counters": {
            "frames_captured":  frames,
            "events_published": events,
        },
        "last_event_at":    last_evt,
    }


@app.get("/logs")
def get_logs():
    return {"service": "pi-vision", "picker_id": PICKER_ID, "lines": _log_ring.get_lines()}


@app.post("/control")
def control(body: ControlBody):
    global _running, _validate_next_frame
    with _state_lock:
        if body.action == "start":
            _running = True
        elif body.action == "stop":
            _running = False
        elif body.action == "validate":
            _validate_next_frame = True
        elif body.action == "lock_staging" and body.staging_code:
            _locked_staging_codes.add(body.staging_code.upper())
        else:
            return {"acknowledged": False, "reason": "unknown action"}
    return {"acknowledged": True, "action": body.action}


# ── Main capture loop ─────────────────────────────────────────────────────────

def _run_capture(streamer: ms_module.MJPEGStreamer, publisher: ep_module.EventPublisher) -> None:
    global _validate_next_frame, _frames_captured, _events_published, _last_event_at

    # Use V4L2 backend explicitly — opencv-python-headless does not bundle
    # the FFMPEG device backend, so without this hint it logs a spurious
    # "VIDEOIO/FFMPEG: OpenCV should be configured with libavdevice" warning.
    cap = cv2.VideoCapture(CAMERA_INDEX, cv2.CAP_V4L2)
    if not cap.isOpened():
        cap = cv2.VideoCapture(CAMERA_INDEX)   # fallback (non-Linux)
    if not cap.isOpened():
        logger.error(
            "Failed to open camera at index %d — "
            "check that /dev/video%d is accessible and passed to the container",
            CAMERA_INDEX, CAMERA_INDEX,
        )
        raise SystemExit(1)

    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  FRAME_WIDTH)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, FRAME_HEIGHT)
    cap.set(cv2.CAP_PROP_FPS,          FRAME_FPS)
    logger.info(
        "Camera %d opened — %dx%d @ %d FPS",
        CAMERA_INDEX, FRAME_WIDTH, FRAME_HEIGHT, FRAME_FPS,
    )

    frame_cx = FRAME_WIDTH  // 2
    frame_cy = FRAME_HEIGHT // 2

    try:
        while True:
            with _state_lock:
                running = _running

            if not running:
                time.sleep(0.1)
                continue

            ret, frame = cap.read()
            if not ret:
                logger.warning("Camera read failed — retrying")
                time.sleep(0.05)
                continue
            with _state_lock:
                _frames_captured += 1

            # ── Barcode detection ──────────────────────────────────────────
            all_detections = barcode_detector.detect(frame)
            staging_detections      = [d for d in all_detections if d["type"] == "staging"]
            product_detections_only = [d for d in all_detections if d["type"] == "product"]

            # ── Staging region detection ───────────────────────────────────
            staging_regions = staging_detector.detect_staging_regions(frame, staging_detections)

            # ── Active-product scoring ─────────────────────────────────────
            for d in product_detections_only:
                cx, cy = d["centre"]
                d["distance_to_centre"] = ((cx - frame_cx) ** 2 + (cy - frame_cy) ** 2) ** 0.5
                d["active"] = False
            if product_detections_only:
                closest = min(product_detections_only, key=lambda d: d["distance_to_centre"])
                closest["active"] = True

            # ── Annotation & streaming ─────────────────────────────────────
            with _state_lock:
                locked_codes = set(_locked_staging_codes)

            annotated = frame_annotator.annotate(
                frame,
                product_detections_only + staging_detections,
                staging_regions,
                locked_codes,
            )
            streamer.update_frame(annotated)

            # ── Event publishing ───────────────────────────────────────────
            if product_detections_only or staging_regions:
                _ts = datetime.now(timezone.utc).isoformat()
                publisher.publish({
                    "picker_id":       PICKER_ID,
                    "timestamp":       _ts,
                    "detections":      product_detections_only,
                    "staging_regions": staging_regions,
                })
                with _state_lock:
                    global _events_published, _last_event_at
                    _events_published += 1
                    _last_event_at = _ts

            with _state_lock:
                do_validate = _validate_next_frame
                if do_validate:
                    _validate_next_frame = False

            if do_validate:
                publisher.publish({
                    "picker_id":       PICKER_ID,
                    "timestamp":       datetime.now(timezone.utc).isoformat(),
                    "action":          "validate",
                    "detections":      product_detections_only,
                    "staging_regions": staging_regions,
                })

    except KeyboardInterrupt:
        logger.info("Shutting down")
    finally:
        cap.release()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    logger.info("Picker Vision Node starting (picker=%s, server=%s)", PICKER_ID, SERVER_URL)

    streamer = ms_module.MJPEGStreamer(port=STREAM_PORT)
    streamer.start()

    publisher = ep_module.EventPublisher(SERVER_URL, PICKER_ID, version=SERVICE_VERSION)
    publisher.start()

    # Resolve the LAN IP this Pi should advertise to the server.
    # STREAM_HOST env/config overrides; otherwise the UDP probe picks the
    # correct outbound interface automatically (works on DHCP networks).
    _stream_host = network_utils.resolve_stream_host(
        SERVER_URL, override=_cfg.get("STREAM_HOST", "")
    )
    logger.info("Pi LAN IP resolved as %s (stream port %d, control port %d)",
                _stream_host, STREAM_PORT, CONTROL_PORT)

    # Log the resolved host so operators can see which interface was selected.
    # On multi-homed devices the UDP probe picks the interface whose default
    # route reaches the server — this is correct in DHCP environments and
    # requires no configuration.
    logger.info(
        "Stream will be advertised as http://%s:%d/stream (auto-detected via UDP probe to %s)",
        _stream_host, STREAM_PORT, SERVER_URL,
    )

    publisher.set_stream_url(f"http://{_stream_host}:{STREAM_PORT}/stream")
    publisher.set_control_url(f"http://{_stream_host}:{CONTROL_PORT}")

    # Wait for the server before registering — loops with backoff on a headless device.
    # The camera capture loop runs locally regardless; events are buffered offline
    # until the server comes up.
    logger.info("Waiting for server at %s ...", SERVER_URL)
    publisher.wait_for_server()          # blocks until server responds
    publisher.register()                 # retries with backoff

    # FastAPI control server in a daemon thread
    control_thread = threading.Thread(
        target=lambda: uvicorn.run(app, host="0.0.0.0", port=CONTROL_PORT, log_level="warning"),
        daemon=True,
    )
    control_thread.start()
    logger.info("Control server started on port %d", CONTROL_PORT)

    _run_capture(streamer, publisher)
