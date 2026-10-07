// scratch/test_barcode_robustness.mjs
// Deterministic verification of the Enhanced Robust Barcode Decoder pipeline

import assert from 'node:assert';

// Minimal in-memory canvas mock for Node.js
class MockCanvas {
  constructor(width = 300, height = 150) {
    this._width = Math.max(1, Math.round(width));
    this._height = Math.max(1, Math.round(height));
    this.data = new Uint8ClampedArray(this._width * this._height * 4);
    this.data.fill(255); // White by default
  }

  get width() { return this._width; }
  set width(val) {
    const newW = Math.max(1, Math.round(val));
    if (newW !== this._width) {
      this._width = newW;
      this.data = new Uint8ClampedArray(this._width * this._height * 4);
      this.data.fill(255);
    }
  }

  get height() { return this._height; }
  set height(val) {
    const newH = Math.max(1, Math.round(val));
    if (newH !== this._height) {
      this._height = newH;
      this.data = new Uint8ClampedArray(this._width * this._height * 4);
      this.data.fill(255);
    }
  }

  getContext(type) {
    if (type !== '2d') return null;
    const canvas = this;
    return {
      canvas,
      _fillStyle: '#000000',
      set fillStyle(val) { this._fillStyle = val; },
      get fillStyle() { return this._fillStyle; },
      fillRect(x, y, w, h) {
        const isWhite = this._fillStyle === '#FFFFFF' || this._fillStyle === '#fff' || this._fillStyle === 'white';
        const color = isWhite ? 255 : 0;
        const x1 = Math.max(0, Math.floor(x));
        const y1 = Math.max(0, Math.floor(y));
        const x2 = Math.min(canvas.width, Math.floor(x + w));
        const y2 = Math.min(canvas.height, Math.floor(y + h));
        for (let py = y1; py < y2; py++) {
          for (let px = x1; px < x2; px++) {
            const idx = (py * canvas.width + px) * 4;
            canvas.data[idx] = color;
            canvas.data[idx + 1] = color;
            canvas.data[idx + 2] = color;
            canvas.data[idx + 3] = 255;
          }
        }
      },
      getImageData(sx, sy, sw, sh) {
        const outData = new Uint8ClampedArray(sw * sh * 4);
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const srcIdx = ((sy + y) * canvas.width + (sx + x)) * 4;
            const dstIdx = (y * sw + x) * 4;
            if (srcIdx >= 0 && srcIdx < canvas.data.length) {
              outData[dstIdx] = canvas.data[srcIdx];
              outData[dstIdx + 1] = canvas.data[srcIdx + 1];
              outData[dstIdx + 2] = canvas.data[srcIdx + 2];
              outData[dstIdx + 3] = canvas.data[srcIdx + 3];
            }
          }
        }
        return { width: sw, height: sh, data: outData };
      },
      createImageData(w, h) {
        return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
      },
      putImageData(imgData, dx, dy) {
        const sw = imgData.width;
        const sh = imgData.height;
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const srcIdx = (y * sw + x) * 4;
            const dstIdx = ((dy + y) * canvas.width + (dx + x)) * 4;
            if (dstIdx >= 0 && dstIdx < canvas.data.length) {
              canvas.data[dstIdx] = imgData.data[srcIdx];
              canvas.data[dstIdx + 1] = imgData.data[srcIdx + 1];
              canvas.data[dstIdx + 2] = imgData.data[srcIdx + 2];
              canvas.data[dstIdx + 3] = imgData.data[srcIdx + 3];
            }
          }
        }
      },
      drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) {
        let sX = 0, sY = 0, sW = src.width, sH = src.height;
        let dX = 0, dY = 0, dW = canvas.width, dH = canvas.height;
        if (arguments.length === 3) {
          dX = sx; dY = sy; dW = src.width; dH = src.height;
        } else if (arguments.length === 5) {
          dX = sx; dY = sy; dW = sw; dH = sh;
        } else if (arguments.length === 9) {
          sX = sx; sY = sy; sW = sw; sH = sh;
          dX = dx; dY = dy; dW = dw; dH = dh;
        }

        const srcData = src.data || src.getContext('2d').getImageData(sX, sY, sW, sH).data;
        const angle = this._angle || 0;
        const tx = this._tx || 0;
        const ty = this._ty || 0;

        if (angle === 0) {
          for (let y = 0; y < dH; y++) {
            const srcY = Math.min(src.height - 1, Math.max(0, Math.floor(sY + (y / dH) * sH)));
            for (let x = 0; x < dW; x++) {
              const srcX = Math.min(src.width - 1, Math.max(0, Math.floor(sX + (x / dW) * sW)));
              const srcIdx = (srcY * src.width + srcX) * 4;
              const dstIdx = ((dY + y + ty) * canvas.width + (dX + x + tx)) * 4;
              if (dstIdx >= 0 && dstIdx < canvas.data.length && srcIdx >= 0 && srcIdx < srcData.length) {
                canvas.data[dstIdx] = srcData[srcIdx];
                canvas.data[dstIdx + 1] = srcData[srcIdx + 1];
                canvas.data[dstIdx + 2] = srcData[srcIdx + 2];
                canvas.data[dstIdx + 3] = srcData[srcIdx + 3];
              }
            }
          }
        } else {
          // Affine 2D rotation
          const cos = Math.cos(-angle);
          const sin = Math.sin(-angle);
          for (let py = 0; py < canvas.height; py++) {
            for (let px = 0; px < canvas.width; px++) {
              const rx = px - tx;
              const ry = py - ty;
              const unrotX = rx * cos - ry * sin - dX;
              const unrotY = rx * sin + ry * cos - dY;
              if (unrotX >= 0 && unrotX < sW && unrotY >= 0 && unrotY < sH) {
                const srcX = Math.min(src.width - 1, Math.floor(sX + unrotX));
                const srcY = Math.min(src.height - 1, Math.floor(sY + unrotY));
                const srcIdx = (srcY * src.width + srcX) * 4;
                const dstIdx = (py * canvas.width + px) * 4;
                if (srcIdx >= 0 && srcIdx < srcData.length && dstIdx >= 0 && dstIdx < canvas.data.length) {
                  canvas.data[dstIdx] = srcData[srcIdx];
                  canvas.data[dstIdx + 1] = srcData[srcIdx + 1];
                  canvas.data[dstIdx + 2] = srcData[srcIdx + 2];
                  canvas.data[dstIdx + 3] = srcData[srcIdx + 3];
                }
              }
            }
          }
        }
      },
      translate(tx, ty) {
        this._tx = (this._tx || 0) + tx;
        this._ty = (this._ty || 0) + ty;
      },
      rotate(rad) {
        this._angle = (this._angle || 0) + rad;
      },
    };
  }
}

// Polyfill globals for Node environment
globalThis.HTMLCanvasElement = MockCanvas;
globalThis.document = {
  createElement(tag) {
    if (tag === 'canvas') return new MockCanvas(300, 150);
    return {};
  },
};

// Import robust barcode decoder modules
import {
  generateCode128Canvas,
  generateCode39Canvas,
  decodeCanvasWithZXing,
  decodeBarcodeRobustly,
  runKnownGoodBarcodeSelfTest,
  cropCanvasROI,
  upscaleCanvas,
  applyLocalAdaptiveThreshold,
  applyContrastStretch,
  rotateCanvas,
  PRIORITY_1D_FORMATS,
} from '../../frontend/src/utils/robustBarcodeDecoder.js';

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  [PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  [FAIL] Test ${total}: ${name}`);
    console.error(`         ${err.message}`);
    throw err;
  }
}

console.log('=== STARTING ROBUST BARCODE DECODER VERIFICATION ===\n');

// Test 1: Code 128 Generation & Direct ZXing Decode for 238W1A0477
await test('Generates & decodes Code 128 for 238W1A0477', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 120);
  assert.ok(canvas.width > 100);
  const result = decodeCanvasWithZXing(canvas, PRIORITY_1D_FORMATS);
  assert.ok(result, 'ZXing should decode generated Code 128');
  assert.strictEqual(result.rawValue, '238W1A0477');
  assert.strictEqual(result.symbology, 'CODE_128');
});

// Test 2: Code 128 Generation & Direct ZXing Decode for 238W1A04C2 (Physical Card)
await test('Generates & decodes Code 128 for physical ID card roll 238W1A04C2', async () => {
  const canvas = generateCode128Canvas('238W1A04C2', 3, 120);
  const result = decodeCanvasWithZXing(canvas, PRIORITY_1D_FORMATS);
  assert.ok(result, 'ZXing should decode generated Code 128');
  assert.strictEqual(result.rawValue, '238W1A04C2');
  assert.strictEqual(result.symbology, 'CODE_128');
});

// Test 3: Code 39 Generation & Direct ZXing Decode for 238W1A04C2
await test('Generates & decodes Code 39 for 238W1A04C2', async () => {
  const canvas = generateCode39Canvas('238W1A04C2', 2, 120);
  const result = decodeCanvasWithZXing(canvas, PRIORITY_1D_FORMATS);
  assert.ok(result, 'ZXing should decode generated Code 39');
  assert.strictEqual(result.rawValue, '238W1A04C2');
  assert.strictEqual(result.symbology, 'CODE_39');
});

// Test 4: Sub-pixel 2x Upscaling preserves barcode decodability
await test('Upscales canvas 2x and successfully decodes', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 2, 80);
  const upscaled = upscaleCanvas(canvas, 2);
  assert.strictEqual(upscaled.width, canvas.width * 2);
  assert.strictEqual(upscaled.height, canvas.height * 2);
  const result = decodeCanvasWithZXing(upscaled, PRIORITY_1D_FORMATS);
  assert.ok(result, 'Upscaled canvas must decode cleanly');
  assert.strictEqual(result.rawValue, '238W1A0477');
});

// Test 5: Bradley-Roth Local Adaptive Threshold preserves barcode
await test('Bradley-Roth local adaptive threshold maintains barcode bars', async () => {
  const canvas = generateCode128Canvas('238W1A04C2', 3, 100);
  const adaptive = applyLocalAdaptiveThreshold(canvas, 26, 0.88);
  assert.strictEqual(adaptive.width, canvas.width);
  assert.strictEqual(adaptive.height, canvas.height);
  const result = decodeCanvasWithZXing(adaptive, PRIORITY_1D_FORMATS);
  assert.ok(result, 'Adaptive binarized barcode must decode');
  assert.strictEqual(result.rawValue, '238W1A04C2');
});

// Test 6: Percentile Contrast Stretch preserves barcode
await test('Percentile contrast stretch normalizes without destroying contrast', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 100);
  const contrast = applyContrastStretch(canvas);
  const result = decodeCanvasWithZXing(contrast, PRIORITY_1D_FORMATS);
  assert.ok(result, 'Contrast stretched barcode must decode');
  assert.strictEqual(result.rawValue, '238W1A0477');
});

// Test 7: Multi-ROI Extraction isolates lower-center ID card band
await test('Extracts Lower-Center ROI and decodes embedded barcode', async () => {
  // Create simulated 1080p full ID card frame (1920x1080)
  const fullFrame = new MockCanvas(1920, 1080);
  const barcodeCanvas = generateCode128Canvas('238W1A0477', 3, 120);

  // Draw barcode in the lower-center band (y: 600..720, x: 500..)
  const ctx = fullFrame.getContext('2d');
  ctx.drawImage(barcodeCanvas, 600, 650);

  // Extract Lower-Center ROI (y: 38%..90%, x: 6%..94%)
  const lowerRoi = cropCanvasROI(fullFrame, 0.06, 0.38, 0.88, 0.52);
  assert.ok(lowerRoi, 'Lower ROI must be cropped');
  assert.ok(lowerRoi.width > 500);

  const res = decodeCanvasWithZXing(lowerRoi, PRIORITY_1D_FORMATS);
  assert.ok(res, 'Barcode inside Lower-Center ROI must be detected');
  assert.strictEqual(res.rawValue, '238W1A0477');
});

// Test 8: Full decodeBarcodeRobustly multi-stage pipeline
await test('decodeBarcodeRobustly executes and returns full diagnostic metadata', async () => {
  const canvas = generateCode128Canvas('238W1A04C2', 3, 120);
  const res = await decodeBarcodeRobustly(canvas);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.rawValue, '238W1A04C2');
  assert.strictEqual(res.symbology, 'CODE_128');
  assert.ok(res.passDescription, 'Must include passDescription');
  assert.ok(Array.isArray(res.attemptLog), 'Must include attemptLog');
  assert.ok(res.elapsedMs >= 0, 'Must record elapsedMs');
});

// Test 9: runKnownGoodBarcodeSelfTest executes without crashing
await test('runKnownGoodBarcodeSelfTest runs complete suite', async () => {
  const testResults = await runKnownGoodBarcodeSelfTest();
  assert.ok(Array.isArray(testResults), 'Must return an array of test cases');
  assert.ok(testResults.length >= 4, 'Must have at least 4 tests');
  const allPassed = testResults.every((t) => t.passed);
  assert.strictEqual(allPassed, true, 'All self-tests must pass');
});

// Test 10: Micro-tilted 1D barcode decoding (3° hand tilt)
await test('decodeBarcodeRobustly decodes micro-tilted barcode at 3° tilt', async () => {
  const barcodeCanvas = generateCode128Canvas('238W1A04C2', 3, 120);
  const tilted = rotateCanvas(barcodeCanvas, 3);
  const res = await decodeBarcodeRobustly(tilted);
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.rawValue, '238W1A04C2');
});

// Test 11: Real physical card image decoding test
await test('Tests real physical card crop through 4-tier pipeline', async () => {
  const fs = await import('fs');
  const { PNG } = await import('pngjs');
  const png = PNG.sync.read(fs.readFileSync('scratch/crop_card.png'));
  const cardCanvas = new MockCanvas(png.width, png.height);
  for (let i = 0; i < png.data.length; i++) cardCanvas.data[i] = png.data[i];

  const res = await decodeBarcodeRobustly(cardCanvas);
  console.log('       [Physical Card Crop Diagnosis]');
  console.log('       - Resolution:', `${png.width}x${png.height}`);
  console.log('       - Success:', res.success);
  console.log('       - Raw Value:', res.rawValue || 'None');
  console.log('       - Symbology:', res.symbology || 'None');
  console.log('       - Engine:', res.engineUsed || 'None');
  console.log('       - Passes attempted:', res.attemptLog?.length);
  if (!res.success) {
    console.log('       - Failure stage: Barcode not detected across all 4-tier passes');
  }
});

console.log(`\n======================================================`);
console.log(`ALL DECODER ROBUSTNESS TESTS COMPLETED: ${passed}/${total} PASSED`);
console.log(`======================================================\n`);
process.exit(0);
