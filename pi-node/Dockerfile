FROM --platform=linux/arm64 python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
    opencv-python-headless \
    zxingcpp \
    requests \
    Pillow \
    fastapi \
    uvicorn

WORKDIR /app
COPY *.py .

EXPOSE 8080
ENTRYPOINT ["python", "vision_service.py"]
