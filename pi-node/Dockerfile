FROM python:3.11-slim

# Runtime libs only — no build tools needed.
# All barcode/QR detection uses OpenCV's built-in detectors (Apache 2.0),
# which ship as pre-built aarch64 wheels on PyPI.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        libgl1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    "opencv-python-headless>=4.8" \
    requests \
    Pillow \
    fastapi \
    uvicorn

WORKDIR /app
COPY *.py .

EXPOSE 8080
EXPOSE 8081

ENTRYPOINT ["python", "vision_service.py"]
