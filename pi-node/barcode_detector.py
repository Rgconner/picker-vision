import logging

import cv2
import zxingcpp
from PIL import Image

logger = logging.getLogger(__name__)


def detect(frame) -> list[dict]:
    """Detect all barcodes and QR codes in an OpenCV BGR frame.

    Returns a list of dicts:
    {
        "symbology":    str,            # e.g. "CODE128", "QRCODE"
        "value":        str,            # decoded text
        "bbox":         [x, y, w, h],  # integers
        "centre":       [cx, cy],       # integers
        "type":         "product" | "staging",
        "staging_code": str | None,     # 4-letter code for staging QRs, else None
        "corners":      [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
    }
    """
    try:
        pil_img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        results = zxingcpp.read_barcodes(pil_img)
    except Exception as exc:
        logger.warning("zxingcpp decode error: %s", exc)
        return []

    detections = []
    for result in results:
        pos = result.position
        corners = [
            [int(pos.top_left.x),     int(pos.top_left.y)],
            [int(pos.top_right.x),    int(pos.top_right.y)],
            [int(pos.bottom_right.x), int(pos.bottom_right.y)],
            [int(pos.bottom_left.x),  int(pos.bottom_left.y)],
        ]

        xs = [c[0] for c in corners]
        ys = [c[1] for c in corners]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        x, y, w, h = min_x, min_y, max_x - min_x, max_y - min_y
        cx = int(x + w / 2)
        cy = int(y + h / 2)

        symbology = str(result.format).split(".")[-1].upper()
        text = result.text

        is_qr = result.format == zxingcpp.BarcodeFormat.QRCode
        if is_qr and text.startswith("STAGING:"):
            detection_type = "staging"
            staging_code = text[8:12].upper()
        else:
            detection_type = "product"
            staging_code = None

        detections.append({
            "symbology":    symbology,
            "value":        text,
            "bbox":         [x, y, w, h],
            "centre":       [cx, cy],
            "type":         detection_type,
            "staging_code": staging_code,
            "corners":      corners,
        })

    return detections
