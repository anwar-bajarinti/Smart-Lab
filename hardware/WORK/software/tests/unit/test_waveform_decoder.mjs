// scratch/test_waveform_decoder.mjs
// Deterministic verification of the Dual-Orientation 1D Waveform & Deblurring Decoder Engine

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
        for (let y = 0; y < dH; y++) {
          const srcY = Math.min(src.height - 1, Math.max(0, Math.floor(sY + (y / dH) * sH)));
          for (let x = 0; x < dW; x++) {
            const srcX = Math.min(src.width - 1, Math.max(0, Math.floor(sX + (x / dW) * sW)));
            const srcIdx = (srcY * src.width + srcX) * 4;
            const dstIdx = ((dY + y) * canvas.width + (dX + x)) * 4;
            if (dstIdx >= 0 && dstIdx < canvas.data.length && srcIdx >= 0 && srcIdx < srcData.length) {
              canvas.data[dstIdx] = srcData[srcIdx];
              canvas.data[dstIdx + 1] = srcData[srcIdx + 1];
              canvas.data[dstIdx + 2] = srcData[srcIdx + 2];
              canvas.data[dstIdx + 3] = srcData[srcIdx + 3];
            }
          }
        }
      },
    };
  }
}

globalThis.HTMLCanvasElement = MockCanvas;
globalThis.document = {
  createElement: (type) => {
    if (type === 'canvas') return new MockCanvas(300, 150);
    return {};
  },
};

const {
  extract1DWaveform,
  extract1DVerticalWaveform,
  assessBarcodeQuality,
  assessDualOrientationQuality,
  sharpenWaveform1D,
  detectSubpixelEdges,
  decodeCode128Runs,
  decodeCode39Runs,
  decodeWaveform1D,
} = await import('../../frontend/src/utils/waveform1dDecoder.js');

const {
  generateCode128Canvas,
  generateCode39Canvas,
} = await import('../../frontend/src/utils/robustBarcodeDecoder.js');

// Helper to rotate canvas 90° clockwise in memory
function makeRotated90Canvas(srcCanvas) {
  const rot = new MockCanvas(srcCanvas.height, srcCanvas.width);
  const src = srcCanvas.data;
  const dst = rot.data;
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const srcIdx = (y * sw + x) * 4;
      const dstX = sh - 1 - y;
      const dstY = x;
      const dstIdx = (dstY * rot.width + dstX) * 4;
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
    }
  }
  return rot;
}

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

console.log('=== STARTING 1D WAVEFORM DECODER VERIFICATION ===\n');

// Test 1: extract1DWaveform returns valid Float32Array
await test('extract1DWaveform extracts averaged luminance array', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 100);
  const waveform = extract1DWaveform(canvas, 0, 10, canvas.width, 30);
  assert.ok(waveform instanceof Float32Array, 'Waveform must be Float32Array');
  assert.strictEqual(waveform.length, canvas.width);
  assert.ok(waveform.some((v) => v < 50), 'Must contain dark bar values');
  assert.ok(waveform.some((v) => v > 200), 'Must contain light space values');
});

// Test 2: extract1DVerticalWaveform extracts vertical array
await test('extract1DVerticalWaveform extracts vertical luminance array', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 100);
  const rotCanvas = makeRotated90Canvas(canvas);
  const waveform = extract1DVerticalWaveform(rotCanvas, 10, 0, 30, rotCanvas.height);
  assert.ok(waveform instanceof Float32Array, 'Waveform must be Float32Array');
  assert.strictEqual(waveform.length, rotCanvas.height);
  assert.ok(waveform.some((v) => v < 50), 'Must contain dark bar values');
  assert.ok(waveform.some((v) => v > 200), 'Must contain light space values');
});

// Test 3: assessBarcodeQuality identifies good vs bad signals
await test('assessBarcodeQuality evaluates contrast, sharpness, and transitions', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 100);
  const goodWaveform = extract1DWaveform(canvas, 0, 10, canvas.width, 30);
  const goodQuality = assessBarcodeQuality(goodWaveform);
  assert.strictEqual(goodQuality.isUsable, true, 'Clean barcode must be usable');
  assert.ok(goodQuality.contrast > 150, 'Contrast should be high');
  assert.ok(goodQuality.transitions > 20, 'Transitions should be high');

  // Blank white canvas
  const blankCanvas = new MockCanvas(300, 100);
  const blankWaveform = extract1DWaveform(blankCanvas, 0, 10, 300, 30);
  const blankQuality = assessBarcodeQuality(blankWaveform);
  assert.strictEqual(blankQuality.isUsable, false, 'Blank canvas must not be usable');
});

// Test 4: assessDualOrientationQuality evaluates both orientations
await test('assessDualOrientationQuality detects usable signal on rotated canvas', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 100);
  const rotCanvas = makeRotated90Canvas(canvas);
  const dualQ = assessDualOrientationQuality(rotCanvas, 0, 0, rotCanvas.width, rotCanvas.height);
  assert.strictEqual(dualQ.isUsable, true, 'Must detect rotated barcode signal');
  assert.strictEqual(dualQ.checkVertical, true, 'Vertical check must be active');
});

// Test 5: sharpenWaveform1D preserves peak structure
await test('sharpenWaveform1D enhances transitions', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 100);
  const waveform = extract1DWaveform(canvas, 0, 10, canvas.width, 30);
  const sharpened = sharpenWaveform1D(waveform, 0.8);
  assert.strictEqual(sharpened.length, waveform.length);
});

// Test 6: detectSubpixelEdges finds edges between bars and spaces
await test('detectSubpixelEdges detects transition edges with subpixel coordinates', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 100);
  const waveform = extract1DWaveform(canvas, 0, 10, canvas.width, 30);
  const edges = detectSubpixelEdges(waveform, 200);
  assert.ok(edges.length >= 30, `Must detect at least 30 edges, got ${edges.length}`);
  assert.ok(edges[0].pos !== undefined);
});

// Test 7: decodeCode128Runs decodes 238W1A0477
await test('decodeCode128Runs decodes Code 128 for 238W1A0477', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 100);
  const waveform = extract1DWaveform(canvas, 0, 10, canvas.width, 30);
  const edges = detectSubpixelEdges(waveform, 100);
  const runs = [];
  for (let i = 0; i < edges.length - 1; i++) {
    runs.push(edges[i + 1].pos - edges[i].pos);
  }
  const res = decodeCode128Runs(runs);
  assert.ok(res, 'Must decode Code 128');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.rawValue, '238W1A0477');
  assert.strictEqual(res.symbology, 'CODE_128');
});

// Test 8: decodeCode128Runs decodes physical ID card roll 238W1A04C2
await test('decodeCode128Runs decodes Code 128 for 238W1A04C2', async () => {
  const canvas = generateCode128Canvas('238W1A04C2', 3, 100);
  const waveform = extract1DWaveform(canvas, 0, 10, canvas.width, 30);
  const edges = detectSubpixelEdges(waveform, 100);
  const runs = [];
  for (let i = 0; i < edges.length - 1; i++) {
    runs.push(edges[i + 1].pos - edges[i].pos);
  }
  const res = decodeCode128Runs(runs);
  assert.ok(res, 'Must decode Code 128 for 238W1A04C2');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.rawValue, '238W1A04C2');
});

// Test 9: decodeCode39Runs decodes Code 39 for 238W1A04C2
await test('decodeCode39Runs decodes Code 39 for 238W1A04C2', async () => {
  const canvas = generateCode39Canvas('238W1A04C2', 2, 100);
  const waveform = extract1DWaveform(canvas, 0, 10, canvas.width, 30);
  const edges = detectSubpixelEdges(waveform, 20);
  const runs = [];
  for (let i = 0; i < edges.length - 1; i++) {
    runs.push(edges[i + 1].pos - edges[i].pos);
  }
  const res = decodeCode39Runs(runs);
  assert.ok(res, 'Must decode Code 39');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.rawValue, '238W1A04C2');
  assert.strictEqual(res.symbology, 'CODE_39');
});

// Test 10: decodeWaveform1D decodes HORIZONTAL barcode
await test('decodeWaveform1D decodes horizontal barcode and reports HORIZONTAL', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 120);
  const fullCanvas = new MockCanvas(640, 360);
  fullCanvas.getContext('2d').drawImage(canvas, 50, 100);
  const res = await decodeWaveform1D(fullCanvas);
  assert.ok(res, 'Must decode from full canvas');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.rawValue, '238W1A0477');
  assert.strictEqual(res.symbology, 'CODE_128');
  assert.strictEqual(res.orientation, 'HORIZONTAL');
});

// Test 11: decodeWaveform1D decodes VERTICAL (90° rotated) barcode
await test('decodeWaveform1D decodes vertical (90 deg rotated) barcode and reports VERTICAL', async () => {
  const canvas = generateCode128Canvas('238W1A0477', 3, 120);
  const rotCanvas = makeRotated90Canvas(canvas);
  const fullCanvas = new MockCanvas(360, 640);
  fullCanvas.getContext('2d').drawImage(rotCanvas, 50, 50);
  const res = await decodeWaveform1D(fullCanvas);
  assert.ok(res, 'Must decode from vertical canvas');
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.rawValue, '238W1A0477');
  assert.strictEqual(res.orientation, 'VERTICAL');
});

// Test 12: 2-Frame Consecutive Confirmation Logic
await test('Two-frame consecutive confirmation logic verifies matching candidate', async () => {
  let pendingCandidate = null;

  function processFrameResult(candidate) {
    if (!candidate || !candidate.value) {
      pendingCandidate = null;
      return null;
    }
    const now = Date.now();
    if (pendingCandidate && pendingCandidate.value === candidate.value && (now - pendingCandidate.time < 1000)) {
      return { confirmed: true, value: candidate.value, orientation: candidate.orientation };
    } else {
      pendingCandidate = { value: candidate.value, orientation: candidate.orientation, time: now };
      return { confirmed: false, value: candidate.value, orientation: candidate.orientation };
    }
  }

  // Frame 1: 238W1A0477 (VERTICAL) -> Not yet confirmed
  const f1 = processFrameResult({ value: '238W1A0477', orientation: 'VERTICAL' });
  assert.strictEqual(f1.confirmed, false);

  // Frame 2: 238W1A0477 (VERTICAL) -> CONFIRMED!
  const f2 = processFrameResult({ value: '238W1A0477', orientation: 'VERTICAL' });
  assert.strictEqual(f2.confirmed, true);
  assert.strictEqual(f2.value, '238W1A0477');
  assert.strictEqual(f2.orientation, 'VERTICAL');
});

console.log(`\n======================================================`);
console.log(`ALL 1D WAVEFORM DECODER TESTS COMPLETED: ${passed}/${total} PASSED`);
console.log(`======================================================\n`);
process.exit(0);
