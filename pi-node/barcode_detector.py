"""Barcode and QR code detector using OpenCV built-in engines (Apache 2.0).

Uses:
  - cv2.QRCodeDetectorAruco  for QR codes  (OpenCV 4.8+, most accurate)
  - cv2.barcode.BarcodeDetector            for 1-D codes (Code128, EAN, etc.)

Both are included in opencv-python-headless with pre-built aarch64 wheels,
so no extra packages or build tools are required on ARM64 / Raspberry Pi.
"""
import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Initialise detectors once at module load — they are thread-safe for read.
_qr_detector = cv2.QRCodeDetectorAruco()
try:
    _barcode_detector = cv2.barcode.BarcodeDetector()
except AttributeError:
    # Older OpenCV builds may not include the barcode module.
    _barcode_detector = None
    logger.warning("cv2.barcode.BarcodeDetector not available — 1-D barcode detection disabled")


def _points_to_bbox(points: np.ndarray) -> tuple[int, int, int, int]:
    """Convert a polygon (N,2) float array to an axis-aligned bounding box."""
    pts = points.reshape(-1, 2)
    min_x, min_y = int(pts[:, 0].min()), int(pts[:, 1].min())
    max_x, max_y = int(pts[:, 0].max()), int(pts[:, 1].max())
    return min_x, min_y, max_x - min_x, max_y - min_y


def _bbox_centre(x: int, y: int, w: int, h: int) -> tuple[int, int]:
    return x + w // 2, y + h // 2


def detect(frame: np.ndarray) -> list[dict]:
    """Detect all barcodes and QR codes in an OpenCV BGR frame.

    Returns a list of dicts:
    {
        "symbology":    str,            # e.g. "CODE128", "QRCODE"
        "value":        str,            # decoded text
        "bbox":         [x, y, w, h],  # integers
        "centre":       [cx, cy],       # integers
        "type":         "product" | "staging",
        "staging_code": str | None,     # 4-letter code for STAGING:XXXX QRs
        "corners":      [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
    }
    """
    detections: list[dict] = []

    # ── 1. QR codes ────────────────────────────────────────────────────────────
    try:
        ok, decoded_list, points_list, _ = _qr_detector.detectAndDecodeMulti(frame)
        if ok and decoded_list:
            for value, points in zip(decoded_list, points_list):
                if not value:
                    continue
                corners = [[int(p[0]), int(p[1])] for p in points.reshape(-1, 2)]
                x, y, w, h = _points_to_bbox(points)
                cx, cy = _bbox_centre(x, y, w, h)

                is_staging = value.startswith("STAGING:")
                detections.append({
                    "symbology":    "QRCODE",
                    "value":        value,
                    "bbox":         [x, y, w, h],
                    "centre":       [cx, cy],
                    "type":         "staging" if is_staging else "product",
                    "staging_code": value[8:12].upper() if is_staging else None,
                    "corners":      corners,
                })
    except Exception as exc:
        logger.warning("QR detection error: %s", exc)

    # ── 2. 1-D barcodes (Code128, EAN-13, etc.) ────────────────────────────────
    if _barcode_detector is not None:
        try:
            ok, values, types, points_arr = _barcode_detector.detectAndDecodeWithType(frame)
            if ok and values:
                for value, btype, points in zip(values, types, points_arr):
                    if not value:
                        continue
                    corners = [[int(p[0]), int(p[1])] for p in points.reshape(-1, 2)]
                    x, y, w, h = _points_to_bbox(points)
                    cx, cy = _bbox_centre(x, y, w, h)
                    detections.append({
                        "symbology":    btype.upper().replace(" ", ""),
                        "value":        value,
                        "bbox":         [x, y, w, h],
                        "centre":       [cx, cy],
                        "type":         "product",
                        "staging_code": None,
                        "corners":      corners,
                    })
        except Exception as exc:
            logger.warning("Barcode detection error: %s", exc)

    return detections
