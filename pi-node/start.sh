#!/bin/bash
set -e

# ── Configuration ──────────────────────────────────────────────────────────────
# Override any of these by setting the env var before running this script,
# e.g.: SERVER_URL=http://192.168.1.100:8000 ./start.sh
#
# CAMERA_INDEX: set to a specific number (0, 1, 2...) to pin a camera,
#               or leave unset / set to -1 to auto-detect the first working camera.

export FRAME_WIDTH=${FRAME_WIDTH:-640}
export FRAME_HEIGHT=${FRAME_HEIGHT:-480}
export FRAME_FPS=${FRAME_FPS:-15}
export PICKER_ID=${PICKER_ID:-picker-1}
export SERVER_URL=${SERVER_URL:-http://localhost:8000}
export CONTROL_PORT=${CONTROL_PORT:-8081}
export STAGING_AREA_THRESHOLD=${STAGING_AREA_THRESHOLD:-50,150}
export MJPEG_QUALITY=${MJPEG_QUALITY:-80}
export MIN_STAGING_AREA=${MIN_STAGING_AREA:-5000}

# ── Camera auto-detection ──────────────────────────────────────────────────────
# If CAMERA_INDEX is not set (or is -1), probe /dev/video* and use the first
# device that delivers a real frame. This handles the common case where a Pi
# exposes /dev/video0 (metadata) and /dev/video1 (capture) for the same camera.

if [ -z "${CAMERA_INDEX}" ] || [ "${CAMERA_INDEX}" = "-1" ]; then
    echo "Auto-detecting USB camera..."
    CAMERA_INDEX=$(python camera_probe.py) || {
        echo ""
        echo "ERROR: No working camera found."
        echo ""
        echo "Make sure the USB camera is connected and passed into the container:"
        echo "  docker run --device /dev/video0 ..."
        echo "  docker run --device /dev/video0 --device /dev/video1 ..."
        echo "  docker run --device-cgroup-rule='c 81:* rmw' ..."
        echo ""
        echo "To list all detected cameras before starting:"
        echo "  python camera_probe.py --list"
        exit 1
    }
    echo "Auto-detected camera index: $CAMERA_INDEX"
fi

export CAMERA_INDEX

echo ""
echo "Starting Picker Vision Node"
echo "  Picker ID  : $PICKER_ID"
echo "  Camera     : /dev/video$CAMERA_INDEX at ${FRAME_WIDTH}x${FRAME_HEIGHT} @ ${FRAME_FPS}fps"
echo "  Server     : $SERVER_URL"
echo ""

exec python vision_service.py
