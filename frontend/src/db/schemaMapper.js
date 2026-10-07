// src/db/schemaMapper.js
// Bidirectional Schema Adapter: Supabase PostgreSQL (snake_case) <-> React UI (camelCase)
// Guarantees zero breakage for existing components while writing standard SQL columns to Supabase.

export function toDbRow(table, obj) {
  if (!obj || typeof obj !== 'object') return obj;

  const row = { ...obj };

  // Common conversions
  if (row.createdAt !== undefined) {
    row.created_at = row.createdAt;
    delete row.createdAt;
  }
  if (row.updatedAt !== undefined) {
    row.updated_at = row.updatedAt;
    delete row.updatedAt;
  }

  switch (table) {
    case 'users':
      if (row.rollNumber !== undefined) { row.roll_number = row.rollNumber; delete row.rollNumber; }
      if (row.mobileNumber !== undefined) { row.mobile_number = row.mobileNumber; delete row.mobileNumber; }
      if (row.passwordHash !== undefined) { row.password_hash = row.passwordHash; delete row.passwordHash; }
      if (row.fingerprintIds !== undefined) { row.fingerprint_ids = row.fingerprintIds; delete row.fingerprintIds; }
      if (row.fingerLabels !== undefined) { row.finger_labels = row.fingerLabels; delete row.fingerLabels; }
      if (row.faceRegistered !== undefined) { row.face_registered = row.faceRegistered; delete row.faceRegistered; }
      if (row.facePhotoUrl !== undefined) { row.face_photo_url = row.facePhotoUrl; delete row.facePhotoUrl; }
      if (row.authId !== undefined) { row.auth_id = row.authId; delete row.authId; }
      if (row.incubationStartDate !== undefined) { row.incubation_start_date = row.incubationStartDate; delete row.incubationStartDate; }
      if (row.academicYearAtStart !== undefined) { row.academic_year_at_start = row.academicYearAtStart !== null ? Number(row.academicYearAtStart) : null; delete row.academicYearAtStart; }
      if (row.retentionPeriodYears !== undefined) { row.retention_period_years = row.retentionPeriodYears !== null ? Number(row.retentionPeriodYears) : null; delete row.retentionPeriodYears; }
      if (row.retentionEndDate !== undefined) { row.retention_end_date = row.retentionEndDate; delete row.retentionEndDate; }
      if (row.idCardValidityYear !== undefined) { row.id_card_validity_year = row.idCardValidityYear !== null ? Number(row.idCardValidityYear) : null; delete row.idCardValidityYear; }
      if (row.branch !== undefined) { row.branch = row.branch; }
      if (row.section !== undefined) { row.section = row.section; }
      if (row.academicYear !== undefined) { row.academic_year = Number(row.academicYear); delete row.academicYear; }
      if (row.avatarTheme !== undefined) { row.avatar_theme = row.avatarTheme; delete row.avatarTheme; }
      if (row.idCardScannedAt !== undefined) { row.id_card_scanned_at = row.idCardScannedAt; delete row.idCardScannedAt; }
      break;

    case 'components':
      if (row.trackingMode !== undefined) { row.tracking_mode = row.trackingMode; delete row.trackingMode; }
      if (row.totalQuantity !== undefined) { row.total_quantity = Number(row.totalQuantity); delete row.totalQuantity; }
      if (row.availableQuantity !== undefined) { row.available_quantity = Number(row.availableQuantity); delete row.availableQuantity; }
      if (row.issuedQuantity !== undefined) { row.issued_quantity = Number(row.issuedQuantity); delete row.issuedQuantity; }
      if (row.damagedQuantity !== undefined) { row.damaged_quantity = Number(row.damagedQuantity); delete row.damagedQuantity; }
      if (row.lostQuantity !== undefined) { row.lost_quantity = Number(row.lostQuantity); delete row.lostQuantity; }
      if (row.lowStockThreshold !== undefined) { row.low_stock_threshold = Number(row.lowStockThreshold); delete row.lowStockThreshold; }
      if (row.defaultOverdueDays !== undefined) { row.default_overdue_days = Number(row.defaultOverdueDays); delete row.defaultOverdueDays; }
      if (row.componentNumber !== undefined) { row.component_number = row.componentNumber; delete row.componentNumber; }
      if (row.parentCategory !== undefined) { row.parent_category = row.parentCategory; delete row.parentCategory; }
      if (row.locationDetails !== undefined) { row.location_details = row.locationDetails; delete row.locationDetails; }
      break;

    case 'projects':
      if (row.teamId !== undefined) { row.team_id = row.teamId; delete row.teamId; }
      if (row.leaderRoll !== undefined) { row.leader_roll = row.leaderRoll; delete row.leaderRoll; }
      if (row.githubLink !== undefined) { row.github_link = row.githubLink; delete row.githubLink; }
      if (row.linkedinLink !== undefined) { row.linkedin_link = row.linkedinLink; delete row.linkedinLink; }
      if (row.prototypeAvailable !== undefined) { row.prototype_available = Boolean(row.prototypeAvailable); delete row.prototypeAvailable; }
      if (row.titleChangeRequest !== undefined) { row.title_change_request = row.titleChangeRequest; delete row.titleChangeRequest; }
      break;

    case 'teams':
      if (row.leaderRoll !== undefined) { row.leader_roll = row.leaderRoll; delete row.leaderRoll; }
      if (row.memberRolls !== undefined) { row.member_rolls = row.memberRolls; delete row.memberRolls; }
      if (row.projectId !== undefined) { row.project_id = row.projectId; delete row.projectId; }
      break;

    case 'achievements':
      if (row.awardedToRoll !== undefined) { row.awarded_to_roll = row.awardedToRoll; delete row.awardedToRoll; }
      if (row.studentName !== undefined) { row.student_name = row.studentName; delete row.studentName; }
      if (row.prizeMoney !== undefined) { row.prize_money = Number(row.prizeMoney); delete row.prizeMoney; }
      if (row.awardedBy !== undefined) { row.awarded_by = row.awardedBy; delete row.awardedBy; }
      if (row.dateAwarded !== undefined) { row.date_awarded = row.dateAwarded; delete row.dateAwarded; }
      if (row.isPermanent !== undefined) { row.is_permanent = Boolean(row.isPermanent); delete row.isPermanent; }
      break;

    case 'announcements':
      if (row.expiresAt !== undefined) { row.expires_at = row.expiresAt; delete row.expiresAt; }
      if (row.createdBy !== undefined) { row.created_by = row.createdBy; delete row.createdBy; }
      break;

    case 'events':
      if (row.eventDate !== undefined) { row.event_date = row.eventDate; delete row.eventDate; }
      if (row.isInnovationDay !== undefined) { row.is_innovation_day = Boolean(row.isInnovationDay); delete row.isInnovationDay; }
      break;

    case 'complaints':
      if (row.itemName !== undefined) { row.item_name = row.itemName; delete row.itemName; }
      if (row.reportedByRoll !== undefined) { row.reported_by_roll = row.reportedByRoll; delete row.reportedByRoll; }
      if (row.reportedByName !== undefined) { row.reported_by_name = row.reportedByName; delete row.reportedByName; }
      if (row.adminNotes !== undefined) { row.admin_notes = row.adminNotes; delete row.adminNotes; }
      if (row.resolvedAt !== undefined) { row.resolved_at = row.resolvedAt; delete row.resolvedAt; }
      break;

    case 'research_papers':
      if (row.studentRoll !== undefined) { row.student_roll = row.studentRoll; delete row.studentRoll; }
      if (row.teamName !== undefined) { row.team_name = row.teamName; delete row.teamName; }
      if (row.paperType !== undefined) { row.paper_type = row.paperType; delete row.paperType; }
      if (row.externalUrl !== undefined) { row.external_url = row.externalUrl; delete row.externalUrl; }
      if (row.isPublic !== undefined) { row.is_public = Boolean(row.isPublic); delete row.isPublic; }
      break;

    case 'self_reflections':
      if (row.studentRoll !== undefined) { row.student_roll = row.studentRoll; delete row.studentRoll; }
      if (row.isPrivate !== undefined) { row.is_private = Boolean(row.isPrivate); delete row.isPrivate; }
      break;

    case 'staff_presence':
      if (row.staffEmail !== undefined) { row.staff_email = row.staffEmail; delete row.staffEmail; }
      if (row.staffName !== undefined) { row.staff_name = row.staffName; delete row.staffName; }
      if (row.entryTime !== undefined) { row.entry_time = row.entryTime; delete row.entryTime; }
      if (row.exitTime !== undefined) { row.exit_time = row.exitTime; delete row.exitTime; }
      if (row.durationMinutes !== undefined) { row.duration_minutes = Number(row.durationMinutes); delete row.durationMinutes; }
      break;

    case 'devices':
      if (row.commandedState !== undefined) { row.commanded_state = row.commandedState; delete row.commandedState; }
      if (row.actualState !== undefined) { row.actual_state = row.actualState; delete row.actualState; }
      if (row.isOnline !== undefined) { row.is_online = Boolean(row.isOnline); delete row.isOnline; }
      if (row.hardwareStatus !== undefined) { row.hardware_status = row.hardwareStatus; delete row.hardwareStatus; }
      if (row.powerRatingWatts !== undefined) { row.power_rating_watts = Number(row.powerRatingWatts); delete row.powerRatingWatts; }
      if (row.dailyKwh !== undefined) { row.daily_kwh = Number(row.dailyKwh); delete row.dailyKwh; }
      if (row.weeklyKwh !== undefined) { row.weekly_kwh = Number(row.weeklyKwh); delete row.weeklyKwh; }
      if (row.monthlyKwh !== undefined) { row.monthly_kwh = Number(row.monthlyKwh); delete row.monthlyKwh; }
      if (row.yearlyKwh !== undefined) { row.yearly_kwh = Number(row.yearlyKwh); delete row.yearlyKwh; }
      if (row.lastHardwareSync !== undefined) { row.last_hardware_sync = row.lastHardwareSync; delete row.lastHardwareSync; }
      break;

    case 'visits':
      if (row.studentRoll !== undefined) { row.student_roll = row.studentRoll; delete row.studentRoll; }
      if (row.studentName !== undefined) { row.student_name = row.studentName; delete row.studentName; }
      if (row.entryTime !== undefined) { row.entry_time = row.entryTime; delete row.entryTime; }
      if (row.exitTime !== undefined) { row.exit_time = row.exitTime; delete row.exitTime; }
      if (row.durationMinutes !== undefined) { row.duration_minutes = row.durationMinutes; delete row.durationMinutes; }
      if (row.entryMethod !== undefined) { row.entry_method = row.entryMethod; delete row.entryMethod; }
      if (row.exitMethod !== undefined) { row.exit_method = row.exitMethod; delete row.exitMethod; }
      break;

    case 'transactions':
      if (row.studentRoll !== undefined) { row.student_roll = row.studentRoll; delete row.studentRoll; }
      if (row.studentName !== undefined) { row.student_name = row.studentName; delete row.studentName; }
      if (row.authorizedBy !== undefined) { row.authorized_by = row.authorizedBy; delete row.authorizedBy; }
      if (row.issueDate !== undefined) { row.issue_date = row.issueDate; delete row.issueDate; }
      if (row.overallDueDate !== undefined) { row.overall_due_date = row.overallDueDate; delete row.overallDueDate; }
      if (row.returnedDate !== undefined) { row.returned_date = row.returnedDate; delete row.returnedDate; }
      break;

    case 'authorizations':
      if (row.primaryStudentRoll !== undefined) { row.primary_student_roll = row.primaryStudentRoll; delete row.primaryStudentRoll; }
      if (row.primaryStudentName !== undefined) { row.primary_student_name = row.primaryStudentName; delete row.primaryStudentName; }
      if (row.authorizedStudentRoll !== undefined) { row.authorized_student_roll = row.authorizedStudentRoll; delete row.authorizedStudentRoll; }
      if (row.authorizedStudentName !== undefined) { row.authorized_student_name = row.authorizedStudentName; delete row.authorizedStudentName; }
      if (row.validFrom !== undefined) { row.valid_from = row.validFrom; delete row.validFrom; }
      if (row.validUntil !== undefined) { row.valid_until = row.validUntil; delete row.validUntil; }
      if (row.revokedAt !== undefined) { row.revoked_at = row.revokedAt; delete row.revokedAt; }
      break;

    case 'settings':
      if (row.incubationCenterName !== undefined) { row.incubation_center_name = row.incubationCenterName; delete row.incubationCenterName; }
      if (row.collegeName !== undefined) { row.college_name = row.collegeName; delete row.collegeName; }
      if (row.defaultRetentionDays !== undefined) { row.default_retention_days = Number(row.defaultRetentionDays); delete row.defaultRetentionDays; }
      if (row.electricityTariffPerKwh !== undefined) { row.electricity_tariff_per_kwh = Number(row.electricityTariffPerKwh); delete row.electricityTariffPerKwh; }
      if (row.emergencyFallbackActive !== undefined) { row.emergency_fallback_active = Boolean(row.emergencyFallbackActive); delete row.emergencyFallbackActive; }
      if (row.esp32Endpoint !== undefined) { row.esp32_endpoint = row.esp32Endpoint; delete row.esp32Endpoint; }
      break;

    case 'audit_logs':
      if (row.actorName !== undefined) { row.actor_name = row.actorName; delete row.actorName; }
      if (row.actorRole !== undefined) { row.actor_role = row.actorRole; delete row.actorRole; }
      if (row.targetRoll !== undefined) { row.target_roll = row.targetRoll; delete row.targetRoll; }
      if (row.targetComponentId !== undefined) { row.target_component_id = row.targetComponentId; delete row.targetComponentId; }
      if (row.previousValue !== undefined) { row.previous_value = row.previousValue; delete row.previousValue; }
      if (row.newValue !== undefined) { row.new_value = row.newValue; delete row.newValue; }
      break;
  }

  return row;
}

export function fromDbRow(table, row) {
  if (!row || typeof row !== 'object') return row;

  const obj = { ...row };

  // Common conversions
  if (obj.created_at !== undefined) {
    obj.createdAt = obj.created_at;
  }
  if (obj.updated_at !== undefined) {
    obj.updatedAt = obj.updated_at;
  }

  switch (table) {
    case 'users':
      if (obj.roll_number !== undefined) obj.rollNumber = obj.roll_number;
      if (obj.mobile_number !== undefined) obj.mobileNumber = obj.mobile_number;
      if (obj.password_hash !== undefined) obj.passwordHash = obj.password_hash;
      if (obj.fingerprint_ids !== undefined) obj.fingerprintIds = obj.fingerprint_ids || [];
      if (obj.finger_labels !== undefined) obj.fingerLabels = obj.finger_labels || ['Right Thumb', 'Right Index', 'Left Index'];
      if (obj.face_registered !== undefined) obj.faceRegistered = Boolean(obj.face_registered);
      if (obj.face_photo_url !== undefined) obj.facePhotoUrl = obj.face_photo_url;
      if (obj.auth_id !== undefined) obj.authId = obj.auth_id;
      if (obj.incubation_start_date !== undefined) obj.incubationStartDate = obj.incubation_start_date;
      if (obj.academic_year_at_start !== undefined) obj.academicYearAtStart = obj.academic_year_at_start;
      if (obj.retention_period_years !== undefined) obj.retentionPeriodYears = obj.retention_period_years;
      if (obj.retention_end_date !== undefined) obj.retentionEndDate = obj.retention_end_date;
      if (obj.id_card_validity_year !== undefined) obj.idCardValidityYear = obj.id_card_validity_year !== null ? Number(obj.id_card_validity_year) : null;
      if (obj.branch !== undefined) obj.branch = obj.branch;
      if (obj.section !== undefined) obj.section = obj.section;
      if (obj.academic_year !== undefined) obj.academicYear = Number(obj.academic_year);
      if (obj.avatar_theme !== undefined) obj.avatarTheme = obj.avatar_theme;
      if (obj.id_card_scanned_at !== undefined) obj.idCardScannedAt = obj.id_card_scanned_at;
      break;

    case 'components':
      if (obj.tracking_mode !== undefined) obj.trackingMode = obj.tracking_mode;
      if (obj.total_quantity !== undefined) obj.totalQuantity = Number(obj.total_quantity) || 0;
      if (obj.available_quantity !== undefined) obj.availableQuantity = Number(obj.available_quantity) || 0;
      if (obj.issued_quantity !== undefined) obj.issuedQuantity = Number(obj.issued_quantity) || 0;
      if (obj.damaged_quantity !== undefined) obj.damagedQuantity = Number(obj.damaged_quantity) || 0;
      if (obj.lost_quantity !== undefined) obj.lostQuantity = Number(obj.lost_quantity) || 0;
      if (obj.low_stock_threshold !== undefined) obj.lowStockThreshold = Number(obj.low_stock_threshold) || 3;
      if (obj.default_overdue_days !== undefined) obj.defaultOverdueDays = Number(obj.default_overdue_days) || 7;
      if (obj.individual_ids !== undefined) obj.individualIds = Array.isArray(obj.individual_ids) ? obj.individual_ids : [];
      if (obj.component_number !== undefined) obj.componentNumber = obj.component_number;
      if (obj.parent_category !== undefined) obj.parentCategory = obj.parent_category;
      if (obj.location_details !== undefined) obj.locationDetails = obj.location_details;
      break;

    case 'projects':
      if (obj.team_id !== undefined) obj.teamId = obj.team_id;
      if (obj.leader_roll !== undefined) obj.leaderRoll = obj.leader_roll;
      if (obj.github_link !== undefined) obj.githubLink = obj.github_link;
      if (obj.linkedin_link !== undefined) obj.linkedinLink = obj.linkedin_link;
      if (obj.prototype_available !== undefined) obj.prototypeAvailable = Boolean(obj.prototype_available);
      if (obj.title_change_request !== undefined) obj.titleChangeRequest = obj.title_change_request;
      break;

    case 'teams':
      if (obj.leader_roll !== undefined) obj.leaderRoll = obj.leader_roll;
      if (obj.member_rolls !== undefined) obj.memberRolls = Array.isArray(obj.member_rolls) ? obj.member_rolls : [];
      if (obj.project_id !== undefined) obj.projectId = obj.project_id;
      break;

    case 'achievements':
      if (obj.awarded_to_roll !== undefined) obj.awardedToRoll = obj.awarded_to_roll;
      if (obj.student_name !== undefined) obj.studentName = obj.student_name;
      if (obj.prize_money !== undefined) obj.prizeMoney = Number(obj.prize_money) || 0;
      if (obj.awarded_by !== undefined) obj.awardedBy = obj.awarded_by;
      if (obj.date_awarded !== undefined) obj.dateAwarded = obj.date_awarded;
      if (obj.is_permanent !== undefined) obj.isPermanent = Boolean(obj.is_permanent);
      break;

    case 'announcements':
      if (obj.expires_at !== undefined) obj.expiresAt = obj.expires_at;
      if (obj.created_by !== undefined) obj.createdBy = obj.created_by;
      break;

    case 'events':
      if (obj.event_date !== undefined) obj.eventDate = obj.event_date;
      if (obj.is_innovation_day !== undefined) obj.isInnovationDay = Boolean(obj.is_innovation_day);
      break;

    case 'complaints':
      if (obj.item_name !== undefined) obj.itemName = obj.item_name;
      if (obj.reported_by_roll !== undefined) obj.reportedByRoll = obj.reported_by_roll;
      if (obj.reported_by_name !== undefined) obj.reportedByName = obj.reported_by_name;
      if (obj.admin_notes !== undefined) obj.adminNotes = obj.admin_notes;
      if (obj.resolved_at !== undefined) obj.resolvedAt = obj.resolved_at;
      break;

    case 'research_papers':
      if (obj.student_roll !== undefined) obj.studentRoll = obj.student_roll;
      if (obj.team_name !== undefined) obj.teamName = obj.team_name;
      if (obj.paper_type !== undefined) obj.paperType = obj.paper_type;
      if (obj.external_url !== undefined) obj.externalUrl = obj.external_url;
      if (obj.is_public !== undefined) obj.isPublic = Boolean(obj.is_public);
      break;

    case 'self_reflections':
      if (obj.student_roll !== undefined) obj.studentRoll = obj.student_roll;
      if (obj.is_private !== undefined) obj.isPrivate = Boolean(obj.is_private);
      break;

    case 'staff_presence':
      if (obj.staff_email !== undefined) obj.staffEmail = obj.staff_email;
      if (obj.staff_name !== undefined) obj.staffName = obj.staff_name;
      if (obj.entry_time !== undefined) obj.entryTime = obj.entry_time;
      if (obj.exit_time !== undefined) obj.exitTime = obj.exit_time;
      if (obj.duration_minutes !== undefined) obj.durationMinutes = Number(obj.duration_minutes) || 0;
      break;

    case 'devices':
      if (obj.commanded_state !== undefined) obj.commandedState = obj.commanded_state;
      if (obj.actual_state !== undefined) obj.actualState = obj.actual_state;
      if (obj.is_online !== undefined) obj.isOnline = Boolean(obj.is_online);
      if (obj.hardware_status !== undefined) obj.hardwareStatus = obj.hardware_status;
      if (obj.power_rating_watts !== undefined) obj.powerRatingWatts = Number(obj.power_rating_watts) || 0;
      if (obj.daily_kwh !== undefined) obj.dailyKwh = Number(obj.daily_kwh) || 0;
      if (obj.weekly_kwh !== undefined) obj.weeklyKwh = Number(obj.weekly_kwh) || 0;
      if (obj.monthly_kwh !== undefined) obj.monthlyKwh = Number(obj.monthly_kwh) || 0;
      if (obj.yearly_kwh !== undefined) obj.yearlyKwh = Number(obj.yearly_kwh) || 0;
      if (obj.last_hardware_sync !== undefined) obj.lastHardwareSync = obj.last_hardware_sync;
      break;

    case 'visits':
      if (obj.student_roll !== undefined) obj.studentRoll = obj.student_roll;
      if (obj.student_name !== undefined) obj.studentName = obj.student_name;
      if (obj.entry_time !== undefined) obj.entryTime = obj.entry_time;
      if (obj.exit_time !== undefined) obj.exitTime = obj.exit_time;
      if (obj.duration_minutes !== undefined) obj.durationMinutes = obj.duration_minutes;
      if (obj.entry_method !== undefined) obj.entryMethod = obj.entry_method;
      if (obj.exit_method !== undefined) obj.exitMethod = obj.exit_method;
      break;

    case 'transactions':
      if (obj.student_roll !== undefined) obj.studentRoll = obj.student_roll;
      if (obj.student_name !== undefined) obj.studentName = obj.student_name;
      if (obj.authorized_by !== undefined) obj.authorizedBy = obj.authorized_by;
      if (obj.issue_date !== undefined) obj.issueDate = obj.issue_date;
      if (obj.overall_due_date !== undefined) obj.overallDueDate = obj.overall_due_date;
      if (obj.returned_date !== undefined) obj.returnedDate = obj.returned_date;
      if (obj.items !== undefined && Array.isArray(obj.items)) obj.items = obj.items;
      break;

    case 'authorizations':
      if (obj.primary_student_roll !== undefined) obj.primaryStudentRoll = obj.primary_student_roll;
      if (obj.primary_student_name !== undefined) obj.primaryStudentName = obj.primary_student_name;
      if (obj.authorized_student_roll !== undefined) obj.authorizedStudentRoll = obj.authorized_student_roll;
      if (obj.authorized_student_name !== undefined) obj.authorizedStudentName = obj.authorized_student_name;
      if (obj.valid_from !== undefined) obj.validFrom = obj.valid_from;
      if (obj.valid_until !== undefined) obj.validUntil = obj.valid_until;
      if (obj.revoked_at !== undefined) obj.revokedAt = obj.revoked_at;
      break;

    case 'settings':
      if (obj.incubation_center_name !== undefined) obj.incubationCenterName = obj.incubation_center_name;
      if (obj.college_name !== undefined) obj.collegeName = obj.college_name;
      if (obj.default_retention_days !== undefined) obj.defaultRetentionDays = Number(obj.default_retention_days);
      if (obj.electricity_tariff_per_kwh !== undefined) obj.electricityTariffPerKwh = Number(obj.electricity_tariff_per_kwh);
      if (obj.emergency_fallback_active !== undefined) obj.emergencyFallbackActive = Boolean(obj.emergency_fallback_active);
      if (obj.esp32_endpoint !== undefined) obj.esp32Endpoint = obj.esp32_endpoint;
      break;

    case 'audit_logs':
      if (obj.actor_name !== undefined) obj.actorName = obj.actor_name;
      if (obj.actor_role !== undefined) obj.actorRole = obj.actor_role;
      if (obj.target_roll !== undefined) obj.targetRoll = obj.target_roll;
      if (obj.target_component_id !== undefined) obj.targetComponentId = obj.target_component_id;
      if (obj.previous_value !== undefined) obj.previousValue = obj.previous_value;
      if (obj.new_value !== undefined) obj.newValue = obj.new_value;
      break;
  }

  return obj;
}

export const toDb = toDbRow;
export const fromDb = fromDbRow;
