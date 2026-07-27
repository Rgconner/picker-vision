FROM python:3.11-slim

RUN pip install --no-cache-dir \
    fastapi \
    "uvicorn[standard]" \
    httpx \
    redis \
    sqlalchemy \
    aiosqlite \
    python-dotenv \
    reportlab \
    "qrcode[pil]" \
    "python-barcode[images]" \
    Pillow

WORKDIR /app
COPY . .

EXPOSE 8001
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
