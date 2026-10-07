@echo off
title Local Student ID OCR Server (FastAPI + EasyOCR)
echo ===================================================
echo Starting Local Student ID OCR Server on port 8000...
echo Engine: OpenCV + EasyOCR
echo Listening on: http://127.0.0.1:8000
echo ===================================================
python -m uvicorn ocr_server:app --host 127.0.0.1 --port 8000
pause
