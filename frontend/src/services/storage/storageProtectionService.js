// src/services/storageProtectionService.js
// Storage Protection System & 4-Year Retention Rules Engine
//
// Guarantees:
// 1. Zero Guessing: Journey start date and academic year must be explicit.
// 2. Unverified Legacy Students: 100% immune from automatic deletion.
// 3. Storage Protection Mode (>= 95%): Pauses non-essential registrations/components,
//    while keeping lab entry/exit, returns, logins, and backups 100% operational.
// 4. Non-Destructive Retention: Requires Admin archive export & explicit manual approval.

export const STORAGE_TIERS = {
  NORMAL: 'NORMAL',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
  PROTECTION_MODE: 'PROTECTION_MODE',
};

export const STORAGE_THRESHOLDS = {
  WARNING_PCT: 80,
  CRITICAL_PCT: 90,
  PROTECTION_MODE_PCT: 95,
  DEFAULT_QUOTA_BYTES: 500 * 1024 * 1024, // 500 MB (Default Supabase Free Tier ceiling)
};

/**
 * Calculates retention duration in years based on academic year at incubation start.
 * 1st Year -> 4 Years
 * 2nd Year -> 3 Years
 * 3rd Year -> 2 Years
 * 4th Year -> 1 Year
 */
export function calculateRetentionYears(academicYearAtStart) {
  const yr = Number(academicYearAtStart);
  if (isNaN(yr) || yr < 1 || yr > 4) {
    return null;
  }
  return 5 - yr;
}

/**
 * Calculates calendar expiration date by adding retention years to start date.
 * @param {string} startDateStr - 'YYYY-MM-DD'
 * @param {number|string} academicYearAtStart - 1, 2, 3, or 4
 * @returns {string|null} - 'YYYY-MM-DD'
 */
export function calculateRetentionEndDate(startDateStr, academicYearAtStart) {
  if (!startDateStr) return null;
  const years = calculateRetentionYears(academicYearAtStart);
  if (!years) return null;

  const parts = startDateStr.split('-');
  if (parts.length < 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // 0-indexed
  const day = parseInt(parts[2], 10);

  const date = new Date(Date.UTC(year, month, day));
  if (isNaN(date.getTime())) return null;

  date.setUTCFullYear(date.getUTCFullYear() + years);
  return date.toISOString().slice(0, 10);
}

/**
 * Categorizes a student record into its exact retention status.
 *
 * Statuses:
 * - EXEMPT: Admin or substitute admin
 * - NEEDS_VERIFICATION: Missing start date or joining academic year (Immune from pruning!)
 * - ACTIVE: Currently within valid retention period
 * - EXPIRED_BLOCKED: Retention expired, BUT student has active loans or is in lab (Cannot delete!)
 * - EXPIRED_ELIGIBLE: Retention expired, clean sheet, eligible for manual Admin pruning.
 */
export function categorizeStudentRetention(student, activeTransactions = [], insideRolls = []) {
  if (!student) return { status: 'UNKNOWN', canPrune: false };

  // 1. Admins are exempt
  if (student.role === 'admin' || student.role === 'substitute_admin' || student.rollNumber === 'ADMIN' || student.rollNumber === 'SUBADMIN') {
    return {
      status: 'EXEMPT',
      canPrune: false,
      label: 'Exempt (Staff Account)',
      reason: 'Staff accounts are permanently preserved.',
    };
  }

  // 2. Unverified existing/legacy students
  if (!student.incubationStartDate || !student.academicYearAtStart) {
    return {
      status: 'NEEDS_VERIFICATION',
      canPrune: false,
      label: 'Pending Journey Verification',
      reason: 'Existing student record lacks verified incubation start date. Automatic deletion prohibited.',
      needsVerification: true,
    };
  }

  // 3. Compute retention dates
  const retentionYears = student.retentionPeriodYears || calculateRetentionYears(student.academicYearAtStart);
  const retentionEndDate = student.retentionEndDate || calculateRetentionEndDate(student.incubationStartDate, student.academicYearAtStart);

  if (!retentionEndDate) {
    return {
      status: 'NEEDS_VERIFICATION',
      canPrune: false,
      label: 'Invalid Date Config',
      reason: 'Retention dates could not be verified.',
      needsVerification: true,
    };
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const isExpired = todayStr >= retentionEndDate;

  if (!isExpired) {
    return {
      status: 'ACTIVE',
      canPrune: false,
      label: `Active (${retentionYears}y Plan)`,
      retentionYears,
      retentionEndDate,
      reason: `Retention active until ${retentionEndDate}.`,
    };
  }

  // 4. If expired, check active loans
  const cleanRoll = (student.rollNumber || '').toUpperCase();
  const studentTxns = activeTransactions.filter((t) => (t.studentRoll || '').toUpperCase() === cleanRoll);
  const hasActiveLoans = studentTxns.some((t) => {
    if (t.status === 'returned') return false;
    return (t.items || []).some((it) => (it.issuedQuantity - (it.returnedQuantity || 0)) > 0);
  });

  if (hasActiveLoans) {
    return {
      status: 'EXPIRED_BLOCKED',
      canPrune: false,
      label: 'Retention Expired (Holding Lab Items)',
      retentionYears,
      retentionEndDate,
      reason: 'Student has unreturned components on loan. Record must not be deleted.',
      blockReason: 'Active Component Loan',
    };
  }

  // 5. Check if student is currently inside lab
  const isInside = insideRolls.some((r) => (r || '').toUpperCase() === cleanRoll);
  if (isInside) {
    return {
      status: 'EXPIRED_BLOCKED',
      canPrune: false,
      label: 'Retention Expired (Currently in Lab)',
      retentionYears,
      retentionEndDate,
      reason: 'Student is currently checked into the incubation lab.',
      blockReason: 'Inside Lab',
    };
  }

  // 6. Expired and clean
  return {
    status: 'EXPIRED_ELIGIBLE',
    canPrune: true,
    label: 'Retention Expired (Eligible for Prune)',
    retentionYears,
    retentionEndDate,
    reason: `Journey retention expired on ${retentionEndDate}. No active obligations.`,
  };
}

/**
 * Computes storage tier based on used bytes and quota ceiling.
 */
export function getStorageTier(usedBytes, quotaBytes = STORAGE_THRESHOLDS.DEFAULT_QUOTA_BYTES) {
  const used = Math.max(0, Number(usedBytes) || 0);
  const quota = Math.max(1, Number(quotaBytes) || STORAGE_THRESHOLDS.DEFAULT_QUOTA_BYTES);
  const percentage = (used / quota) * 100;

  let tier = STORAGE_TIERS.NORMAL;
  if (percentage >= STORAGE_THRESHOLDS.PROTECTION_MODE_PCT) {
    tier = STORAGE_TIERS.PROTECTION_MODE;
  } else if (percentage >= STORAGE_THRESHOLDS.CRITICAL_PCT) {
    tier = STORAGE_TIERS.CRITICAL;
  } else if (percentage >= STORAGE_THRESHOLDS.WARNING_PCT) {
    tier = STORAGE_TIERS.WARNING;
  }

  return {
    tier,
    percentage: Math.min(100, Math.round(percentage * 10) / 10),
    usedBytes: used,
    quotaBytes: quota,
    isProtectionActive: tier === STORAGE_TIERS.PROTECTION_MODE,
    remainingBytes: Math.max(0, quota - used),
  };
}

/**
 * Determines whether an operation is permitted under the current storage status.
 * Non-essential writes (adding components, registering students) are paused in Protection Mode.
 * Essential operations (lab exits, returns, logins, exports) are NEVER blocked.
 */
export function validateStorageWrite(operationType, storageStatus) {
  if (!storageStatus?.isProtectionActive) {
    return { allowed: true };
  }

  const restrictedOperations = ['ADD_COMPONENT', 'REGISTER_STUDENT'];
  if (restrictedOperations.includes(operationType)) {
    return {
      allowed: false,
      message: `Storage Protection Mode is ACTIVE (Storage is at ${storageStatus.percentage}%). Adding new components and student registrations are temporarily paused to protect system integrity. Component returns, lab exits, logins, and backups remain fully functional.`,
    };
  }

  return { allowed: true };
}
