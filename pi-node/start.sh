#!/bin/bash
set -e

# ── Configuration ──────────────────────────────────────────────────────────────
# Override any of these by setting the env var before running this script,
# e.g.: SERVER_URL=http://192.168.1.100:8000 ./start.sh

export CAMERA_INDEX=${CAMERA_INDEX:-0}
export FRAME_WIDTH=${FRAME_WIDTH:-640}
export FRAME_HEIGHT=${FRAME_HEIGHT:-480}
export FRAME_FPS=${FRAME_FPS:-15}
export PICKER_ID=${PICKER_ID:-picker-1}
export SERVER_URL=${SERVER_URL:-http://localhost:8000}
export CONTROL_PORT=${CONTROL_PORT:-8081}
export STAGING_AREA_THRESHOLD=${STAGING_AREA_THRESHOLD:-50,150}
export MJPEG_QUALITY=${MJPEG_QUALITY:-80}
export MIN_STAGING_AREA=${MIN_STAGING_AREA:-5000}

echo "Starting Picker Vision Node"
echo "  Picker ID  : $PICKER_ID"
echo "  Camera     : /dev/video$CAMERA_INDEX at ${FRAME_WIDTH}x${FRAME_HEIGHT} @ ${FRAME_FPS}fps"
echo "  Server     : $SERVER_URL"
echo ""

exec python vision_service.py
