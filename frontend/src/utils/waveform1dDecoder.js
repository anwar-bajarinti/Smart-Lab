/**
 * 1D Waveform & Deblurring Barcode Decoder Engine
 *
 * Designed for real-time live webcam barcode scanning on college ID cards.
 * Key principles:
 * 1. Dual-orientation scanline averaging (horizontal and vertical) to suppress sensor noise by ~5x.
 * 2. 1D high-frequency Laplacian sharpening to restore contrast of diffraction-blurred narrow bars and spaces.
 * 3. Continuous subpixel edge detection via first derivative extrema and quadratic peak interpolation.
 * 4. Multi-symbology parsing: Code 128 (with modulo-103 checksum) and Code 39 (with start/stop '*' validation).
 * 5. Full rotation tolerance: Horizontal, Vertical, Rotated +90°, Rotated -90°, and 180° inverted runs.
 * 6. Lightweight dual-orientation quality gating for responsive, zero-click live scanning.
 */

// Code 128 character patterns: 6 element widths per character (bars & spaces summing to 11 modules)
// Stop character has 7 elements summing to 13 modules.
const CODE128_PATTERNS = [
  [2, 1, 2, 2, 2, 2], [2, 2, 2, 1, 2, 2], [2, 2, 2, 2, 2, 1], [1, 2, 1, 2, 2, 3], // 0-3
  [1, 2, 1, 3, 2, 2], [1, 3, 1, 2, 2, 2], [1, 2, 2, 2, 1, 3], [1, 2, 2, 3, 1, 2], // 4-7
  [1, 3, 2, 2, 1, 2], [2, 2, 1, 2, 1, 3], [2, 2, 1, 3, 1, 2], [2, 3, 1, 2, 1, 2], // 8-11
  [1, 1, 2, 2, 3, 2], [1, 2, 2, 1, 3, 2], [1, 2, 2, 2, 3, 1], [1, 1, 3, 2, 2, 2], // 12-15
  [1, 2, 3, 1, 2, 2], [1, 2, 3, 2, 2, 1], [2, 2, 3, 2, 1, 1], [2, 2, 1, 1, 3, 2], // 16-19
  [2, 2, 1, 2, 3, 1], [2, 1, 3, 2, 1, 2], [2, 2, 3, 1, 1, 2], [3, 1, 2, 1, 3, 1], // 20-23
  [3, 1, 1, 2, 2, 2], [3, 2, 1, 1, 2, 2], [3, 2, 1, 2, 2, 1], [3, 1, 2, 2, 1, 2], // 24-27
  [3, 2, 2, 1, 1, 2], [3, 2, 2, 2, 1, 1], [2, 1, 2, 1, 2, 3], [2, 1, 2, 3, 2, 1], // 28-31
  [2, 3, 2, 1, 2, 1], [1, 1, 1, 3, 2, 3], [1, 3, 1, 1, 2, 3], [1, 3, 1, 3, 2, 1], // 32-35
  [1, 1, 2, 3, 1, 3], [1, 3, 2, 1, 1, 3], [1, 3, 2, 3, 1, 1], [2, 1, 1, 3, 1, 3], // 36-39
  [2, 3, 1, 1, 1, 3], [2, 3, 1, 3, 1, 1], [1, 1, 2, 1, 3, 3], [1, 1, 2, 3, 3, 1], // 40-43
  [1, 3, 2, 1, 3, 1], [1, 1, 3, 1, 2, 3], [1, 1, 3, 3, 2, 1], [1, 3, 3, 1, 2, 1], // 44-47
  [3, 1, 3, 1, 2, 1], [2, 1, 1, 3, 3, 1], [2, 3, 1, 1, 3, 1], [2, 1, 3, 1, 1, 3], // 48-51
  [2, 1, 3, 3, 1, 1], [2, 1, 3, 1, 3, 1], [3, 1, 1, 1, 2, 3], [3, 1, 1, 3, 2, 1], // 52-55
  [3, 3, 1, 1, 2, 1], [3, 1, 2, 1, 1, 3], [3, 1, 2, 3, 1, 1], [3, 3, 2, 1, 1, 1], // 56-59
  [3, 1, 4, 1, 1, 1], [2, 2, 1, 4, 1, 1], [4, 3, 1, 1, 1, 1], [1, 1, 1, 2, 2, 4], // 60-63
  [1, 1, 1, 4, 2, 2], [1, 2, 1, 1, 2, 4], [1, 2, 1, 4, 2, 1], [1, 4, 1, 1, 2, 2], // 64-67
  [1, 4, 1, 2, 2, 1], [1, 1, 2, 2, 1, 4], [1, 1, 2, 4, 1, 2], [1, 2, 2, 1, 1, 4], // 68-71
  [1, 2, 2, 4, 1, 1], [1, 4, 2, 1, 1, 2], [1, 4, 2, 2, 1, 1], [2, 4, 1, 2, 1, 1], // 72-75
  [2, 2, 1, 1, 1, 4], [4, 1, 3, 1, 1, 1], [2, 4, 1, 1, 1, 2], [1, 3, 4, 1, 1, 1], // 76-79
  [1, 1, 1, 2, 4, 2], [1, 2, 1, 1, 4, 2], [1, 2, 1, 2, 4, 1], [1, 1, 4, 2, 1, 2], // 80-83
  [1, 2, 4, 1, 1, 2], [1, 2, 4, 2, 1, 1], [4, 1, 1, 2, 1, 2], [4, 2, 1, 1, 1, 2], // 84-87
  [4, 2, 1, 2, 1, 1], [2, 1, 2, 1, 4, 1], [2, 1, 4, 1, 2, 1], [4, 1, 2, 1, 2, 1], // 88-91
  [1, 1, 1, 1, 4, 3], [1, 1, 1, 3, 4, 1], [1, 3, 1, 1, 4, 1], [1, 1, 4, 1, 1, 3], // 92-95
  [1, 1, 4, 3, 1, 1], [4, 1, 1, 1, 1, 3], [4, 1, 1, 3, 1, 1], [1, 1, 3, 1, 4, 1], // 96-99
  [1, 1, 4, 1, 3, 1], [3, 1, 1, 1, 4, 1], [4, 1, 1, 1, 3, 1],                      // 100-102
  [2, 1, 1, 4, 1, 2], // 103: Start A
  [2, 1, 1, 2, 1, 4], // 104: Start B
  [2, 1, 1, 2, 3, 2], // 105: Start C
  [2, 3, 3, 1, 1, 1, 2], // 106: Stop (7 elements, 13 modules)
];

// Code 39 character patterns: 9 elements (5 bars, 4 spaces). 1 = Wide, 0 = Narrow.
// Elements: [bar, space, bar, space, bar, space, bar, space, bar]
const CODE39_PATTERNS = {
  '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
  '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
  '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
  'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
  'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
  'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
  'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
  'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
  'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
  '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
  '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100',
};

// Reverse map for Code 39
const CODE39_REVERSE = {};
for (const [char, pat] of Object.entries(CODE39_PATTERNS)) {
  CODE39_REVERSE[pat] = char;
}

/**
 * Universal canvas helper
 */
function createCanvasHelper(width, height) {
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
 * Crop canvas helper
 */
function cropCanvasHelper(canvas, sx, sy, sw, sh) {
  if (!canvas || sw <= 0 || sh <= 0) return null;
  const out = createCanvasHelper(sw, sh);
  if (!out) return null;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

/**
 * Rotate canvas helper with pure white quiet zone
 */
function rotateCanvasHelper(canvas, degrees) {
  if (!canvas || degrees === 0) return canvas;
  const rads = (degrees * Math.PI) / 180;
  const absCos = Math.abs(Math.cos(rads));
  const absSin = Math.abs(Math.sin(rads));
  const outW = Math.max(1, Math.round(canvas.width * absCos + canvas.height * absSin));
  const outH = Math.max(1, Math.round(canvas.width * absSin + canvas.height * absCos));

  const out = createCanvasHelper(outW, outH);
  if (!out) return canvas;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outW, outH);
  ctx.save();
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate(rads);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  ctx.restore();
  return out;
}

/**
 * Extract an averaged 1D horizontal luminance waveform across a band of rows.
 * Vertical averaging across H rows boosts SNR by sqrt(H) (~5-6x), eliminating camera noise.
 * Scans along the X-axis (crossing vertical bars of a horizontal barcode).
 */
export function extract1DWaveform(canvas, xStart, yStart, width, height, angleDegrees = 0) {
  if (!canvas || width < 20 || height < 2) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const w = Math.min(width, canvas.width - xStart);
  const h = Math.min(height, canvas.height - yStart);
  if (w <= 0 || h <= 0) return null;

  const imgData = ctx.getImageData(xStart, yStart, w, h);
  const data = imgData.data;
  const waveform = new Float32Array(w);

  const rad = (angleDegrees * Math.PI) / 180;
  const tanAngle = Math.tan(rad);
  const halfW = w / 2;

  // For each column x, compute average vertical luminance along the tilted scanline
  for (let x = 0; x < w; x++) {
    const yOffset = Math.round((x - halfW) * tanAngle);
    let sumL = 0;
    let count = 0;

    for (let y = 0; y < h; y++) {
      const actualY = y + yOffset;
      if (actualY >= 0 && actualY < h) {
        const idx = (actualY * w + x) * 4;
        // Rec. 601 Luminance
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        sumL += lum;
        count++;
      }
    }

    waveform[x] = count > 0 ? sumL / count : 128;
  }

  return waveform;
}

/**
 * Extract an averaged 1D vertical luminance waveform across a band of columns.
 * Horizontal averaging across W columns boosts SNR by sqrt(W) (~5-6x), eliminating camera noise.
 * Scans along the Y-axis (crossing horizontal bars of a vertical barcode).
 */
export function extract1DVerticalWaveform(canvas, xStart, yStart, width, height, angleDegrees = 0) {
  if (!canvas || width < 2 || height < 20) return null;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  const w = Math.min(width, canvas.width - xStart);
  const h = Math.min(height, canvas.height - yStart);
  if (w <= 0 || h <= 0) return null;

  const imgData = ctx.getImageData(xStart, yStart, w, h);
  const data = imgData.data;
  const waveform = new Float32Array(h);

  const rad = (angleDegrees * Math.PI) / 180;
  const tanAngle = Math.tan(rad);
  const halfH = h / 2;

  // For each row y, compute average horizontal luminance along the tilted scanline
  for (let y = 0; y < h; y++) {
    const xOffset = Math.round((y - halfH) * tanAngle);
    let sumL = 0;
    let count = 0;

    for (let x = 0; x < w; x++) {
      const actualX = x + xOffset;
      if (actualX >= 0 && actualX < w) {
        const idx = (y * w + actualX) * 4;
        // Rec. 601 Luminance
        const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
        sumL += lum;
        count++;
      }
    }

    waveform[y] = count > 0 ? sumL / count : 128;
  }

  return waveform;
}

/**
 * Fast Quality Gate: Quickly assesses whether the 1D waveform shows a readable barcode signal.
 * Checks:
 * 1. Dynamic range (contrast between dark bars and light spaces)
 * 2. Edge energy (sharpness/focus)
 * 3. Number of alternating transitions (barcode-like frequency)
 * Returns usable flag and live guidance text for the user.
 */
export function assessBarcodeQuality(waveform) {
  if (!waveform || waveform.length < 30) {
    return {
      isUsable: false,
      hint: 'Position barcode inside guide',
      contrast: 0,
      sharpness: 0,
      transitions: 0,
    };
  }

  const len = waveform.length;
  let min = 255;
  let max = 0;
  let totalGrad = 0;

  for (let i = 0; i < len; i++) {
    const v = waveform[i];
    if (v < min) min = v;
    if (v > max) max = v;
    if (i > 0) {
      totalGrad += Math.abs(v - waveform[i - 1]);
    }
  }

  const contrast = max - min;
  const sharpness = totalGrad / len;

  // Threshold at mean to count transitions
  const mean = (min + max) / 2;
  let transitions = 0;
  let lastSign = waveform[0] >= mean;
  for (let i = 1; i < len; i++) {
    const sign = waveform[i] >= mean;
    if (sign !== lastSign) {
      transitions++;
      lastSign = sign;
    }
  }

  // Heuristics to reject plain rooms/walls while accepting real 1D barcodes:
  if (contrast < 15) {
    return {
      isUsable: false,
      hint: 'Move closer / ensure good lighting',
      contrast,
      sharpness,
      transitions,
    };
  }

  if (transitions < 16) {
    return {
      isUsable: false,
      hint: 'Position barcode inside guide',
      contrast,
      sharpness,
      transitions,
    };
  }

  if (sharpness < 1.5) {
    return {
      isUsable: false,
      hint: 'Hold card steady to focus',
      contrast,
      sharpness,
      transitions,
    };
  }

  // Good barcode signal ready for decoding
  return {
    isUsable: true,
    hint: 'Reading barcode...',
    contrast,
    sharpness,
    transitions,
  };
}

/**
 * Dual-Orientation Quality Assessment:
 * Tests both horizontal and vertical center waveforms.
 * Does not force a single orientation decision; marks usable if either or both show viable contrast/transitions.
 */
export function assessDualOrientationQuality(canvas, xStart, yStart, width, height) {
  if (!canvas || width < 30 || height < 30) {
    return {
      isUsable: false,
      hint: 'Position barcode inside guide',
      checkHorizontal: false,
      checkVertical: false,
      qualityH: null,
      qualityV: null,
    };
  }

  // 1. Horizontal sample: across width, sampled at center Y
  const sampleY = Math.floor(yStart + height * 0.40);
  const sampleH = Math.max(12, Math.floor(height * 0.20));
  const waveH = extract1DWaveform(canvas, xStart, sampleY, width, sampleH, 0);
  const qH = assessBarcodeQuality(waveH);

  // 2. Vertical sample: down height, sampled at center X
  const sampleX = Math.floor(xStart + width * 0.40);
  const sampleW = Math.max(12, Math.floor(width * 0.20));
  const waveV = extract1DVerticalWaveform(canvas, sampleX, yStart, sampleW, height, 0);
  const qV = assessBarcodeQuality(waveV);

  // Usable ONLY if genuine barcode characteristics are observed in horizontal or vertical orientation
  const isUsable = qH.isUsable || qV.isUsable;

  // Determine hint: default when pointing at an empty room is 'Position barcode inside guide'
  let hint = 'Position barcode inside guide';
  if (isUsable) {
    hint = 'Reading barcode...';
  } else if (qH.contrast < 15 && qV.contrast < 15) {
    hint = 'Move closer / ensure good lighting';
  } else if ((qH.transitions >= 16 && qH.sharpness < 1.5) || (qV.transitions >= 16 && qV.sharpness < 1.5)) {
    hint = 'Hold card steady to focus';
  } else {
    hint = 'Position barcode inside guide';
  }

  return {
    isUsable,
    hint,
    checkHorizontal: qH.contrast >= 14 && qH.transitions >= 12,
    checkVertical: qV.contrast >= 14 && qV.transitions >= 12,
    qualityH: qH,
    qualityV: qV,
  };
}

/**
 * 1D High-Frequency Laplacian Sharpening / Deblurring Filter
 * Enhances narrow 1-module bars and spaces blurred by webcam focus/diffraction.
 */
export function sharpenWaveform1D(waveform, alpha = 0.8) {
  const len = waveform.length;
  const out = new Float32Array(len);
  out[0] = waveform[0];
  out[len - 1] = waveform[len - 1];

  for (let i = 1; i < len - 1; i++) {
    // Laplacian: d^2/dx^2 = f(x-1) - 2f(x) + f(x+1)
    // Sharpened: f_sharp(x) = f(x) - alpha * Laplacian
    const lap = waveform[i - 1] - 2 * waveform[i] + waveform[i + 1];
    let val = waveform[i] - alpha * lap;
    if (val < 0) val = 0;
    if (val > 255) val = 255;
    out[i] = val;
  }
  return out;
}

/**
 * Subpixel Edge Detection on 1D Waveform
 * Computes first derivative D(x) = f(x+1) - f(x-1).
 * Finds local extrema of |D(x)| and applies quadratic interpolation to get subpixel edge positions.
 */
export function detectSubpixelEdges(waveform, minContrast = 15) {
  const len = waveform.length;
  if (len < 10) return [];

  // Compute first derivative: D(x) = f(x+1) - f(x-1)
  const grad = new Float32Array(len);
  for (let i = 1; i < len - 1; i++) {
    grad[i] = waveform[i + 1] - waveform[i - 1];
  }

  const rawEdges = [];
  const minGradMag = Math.max(6, minContrast * 0.18);

  // Detect positive peaks (Rising: Dark -> Light) and negative troughs (Falling: Light -> Dark)
  for (let i = 1; i < len - 1; i++) {
    const g = grad[i];
    const prev = grad[i - 1];
    const next = grad[i + 1];

    if (g > minGradMag && g >= prev && g > next) {
      // Local maximum in gradient: Rising edge (Dark to Light)
      const denom = 2 * (prev - 2 * g + next);
      let delta = 0;
      if (Math.abs(denom) > 1e-4) {
        delta = (prev - next) / denom;
        if (delta < -1) delta = -1;
        if (delta > 1) delta = 1;
      }
      rawEdges.push({ pos: i + delta, isRising: true, magnitude: g });
    } else if (g < -minGradMag && g <= prev && g < next) {
      // Local minimum in gradient: Falling edge (Light to Dark)
      const denom = 2 * (prev - 2 * g + next);
      let delta = 0;
      if (Math.abs(denom) > 1e-4) {
        delta = (prev - next) / denom;
        if (delta < -1) delta = -1;
        if (delta > 1) delta = 1;
      }
      rawEdges.push({ pos: i + delta, isRising: false, magnitude: Math.abs(g) });
    }
  }

  // Sort by position along the waveform
  rawEdges.sort((a, b) => a.pos - b.pos);

  // Enforce alternating polarity (bar start -> space start -> bar start ...)
  // If noise causes two consecutive edges of the same polarity, retain the stronger one
  const cleanEdges = [];
  for (const edge of rawEdges) {
    if (cleanEdges.length === 0) {
      cleanEdges.push(edge);
    } else {
      const last = cleanEdges[cleanEdges.length - 1];
      if (last.isRising === edge.isRising) {
        if (edge.magnitude > last.magnitude) {
          cleanEdges[cleanEdges.length - 1] = edge;
        }
      } else {
        cleanEdges.push(edge);
      }
    }
  }

  return cleanEdges;
}

/**
 * Measure similarity between a measured 6-element module distribution and expected pattern.
 */
function scoreCode128Match(measured, expected) {
  let diff = 0;
  for (let i = 0; i < 6; i++) {
    diff += Math.abs(measured[i] - expected[i]);
  }
  return diff;
}

/**
 * Internal single-direction Code 128 parser.
 */
function decodeCode128RunsSingle(runs) {
  if (!runs || runs.length < 20) return null;

  // Start patterns
  const startPatterns = [
    { id: 103, type: 'A', pat: CODE128_PATTERNS[103] },
    { id: 104, type: 'B', pat: CODE128_PATTERNS[104] },
    { id: 105, type: 'C', pat: CODE128_PATTERNS[105] },
  ];

  const maxSearchIdx = Math.min(runs.length - 15, Math.floor(runs.length * 0.45));

  for (let startIdx = 0; startIdx < maxSearchIdx; startIdx++) {
    // Measure total width of 6 elements
    let charWidth = 0;
    for (let k = 0; k < 6; k++) charWidth += runs[startIdx + k];
    if (charWidth < 10) continue;

    const moduleEst = charWidth / 11;
    if (moduleEst < 0.5) continue;

    // Check module widths
    const charMods = [];
    let sumMods = 0;
    for (let k = 0; k < 6; k++) {
      const m = Math.max(1, Math.min(4, Math.round(runs[startIdx + k] / moduleEst)));
      charMods.push(m);
      sumMods += m;
    }
    if (sumMods !== 11) continue;

    // Compare with Start patterns
    let startMatch = null;
    for (const sp of startPatterns) {
      if (scoreCode128Match(charMods, sp.pat) === 0) {
        startMatch = sp;
        break;
      }
    }

    if (!startMatch) continue;

    // Start symbol found! Parse remaining characters
    let currentIdx = startIdx + 6;
    let codeSet = startMatch.type;
    const symbolValues = [startMatch.id];
    let decodedChars = '';
    let foundStop = false;

    while (currentIdx + 6 <= runs.length) {
      // Check for Stop pattern (7 elements: [2, 3, 3, 1, 1, 1, 2], 13 modules)
      if (currentIdx + 7 <= runs.length) {
        let stopWidth = 0;
        for (let k = 0; k < 7; k++) stopWidth += runs[currentIdx + k];
        const stopModuleEst = stopWidth / 13;
        const stopMods = [];
        let stopSum = 0;
        for (let k = 0; k < 7; k++) {
          const m = Math.max(1, Math.min(4, Math.round(runs[currentIdx + k] / stopModuleEst)));
          stopMods.push(m);
          stopSum += m;
        }
        if (stopSum === 13) {
          let diffStop = 0;
          for (let k = 0; k < 7; k++) diffStop += Math.abs(stopMods[k] - CODE128_PATTERNS[106][k]);
          if (diffStop === 0) {
            foundStop = true;
            break;
          }
        }
      }

      // Normal character: 6 elements
      let cw = 0;
      for (let k = 0; k < 6; k++) cw += runs[currentIdx + k];
      const mEst = cw / 11;
      const mods = [];
      let mSum = 0;
      for (let k = 0; k < 6; k++) {
        const m = Math.max(1, Math.min(4, Math.round(runs[currentIdx + k] / mEst)));
        mods.push(m);
        mSum += m;
      }

      // Look up in pattern table
      let bestSym = -1;
      let bestScore = 999;
      for (let s = 0; s < 106; s++) {
        const score = scoreCode128Match(mods, CODE128_PATTERNS[s]);
        if (score < bestScore) {
          bestScore = score;
          bestSym = s;
        }
      }

      // Tolerance: allow at most 1 module deviation if sum is 11
      if (bestScore <= 1 && bestSym >= 0 && bestSym < 106) {
        symbolValues.push(bestSym);

        // Character interpretation based on Code Set
        if (codeSet === 'B') {
          if (bestSym >= 0 && bestSym <= 95) {
            decodedChars += String.fromCharCode(bestSym + 32);
          } else if (bestSym === 99) {
            codeSet = 'C';
          } else if (bestSym === 101) {
            codeSet = 'A';
          }
        } else if (codeSet === 'C') {
          if (bestSym >= 0 && bestSym <= 99) {
            decodedChars += (bestSym < 10 ? '0' : '') + bestSym;
          } else if (bestSym === 100) {
            codeSet = 'B';
          } else if (bestSym === 101) {
            codeSet = 'A';
          }
        } else if (codeSet === 'A') {
          if (bestSym >= 0 && bestSym <= 63) {
            decodedChars += String.fromCharCode(bestSym + 32);
          } else if (bestSym >= 64 && bestSym <= 95) {
            decodedChars += String.fromCharCode(bestSym - 64);
          } else if (bestSym === 100) {
            codeSet = 'B';
          } else if (bestSym === 99) {
            codeSet = 'C';
          }
        }
      } else {
        // Can't identify character
        break;
      }

      currentIdx += 6;
    }

    // Must have at least 1 data char + 1 checksum char and found Stop symbol
    if (foundStop && symbolValues.length >= 3) {
      // Checksum validation: Checksum = (Start + sum(i * Char_i)) % 103
      const checksumChar = symbolValues[symbolValues.length - 1];
      let calcSum = symbolValues[0];
      for (let i = 1; i < symbolValues.length - 1; i++) {
        calcSum += i * symbolValues[i];
      }
      const expectedChecksum = calcSum % 103;

      if (expectedChecksum === checksumChar) {
        let cleanText = decodedChars;
        if (codeSet === 'C' && cleanText.length >= 2) {
          cleanText = cleanText.slice(0, -2);
        } else if (cleanText.length >= 1) {
          cleanText = cleanText.slice(0, -1);
        }

        return {
          success: true,
          rawValue: cleanText,
          text: cleanText,
          symbology: 'CODE_128',
          format: 'CODE_128',
          engine: '1D Waveform Deblurring Engine',
          confidence: 1.0,
        };
      }
    }
  }

  return null;
}

/**
 * Decode Code 128 from alternating bar/space run-lengths.
 * Tests both forward runs and reversed runs for 180° upside-down tolerance.
 */
export function decodeCode128Runs(runs) {
  if (!runs || runs.length < 20) return null;
  const forward = decodeCode128RunsSingle(runs);
  if (forward && forward.success) return forward;

  const reversed = decodeCode128RunsSingle([...runs].reverse());
  if (reversed && reversed.success) return reversed;

  return null;
}

/**
 * Internal single-direction Code 39 parser.
 */
function decodeCode39RunsSingle(runs) {
  if (!runs || runs.length < 29) return null;

  const maxSearchIdx = Math.min(runs.length - 28, Math.floor(runs.length * 0.45));

  for (let startIdx = 0; startIdx < maxSearchIdx; startIdx++) {
    const charRuns = runs.slice(startIdx, startIdx + 9);
    if (charRuns.length < 9) continue;

    const sorted = [...charRuns].sort((a, b) => a - b);
    const narrowEst = (sorted[0] + sorted[1] + sorted[2]) / 3;
    const wideEst = (sorted[6] + sorted[7] + sorted[8]) / 3;

    if (narrowEst < 0.5 || wideEst / narrowEst < 1.6) continue;
    const threshold = (narrowEst + wideEst) / 2;

    let binaryPat = '';
    for (let k = 0; k < 9; k++) {
      binaryPat += charRuns[k] > threshold ? '1' : '0';
    }

    if (CODE39_REVERSE[binaryPat] !== '*') continue;

    // Start delimiter '*' found!
    let currentIdx = startIdx + 9 + 1; // +1 for inter-character gap
    let decodedText = '';
    let foundStop = false;

    while (currentIdx + 9 <= runs.length) {
      const cRuns = runs.slice(currentIdx, currentIdx + 9);
      const cSorted = [...cRuns].sort((a, b) => a - b);
      const cNarrow = (cSorted[0] + cSorted[1] + cSorted[2]) / 3;
      const cWide = (cSorted[6] + cSorted[7] + cSorted[8]) / 3;

      if (cNarrow < 0.5 || cWide / cNarrow < 1.6) break;
      const cThresh = (cNarrow + cWide) / 2;

      let pat = '';
      let wideCount = 0;
      for (let k = 0; k < 9; k++) {
        const isWide = cRuns[k] > cThresh;
        pat += isWide ? '1' : '0';
        if (isWide) wideCount++;
      }

      if (wideCount !== 3) break;

      const ch = CODE39_REVERSE[pat];
      if (!ch) break;

      if (ch === '*') {
        foundStop = true;
        break;
      }

      decodedText += ch;
      currentIdx += 9 + 1; // 9 elements + 1 inter-character gap
    }

    if (foundStop && decodedText.length >= 3) {
      return {
        success: true,
        rawValue: decodedText,
        text: decodedText,
        symbology: 'CODE_39',
        format: 'CODE_39',
        engine: '1D Waveform Deblurring Engine',
        confidence: 0.95,
      };
    }
  }

  return null;
}

/**
 * Decode Code 39 from alternating bar/space run-lengths.
 * Tests both forward runs and reversed runs for 180° upside-down tolerance.
 */
export function decodeCode39Runs(runs) {
  if (!runs || runs.length < 29) return null;
  const forward = decodeCode39RunsSingle(runs);
  if (forward && forward.success) return forward;

  const reversed = decodeCode39RunsSingle([...runs].reverse());
  if (reversed && reversed.success) return reversed;

  return null;
}

/**
 * Helper to decode a 1D waveform array (Code 128 then Code 39).
 */
function attemptDecodeWaveform(rawWaveform, contrastHint = 15) {
  if (!rawWaveform || rawWaveform.length < 35) return null;
  const sharpened = sharpenWaveform1D(rawWaveform, 0.9);
  const edges = detectSubpixelEdges(sharpened, Math.max(8, contrastHint));
  if (edges.length < 18) return null;

  const runs = [];
  for (let i = 0; i < edges.length - 1; i++) {
    runs.push(edges[i + 1].pos - edges[i].pos);
  }

  const res128 = decodeCode128Runs(runs);
  if (res128 && res128.success && res128.rawValue) {
    return res128;
  }

  const res39 = decodeCode39Runs(runs);
  if (res39 && res39.success && res39.rawValue) {
    return res39;
  }

  return null;
}

/**
 * Sweep horizontal scanlines across vertical bands and tilt angles.
 */
function decodeWaveformHorizontalSweep(canvas, angles = [0, -3, 3, -5, 5]) {
  if (!canvas || canvas.width < 35 || canvas.height < 12) return null;
  const w = canvas.width;
  const h = canvas.height;
  const bandHeight = Math.min(32, Math.max(10, Math.floor(h * 0.15)));
  const bandYOffsets = [
    Math.floor(h * 0.12),
    Math.floor(h * 0.25),
    Math.floor(h * 0.38),
    Math.floor(h * 0.50),
    Math.floor(h * 0.65),
    Math.floor(h * 0.78),
  ];

  for (const yOff of bandYOffsets) {
    if (yOff + bandHeight > h) continue;

    for (const angle of angles) {
      const rawWaveform = extract1DWaveform(canvas, 0, yOff, w, bandHeight, angle);
      if (!rawWaveform) continue;

      const q = assessBarcodeQuality(rawWaveform);
      if (q.contrast < 12 || q.transitions < 10) continue;

      const decoded = attemptDecodeWaveform(rawWaveform, q.contrast);
      if (decoded && decoded.success && decoded.rawValue) {
        return {
          ...decoded,
          scanAngle: angle,
          scanY: yOff,
        };
      }
    }
  }

  return null;
}

/**
 * Sweep vertical scanlines across horizontal bands and tilt angles.
 */
function decodeWaveformVerticalSweep(canvas, angles = [0, -3, 3, -5, 5]) {
  if (!canvas || canvas.width < 12 || canvas.height < 35) return null;
  const w = canvas.width;
  const h = canvas.height;
  const bandWidth = Math.min(32, Math.max(10, Math.floor(w * 0.15)));
  const bandXOffsets = [
    Math.floor(w * 0.12),
    Math.floor(w * 0.25),
    Math.floor(w * 0.38),
    Math.floor(w * 0.50),
    Math.floor(w * 0.65),
    Math.floor(w * 0.78),
  ];

  for (const xOff of bandXOffsets) {
    if (xOff + bandWidth > w) continue;

    for (const angle of angles) {
      const rawWaveform = extract1DVerticalWaveform(canvas, xOff, 0, bandWidth, h, angle);
      if (!rawWaveform) continue;

      const q = assessBarcodeQuality(rawWaveform);
      if (q.contrast < 12 || q.transitions < 10) continue;

      const decoded = attemptDecodeWaveform(rawWaveform, q.contrast);
      if (decoded && decoded.success && decoded.rawValue) {
        return {
          ...decoded,
          scanAngle: angle,
          scanX: xOff,
        };
      }
    }
  }

  return null;
}

/**
 * High-Level 1D Waveform & Deblurring Barcode Decoder.
 * Automatically tests both HORIZONTAL and VERTICAL orientations:
 * 1. Normal horizontal scanlines
 * 2. Vertical scanlines
 * 3. ROI rotated +90°
 * 4. ROI rotated -90°
 *
 * Returns the decoded value, detected symbology, and actual orientation ('HORIZONTAL' or 'VERTICAL').
 */
export async function decodeWaveform1D(canvas, roi = null) {
  if (!canvas || canvas.width < 25 || canvas.height < 25) return null;

  const fullW = canvas.width;
  const fullH = canvas.height;

  // Determine ROI coordinates (defaulting to full/generous canvas)
  const x = roi ? Math.max(0, Math.floor(roi.x * fullW)) : 0;
  const y = roi ? Math.max(0, Math.floor(roi.y * fullH)) : 0;
  const w = roi ? Math.min(fullW - x, Math.floor(roi.w * fullW)) : fullW;
  const h = roi ? Math.min(fullH - y, Math.floor(roi.h * fullH)) : fullH;

  if (w < 25 || h < 25) return null;

  // Extract ROI canvas so all passes operate uniformly on this region
  let roiCanvas = canvas;
  if (roi && (x > 0 || y > 0 || w < fullW || h < fullH)) {
    roiCanvas = cropCanvasHelper(canvas, x, y, w, h);
    if (!roiCanvas) roiCanvas = canvas;
  }

  const angles = [0, -3, 3, -5, 5];

  // 1. ATTEMPT HORIZONTAL SCANLINES (Horizontal barcode, vertical bars)
  const resH = decodeWaveformHorizontalSweep(roiCanvas, angles);
  if (resH && resH.success && resH.rawValue) {
    return {
      ...resH,
      orientation: 'HORIZONTAL',
    };
  }

  // 2. ATTEMPT VERTICAL SCANLINES (Vertical barcode, horizontal bars)
  const resV = decodeWaveformVerticalSweep(roiCanvas, angles);
  if (resV && resV.success && resV.rawValue) {
    return {
      ...resV,
      orientation: 'VERTICAL',
    };
  }

  // 3. ATTEMPT ROI ROTATED +90° (Clockwise rotation)
  try {
    const rotPlus90 = rotateCanvasHelper(roiCanvas, 90);
    if (rotPlus90) {
      const resRot90 = decodeWaveformHorizontalSweep(rotPlus90, angles);
      if (resRot90 && resRot90.success && resRot90.rawValue) {
        return {
          ...resRot90,
          orientation: 'VERTICAL',
        };
      }
    }
  } catch (e) {
    // continue
  }

  // 4. ATTEMPT ROI ROTATED -90° (Counter-clockwise rotation)
  try {
    const rotMinus90 = rotateCanvasHelper(roiCanvas, -90);
    if (rotMinus90) {
      const resRotMinus90 = decodeWaveformHorizontalSweep(rotMinus90, angles);
      if (resRotMinus90 && resRotMinus90.success && resRotMinus90.rawValue) {
        return {
          ...resRotMinus90,
          orientation: 'VERTICAL',
        };
      }
    }
  } catch (e) {
    // continue
  }

  return null;
}
