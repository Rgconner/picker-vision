FROM python:3.11-slim

# Runtime libs only — no build tools needed.
# All barcode/QR detection uses OpenCV's built-in detectors (Apache 2.0),
# which ship as pre-built aarch64 wheels on PyPI.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgl1 \
        libv4l-0 \
        libv4l-dev \
    && rm -rf /var/lib/apt/lists/*

# Suppress OpenCV's FFMPEG "not configured with libavdevice" noise.
# We use the V4L2 backend directly; FFMPEG device support is not needed.
ENV OPENCV_LOG_LEVEL=ERROR

RUN pip install --no-cache-dir \
    "opencv-python-headless>=4.8" \
    requests \
    Pillow \
    fastapi \
    uvicorn

WORKDIR /app

# Copy all Python source files and the start script
COPY *.py .
COPY start.sh .
RUN chmod +x start.sh

EXPOSE 8080
EXPOSE 8081

# Use start.sh as the entrypoint so camera auto-detection and server-wait
# logic runs identically whether started via Docker or directly on the Pi.
#
# Configuration via environment variables (passed with -e / --env-file):
#   docker run -e SERVER_URL=http://192.168.1.100:8000 \
#              -e PICKER_ID=picker-1 \
#              --device /dev/video0 \
#              picker-vision-pi
#
# Or mount a config file to avoid typing env vars every time:
#   docker run -v /home/pi/.picker-vision.conf:/root/.picker-vision.conf \
#              --device /dev/video0 \
#              picker-vision-pi
#
# Or use a Docker env file:
#   docker run --env-file /home/pi/picker.env --device /dev/video0 picker-vision-pi
ENTRYPOINT ["/bin/bash", "start.sh"]
