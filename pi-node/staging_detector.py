import logging
import os

import cv2
import numpy as np

logger = logging.getLogger(__name__)

_MIN_STAGING_AREA = int(os.environ.get("MIN_STAGING_AREA", "5000"))
_THRESHOLD_ENV = os.environ.get("STAGING_AREA_THRESHOLD", "50,150")
_THRESH1, _THRESH2 = (int(v) for v in _THRESHOLD_ENV.split(","))


def detect_staging_regions(frame, staging_detections: list[dict]) -> list[dict]:
    """Find taped staging boundary quadrilaterals in an OpenCV BGR frame.

    Associates each detected quadrilateral with a staging QR code whose centre
    falls inside (or within 50 px of) the polygon.

    Returns a list of dicts:
    {
        "staging_code":     str | None,
        "boundary_points":  [[x, y], ...],   # 4 corners, integers
        "centre":           [cx, cy],
        "area":             float
    }
    """
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, _THRESH1, _THRESH2)
    dilated = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=2)

    contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    regions = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < _MIN_STAGING_AREA:
            continue

        epsilon = 0.02 * cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, epsilon, True)

        if len(approx) != 4:
            continue

        pts = [[int(p[0][0]), int(p[0][1])] for p in approx]

        # Compute centroid
        cx = int(sum(p[0] for p in pts) / 4)
        cy = int(sum(p[1] for p in pts) / 4)

        # Associate with a staging QR code whose centre is inside or near the polygon
        poly_np = np.array(pts, dtype=np.int32)
        matched_code = None
        for det in staging_detections:
            qr_cx, qr_cy = det["centre"]
            dist = cv2.pointPolygonTest(poly_np, (float(qr_cx), float(qr_cy)), measureDist=True)
            # dist > 0 means inside; allow up to 50 px outside
            if dist > -50:
                matched_code = det.get("staging_code")
                break

        regions.append({
            "staging_code":    matched_code,
            "boundary_points": pts,
            "centre":          [cx, cy],
            "area":            float(area),
        })

    # Deduplicate: if two quads share the same staging_code keep the largest
    seen_codes: dict[str, dict] = {}
    unassociated = []
    for region in regions:
        code = region["staging_code"]
        if code is None:
            unassociated.append(region)
        elif code not in seen_codes or region["area"] > seen_codes[code]["area"]:
            seen_codes[code] = region

    return list(seen_codes.values()) + unassociated
