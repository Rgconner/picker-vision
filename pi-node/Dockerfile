FROM python:3.11-slim

# Install runtime libs + build tools needed to compile zxingcpp from source on ARM64.
# zxingcpp does not publish aarch64 manylinux wheels on PyPI, so it must be built.
# We install build deps, compile, then remove them in the same RUN layer to keep
# the final image lean.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libglib2.0-0 \
        # Build dependencies for zxingcpp
        cmake \
        g++ \
        python3-dev \
    && pip install --no-cache-dir \
        opencv-python-headless \
        zxingcpp \
        requests \
        Pillow \
        fastapi \
        uvicorn \
    && apt-get purge -y --auto-remove \
        cmake \
        g++ \
        python3-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY *.py .

EXPOSE 8080
EXPOSE 8081

ENTRYPOINT ["python", "vision_service.py"]
