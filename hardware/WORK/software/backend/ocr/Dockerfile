FROM python:3.11-slim

ENV DEBIAN_FRONTEND=noninteractive \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Install required system packages for OpenCV and PyTorch CPU
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Upgrade pip and install lightweight CPU-only PyTorch build first
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu

# Install application dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download and cache EasyOCR model weights into image at build time
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

# Copy application source
COPY . .

EXPOSE 8000

# Run uvicorn on dynamically provided $PORT (supports Render, Koyeb, Railway, etc.)
CMD ["sh", "-c", "uvicorn ocr_server:app --host 0.0.0.0 --port ${PORT:-8000}"]
