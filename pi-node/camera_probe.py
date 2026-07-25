"""Camera auto-detection for the Picker Vision Pi node.

Scans /dev/video* devices and returns the index of the first one that:
  1. Can be opened by OpenCV
  2. Is a capture device (not a metadata or output-only node)
  3. Successfully delivers a non-empty frame

Why multiple /dev/videoN nodes exist per camera
-----------------------------------------------
The Linux UVC driver exposes several device nodes per physical USB camera:
  /dev/video0 — capture (what we want)
  /dev/video1 — metadata output (useless for OpenCV)
Some cameras add more. We probe each one and return the first that works.

Usage
-----
  # From Python
  from camera_probe import find_camera
  index = find_camera()          # returns int, e.g. 0

  # From shell (used by start.sh)
  python camera_probe.py         # prints the index, e.g. "0"
  python camera_probe.py --list  # prints a table of all detected cameras
"""

import argparse
import glob
import logging
import os
import re
import sys

import cv2

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger(__name__)


def _video_device_indices() -> list[int]:
    """Return sorted list of integer indices from /dev/video* nodes."""
    nodes = glob.glob("/dev/video*")
    indices = []
    for node in nodes:
        m = re.match(r"/dev/video(\d+)$", node)
        if m:
            indices.append(int(m.group(1)))
    return sorted(indices)


def _probe_device(index: int, width: int = 640, height: int = 480) -> dict | None:
    """Try to open /dev/videoN and grab one frame.

    Returns a dict with device info on success, None on failure.
    """
    # Force the V4L2 backend — opencv-python-headless does not include the
    # FFMPEG device backend, so cv2.VideoCapture(N) without a backend hint
    # triggers the "VIDEOIO/FFMPEG: OpenCV should be configured with
    # libavdevice" warning and often fails to open the device.
    cap = cv2.VideoCapture(index, cv2.CAP_V4L2)
    if not cap.isOpened():
        # Fallback: try without a backend hint (works on some platforms)
        cap = cv2.VideoCapture(index)
    if not cap.isOpened():
        return None

    cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

    # Attempt to read one frame — metadata nodes open but return empty frames
    ret, frame = cap.read()
    cap.release()

    if not ret or frame is None or frame.size == 0:
        return None

    actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    return {
        "index": index,
        "device": f"/dev/video{index}",
        "width": actual_w or width,
        "height": actual_h or height,
        "frame_shape": frame.shape,
    }


def find_camera(prefer_index: int | None = None) -> int:
    """Return the OpenCV index of the first working camera.

    Args:
        prefer_index: If set and the device works, return it immediately
                      without scanning others.

    Returns:
        int — the camera index to pass to cv2.VideoCapture()

    Raises:
        RuntimeError if no working camera is found.
    """
    # Honour an explicit preference first
    if prefer_index is not None:
        info = _probe_device(prefer_index)
        if info:
            logger.info(
                "Using preferred camera: /dev/video%d (%dx%d)",
                prefer_index, info["width"], info["height"],
            )
            return prefer_index
        logger.warning(
            "Preferred CAMERA_INDEX=%d did not work — scanning all devices",
            prefer_index,
        )

    indices = _video_device_indices()
    if not indices:
        raise RuntimeError(
            "No /dev/video* devices found. "
            "Make sure the USB camera is connected and the device is passed "
            "into the container with --device /dev/video0 (or --device /dev/video*)."
        )

    logger.info("Probing %d video device(s): %s", len(indices), indices)

    for idx in indices:
        info = _probe_device(idx)
        if info:
            logger.info(
                "Auto-selected camera: /dev/video%d (frame %s)",
                idx, info["frame_shape"],
            )
            return idx
        logger.debug("/dev/video%d — no frame, skipping", idx)

    raise RuntimeError(
        f"Probed {len(indices)} /dev/video* device(s) but none returned a frame. "
        "Check that --device flags include the camera node and that the "
        "container user has permission (add --group-add video or run as root)."
    )


def list_cameras() -> list[dict]:
    """Return info dicts for all working cameras."""
    results = []
    for idx in _video_device_indices():
        info = _probe_device(idx)
        if info:
            results.append(info)
    return results


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Pi camera probe utility")
    parser.add_argument(
        "--list", action="store_true",
        help="List all detected cameras and exit",
    )
    args = parser.parse_args()

    if args.list:
        cameras = list_cameras()
        if not cameras:
            print("No working cameras found.")
            sys.exit(1)
        print(f"{'Index':<8} {'Device':<16} {'Resolution'}")
        print("-" * 40)
        for c in cameras:
            print(f"{c['index']:<8} {c['device']:<16} {c['width']}x{c['height']}")
        sys.exit(0)

    # Default: print the auto-detected index (used by start.sh)
    try:
        prefer = int(os.environ.get("CAMERA_INDEX", "-1"))
        prefer = prefer if prefer >= 0 else None
        idx = find_camera(prefer_index=prefer)
        print(idx)
    except RuntimeError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
