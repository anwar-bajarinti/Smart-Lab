// src/utils/robustBarcodeDecoder.js
// High-Performance Multi-Engine Barcode & QR Code Decoder
//
// Specialized for Real Physical College ID Cards:
// 1. Direct ZXing MultiFormatEngine with TRY_HARDER: true & 1D Symbology Priority
// 2. Dual Binarizers: GlobalHistogramBinarizer (1D optimal) + HybridBinarizer (2D optimal)
// 3. Safe Native BarcodeDetector wrapper (validates getSupportedFormats to avoid constructor crash)
// 4. Multi-Region-of-Interest (ROI) Extraction:
//    - Lower-Center ID Card Band (where physical 1D barcodes are printed)
//    - Center Horizontal Band
//    - Bottom Strip
//    - Full Resolution Frame
// 5. High-Frequency Sub-Pixel Upscaling (2x, 3x, 4x) to resolve narrow webcam 1px bars
// 6. Bradley-Roth Integral-Image Local Adaptive Thresholding (immune to glossy card glare & shadows)
// 7. Micro-Angle Rotations (-4°, -2°, 0°, +2°, +4°, +6°, -6°) to counteract hand tilt
// 8. Percentile Contrast Stretch & Laplacian High-Pass Edge Sharpening
// 9. Built-in Deterministic Self-Test Suite & Known-Good Barcode Generators

import * as ZXing from 'html5-qrcode/third_party/zxing-js.umd.js';
import { readBarcodes } from 'zxing-wasm/reader';
import Quagga from '@ericblade/quagga2';
import {
  decodeWaveform1D,
  assessBarcodeQuality,
  extract1DWaveform,
  extract1DVerticalWaveform,
  assessDualOrientationQuality,
} from './waveform1dDecoder.js';

export {
  decodeWaveform1D,
  assessBarcodeQuality,
  extract1DWaveform,
  extract1DVerticalWaveform,
  assessDualOrientationQuality,
};

// Priority 1D barcode formats used on physical student ID cards
export const PRIORITY_1D_FORMATS = [
  ZXing.BarcodeFormat.CODE_128,
  ZXing.BarcodeFormat.CODE_39,
  ZXing.BarcodeFormat.CODE_93,
  ZXing.BarcodeFormat.EAN_13,
  ZXing.BarcodeFormat.EAN_8,
  ZXing.BarcodeFormat.UPC_A,
  ZXing.BarcodeFormat.UPC_E,
  ZXing.BarcodeFormat.ITF,
  ZXing.BarcodeFormat.CODABAR,
];

// All supported formats mapped to ZXing BarcodeFormat enum
export const ALL_BARCODE_FORMATS = [
  ...PRIORITY_1D_FORMATS,
  ZXing.BarcodeFormat.QR_CODE,
  ZXing.BarcodeFormat.DATA_MATRIX,
  ZXing.BarcodeFormat.PDF_417,
  ZXing.BarcodeFormat.AZTEC,
];

export const SUPPORTED_BARCODE_FORMATS = ALL_BARCODE_FORMATS;

// Human-readable format names
export const FORMAT_NAME_MAP = {
  [ZXing.BarcodeFormat.CODE_128]: 'CODE_128',
  [ZXing.BarcodeFormat.CODE_39]: 'CODE_39',
  [ZXing.BarcodeFormat.CODE_93]: 'CODE_93',
  [ZXing.BarcodeFormat.EAN_13]: 'EAN_13',
  [ZXing.BarcodeFormat.EAN_8]: 'EAN_8',
  [ZXing.BarcodeFormat.UPC_A]: 'UPC_A',
  [ZXing.BarcodeFormat.UPC_E]: 'UPC_E',
  [ZXing.BarcodeFormat.ITF]: 'ITF',
  [ZXing.BarcodeFormat.CODABAR]: 'CODABAR',
  [ZXing.BarcodeFormat.QR_CODE]: 'QR_CODE',
  [ZXing.BarcodeFormat.DATA_MATRIX]: 'DATA_MATRIX',
  [ZXing.BarcodeFormat.PDF_417]: 'PDF_417',
  [ZXing.BarcodeFormat.AZTEC]: 'AZTEC',
};

// Safe Native BarcodeDetector format query
let cachedNativeFormats = null;
export async function getSupportedNativeBarcodeFormats() {
  if (cachedNativeFormats !== null) return cachedNativeFormats;
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    cachedNativeFormats = [];
    return cachedNativeFormats;
  }
  try {
    if (typeof window.BarcodeDetector.getSupportedFormats === 'function') {
      const formats = await window.BarcodeDetector.getSupportedFormats();
      cachedNativeFormats = Array.isArray(formats) ? formats : [];
      return cachedNativeFormats;
    }
    cachedNativeFormats = ['qr_code'];
    return cachedNativeFormats;
  } catch (e) {
    console.warn('Error querying native BarcodeDetector formats:', e);
    cachedNativeFormats = [];
    return cachedNativeFormats;
  }
}

export function normalizeSymbologyName(sym) {
  if (!sym) return '1D_BARCODE';
  const upper = String(sym).toUpperCase().replace(/[\s-]/g, '_');
  if (upper === 'CODE128') return 'CODE_128';
  if (upper === 'CODE39') return 'CODE_39';
  if (upper === 'CODE93') return 'CODE_93';
  if (upper === 'EAN13') return 'EAN_13';
  if (upper === 'EAN8') return 'EAN_8';
  if (upper === 'UPCA') return 'UPC_A';
  if (upper === 'UPCE') return 'UPC_E';
  if (upper === 'QRCODE') return 'QR_CODE';
  if (upper === 'DATAMATRIX') return 'DATA_MATRIX';
  return upper;
}

// Safely construct a native BarcodeDetector with valid format intersection
export async function createSafeNativeDetector() {
  const supported = await getSupportedNativeBarcodeFormats();
  if (!supported || supported.length === 0) return null;

  const desired = [
    'code_128',
    'code_39',
    'code_93',
    'ean_13',
    'ean_8',
    'upc_a',
    'upc_e',
    'itf',
    'codabar',
    'data_matrix',
    'pdf417',
    'qr_code',
    'aztec',
  ];
  const validFormats = desired.filter((f) => supported.includes(f));
  if (validFormats.length === 0) return null;

  try {
    return new window.BarcodeDetector({ formats: validFormats });
  } catch (err) {
    console.warn('Failed to construct native BarcodeDetector:', err);
    return null;
  }
}

/**
 * Tier 1: Browser Native BarcodeDetector API
 */
export async function detectWithNativeBarcodeDetector(source) {
  if (typeof window === 'undefined' || !('BarcodeDetector' in window)) {
    return null;
  }
  try {
    const supported = await getSupportedNativeBarcodeFormats();
    const desired = [
      'code_128',
      'code_39',
      'code_93',
      'ean_13',
      'ean_8',
      'upc_a',
      'upc_e',
      'itf',
      'codabar',
      'data_matrix',
      'qr_code',
      'pdf417',
      'aztec',
    ];
    const formats = desired.filter((f) => supported.includes(f));
    if (formats.length === 0) return null;

    const detector = new window.BarcodeDetector({ formats });
    const barcodes = await detector.detect(source);
    if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
      const b = barcodes[0];
      const sym = normalizeSymbologyName(b.format || '1D_BARCODE');
      let dims = null;
      if (b.boundingBox) {
        dims = `${Math.round(b.boundingBox.width)}x${Math.round(b.boundingBox.height)}`;
      }
      return {
        success: true,
        rawValue: b.rawValue,
        text: b.rawValue,
        symbology: sym,
        format: sym,
        engine: 'Native BarcodeDetector',
        pixelDimensions: dims,
      };
    }
  } catch (err) {
    // continue
  }
  return null;
}

/**
 * Tier 2: ZXing-C++ WASM Engine (zxing-wasm)
 */
export async function decodeWithZXingWasm(targetCanvas) {
  if (!targetCanvas || targetCanvas.width < 10 || targetCanvas.height < 10) return null;
  try {
    const ctx = targetCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    const imgData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height);

    const formats = [
      'Code128',
      'Code39',
      'Code93',
      'EAN13',
      'EAN8',
      'UPCA',
      'UPCE',
      'ITF',
      'Codabar',
      'QRCode',
      'DataMatrix',
    ];

    // Attempt 1: LocalAverage adaptive binarizer
    let results = await readBarcodes(imgData, {
      formats,
      tryHarder: true,
      tryRotate: true,
      tryInvert: true,
      binarizer: 'LocalAverage',
    });

    // Attempt 2: GlobalHistogram binarizer if LocalAverage returned empty
    if (!results || results.length === 0) {
      results = await readBarcodes(imgData, {
        formats,
        tryHarder: true,
        tryRotate: true,
        tryInvert: true,
        binarizer: 'GlobalHistogram',
      });
    }

    if (results && results.length > 0 && results[0].text) {
      const b = results[0];
      const sym = normalizeSymbologyName(b.format || '1D_BARCODE');
      let dims = null;
      if (b.position) {
        const dx = (b.position.topRight?.x || 0) - (b.position.topLeft?.x || 0);
        const dy = (b.position.topRight?.y || 0) - (b.position.topLeft?.y || 0);
        const w = Math.round(Math.sqrt(dx * dx + dy * dy));
        const hx = (b.position.bottomLeft?.x || 0) - (b.position.topLeft?.x || 0);
        const hy = (b.position.bottomLeft?.y || 0) - (b.position.topLeft?.y || 0);
        const h = Math.round(Math.sqrt(hx * hx + hy * hy));
        if (w > 0 && h > 0) dims = `${w}x${h}`;
      }
      return {
        success: true,
        rawValue: b.text,
        text: b.text,
        symbology: sym,
        format: sym,
        engine: 'ZXing-C++ WASM Engine',
        position: b.position,
        pixelDimensions: dims,
      };
    }
  } catch (err) {
    // continue
  }
  return null;
}

/**
 * Tier 3: Quagga2 Computer Vision Engine (@ericblade/quagga2)
 */
export async function decodeWithQuagga(targetCanvas) {
  if (!targetCanvas || targetCanvas.width < 10 || targetCanvas.height < 10) return null;
  if (typeof targetCanvas.toDataURL !== 'function') return null;
  return new Promise((resolve) => {
    try {
      const dataUrl = targetCanvas.toDataURL('image/png');
      Quagga.decodeSingle(
        {
          src: dataUrl,
          numOfWorkers: 0,
          inputStream: {
            size: Math.max(targetCanvas.width, targetCanvas.height, 800),
          },
          decoder: {
            readers: [
              'code_128_reader',
              'code_39_reader',
              'ean_reader',
              'upc_reader',
              'i2of5_reader',
              'codabar_reader',
            ],
          },
          locate: true,
        },
        (result) => {
          if (result && result.codeResult && result.codeResult.code) {
            const sym = normalizeSymbologyName(result.codeResult.format || '1D_BARCODE');
            let dims = null;
            if (result.box && Array.isArray(result.box) && result.box.length >= 4) {
              const xs = result.box.map((p) => p[0]);
              const ys = result.box.map((p) => p[1]);
              const w = Math.round(Math.max(...xs) - Math.min(...xs));
              const h = Math.round(Math.max(...ys) - Math.min(...ys));
              if (w > 0 && h > 0) dims = `${w}x${h}`;
            }
            resolve({
              success: true,
              rawValue: result.codeResult.code,
              text: result.codeResult.code,
              symbology: sym,
              format: sym,
              engine: 'Quagga2 CV Engine',
              pixelDimensions: dims,
            });
          } else {
            resolve(null);
          }
        }
      );
    } catch (e) {
      resolve(null);
    }
  });
}

/**
 * Executes the primary engine priority on a candidate canvas:
 * 1. 1D Waveform & Deblurring Engine (subpixel derivative edge reconstruction)
 * 2. Native BarcodeDetector (Browser native API)
 * 3. ZXing-C++ WASM Engine (zxing-wasm)
 * 4. Quagga2 CV Engine (@ericblade/quagga2)
 * 5. Existing ZXing-JS Fallback (@zxing/library)
 */
export async function decodeCandidateWith4Tiers(targetCanvas) {
  if (!targetCanvas || targetCanvas.width < 10 || targetCanvas.height < 10) return null;

  // Tier 1: 1D Waveform & Deblurring Engine (Tests Horizontal, Vertical, +90°, -90°)
  try {
    const waveRes = await decodeWaveform1D(targetCanvas);
    if (waveRes && waveRes.success && waveRes.rawValue) {
      return waveRes;
    }
  } catch (e) {
    // continue
  }

  // Tier 2: Native BarcodeDetector (Normal Orientation)
  try {
    const nativeRes = await detectWithNativeBarcodeDetector(targetCanvas);
    if (nativeRes && nativeRes.success && nativeRes.rawValue) {
      return { ...nativeRes, orientation: 'HORIZONTAL' };
    }
  } catch (e) {
    // continue
  }

  // Tier 3: ZXing-C++ WASM Engine (Normal Orientation)
  try {
    const wasmRes = await decodeWithZXingWasm(targetCanvas);
    if (wasmRes && wasmRes.success && wasmRes.rawValue) {
      return { ...wasmRes, orientation: 'HORIZONTAL' };
    }
  } catch (e) {
    // continue
  }

  // Tier 4: Quagga2 CV Engine (Normal Orientation)
  try {
    const quaggaRes = await decodeWithQuagga(targetCanvas);
    if (quaggaRes && quaggaRes.success && quaggaRes.rawValue) {
      return { ...quaggaRes, orientation: 'HORIZONTAL' };
    }
  } catch (e) {
    // continue
  }

  // Tier 5: Existing ZXing-JS Fallback (Normal Orientation)
  try {
    const zx = decodeCanvasWithZXing(targetCanvas, PRIORITY_1D_FORMATS);
    if (zx && (zx.rawValue || zx.text)) {
      return {
        success: true,
        rawValue: zx.rawValue || zx.text,
        text: zx.rawValue || zx.text,
        symbology: zx.symbology || zx.format || '1D_BARCODE',
        format: zx.symbology || zx.format || '1D_BARCODE',
        engine: zx.engine || 'ZXing-JS Fallback',
        orientation: 'HORIZONTAL',
      };
    }
  } catch (e) {
    // continue
  }

  // Rotated 90° Fallback for Tiers 2-5
  try {
    const rotCanvas = rotateCanvas(targetCanvas, 90);
    if (rotCanvas) {
      // Tier 2: Native BarcodeDetector
      try {
        const nativeRot = await detectWithNativeBarcodeDetector(rotCanvas);
        if (nativeRot && nativeRot.success && nativeRot.rawValue) {
          return { ...nativeRot, orientation: 'VERTICAL' };
        }
      } catch (e) {}

      // Tier 3: ZXing-C++ WASM
      try {
        const wasmRot = await decodeWithZXingWasm(rotCanvas);
        if (wasmRot && wasmRot.success && wasmRot.rawValue) {
          return { ...wasmRot, orientation: 'VERTICAL' };
        }
      } catch (e) {}

      // Tier 4: Quagga2
      try {
        const quaggaRot = await decodeWithQuagga(rotCanvas);
        if (quaggaRot && quaggaRot.success && quaggaRot.rawValue) {
          return { ...quaggaRot, orientation: 'VERTICAL' };
        }
      } catch (e) {}

      // Tier 5: ZXing-JS
      try {
        const zxRot = decodeCanvasWithZXing(rotCanvas, PRIORITY_1D_FORMATS);
        if (zxRot && (zxRot.rawValue || zxRot.text)) {
          return {
            success: true,
            rawValue: zxRot.rawValue || zxRot.text,
            text: zxRot.rawValue || zxRot.text,
            symbology: zxRot.symbology || zxRot.format || '1D_BARCODE',
            format: zxRot.symbology || zxRot.format || '1D_BARCODE',
            engine: zxRot.engine || 'ZXing-JS Fallback',
            orientation: 'VERTICAL',
          };
        }
      } catch (e) {}
    }
  } catch (e) {}

  return null;
}

/**
 * Diagnostic helper to test all engines individually on a canvas
 * (testing full frame and lower ROIs) and produce an itemized report.
 */
export async function testAllEnginesIndividually(targetCanvas) {
  if (!targetCanvas || targetCanvas.width < 10 || targetCanvas.height < 10) return null;

  const report = {
    waveformEngine: {
      name: '1D Waveform & Deblurring Engine',
      supported: true,
      detected: false,
      value: null,
      symbology: null,
      pixelDimensions: null,
      notes: null,
    },
    nativeDetector: {
      name: 'Native BarcodeDetector (Browser Native API)',
      supported: typeof window !== 'undefined' && 'BarcodeDetector' in window,
      detected: false,
      value: null,
      symbology: null,
      pixelDimensions: null,
      notes: null,
    },
    zxingWasm: {
      name: 'ZXing-C++ WASM Engine (zxing-wasm)',
      supported: true,
      detected: false,
      value: null,
      symbology: null,
      pixelDimensions: null,
      notes: null,
    },
    quagga2: {
      name: 'Quagga2 CV Engine (@ericblade/quagga2)',
      supported: true,
      detected: false,
      value: null,
      symbology: null,
      pixelDimensions: null,
      notes: null,
    },
    zxingJs: {
      name: 'ZXing-JS Fallback (@zxing/library)',
      supported: true,
      detected: false,
      value: null,
      symbology: null,
      pixelDimensions: null,
      notes: null,
    },
  };

  const rois = [
    { name: 'Full Frame', canvas: targetCanvas },
    { name: 'Lower-Center Band', canvas: cropCanvasROI(targetCanvas, 0.06, 0.38, 0.88, 0.52) },
    { name: 'Lower-Right ID Zone', canvas: cropCanvasROI(targetCanvas, 0.4, 0.5, 0.55, 0.38) },
  ].filter((r) => r.canvas);

  // Test Tier 1: 1D Waveform & Deblurring Engine
  try {
    for (const roi of rois) {
      const res = await decodeWaveform1D(roi.canvas);
      if (res && res.success && res.rawValue) {
        report.waveformEngine.detected = true;
        report.waveformEngine.value = res.rawValue;
        report.waveformEngine.symbology = res.symbology;
        report.waveformEngine.pixelDimensions = res.pixelDimensions || null;
        report.waveformEngine.notes = `Detected in ${roi.name}`;
        break;
      }
    }
    if (!report.waveformEngine.detected) {
      report.waveformEngine.notes = 'Barcode not found in tested frame/ROIs';
    }
  } catch (e) {
    report.waveformEngine.notes = `Error: ${e.message}`;
  }

  // Test Tier 1: Native BarcodeDetector
  if (report.nativeDetector.supported) {
    try {
      for (const roi of rois) {
        const res = await detectWithNativeBarcodeDetector(roi.canvas);
        if (res && res.success && res.rawValue) {
          report.nativeDetector.detected = true;
          report.nativeDetector.value = res.rawValue;
          report.nativeDetector.symbology = res.symbology;
          report.nativeDetector.pixelDimensions = res.pixelDimensions;
          report.nativeDetector.notes = `Detected in ${roi.name}`;
          break;
        }
      }
      if (!report.nativeDetector.detected) {
        report.nativeDetector.notes = 'Barcode not found in tested frame/ROIs';
      }
    } catch (e) {
      report.nativeDetector.notes = `Error: ${e.message}`;
    }
  } else {
    report.nativeDetector.notes = 'Not supported in current browser environment';
  }

  // Test Tier 2: ZXing-C++ WASM
  try {
    for (const roi of rois) {
      const res = await decodeWithZXingWasm(roi.canvas);
      if (res && res.success && res.rawValue) {
        report.zxingWasm.detected = true;
        report.zxingWasm.value = res.rawValue;
        report.zxingWasm.symbology = res.symbology;
        report.zxingWasm.pixelDimensions = res.pixelDimensions;
        report.zxingWasm.notes = `Detected in ${roi.name}`;
        break;
      }
    }
    if (!report.zxingWasm.detected) {
      report.zxingWasm.notes = 'Barcode not found in tested frame/ROIs';
    }
  } catch (e) {
    report.zxingWasm.notes = `Error: ${e.message}`;
  }

  // Test Tier 3: Quagga2
  try {
    for (const roi of rois) {
      const res = await decodeWithQuagga(roi.canvas);
      if (res && res.success && res.rawValue) {
        report.quagga2.detected = true;
        report.quagga2.value = res.rawValue;
        report.quagga2.symbology = res.symbology;
        report.quagga2.pixelDimensions = res.pixelDimensions;
        report.quagga2.notes = `Detected in ${roi.name}`;
        break;
      }
    }
    if (!report.quagga2.detected) {
      report.quagga2.notes = 'Barcode not found in tested frame/ROIs';
    }
  } catch (e) {
    report.quagga2.notes = `Error: ${e.message}`;
  }

  // Test Tier 4: ZXing-JS Fallback
  try {
    for (const roi of rois) {
      const zx = decodeCanvasWithZXing(roi.canvas, PRIORITY_1D_FORMATS);
      if (zx && (zx.rawValue || zx.text)) {
        report.zxingJs.detected = true;
        report.zxingJs.value = zx.rawValue || zx.text;
        report.zxingJs.symbology = zx.symbology || zx.format || '1D_BARCODE';
        report.zxingJs.notes = `Detected in ${roi.name}`;
        break;
      }
    }
    if (!report.zxingJs.detected) {
      report.zxingJs.notes = 'Barcode not found in tested frame/ROIs';
    }
  } catch (e) {
    report.zxingJs.notes = `Error: ${e.message}`;
  }

  return report;
}

/**
 * Universal Canvas Creator (Browser & Headless)
 */
export function createCanvas(width, height) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    return new OffscreenCanvas(width, height);
  }
  return null;
}

/**
 * Extract a sub-region (ROI) from an existing canvas
 */
export function cropCanvasROI(canvas, xRatio, yRatio, wRatio, hRatio) {
  if (!canvas || canvas.width === 0 || canvas.height === 0) return null;
  const w = canvas.width;
  const h = canvas.height;
  const sx = Math.max(0, Math.floor(w * xRatio));
  const sy = Math.max(0, Math.floor(h * yRatio));
  const sw = Math.min(w - sx, Math.floor(w * wRatio));
  const sh = Math.min(h - sy, Math.floor(h * hRatio));
  if (sw <= 10 || sh <= 10) return null;

  const out = createCanvas(sw, sh);
  if (!out) return null;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

/**
 * High-Quality Canvas Upscaling (Sub-pixel bar expansion)
 */
export function upscaleCanvas(canvas, factor = 2) {
  if (!canvas || factor <= 1) return canvas;
  const newW = Math.round(canvas.width * factor);
  const newH = Math.round(canvas.height * factor);
  const out = createCanvas(newW, newH);
  if (!out) return canvas;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, newW, newH);
  return out;
}

/**
 * Percentile Contrast Stretch & Normalization (ignores noise/glare outliers)
 */
export function applyContrastStretch(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  const total = canvas.width * canvas.height;
  if (total === 0) return canvas;

  // Build 256-bin histogram
  const hist = new Int32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    hist[lum]++;
  }

  // Clip at 2% and 98% percentiles
  const lowThreshold = Math.floor(total * 0.02);
  const highThreshold = Math.floor(total * 0.98);
  let acc = 0;
  let min = 0;
  let max = 255;
  for (let i = 0; i < 256; i++) {
    acc += hist[i];
    if (acc >= lowThreshold) {
      min = i;
      break;
    }
  }
  acc = 0;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i];
    if (acc >= total - highThreshold) {
      max = i;
      break;
    }
  }

  const range = max - min || 1;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.max(0, Math.round(((i - min) / range) * 255)));
  }

  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    const stretched = lut[lum];
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
  }

  const out = createCanvas(canvas.width, canvas.height);
  if (!out) return canvas;
  out.getContext('2d').putImageData(imgData, 0, 0);
  return out;
}

/**
 * Bradley-Roth Integral-Image Local Adaptive Binarization
 * Highly effective against glossy card reflections, specular highlights, and room shadows.
 */
export function applyLocalAdaptiveThreshold(canvas, windowRatio = 28, thresholdFactor = 0.88) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  // Grayscale array
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }

  // 2D Integral image table
  const intW = w + 1;
  const integral = new Uint32Array(intW * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integral[(y + 1) * intW + (x + 1)] = integral[y * intW + (x + 1)] + rowSum;
    }
  }

  // Window radius s and threshold multiplier t
  const s = Math.max(10, Math.round(w / windowRatio));
  const t = thresholdFactor;

  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - s);
    const y2 = Math.min(h, y + s + 1);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - s);
      const x2 = Math.min(w, x + s + 1);
      const count = (x2 - x1) * (y2 - y1);
      const sum =
        integral[y2 * intW + x2] -
        integral[y1 * intW + x2] -
        integral[y2 * intW + x1] +
        integral[y1 * intW + x1];
      const mean = sum / count;
      const pixel = gray[y * w + x];
      const val = pixel < mean * t ? 0 : 255;
      const idx = (y * w + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  const out = createCanvas(w, h);
  if (!out) return canvas;
  out.getContext('2d').putImageData(imgData, 0, 0);
  return out;
}

/**
 * Global Otsu Adaptive Binarization
 */
export function applyOtsuThreshold(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const hist = new Int32Array(256);
  const totalPixels = canvas.width * canvas.height;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    hist[lum]++;
  }

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 128;

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = totalPixels - wB;
    if (wF === 0) break;

    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const varianceBetween = wB * wF * (mB - mF) * (mB - mF);

    if (varianceBetween > maxVariance) {
      maxVariance = varianceBetween;
      threshold = t;
    }
  }

  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
    const val = lum >= threshold ? 255 : 0;
    data[i] = val;
    data[i + 1] = val;
    data[i + 2] = val;
  }

  const out = createCanvas(canvas.width, canvas.height);
  if (!out) return canvas;
  out.getContext('2d').putImageData(imgData, 0, 0);
  return out;
}

/**
 * Laplacian Edge Sharpening (restores optical blur)
 */
export function applySharpen(canvas) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;
  const w = canvas.width;
  const h = canvas.height;
  if (w < 3 || h < 3) return canvas;
  const src = ctx.getImageData(0, 0, w, h);
  const srcData = src.data;

  const out = createCanvas(w, h);
  if (!out) return canvas;
  const outCtx = out.getContext('2d');
  const dst = outCtx.createImageData(w, h);
  const dstData = dst.data;

  // 3x3 High-pass kernel
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const top = ((y - 1) * w + x) * 4;
      const bottom = ((y + 1) * w + x) * 4;
      const left = (y * w + (x - 1)) * 4;
      const right = (y * w + (x + 1)) * 4;

      for (let c = 0; c < 3; c++) {
        const val =
          5 * srcData[idx + c] -
          srcData[top + c] -
          srcData[bottom + c] -
          srcData[left + c] -
          srcData[right + c];
        dstData[idx + c] = Math.min(255, Math.max(0, val));
      }
      dstData[idx + 3] = 255;
    }
  }

  // Copy borders
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      dstData[x * 4 + c] = srcData[x * 4 + c];
      dstData[((h - 1) * w + x) * 4 + c] = srcData[((h - 1) * w + x) * 4 + c];
    }
  }
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 4; c++) {
      dstData[(y * w) * 4 + c] = srcData[(y * w) * 4 + c];
      dstData[(y * w + (w - 1)) * 4 + c] = srcData[(y * w + (w - 1)) * 4 + c];
    }
  }

  outCtx.putImageData(dst, 0, 0);
  return out;
}

/**
 * Rotate Canvas with Pure White Quiet Zone Background
 */
export function rotateCanvas(canvas, degrees) {
  if (!canvas || degrees === 0) return canvas;
  const rads = (degrees * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(rads));
  const absSin = Math.abs(Math.sin(rads));
  const outW = Math.max(1, Math.round(canvas.width * absCos + canvas.height * absSin));
  const outH = Math.max(1, Math.round(canvas.width * absSin + canvas.height * absCos));

  const out = createCanvas(outW, outH);
  if (!out) return canvas;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  // White quiet zone margin
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outW, outH);

  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(rads);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
}

/**
 * Decode a single canvas using ZXing with TRY_HARDER
 */
export function decodeCanvasWithZXing(canvas, formats = null) {
  if (!canvas || canvas.width === 0 || canvas.height === 0) {
    return null;
  }

  const targetFormats = formats || PRIORITY_1D_FORMATS;
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, targetFormats);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);

  const reader = new ZXing.MultiFormatReader();
  reader.setHints(hints);

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const width = canvas.width;
  const height = canvas.height;

  // Convert to 1-byte grayscale array
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    gray[j] = (data[i] * 77 + data[i + 1] * 150 + data[i + 2] * 29) >> 8;
  }

  const lumSource = new ZXing.RGBLuminanceSource(gray, width, height);

  // Strategy 1: GlobalHistogramBinarizer (superior for 1D barcodes)
  try {
    const bitmap = new ZXing.BinaryBitmap(new ZXing.GlobalHistogramBinarizer(lumSource));
    const result = reader.decode(bitmap, hints);
    if (result && result.getText()) {
      const txt = result.getText();
      const sym = FORMAT_NAME_MAP[result.getBarcodeFormat()] || '1D_BARCODE';
      return {
        success: true,
        rawValue: txt,
        text: txt,
        symbology: sym,
        format: sym,
        engine: 'ZXing (GlobalHistogramBinarizer)',
      };
    }
  } catch (e) {
    // continue
  }

  // Strategy 2: HybridBinarizer (adaptive block binarizer)
  try {
    const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(lumSource));
    const result = reader.decode(bitmap, hints);
    if (result && result.getText()) {
      const txt = result.getText();
      const sym = FORMAT_NAME_MAP[result.getBarcodeFormat()] || '1D_BARCODE';
      return {
        success: true,
        rawValue: txt,
        text: txt,
        symbology: sym,
        format: sym,
        engine: 'ZXing (HybridBinarizer)',
      };
    }
  } catch (e) {
    // continue
  }

  // Strategy 3: Inverted GlobalHistogramBinarizer (for light-on-dark)
  try {
    const invertedSource = new ZXing.InvertedLuminanceSource(lumSource);
    const bitmap = new ZXing.BinaryBitmap(new ZXing.GlobalHistogramBinarizer(invertedSource));
    const result = reader.decode(bitmap, hints);
    if (result && result.getText()) {
      const txt = result.getText();
      const sym = FORMAT_NAME_MAP[result.getBarcodeFormat()] || '1D_BARCODE';
      return {
        success: true,
        rawValue: txt,
        text: txt,
        symbology: sym,
        format: sym,
        engine: 'ZXing (Inverted GlobalHistogram)',
      };
    }
  } catch (e) {
    // continue
  }

  return null;
}

function formatDecodeSuccess({
  rawValue,
  symbology,
  engineUsed,
  passDescription,
  canvas,
  roiUsed,
  supportedNativeFormats,
  attemptLog,
  startTime,
  pixelDimensions,
}) {
  return {
    success: true,
    rawValue,
    text: rawValue,
    symbology,
    format: symbology,
    engineUsed,
    engine: engineUsed,
    passDescription,
    pass: passDescription,
    roiUsed: roiUsed || 'Full Frame',
    imageWidth: canvas.width,
    imageHeight: canvas.height,
    width: canvas.width,
    height: canvas.height,
    supportedNativeFormats,
    attemptLog,
    attempts: attemptLog,
    elapsedMs: Math.round(performance.now() - startTime),
    pixelDimensions: pixelDimensions || null,
  };
}

function formatDecodeFailure({ error, canvas, supportedNativeFormats, attemptLog, startTime }) {
  return {
    success: false,
    error,
    rawValue: null,
    text: null,
    symbology: null,
    format: null,
    imageWidth: canvas?.width || 0,
    imageHeight: canvas?.height || 0,
    width: canvas?.width || 0,
    height: canvas?.height || 0,
    supportedNativeFormats: supportedNativeFormats || [],
    attemptLog,
    attempts: attemptLog,
    elapsedMs: Math.round(performance.now() - startTime),
  };
}

/**
 * Main Robust Multi-Pass Barcode Decoder Pipeline
 * Systematically isolates card ROIs, scales bars sub-pixel, removes glare with integral thresholding,
 * and compensates for handheld micro-tilt.
 */
export async function decodeBarcodeRobustly(imageSource, options = {}) {
  const attemptLog = [];
  const startTime = performance.now();

  let canvas = null;
  let imageWidth = 0;
  let imageHeight = 0;

  try {
    if (imageSource instanceof HTMLCanvasElement) {
      canvas = imageSource;
      imageWidth = canvas.width;
      imageHeight = canvas.height;
    } else if (imageSource instanceof HTMLVideoElement) {
      canvas = createCanvas(imageSource.videoWidth || 1920, imageSource.videoHeight || 1080);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageSource, 0, 0, canvas.width, canvas.height);
      imageWidth = canvas.width;
      imageHeight = canvas.height;
    } else {
      let bitmap = null;
      if (typeof createImageBitmap === 'function') {
        try {
          bitmap = await createImageBitmap(imageSource);
          imageWidth = bitmap.width;
          imageHeight = bitmap.height;
        } catch (e) {
          // fallback
        }
      }

      if (!bitmap) {
        const url =
          imageSource instanceof File || imageSource instanceof Blob
            ? URL.createObjectURL(imageSource)
            : imageSource.src;
        const img = new Image();
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        imageWidth = img.naturalWidth || img.width;
        imageHeight = img.naturalHeight || img.height;
        canvas = createCanvas(imageWidth, imageHeight);
        canvas.getContext('2d').drawImage(img, 0, 0);
        if (imageSource instanceof File || imageSource instanceof Blob) {
          URL.revokeObjectURL(url);
        }
      } else {
        // Cap max dimension to 2560px for razor-sharp bars without memory overflow
        const maxDim = 2560;
        let w = bitmap.width;
        let h = bitmap.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        canvas = createCanvas(w, h);
        canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      }
    }
  } catch (err) {
    return formatDecodeFailure({
      error: `Failed to load image: ${err.message || err}`,
      attemptLog: [`Image load failed: ${err.message}`],
      startTime,
    });
  }

  // Safe Native BarcodeDetector instance
  const nativeDetector = await createSafeNativeDetector();
  const supportedNativeFormats = await getSupportedNativeBarcodeFormats();

  // Helper to test a canvas candidate through the 4-tier engine hierarchy:
  // 1. Native BarcodeDetector (Browser native API)
  // 2. ZXing-C++ WASM Engine (zxing-wasm)
  // 3. Quagga2 CV Engine (@ericblade/quagga2)
  // 4. Existing ZXing-JS Fallback (@zxing/library)
  const tryCandidate = async (targetCanvas, passName, roiLabel) => {
    if (!targetCanvas || targetCanvas.width < 10 || targetCanvas.height < 10) return null;

    try {
      const result = await decodeCandidateWith4Tiers(targetCanvas);
      if (result && result.success && (result.rawValue || result.text)) {
        const raw = result.rawValue || result.text;
        const sym = result.symbology || result.format || '1D_BARCODE';
        return formatDecodeSuccess({
          rawValue: raw,
          symbology: sym,
          engineUsed: `${result.engine || 'Barcode Engine'} (${passName})`,
          passDescription: `${passName} [${roiLabel}]`,
          canvas: targetCanvas,
          roiUsed: roiLabel,
          supportedNativeFormats,
          attemptLog,
          startTime,
          pixelDimensions: result.pixelDimensions || null,
        });
      }
    } catch (e) {
      // continue
    }

    return null;
  };

  // -----------------------------------------------------------------
  // STAGE 1: Full-Resolution Direct Scan
  // -----------------------------------------------------------------
  attemptLog.push(`Pass 1: Direct Full-Res Scan (${canvas.width}x${canvas.height})`);
  const res1 = await tryCandidate(canvas, 'Pass 1: Full-Res Direct', 'Full Frame');
  if (res1) return res1;

  // -----------------------------------------------------------------
  // STAGE 2: Lower-Center ROI (Priority Zone for College ID Barcodes)
  // College ID card barcodes are physically printed in the lower half (y: 38%–88%, x: 6%–94%)
  // -----------------------------------------------------------------
  const lowerCenterROI = cropCanvasROI(canvas, 0.06, 0.38, 0.88, 0.52);
  if (lowerCenterROI) {
    attemptLog.push(`Pass 2: Lower-Center Card Band ROI (${lowerCenterROI.width}x${lowerCenterROI.height})`);
    const res2 = await tryCandidate(lowerCenterROI, 'Pass 2: Lower-Center Band', 'Lower-Center Band');
    if (res2) return res2;

    // STAGE 3: Lower-Center Band Upscaled 2x (Sub-pixel expansion for 1px bars)
    attemptLog.push('Pass 3: Lower-Center Band Upscaled 2x');
    const lower2x = upscaleCanvas(lowerCenterROI, 2);
    const res3 = await tryCandidate(lower2x, 'Pass 3: Lower-Center Upscaled 2x', 'Lower-Center 2x');
    if (res3) return res3;

    // STAGE 4: Lower-Center Band Upscaled 2x + Contrast Stretch
    attemptLog.push('Pass 4: Lower-Center 2x Contrast Normalization');
    const lower2xContrast = applyContrastStretch(lower2x);
    const res4 = await tryCandidate(lower2xContrast, 'Pass 4: Lower-Center 2x Contrast', 'Lower-Center 2x Contrast');
    if (res4) return res4;

    // STAGE 5: Lower-Center Band Upscaled 2x + Bradley-Roth Local Adaptive Threshold
    // Neutralizes specular card reflections & shadows
    attemptLog.push('Pass 5: Lower-Center 2x Local Adaptive Binarization (Glare/Shadow Proof)');
    const lower2xAdaptive = applyLocalAdaptiveThreshold(lower2x, 26, 0.88);
    const res5 = await tryCandidate(lower2xAdaptive, 'Pass 5: Lower-Center 2x Adaptive', 'Lower-Center 2x Adaptive');
    if (res5) return res5;

    // STAGE 6: Micro-Angle Rotations on Lower-Center Band (-4°, -2°, +2°, +4°, -6°, +6°)
    // Handheld cards almost always have a 1°–4° tilt that cuts 1D scanlines short
    attemptLog.push('Pass 6: Lower-Center 2x Micro-Angle Tilt Scan (±2°, ±4°, ±6°)');
    const microAngles = [2, -2, 4, -4, 6, -6];
    for (const deg of microAngles) {
      const rotCvs = rotateCanvas(lower2xContrast, deg);
      const resRot = await tryCandidate(rotCvs, `Pass 6: Micro-Tilt ${deg}°`, `Lower-Center ${deg}°`);
      if (resRot) return resRot;

      const rotAdapt = rotateCanvas(lower2xAdaptive, deg);
      const resRotAdapt = await tryCandidate(rotAdapt, `Pass 6: Micro-Tilt Adaptive ${deg}°`, `Lower-Center Adaptive ${deg}°`);
      if (resRotAdapt) return resRotAdapt;
    }

    // STAGE 7: Lower-Center Band Upscaled 3x + Laplacian Sharpen
    attemptLog.push('Pass 7: Lower-Center Upscaled 3x + Laplacian Sharpen');
    const lower3x = upscaleCanvas(lowerCenterROI, 3);
    const lower3xSharp = applySharpen(lower3x);
    const res7 = await tryCandidate(lower3xSharp, 'Pass 7: Lower-Center 3x Sharpen', 'Lower-Center 3x Sharp');
    if (res7) return res7;

    const lower3xAdaptive = applyLocalAdaptiveThreshold(lower3x, 30, 0.88);
    const res7b = await tryCandidate(lower3xAdaptive, 'Pass 7: Lower-Center 3x Adaptive', 'Lower-Center 3x Adaptive');
    if (res7b) return res7b;

    for (const deg of [2, -2, 4, -4]) {
      const rot3x = rotateCanvas(lower3xAdaptive, deg);
      const resRot3x = await tryCandidate(rot3x, `Pass 7: Micro-Tilt 3x ${deg}°`, `Lower-Center 3x ${deg}°`);
      if (resRot3x) return resRot3x;
    }
  }

  // -----------------------------------------------------------------
  // STAGE 7B: Lower-Right ID Card Barcode Zone (Specific physical ID card zone below Validity)
  // -----------------------------------------------------------------
  const lowerRightROI = cropCanvasROI(canvas, 0.30, 0.40, 0.68, 0.58);
  if (lowerRightROI) {
    attemptLog.push(`Pass 7b: Lower-Right Card Zone ROI (${lowerRightROI.width}x${lowerRightROI.height})`);
    const res7b = await tryCandidate(lowerRightROI, 'Pass 7b: Lower-Right ID Zone', 'Lower-Right Band');
    if (res7b) return res7b;

    const lowerRight2x = upscaleCanvas(lowerRightROI, 2);
    const lowerRightContrast = applyContrastStretch(lowerRight2x);
    const res7bContrast = await tryCandidate(lowerRightContrast, 'Pass 7b: Lower-Right 2x Contrast', 'Lower-Right 2x');
    if (res7bContrast) return res7bContrast;

    const lowerRightAdaptive = applyLocalAdaptiveThreshold(lowerRight2x, 26, 0.88);
    const res7bAdaptive = await tryCandidate(lowerRightAdaptive, 'Pass 7b: Lower-Right 2x Adaptive', 'Lower-Right 2x Adaptive');
    if (res7bAdaptive) return res7bAdaptive;
  }

  // -----------------------------------------------------------------
  // STAGE 8: Center Horizontal Band (Cards held higher in the frame)
  // -----------------------------------------------------------------
  const centerBandROI = cropCanvasROI(canvas, 0.05, 0.22, 0.90, 0.54);
  if (centerBandROI) {
    attemptLog.push(`Pass 8: Center Band ROI Scan (${centerBandROI.width}x${centerBandROI.height})`);
    const res8 = await tryCandidate(centerBandROI, 'Pass 8: Center Band Direct', 'Center Band');
    if (res8) return res8;

    const center2x = upscaleCanvas(centerBandROI, 2);
    const center2xContrast = applyContrastStretch(center2x);
    const res8b = await tryCandidate(center2xContrast, 'Pass 8: Center Band 2x Contrast', 'Center Band 2x');
    if (res8b) return res8b;

    const center2xAdaptive = applyLocalAdaptiveThreshold(center2x, 26, 0.88);
    const res8c = await tryCandidate(center2xAdaptive, 'Pass 8: Center Band 2x Adaptive', 'Center Band 2x Adaptive');
    if (res8c) return res8c;

    for (const deg of [2, -2, 4, -4]) {
      const rotCvs = rotateCanvas(center2xAdaptive, deg);
      const resRotCenter = await tryCandidate(rotCvs, `Pass 8: Center Micro-Tilt ${deg}°`, `Center Band ${deg}°`);
      if (resRotCenter) return resRotCenter;
    }
  }

  // -----------------------------------------------------------------
  // STAGE 9: Bottom Strip ROI (Cards positioned at very bottom edge)
  // -----------------------------------------------------------------
  const bottomStripROI = cropCanvasROI(canvas, 0.06, 0.52, 0.88, 0.44);
  if (bottomStripROI) {
    attemptLog.push(`Pass 9: Bottom Strip ROI Scan (${bottomStripROI.width}x${bottomStripROI.height})`);
    const bottom2x = upscaleCanvas(bottomStripROI, 2);
    const bottom2xAdaptive = applyLocalAdaptiveThreshold(bottom2x, 26, 0.88);
    const res9 = await tryCandidate(bottom2xAdaptive, 'Pass 9: Bottom Strip 2x Adaptive', 'Bottom Strip 2x');
    if (res9) return res9;

    for (const deg of [2, -2, 4, -4]) {
      const rotCvs = rotateCanvas(bottom2xAdaptive, deg);
      const resRotBottom = await tryCandidate(rotCvs, `Pass 9: Bottom Micro-Tilt ${deg}°`, `Bottom Strip ${deg}°`);
      if (resRotBottom) return resRotBottom;
    }
  }

  // -----------------------------------------------------------------
  // STAGE 10: Full-Frame Preprocessing Passes
  // -----------------------------------------------------------------
  attemptLog.push('Pass 10: Full-Frame Contrast Normalization');
  const fullContrast = applyContrastStretch(canvas);
  const res10 = await tryCandidate(fullContrast, 'Pass 10: Full Frame Contrast', 'Full Frame');
  if (res10) return res10;

  attemptLog.push('Pass 10: Full-Frame Otsu Global Binarization');
  const fullOtsu = applyOtsuThreshold(canvas);
  const res10b = await tryCandidate(fullOtsu, 'Pass 10: Full Frame Otsu', 'Full Frame Otsu');
  if (res10b) return res10b;

  attemptLog.push('Pass 10: Full-Frame Laplacian Sharpen');
  const fullSharp = applySharpen(fullContrast);
  const res10c = await tryCandidate(fullSharp, 'Pass 10: Full Frame Sharpen', 'Full Frame Sharpen');
  if (res10c) return res10c;

  // -----------------------------------------------------------------
  // STAGE 11: Multi-Angle Orientation (90°, 270°, 180° for Vertically Held Cards)
  // -----------------------------------------------------------------
  attemptLog.push('Pass 11: Vertical & Multi-Angle Orientation Scan (90°, 270°, 180°)');
  for (const deg of [90, 270, 180]) {
    const rotCanvas = rotateCanvas(canvas, deg);
    const res11 = await tryCandidate(rotCanvas, `Pass 11: ${deg}° Card Orientation`, `Full Frame ${deg}°`);
    if (res11) return res11;

    if (lowerCenterROI) {
      const rotLower = rotateCanvas(lowerCenterROI, deg);
      const res11b = await tryCandidate(rotLower, `Pass 11: Lower-Center ${deg}°`, `Lower-Center ${deg}°`);
      if (res11b) return res11b;
    }
  }

  // -----------------------------------------------------------------
  // STAGE 12: Fallback 2D Barcode & QR Formats (Full Format Suite)
  // -----------------------------------------------------------------
  attemptLog.push('Pass 12: Full 1D & 2D Symbology Fallback Suite (QR, PDF417, Aztec)');
  const zxFallback = decodeCanvasWithZXing(canvas, ALL_BARCODE_FORMATS);
  if (zxFallback && (zxFallback.rawValue || zxFallback.text)) {
    return formatDecodeSuccess({
      rawValue: zxFallback.rawValue || zxFallback.text,
      symbology: zxFallback.symbology || '2D_CODE',
      engineUsed: `${zxFallback.engine} (2D Fallback)`,
      passDescription: 'Pass 12: Full 2D Suite',
      canvas,
      roiUsed: 'Full Frame',
      supportedNativeFormats,
      attemptLog,
      startTime,
    });
  }

  // All passes exhausted
  return formatDecodeFailure({
    error:
      'Could not detect or decode a 1D/2D barcode across 12 multi-stage filter passes (Multi-ROI, 2x/3x Sub-Pixel Upscaling, Bradley-Roth Adaptive Binarization, Micro-Tilt Correction ±2°–±6°, Contrast Stretch, Sharpening, and Multi-Angle). Please ensure the physical ID card barcode is in focus, well-lit, and uncropped.',
    canvas,
    supportedNativeFormats,
    attemptLog,
    startTime,
  });
}

// ---------------------------------------------------------------------------
// KNOWN-GOOD BARCODE GENERATORS & SELF-TEST SUITE
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic known-good Code 128 barcode onto an HTML Canvas
 */
export function generateCode128Canvas(text, scale = 3, height = 120) {
  const codes = [104]; // Start B
  let checkSum = 104;
  for (let i = 0; i < text.length; i++) {
    const val = text.charCodeAt(i) - 32;
    codes.push(val);
    checkSum += val * (i + 1);
  }
  codes.push(checkSum % 103);
  codes.push(106); // Stop

  const modules = [];
  for (let q = 0; q < 25; q++) modules.push(0); // quiet zone
  for (const code of codes) {
    const pattern = ZXing.Code128Reader.CODE_PATTERNS[code];
    let isBar = true;
    for (const width of pattern) {
      for (let w = 0; w < width; w++) modules.push(isBar ? 1 : 0);
      isBar = !isBar;
    }
  }
  for (let q = 0; q < 25; q++) modules.push(0); // quiet zone

  const width = modules.length * scale;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#000000';
  for (let x = 0; x < width; x++) {
    const modIdx = Math.floor(x / scale);
    if (modules[modIdx] === 1) {
      ctx.fillRect(x, 0, 1, height);
    }
  }
  return canvas;
}

/**
 * Generate a deterministic known-good Code 39 barcode onto an HTML Canvas
 */
export function generateCode39Canvas(text, scale = 2, height = 120) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
  const encodings = ZXing.Code39Reader.CHARACTER_ENCODINGS;
  const ASTERISK = ZXing.Code39Reader.ASTERISK_ENCODING;

  const chars = ['*'].concat(text.toUpperCase().split('')).concat(['*']);
  const modules = [];
  const wideW = 3;
  const narrowW = 1;

  for (let q = 0; q < 30; q++) modules.push(0); // quiet zone
  for (let c = 0; c < chars.length; c++) {
    const ch = chars[c];
    const pattern = ch === '*' ? ASTERISK : encodings[alphabet.indexOf(ch)];
    for (let b = 8; b >= 0; b--) {
      const isWide = ((pattern >> b) & 1) === 1;
      const isBar = (8 - b) % 2 === 0;
      const count = isWide ? wideW : narrowW;
      for (let w = 0; w < count; w++) modules.push(isBar ? 1 : 0);
    }
    if (c < chars.length - 1) {
      for (let w = 0; w < narrowW; w++) modules.push(0); // inter-char space
    }
  }
  for (let q = 0; q < 30; q++) modules.push(0); // quiet zone

  const width = modules.length * scale;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#000000';
  for (let x = 0; x < width; x++) {
    const modIdx = Math.floor(x / scale);
    if (modules[modIdx] === 1) {
      ctx.fillRect(x, 0, 1, height);
    }
  }
  return canvas;
}

/**
 * Execute Self-Test Suite with Known-Good Barcodes in the active browser/environment
 */
export async function runKnownGoodBarcodeSelfTest() {
  const results = [];

  // Test 1: Code 128 Simple Roll
  const canvas1 = generateCode128Canvas('238W1A0477', 3, 120);
  const res1 = await decodeBarcodeRobustly(canvas1);
  results.push({
    name: 'Known-Good Code 128 (238W1A0477)',
    testName: 'Known-Good Code 128: 238W1A0477',
    expected: '238W1A0477',
    expectedFormat: 'CODE_128',
    format: res1.symbology || 'CODE_128',
    passed: res1.success && res1.rawValue === '238W1A0477' && res1.symbology === 'CODE_128',
    actualValue: res1.rawValue || null,
    actualSymbology: res1.symbology || null,
    engine: res1.engineUsed || null,
    elapsedMs: res1.elapsedMs,
  });

  // Test 2: Physical Card Code 128 (238W1A04C2)
  const canvas2 = generateCode128Canvas('238W1A04C2', 3, 120);
  const res2 = await decodeBarcodeRobustly(canvas2);
  results.push({
    name: 'Physical Card Code 128 (238W1A04C2)',
    testName: 'Physical Card Code 128: 238W1A04C2',
    expected: '238W1A04C2',
    expectedFormat: 'CODE_128',
    format: res2.symbology || 'CODE_128',
    passed: res2.success && res2.rawValue === '238W1A04C2' && res2.symbology === 'CODE_128',
    actualValue: res2.rawValue || null,
    actualSymbology: res2.symbology || null,
    engine: res2.engineUsed || null,
    elapsedMs: res2.elapsedMs,
  });

  // Test 3: Physical Card Code 39 (238W1A04C2)
  const canvas3 = generateCode39Canvas('238W1A04C2', 2, 120);
  const res3 = await decodeBarcodeRobustly(canvas3);
  results.push({
    name: 'Physical Card Code 39 (238W1A04C2)',
    testName: 'Physical Card Code 39: 238W1A04C2',
    expected: '238W1A04C2',
    expectedFormat: 'CODE_39',
    format: res3.symbology || 'CODE_39',
    passed: res3.success && res3.rawValue === '238W1A04C2' && res3.symbology === 'CODE_39',
    actualValue: res3.rawValue || null,
    actualSymbology: res3.symbology || null,
    engine: res3.engineUsed || null,
    elapsedMs: res3.elapsedMs,
  });

  // Test 4: Tilted Card Code 128 (3° Hand Tilt)
  const canvas4 = generateCode128Canvas('238W1A0477', 3, 120);
  const tiltedCanvas = rotateCanvas(canvas4, 3);
  const res4 = await decodeBarcodeRobustly(tiltedCanvas);
  results.push({
    name: 'Tilted Code 128 (3° Hand Tilt)',
    testName: 'Tilted Code 128: 3° Hand Tilt',
    expected: '238W1A0477',
    expectedFormat: 'CODE_128',
    format: res4.symbology || 'CODE_128',
    passed: res4.success && res4.rawValue === '238W1A0477',
    actualValue: res4.rawValue || null,
    actualSymbology: res4.symbology || null,
    engine: res4.engineUsed || null,
    elapsedMs: res4.elapsedMs,
  });

  // Test 5: Code 39 (238W1A0477)
  const canvas5 = generateCode39Canvas('238W1A0477', 2, 120);
  const res5 = await decodeBarcodeRobustly(canvas5);
  results.push({
    name: 'Known-Good Code 39 (238W1A0477)',
    testName: 'Known-Good Code 39: 238W1A0477',
    expected: '238W1A0477',
    expectedFormat: 'CODE_39',
    format: res5.symbology || 'CODE_39',
    passed: res5.success && res5.rawValue === '238W1A0477' && res5.symbology === 'CODE_39',
    actualValue: res5.rawValue || null,
    actualSymbology: res5.symbology || null,
    engine: res5.engineUsed || null,
    elapsedMs: res5.elapsedMs,
  });

  // Attach allPassed property for flexibility
  results.allPassed = results.every((r) => r.passed);
  return results;
}
