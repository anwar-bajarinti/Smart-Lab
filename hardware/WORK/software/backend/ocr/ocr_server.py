import asyncio
import base64
import re
import time
from typing import Optional, List
import cv2
import easyocr
import numpy as np
from fastapi import FastAPI, File, UploadFile, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import os

app = FastAPI(title="Student ID OCR Server", version="1.0.0")

# Strict CORS configuration for production Cloudflare Pages & local development
allowed_origins_env = os.environ.get("ALLOWED_ORIGINS")
if allowed_origins_env:
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    allowed_origins = [
        "https://incubation-cms.pages.dev",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# 1. Initialize EasyOCR once at server startup
print("[OCR SERVER] Initializing EasyOCR (CPU mode)...")
reader = easyocr.Reader(['en'], gpu=False)
print("[OCR SERVER] EasyOCR Reader initialized successfully and ready.")

# ==================================================
# EXACT OCR PIPELINE FUNCTIONS AS SPECIFIED
# ==================================================

def enhance_close_up_card(img_bgr):
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)

    clahe = cv2.createCLAHE(
        clipLimit=2.0,
        tileGridSize=(8, 8)
    )

    l_eq = clahe.apply(l)

    enhanced = cv2.cvtColor(
        cv2.merge([l_eq, a, b]),
        cv2.COLOR_LAB2BGR
    )

    return cv2.bilateralFilter(
        enhanced,
        5,
        40,
        40
    )

def sanitize_roll_candidate(raw_token):
    t = re.sub(r'[^A-Za-z0-9]', '', raw_token).upper()

    if t.isalpha() or len(t) < 8 or len(t) > 12:
        return None

    if len(t) == 11 and t[0] in ['I', 'L', '1', '|']:
        t = t[1:]

    if len(t) == 10:
        t_list = list(t)

        for i in [0, 1]:
            if t_list[i] in ['O', 'Q', 'D']:
                t_list[i] = '0'
            elif t_list[i] in ['I', 'L', '|']:
                t_list[i] = '1'
            elif t_list[i] == 'Z':
                t_list[i] = '2'
            elif t_list[i] == 'S':
                t_list[i] = '5'
            elif t_list[i] == 'B':
                t_list[i] = '8'

        if t_list[4] in ['I', 'L', '|']:
            t_list[4] = '1'
        elif t_list[4] == 'S':
            t_list[4] = '5'

        if t_list[5] == '4':
            t_list[5] = 'A'

        repaired = "".join(t_list)

        if re.match(
            r'^[0-9]{2}[A-Z0-9]{2}[15][A-Z][0-9A-Z]{4}$',
            repaired
        ):
            return repaired

        elif re.match(
            r'^[0-9]{2}[A-Z0-9]{8}$',
            repaired
        ):
            return repaired

    return None

def parse_id_card_data(extracted_lines):
    ignore_keywords = [
        "BRANCH",
        "VALIDITY",
        "VALID",
        "DEPT",
        "DEPARTMENT",
        "COLLEGE",
        "INSTITUTE",
        "STUDENT",
        "IDENTITY",
        "CARD",
        "DOB",
        "DATE",
        "SIGNATURE",
        "BLOOD",
        "GROUP",
        "ECE",
        "CSE",
        "IT",
        "EEE",
        "MECH"
    ]

    extracted_name = None
    extracted_roll = None

    for raw_line in extracted_lines:
        line_clean = raw_line.strip().upper()

        for part in re.split(r'[\s\-]+', line_clean):
            cand = sanitize_roll_candidate(part)
            if cand:
                extracted_roll = cand
                break

        if extracted_roll:
            break

        collapsed = re.sub(
            r'[^A-Za-z0-9]',
            '',
            line_clean
        )

        if len(collapsed) >= 10:
            for i in range(len(collapsed) - 9):
                cand = sanitize_roll_candidate(
                    collapsed[i:i+10]
                )
                if cand:
                    extracted_roll = cand
                    break

        if extracted_roll:
            break

    for raw_line in extracted_lines:
        line_clean = raw_line.strip().upper()

        if any(
            kw in line_clean
            for kw in ignore_keywords
        ):
            continue

        if extracted_roll and (
            extracted_roll in re.sub(
                r'[^A-Za-z0-9]',
                '',
                line_clean
            )
        ):
            continue

        name_clean = re.sub(
            r'[^A-Z\s.]',
            '',
            line_clean
        ).strip()

        name_clean = re.sub(
            r'^[I|l]\s*',
            '',
            name_clean
        )

        if len(name_clean) >= 4 and not extracted_name:
            if " " in name_clean or "." in name_clean:
                if not any(
                    inst in name_clean
                    for inst in [
                        "UNIVERSITY",
                        "ENGINEERING",
                        "TECHNOLOGY",
                        "AUTONOMOUS"
                    ]
                ):
                    extracted_name = name_clean

    return extracted_name, extracted_roll

def process_frame(frame_bgr):
    enhanced = enhance_close_up_card(frame_bgr)

    results = reader.readtext(
        enhanced,
        decoder='beamsearch',
        beamWidth=5,
        paragraph=False,
        text_threshold=0.30,
        low_text=0.15,
        link_threshold=0.25,
        mag_ratio=1.0
    )

    tokens = [
        text.strip()
        for bbox, text, conf in results
        if len(text.strip()) >= 2
        and conf > 0.20
    ]

    name, roll = parse_id_card_data(tokens)
    return name, roll, tokens

# ==================================================
# API MODELS & ENDPOINTS
# ==================================================

class ScanRequest(BaseModel):
    image: Optional[str] = None  # Base64 data URL or raw base64 string

class ScanResponse(BaseModel):
    status: str  # "success" | "partial" | "pending"
    name: Optional[str] = None
    roll_number: Optional[str] = None
    all_tokens: List[str] = []
    latency_ms: int

@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "engine": "easyocr",
        "ready": True
    }

def decode_image_bytes(image_data: bytes) -> Optional[np.ndarray]:
    nparr = np.frombuffer(image_data, np.uint8)
    return cv2.imdecode(nparr, cv2.IMREAD_COLOR)

def decode_base64_image(data_str: str) -> Optional[np.ndarray]:
    if "," in data_str:
        data_str = data_str.split(",", 1)[1]
    raw_bytes = base64.b64decode(data_str)
    return decode_image_bytes(raw_bytes)

@app.post("/api/scan-id", response_model=ScanResponse)
async def scan_id_endpoint(request: Request, payload: Optional[ScanRequest] = None):
    t0 = time.time()
    img_bgr = None

    content_type = request.headers.get("content-type", "")

    if "application/json" in content_type:
        body = await request.json()
        img_str = body.get("image")
        if img_str:
            img_bgr = decode_base64_image(img_str)
    elif "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        if file:
            contents = await file.read()
            img_bgr = decode_image_bytes(contents)
    else:
        # Fallback: check if payload has image or raw bytes
        body_bytes = await request.body()
        if body_bytes.startswith(b"data:image") or b"," in body_bytes[:100]:
            img_bgr = decode_base64_image(body_bytes.decode('utf-8', errors='ignore'))
        elif len(body_bytes) > 0:
            img_bgr = decode_image_bytes(body_bytes)

    if img_bgr is None:
        latency = int((time.time() - t0) * 1000)
        return ScanResponse(
            status="pending",
            name=None,
            roll_number=None,
            all_tokens=[],
            latency_ms=latency
        )

    # Execute CPU OCR asynchronously via asyncio.to_thread so event loop stays responsive
    name, roll, tokens = await asyncio.to_thread(process_frame, img_bgr)
    latency = int((time.time() - t0) * 1000)

    # Determine status according to requirements:
    # "success" if BOTH name and roll are detected
    # "partial" if only roll or only name is detected
    # "pending" if neither is detected
    if name and roll:
        status = "success"
    elif name or roll:
        status = "partial"
    else:
        status = "pending"

    return ScanResponse(
        status=status,
        name=name,
        roll_number=roll,
        all_tokens=tokens,
        latency_ms=latency
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("ocr_server:app", host="127.0.0.1", port=8000, reload=False)
