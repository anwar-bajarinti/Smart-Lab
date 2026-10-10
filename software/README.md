# Smart-Lab

A high-reliability, cloud-hybrid and offline-first campus laboratory & incubation centre operations system.

```
Smart Lab Management System
├── Frontend:   React 19 + Vite (Modern SPA UI & Browser Barcode Scanner)
├── Backend:    Local FastAPI + OpenCV + EasyOCR (Private Student ID OCR Engine)
├── Database:   Supabase (PostgreSQL 15, Auth, RLS Policies, Migrations)
├── Hardware:   ESP32 / IoT Edge Nodes (RFID, Relays, Environment Telemetry)
└── Deployment: Cloudflare Pages (Edge CDN, Serverless /functions)
```

---

## Architecture & Project Structure

```
PROJECT/
├── frontend/                   # React + Vite application containing all UI pages, components, client database access, and styling
├── backend/                    # Local Python FastAPI microservices (OpenCV + EasyOCR ID card parser) running on premises
├── database/                   # Supabase PostgreSQL database migrations, schema definitions, and RLS security policies
├── hardware/                   # Hardware and IoT edge interface documentation and future microcontroller firmware
├── tests/                      # Automated test suite (unit tests, integration tests, and image fixtures)
├── docs/                       # Project documentation spanning architecture, environment setup, and development standards
├── deployment/                 # Cloudflare Pages deployment guidelines, build configuration, and edge specifications
├── functions/                  # Cloudflare Pages serverless functions (/api/upload, /api/image) at root for Cloudflare compatibility
├── scratch/                    # Temporary scratchpads, manual scripts, and one-off experimentation files
├── backups/                    # Legacy experimental archives safely preserved outside active production paths
├── package.json                # Root workspace configuration with unified convenience commands (dev, build, test, ocr)
└── README.md                   # Complete architectural guide and rapid onboarding documentation
```

### Top-Level Directory Roles in One Sentence:
- **`frontend/`**: Contains the complete React 19 single-page application, interactive UI pages, domain components, client state, and in-browser 1D/2D barcode decoder.
- **`backend/`**: Hosts the local Python FastAPI microservice powered by OpenCV and EasyOCR for high-precision student ID card optical recognition.
- **`database/`**: Houses production PostgreSQL schema migrations and Row-Level Security policies deployed to Supabase.
- **`hardware/`**: Defines the hardware/IoT boundary for ESP32 and Arduino edge nodes communicating with the frontend hardware service.
- **`tests/`**: Contains formal automated unit tests, end-to-end integration tests, and reference image fixtures.
- **`docs/`**: Provides architecture blueprints, setup walkthroughs, and contributor guidelines.
- **`deployment/`**: Documents the Cloudflare Pages edge hosting requirements, environment variables, and build settings.
- **`functions/`**: Provides edge serverless endpoints for Cloudflare Pages image uploads and asset routing.
- **`scratch/`**: Reserved exclusively for temporary development scratchpads and ad-hoc scripts.

---

## Quick Start

### 1. Unified Development from Root
The project root is configured as an npm workspace. You can run all tasks directly from the root folder:

```powershell
# Start React frontend development server (http://localhost:5173)
npm run dev

# Build production bundle (outputs to frontend/dist)
npm run build

# Run all automated tests (Waveform Decoder + Barcode Robustness + Student ID Scanner)
npm test

# Launch local Python OCR backend server on port 8000
npm run ocr:start
```

### 2. Standalone Frontend (`frontend/`)
You can also navigate directly to the `frontend/` directory:
```powershell
cd frontend
npm run dev
npm run build
```

### 3. Standalone Local OCR Service (`backend/ocr/`)
The Python OCR service runs locally on premises (port 8000) to keep sensitive student records private:
```powershell
cd backend/ocr
python -m uvicorn ocr_server:app --host 127.0.0.1 --port 8000
```
*(Or double-click `backend/ocr/start_ocr_server.bat`)*

Verify health at: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health).

---

## Automated Test Verification

| Test Suite | Location | Tests | Status |
|---|---|---|---|
| **1D Waveform Decoder** | `tests/unit/test_waveform_decoder.mjs` | 12 tests | ✅ All Passed |
| **Barcode Robustness** | `tests/unit/test_barcode_robustness.mjs` | 11 tests | ✅ All Passed |
| **Student ID & Attendance** | `tests/integration/test_student_id_scan.mjs` | 22 tests | ✅ All Passed |
| **FastAPI EasyOCR Pipeline** | `tests/integration/test_ocr_api.py` | 5 tests | ✅ All Passed |
| **Total Automated Tests** | | **50 tests** | **100% Passing** |

---

## Protected Data & Security Invariants

- **`frontend/src/db/data_base_backup.js`** (exactly 61,794 bytes) and **`frontend/src/db/sampleData.js`** (exactly 22,676 bytes) are strictly protected reference baselines.
- The 4-year incubation start date student retention rules are strictly enforced by client-side audit engines (`frontend/src/services/storage/`).
- Local barcode decoding operates 100% within the browser client (WASM + Canvas); ID cards are never transmitted to third-party cloud services.
