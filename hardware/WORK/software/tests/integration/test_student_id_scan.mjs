// scratch/test_student_id_scan.mjs
// Automated verification for Student ID Card Barcode Scanning & Lab Entry System

// Mock browser globals for Node.js test environment
const mockStorage = new Map();
try {
  globalThis.localStorage = {
    getItem: (key) => mockStorage.get(key) || null,
    setItem: (key, val) => mockStorage.set(key, String(val)),
    removeItem: (key) => mockStorage.delete(key),
    clear: () => mockStorage.clear(),
  };
} catch {
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key) => mockStorage.get(key) || null,
      setItem: (key, val) => mockStorage.set(key, String(val)),
      removeItem: (key) => mockStorage.delete(key),
      clear: () => mockStorage.clear(),
    },
    writable: true,
  });
}

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

// Import parser and database from the project
import { parseStudentRollNumberFromBarcode } from '../../frontend/src/utils/idCardBarcodeParser.js';
import {
  lookupStudentByIdCardBarcode,
  processStudentBarcodeLabEntry,
  recordLabEntry,
  recordLabExit,
  getStudentsCurrentlyInside,
  getStudents,
  getStudentsRetentionAudit,
  pruneExpiredStudentRecords,
  deleteStudentEligibleRetentionData,
  getDatabaseStorageStatus,
  resetDatabaseToSample,
  getStudentActiveVisit,
} from '../../frontend/src/db/database.js';

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
  totalCount++;
  try {
    fn();
    console.log(`  [PASS] Test ${totalCount}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalCount}: ${name}`);
    console.error(`         Error: ${err.message}`);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalCount++;
  try {
    await fn();
    console.log(`  [PASS] Test ${totalCount}: ${name}`);
    passedCount++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalCount}: ${name}`);
    console.error(`         Error: ${err.message}`);
    throw err;
  }
}

console.log('=== STARTING STUDENT ID BARCODE SCAN & ATTENDANCE VERIFICATION ===\n');

// -------------------------------------------------------------
// PART 1: BARCODE PARSER (ROLL NUMBER EXTRACTION ONLY)
// -------------------------------------------------------------
console.log('--- Part 1: Barcode Parser (Roll Number Only) ---');

runTest('Extracts clean Roll Number "238W1A0477"', () => {
  const result = parseStudentRollNumberFromBarcode('238W1A0477');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.rollNumber, '238W1A0477');
});

runTest('Extracts clean Roll Number "238W1A04C2" (Physical College ID Card)', () => {
  const result = parseStudentRollNumberFromBarcode('238W1A04C2');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.rollNumber, '238W1A04C2');
});

runTest('Handles lowercase and whitespace around Roll Number', () => {
  const result = parseStudentRollNumberFromBarcode('  238w1a0477  \n');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.rollNumber, '238W1A0477');
});

runTest('Strips wrapping quotes if present', () => {
  const result = parseStudentRollNumberFromBarcode('"238W1A0477"');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.rollNumber, '238W1A0477');
});

runTest('Isolates roll number from legacy delimited string', () => {
  const result = parseStudentRollNumberFromBarcode('238W1A0477|2027|ECE');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.rollNumber, '238W1A0477');
});

runTest('Gracefully fails on empty or null barcode', () => {
  const res1 = parseStudentRollNumberFromBarcode('');
  assert.strictEqual(res1.success, false);
  assert.strictEqual(res1.rollNumber, null);

  const res2 = parseStudentRollNumberFromBarcode(null);
  assert.strictEqual(res2.success, false);
  assert.strictEqual(res2.rollNumber, null);
});

// -------------------------------------------------------------
// PART 2: DATABASE LOOKUP & LAB ENTRY / ATTENDANCE
// -------------------------------------------------------------
console.log('\n--- Part 2: Database Lookup & Lab Entry / Attendance ---');

await runAsyncTest('Reset database to clean sample state', async () => {
  await resetDatabaseToSample();
});

runTest('Lookup student currently outside "238W1A0412" (Kavya Sharma)', () => {
  const lookup = lookupStudentByIdCardBarcode('238W1A0412');
  assert.strictEqual(lookup.found, true);
  assert.strictEqual(lookup.rollNumber, '238W1A0412');
  assert.ok(lookup.student, 'Student object must be returned');
  assert.strictEqual(lookup.student.name, 'Kavya Sharma');
  assert.strictEqual(lookup.isAlreadyInside, false);
});

runTest('Lookup physical card student currently outside "238W1A04C2"', () => {
  const lookup = lookupStudentByIdCardBarcode('238W1A04C2');
  assert.strictEqual(lookup.found, true);
  assert.strictEqual(lookup.rollNumber, '238W1A04C2');
  assert.ok(lookup.student, 'Student object must be returned');
  assert.strictEqual(lookup.student.rollNumber, '238W1A04C2');
  assert.strictEqual(lookup.isAlreadyInside, false);
});

runTest('Lookup student currently inside "238W1A0477" (Anwar Bajarinti)', () => {
  const lookup = lookupStudentByIdCardBarcode('238W1A0477');
  assert.strictEqual(lookup.found, true);
  assert.strictEqual(lookup.rollNumber, '238W1A0477');
  assert.ok(lookup.student, 'Student object must be returned');
  assert.strictEqual(lookup.student.name, 'Anwar Bajarinti');
  assert.strictEqual(lookup.isAlreadyInside, true);
  assert.ok(lookup.activeVisit, 'Active visit must be identified');
});

runTest('Lookup unregistered student by barcode "249Z1A0599" fails safely', () => {
  const lookup = lookupStudentByIdCardBarcode('249Z1A0599');
  assert.strictEqual(lookup.found, false);
  assert.strictEqual(lookup.rollNumber, '249Z1A0599');
  assert.strictEqual(lookup.student, null);
  assert.ok(lookup.message.includes('Student Not Registered'));
});

await runAsyncTest('Process Lab Entry for outside student "238W1A0412"', async () => {
  const initialInsideCount = getStudentsCurrentlyInside().length;

  const result = await processStudentBarcodeLabEntry('238W1A0412');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'ENTRY_RECORDED');
  assert.strictEqual(result.alreadyInside, false);
  assert.ok(result.visit, 'A new visit record must be created');
  assert.ok(result.visit.entryTime, 'Entry timestamp must be present');

  // Verify student is now inside the lab
  const currentInside = getStudentsCurrentlyInside();
  assert.strictEqual(currentInside.length, initialInsideCount + 1);
  const insideRolls = currentInside.map((s) => s.studentRoll || s.rollNumber);
  assert.ok(insideRolls.includes('238W1A0412'));
});

await runAsyncTest('Process Lab Entry for physical card student "238W1A04C2"', async () => {
  const initialInsideCount = getStudentsCurrentlyInside().length;

  const result = await processStudentBarcodeLabEntry('238W1A04C2');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'ENTRY_RECORDED');
  assert.strictEqual(result.alreadyInside, false);
  assert.strictEqual(result.student.rollNumber, '238W1A04C2');
  assert.ok(result.visit, 'A new visit record must be created');
  assert.ok(result.visit.entryTime, 'Entry timestamp must be present');

  // Verify student is now inside the lab
  const currentInside = getStudentsCurrentlyInside();
  assert.strictEqual(currentInside.length, initialInsideCount + 1);
  const insideRolls = currentInside.map((s) => s.studentRoll || s.rollNumber);
  assert.ok(insideRolls.includes('238W1A04C2'));
});

await runAsyncTest('Prevent duplicate entry for physical card student "238W1A04C2"', async () => {
  const countBefore = getStudentsCurrentlyInside().length;

  const duplicateResult = await processStudentBarcodeLabEntry('238W1A04C2');
  assert.strictEqual(duplicateResult.success, true);
  assert.strictEqual(duplicateResult.status, 'ALREADY_INSIDE');
  assert.strictEqual(duplicateResult.alreadyInside, true);
  assert.strictEqual(duplicateResult.rollNumber, '238W1A04C2');

  const countAfter = getStudentsCurrentlyInside().length;
  assert.strictEqual(countAfter, countBefore);
});

await runAsyncTest('Prevent duplicate entry when student is already inside ("238W1A0412")', async () => {
  const countBefore = getStudentsCurrentlyInside().length;

  const duplicateResult = await processStudentBarcodeLabEntry('238W1A0412');
  assert.strictEqual(duplicateResult.success, true);
  assert.strictEqual(duplicateResult.status, 'ALREADY_INSIDE');
  assert.strictEqual(duplicateResult.alreadyInside, true);
  assert.ok(duplicateResult.visit, 'Existing active visit returned');
  assert.ok(duplicateResult.message.includes('already inside'));

  // Count inside lab must NOT increase
  const countAfter = getStudentsCurrentlyInside().length;
  assert.strictEqual(countAfter, countBefore, 'Duplicate visit must not be added to active lab');
});

await runAsyncTest('Prevent duplicate entry for student initially inside ("238W1A0477")', async () => {
  const countBefore = getStudentsCurrentlyInside().length;

  const result = await processStudentBarcodeLabEntry('238W1A0477');
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'ALREADY_INSIDE');
  assert.strictEqual(result.alreadyInside, true);
  assert.ok(result.visit, 'Existing active visit returned');

  const countAfter = getStudentsCurrentlyInside().length;
  assert.strictEqual(countAfter, countBefore, 'Count must remain the same');
});

await runAsyncTest('Process Lab Entry for unregistered student "249Z1A0599" is rejected without auto-creation', async () => {
  const initialStudentsCount = getStudents().length;

  const result = await processStudentBarcodeLabEntry('249Z1A0599');
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'NOT_REGISTERED');
  assert.strictEqual(result.student, null);
  assert.strictEqual(result.alreadyInside, false);
  assert.ok(result.message.includes('Student Not Registered'));

  // Ensure student was NOT auto-created
  const finalStudentsCount = getStudents().length;
  assert.strictEqual(finalStudentsCount, initialStudentsCount, 'Unregistered student must NOT be auto-created in the database');
});

await runAsyncTest('Existing Lab Exit functions normally for student "238W1A0412"', async () => {
  const insideBefore = getStudentsCurrentlyInside();
  assert.ok(insideBefore.some((s) => (s.studentRoll || s.rollNumber) === '238W1A0412'));

  const exitResult = await recordLabExit('238W1A0412');
  assert.ok(exitResult.visit);
  assert.ok(exitResult.visit.exitTime, 'Exit timestamp recorded');
  assert.strictEqual(exitResult.visit.status, 'completed');

  // Verify student is no longer inside
  const insideAfter = getStudentsCurrentlyInside();
  assert.ok(!insideAfter.some((s) => (s.studentRoll || s.rollNumber) === '238W1A0412'));
});

// -------------------------------------------------------------
// PART 3: RETENTION & SYSTEM INTEGRITY CHECKS
// -------------------------------------------------------------
console.log('\n--- Part 3: Retention System & Invariants Preservation ---');

runTest('4-Year Incubation Start Date retention audit is fully operational', () => {
  const audit = getStudentsRetentionAudit();
  assert.ok(audit.totalStudents > 0);
  assert.ok(Array.isArray(audit.active));
  assert.ok(Array.isArray(audit.needsVerification));
  assert.ok(Array.isArray(audit.expiredEligible));
  assert.ok(Array.isArray(audit.expiredBlocked));
});

runTest('Prune expired records requires backup confirmation archive export', async () => {
  let threw = false;
  try {
    await pruneExpiredStudentRecords(['SOME_ROLL'], false);
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('Safety Requirement'));
  }
  assert.strictEqual(threw, true, 'Must block pruning without exported archive');
});

runTest('Database storage protection status is healthy', () => {
  const status = getDatabaseStorageStatus();
  assert.ok(status.tier);
  assert.ok(status.percentage >= 0);
});

runTest('data_base_backup.js remains exactly 61,794 bytes and untouched', () => {
  const backupPath = fs.existsSync(path.resolve('frontend/src/db/data_base_backup.js'))
    ? path.resolve('frontend/src/db/data_base_backup.js')
    : path.resolve('src/db/data_base_backup.js');
  if (fs.existsSync(backupPath)) {
    const stats = fs.statSync(backupPath);
    assert.strictEqual(stats.size, 61794, 'data_base_backup.js size must be exactly 61794 bytes');
  }
});

// -------------------------------------------------------------
// PART 4: PRODUCTION REGRESSION TESTS (entryTime BUG RESOLUTION)
// -------------------------------------------------------------
console.log('\n--- Part 4: Production Flow & Regression Tests (entryTime bug prevention) ---');

await runAsyncTest('Regression Test: recordLabEntry returns a Promise resolving with valid visit and entryTime for registered student "238W1A0477"', async () => {
  resetDatabaseToSample();
  const res = await recordLabEntry('238W1A0477', 'manual');
  assert.ok(res, 'recordLabEntry result must exist');
  assert.strictEqual(res.success, true, 'recordLabEntry must succeed');
  assert.ok(res.visit, 'res.visit must not be undefined');
  assert.ok(res.visit.entryTime, 'res.visit.entryTime must not be undefined');
  
  // Verify that new Date(res.visit.entryTime).toLocaleTimeString() executes without throwing
  const entryDate = new Date(res.visit.entryTime);
  assert.ok(!isNaN(entryDate.getTime()), 'entryTime must be valid ISO date string');
  assert.strictEqual(typeof entryDate.toLocaleTimeString(), 'string', 'toLocaleTimeString must succeed');
});

await runAsyncTest('Regression Test: recordLabEntry when student is already inside returns active visit with valid entryTime and prevents duplicate entry', async () => {
  // Student 238W1A0477 is currently inside from previous test
  const res = await recordLabEntry('238W1A0477', 'manual');
  assert.ok(res, 'Result must exist');
  assert.strictEqual(res.alreadyInside, true, 'alreadyInside must be true');
  assert.ok(res.visit, 'res.visit must exist when already inside');
  assert.ok(res.visit.entryTime, 'res.visit.entryTime must exist when already inside');
  
  // Verify no error thrown when reading entryTime
  const entryDate = new Date(res.visit.entryTime);
  assert.ok(!isNaN(entryDate.getTime()), 'entryTime must be valid');
});

await runAsyncTest('Regression Test: recordLabExit returns a Promise resolving with valid durationMinutes, visit, and exit message "Thanks for visiting the lab."', async () => {
  const res = await recordLabExit('238W1A0477', 'manual');
  assert.ok(res, 'recordLabExit result must exist');
  assert.strictEqual(res.success, true, 'recordLabExit must succeed');
  assert.ok(res.visit, 'res.visit must exist');
  assert.strictEqual(typeof res.durationMinutes, 'number', 'durationMinutes must be a number');
  assert.ok(res.visit.entryTime, 'visit.entryTime must exist');
  assert.ok(res.visit.exitTime, 'visit.exitTime must exist');
  assert.strictEqual(res.message, 'Thanks for visiting the lab.', 'Exit message must specifically be "Thanks for visiting the lab."');
});

runTest('Regression Test: getStudentActiveVisit returns null for student outside', () => {
  const active = getStudentActiveVisit('238W1A0477');
  assert.strictEqual(active, null, 'Student who exited must have no active visit');
});

await runAsyncTest('Regression Test: recordLabExit throws error when student is not inside (no 30-min fabrication)', async () => {
  let threw = false;
  try {
    await recordLabExit('238W1A0477', 'manual');
  } catch (err) {
    threw = true;
    assert.ok(
      err.message.includes('not currently inside the lab'),
      `Error message should state student is not inside, got: "${err.message}"`
    );
  }
  assert.strictEqual(threw, true, 'recordLabExit must throw error when student is not inside');
});

await runAsyncTest('Regression Test: recordLabExit calculates exact duration from active visit entry time', async () => {
  // Re-enter student
  const entryRes = await recordLabEntry('238W1A0477', 'manual');
  assert.strictEqual(entryRes.success, true);
  
  const active = getStudentActiveVisit('238W1A0477');
  assert.ok(active, 'Active visit must exist for entered student');
  assert.strictEqual(active.status, 'inside');

  // Exit student
  const exitRes = await recordLabExit('238W1A0477', 'manual');
  assert.strictEqual(exitRes.success, true);
  assert.ok(exitRes.durationMinutes >= 1, 'Duration must be at least 1 minute');
  
  const entryMs = new Date(exitRes.visit.entryTime).getTime();
  const exitMs = new Date(exitRes.visit.exitTime).getTime();
  const expectedMin = Math.max(1, Math.round((exitMs - entryMs) / 60000));
  assert.strictEqual(exitRes.durationMinutes, expectedMin, 'Duration must equal actual exit - entry difference');
});

console.log(`\n======================================================`);
console.log(`ALL TESTS COMPLETED: ${passedCount}/${totalCount} PASSED`);
console.log(`======================================================\n`);
