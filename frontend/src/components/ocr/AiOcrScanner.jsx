// src/components/AiOcrScanner.jsx
// Hands-free Real-Time Student ID Card AI OCR Scanner
// Powered locally by Python FastAPI (:8000) + OpenCV + EasyOCR
// Extracts Student NAME and ROLL NUMBER automatically from webcam frames.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Check,
  RotateCcw,
  SlidersHorizontal,
  Info,
  ExternalLink,
  ShieldCheck,
  User,
  Hash,
} from 'lucide-react';

export default function AiOcrScanner({
  onStudentConfirmed,
  onSwitchToBarcode,
  onSwitchToManual,
}) {
  // Connection and Engine State
  const [engineStatus, setEngineStatus] = useState('checking'); // 'checking' | 'online' | 'offline'
  const [engineInfo, setEngineInfo] = useState(null);
  const [showInstructions, setShowInstructions] = useState(false);

  // Camera & Stream State
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [resolution, setResolution] = useState({ width: 1280, height: 720 });
  const [latencyMs, setLatencyMs] = useState(null);

  // Live Extraction State
  const [liveStatus, setLiveStatus] = useState('initializing'); // 'scanning' | 'partial' | 'success' | 'offline'
  const [detectedRoll, setDetectedRoll] = useState(null);
  const [detectedName, setDetectedName] = useState(null);
  const [partialMessage, setPartialMessage] = useState('');

  // Lock / Confirmation State
  const [lockedResult, setLockedResult] = useState(null); // { name, rollNumber, latencyMs }
  const [confirmedStudent, setConfirmedStudent] = useState(null);

  // Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const isRequestInFlightRef = useRef(false);
  const isLockedRef = useRef(false);

  // Resolves OCR backend endpoints supporting both VITE_OCR_API_URL (production) and /api proxy (local dev)
  const getOcrEndpoints = useCallback(() => {
    const rawUrl = (import.meta.env.VITE_OCR_API_URL || '').trim();
    const baseUrl = rawUrl.replace(/\/+$/, '');
    return {
      health: baseUrl ? `${baseUrl}/api/health` : '/api/health',
      scanId: baseUrl ? `${baseUrl}/api/scan-id` : '/api/scan-id',
      baseUrl,
    };
  }, []);

  // 1. Check Python OCR Backend Health
  const checkBackendHealth = useCallback(async () => {
    try {
      const endpoints = getOcrEndpoints();
      const res = await fetch(endpoints.health, { method: 'GET' });
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok') {
          setEngineStatus('online');
          setEngineInfo(data);
          return true;
        }
      }
      setEngineStatus('offline');
      return false;
    } catch (err) {
      console.warn('OCR Backend health check failed:', err);
      setEngineStatus('offline');
      return false;
    }
  }, [getOcrEndpoints]);

  // 2. Start Camera
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API (getUserMedia) is not supported in this browser.');
      }

      // Stop existing tracks if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'environment',
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current.play().catch((e) => console.warn('Video play error:', e));
          const actualW = videoRef.current.videoWidth || 1280;
          const actualH = videoRef.current.videoHeight || 720;
          setResolution({ width: actualW, height: actualH });
          setCameraActive(true);
        };
      }
    } catch (err) {
      console.error('Camera init error:', err);
      setCameraError(err.message || 'Unable to access camera.');
      setCameraActive(false);
    }
  }, []);

  // 3. Stop Camera
  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // 4. Capture Alignment Guide ROI and send to /api/scan-id
  const captureAndEvaluateFrame = useCallback(async () => {
    // Strictly prevent multiple overlapping in-flight requests or scanning when locked
    if (isRequestInFlightRef.current || isLockedRef.current) {
      return;
    }

    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.paused || video.ended) {
      return;
    }

    const vWidth = video.videoWidth;
    const vHeight = video.videoHeight;
    if (!vWidth || !vHeight) return;

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;

    // The user aligns their card inside the central guide box (approx 70% width, 65% height)
    // Send either the cropped card ROI or the full frame for maximum resolution
    canvas.width = vWidth;
    canvas.height = vHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, vWidth, vHeight);

    // Get JPEG base64 (quality 0.88 is crisp and fast to transfer)
    const base64DataUrl = canvas.toDataURL('image/jpeg', 0.88);

    isRequestInFlightRef.current = true;

    try {
      const endpoints = getOcrEndpoints();
      const res = await fetch(endpoints.scanId, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64DataUrl }),
      });

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }

      const data = await res.json();
      setLatencyMs(data.latency_ms);

      if (data.status === 'success' && data.name && data.roll_number) {
        // TARGET LOCKED: Both Name and Roll Number detected!
        isLockedRef.current = true;
        setDetectedName(data.name);
        setDetectedRoll(data.roll_number);
        setLiveStatus('success');
        setLockedResult({
          name: data.name,
          rollNumber: data.roll_number,
          allTokens: data.all_tokens || [],
          latencyMs: data.latency_ms,
        });
      } else if (data.status === 'partial') {
        setLiveStatus('partial');
        if (data.roll_number && !detectedRoll) {
          setDetectedRoll(data.roll_number);
          setPartialMessage(`Roll Number detected: ${data.roll_number} — Scanning for Name...`);
        } else if (data.name && !detectedName) {
          setDetectedName(data.name);
          setPartialMessage(`Name detected: ${data.name} — Scanning for Roll Number...`);
        } else if (data.roll_number) {
          setPartialMessage(`Roll Number: ${data.roll_number} — Adjust card for Name`);
        }
      } else {
        // Pending
        setLiveStatus('scanning');
      }
    } catch (err) {
      console.warn('OCR request error:', err);
      // If server unreachable, check health again
      checkBackendHealth();
    } finally {
      isRequestInFlightRef.current = false;
    }
  }, [checkBackendHealth, detectedName, detectedRoll, getOcrEndpoints]);

  // Lifecycle: init backend health and camera
  useEffect(() => {
    let mounted = true;

    async function init() {
      const isOnline = await checkBackendHealth();
      if (mounted) {
        startCamera();
      }
    }

    init();

    return () => {
      mounted = false;
      stopCamera();
    };
  }, [checkBackendHealth, startCamera, stopCamera]);

  // Scanning Interval: approximately 500 ms, strictly one in-flight request
  useEffect(() => {
    if (cameraActive && engineStatus === 'online' && !lockedResult) {
      scanIntervalRef.current = setInterval(() => {
        captureAndEvaluateFrame();
      }, 500);
    } else {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    }

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
        scanIntervalRef.current = null;
      }
    };
  }, [cameraActive, engineStatus, lockedResult, captureAndEvaluateFrame]);

  // Restart Scanning
  const handleRescan = () => {
    isLockedRef.current = false;
    isRequestInFlightRef.current = false;
    setLockedResult(null);
    setDetectedName(null);
    setDetectedRoll(null);
    setPartialMessage('');
    setLiveStatus('scanning');
  };

  // Confirm Scanned Student
  const handleConfirm = () => {
    if (lockedResult && onStudentConfirmed) {
      onStudentConfirmed({
        name: lockedResult.name,
        rollNumber: lockedResult.rollNumber,
        latencyMs: lockedResult.latencyMs,
      });
    }
  };

  return (
    <div className="ai-ocr-scanner-root" style={{ width: '100%', position: 'relative' }}>
      {/* Top Status Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.6rem 0.9rem',
          background: '#090d16',
          borderBottom: '1px solid #1e293b',
          fontSize: '0.8rem',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        {/* Left: Backend Engine Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {engineStatus === 'online' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: '#34d399',
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#10b981',
                  boxShadow: '0 0 8px #10b981',
                }}
              />
              🟢 AI OCR Engine Online — Auto Scanning
            </span>
          ) : engineStatus === 'checking' ? (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: '#fbbf24',
              }}
            >
              <RefreshCw size={13} className="spinner-large" />
              Connecting to AI OCR Server...
            </span>
          ) : (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                color: '#f87171',
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: '#ef4444',
                }}
              />
              🔴 AI OCR Engine Offline (:8000)
            </span>
          )}
        </div>

        {/* Right: Telemetry (Camera Active, Resolution, Latency) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.85rem',
            color: '#94a3b8',
            fontSize: '0.75rem',
          }}
        >
          {cameraActive && (
            <span>
              <Camera size={12} style={{ display: 'inline', marginRight: '3px', color: '#60a5fa' }} />
              Camera Active
            </span>
          )}
          <span>Res: {resolution.width}x{resolution.height}</span>
          {latencyMs !== null && (
            <span style={{ color: '#93c5fd' }}>OCR latency: {latencyMs} ms</span>
          )}
        </div>
      </div>

      {/* Main Viewport Container */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          minHeight: '380px',
          background: '#000',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Live Video Feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            maxHeight: '440px',
            objectFit: 'contain',
            display: cameraActive ? 'block' : 'none',
          }}
        />

        {/* OFFLINE BACKEND BANNER OVERLAY */}
        {engineStatus === 'offline' && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(11, 15, 25, 0.92)',
              backdropFilter: 'blur(6px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              textAlign: 'center',
              zIndex: 10,
              color: '#f8fafc',
            }}
          >
            <AlertCircle size={44} style={{ color: '#ef4444', marginBottom: '0.75rem' }} />
            <h4 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.35rem' }}>
              AI OCR Server is Offline
            </h4>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '440px', marginBottom: '1.2rem', lineHeight: '1.5' }}>
              The Python FastAPI OCR server at <code>{getOcrEndpoints().baseUrl || 'http://127.0.0.1:8000'}</code> is not responding.
              Ensure the server is running or allow 30–45s for cloud container wakeup.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setShowInstructions(!showInstructions)}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
              >
                <Info size={15} />
                {showInstructions ? 'Hide Instructions' : 'Start / Instructions'}
              </button>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={checkBackendHealth}
                style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
              >
                <RefreshCw size={14} /> Retry Connection
              </button>

              {onSwitchToBarcode && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onSwitchToBarcode}
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                >
                  Use Barcode Scanner
                </button>
              )}

              {onSwitchToManual && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onSwitchToManual}
                  style={{ fontSize: '0.85rem', padding: '0.5rem 1rem' }}
                >
                  Use Manual Capture
                </button>
              )}
            </div>

            {/* Collapsible Command instructions */}
            {showInstructions && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '0.85rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '6px',
                  textAlign: 'left',
                  fontSize: '0.8rem',
                  maxWidth: '460px',
                  color: '#cbd5e1',
                }}
              >
                <p style={{ fontWeight: 600, color: '#93c5fd', marginBottom: '0.4rem' }}>
                  To start the local OCR server in a terminal:
                </p>
                <pre
                  style={{
                    background: '#020617',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '4px',
                    color: '#38bdf8',
                    overflowX: 'auto',
                    margin: '0.35rem 0',
                  }}
                >
                  python -m uvicorn ocr_server:app --host 127.0.0.1 --port 8000
                </pre>
                <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.35rem' }}>
                  Or double-click <code>start_ocr_server.bat</code> in the project root.
                </p>
              </div>
            )}
          </div>
        )}

        {/* CAMERA ERROR BANNER */}
        {cameraError && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: '#0f172a',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              color: '#f87171',
              zIndex: 9,
            }}
          >
            <AlertCircle size={36} style={{ marginBottom: '0.5rem' }} />
            <p style={{ fontWeight: 600 }}>Camera Access Error</p>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>{cameraError}</p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={startCamera}
              style={{ marginTop: '0.75rem' }}
            >
              Retry Camera
            </button>
          </div>
        )}

        {/* ALIGNMENT RETICLE GUIDE (Active when scanning and camera is running) */}
        {cameraActive && engineStatus === 'online' && !lockedResult && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 5,
            }}
          >
            {/* ID Card Guide Rectangle */}
            <div
              style={{
                position: 'relative',
                width: '78%',
                maxWidth: '440px',
                height: '56%',
                maxHeight: '270px',
                border: liveStatus === 'partial' ? '2.5px solid #fbbf24' : '2.5px solid #10b981',
                borderRadius: '12px',
                boxShadow:
                  liveStatus === 'partial'
                    ? '0 0 16px rgba(251, 191, 36, 0.4), inset 0 0 14px rgba(251, 191, 36, 0.15)'
                    : '0 0 16px rgba(16, 185, 129, 0.4), inset 0 0 14px rgba(16, 185, 129, 0.15)',
                transition: 'all 0.25s ease',
              }}
            >
              {/* Corner Accents */}
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  left: '-3px',
                  width: '18px',
                  height: '18px',
                  borderTop: '4px solid #fff',
                  borderLeft: '4px solid #fff',
                  borderTopLeftRadius: '10px',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: '-3px',
                  right: '-3px',
                  width: '18px',
                  height: '18px',
                  borderTop: '4px solid #fff',
                  borderRight: '4px solid #fff',
                  borderTopRightRadius: '10px',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '-3px',
                  left: '-3px',
                  width: '18px',
                  height: '18px',
                  borderBottom: '4px solid #fff',
                  borderLeft: '4px solid #fff',
                  borderBottomLeftRadius: '10px',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  bottom: '-3px',
                  right: '-3px',
                  width: '18px',
                  height: '18px',
                  borderBottom: '4px solid #fff',
                  borderRight: '4px solid #fff',
                  borderBottomRightRadius: '10px',
                }}
              />

              {/* Top tag */}
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0, 0, 0, 0.75)',
                  backdropFilter: 'blur(4px)',
                  padding: '0.2rem 0.65rem',
                  borderRadius: '9999px',
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  color: '#e2e8f0',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap',
                }}
              >
                ALIGN COLLEGE ID CARD HERE
              </div>

              {/* Bottom live feedback tag */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'rgba(0, 0, 0, 0.85)',
                  backdropFilter: 'blur(4px)',
                  padding: '0.25rem 0.75rem',
                  borderRadius: '9999px',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  color: liveStatus === 'partial' ? '#fbbf24' : '#34d399',
                  whiteSpace: 'nowrap',
                }}
              >
                {liveStatus === 'partial' ? (
                  <span>🟡 {partialMessage || 'Detecting ID card details...'}</span>
                ) : (
                  <span>Hold steady at 5–7 cm inside box</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TARGET LOCKED / REVIEW SECTION */}
        {lockedResult && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(11, 15, 25, 0.95)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '1.5rem',
              zIndex: 10,
              animation: 'fadeIn 0.2s ease-out',
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: '440px',
                background: '#0f172a',
                border: '1px solid #10b981',
                boxShadow: '0 10px 25px -5px rgba(16, 185, 129, 0.25)',
                borderRadius: '12px',
                padding: '1.5rem',
                textAlign: 'center',
              }}
            >
              {/* Badge */}
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  padding: '0.35rem 0.85rem',
                  borderRadius: '9999px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  marginBottom: '1rem',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                }}
              >
                <CheckCircle size={15} />
                Student Found via AI OCR
              </div>

              {/* Student Details Card */}
              <div
                style={{
                  background: '#090d16',
                  borderRadius: '8px',
                  padding: '1rem',
                  border: '1px solid #1e293b',
                  marginBottom: '1.25rem',
                  textAlign: 'left',
                }}
              >
                <div style={{ marginBottom: '0.85rem' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Student Name
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                    <User size={16} style={{ color: '#60a5fa' }} />
                    <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc' }}>
                      {lockedResult.name}
                    </span>
                  </div>
                </div>

                <div>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Roll Number
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.2rem' }}>
                    <Hash size={16} style={{ color: '#10b981' }} />
                    <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#34d399', letterSpacing: '1px', fontFamily: 'monospace' }}>
                      {lockedResult.rollNumber}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons: Confirm & Rescan */}
              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  onClick={handleConfirm}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    background: '#059669',
                    borderColor: '#10b981',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                  }}
                >
                  <Check size={18} />
                  Confirm
                </button>

                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleRescan}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.4rem',
                    fontSize: '0.9rem',
                  }}
                >
                  <RotateCcw size={16} />
                  Rescan
                </button>
              </div>

              <p style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '0.85rem' }}>
                Confirming populates the student details in your current session.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Guidance Note */}
      <div
        style={{
          padding: '0.65rem 1rem',
          background: '#090d16',
          borderTop: '1px solid #1e293b',
          fontSize: '0.75rem',
          color: '#94a3b8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        <span>
          💡 <strong>Tip:</strong> Hold the ID card approximately 5–7 cm from your webcam. The local EasyOCR model automatically locks onto printed Name & Roll Number.
        </span>
        {onSwitchToBarcode && (
          <button
            type="button"
            onClick={onSwitchToBarcode}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#60a5fa',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: '0.75rem',
            }}
          >
            Switch to Barcode Scanner
          </button>
        )}
      </div>
    </div>
  );
}
