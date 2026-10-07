# Student ID OCR Backend Microservice

A production-grade computer vision and optical character recognition (OCR) microservice for extracting student **NAME** and **ROLL NUMBER** from physical college ID cards using FastAPI, OpenCV, and EasyOCR.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/suryateja5570-lgtm/incubation-cms-ocr)

---

## Architecture Overview

```mermaid
flowchart LR
    A["Laptop / Mobile Camera"] -->|"Base64 JPEG"| B["React Frontend"]
    B -->|"POST /api/scan-id"| C["FastAPI Server (:8000)"]
    C -->|"CLAHE & Bilateral Filter"| D["OpenCV Preprocessing"]
    D -->|"EasyOCR CPU Reader"| E["PyTorch CRAFT + CRNN"]
    E -->|"Regex & Sanitization"| F["Parser"]
    F -->|"status: success | partial | pending"| C
    C -->|"JSON Response"| B
```

---

## Production Deployment (1-Click)

Click the button above to deploy this repository to **Render** on the free tier, or deploy to any Docker/container platform (Koyeb, Railway, Fly.io, Hugging Face Spaces).

### Environment Variables
- `PORT`: (Default: `8000`) Server listening port.
- `ALLOWED_ORIGINS`: Comma-separated list of allowed CORS origins (e.g. `https://incubation-cms.pages.dev,http://localhost:5173`).

---

## API Endpoints

### 1. `GET /api/health`
Health check endpoint to verify EasyOCR readiness.
```json
{
  "status": "ok",
  "engine": "easyocr",
  "ready": true
}
```

### 2. `POST /api/scan-id`
Accepts a JSON payload containing a Base64-encoded image:
```json
{
  "image": "data:image/jpeg;base64,..."
}
```
**Response Format:**
```json
{
  "status": "success",
  "name": "BODDU SURYA TEJA",
  "roll_number": "238W1A04C2",
  "all_tokens": ["SIDDHARTHA ENGINEERING COLLEGE", "BODDU SURYA TEJA", "238W1A04C2", "BRANCH ECE"],
  "latency_ms": 940
}
```

---

## Local Development

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Run the server
python -m uvicorn ocr_server:app --host 127.0.0.1 --port 8000 --reload
```
