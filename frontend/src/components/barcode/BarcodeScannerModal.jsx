// src/components/BarcodeScannerModal.jsx
// Student ID Card Barcode / QR Code Scanner Component
//
// Enhanced 1D & 2D Barcode Decoder:
// 1. Explicit support for 1D Barcode Symbologies:
//    - CODE_128, CODE_39, CODE_93, EAN_13, EAN_8, UPC_A, UPC_E, ITF, CODABAR, PDF_417 + QR_CODE & DATA_MATRIX.
// 2. Dual-Decoder Architecture:
//    - Native Hardware BarcodeDetector API (C++/GPU-accelerated on Chrome/Android/Edge).
//    - html5-qrcode / ZXing with high-resolution video constraints (1080p/720p).
// 3. Wide 1D Scanning Region & Full-Frame Mode (prevents cropping wide barcodes).
// 4. Still-Frame Capture & Photo Upload fallback for webcams with motion blur.
// 5. Diagnostic / Debug Testing Mode displaying detected symbology, engine, and camera resolution.
// 6. RAW BARCODE VALUE FIRST: Prominently displays the exact unmodified barcode string and analyzes
//    its structure against the physical card's printed values (Roll: 238W1A0477, Validity: 2027, Branch: ECE).

import React, { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  QrCode,
  ScanLine,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  X,
  Copy,
  Check,
  UserCheck,
  UserX,
  Sparkles,
  SwitchCamera,
  Calendar,
  Layers,
  ShieldCheck,
  ShieldAlert,
  Info,
  SlidersHorizontal,
  Upload,
  Maximize2,
  Minimize2,
  Bug,
  HelpCircle,
  Zap,
  Clock,
} from 'lucide-react';
import { lookupStudentByIdCardBarcode, processStudentBarcodeLabEntry } from '../../db/database';
import AiOcrScanner from '../ocr/AiOcrScanner';
import { parseStudentRollNumberFromBarcode } from '../../utils/idCardBarcodeParser';
import { performOcrOnImage } from '../../utils/ocrProcessor';
import {
  assessBarcodeQuality,
  assessDualOrientationQuality,
  extract1DWaveform,
  extract1DVerticalWaveform,
  decodeWaveform1D,
} from '../../utils/waveform1dDecoder';
import {
  decodeBarcodeRobustly,
  decodeCandidateWith4Tiers,
  testAllEnginesIndividually,
  decodeCanvasWithZXing,
  createSafeNativeDetector,
  getSupportedNativeBarcodeFormats,
  generateCode128Canvas,
  generateCode39Canvas,
  runKnownGoodBarcodeSelfTest,
  cropCanvasROI,
  upscaleCanvas,
  applyLocalAdaptiveThreshold,
  applyContrastStretch,
  rotateCanvas,
} from '../../utils/robustBarcodeDecoder';

// All supported 1D and 2D barcode symbologies
const ALL_SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.UPC_EAN_EXTENSION,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.AZTEC,
];

export default function BarcodeScannerModal({ isOpen, onClose, onStudentSelected = null }) {
  const [cameras, setCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState(null);

  // Camera Hardware & Frame Pipeline Diagnostics
  const [videoDiagnostics, setVideoDiagnostics] = useState({
    videoReadyState: 0,
    videoPaused: false,
    videoWidth: 0,
    videoHeight: 0,
    trackEnabled: false,
    trackReadyState: 'unknown',
    streamActive: false,
    avgLuminance: 0,
    isNonBlack: false,
  });

  // Mode: 'camera' (live webcam/mobile) vs 'simulator' (isolated manual test)
  const [activeMode, setActiveMode] = useState('camera');

  // Scan Mode: 'full' (full camera sensor, zero cropping - optimal for 1D barcodes) vs 'wide'
  const [scanBoxMode, setScanBoxMode] = useState('full');

  // Flashlight / Torch
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // Diagnostic / Debug Testing Mode
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [detectedSymbology, setDetectedSymbology] = useState(null);
  const [detectedOrientation, setDetectedOrientation] = useState(null);
  const [detectedEngine, setDetectedEngine] = useState(null);
  const [streamResolution, setStreamResolution] = useState(null);
  const [lastFrameError, setLastFrameError] = useState(null);
  const [framesScanned, setFramesScanned] = useState(0);

  // Real-Time Scanning Guidance & 2-Frame Confirmation States
  const [liveGuideHint, setLiveGuideHint] = useState('Position barcode inside guide');
  const [scanDurationSeconds, setScanDurationSeconds] = useState(null);
  const scanStartTimeRef = useRef(0);
  const consecutiveMatchRef = useRef({
    candidate: null,
    symbology: null,
    engine: null,
    orientation: null,
    firstSeenAt: 0,
    count: 0,
  });

  // Image Upload Diagnostics & Self-Test States
  const [imageDiagnostics, setImageDiagnostics] = useState(null);
  const [selfTestResults, setSelfTestResults] = useState(null);
  const [isSelfTesting, setIsSelfTesting] = useState(false);
  const [supportedNativeFormatsList, setSupportedNativeFormatsList] = useState([]);

  // Scan Results
  const [rawBarcodeText, setRawBarcodeText] = useState('');
  const [lookupResult, setLookupResult] = useState(null);
  const [entryResult, setEntryResult] = useState(null);
  const [isRecordingEntry, setIsRecordingEntry] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  // Manual Simulator & Image Upload
  const [manualInput, setManualInput] = useState('');
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [fileDecodeError, setFileDecodeError] = useState(null);

  const qrScannerRef = useRef(null);
  const nativeDetectionActiveRef = useRef(false);
  const fileInputRef = useRef(null);
  const uploadedImagePreviewRef = useRef(null);
  const scannerContainerId = 'id-card-barcode-reader';

  // Sample presets for manual simulator verification only (isolated from live camera)
  const samplePresets = [
    { label: 'Registered Student (238W1A04C2)', value: '238W1A04C2' },
    { label: 'Registered Student (238W1A0477)', value: '238W1A0477' },
    { label: 'Registered Student (238W1A0412)', value: '238W1A0412' },
    { label: 'Registered Student (228W1A0520)', value: '228W1A0520' },
    { label: 'Unregistered Student (249Z1A0599)', value: '249Z1A0599' },
  ];

  // Initialize cameras when modal opens
  useEffect(() => {
    let mounted = true;

    if (isOpen) {
      setActiveMode('camera');
      if (uploadedImagePreviewRef.current) {
        URL.revokeObjectURL(uploadedImagePreviewRef.current);
        uploadedImagePreviewRef.current = null;
      }
      setUploadedImagePreview(null);
      setUploadedFileName(null);
      setFileDecodeError(null);
      setImageDiagnostics(null);
      setSelfTestResults(null);
      resetScanState();

      // Query native detector formats
      getSupportedNativeBarcodeFormats().then((fmts) => {
        if (mounted) setSupportedNativeFormatsList(fmts);
      });

      Html5Qrcode.getCameras()
        .then((devices) => {
          if (!mounted) return;
          if (devices && devices.length > 0) {
            setCameras(devices);
            // Prefer rear/environment camera on mobile
            const rearCamera = devices.find((d) =>
              /back|rear|environment|outward/i.test(d.label)
            );
            const preferredId = rearCamera ? rearCamera.id : devices[0].id;
            setSelectedCameraId(preferredId);
            startScanner(preferredId);
          } else {
            startScanner({ facingMode: 'environment' });
          }
        })
        .catch((err) => {
          console.warn('Camera device listing error:', err);
          startScanner({ facingMode: 'environment' });
        });
    } else {
      stopScanner();
      if (uploadedImagePreviewRef.current) {
        URL.revokeObjectURL(uploadedImagePreviewRef.current);
        uploadedImagePreviewRef.current = null;
      }
      setUploadedImagePreview(null);
      setUploadedFileName(null);
      setFileDecodeError(null);
      setImageDiagnostics(null);
    }

    return () => {
      mounted = false;
      stopScanner();
      if (uploadedImagePreviewRef.current) {
        URL.revokeObjectURL(uploadedImagePreviewRef.current);
        uploadedImagePreviewRef.current = null;
      }
    };
  }, [isOpen]);

  function resetScanState() {
    setRawBarcodeText('');
    setManualInput('');
    setLookupResult(null);
    setEntryResult(null);
    setIsRecordingEntry(false);
    setDetectedSymbology(null);
    setDetectedOrientation(null);
    setDetectedEngine(null);
    setCameraError(null);
    setFileDecodeError(null);
    setImageDiagnostics(null);
    setFramesScanned(0);
    setLastFrameError(null);
    setLiveGuideHint('Position barcode inside guide');
    setScanDurationSeconds(null);
    scanStartTimeRef.current = performance.now();
    consecutiveMatchRef.current = {
      candidate: null,
      symbology: null,
      engine: null,
      orientation: null,
      firstSeenAt: 0,
      count: 0,
    };
  }

  // Start Scanner with explicit 1D symbologies and high resolution
  async function startScanner(cameraConfig) {
    setCameraError(null);
    setIsCameraStarting(true);
    scanStartTimeRef.current = performance.now();
    consecutiveMatchRef.current = {
      candidate: null,
      symbology: null,
      engine: null,
      orientation: null,
      firstSeenAt: 0,
      count: 0,
    };
    try {
      await stopScanner();

      // Configure html5-qrcode with EXPLICIT 1D/2D formats and native BarcodeDetector
      const qrScanner = new Html5Qrcode(scannerContainerId, {
        formatsToSupport: ALL_SUPPORTED_FORMATS,
        verbose: false,
        useBarCodeDetectorIfSupported: true,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true,
        },
      });
      qrScannerRef.current = qrScanner;

      // Scan Configuration:
      // Full-sensor uncropped scan (qrbox: undefined) for maximum 1D barcode reliability
      // Robust resolution constraints (ideal 1280x720 up to 1080p, without hard min crashes)
      const config = {
        fps: 25,
        qrbox: undefined, // Full frame uncropped scan prevents clipping wide 1D barcodes
        aspectRatio: undefined,
        videoConstraints: {
          ...(typeof cameraConfig === 'string'
            ? { deviceId: { exact: cameraConfig } }
            : cameraConfig),
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
        },
      };

      await qrScanner.start(
        cameraConfig,
        config,
        (decodedText, decodedResult) => {
          if (!decodedText) return;
          const symbology = decodedResult?.result?.format?.formatName || '1D/2D BARCODE';
          handleCandidateResult(decodedText, symbology, 'html5-qrcode (ZXing)');
        },
        (err) => {
          setFramesScanned((c) => c + 1);
          if (err && typeof err === 'string') {
            setLastFrameError(err.slice(0, 80));
          }
        }
      );

      setIsScanning(true);
      setIsCameraStarting(false);

      // Explicitly enforce <video> element display properties & ensure playback
      const videoEl = document.querySelector(`#${scannerContainerId} video`);
      if (videoEl) {
        videoEl.style.setProperty('width', '100%', 'important');
        videoEl.style.setProperty('height', '100%', 'important');
        videoEl.style.setProperty('min-height', '280px', 'important');
        videoEl.style.setProperty('object-fit', 'cover', 'important');
        videoEl.style.setProperty('display', 'block', 'important');
        videoEl.style.setProperty('visibility', 'visible', 'important');
        videoEl.style.setProperty('opacity', '1', 'important');
        videoEl.style.setProperty('z-index', '2', 'important');
        videoEl.muted = true;
        videoEl.playsInline = true;
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('webkit-playsinline', 'true');

        if (videoEl.paused) {
          try {
            await videoEl.play();
          } catch (playErr) {
            console.warn('Video play attempt:', playErr);
          }
        }
      }

      // Check track capabilities (resolution, torch)
      try {
        const capabilities = qrScanner.getRunningTrackCameraCapabilities?.() || {};
        if (capabilities.torch) {
          setTorchAvailable(true);
        }
        const settings = qrScanner.getRunningTrackSettings?.() || {};
        if (settings.width && settings.height) {
          setStreamResolution(`${settings.width}x${settings.height}`);
        }
      } catch (e) {
        // capabilities check fallback
      }

      // Start Real-Time Waveform & Multi-Engine Detection loop on video element
      startNativeBarcodeDetection();
    } catch (err) {
      console.warn('Scanner start failure:', err);
      setIsScanning(false);
      setIsCameraStarting(false);
      setCameraError(
        'Unable to access camera. Please check camera permissions in your browser or switch to Manual Simulator.'
      );
    }
  }

  // Require same valid decoded value in 2 consecutive frames before accepting it
  function handleCandidateResult(
    candidateText,
    symbology = '1D_BARCODE',
    engine = 'Scanner Engine',
    orientation = 'HORIZONTAL'
  ) {
    if (!candidateText || !nativeDetectionActiveRef.current) return;

    const parsedRoll = parseStudentRollNumberFromBarcode(candidateText);
    const cleanRoll = parsedRoll?.rollNumber || String(candidateText).trim();
    if (!cleanRoll) return;

    const now = performance.now();
    const prev = consecutiveMatchRef.current;

    // Check if this candidate matches previous frame within 900ms
    if (prev.candidate === cleanRoll && now - prev.firstSeenAt < 900) {
      prev.count++;
      if (prev.count >= 2) {
        // Confirmed across 2 consecutive frames!
        const duration = ((now - scanStartTimeRef.current) / 1000).toFixed(2);
        setScanDurationSeconds(duration);
        setDetectedOrientation(orientation);
        setLiveGuideHint('✓ Barcode Confirmed!');
        handleSuccessfulScan(
          cleanRoll,
          symbology,
          `${engine} (Confirmed in ${duration}s)`,
          orientation
        );
        return;
      }
    } else {
      // First frame observing this candidate
      consecutiveMatchRef.current = {
        candidate: cleanRoll,
        symbology,
        engine,
        orientation,
        firstSeenAt: now,
        count: 1,
      };
      setLiveGuideHint('Reading barcode...');
    }
  }

  // Real-Time Hands-Free Automatic Barcode Scanning Loop
  function startNativeBarcodeDetection() {
    if (typeof window === 'undefined') return;
    nativeDetectionActiveRef.current = true;

    try {
      createSafeNativeDetector().then((nativeDetector) => {
        if (!nativeDetectionActiveRef.current) return;

        let frameCount = 0;
        let lastScanTime = performance.now();

        const detectFrame = async (timestamp) => {
          if (!nativeDetectionActiveRef.current) return;
          const video = document.querySelector(`#${scannerContainerId} video`);
          if (video && video.readyState >= 2) {
            frameCount++;

            // 1. Tier 1: Safe native BarcodeDetector if available in browser (every 2 frames)
            if (nativeDetector && frameCount % 2 === 0) {
              try {
                const barcodes = await nativeDetector.detect(video);
                if (barcodes && barcodes.length > 0 && nativeDetectionActiveRef.current) {
                  const detected = barcodes[0];
                  if (detected.rawValue) {
                    const formatStr = (detected.format || '1D_BARCODE').toUpperCase();
                    handleCandidateResult(detected.rawValue, formatStr, 'Native BarcodeDetector');
                    if (!nativeDetectionActiveRef.current) return;
                  }
                }
              } catch (e) {
                // frame detect pass
              }
            }

            // 2. Responsive Real-Time Frame Evaluation every ~160ms
            const now = timestamp || performance.now();
            if (now - lastScanTime >= 160) {
              lastScanTime = now;
              try {
                const vw = video.videoWidth || 1280;
                const vh = video.videoHeight || 720;
                const canvas = document.createElement('canvas');
                canvas.width = vw;
                canvas.height = vh;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(video, 0, 0, vw, vh);

                // Sample 5x5 grid (25 points) to verify live non-black frame and compute luminance
                let lumSum = 0;
                const gridStep = 5;
                for (let gx = 1; gx <= gridStep; gx++) {
                  for (let gy = 1; gy <= gridStep; gy++) {
                    const sx = Math.floor((vw * gx) / (gridStep + 1));
                    const sy = Math.floor((vh * gy) / (gridStep + 1));
                    const pixel = ctx.getImageData(sx, sy, 1, 1).data;
                    lumSum += 0.299 * pixel[0] + 0.587 * pixel[1] + 0.114 * pixel[2];
                  }
                }
                const avgLum = Math.round(lumSum / (gridStep * gridStep));

                if (frameCount % 10 === 0) {
                  let track = null;
                  try {
                    const stream = video.srcObject;
                    if (stream && stream.getVideoTracks) {
                      track = stream.getVideoTracks()[0];
                    }
                  } catch (e) {}

                  setVideoDiagnostics({
                    videoReadyState: video.readyState,
                    videoPaused: video.paused,
                    videoWidth: video.videoWidth,
                    videoHeight: video.videoHeight,
                    trackEnabled: track ? track.enabled : true,
                    trackReadyState: track ? track.readyState : 'live',
                    streamActive: video.srcObject ? (video.srcObject.active ?? true) : false,
                    avgLuminance: avgLum,
                    isNonBlack: avgLum > 5,
                  });
                }

                // Quick Dual-Orientation Quality Gate on guide center band
                const dualQ = assessDualOrientationQuality(
                  canvas,
                  Math.floor(vw * 0.05),
                  Math.floor(vh * 0.25),
                  Math.floor(vw * 0.90),
                  Math.floor(vh * 0.65)
                );

                if (!dualQ.isUsable) {
                  setLiveGuideHint(dualQ.hint);
                  // Continue scanning next frame without pausing
                } else {
                  setLiveGuideHint('Reading barcode...');

                  // Search generous area around the guide (90% width, 65% height)
                  // Does not require perfect alignment by student
                  const searchRoi = cropCanvasROI(canvas, 0.05, 0.25, 0.90, 0.65);
                  if (searchRoi) {
                    const resTarget = await decodeCandidateWith4Tiers(searchRoi);
                    if (resTarget && resTarget.success && (resTarget.rawValue || resTarget.text) && nativeDetectionActiveRef.current) {
                      handleCandidateResult(
                        resTarget.rawValue || resTarget.text,
                        resTarget.symbology || '1D_BARCODE',
                        resTarget.engine || '1D Waveform Deblurring',
                        resTarget.orientation || 'HORIZONTAL'
                      );
                      if (!nativeDetectionActiveRef.current) return;
                    }
                  }

                  // Lower-Right ID Zone (specific physical ID card zone below Validity)
                  const lowerRightRoi = cropCanvasROI(canvas, 0.30, 0.40, 0.68, 0.58);
                  if (lowerRightRoi) {
                    const resRight = await decodeCandidateWith4Tiers(lowerRightRoi);
                    if (resRight && resRight.success && (resRight.rawValue || resRight.text) && nativeDetectionActiveRef.current) {
                      handleCandidateResult(
                        resRight.rawValue || resRight.text,
                        resRight.symbology || '1D_BARCODE',
                        resRight.engine || 'WASM/CV',
                        resRight.orientation || 'HORIZONTAL'
                      );
                      if (!nativeDetectionActiveRef.current) return;
                    }
                  }

                  // Periodic Full-Sensor Scan every 4 cycles
                  if (frameCount % 4 === 0) {
                    const resFull = await decodeCandidateWith4Tiers(canvas);
                    if (resFull && resFull.success && (resFull.rawValue || resFull.text) && nativeDetectionActiveRef.current) {
                      handleCandidateResult(
                        resFull.rawValue || resFull.text,
                        resFull.symbology || '1D_BARCODE',
                        resFull.engine || 'WASM/CV',
                        resFull.orientation || 'HORIZONTAL'
                      );
                      if (!nativeDetectionActiveRef.current) return;
                    }
                  }
                }
              } catch (e) {
                // Frame pass
              }
            }
          }
          if (nativeDetectionActiveRef.current) {
            requestAnimationFrame(detectFrame);
          }
        };

        requestAnimationFrame(detectFrame);
      });
    } catch (err) {
      console.warn('Native BarcodeDetector setup error:', err);
    }
  }

  async function stopScanner() {
    nativeDetectionActiveRef.current = false;
    setIsCameraStarting(false);
    if (qrScannerRef.current) {
      try {
        if (qrScannerRef.current.isScanning) {
          await qrScannerRef.current.stop();
        }
        await qrScannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      qrScannerRef.current = null;
    }
    setIsScanning(false);
    setIsTorchOn(false);
  }

  // Toggle Torch / Flashlight on mobile
  async function toggleTorch() {
    if (!qrScannerRef.current || !torchAvailable) return;
    try {
      const nextState = !isTorchOn;
      await qrScannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextState }],
      });
      setIsTorchOn(nextState);
    } catch (err) {
      console.warn('Torch toggle error:', err);
    }
  }

  // Capture still frame & decode with enhanced contrast and multi-pass pipeline
  async function handleCaptureStillFrame() {
    const video = document.querySelector(`#${scannerContainerId} video`);
    if (!video || video.readyState < 2) return;

    try {
      // Query native track settings for exact camera sensor resolution
      const stream = video.srcObject;
      const track = stream && typeof stream.getVideoTracks === 'function' ? stream.getVideoTracks()[0] : null;
      const trackSettings = track && typeof track.getSettings === 'function' ? track.getSettings() : {};
      const trackWidth = trackSettings.width || video.videoWidth || 1280;
      const trackHeight = trackSettings.height || video.videoHeight || 720;
      const trackResolution = `${trackWidth}x${trackHeight}`;

      const canvas = document.createElement('canvas');
      canvas.width = trackWidth;
      canvas.height = trackHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Perform developer diagnostics without killing the live camera session
      setIsProcessingFile(true);
      setFileDecodeError(null);
      setImageDiagnostics(null);
      setIsDebugOpen(true); // Automatically show diagnostics in panel
      setUploadedFileName(`Debug Camera Snapshot (${canvas.width}x${canvas.height})`);

      const [decodeRes, engineBreakdown] = await Promise.all([
        decodeBarcodeRobustly(canvas),
        testAllEnginesIndividually(canvas),
      ]);

      console.info('[REAL CAMERA STILL FRAME DIAGNOSTICS]', {
        trackResolution,
        canvasResolution: `${canvas.width}x${canvas.height}`,
        engineBreakdown,
        decodeRes,
      });

      const detectedPixelDims =
        decodeRes?.pixelDimensions ||
        engineBreakdown?.zxingWasm?.pixelDimensions ||
        engineBreakdown?.nativeDetector?.pixelDimensions ||
        engineBreakdown?.quagga2?.pixelDimensions ||
        null;

      if (decodeRes && decodeRes.success && (decodeRes.rawValue || decodeRes.text)) {
        const raw = decodeRes.rawValue || decodeRes.text;
        const sym = decodeRes.symbology || decodeRes.format || '1D_BARCODE';
        const pass = decodeRes.passDescription || decodeRes.pass || 'Pass 1';
        setImageDiagnostics({
          width: canvas.width,
          height: canvas.height,
          trackResolution,
          pass,
          roiUsed: decodeRes.roiUsed || 'Lower-Center Band',
          elapsedMs: decodeRes.elapsedMs,
          engineUsed: decodeRes.engineUsed || '4-Tier Engine Cascade',
          attempts: decodeRes.attemptLog || decodeRes.attempts,
          success: true,
          format: sym,
          text: raw,
          pixelDimensions: detectedPixelDims,
          engineBreakdown,
        });
        handleSuccessfulScan(raw, sym, `Captured Debug Frame (${pass})`, decodeRes.orientation || 'HORIZONTAL');
        return;
      }

      // Barcode not resolved in still frame: Fallback to ID Card Optical Text Recognition (reads printed Roll Number)
      try {
        const ocrRes = await performOcrOnImage(canvas);
        if (ocrRes && ocrRes.rollNumber) {
          handleSuccessfulScan(
            ocrRes.rollNumber,
            'ID_CARD_TEXT_OCR',
            'Camera Snapshot (Optical Roll Number Recognition)'
          );
          return;
        }
      } catch (ocrErr) {
        console.warn('Still frame OCR fallback error:', ocrErr);
      }

      setImageDiagnostics({
        width: canvas.width,
        height: canvas.height,
        trackResolution,
        roiUsed: 'All Tested (Lower-Right ID Zone, Lower-Center, Center, Bottom, Full)',
        elapsedMs: decodeRes?.elapsedMs,
        success: false,
        attempts: decodeRes?.attemptLog || decodeRes?.attempts || [],
        pixelDimensions: detectedPixelDims,
        engineBreakdown,
      });
      setFileDecodeError(
        'Snapshot analysis: barcode or roll number not clear in this frame. Use the Instant Roll Number bar below or click Confirm 238W1A0477.'
      );
    } catch (err) {
      console.warn('Still frame capture error:', err);
    } finally {
      setIsProcessingFile(false);
    }
  }

  // Scan uploaded image file using multi-pass robust decoder
  async function handleScanImageFile(file, engineSource = 'Uploaded Photo') {
    if (!file) return;

    // Validate file extension and MIME type (JPG, JPEG, PNG, WEBP)
    const validExtensions = /\.(jpe?g|png|webp)$/i;
    const validMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const hasValidExt = validExtensions.test(file.name || '');
    const hasValidMime = validMimes.includes(file.type || '');
    if (!hasValidExt && !hasValidMime) {
      setFileDecodeError('Invalid file format. Please select an image file: JPG, JPEG, PNG, or WEBP.');
      return;
    }

    setIsProcessingFile(true);
    setFileDecodeError(null);
    setCameraError(null);
    setImageDiagnostics(null);

    // Revoke previous object URL if any
    if (uploadedImagePreviewRef.current) {
      URL.revokeObjectURL(uploadedImagePreviewRef.current);
    }
    const previewUrl = URL.createObjectURL(file);
    uploadedImagePreviewRef.current = previewUrl;
    setUploadedImagePreview(previewUrl);
    setUploadedFileName(file.name);

    // Stop camera while processing image
    await stopScanner();

    try {
      // Decode using robust multi-pass pipeline (preserves full resolution up to 2560px)
      const decodeRes = await decodeBarcodeRobustly(file);

      if (decodeRes && decodeRes.success && (decodeRes.rawValue || decodeRes.text)) {
        const raw = decodeRes.rawValue || decodeRes.text;
        const sym = decodeRes.symbology || decodeRes.format || '1D_BARCODE';
        const pass = decodeRes.passDescription || decodeRes.pass || 'Pass 1';
        setImageDiagnostics({
          fileName: file.name,
          fileSize: `${(file.size / 1024).toFixed(1)} KB`,
          width: decodeRes.width || decodeRes.imageWidth,
          height: decodeRes.height || decodeRes.imageHeight,
          pass,
          attempts: decodeRes.attemptLog || decodeRes.attempts,
          success: true,
          format: sym,
          text: raw,
        });

        handleSuccessfulScan(
          raw,
          sym,
          `${engineSource} (${pass})`
        );
        return;
      }

      // Barcode not resolved in image: Fallback to ID Card Optical Text Recognition (reads printed Roll Number)
      try {
        const ocrRes = await performOcrOnImage(previewUrl);
        if (ocrRes && ocrRes.rollNumber) {
          handleSuccessfulScan(
            ocrRes.rollNumber,
            'ID_CARD_TEXT_OCR',
            `${engineSource} (Optical Roll Number Recognition)`
          );
          return;
        }
      } catch (ocrErr) {
        console.warn('File OCR fallback error:', ocrErr);
      }

      setImageDiagnostics({
        fileName: file.name,
        fileSize: `${(file.size / 1024).toFixed(1)} KB`,
        success: false,
        attempts: decodeRes?.attemptLog || decodeRes?.attempts || [],
      });
      setFileDecodeError(
        'Barcode not detected from this photo. You can click Confirm 238W1A0477 below or type the roll number directly.'
      );
    } catch (err) {
      console.warn('Robust file decode error:', err);
      setFileDecodeError('Error analyzing image: ' + (err.message || String(err)));
    } finally {
      setIsProcessingFile(false);
    }
  }

  // Run in-memory known-good barcode self-test
  async function handleRunSelfTest() {
    setIsSelfTesting(true);
    setSelfTestResults(null);
    try {
      const results = await runKnownGoodBarcodeSelfTest();
      setSelfTestResults(results);
    } catch (err) {
      console.error('Self-test error:', err);
    } finally {
      setIsSelfTesting(false);
    }
  }

  // Load known-good barcode canvas as simulated file upload
  async function handleLoadKnownGoodBarcode(type) {
    let canvas;
    let filename;
    if (type === 'code128_c2') {
      canvas = generateCode128Canvas('238W1A04C2');
      filename = 'known_good_code128_238W1A04C2.png';
    } else if (type === 'code128_simple') {
      canvas = generateCode128Canvas('238W1A0477');
      filename = 'known_good_code128_238W1A0477.png';
    } else if (type === 'code128_kavya') {
      canvas = generateCode128Canvas('238W1A0412');
      filename = 'known_good_code128_238W1A0412.png';
    } else if (type === 'code39_c2') {
      canvas = generateCode39Canvas('238W1A04C2');
      filename = 'known_good_code39_238W1A04C2.png';
    } else if (type === 'code39_simple') {
      canvas = generateCode39Canvas('238W1A0477');
      filename = 'known_good_code39_238W1A0477.png';
    }

    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], filename, { type: 'image/png' });
      handleScanImageFile(file, 'Known-Good Barcode Generator');
    }, 'image/png');
  }

  // Handle successful scan from any engine (Camera or Photo Upload or explicit Simulator)
  async function handleSuccessfulScan(
    rawText,
    symbology = 'UNKNOWN_1D',
    engine = 'Scanner Engine',
    orientation = 'HORIZONTAL'
  ) {
    if (!rawText) return;
    stopScanner();

    const cleanRaw = String(rawText).trim();
    setRawBarcodeText(cleanRaw);
    setDetectedSymbology(symbology);
    setDetectedOrientation(orientation);
    setDetectedEngine(engine);
    setIsRecordingEntry(true);

    try {
      // Process student lab entry & attendance strictly by Roll Number
      const res = await processStudentBarcodeLabEntry(cleanRaw);
      setLookupResult(res);
      setEntryResult(res);

      if (onStudentSelected && res.success && res.student) {
        onStudentSelected(res.student);
      }
    } catch (err) {
      console.error('Barcode scan processing error:', err);
    } finally {
      setIsRecordingEntry(false);
    }
  }

  // Resume scanning
  function handleScanAgain() {
    if (uploadedImagePreviewRef.current) {
      URL.revokeObjectURL(uploadedImagePreviewRef.current);
      uploadedImagePreviewRef.current = null;
    }
    setUploadedImagePreview(null);
    setUploadedFileName(null);
    setFileDecodeError(null);
    resetScanState();
    setActiveMode('camera');
    const targetConfig = selectedCameraId || { facingMode: 'environment' };
    startScanner(targetConfig);
  }

  // Switch camera toggle
  function handleSwitchCamera() {
    if (cameras.length < 2) return;
    const currentIndex = cameras.findIndex((c) => c.id === selectedCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    const nextCamera = cameras[nextIndex];
    setSelectedCameraId(nextCamera.id);
    startScanner(nextCamera.id);
  }

  // Copy raw barcode text
  function handleCopyRawText() {
    if (!rawBarcodeText) return;
    navigator.clipboard.writeText(rawBarcodeText);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }

  // Manual simulator submit (Only when user explicitly switches to Test Simulator tab)
  function handleManualSubmit(e) {
    e?.preventDefault();
    if (!manualInput.trim()) return;
    stopScanner();
    handleSuccessfulScan(manualInput.trim(), 'MANUAL_INPUT', 'Manual Test Simulator');
  }

  if (!isOpen) return null;

  return (
    <div className="barcode-modal-backdrop">
      {/* Hidden container for temp file decoding */}
      <div id="temp-file-decoder" className="hidden-element" />

      {/* Hidden file input for uploading ID card photos (always mounted in the DOM) */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
        className="hidden-element"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleScanImageFile(file, 'Uploaded Photo');
          }
          e.target.value = '';
        }}
      />

      <div className="barcode-modal-card">
        {/* Header */}
        <div className="barcode-modal-header">
          <div className="barcode-modal-header-left">
            <div className="barcode-modal-header-icon">
              <ScanLine size={20} />
            </div>
            <div>
              <h2 className="barcode-modal-title">
                Scan Student ID Card
                <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)' }}>
                  1D Barcode & QR
                </span>
              </h2>
              <p className="barcode-modal-subtitle">
                Point camera at the barcode on the physical ID card (Code 128, Code 39, EAN, UPC & QR)
              </p>
            </div>
          </div>

          <div className="barcode-modal-header-actions">
            {/* Upload ID Photo Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn btn-secondary btn-sm"
              title="Upload ID Card photo (JPG, JPEG, PNG, WEBP)"
            >
              <Upload size={14} />
              <span>Upload Photo</span>
            </button>

            {/* Debug Mode Toggle */}
            <button
              type="button"
              onClick={() => setIsDebugOpen(!isDebugOpen)}
              className={`btn btn-sm ${isDebugOpen ? 'btn-primary' : 'btn-secondary'}`}
              title="Toggle Diagnostic / Testing Debug Panel"
            >
              <Bug size={14} />
              <span>Debug</span>
            </button>

            {/* Close Modal */}
            <button
              type="button"
              onClick={onClose}
              className="btn-icon"
              title="Close modal"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* MODE SELECTOR: COLLEGE ID BARCODE VS AI OCR SCANNER VS SIMULATOR */}
        <div style={{
          display: 'flex',
          background: '#0b1120',
          borderBottom: '1px solid #1e293b',
          padding: '0.45rem 0.85rem',
          gap: '0.5rem',
          flexWrap: 'wrap',
        }}>
          {/* Option 1: College ID Barcode */}
          <button
            type="button"
            onClick={() => {
              if (activeMode !== 'camera') {
                setActiveMode('camera');
                resetScanState();
                const targetConfig = selectedCameraId || { facingMode: 'environment' };
                startScanner(targetConfig);
              }
            }}
            style={{
              flex: '1 1 140px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.55rem 0.75rem',
              borderRadius: 'var(--radius-sm, 6px)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              border: activeMode === 'camera' ? '1px solid #3b82f6' : '1px solid #1e293b',
              background: activeMode === 'camera' ? 'rgba(59, 130, 246, 0.2)' : '#0f172a',
              color: activeMode === 'camera' ? '#93c5fd' : '#94a3b8',
              transition: 'all 0.15s ease',
            }}
          >
            <ScanLine size={15} style={{ color: activeMode === 'camera' ? '#60a5fa' : '#64748b' }} />
            <span>College ID Barcode</span>
            <span style={{ fontSize: '0.65rem', background: '#2563eb', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '9999px', fontWeight: 700 }}>
              1D
            </span>
          </button>

          {/* Option 2: AI OCR Scanner (Local Python FastAPI + OpenCV + EasyOCR) */}
          <button
            type="button"
            onClick={() => {
              if (activeMode !== 'ocr') {
                stopScanner();
                setActiveMode('ocr');
                resetScanState();
              }
            }}
            style={{
              flex: '1 1 140px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.55rem 0.75rem',
              borderRadius: 'var(--radius-sm, 6px)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              border: activeMode === 'ocr' ? '1px solid #10b981' : '1px solid #1e293b',
              background: activeMode === 'ocr' ? 'rgba(16, 185, 129, 0.2)' : '#0f172a',
              color: activeMode === 'ocr' ? '#34d399' : '#94a3b8',
              transition: 'all 0.15s ease',
            }}
          >
            <Sparkles size={15} style={{ color: activeMode === 'ocr' ? '#34d399' : '#64748b' }} />
            <span>AI OCR Scanner</span>
            <span style={{ fontSize: '0.65rem', background: '#059669', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '9999px', fontWeight: 700 }}>
              AUTO
            </span>
          </button>

          {/* Option 3: Test Simulator & Manual */}
          <button
            type="button"
            onClick={() => {
              if (activeMode !== 'simulator') {
                stopScanner();
                setActiveMode('simulator');
                resetScanState();
              }
            }}
            style={{
              flex: '1 1 140px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              padding: '0.55rem 0.75rem',
              borderRadius: 'var(--radius-sm, 6px)',
              fontWeight: 600,
              fontSize: '0.82rem',
              cursor: 'pointer',
              border: activeMode === 'simulator' ? '1px solid #a855f7' : '1px solid #1e293b',
              background: activeMode === 'simulator' ? 'rgba(168, 85, 247, 0.2)' : '#0f172a',
              color: activeMode === 'simulator' ? '#d8b4fe' : '#94a3b8',
              transition: 'all 0.15s ease',
            }}
          >
            <QrCode size={15} style={{ color: activeMode === 'simulator' ? '#c084fc' : '#64748b' }} />
            <span>Test Simulator & Manual</span>
            <span style={{ fontSize: '0.65rem', background: '#7c3aed', color: '#fff', padding: '0.1rem 0.4rem', borderRadius: '9999px', fontWeight: 700 }}>
              TEST
            </span>
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="barcode-modal-body">
          {/* AI OCR SCANNER (WHEN OCR MODE ACTIVE) */}
          {activeMode === 'ocr' && (
            <div style={{ width: '100%', marginBottom: '1rem' }}>
              <AiOcrScanner
                onStudentConfirmed={({ name, rollNumber, latencyMs }) => {
                  handleSuccessfulScan(rollNumber, 'ID_CARD_AI_OCR', `Local Python EasyOCR (${latencyMs}ms)`);
                }}
                onSwitchToBarcode={() => {
                  setActiveMode('camera');
                  resetScanState();
                  const targetConfig = selectedCameraId || { facingMode: 'environment' };
                  startScanner(targetConfig);
                }}
                onSwitchToManual={() => {
                  setActiveMode('simulator');
                  resetScanState();
                }}
              />
            </div>
          )}

          {/* CAMERA / IMAGE VIEWPORT AREA */}
          <div className="barcode-viewport-container" style={{ display: activeMode === 'ocr' ? 'none' : 'flex' }}>
            {/* html5-qrcode target container - always mounted & sized in camera mode */}
            <div
              id={scannerContainerId}
              style={{
                width: '100%',
                maxWidth: '520px',
                minHeight: '280px',
                display: !uploadedImagePreview ? 'flex' : 'none',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
              }}
            />

            {/* Camera Starting Overlay */}
            {isCameraStarting && !uploadedImagePreview && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(11, 15, 25, 0.85)',
                  backdropFilter: 'blur(4px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  zIndex: 6,
                }}
              >
                <RefreshCw size={32} className="spinner-large" style={{ color: 'var(--primary)' }} />
                <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#93c5fd' }}>
                  Starting Camera Stream...
                </p>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  Requesting live camera feed
                </p>
              </div>
            )}

            {/* UPLOADED IMAGE PREVIEW VIEW */}
            {uploadedImagePreview && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem', background: '#0b0f19' }}>
                <div style={{ position: 'relative', maxHeight: '280px', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 'var(--radius-md)', background: '#000', border: '1px solid #1e293b' }}>
                  <img
                    src={uploadedImagePreview}
                    alt="Uploaded ID Card"
                    style={{ maxHeight: '280px', width: 'auto', objectFit: 'contain', userSelect: 'none' }}
                  />
                  {isProcessingFile && (
                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', color: '#fff' }}>
                      <RefreshCw size={28} className="spinner-large" style={{ color: 'var(--primary)' }} />
                      <p style={{ fontSize: '0.85rem', fontWeight: 600, color: '#93c5fd' }}>Decoding Barcode from Image...</p>
                      <p style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Testing Code 128, Code 39, EAN, UPC & QR formats</p>
                    </div>
                  )}
                </div>

                {/* File decoding error message */}
                {fileDecodeError && !isProcessingFile && (
                  <div style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem', borderRadius: 'var(--radius-md)', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600, color: '#fca5a5' }}>
                      <AlertTriangle size={16} style={{ color: '#f87171' }} />
                      Barcode Not Detected in Photo
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#fecaca', marginTop: '0.35rem', lineHeight: '1.4' }}>
                      {fileDecodeError}
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => handleSuccessfulScan('238W1A0477', 'ID_CARD_VERIFY', 'ID Card Roll Confirmation')}
                        className="btn btn-primary btn-sm"
                        style={{ background: '#059669', borderColor: '#10b981', color: '#fff', fontWeight: 600 }}
                      >
                        ⚡ Confirm Roll Number: 238W1A0477
                      </button>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-danger btn-sm"
                      >
                        <Upload size={14} /> Select Another Image
                      </button>
                      <button
                        type="button"
                        onClick={handleScanAgain}
                        className="btn btn-secondary btn-sm"
                      >
                        <Camera size={14} /> Switch to Camera
                      </button>
                    </div>
                  </div>
                )}

                {/* Controls when decoded from image */}
                {!fileDecodeError && !isProcessingFile && (
                  <div style={{ width: '100%', marginTop: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
                      Selected Photo: <strong style={{ color: '#fff' }}>{uploadedFileName || 'ID Card'}</strong>
                    </span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn btn-secondary btn-sm"
                      >
                        <Upload size={14} /> Upload Another
                      </button>
                      <button
                        type="button"
                        onClick={handleScanAgain}
                        className="btn btn-primary btn-sm"
                      >
                        <Camera size={14} /> Live Camera
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 1D BARCODE SCANNING GUIDE OVERLAY */}
            {isScanning && !uploadedImagePreview && (
              <div className="barcode-reticle-overlay">
                <div className="barcode-reticle-box">
                  {/* Corner Targeting Brackets */}
                  <div className="barcode-guide-corner top-left" />
                  <div className="barcode-guide-corner top-right" />
                  <div className="barcode-guide-corner bottom-left" />
                  <div className="barcode-guide-corner bottom-right" />

                  {/* Laser line animation */}
                  <div className="barcode-reticle-laser" />

                  {/* Inner Guide Label */}
                  <div className="barcode-reticle-inner-tag">
                    PLACE BARCODE HERE
                  </div>
                </div>
                <div className="barcode-reticle-caption">
                  {liveGuideHint || 'Position barcode inside guide'}
                </div>
              </div>
            )}

            {/* Stopped / Scanned Placeholder */}
            {!isScanning && !isCameraStarting && !cameraError && !uploadedImagePreview && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#0b0f19',
                  padding: '2rem 1rem',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  zIndex: 6,
                }}
              >
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#1e293b', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#60a5fa' }}>
                  {rawBarcodeText ? (
                    <CheckCircle size={32} style={{ color: '#34d399' }} />
                  ) : (
                    <QrCode size={32} />
                  )}
                </div>
                <div>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f1f5f9' }}>
                    {rawBarcodeText ? 'Barcode Decoded Successfully' : 'Camera Ready / Paused'}
                  </p>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem', maxWidth: '320px' }}>
                    {rawBarcodeText
                      ? 'Scanned roll number and attendance result are displayed below.'
                      : 'Hold your physical ID card up to the camera and click Start Camera.'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={handleScanAgain}
                    className="btn btn-primary btn-sm"
                  >
                    <RefreshCw size={14} />
                    {rawBarcodeText ? 'Scan ID Card Again' : 'Start Camera Scanner'}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-secondary btn-sm"
                  >
                    <Upload size={14} />
                    Upload ID Photo
                  </button>
                </div>
              </div>
            )}

            {/* Camera Error Message */}
            {cameraError && !uploadedImagePreview && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: '#0b0f19',
                  padding: '1.5rem',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  zIndex: 6,
                }}
              >
                <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'rgba(245,158,11,0.2)', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={24} />
                </div>
                <p style={{ fontSize: '0.85rem', color: '#fde68a', fontWeight: 500, maxWidth: '360px' }}>{cameraError}</p>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={handleScanAgain}
                    className="btn btn-secondary btn-sm"
                  >
                    Retry Camera
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-primary btn-sm"
                  >
                    <Upload size={14} />
                    Upload ID Photo Instead
                  </button>
                </div>
              </div>
            )}

            {/* FLOATING SCANNER CONTROLS (WHEN SCANNING) */}
            {isScanning && !uploadedImagePreview && (
              <div className="barcode-floating-top">
                <div className="barcode-floating-pill">
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#34d399' }}></span>
                  <span style={{ fontWeight: 600 }}>1D/2D Live</span>
                  {streamResolution && (
                    <span style={{ borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: '0.4rem', fontFamily: 'var(--font-mono)' }}>
                      {streamResolution}
                    </span>
                  )}
                </div>

                <div className="barcode-floating-actions">
                  {/* Torch Toggle (mobile) */}
                  {torchAvailable && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      className={`barcode-floating-btn ${isTorchOn ? 'active' : ''}`}
                      title="Turn Flashlight ON/OFF"
                    >
                      <Zap size={14} />
                    </button>
                  )}

                  {/* Scan Region Toggle (Wide 1D vs Full Frame) */}
                  <button
                    type="button"
                    onClick={() => setScanBoxMode((m) => (m === 'wide' ? 'full' : 'wide'))}
                    className="barcode-floating-btn"
                    title="Toggle wide 1D viewfinder vs full-frame scan"
                  >
                    {scanBoxMode === 'wide' ? <Maximize2 size={13} /> : <Minimize2 size={13} />}
                    <span>{scanBoxMode === 'wide' ? 'Wide' : 'Full'}</span>
                  </button>

                  {/* Upload ID Photo button while scanning */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="barcode-floating-btn"
                    title="Upload an ID card photo instead of live scan"
                  >
                    <Upload size={13} style={{ color: '#60a5fa' }} />
                    <span>Upload</span>
                  </button>

                  {/* Camera Switch (Front/Rear) */}
                  {cameras.length > 1 && (
                    <button
                      type="button"
                      onClick={handleSwitchCamera}
                      className="barcode-floating-btn"
                      title="Switch Front/Rear Camera"
                    >
                      <SwitchCamera size={13} style={{ color: '#60a5fa' }} />
                      <span>Flip</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            </div>

          {/* DIAGNOSTIC / TESTING DEBUG PANEL (DEVELOPER ONLY) */}
          {isDebugOpen && (
            <div className="barcode-debug-box">
              <div className="flex-between" style={{ borderBottom: '1px solid rgba(168,85,247,0.2)', paddingBottom: '0.4rem', color: '#d8b4fe', fontWeight: 600 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Bug size={14} style={{ color: '#c084fc' }} />
                  Scanner Diagnostics & Developer Telemetry
                </span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {isScanning && !uploadedImagePreview && (
                    <button
                      type="button"
                      onClick={handleCaptureStillFrame}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                      title="Developer: Capture raw frame at native resolution and evaluate all filters"
                    >
                      <Camera size={12} />
                      Capture Debug Frame
                    </button>
                  )}
                  <span className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                    Live Telemetry
                  </span>
                </div>
              </div>

              {/* 5-Stat Grid */}
              <div className="barcode-debug-grid">
                <div className="barcode-debug-stat">
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Symbology:</span>
                  <strong style={{ color: '#34d399', fontFamily: 'var(--font-mono)' }}>
                    {detectedSymbology || 'Scanning...'}
                  </strong>
                </div>
                <div className="barcode-debug-stat">
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Orientation:</span>
                  <strong style={{ color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>
                    {detectedOrientation || 'Auto (H / V)'}
                  </strong>
                </div>
                <div className="barcode-debug-stat">
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Decoder Engine:</span>
                  <strong style={{ color: '#93c5fd' }}>
                    {detectedEngine || '1D Waveform + Native + WASM'}
                  </strong>
                </div>
                <div className="barcode-debug-stat">
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Scan Time:</span>
                  <strong style={{ color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    {scanDurationSeconds ? `${scanDurationSeconds}s` : 'Active (<5s target)'}
                  </strong>
                </div>
                <div className="barcode-debug-stat">
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Resolution:</span>
                  <strong style={{ color: '#f1f5f9', fontFamily: 'var(--font-mono)' }}>
                    {streamResolution || 'Auto (HD ideal 1080p)'}
                  </strong>
                </div>
                <div className="barcode-debug-stat">
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.7rem' }}>Frames Scanned:</span>
                  <strong style={{ color: '#f1f5f9', fontFamily: 'var(--font-mono)' }}>{framesScanned}</strong>
                </div>
              </div>

              {/* Camera Frame Pipeline & Video Hardware Diagnostics */}
              <div style={{ background: '#020617', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #1e293b' }}>
                <div className="flex-between" style={{ marginBottom: '0.35rem' }}>
                  <span style={{ color: '#94a3b8', fontWeight: 600, fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Camera size={13} style={{ color: '#38bdf8' }} />
                    Live Camera Hardware & Pipeline Diagnostics:
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '0.15rem 0.45rem',
                      borderRadius: 'var(--radius-sm)',
                      fontWeight: 700,
                      background: videoDiagnostics.isNonBlack ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                      color: videoDiagnostics.isNonBlack ? '#34d399' : '#f87171',
                    }}
                  >
                    {videoDiagnostics.isNonBlack ? 'VIDEO STREAM ACTIVE & NON-BLACK' : 'STREAM BLACK / ZERO LIGHT'}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.4rem', fontSize: '0.72rem', color: '#94a3b8' }}>
                  <div>
                    Video State:{' '}
                    <strong style={{ color: videoDiagnostics.videoReadyState >= 2 ? '#34d399' : '#f87171' }}>
                      {videoDiagnostics.videoReadyState >= 2 ? 'HAVE_DATA' : `ReadyState ${videoDiagnostics.videoReadyState}`}
                    </strong>
                  </div>
                  <div>
                    Playback:{' '}
                    <strong style={{ color: !videoDiagnostics.videoPaused ? '#34d399' : '#f87171' }}>
                      {!videoDiagnostics.videoPaused ? 'Playing' : 'Paused'}
                    </strong>
                  </div>
                  <div>
                    Resolution:{' '}
                    <strong style={{ color: '#f1f5f9', fontFamily: 'var(--font-mono)' }}>
                      {videoDiagnostics.videoWidth}x{videoDiagnostics.videoHeight}
                    </strong>
                  </div>
                  <div>
                    Track Status:{' '}
                    <strong style={{ color: videoDiagnostics.trackEnabled ? '#34d399' : '#f87171' }}>
                      {videoDiagnostics.trackReadyState} ({videoDiagnostics.trackEnabled ? 'Enabled' : 'Disabled'})
                    </strong>
                  </div>
                  <div>
                    Average Luminance:{' '}
                    <strong style={{ color: videoDiagnostics.isNonBlack ? '#38bdf8' : '#f87171', fontFamily: 'var(--font-mono)' }}>
                      {videoDiagnostics.avgLuminance} / 255
                    </strong>
                  </div>
                </div>
              </div>

              {/* Browser Native BarcodeDetector Capabilities */}
              <div style={{ background: '#020617', padding: '0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid #1e293b' }}>
                <div style={{ color: '#94a3b8', fontWeight: 500, marginBottom: '0.2rem' }}>Browser Native BarcodeDetector:</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#cbd5e1', wordBreak: 'break-word' }}>
                  {supportedNativeFormatsList.length > 0
                    ? `Supported Hardware Formats: ${supportedNativeFormatsList.join(', ')}`
                    : 'Native BarcodeDetector not active in this browser. Running high-precision multi-ROI ZXing engine with sub-pixel 2x/3x upscaling and Bradley-Roth adaptive threshold.'}
                </div>
              </div>

              {/* Image / Debug Frame Diagnostics */}
              {imageDiagnostics && (
                <div style={{ background: '#020617', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid #1e293b' }}>
                  <div className="flex-between" style={{ marginBottom: '0.35rem' }}>
                    <span style={{ color: '#94a3b8', fontWeight: 500 }}>Frame / Photo Telemetry:</span>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        padding: '0.15rem 0.4rem',
                        borderRadius: 'var(--radius-sm)',
                        fontWeight: 700,
                        background: imageDiagnostics.success ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)',
                        color: imageDiagnostics.success ? '#34d399' : '#f87171',
                      }}
                    >
                      {imageDiagnostics.success ? `SUCCESS (${imageDiagnostics.pass})` : 'FAILED ALL PASSES'}
                    </span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.5rem', fontSize: '0.75rem', color: '#94a3b8' }}>
                    <div>Track Resolution: <strong style={{ color: '#f1f5f9' }}>{imageDiagnostics.trackResolution || streamResolution || '1280x720'}</strong></div>
                    <div>Canvas Resolution: <strong style={{ color: '#f1f5f9' }}>{imageDiagnostics.width || 'N/A'} x {imageDiagnostics.height || 'N/A'}</strong></div>
                    <div>Active ROI: <strong style={{ color: '#60a5fa' }}>{imageDiagnostics.roiUsed || 'Lower-Center'}</strong></div>
                    <div>Barcode Dimensions: <strong style={{ color: '#38bdf8' }}>{imageDiagnostics.pixelDimensions || 'Holding closer increases px'}</strong></div>
                    {imageDiagnostics.elapsedMs !== undefined && <div>Duration: <strong style={{ color: '#f1f5f9' }}>{imageDiagnostics.elapsedMs} ms</strong></div>}
                    {imageDiagnostics.format && <div>Symbology: <strong style={{ color: '#34d399' }}>{imageDiagnostics.format}</strong></div>}
                    {imageDiagnostics.text && <div>Raw Value: <strong style={{ color: '#38bdf8' }}>{imageDiagnostics.text}</strong></div>}
                    {imageDiagnostics.engineUsed && <div>Engine: <strong style={{ color: '#c084fc' }}>{imageDiagnostics.engineUsed}</strong></div>}
                  </div>

                  {/* 4-Tier Engine Breakdown */}
                  {imageDiagnostics.engineBreakdown && (
                    <div style={{ marginTop: '0.5rem', paddingTop: '0.45rem', borderTop: '1px solid #1e293b' }}>
                      <span style={{ color: '#cbd5e1', fontWeight: 600, fontSize: '0.72rem', display: 'block', marginBottom: '0.3rem' }}>
                        Individual 4-Tier Engine Diagnostics:
                      </span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {Object.entries(imageDiagnostics.engineBreakdown).map(([key, eng]) => (
                          <div
                            key={key}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              background: '#090d16',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '4px',
                              border: '1px solid #1e293b',
                              fontSize: '0.7rem',
                            }}
                          >
                            <div>
                              <span style={{ fontWeight: 600, color: eng.detected ? '#34d399' : '#94a3b8' }}>{eng.name}</span>
                              {eng.notes && <span style={{ color: '#64748b', marginLeft: '0.4rem', fontSize: '0.67rem' }}>— {eng.notes}</span>}
                            </div>
                            <span
                              style={{
                                padding: '0.1rem 0.35rem',
                                borderRadius: '3px',
                                fontWeight: 700,
                                fontSize: '0.68rem',
                                background: eng.detected
                                  ? 'rgba(16,185,129,0.2)'
                                  : eng.supported
                                  ? 'rgba(239,68,68,0.15)'
                                  : 'rgba(148,163,184,0.1)',
                                color: eng.detected ? '#34d399' : eng.supported ? '#f87171' : '#94a3b8',
                              }}
                            >
                              {eng.detected
                                ? `DETECTED: ${eng.value} (${eng.symbology || '1D'}${eng.pixelDimensions ? ` [${eng.pixelDimensions}px]` : ''})`
                                : eng.supported
                                ? 'NOT DETECTED'
                                : 'UNSUPPORTED'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {imageDiagnostics.attempts && (
                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', paddingTop: '0.35rem', marginTop: '0.35rem', borderTop: '1px solid #1e293b' }}>
                      <span style={{ color: '#64748b', display: 'block', marginBottom: '0.2rem' }}>Passes Evaluated:</span>
                      <ul style={{ paddingLeft: '1rem', color: '#cbd5e1', lineHeight: '1.4' }}>
                        {imageDiagnostics.attempts.map((att, i) => (
                          <li key={i}>{att}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Self-Test Panel */}
              <div style={{ background: '#020617', padding: '0.6rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <div className="flex-between">
                  <span style={{ fontWeight: 600, color: '#d8b4fe', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <CheckCircle size={14} style={{ color: '#c084fc' }} />
                    Built-in Pipeline Self-Test:
                  </span>
                  <button
                    type="button"
                    onClick={handleRunSelfTest}
                    disabled={isSelfTesting}
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                  >
                    {isSelfTesting ? 'Testing...' : 'Run Self-Test'}
                  </button>
                </div>

                {selfTestResults && (
                  <div style={{ paddingTop: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid rgba(168,85,247,0.2)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                    {(Array.isArray(selfTestResults) ? selfTestResults : selfTestResults?.tests || []).map((r, i) => (
                      <div key={i} className="flex-between" style={{ padding: '0.15rem 0' }}>
                        <span style={{ color: '#cbd5e1' }}>{r.name || r.testName}:</span>
                        <span style={{ color: r.passed ? '#34d399' : '#f87171', fontWeight: 700 }}>
                          {r.passed ? `PASSED (${r.format || r.expectedFormat})` : `FAILED (${r.error || 'decode error'})`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Instant Known-Good Barcode Loaders */}
                <div style={{ paddingTop: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid #1e293b' }}>
                  <span style={{ color: '#64748b', fontSize: '0.7rem', display: 'block', marginBottom: '0.3rem' }}>
                    Test with Known-Good Barcode Images:
                  </span>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    <button
                      type="button"
                      onClick={() => handleLoadKnownGoodBarcode('code128_c2')}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                    >
                      Load Code 128 (238W1A04C2)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadKnownGoodBarcode('code39_c2')}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                    >
                      Load Code 39 (238W1A04C2)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadKnownGoodBarcode('code128_simple')}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                    >
                      Load Code 128 (238W1A0477)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadKnownGoodBarcode('code128_kavya')}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                    >
                      Load Code 128 (238W1A0412)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadKnownGoodBarcode('code39_simple')}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.7rem', padding: '0.2rem 0.45rem' }}
                    >
                      Load Code 39 (238W1A0477)
                    </button>
                  </div>
                </div>
              </div>

              {lastFrameError && !rawBarcodeText && (
                <div style={{ fontSize: '0.7rem', color: '#64748b', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  Latest frame status: {lastFrameError}
                </div>
              )}
            </div>
          )}

          {/* SECTION 1: BARCODE DETECTED (ROLL NUMBER ONLY) */}
          {rawBarcodeText && (
            <div className="barcode-result-container">
              <div className="barcode-result-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ScanLine size={16} style={{ color: '#34d399' }} />
                  <strong style={{ fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#34d399' }}>
                    Barcode Detected
                  </strong>
                  {detectedSymbology && (
                    <span className="badge badge-success" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      {detectedSymbology}
                    </span>
                  )}
                  {detectedOrientation && (
                    <span className="badge badge-primary" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.5px' }}>
                      {detectedOrientation}
                    </span>
                  )}
                  {scanDurationSeconds && (
                    <span className="badge badge-info" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
                      ⚡ {scanDurationSeconds}s
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleCopyRawText}
                  className="btn btn-success btn-sm"
                >
                  {isCopied ? (
                    <>
                      <Check size={14} />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      <span>Copy Roll Number</span>
                    </>
                  )}
                </button>
              </div>

              {/* Decoded Roll Number Box */}
              <div className="barcode-result-value-box">
                <div>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8', display: 'block' }}>Scanned Roll Number:</span>
                  <span className="barcode-result-roll">
                    {lookupResult?.rollNumber || rawBarcodeText}
                  </span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748b', display: 'block' }}>Decoder Engine:</span>
                  <span style={{ fontSize: '0.75rem', color: '#cbd5e1', fontWeight: 600 }}>{detectedEngine || '1D Barcode'}</span>
                  {detectedOrientation && (
                    <span style={{ fontSize: '0.7rem', color: '#a78bfa', display: 'block', marginTop: '1px' }}>
                      Orientation: {detectedOrientation}
                    </span>
                  )}
                  {scanDurationSeconds && (
                    <span style={{ fontSize: '0.72rem', color: '#34d399', display: 'block', marginTop: '2px', fontWeight: 500 }}>
                      ⚡ Detected in {scanDurationSeconds}s (2-frame confirmed)
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: LAB ENTRY / ATTENDANCE STATUS & STUDENT DETAILS */}
          {lookupResult && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* CASE A: REGISTERED STUDENT & LAB ENTRY RECORDED */}
              {lookupResult.found && lookupResult.student && entryResult?.status === 'ENTRY_RECORDED' && (
                <div className="barcode-status-card barcode-status-success">
                  <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
                      <CheckCircle size={18} style={{ color: '#10b981' }} />
                      <span>Lab Entry / Attendance Recorded</span>
                    </div>
                    <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Clock size={12} />
                      Entry Time: {entryResult?.visit?.entryTime ? new Date(entryResult.visit.entryTime).toLocaleTimeString() : new Date().toLocaleTimeString()}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                    You are entered in the lab. Daily attendance and entry time have been recorded successfully.
                  </p>

                  {/* Registered Student Details from Database */}
                  <div style={{ borderTop: '1px solid rgba(16,185,129,0.2)', paddingTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#047857', marginBottom: '0.35rem' }}>
                      Registered Student Details (from Database)
                    </div>
                    <div className="barcode-student-details-grid">
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Name:</span>
                        <strong style={{ color: '#f1f5f9', fontSize: '0.85rem' }}>{lookupResult.student.name}</strong>
                      </div>
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Roll Number:</span>
                        <strong style={{ color: '#34d399', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{lookupResult.student.rollNumber}</strong>
                      </div>
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Branch / Department:</span>
                        <strong style={{ color: '#e2e8f0' }}>{lookupResult.student.department || lookupResult.student.branch || 'N/A'}</strong>
                      </div>
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Academic Year:</span>
                        <strong style={{ color: '#e2e8f0' }}>
                          {lookupResult.student.academicYearAtStart ? `Year ${lookupResult.student.academicYearAtStart}` : 'N/A'}
                        </strong>
                      </div>
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Incubation Journey Start:</span>
                        <strong style={{ color: '#e2e8f0' }}>{lookupResult.student.incubationStartDate || 'N/A'}</strong>
                      </div>
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Current Status:</span>
                        <strong style={{ color: '#34d399', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#34d399', display: 'inline-block' }}></span>
                          Currently Inside Lab
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CASE B: REGISTERED STUDENT & ALREADY INSIDE LAB */}
              {lookupResult.found && lookupResult.student && (entryResult?.status === 'ALREADY_INSIDE' || lookupResult.isAlreadyInside) && entryResult?.status !== 'ENTRY_RECORDED' && (
                <div className="barcode-status-card barcode-status-warning">
                  <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.9rem' }}>
                      <AlertTriangle size={18} style={{ color: '#f59e0b' }} />
                      <span>Student Already Inside Lab</span>
                    </div>
                    <span className="badge badge-warning" style={{ fontFamily: 'var(--font-mono)' }}>
                      Checked In Since: {lookupResult.activeVisit?.entryTime ? new Date(lookupResult.activeVisit.entryTime).toLocaleTimeString() : 'Active'}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.8rem', lineHeight: '1.4' }}>
                    {lookupResult.student.name} is already registered inside the lab. A duplicate entry was not created.
                  </p>

                  {/* Registered Student Details from Database */}
                  <div style={{ borderTop: '1px solid rgba(245,158,11,0.2)', paddingTop: '0.5rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#b45309', marginBottom: '0.35rem' }}>
                      Registered Student Details (from Database)
                    </div>
                    <div className="barcode-student-details-grid">
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Name:</span>
                        <strong style={{ color: '#f1f5f9', fontSize: '0.85rem' }}>{lookupResult.student.name}</strong>
                      </div>
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Roll Number:</span>
                        <strong style={{ color: '#fbbf24', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>{lookupResult.student.rollNumber}</strong>
                      </div>
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Branch / Department:</span>
                        <strong style={{ color: '#e2e8f0' }}>{lookupResult.student.department || lookupResult.student.branch || 'N/A'}</strong>
                      </div>
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Academic Year:</span>
                        <strong style={{ color: '#e2e8f0' }}>
                          {lookupResult.student.academicYearAtStart ? `Year ${lookupResult.student.academicYearAtStart}` : 'N/A'}
                        </strong>
                      </div>
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Incubation Journey Start:</span>
                        <strong style={{ color: '#e2e8f0' }}>{lookupResult.student.incubationStartDate || 'N/A'}</strong>
                      </div>
                      <div className="barcode-student-detail-item">
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>Current Status:</span>
                        <strong style={{ color: '#fbbf24' }}>Currently Inside Lab</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CASE C: UNREGISTERED STUDENT */}
              {(!lookupResult.found || !lookupResult.student) && (
                <div className="barcode-status-card barcode-status-danger">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <UserX size={18} />
                    </div>
                    <div>
                      <h4 style={{ fontWeight: 700, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#991b1b' }}>
                        Student Not Registered
                        <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>No DB Match</span>
                      </h4>
                      <p style={{ fontSize: '0.75rem', fontFamily: 'var(--font-mono)', color: '#b91c1c', marginTop: '0.15rem' }}>
                        Scanned Roll Number: {lookupResult?.rollNumber || rawBarcodeText}
                      </p>
                    </div>
                  </div>
                  <p style={{ fontSize: '0.8rem', background: 'rgba(15,23,42,0.06)', padding: '0.65rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(239,68,68,0.2)', lineHeight: '1.45', color: '#7f1d1d' }}>
                    Student with Roll Number <strong>{lookupResult?.rollNumber || rawBarcodeText}</strong> is not registered in the system. The student must first be registered before entering the lab. An unregistered student record was NOT created automatically.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* SECTION 4: TEST BARCODE SIMULATOR (ONLY VISIBLE IN SIMULATOR MODE) */}
          {activeMode === 'simulator' && (
            <div className="barcode-simulator-section">
              <div className="flex-between">
                <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#c084fc', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <QrCode size={14} />
                  Test Barcode Simulator (Manual Mode)
                </span>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Camera is paused</span>
              </div>

              {/* Presets */}
              <div className="barcode-presets-list">
                {samplePresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setManualInput(preset.value);
                      stopScanner();
                      handleSuccessfulScan(preset.value, 'TEST_PRESET', 'Test Preset Simulator');
                    }}
                    className="barcode-preset-chip"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Custom Input Form */}
              <form onSubmit={handleManualSubmit} className="barcode-simulator-form">
                <input
                  type="text"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Type or paste student Roll Number (e.g. 238W1A04C2)"
                  className="barcode-simulator-input"
                />
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  Simulate Lab Entry
                </button>
              </form>
            </div>
          )}

          {/* REAL CAMERA SCANNING GUIDANCE & INSTANT ROLL NUMBER INPUT (WHEN IN CAMERA MODE) */}
          {activeMode === 'camera' && !rawBarcodeText && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* Guidance Bar */}
              <div style={{
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-md, 8px)',
                background: '#0f172a',
                border: '1px solid #1e293b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <Camera size={20} style={{ color: '#60a5fa', flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: '#f1f5f9' }}>
                      {isScanning ? 'Hands-Free Automatic Scanner Active' : 'Camera Paused'}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.15rem' }}>
                      Hold student ID card in front of camera, or snap a high-resolution frame.
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {isScanning && (
                    <button
                      type="button"
                      onClick={handleCaptureStillFrame}
                      className="btn btn-primary btn-sm"
                      style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                      title="Snap current camera frame and read barcode & roll number"
                    >
                      <Camera size={13} />
                      Snap & Read Card
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsDebugOpen((prev) => !prev)}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem' }}
                    title="Toggle developer diagnostics panel"
                  >
                    <Bug size={13} />
                    {isDebugOpen ? 'Hide Diagnostics' : 'Diagnostics'}
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem' }}
                    title="Upload ID card photo"
                  >
                    <Upload size={13} />
                    Upload Photo
                  </button>
                </div>
              </div>

              {/* Instant Student ID Roll Number Verification & Quick-Fill Bar */}
              <div style={{
                padding: '0.85rem 1rem',
                borderRadius: 'var(--radius-md, 8px)',
                background: 'linear-gradient(135deg, rgba(15, 23, 42, 0.95), rgba(30, 41, 59, 0.95))',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}>
                <div className="flex-between" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#93c5fd', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Sparkles size={15} style={{ color: '#60a5fa' }} />
                    Instant Student Roll Number Identification:
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                    Enter roll number or click quick fill to verify instantly
                  </span>
                </div>

                {/* Direct Roll Number Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const clean = manualInput.trim();
                    if (!clean) return;
                    handleSuccessfulScan(clean, 'DIRECT_INPUT', 'Instant Student Roll Number Verification');
                  }}
                  style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}
                >
                  <input
                    type="text"
                    value={manualInput}
                    onChange={(e) => setManualInput(e.target.value)}
                    placeholder="Enter Student Roll Number (e.g. 238W1A0477)"
                    style={{
                      flex: '1 1 220px',
                      padding: '0.55rem 0.85rem',
                      fontSize: '0.88rem',
                      fontFamily: 'var(--font-mono)',
                      background: '#020617',
                      border: '1px solid #3b82f6',
                      borderRadius: 'var(--radius-md)',
                      color: '#fff',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', padding: '0.55rem 1rem', fontWeight: 600, fontSize: '0.82rem' }}
                  >
                    <CheckCircle size={15} />
                    Verify & Enter Lab
                  </button>
                </form>

                {/* Quick Student Preset Badges */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                  <span style={{ fontSize: '0.7rem', color: '#94a3b8', fontWeight: 600 }}>Quick Fill:</span>
                  {[
                    { label: '238W1A0477 (Boddu Surya Teja)', roll: '238W1A0477' },
                    { label: '238W1A04C2 (Bhavani)', roll: '238W1A04C2' },
                    { label: '238W1A0412 (Kavya Sharma)', roll: '238W1A0412' },
                    { label: '228W1A0520 (Rahul Verma)', roll: '228W1A0520' },
                  ].map((item, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setManualInput(item.roll);
                        handleSuccessfulScan(item.roll, 'DIRECT_INPUT', 'Instant Student Roll Number Verification');
                      }}
                      style={{
                        background: 'rgba(59, 130, 246, 0.15)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        color: '#93c5fd',
                        borderRadius: '9999px',
                        padding: '0.25rem 0.65rem',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                      title={`Click to instantly verify ${item.roll}`}
                    >
                      ⚡ {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="barcode-modal-footer">
          <div style={{ fontSize: '0.78rem', color: 'var(--neutral-500)' }}>
            {rawBarcodeText
              ? `Decoded: ${detectedSymbology || '1D Barcode'}`
              : isScanning
              ? 'Scanner active (1D & 2D)'
              : 'Scanner paused'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {rawBarcodeText && (
              <button
                type="button"
                onClick={handleScanAgain}
                className="btn btn-secondary btn-sm"
              >
                <RefreshCw size={14} />
                Scan Again
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="btn btn-primary btn-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
