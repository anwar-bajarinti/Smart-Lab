// src/components/CameraModal.jsx
// Live Camera capture & Student ID Card OCR (reads ONLY Student Name & Roll Number)
// Strictly NO barcode, NO QR code, NO RFID!
// Displays OCR result with mandatory manual edit/correction inputs before saving.

import React, { useState, useRef, useEffect } from 'react';
import {
  Camera,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  X,
  Upload,
  User,
  Hash,
  Sparkles,
  SlidersHorizontal,
} from 'lucide-react';
import { performOcrOnImage, preprocessImageForOcr } from '../../utils/ocrProcessor';
import AiOcrScanner from './AiOcrScanner';

export default function CameraModal({ isOpen, onClose, onConfirm, title = 'Scan Student ID Card' }) {
  const [step, setStep] = useState('camera'); // 'camera' | 'processing' | 'review'
  const [scanMode, setScanMode] = useState('auto_ocr'); // 'auto_ocr' | 'manual'
  const [capturedImage, setCapturedImage] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [ocrProgress, setOcrProgress] = useState(0);

  // Extracted and editable student details
  const [studentName, setStudentName] = useState('');
  const [rollNumber, setRollNumber] = useState('');
  const [rawOcrText, setRawOcrText] = useState('');
  const [showRawText, setShowRawText] = useState(false);
  const [validationError, setValidationError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  // Start camera stream when modal opens in manual mode
  useEffect(() => {
    if (isOpen) {
      setStep('camera');
      setCapturedImage(null);
      setCameraError(null);
      setStudentName('');
      setRollNumber('');
      setRawOcrText('');
      setValidationError('');
      if (scanMode === 'manual') {
        startCamera();
      } else {
        stopCamera();
      }
    } else {
      stopCamera();
    }

    return () => stopCamera();
  }, [isOpen, scanMode]);

  async function startCamera() {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API is not supported in this browser. You can use the "Upload Photo" option below.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer rear camera on mobile/tablet
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.warn('Camera stream error:', err);
      setCameraError(err.message || 'Unable to access camera. Please check permissions or upload an image.');
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  // Capture frame from live video
  async function capturePhoto() {
    if (!videoRef.current) return;
    try {
      const processedCanvas = preprocessImageForOcr(videoRef.current);
      const dataUrl = processedCanvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(dataUrl);
      stopCamera();
      await processImageWithOcr(processedCanvas, dataUrl);
    } catch (err) {
      console.error('Capture error:', err);
      setCameraError('Failed to capture frame from camera.');
    }
  }

  // Handle uploaded file as fallback
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    stopCamera();
    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target.result;
      setCapturedImage(dataUrl);

      const img = new Image();
      img.onload = async () => {
        const processedCanvas = preprocessImageForOcr(img);
        await processImageWithOcr(processedCanvas, dataUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  // Perform OCR
  async function processImageWithOcr(canvasOrImage, previewUrl) {
    setStep('processing');
    setOcrProgress(10);

    try {
      const result = await performOcrOnImage(canvasOrImage, (progress) => {
        setOcrProgress(progress);
      });

      setOcrProgress(100);
      setStudentName(result.studentName || '');
      setRollNumber(result.rollNumber || '');
      setRawOcrText(result.rawText || '');
      setStep('review');
    } catch (err) {
      console.error('OCR recognition error:', err);
      // Even if OCR fails, let the admin manually type the details
      setStudentName('');
      setRollNumber('');
      setRawOcrText('Could not automatically read text. Please enter Name and Roll Number manually.');
      setStep('review');
    }
  }

  function retake() {
    setCapturedImage(null);
    setStudentName('');
    setRollNumber('');
    setRawOcrText('');
    setValidationError('');
    setStep('camera');
    if (scanMode === 'manual') {
      startCamera();
    }
  }

  function handleConfirm() {
    const cleanName = studentName.trim();
    const cleanRoll = rollNumber.trim().toUpperCase();

    if (!cleanRoll) {
      setValidationError('Roll Number is required.');
      return;
    }
    if (!cleanName) {
      setValidationError('Student Name is required.');
      return;
    }

    onConfirm({
      name: cleanName,
      rollNumber: cleanRoll,
      capturedImage,
    });
    onClose();
  }

  // Demo helper for testing without physical webcam
  function fillDemoStudent(name, roll) {
    setStudentName(name);
    setRollNumber(roll);
    setStep('review');
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-title-group">
            <Camera className="icon-primary" size={24} />
            <div>
              <h3 className="modal-title">{title}</h3>
              <p className="modal-subtitle">
                OCR extracts ONLY printed <strong>Student Name</strong> & <strong>Roll Number</strong>. No barcode/QR/RFID.
              </p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} title="Close">
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '0.75rem' }}>
          {/* OCR Mode Selector: AI Auto-Scan vs Manual Capture */}
          {step === 'camera' && (
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.85rem' }}>
              <button
                type="button"
                className={`btn btn-sm ${scanMode === 'auto_ocr' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setScanMode('auto_ocr');
                  stopCamera();
                }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 600 }}
              >
                <Sparkles size={14} />
                AI Auto-Scan (Local EasyOCR)
              </button>
              <button
                type="button"
                className={`btn btn-sm ${scanMode === 'manual' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => {
                  setScanMode('manual');
                  startCamera();
                }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontWeight: 600 }}
              >
                <Camera size={14} />
                Manual Capture / Upload
              </button>
            </div>
          )}

          {/* 1. Hands-Free AI Auto-Scan Mode */}
          {step === 'camera' && scanMode === 'auto_ocr' && (
            <AiOcrScanner
              onStudentConfirmed={({ name, rollNumber }) => {
                setStudentName(name);
                setRollNumber(rollNumber);
                setStep('review');
              }}
              onSwitchToManual={() => {
                setScanMode('manual');
                startCamera();
              }}
            />
          )}

          {/* 2. Manual Camera / Photo Upload Fallback */}
          {step === 'camera' && scanMode === 'manual' && (
            <div className="camera-view-container">
              {cameraError ? (
                <div className="alert alert-warning">
                  <AlertCircle size={20} />
                  <div>
                    <strong>Camera Notice:</strong> {cameraError}
                    <p style={{ marginTop: '0.25rem', fontSize: '0.85rem' }}>
                      You can take or upload a photo of the Student ID card below, or enter student details directly.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="video-viewport">
                  <video ref={videoRef} autoPlay playsInline muted className="video-feed" />
                  {/* Card alignment overlay guide */}
                  <div className="card-frame-guide">
                    <div className="guide-corner top-left"></div>
                    <div className="guide-corner top-right"></div>
                    <div className="guide-corner bottom-left"></div>
                    <div className="guide-corner bottom-right"></div>
                    <span className="guide-label">Align Student ID Card Inside Box</span>
                  </div>
                </div>
              )}

              {/* Action Toolbar */}
              <div className="camera-controls">
                {!cameraError && (
                  <button type="button" className="btn btn-primary btn-lg" onClick={capturePhoto}>
                    <Camera size={20} />
                    Capture ID Card Photo
                  </button>
                )}

                <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
                  <Upload size={18} />
                  Upload Photo from File
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleFileUpload}
                    style={{ display: 'none' }}
                  />
                </label>

                {cameraError && (
                  <button type="button" className="btn btn-secondary" onClick={startCamera}>
                    <RefreshCw size={18} />
                    Retry Camera
                  </button>
                )}
              </div>

              {/* Quick sample ID card test buttons for developer/offline testing */}
              <div className="demo-helper-box">
                <span className="text-muted text-xs">Quick Test Samples:</span>
                <button
                  type="button"
                  className="btn-badge"
                  onClick={() => fillDemoStudent('Anwar Bajarinti', '238W1A0477')}
                >
                  Anwar (238W1A0477)
                </button>
                <button
                  type="button"
                  className="btn-badge"
                  onClick={() => fillDemoStudent('Kavya Sharma', '238W1A0412')}
                >
                  Kavya (238W1A0412)
                </button>
                <button
                  type="button"
                  className="btn-badge"
                  onClick={() => fillDemoStudent('Rahul Varma', '228W1A0520')}
                >
                  Rahul (228W1A0520)
                </button>
              </div>
            </div>
          )}

          {step === 'processing' && (
            <div className="ocr-processing-container">
              <div className="spinner-large"></div>
              <h4>Reading Student ID Card...</h4>
              <p className="text-muted">Analyzing printed text with offline OCR engine</p>
              <div className="progress-bar-container">
                <div className="progress-bar-fill" style={{ width: `${ocrProgress}%` }}></div>
              </div>
              <span className="progress-text">{ocrProgress}% complete</span>
            </div>
          )}

          {step === 'review' && (
            <div className="ocr-review-container">
              <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                <Sparkles size={18} />
                <span>
                  Please review the detected details below. You can manually edit or correct any field before confirming.
                </span>
              </div>

              <div className="review-grid">
                {/* Captured ID Image preview */}
                {capturedImage && (
                  <div className="review-image-card">
                    <label className="input-label">Scanned ID Card</label>
                    <img src={capturedImage} alt="Scanned Student ID" className="preview-id-image" />
                    <button type="button" className="btn btn-secondary btn-sm" onClick={retake} style={{ marginTop: '0.5rem', width: '100%' }}>
                      <RefreshCw size={14} /> Retake Photo
                    </button>
                  </div>
                )}

                {/* Editable Student Fields */}
                <div className="review-fields-card">
                  {validationError && (
                    <div className="alert alert-danger" style={{ marginBottom: '0.75rem' }}>
                      <AlertCircle size={16} />
                      <span>{validationError}</span>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="input-label" htmlFor="ocr-roll">
                      <Hash size={16} /> Roll Number <span className="required-star">*</span>
                    </label>
                    <input
                      id="ocr-roll"
                      type="text"
                      className="input-field uppercase-input"
                      placeholder="e.g. 238W1A0477"
                      value={rollNumber}
                      onChange={(e) => {
                        setRollNumber(e.target.value.toUpperCase());
                        setValidationError('');
                      }}
                      autoFocus
                    />
                    <span className="input-hint">Alphanumeric university roll or registration number</span>
                  </div>

                  <div className="form-group">
                    <label className="input-label" htmlFor="ocr-name">
                      <User size={16} /> Student Name <span className="required-star">*</span>
                    </label>
                    <input
                      id="ocr-name"
                      type="text"
                      className="input-field"
                      placeholder="e.g. Anwar Bajarinti"
                      value={studentName}
                      onChange={(e) => {
                        setStudentName(e.target.value);
                        setValidationError('');
                      }}
                    />
                    <span className="input-hint">Full name as printed on the student ID card</span>
                  </div>

                  {/* Raw OCR Text toggle for transparency */}
                  <div style={{ marginTop: '1rem' }}>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => setShowRawText(!showRawText)}
                    >
                      <SlidersHorizontal size={14} />
                      {showRawText ? 'Hide Raw OCR Text' : 'View Raw Extracted Text'}
                    </button>
                    {showRawText && (
                      <pre className="raw-text-box">{rawOcrText || '(No text detected)'}</pre>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          {step === 'review' ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={retake}>
                <RefreshCw size={16} /> Retake Scan
              </button>
              <button type="button" className="btn btn-primary" onClick={handleConfirm}>
                <CheckCircle size={16} /> Confirm & Use Details
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
