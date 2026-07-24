import cv2
import numpy as np

# Colours (BGR)
_GREEN  = (0, 255, 0)
_YELLOW = (0, 255, 255)
_CYAN   = (255, 255, 0)
_RED    = (0, 0, 255)
_WHITE  = (255, 255, 255)
_ORANGE = (0, 165, 255)


def annotate(
    frame,
    product_detections: list[dict],
    staging_regions: list[dict],
    locked_staging_codes: set[str],
) -> np.ndarray:
    """Draw detection overlays onto a copy of an OpenCV BGR frame.

    Args:
        frame:               Original OpenCV BGR numpy array (not modified).
        product_detections:  Dicts from barcode_detector (type == "product").
        staging_regions:     Dicts from staging_detector.
        locked_staging_codes: Set of 4-letter codes whose staging areas are locked.

    Returns the annotated frame (numpy array).
    """
    out = frame.copy()

    # ── Staging regions (taped quadrilaterals) ─────────────────────────────
    for region in staging_regions:
        code = region.get("staging_code")
        pts = np.array(region["boundary_points"], dtype=np.int32)
        locked = code is not None and code in locked_staging_codes
        cx, cy = region["centre"]

        if locked:
            # Semi-transparent red fill
            overlay = out.copy()
            cv2.fillPoly(overlay, [pts], _RED)
            cv2.addWeighted(overlay, 0.3, out, 0.7, 0, out)
            # Red boundary, thick
            cv2.polylines(out, [pts], isClosed=True, color=_RED, thickness=4)
            # Staging code label above warning
            if code:
                cv2.putText(
                    out, code,
                    (cx - 30, cy - 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, _WHITE, 2, cv2.LINE_AA,
                )
            # "DO NOT MODIFY" warning
            cv2.putText(
                out, "DO NOT MODIFY",
                (cx - 80, cy + 10),
                cv2.FONT_HERSHEY_SIMPLEX, 1.0, _WHITE, 2, cv2.LINE_AA,
            )
        else:
            # Cyan boundary, normal
            cv2.polylines(out, [pts], isClosed=True, color=_CYAN, thickness=2)
            if code:
                cv2.putText(
                    out, code,
                    (cx - 20, cy),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, _WHITE, 2, cv2.LINE_AA,
                )

    # ── Staging QR boxes (type=="staging" with no associated region polygon) ─
    # These are staging detections that did NOT get paired with a polygon region.
    # Caller should pass them in product_detections list with type=="staging"
    # or as a separate list — we handle them here if they appear in product_detections.
    for det in product_detections:
        if det.get("type") != "staging":
            continue
        x, y, w, h = det["bbox"]
        cv2.rectangle(out, (x, y), (x + w, y + h), _CYAN, 2)
        label = det.get("staging_code") or det.get("value", "")
        cv2.putText(
            out, label,
            (x, max(y - 6, 14)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, _WHITE, 2, cv2.LINE_AA,
        )

    # ── Product barcode boxes ──────────────────────────────────────────────
    for det in product_detections:
        if det.get("type") != "product":
            continue
        x, y, w, h = det["bbox"]
        active = det.get("active", False)
        colour = _YELLOW if active else _GREEN
        thickness = 3 if active else 2
        cv2.rectangle(out, (x, y), (x + w, y + h), colour, thickness)

        # Barcode value above box
        value = det.get("value", "")
        cv2.putText(
            out, value,
            (x, max(y - 20, 14)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, _WHITE, 2, cv2.LINE_AA,
        )

        # Staging target label (enriched from server), orange, below value
        staging_code = det.get("staging_code")
        if staging_code:
            cv2.putText(
                out, f"-> {staging_code}",
                (x, max(y - 4, 14)),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, _ORANGE, 1, cv2.LINE_AA,
            )

    return out
