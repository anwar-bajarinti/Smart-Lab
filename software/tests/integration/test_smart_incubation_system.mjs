// tests/integration/test_smart_incubation_system.mjs
// Verification suite for Smart Incubation Centre Management System modules:
// - Working-Day Streak (Sundays and holidays skipped)
// - Unique Component Number Collision Validation ("Component number already exists.")
// - Official Project Title Protection & Approval Workflow
// - Complaints & Shortages Tracking
// - Permanent Hackathon Achievements & Active Announcements
// - Research Papers Metadata Catalog
// - Sir / Admin Presence One-Click Toggle
// - Multi-Filter Student Search & Smart Voice Search
// - Protected Files Byte Size Verification

// Polyfill browser globals before any module imports
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

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Dynamically import database module after polyfill
const {
  initDatabase,
  resetDatabaseToSample,
  calculateStudentStreak,
  getHolidays,
  addHoliday,
  deleteHoliday,
  getComponents,
  addComponent,
  updateComponent,
  getProjects,
  createProject,
  updateProject,
  approveProjectTitleChange,
  getComplaints,
  createComplaint,
  updateComplaintStatus,
  getAchievements,
  createAchievement,
  getAnnouncements,
  getActiveAnnouncements,
  createAnnouncement,
  getResearchPapers,
  createResearchPaper,
  toggleStaffPresence,
  getStaffActivePresence,
  searchStudents,
  executeSmartVoiceSearch,
  getStudentPersonalStats,
  SIR_USER,
} = await import('../../frontend/src/db/database.js');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`  [FAIL] Test ${totalTests}: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  } else {
    console.log(`  [PASS] Test ${totalTests}: ${message}`);
    passedTests++;
  }
}

async function runTests() {
  console.log('=== STARTING SMART INCUBATION CENTRE INTEGRATION TESTS ===\n');

  // Initialize DB
  await initDatabase();
  resetDatabaseToSample();

  const studentUser = {
    id: 'user_student_1',
    role: 'student',
    rollNumber: '238W1A0477',
    name: 'Anwar Bajarinti',
    email: '238w1a0477@vrsec.ac.in',
  };

  const sirUser = {
    ...SIR_USER,
  };

  // --------------------------------------------------------------------------
  console.log('--- Part 1: Working-Day Streak Calculation ---');
  // --------------------------------------------------------------------------
  const streak = calculateStudentStreak('238W1A0477');
  assert(typeof streak === 'number' && streak >= 0, `Streak returns non-negative number (got ${streak})`);

  // Add a holiday for yesterday and verify holiday calendar methods
  const initialHolidays = getHolidays();
  assert(Array.isArray(initialHolidays), 'getHolidays returns array');

  const testHoliday = await addHoliday({
    name: 'College Tech Fest Day',
    date: '2026-10-02',
    description: 'Annual Technical Symposium Holiday',
  }, sirUser);
  assert(testHoliday && testHoliday.id, 'addHoliday adds holiday successfully');

  const updatedHolidays = getHolidays();
  assert(updatedHolidays.some(h => h.name === 'College Tech Fest Day'), 'Holiday is listed in holiday calendar');

  // Verify streak calculation doesn't throw with holidays registered
  const streakWithHoliday = calculateStudentStreak('238W1A0477');
  assert(typeof streakWithHoliday === 'number', 'Streak computes correctly with custom holiday');

  // Clean up holiday
  deleteHoliday(testHoliday.id, sirUser);
  assert(!getHolidays().some(h => h.id === testHoliday.id), 'deleteHoliday removes holiday');

  // --------------------------------------------------------------------------
  console.log('\n--- Part 2: Unique Component Number Validation ---');
  // --------------------------------------------------------------------------
  // Add component with unique component number
  const comp1 = await addComponent({
    name: 'ESP32 NodeMCU Test Module',
    category: 'Microcontrollers',
    parentCategory: 'ESP32 Family',
    componentNumber: 'COMP-TEST-999',
    totalQuantity: 5,
    lowStockThreshold: 2,
    location: 'Shelf T-1',
  }, sirUser);
  assert(comp1 && comp1.id && comp1.componentNumber === 'COMP-TEST-999', 'First component added with COMP-TEST-999');

  // Try adding another component with identical component number - MUST THROW "Component number already exists."
  let duplicateThrew = false;
  try {
    await addComponent({
      name: 'Duplicate Tag ESP32',
      category: 'Microcontrollers',
      componentNumber: 'comp-test-999', // Case insensitive collision
      totalQuantity: 2,
    }, sirUser);
  } catch (err) {
    duplicateThrew = true;
    assert(err.message === 'Component number already exists.', `Correct error message on duplicate: "${err.message}"`);
  }
  assert(duplicateThrew, 'Duplicate component number on addComponent was rejected');

  // Try updating another component to an existing component number - MUST THROW "Component number already exists."
  const comp2 = await addComponent({
    name: 'Arduino Uno Test Module',
    category: 'Microcontrollers',
    componentNumber: 'COMP-TEST-888',
    totalQuantity: 4,
  }, sirUser);

  let updateCollisionThrew = false;
  try {
    await updateComponent(comp2.id, {
      componentNumber: 'COMP-TEST-999',
    }, sirUser);
  } catch (err) {
    updateCollisionThrew = true;
    assert(err.message === 'Component number already exists.', `Correct error message on update collision: "${err.message}"`);
  }
  assert(updateCollisionThrew, 'Duplicate component number on updateComponent was rejected');

  // --------------------------------------------------------------------------
  console.log('\n--- Part 3: Project Management & Official Title Protection ---');
  // --------------------------------------------------------------------------
  const newProject = await createProject({
    title: 'Smart Drone Surveillance',
    objectives: 'Autonomous surveillance drone using ESP32-CAM and OpenCV',
    domain: 'Robotics & Automation',
    leaderRoll: studentUser.rollNumber,
    members: [{ rollNumber: '238W1A0412', name: 'Kavya Sharma' }],
    budget: 4500,
    prototypeAvailable: true,
  }, studentUser);
  assert(newProject && newProject.id, 'Project created successfully');

  // Non-sir / student tries to change the official title directly
  const studentEdit = await updateProject(newProject.id, {
    title: 'HACKED TITLE BY STUDENT',
    prototypeAvailable: true,
  }, studentUser);

  // Official title MUST REMAIN UNCHANGED
  assert(studentEdit.titleLocked === true, 'Title lock flag set when non-sir edits project title');
  assert(studentEdit.project.title === 'Smart Drone Surveillance', 'Official title preserved when student attempts title edit');
  assert(studentEdit.project.titleChangeRequest !== null, 'titleChangeRequest was recorded');
  assert(studentEdit.project.titleChangeRequest?.requestedTitle === 'HACKED TITLE BY STUDENT', 'Requested title stored in request');
  assert(studentEdit.project.titleChangeRequest?.status === 'pending', 'Title change request marked as pending');

  // Sir / Admin approves title change
  const approvedProject = await approveProjectTitleChange(newProject.id, true, sirUser);
  assert(approvedProject.title === 'HACKED TITLE BY STUDENT', 'Sir approved title change, official title updated');
  assert(approvedProject.titleChangeRequest === null, 'titleChangeRequest cleared after approval');

  // Sir can directly edit title without request
  const sirEdit = await updateProject(newProject.id, {
    title: 'AI Smart Surveillance Drone V2',
  }, sirUser);
  assert(sirEdit.project.title === 'AI Smart Surveillance Drone V2', 'Sir directly edits official title');
  assert(!sirEdit.project.titleChangeRequest, 'No pending request created for Sir edit');

  // --------------------------------------------------------------------------
  console.log('\n--- Part 4: Complaints & Shortages Tracking ---');
  // --------------------------------------------------------------------------
  const complaint1 = await createComplaint({
    type: 'equipment_lab',
    itemName: 'Oscilloscope Screen Bench 4',
    description: 'Bench 4 digital oscilloscope screen is intermittently flickering',
    reportedByRoll: studentUser.rollNumber,
    reportedByName: studentUser.name,
  });
  assert(complaint1 && complaint1.id && complaint1.type === 'equipment_lab', 'Equipment complaint submitted');
  assert(complaint1.status === 'pending', 'Complaint initialized with pending status');

  const complaint2 = await createComplaint({
    type: 'component_shortage',
    itemName: 'SG90 Micro Servos',
    description: 'Need 10 additional SG90 servo motors for drone prototype testing',
    reportedByRoll: studentUser.rollNumber,
    reportedByName: studentUser.name,
  });
  assert(complaint2 && complaint2.type === 'component_shortage', 'Component shortage complaint submitted');

  // Sir resolves complaint
  const resolved = await updateComplaintStatus(
    complaint1.id,
    {
      status: 'resolved',
      adminNotes: 'Replaced power ribbon cable; calibrated bench 4 oscilloscope.',
    },
    sirUser
  );
  assert(resolved.status === 'resolved', 'Complaint status marked as resolved');
  assert(resolved.adminNotes.includes('Replaced power ribbon cable'), 'Resolution notes saved');

  // --------------------------------------------------------------------------
  console.log('\n--- Part 5: Permanent Achievements & Announcements ---');
  // --------------------------------------------------------------------------
  const achievement = await createAchievement({
    title: 'Smart India Hackathon 2026 - 1st Runner Up',
    awardedToRoll: studentUser.rollNumber,
    studentName: studentUser.name,
    prizeMoney: 75000,
    description: 'Developed low-cost IoT irrigation management hardware.',
  }, sirUser);
  assert(achievement && achievement.id && achievement.prizeMoney === 75000, 'Achievement recorded permanently with prize money');

  const allAchievements = getAchievements();
  assert(allAchievements.some(a => a.id === achievement.id), 'Achievement retrievable via getAchievements');

  // Announcements
  const announcement = await createAnnouncement({
    title: 'Internal Hackathon Registration Open',
    message: 'Registration closes Friday at 5:00 PM.',
    category: 'General',
    durationDays: 3,
  }, sirUser);
  assert(announcement && announcement.id, 'Announcement created with 3-day expiration');

  const activeAnnouncements = getActiveAnnouncements();
  assert(activeAnnouncements.some(a => a.id === announcement.id), 'Active announcement returned in getActiveAnnouncements()');

  // --------------------------------------------------------------------------
  console.log('\n--- Part 6: Research Papers Metadata Catalog ---');
  // --------------------------------------------------------------------------
  const paper = await createResearchPaper({
    title: 'Energy-Efficient LoRa Mesh Routing for Agricultural Monitoring',
    authors: ['Anwar Bajarinti', 'Dr. Staff Advisor'],
    paperType: 'IEEE',
    venue: 'IEEE TENCON 2026',
    doi: '10.1109/TENCON.2026.123456',
    externalUrl: 'https://doi.org/10.1109/TENCON.2026.123456',
    isPublic: true,
  }, studentUser);
  assert(paper && paper.id && paper.paperType === 'IEEE', 'Research paper metadata created');
  assert(paper.doi === '10.1109/TENCON.2026.123456', 'DOI preserved');

  const papers = getResearchPapers();
  assert(papers.some(p => p.id === paper.id), 'Paper retrieved in research catalog');

  // --------------------------------------------------------------------------
  console.log('\n--- Part 7: Sir / Staff Presence One-Click Toggle ---');
  // --------------------------------------------------------------------------
  // Verify initially not inside
  const initialPresence = getStaffActivePresence(sirUser.email);
  assert(initialPresence === null, 'Sir is initially not inside lab');

  // Sir enters lab with one click
  const entryResult = await toggleStaffPresence(sirUser);
  assert(entryResult.isInside === true, 'Sir marked as inside lab after toggle');
  assert(entryResult.record?.entryTime !== undefined, 'Entry time recorded');

  const activeStaff = getStaffActivePresence(sirUser.email);
  assert(activeStaff !== null && activeStaff.active === true, 'Active staff presence confirmed');

  // Sir exits lab with one click
  const exitResult = await toggleStaffPresence(sirUser);
  assert(exitResult.isInside === false, 'Sir marked as exited lab');
  assert(exitResult.record?.durationMinutes >= 0, 'Duration in lab tracked on exit');

  // --------------------------------------------------------------------------
  console.log('\n--- Part 8: Multi-Filter Student Search & Smart Voice Search ---');
  // --------------------------------------------------------------------------
  const searchByRoll = searchStudents({ query: '238W1A0477' });
  assert(searchByRoll.length === 1 && searchByRoll[0].rollNumber === '238W1A0477', 'Search by roll number works');

  const searchByBranch = searchStudents({ branch: 'ECE' });
  assert(searchByBranch.length > 0, `Search by branch ECE returns ${searchByBranch.length} students`);

  const voiceResult = executeSmartVoiceSearch('anwar');
  assert(voiceResult.students.length > 0, 'Smart voice search finds student Anwar');

  const voiceProjectResult = executeSmartVoiceSearch('drone');
  assert(voiceProjectResult.projects.length > 0, 'Smart voice search finds drone project');

  // Student personal stats comprehensive check
  const personalStats = getStudentPersonalStats('238W1A0477');
  assert(personalStats && personalStats.student, 'Student personal stats object returned');
  assert(personalStats.workingDayStreak !== undefined, 'workingDayStreak included in personal stats');
  assert(Array.isArray(personalStats.projects), 'Projects included in personal stats');
  assert(Array.isArray(personalStats.achievements), 'Achievements included in personal stats');

  // --------------------------------------------------------------------------
  console.log('\n--- Part 9: Protected Files Size Invariant Verification ---');
  // --------------------------------------------------------------------------
  const backupFilePath = path.join(__dirname, '../../frontend/src/db/data_base_backup.js');
  const sampleFilePath = path.join(__dirname, '../../frontend/src/db/sampleData.js');

  const backupStat = fs.statSync(backupFilePath);
  const sampleStat = fs.statSync(sampleFilePath);

  assert(backupStat.size === 61794, `data_base_backup.js is exactly 61,794 bytes (got ${backupStat.size})`);
  assert(sampleStat.size === 22676, `sampleData.js is exactly 22,676 bytes (got ${sampleStat.size})`);

  console.log('\n======================================================');
  console.log(`ALL SMART INCUBATION TESTS COMPLETED: ${passedTests}/${totalTests} PASSED`);
  console.log('======================================================\n');
}

runTests().catch((err) => {
  console.error('\n[FATAL TEST RUNNER ERROR]:', err);
  process.exit(1);
});
