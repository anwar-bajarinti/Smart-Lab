# Setup Guide: Incubation Centre Management System

This guide walks you through setting up and running the system in a local development environment.

---

## 1. Prerequisites

- **Node.js**: v18.0.0 or higher (v20+ recommended)
- **npm**: v9.0.0 or higher
- **Python**: v3.11.x (for the local OCR service)
- **Modern Web Browser**: Google Chrome or Microsoft Edge (supports native camera and BarcodeDetector APIs)

---

## 2. Frontend Installation & Setup

1. **Install Node.js dependencies**:
   ```powershell
   npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env.local`:
   ```powershell
   cp .env.example .env.local
   ```
   Add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
   ```
   *(Note: The system functions seamlessly in offline local-storage mode even without Supabase credentials).*

3. **Start the Frontend Development Server**:
   ```powershell
   npm run dev
   ```
   Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 3. Local Python OCR Service Setup

The AI OCR scanner extracts **Student Name** and **Roll Number** from physical college ID cards held before the webcam.

1. **Install Python Libraries** (if not already installed):
   ```powershell
   pip install fastapi uvicorn opencv-python numpy easyocr
   ```

2. **Start the OCR Service**:
   - **Method A (Batch File)**: Double-click `backend/ocr/start_ocr_server.bat`
   - **Method B (Terminal)**:
     ```powershell
     cd backend/ocr
     python -m uvicorn ocr_server:app --host 127.0.0.1 --port 8000
     ```
   - **Method C (npm script)**:
     ```powershell
     npm run ocr:start
     ```

3. **Verify OCR Health**:
   Open [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) in your browser. Expected response:
   ```json
   {
     "status": "ok",
     "engine": "easyocr",
     "ready": true
   }
   ```

---

## 4. Building for Production

To create an optimized production build:
```powershell
npm run build
```
The output will be generated in the `dist/` directory.

To test the production build locally:
```powershell
npm run preview
```
