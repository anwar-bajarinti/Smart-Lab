# Development & Testing Guide

This document describes the testing standards, local service development, and verification procedures for the system.

---

## 1. Automated Testing

The project maintains a dedicated suite of automated tests under `tests/`:

```
tests/
├── unit/
│   ├── test_waveform_decoder.mjs      # 1D waveform subpixel edge & deblurring logic
│   └── test_barcode_robustness.mjs    # Multi-tier barcode decode passes
├── integration/
│   ├── test_student_id_scan.mjs       # End-to-end scan, attendance & retention checks
│   └── test_ocr_api.py                # FastAPI Python OCR endpoint validation
└── fixtures/
    ├── crop_card.png                  # Sample student ID card image
    ├── crop_barcode.png               # Physical barcode sample
    └── code128_full.png               # Reference Code 128 fixture
```

### Running Tests

1. **Run All Unit Tests**:
   ```powershell
   node tests/unit/test_waveform_decoder.mjs
   node tests/unit/test_barcode_robustness.mjs
   ```

2. **Run All Integration Tests**:
   ```powershell
   node tests/integration/test_student_id_scan.mjs
   python tests/integration/test_ocr_api.py
   ```

3. **Run Via npm**:
   ```powershell
   npm test
   ```

---

## 2. Protected Files Invariant Policy

The following files represent baseline state references and must **never** be deleted, overwritten, or modified by automated tools:

- `frontend/src/db/data_base_backup.js` (Fixed baseline schema and records: 61,794 bytes)
- `frontend/src/db/sampleData.js` (Protected initial user records: 22,676 bytes)

Test 22 in `tests/integration/test_student_id_scan.mjs` automatically asserts the integrity and byte length of `frontend/src/db/data_base_backup.js`.

---

## 3. Working with Local Services

- **Vite Proxy**: Any request starting with `/api` is routed to `http://127.0.0.1:8000` via `frontend/vite.config.js`.
- **EasyOCR In-Memory Initialization**: The OCR server initializes EasyOCR once during server start (`gpu=False`). Request calls are non-blocking via `asyncio.to_thread`.
- **Single In-Flight Camera Polling**: In `frontend/src/components/ocr/AiOcrScanner.jsx`, frames are captured every ~500ms. If a previous request is still computing, subsequent frame capture is paused to ensure 0 request queuing.
