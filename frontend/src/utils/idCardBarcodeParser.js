// src/utils/idCardBarcodeParser.js
// Student ID Card Barcode Parser (Roll Number Only)
//
// In accordance with the physical college ID card specification:
// The barcode on the card encodes ONLY the student's ROLL NUMBER (e.g. "238W1A0477").
// It does NOT encode validity year, branch, name, or other details.
// All student details are retrieved strictly from the registered student database record.

/**
 * Parses raw barcode text scanned from a college ID card and extracts the student Roll Number.
 * @param {string} rawInput - Decoded raw barcode string from camera or image file
 * @returns {object} { success, rollNumber, rawText, error }
 */
export function parseStudentRollNumberFromBarcode(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') {
    return {
      success: false,
      rollNumber: null,
      rawText: rawInput || '',
      error: 'Empty or invalid barcode payload',
    };
  }

  // Clean and trim raw text
  let text = rawInput.trim().replace(/^["']|["']$/g, '');
  if (!text) {
    return {
      success: false,
      rollNumber: null,
      rawText: rawInput,
      error: 'Empty or whitespace-only barcode payload',
    };
  }

  // If input contains legacy delimiters (e.g., pipe or comma), isolate the roll number component
  if (text.includes('|')) {
    text = text.split('|')[0].trim();
  } else if (text.includes(',')) {
    text = text.split(',')[0].trim();
  } else if (text.includes(';')) {
    text = text.split(';')[0].trim();
  } else if (text.includes('=')) {
    // Key-value query: ROLL=238W1A0477
    const match = text.match(/(?:roll|id|rollnumber)[=:]([A-Za-z0-9]+)/i);
    if (match) {
      text = match[1].trim();
    }
  } else if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const json = JSON.parse(text);
      text = json.rollNumber || json.roll || json.id || json.studentId || '';
    } catch {
      // not valid JSON
    }
  }

  // Strip start/stop asterisks if present (common in Code 39 symbology)
  text = text.replace(/^\*+|\*+$/g, '');

  const cleanRoll = text.trim().toUpperCase();

  if (!cleanRoll) {
    return {
      success: false,
      rollNumber: null,
      rawText: rawInput,
      error: 'Could not extract a valid roll number from barcode',
    };
  }

  return {
    success: true,
    rollNumber: cleanRoll,
    rawText: rawInput,
  };
}

/**
 * Backward-compatible alias for existing callers.
 * Returns { success, rollNumber, rawText, error }
 */
export function parseIdCardBarcode(rawInput) {
  return parseStudentRollNumberFromBarcode(rawInput);
}
