// src/utils/ocrProcessor.js
// Camera capture helper & OCR parser extracting ONLY Student Name & Roll Number
// STRICTLY NO BARCODES, NO QR CODES, NO RFID!

import { createWorker } from 'tesseract.js';

let tesseractWorker = null;

/**
 * Preprocess image on a canvas for optimal OCR accuracy on printed ID cards
 * Converts to grayscale and enhances contrast
 */
export function preprocessImageForOcr(imageSource) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  canvas.width = imageSource.videoWidth || imageSource.naturalWidth || imageSource.width;
  canvas.height = imageSource.videoHeight || imageSource.naturalHeight || imageSource.height;

  // Draw original image
  ctx.drawImage(imageSource, 0, 0, canvas.width, canvas.height);

  // Get image data for grayscale & contrast adjustment
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  // Simple contrast & thresholding
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Luminance formula
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    
    // High contrast stretch
    const contrast = 1.25;
    const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));
    const highContrast = factor * (gray - 128) + 128;
    const finalVal = Math.min(255, Math.max(0, highContrast));

    data[i] = finalVal;
    data[i + 1] = finalVal;
    data[i + 2] = finalVal;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Clean and parse raw OCR text to extract strictly:
 * 1. Roll Number
 * 2. Student Name
 */
export function extractStudentDetailsFromText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return { rollNumber: '', studentName: '', rawText: '' };
  }

  const lines = rawText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let detectedRoll = '';
  let detectedName = '';

  // Common header/noise terms on college ID cards to ignore
  const noiseTerms = [
    'COLLEGE', 'INSTITUTE', 'UNIVERSITY', 'TECHNOLOGY', 'ENGINEERING',
    'STUDENT', 'IDENTITY', 'CARD', 'ID CARD', 'CAMPUS', 'DEPARTMENT',
    'ACADEMIC', 'YEAR', 'VALID', 'UPTO', 'SIGNATURE', 'PRINCIPAL',
    'DIRECTOR', 'BLOOD GROUP', 'DOB', 'DATE OF BIRTH', 'PHONE', 'MOBILE',
    'ADDRESS', 'AUTONOMOUS', 'AFFILIATED', 'NAAC', 'NBA', 'GOVT'
  ];

  // 1. ROLL NUMBER PARSING
  // Look for label patterns first: "Roll No:", "Reg No:", "ID No:", "Pin No:"
  for (const line of lines) {
    const rollLabelMatch = line.match(/(?:Roll\s*(?:No|Num|Number)?|Reg\s*(?:No|Num|Number)?|ID\s*(?:No)?|Pin\s*(?:No)?|Hall\s*Ticket|HTNO)[\s:.\-#]+([A-Za-z0-9\-_]{5,15})/i);
    if (rollLabelMatch && rollLabelMatch[1]) {
      const candidate = rollLabelMatch[1].toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (candidate.length >= 5) {
        detectedRoll = candidate;
        break;
      }
    }
  }

  // If not found by label, look for typical university alphanumeric format (e.g. 238W1A0477, 21B91A0501, 20A81A0505, etc.)
  if (!detectedRoll) {
    const collegePatternRegex = /\b([0-9]{2}[A-Z0-9]{2}[0-9A-Z][0-9A-Z]{4,5})\b/i;
    for (const line of lines) {
      const match = line.match(collegePatternRegex);
      if (match && match[1]) {
        detectedRoll = match[1].toUpperCase();
        break;
      }
    }
  }

  // Fallback: any standalone 8-12 alphanumeric token with at least 2 digits and 1 letter or pure 8-10 digits
  if (!detectedRoll) {
    for (const line of lines) {
      const words = line.split(/[\s,;:]+/);
      for (const w of words) {
        const clean = w.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        if (clean.length >= 6 && clean.length <= 14) {
          const hasDigit = /\d/.test(clean);
          const hasLetter = /[A-Z]/.test(clean);
          if (hasDigit && (hasLetter || clean.length >= 8)) {
            // Make sure it's not a common date or phone number
            if (!clean.startsWith('202') && !clean.startsWith('91') && clean.length !== 10) {
              detectedRoll = clean;
              break;
            }
          }
        }
      }
      if (detectedRoll) break;
    }
  }

  // 2. STUDENT NAME PARSING
  // Look for label patterns: "Name:", "Student Name:", "Name of Student:"
  for (const line of lines) {
    const nameLabelMatch = line.match(/(?:Student\s*Name|Name\s*of\s*Student|Name)[\s:.\-#]+([A-Za-z\s.]{3,35})/i);
    if (nameLabelMatch && nameLabelMatch[1]) {
      const candidate = cleanCandidateName(nameLabelMatch[1]);
      if (isValidName(candidate)) {
        detectedName = candidate;
        break;
      }
    }
  }

  // If no explicit label, inspect lines that do not contain noise words
  if (!detectedName) {
    for (const line of lines) {
      const upper = line.toUpperCase();
      const isNoise = noiseTerms.some((term) => upper.includes(term));
      if (isNoise) continue;
      if (detectedRoll && upper.includes(detectedRoll)) continue;

      // Check if line looks like a valid full name (letters and spaces only, 2 to 4 words)
      const cleaned = cleanCandidateName(line);
      if (isValidName(cleaned)) {
        detectedName = cleaned;
        break;
      }
    }
  }

  return {
    rollNumber: detectedRoll,
    studentName: detectedName,
    rawText,
  };
}

function cleanCandidateName(str) {
  return str
    .replace(/[^A-Za-z\s.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isValidName(name) {
  if (!name || name.length < 3 || name.length > 40) return false;
  const words = name.split(' ').filter((w) => w.length > 1);
  if (words.length < 1) return false;
  // Should not be numeric or punctuation
  return /^[A-Za-z\s.]+$/.test(name);
}

/**
 * Initialize / obtain Tesseract Worker instance
 */
async function getWorker(onProgress) {
  if (!tesseractWorker) {
    tesseractWorker = await createWorker('eng', 1, {
      logger: (m) => {
        if (onProgress && m.status === 'recognizing text' && m.progress !== undefined) {
          onProgress(Math.round(m.progress * 100));
        }
      },
    });
  }
  return tesseractWorker;
}

/**
 * Perform OCR on an image (canvas or image element or blob URL)
 */
export async function performOcrOnImage(imageSource, onProgress) {
  try {
    const worker = await getWorker(onProgress);
    const { data } = await worker.recognize(imageSource);
    const parsed = extractStudentDetailsFromText(data.text);
    return {
      ...parsed,
      confidence: data.confidence,
    };
  } catch (error) {
    console.error('Tesseract OCR error:', error);
    throw error;
  }
}
