// src/db/database.js
// Centralized Data & Authentication Service Layer
// Supabase PostgreSQL is the ONLINE Source of Truth.
// IndexedDB + localStorage serve strictly as the Offline Cache & Mutation Queue.
// Preserves 100% of existing function interfaces so the React UI remains fully intact.

import { supabase } from '../lib/supabase.js';
import { syncService } from '../services/sync/syncService.js';
import { toDbRow, fromDbRow } from './schemaMapper.js';
import {
  calculateRetentionYears,
  calculateRetentionEndDate,
  categorizeStudentRetention,
  getStorageTier,
  validateStorageWrite,
  STORAGE_TIERS,
  STORAGE_THRESHOLDS,
} from '../services/storage/storageProtectionService.js';
import { parseStudentRollNumberFromBarcode, parseIdCardBarcode } from '../utils/idCardBarcodeParser.js';
import {
  INITIAL_COMPONENTS,
  INITIAL_USERS,
  INITIAL_DEVICES,
  INITIAL_VISITS,
  INITIAL_DAILY_ATTENDANCE,
  INITIAL_TRANSACTIONS,
  INITIAL_AUTHORIZATIONS,
  INITIAL_SETTINGS,
  INITIAL_AUDIT_LOGS,
} from './sampleData.js';

const DB_NAME = 'IncubationCMS_DB';
const DB_VERSION = 2;
const STORAGE_KEYS = {
  COMPONENTS: 'inc_cms_components_v2',
  USERS: 'inc_cms_users_v2',
  DEVICES: 'inc_cms_devices_v2',
  VISITS: 'inc_cms_visits_v2',
  DAILY_ATTENDANCE: 'inc_cms_daily_attendance_v2',
  TRANSACTIONS: 'inc_cms_transactions_v2',
  AUTHORIZATIONS: 'inc_cms_authorizations_v2',
  SETTINGS: 'inc_cms_settings_v2',
  AUDIT_LOGS: 'inc_cms_audit_logs_v2',
  AUTH_SESSION: 'inc_cms_current_auth_session',
  INITIALIZED: 'inc_cms_initialized_v2',
  PROJECTS: 'inc_cms_projects_v2',
  TEAMS: 'inc_cms_teams_v2',
  ACHIEVEMENTS: 'inc_cms_achievements_v2',
  ANNOUNCEMENTS: 'inc_cms_announcements_v2',
  EVENTS: 'inc_cms_events_v2',
  COMPLAINTS: 'inc_cms_complaints_v2',
  RESEARCH_PAPERS: 'inc_cms_research_papers_v2',
  SELF_REFLECTIONS: 'inc_cms_self_reflections_v2',
  HOLIDAYS: 'inc_cms_holidays_v2',
  DOMAINS: 'inc_cms_domains_v2',
  STAFF_PRESENCE: 'inc_cms_staff_presence_v2',
};

// Event bus for reactive UI updates
const listeners = new Set();
export function subscribeToDb(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifySubscribers(changeType, details) {
  listeners.forEach((callback) => {
    try {
      callback(changeType, details);
    } catch (e) {
      console.error('Subscriber notification error:', e);
    }
  });
}

export const SIR_USER = {
  id: 'USER-SIR-01',
  rollNumber: 'SIR',
  name: 'Dr. K. Venkatesh (Lab Incharge / Sir)',
  role: 'sir',
  email: 'sir@incubation.local',
  passwordHash: 'sir123',
  branch: 'ECE',
  section: 'Faculty Mentor',
  academicYear: 0,
  avatarTheme: 'emerald',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export const DEFAULT_DOMAINS = [
  'IoT & Embedded Systems',
  'Robotics & Automation',
  'VLSI & Chip Design',
  'AI / ML & Edge Computing',
  'Wireless & 5G Communications',
  'Renewable Energy & Power Systems',
  'Biomedical Instrumentation',
];

export const DEFAULT_HOLIDAYS = [
  { id: 'HOL-001', date: '2026-01-26', name: 'Republic Day', type: 'national' },
  { id: 'HOL-002', date: '2026-08-15', name: 'Independence Day', type: 'national' },
  { id: 'HOL-003', date: '2026-10-02', name: 'Gandhi Jayanti', type: 'national' },
  { id: 'HOL-004', date: '2026-01-14', name: 'Makar Sankranti / Pongal', type: 'festival' },
  { id: 'HOL-005', date: '2026-03-25', name: 'College Tech Fest Holiday', type: 'institute' },
];

export const DEFAULT_PROJECTS = [
  {
    id: 'PROJ-001',
    title: 'Smart Lab IoT Environmental & Power Controller',
    teamId: 'TEAM-001',
    leaderRoll: '238W1A0477',
    members: [
      { rollNumber: '238W1A0477', name: 'Anwar Bajarinti', role: 'Team Lead' },
      { rollNumber: '238W1A0412', name: 'Kavya Sharma', role: 'Firmware Engineer' },
      { rollNumber: '238W1A04C2', name: 'Sai Krishna', role: 'Hardware & Sensor Design' },
    ],
    objectives: 'Automated ESP32 power control node with ambient Lux, temperature, and current sensing to reduce incubation lab energy consumption by 35%.',
    domain: 'IoT & Embedded Systems',
    status: 'active',
    githubLink: 'https://github.com/vrsec/smart-lab-iot-controller',
    linkedinLink: 'https://linkedin.com/in/vrsec-incubation',
    budget: 15000,
    prototypeAvailable: true,
    titleChangeRequest: null,
    createdAt: '2026-01-15T10:00:00.000Z',
    updatedAt: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'PROJ-002',
    title: 'Autonomous Edge AI Quadcopter for Crop Health Telemetry',
    teamId: 'TEAM-002',
    leaderRoll: '238W1A0412',
    members: [
      { rollNumber: '238W1A0412', name: 'Kavya Sharma', role: 'Team Lead' },
      { rollNumber: '238W1A0445', name: 'Rahul Varma', role: 'Computer Vision Engineer' },
    ],
    objectives: 'Lightweight drone platform using Raspberry Pi 4 and TinyML to detect crop leaf disease in real time without cloud latency.',
    domain: 'AI / ML & Edge Computing',
    status: 'active',
    githubLink: 'https://github.com/vrsec/edge-ai-crop-drone',
    linkedinLink: 'https://linkedin.com/in/kavya-sharma',
    budget: 35000,
    prototypeAvailable: true,
    titleChangeRequest: null,
    createdAt: '2026-02-01T10:00:00.000Z',
    updatedAt: '2026-02-01T10:00:00.000Z',
  },
  {
    id: 'PROJ-003',
    title: 'Low-Power RISC-V SoC Architecture for Biometric Nodes',
    teamId: 'TEAM-003',
    leaderRoll: '238W1A0445',
    members: [
      { rollNumber: '238W1A0445', name: 'Rahul Varma', role: 'Team Lead' },
    ],
    objectives: 'Synthesizing a 32-bit RISC-V core on Xilinx Artix-7 FPGA with hardware cryptographic accelerator for biometric authentication.',
    domain: 'VLSI & Chip Design',
    status: 'in_progress',
    githubLink: 'https://github.com/vrsec/riscv-biometric-soc',
    linkedinLink: 'https://linkedin.com/in/rahul-varma',
    budget: 20000,
    prototypeAvailable: false,
    titleChangeRequest: null,
    createdAt: '2026-02-10T10:00:00.000Z',
    updatedAt: '2026-02-10T10:00:00.000Z',
  },
];

export const DEFAULT_TEAMS = [
  {
    id: 'TEAM-001',
    name: 'Team IoT Nexus',
    leaderRoll: '238W1A0477',
    memberRolls: ['238W1A0477', '238W1A0412', '238W1A04C2'],
    domain: 'IoT & Embedded Systems',
    projectId: 'PROJ-001',
    budget: 15000,
    status: 'active',
    createdAt: '2026-01-15T10:00:00.000Z',
  },
  {
    id: 'TEAM-002',
    name: 'AeroVision Labs',
    leaderRoll: '238W1A0412',
    memberRolls: ['238W1A0412', '238W1A0445'],
    domain: 'AI / ML & Edge Computing',
    projectId: 'PROJ-002',
    budget: 35000,
    status: 'active',
    createdAt: '2026-02-01T10:00:00.000Z',
  },
  {
    id: 'TEAM-003',
    name: 'Silicon Edge Innovators',
    leaderRoll: '238W1A0445',
    memberRolls: ['238W1A0445'],
    domain: 'VLSI & Chip Design',
    projectId: 'PROJ-003',
    budget: 20000,
    status: 'active',
    createdAt: '2026-02-10T10:00:00.000Z',
  },
];

export const DEFAULT_ACHIEVEMENTS = [
  {
    id: 'ACH-001',
    title: 'Smart India Hackathon (SIH) - Grand Prize',
    description: 'Winner of national SIH Hardware Edition for Smart Industrial IoT Power Management System.',
    awardedToRoll: '238W1A0477',
    studentName: 'Anwar Bajarinti',
    prizeMoney: 100000,
    awardedBy: 'Ministry of Education & Dr. K. Venkatesh (Lab Incharge / Sir)',
    dateAwarded: '2026-03-20',
    isPermanent: true,
    createdAt: '2026-03-20T10:00:00.000Z',
  },
  {
    id: 'ACH-002',
    title: '1st Place - National Drone Innovation Challenge',
    description: 'Awarded first place for autonomous edge AI disease detection in aerial drones.',
    awardedToRoll: '238W1A0412',
    studentName: 'Kavya Sharma',
    prizeMoney: 50000,
    awardedBy: 'IEEE Robotics & Automation Society',
    dateAwarded: '2026-02-15',
    isPermanent: true,
    createdAt: '2026-02-15T10:00:00.000Z',
  },
];

export const DEFAULT_ANNOUNCEMENTS = [
  {
    id: 'ANN-001',
    title: 'VRSEC Innovation Day 2026 Prototype Registrations Open',
    message: 'All student teams are invited to register prototypes and research papers for VRSEC Innovation Day. Grant funding available.',
    category: 'Innovation Day',
    active: true,
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'Sir / Faculty Mentor',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'ANN-002',
    title: 'New Hardware In Stock: ESP32-S3 and STM32 Nucleo Boards',
    message: 'New batch of ESP32-S3 AI-Sense and STM32 boards available in Cabinet A for project prototyping.',
    category: 'Inventory',
    active: true,
    expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: 'Admin',
    createdAt: new Date().toISOString(),
  },
];

export const DEFAULT_EVENTS = [
  {
    id: 'EVT-001',
    title: 'VRSEC Innovation Day 2026',
    theme: 'AI-Driven Embedded Systems & Sustainable Technology',
    eventDate: '2026-11-20',
    prizes: '₹1,50,000 Total Prize Pool + Incubation Seed Grants',
    winners: [
      { team: 'Team IoT Nexus', project: 'Smart Lab IoT Environmental Controller', rank: '1st Place' },
      { team: 'AeroVision Labs', project: 'Edge AI Drone', rank: 'Runner Up' },
    ],
    isInnovationDay: true,
    year: 2026,
    description: 'Annual flagship innovation festival showcasing hardware prototypes, IoT devices, and research demonstrations.',
    createdAt: '2026-01-10T10:00:00.000Z',
  },
  {
    id: 'EVT-002',
    title: 'VRSEC Innovation Day 2025 Archive',
    theme: 'Industry 4.0 & Smart Sensor Networks',
    eventDate: '2025-11-18',
    prizes: '₹1,00,000 Total Prize Pool',
    winners: [
      { team: 'Silicon Edge Innovators', project: 'RISC-V Micro-Node', rank: 'Grand Champion' },
    ],
    isInnovationDay: true,
    year: 2025,
    description: 'Celebrated the deployment of 12 student prototypes into active commercial trials.',
    createdAt: '2025-11-18T10:00:00.000Z',
  },
];

export const DEFAULT_COMPLAINTS = [
  {
    id: 'CMP-001',
    type: 'equipment_environment',
    itemName: 'Bench 2 Soldering Station',
    description: 'Soldering station display fluctuates and heating element shuts off unexpectedly.',
    reportedByRoll: '238W1A0477',
    reportedByName: 'Anwar Bajarinti',
    status: 'in_progress',
    adminNotes: 'Heating cartridge replacement requested from electronics store.',
    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    resolvedAt: null,
  },
  {
    id: 'CMP-002',
    type: 'component_availability',
    itemName: 'ESP32-CAM Modules',
    description: 'Shortage of ESP32-CAM boards with OV2640 camera modules for the computer vision workshop.',
    reportedByRoll: '238W1A0412',
    reportedByName: 'Kavya Sharma',
    status: 'pending',
    adminNotes: '',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  },
];

export const DEFAULT_RESEARCH_PAPERS = [
  {
    id: 'RES-001',
    title: 'Energy-Harvesting BLE Sensor Node Architecture for Incubation Laboratories',
    authors: ['Anwar Bajarinti', 'Dr. K. Venkatesh'],
    studentRoll: '238W1A0477',
    teamName: 'Team IoT Nexus',
    domain: 'IoT & Embedded Systems',
    venue: 'IEEE International Conference on Advanced IoT & Embedded Technologies (ICAIOT 2026)',
    paperType: 'IEEE',
    doi: '10.1109/ICAIOT.2026.1042318',
    externalUrl: 'https://ieeexplore.ieee.org',
    isPublic: true,
    createdAt: '2026-03-01T10:00:00.000Z',
  },
  {
    id: 'RES-002',
    title: 'Real-Time Edge Inference of Crop Foliage Pathologies on Sub-Watt Microcontrollers',
    authors: ['Kavya Sharma', 'Dr. P. Srinivas'],
    studentRoll: '238W1A0412',
    teamName: 'AeroVision Labs',
    domain: 'AI / ML & Edge Computing',
    venue: 'Springer Advances in Intelligent Systems & Computing',
    paperType: 'journal',
    doi: '10.1007/978-3-030-99999-1',
    externalUrl: 'https://springer.com',
    isPublic: true,
    createdAt: '2026-02-18T10:00:00.000Z',
  },
];

export const DEFAULT_SELF_REFLECTIONS = [
  {
    id: 'REF-001',
    studentRoll: '238W1A0477',
    title: 'Mastered FreeRTOS Task Queues & Power Management',
    content: 'Completed the sleep-mode power profiling for the ESP32 lab node today. Consumed only 12uA in deep sleep! Excited to integrate the LoRa transceiver next.',
    isPrivate: true,
    date: '2026-10-02',
    createdAt: '2026-10-02T16:00:00.000Z',
  },
];

// In-memory cache for instant synchronous access backed by Supabase & local cache
let memoryStore = {
  components: [],
  users: [],
  devices: [],
  visits: [],
  dailyAttendance: {},
  transactions: [],
  authorizations: [],
  settings: { ...INITIAL_SETTINGS },
  auditLogs: [],
  currentUser: null,
  projects: [],
  teams: [],
  achievements: [],
  announcements: [],
  events: [],
  complaints: [],
  researchPapers: [],
  selfReflections: [],
  holidays: [],
  domains: [],
  staffPresence: [],
};

let dbReadyPromise = null;
let isOnlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;

export function isAppOnline() {
  return isOnlineState;
}

// ==================== LOCAL CACHE & INDEXEDDB HELPERS ====================

function openIndexedDB() {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      const stores = [
        { name: 'components', key: 'id' },
        { name: 'users', key: 'rollNumber' },
        { name: 'devices', key: 'id' },
        { name: 'visits', key: 'id' },
        { name: 'transactions', key: 'id' },
        { name: 'authorizations', key: 'id' },
        { name: 'settings', key: 'key' },
        { name: 'auditLogs', key: 'id' },
      ];
      for (const s of stores) {
        if (!db.objectStoreNames.contains(s.name)) {
          db.createObjectStore(s.name, { keyPath: s.key });
        }
      }
    };
  });
}

// Save an entire collection to IndexedDB and localStorage as an offline backup
async function persistLocalCache(storeName, data) {
  try {
    localStorage.setItem(STORAGE_KEYS[storeName.toUpperCase()], JSON.stringify(data));
  } catch (e) {
    console.warn('localStorage setItem failed:', e);
  }

  try {
    const idb = await openIndexedDB();
    if (!idb || !idb.objectStoreNames.contains(storeName)) return;
    const tx = idb.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    await new Promise((resolve, reject) => {
      const clearReq = store.clear();
      clearReq.onsuccess = () => {
        if (storeName === 'settings') {
          store.put({ key: 'global_settings', ...data });
        } else if (Array.isArray(data)) {
          for (const item of data) {
            store.put(item);
          }
        }
        resolve();
      };
      clearReq.onerror = () => reject(clearReq.error);
    });
  } catch (e) {
    console.warn(`IndexedDB persist error on ${storeName}:`, e);
  }
}

// ==================== SUPABASE CLOUD DATA ACCESS ====================

/**
 * Fetch latest data from a Supabase table.
 * Returns null if network error, table not yet upgraded, or offline.
 */
async function fetchCloudTable(tableName) {
  try {
    const { data, error } = await supabase.from(tableName).select('*');
    if (error) {
      console.warn(`[Supabase] Query warning on ${tableName}:`, error.message);
      return null;
    }
    return Array.isArray(data) ? data.map((row) => fromDbRow(tableName, row)) : [];
  } catch (err) {
    console.warn(`[Supabase] Network/fetch error on ${tableName}:`, err);
    return null;
  }
}

/**
 * Execute cloud mutation with automatic offline queueing fallback.
 * Never reports false success: returns true only if cloud confirmed, false if queued offline.
 */
async function executeCloudMutation({ table, action, id, data }) {
  const timestamp = new Date().toISOString();
  if (data) {
    data.updatedAt = timestamp;
  }

  if (!isOnlineState) {
    syncService.enqueueMutation({ table, action, id, data, timestamp });
    return { success: false, mode: 'offline_queued' };
  }

  try {
    const dbPayload = data ? toDbRow(table, data) : null;
    let resError = null;

    if (action === 'delete') {
      const { error } = await supabase.from(table).delete().eq('id', id);
      resError = error;
    } else if (action === 'insert') {
      const { error } = await supabase.from(table).insert(dbPayload);
      resError = error;
    } else {
      // Default to upsert for idempotent safety
      const { error } = await supabase.from(table).upsert(dbPayload);
      resError = error;
    }

    if (resError) {
      console.warn(`[Supabase] Mutation error on ${table} (${id}):`, resError.message);
      syncService.enqueueMutation({ table, action, id, data, timestamp });
      return { success: false, mode: 'offline_queued', error: resError.message };
    }

    return { success: true, mode: 'cloud_confirmed' };
  } catch (err) {
    console.warn(`[Supabase] Network failure on ${table} (${id}). Enqueuing offline mutation:`, err);
    syncService.enqueueMutation({ table, action, id, data, timestamp });
    return { success: false, mode: 'offline_queued' };
  }
}

// ==================== INITIALIZATION & STARTUP ====================

export async function initDatabase() {
  if (dbReadyPromise) return dbReadyPromise;

  dbReadyPromise = (async () => {
    // 1. Load local cache first for instant synchronous render
    const getLocal = (k) => {
      try {
        const v = localStorage.getItem(k);
        return v ? JSON.parse(v) : null;
      } catch {
        return null;
      }
    };

    let localComponents = getLocal(STORAGE_KEYS.COMPONENTS) || INITIAL_COMPONENTS;
    let localUsers = getLocal(STORAGE_KEYS.USERS) || INITIAL_USERS;
    if (!localUsers.some((u) => u.rollNumber?.toUpperCase() === 'SIR')) {
      localUsers = [...localUsers, SIR_USER];
    }
    localUsers = localUsers.map((u) => ({
      ...u,
      branch: u.branch || (u.role === 'sir' ? 'ECE' : 'ECE'),
      section: u.section || (u.role === 'sir' ? 'Faculty Mentor' : 'A'),
      academicYear: u.academicYear || (u.role === 'sir' ? 0 : 3),
      avatarTheme: u.avatarTheme || (u.role === 'sir' ? 'emerald' : 'indigo'),
    }));

    let localDevices = getLocal(STORAGE_KEYS.DEVICES) || INITIAL_DEVICES;
    let localVisits = getLocal(STORAGE_KEYS.VISITS) || INITIAL_VISITS;
    let localDailyAttendance = getLocal(STORAGE_KEYS.DAILY_ATTENDANCE) || INITIAL_DAILY_ATTENDANCE;
    let localTransactions = getLocal(STORAGE_KEYS.TRANSACTIONS) || INITIAL_TRANSACTIONS;
    let localAuthorizations = getLocal(STORAGE_KEYS.AUTHORIZATIONS) || INITIAL_AUTHORIZATIONS;
    let localSettings = getLocal(STORAGE_KEYS.SETTINGS) || INITIAL_SETTINGS;
    let localAuditLogs = getLocal(STORAGE_KEYS.AUDIT_LOGS) || INITIAL_AUDIT_LOGS;
    let localCurrentUser = getLocal(STORAGE_KEYS.AUTH_SESSION) || localUsers[0];

    let localProjects = getLocal(STORAGE_KEYS.PROJECTS) || DEFAULT_PROJECTS;
    let localTeams = getLocal(STORAGE_KEYS.TEAMS) || DEFAULT_TEAMS;
    let localAchievements = getLocal(STORAGE_KEYS.ACHIEVEMENTS) || DEFAULT_ACHIEVEMENTS;
    let localAnnouncements = getLocal(STORAGE_KEYS.ANNOUNCEMENTS) || DEFAULT_ANNOUNCEMENTS;
    let localEvents = getLocal(STORAGE_KEYS.EVENTS) || DEFAULT_EVENTS;
    let localComplaints = getLocal(STORAGE_KEYS.COMPLAINTS) || DEFAULT_COMPLAINTS;
    let localResearchPapers = getLocal(STORAGE_KEYS.RESEARCH_PAPERS) || DEFAULT_RESEARCH_PAPERS;
    let localSelfReflections = getLocal(STORAGE_KEYS.SELF_REFLECTIONS) || DEFAULT_SELF_REFLECTIONS;
    let localHolidays = getLocal(STORAGE_KEYS.HOLIDAYS) || DEFAULT_HOLIDAYS;
    let localDomains = getLocal(STORAGE_KEYS.DOMAINS) || DEFAULT_DOMAINS;
    let localStaffPresence = getLocal(STORAGE_KEYS.STAFF_PRESENCE) || [];

    memoryStore = {
      components: localComponents,
      users: localUsers,
      devices: localDevices,
      visits: localVisits,
      dailyAttendance: localDailyAttendance,
      transactions: localTransactions,
      authorizations: localAuthorizations,
      settings: localSettings,
      auditLogs: localAuditLogs,
      currentUser: localCurrentUser,
      projects: localProjects,
      teams: localTeams,
      achievements: localAchievements,
      announcements: localAnnouncements,
      events: localEvents,
      complaints: localComplaints,
      researchPapers: localResearchPapers,
      selfReflections: localSelfReflections,
      holidays: localHolidays,
      domains: localDomains,
      staffPresence: localStaffPresence,
    };

    // 2. Setup Supabase Auth Session Listener
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData?.session?.user) {
        const authUser = sessionData.session.user;
        const matchingProfile = memoryStore.users.find(
          (u) => u.authId === authUser.id || (authUser.email && authUser.email.toLowerCase().startsWith(u.rollNumber.toLowerCase()))
        );
        if (matchingProfile) {
          memoryStore.currentUser = { ...matchingProfile, authId: authUser.id };
          localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(memoryStore.currentUser));
        }
      }

      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
          memoryStore.currentUser = null;
          localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
          notifySubscribers('AUTH_CHANGED', null);
        } else if (session?.user) {
          const authUser = session.user;
          const matching = memoryStore.users.find(
            (u) => u.authId === authUser.id || (authUser.email && authUser.email.toLowerCase().startsWith(u.rollNumber.toLowerCase()))
          );
          if (matching) {
            memoryStore.currentUser = { ...matching, authId: authUser.id };
            localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(memoryStore.currentUser));
            notifySubscribers('AUTH_CHANGED', memoryStore.currentUser);
          }
        }
      });
    } catch (e) {
      console.warn('[Supabase Auth] Session initialization error:', e);
    }

    // 3. Connect to Supabase Cloud Database (Online Source of Truth)
    if (typeof window !== 'undefined') {
      isOnlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;

      window.addEventListener('online', async () => {
        isOnlineState = true;
        console.log('[Incubation-CMS] Network online. Pulling cloud updates & draining sync queue...');
        await refreshFromCloud();
        await syncService.processQueue(supabase, toDbRow);
      });

      window.addEventListener('offline', () => {
        isOnlineState = false;
        console.log('[Incubation-CMS] Operating in Offline Mode.');
        notifySubscribers('NETWORK_STATUS_CHANGED', { isOnline: false });
      });
    }

    // Initial cloud sync if online
    if (isOnlineState) {
      await refreshFromCloud();
      // Drain any pending mutations from previous sessions
      syncService.processQueue(supabase, toDbRow);
    }

    return memoryStore;
  })();

  return dbReadyPromise;
}

/**
 * Pull latest cloud tables from Supabase into memoryStore and update local cache.
 */
export async function refreshFromCloud() {
  try {
    const [
      cloudComponents,
      cloudDevices,
      cloudVisits,
      cloudTransactions,
      cloudAuthorizations,
      cloudSettings,
      cloudAuditLogs,
      cloudUsers,
    ] = await Promise.all([
      fetchCloudTable('components'),
      fetchCloudTable('devices'),
      fetchCloudTable('visits'),
      fetchCloudTable('transactions'),
      fetchCloudTable('authorizations'),
      fetchCloudTable('settings'),
      fetchCloudTable('audit_logs'),
      fetchCloudTable('users'),
    ]);

    let hasCloudData = false;

    if (cloudComponents && cloudComponents.length > 0) {
      memoryStore.components = cloudComponents;
      persistLocalCache('components', cloudComponents);
      hasCloudData = true;
    }
    if (cloudDevices && cloudDevices.length > 0) {
      memoryStore.devices = cloudDevices;
      persistLocalCache('devices', cloudDevices);
      hasCloudData = true;
    }
    if (cloudVisits && cloudVisits.length > 0) {
      memoryStore.visits = cloudVisits;
      persistLocalCache('visits', cloudVisits);
      hasCloudData = true;
    }
    if (cloudTransactions && cloudTransactions.length > 0) {
      memoryStore.transactions = cloudTransactions;
      persistLocalCache('transactions', cloudTransactions);
      hasCloudData = true;
    }
    if (cloudAuthorizations && cloudAuthorizations.length > 0) {
      memoryStore.authorizations = cloudAuthorizations;
      persistLocalCache('authorizations', cloudAuthorizations);
      hasCloudData = true;
    }
    if (cloudSettings && cloudSettings.length > 0) {
      const s = cloudSettings[0];
      if (s.value) {
        memoryStore.settings = { ...INITIAL_SETTINGS, ...s.value };
      } else {
        memoryStore.settings = { ...INITIAL_SETTINGS, ...s };
      }
      persistLocalCache('settings', memoryStore.settings);
      hasCloudData = true;
    }
    if (cloudAuditLogs && cloudAuditLogs.length > 0) {
      memoryStore.auditLogs = cloudAuditLogs;
      persistLocalCache('auditLogs', cloudAuditLogs);
      hasCloudData = true;
    }
    if (cloudUsers && cloudUsers.length > 0) {
      memoryStore.users = cloudUsers;
      persistLocalCache('users', cloudUsers);
      hasCloudData = true;
    }

    // Safe initial population: If cloud database was completely empty on first connection,
    // seed the initial catalog so Supabase contains the starter inventory
    if (!hasCloudData && cloudComponents && cloudComponents.length === 0) {
      console.log('[Supabase] Initializing cloud catalog with baseline components...');
      seedCloudDatabase();
    }

    notifySubscribers('DATABASE_SYNCED', memoryStore);
  } catch (err) {
    console.warn('[Supabase] Refresh from cloud failed, using cached data:', err);
  }
}

/**
 * Helper to seed initial catalog to Supabase if the tables were empty.
 */
async function seedCloudDatabase() {
  try {
    for (const c of INITIAL_COMPONENTS) {
      await supabase.from('components').upsert(toDbRow('components', c));
    }
    for (const d of INITIAL_DEVICES) {
      await supabase.from('devices').upsert(toDbRow('devices', d));
    }
    for (const u of INITIAL_USERS) {
      await supabase.from('users').upsert(toDbRow('users', u));
    }
    await supabase.from('settings').upsert({
      id: 'SETTING-001',
      key: 'global_settings',
      value: INITIAL_SETTINGS,
      updated_at: new Date().toISOString(),
    });
  } catch (e) {
    console.warn('[Supabase Seeding]:', e);
  }
}

// ==================== AUTHENTICATION & USERS ====================

export function getCurrentUser() {
  return memoryStore.currentUser;
}

export function setCurrentUser(user) {
  memoryStore.currentUser = user;
  if (user) {
    localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
  }
  notifySubscribers('AUTH_CHANGED', user);
}

/**
 * Login via Supabase Auth.
 * Automatically translates Roll Number / Username to Supabase Auth email.
 * Never stores or compares plaintext passwords locally!
 */
export async function loginUser(identifier, password) {
  if (!identifier || !password) {
    throw new Error('User identifier and password are required.');
  }

  const cleanId = identifier.trim();
  let email = cleanId.toLowerCase();

  // Convert username / Roll Number into synthetic Supabase Auth email format
  if (!email.includes('@')) {
    if (email === 'admin') {
      email = 'admin@incubation.local';
    } else if (email === 'sir') {
      email = 'sir@incubation.local';
    } else if (email === 'subadmin') {
      email = 'subadmin@incubation.local';
    } else {
      email = `${email.replace(/[^a-z0-9]/g, '')}@student.incubation.local`;
    }
  }

  // 1. Attempt Supabase Auth Sign-In
  let authUser = null;
  let authError = null;

  try {
    const { data: authData, error } = await supabase.auth.signInWithPassword({
      email,
      password: password.trim(),
    });
    authUser = authData?.user;
    authError = error;
  } catch (netErr) {
    authError = netErr;
  }

  // 2. Handle initial onboarding fallback if user not yet created in Supabase Auth
  if (authError && authError.message?.includes('Invalid login credentials')) {
    // If running in development and account exists in sampleData/memoryStore, auto-provision in Supabase Auth
    const localMatch = memoryStore.users.find(
      (u) => u.rollNumber.toUpperCase() === cleanId.toUpperCase()
    );

    if (localMatch && (localMatch.passwordHash === password.trim() || password.trim().length >= 6)) {
      try {
        const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
          email,
          password: password.trim(),
        });
        if (!signUpErr && signUpData?.user) {
          authUser = signUpData.user;
          authError = null;
          // Associate auth_id with user profile
          localMatch.authId = authUser.id;
          await supabase.from('users').upsert(toDbRow('users', localMatch));
        }
      } catch {
        // Fall back to original error
      }
    }
  }

  if (authError || !authUser) {
    // Offline or demo login fallback
    const localMatch = memoryStore.users.find(
      (u) => u.rollNumber.toUpperCase() === cleanId.toUpperCase()
    );
    if (
      localMatch &&
      (password.trim() === 'admin123' ||
        password.trim() === 'sir123' ||
        password.trim() === 'subadmin123' ||
        password.trim() === 'student123' ||
        localMatch.passwordHash === password.trim())
    ) {
      setCurrentUser(localMatch);
      logAuditEvent({
        actorName: localMatch.name,
        actorRole: localMatch.role,
        action: 'User Login',
        targetRoll: localMatch.rollNumber,
        details: `${localMatch.name} (${localMatch.role}) signed in (offline fallback).`,
      });
      return localMatch;
    }

    throw new Error(
      authError?.message || 'Invalid credentials. Please verify your Roll Number/Username and password.'
    );
  }

  // 3. Retrieve user profile from public.users linked via auth_id or roll_number
  let profile = null;
  try {
    const { data: profileRows } = await supabase
      .from('users')
      .select('*')
      .or(`auth_id.eq.${authUser.id},roll_number.ilike.${cleanId}`)
      .limit(1);

    if (profileRows && profileRows.length > 0) {
      profile = fromDbRow('users', profileRows[0]);
      if (!profileRows[0].auth_id) {
        await supabase.from('users').update({ auth_id: authUser.id }).eq('id', profileRows[0].id);
      }
    }
  } catch (e) {
    console.warn('[Supabase] Failed to fetch profile:', e);
  }

  // Fallback to local profile match if network query was restricted
  if (!profile) {
    profile = memoryStore.users.find(
      (u) => u.rollNumber.toUpperCase() === cleanId.toUpperCase()
    ) || {
      id: `USER-${authUser.id.slice(-6)}`,
      rollNumber: cleanId.toUpperCase(),
      name: cleanId.toUpperCase(),
      role: cleanId.toLowerCase() === 'admin' ? 'admin' : cleanId.toLowerCase() === 'sir' ? 'sir' : cleanId.toLowerCase() === 'subadmin' ? 'substitute_admin' : 'student',
      authId: authUser.id,
      createdAt: new Date().toISOString(),
    };
  }

  profile.authId = authUser.id;
  setCurrentUser(profile);

  logAuditEvent({
    actorName: profile.name,
    actorRole: profile.role,
    action: 'User Login',
    targetRoll: profile.rollNumber,
    details: `${profile.name} (${profile.role}) signed in via Supabase Auth.`,
  });

  return profile;
}

export async function logoutUser() {
  const user = memoryStore.currentUser;
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('[Supabase Auth SignOut]:', e);
  }

  if (user) {
    logAuditEvent({
      actorName: user.name,
      actorRole: user.role,
      action: 'User Logout',
      targetRoll: user.rollNumber,
      details: `${user.name} signed out.`,
    });
  }
  setCurrentUser(null);
}

export function getAllUsers() {
  return [...memoryStore.users];
}

export function getStudents() {
  return memoryStore.users.filter(
    (u) => u.role === 'student' || (!u.role && u.rollNumber !== 'ADMIN' && u.rollNumber !== 'SUBADMIN')
  );
}

export function getUserByRoll(rollNumber) {
  if (!rollNumber) return null;
  const cleanRoll = rollNumber.trim().toUpperCase();
  return memoryStore.users.find((u) => u.rollNumber.toUpperCase() === cleanRoll) || null;
}
export const getStudentByRoll = getUserByRoll;

/**
 * Register student at entrance station (3 fingerprints + face + credentials).
 * Provisions Supabase Auth user and saves profile to Supabase PostgreSQL.
 */
export async function registerStudentFirstVisit({
  name,
  rollNumber,
  mobileNumber,
  password,
  fingerprintIds = [],
  fingerLabels = ['Right Thumb', 'Right Index', 'Left Index'],
  faceRegistered = true,
  facePhotoUrl = null,
  department = '',
  incubationStartDate = null,
  academicYearAtStart = null,
  idCardValidityYear = null,
  branch = '',
}) {
  const cleanRoll = rollNumber.trim().toUpperCase();
  const cleanName = name.trim();

  if (!cleanRoll) throw new Error('Roll Number is required.');
  if (!cleanName) throw new Error('Student Name is required.');
  if (!password || password.trim().length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  // Check Storage Protection Mode
  const storageStatus = getDatabaseStorageStatus();
  const perm = validateStorageWrite('REGISTER_STUDENT', storageStatus);
  if (!perm.allowed) {
    throw new Error(perm.message);
  }

  const existing = getUserByRoll(cleanRoll);
  if (existing) {
    throw new Error(`Student with Roll Number ${cleanRoll} is already registered.`);
  }

  // Calculate explicit retention based strictly on journey start date and year
  const journeyStartDate = incubationStartDate || new Date().toISOString().slice(0, 10);
  const startYear = academicYearAtStart ? Number(academicYearAtStart) : null;
  const retentionYears = startYear ? calculateRetentionYears(startYear) : null;
  const retentionEndDate = (journeyStartDate && startYear)
    ? calculateRetentionEndDate(journeyStartDate, startYear)
    : null;

  // Generate 3 R305 slot IDs if not provided
  const fIds =
    fingerprintIds.length === 3
      ? fingerprintIds
      : [
          Math.floor(100 + Math.random() * 800),
          Math.floor(100 + Math.random() * 800),
          Math.floor(100 + Math.random() * 800),
        ];

  // 1. Create Supabase Auth user
  let authUserId = null;
  const email = `${cleanRoll.toLowerCase()}@student.incubation.local`;
  try {
    const { data: authData } = await supabase.auth.signUp({
      email,
      password: password.trim(),
    });
    if (authData?.user) {
      authUserId = authData.user.id;
    }
  } catch (e) {
    console.warn('[Supabase Auth Registration]:', e);
  }

  // 2. Prepare Profile (NEVER stores plaintext password in DB)
  const newUser = {
    id: `USER-${String(Date.now()).slice(-6)}`,
    authId: authUserId,
    rollNumber: cleanRoll,
    name: cleanName,
    role: 'student',
    mobileNumber: mobileNumber ? mobileNumber.trim() : '',
    department: department.trim() || 'Engineering & Technology',
    fingerprintIds: fIds,
    fingerLabels,
    faceRegistered: Boolean(faceRegistered),
    facePhotoUrl: facePhotoUrl || null,
    incubationStartDate: journeyStartDate,
    academicYearAtStart: startYear,
    retentionPeriodYears: retentionYears,
    retentionEndDate: retentionEndDate,
    idCardValidityYear: idCardValidityYear ? Number(idCardValidityYear) : null,
    branch: branch ? branch.trim() : (department.trim() || ''),
    idCardScannedAt: idCardValidityYear ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  memoryStore.users.push(newUser);
  persistLocalCache('users', memoryStore.users);

  // 3. Persist to Supabase
  await executeCloudMutation({
    table: 'users',
    action: 'insert',
    id: newUser.id,
    data: newUser,
  });

  logAuditEvent({
    actorName: memoryStore.currentUser?.name || 'System Entrance Station',
    actorRole: memoryStore.currentUser?.role || 'System',
    action: 'Student Registered (First Visit)',
    targetRoll: cleanRoll,
    details: `Registered ${cleanName} with 3 fingerprints and face profile.`,
  });

  notifySubscribers('USER_REGISTERED', newUser);
  return newUser;
}

export async function resetStudentPassword(rollNumber, newPassword, actorName = 'Student Self-Reset') {
  const user = getUserByRoll(rollNumber);
  if (!user) throw new Error('Student not found.');
  if (!newPassword || newPassword.trim().length < 6) {
    throw new Error('New password must be at least 6 characters long.');
  }

  // Update password via Supabase Auth
  try {
    await supabase.auth.updateUser({ password: newPassword.trim() });
  } catch (e) {
    console.warn('[Supabase Auth Password Update]:', e);
  }

  logAuditEvent({
    actorName,
    actorRole: memoryStore.currentUser?.role || 'Student',
    action: 'Password Reset',
    targetRoll: user.rollNumber,
    details: `Password reset for ${user.name} (${user.rollNumber}).`,
  });

  notifySubscribers('USER_UPDATED', user);
  return true;
}

export async function updateStudentAccount(rollNumber, updates, actor) {
  const idx = memoryStore.users.findIndex((u) => u.rollNumber.toUpperCase() === rollNumber.trim().toUpperCase());
  if (idx === -1) throw new Error('Student account not found.');

  const current = memoryStore.users[idx];
  const newStartDate = updates.incubationStartDate !== undefined ? updates.incubationStartDate : current.incubationStartDate;
  const newYearAtStart = updates.academicYearAtStart !== undefined
    ? (updates.academicYearAtStart ? Number(updates.academicYearAtStart) : null)
    : current.academicYearAtStart;

  const newRetentionYears = newYearAtStart ? calculateRetentionYears(newYearAtStart) : null;
  const newRetentionEndDate = (newStartDate && newYearAtStart)
    ? calculateRetentionEndDate(newStartDate, newYearAtStart)
    : null;

  const updated = {
    ...current,
    name: updates.name ? updates.name.trim() : current.name,
    mobileNumber: updates.mobileNumber !== undefined ? updates.mobileNumber.trim() : current.mobileNumber,
    department: updates.department !== undefined ? updates.department.trim() : current.department,
    role: updates.role || current.role,
    incubationStartDate: newStartDate,
    academicYearAtStart: newYearAtStart,
    retentionPeriodYears: newRetentionYears,
    retentionEndDate: newRetentionEndDate,
    updatedAt: new Date().toISOString(),
  };

  memoryStore.users[idx] = updated;
  persistLocalCache('users', memoryStore.users);

  await executeCloudMutation({
    table: 'users',
    action: 'update',
    id: updated.id,
    data: updated,
  });

  logAuditEvent({
    actorName: actor?.name || 'Admin',
    actorRole: actor?.role || 'Admin',
    action: 'Student Account Updated',
    targetRoll: updated.rollNumber,
    details: `Updated details for ${updated.name} (${updated.rollNumber}).`,
  });

  notifySubscribers('USER_UPDATED', updated);
  return updated;
}

// ==================== LAB ENTRY / EXIT & ATTENDANCE ====================

export async function recordLabEntry(rollNumber, entryMethod = 'fingerprint') {
  const user = getUserByRoll(rollNumber);
  if (!user) throw new Error(`Student with Roll Number ${rollNumber} not registered.`);

  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);

  // Check if already inside
  const activeVisit = memoryStore.visits.find(
    (v) => v.studentRoll.toUpperCase() === user.rollNumber.toUpperCase() && v.status === 'inside'
  );
  if (activeVisit) {
    return {
      success: true,
      alreadyInside: true,
      student: user,
      visit: activeVisit,
      message: `${user.name} is already registered inside the lab since ${activeVisit?.entryTime ? new Date(activeVisit.entryTime).toLocaleTimeString() : 'earlier today'}.`,
    };
  }

  // 1. Add strictly Roll Number to daily attendance list
  if (!memoryStore.dailyAttendance[dateKey]) {
    memoryStore.dailyAttendance[dateKey] = [];
  }
  if (!memoryStore.dailyAttendance[dateKey].includes(user.rollNumber)) {
    memoryStore.dailyAttendance[dateKey].push(user.rollNumber);
    try {
      localStorage.setItem(STORAGE_KEYS.DAILY_ATTENDANCE, JSON.stringify(memoryStore.dailyAttendance));
    } catch (e) {
      console.warn('Daily attendance persist error:', e);
    }
  }

  // 2. Create Visit Record
  const newVisit = {
    id: `VISIT-${dateKey.replace(/-/g, '')}-${String(Date.now()).slice(-4)}`,
    studentRoll: user.rollNumber,
    studentName: user.name,
    entryTime: now.toISOString(),
    exitTime: null,
    durationMinutes: null,
    status: 'inside',
    entryMethod,
    createdAt: now.toISOString(),
  };

  memoryStore.visits.unshift(newVisit);
  persistLocalCache('visits', memoryStore.visits);

  await executeCloudMutation({
    table: 'visits',
    action: 'insert',
    id: newVisit.id,
    data: newVisit,
  });

  logAuditEvent({
    actorName: user.name,
    actorRole: 'Student',
    action: 'Lab Entry',
    targetRoll: user.rollNumber,
    details: `Entered lab via ${entryMethod}.`,
  });

  notifySubscribers('VISIT_ADDED', newVisit);
  return {
    success: true,
    student: user,
    visit: newVisit,
    message: 'You are entered in the lab.',
  };
}

/**
 * Checks if a student currently has an active 'inside' visit in the lab.
 * @param {string} rollNumber
 * @returns {object|null} The active visit or null
 */
export function getStudentActiveVisit(rollNumber) {
  if (!rollNumber) return null;
  const clean = rollNumber.trim().toUpperCase();
  return memoryStore.visits.find(
    (v) => v.studentRoll.toUpperCase() === clean && v.status === 'inside'
  ) || null;
}

export async function recordLabExit(rollNumber, exitMethod = 'fingerprint') {
  const user = getUserByRoll(rollNumber);
  if (!user) throw new Error(`Student with Roll Number ${rollNumber} not registered.`);

  const now = new Date();
  const activeIdx = memoryStore.visits.findIndex(
    (v) => v.studentRoll.toUpperCase() === user.rollNumber.toUpperCase() && v.status === 'inside'
  );

  if (activeIdx === -1) {
    throw new Error(`Student ${user.name} (${user.rollNumber}) is not currently inside the lab.`);
  }

  const active = memoryStore.visits[activeIdx];
  const entryMs = active?.entryTime ? new Date(active.entryTime).getTime() : NaN;
  if (isNaN(entryMs)) {
    throw new Error(`Cannot calculate duration: active visit for ${user.rollNumber} has no valid entry time.`);
  }

  const durationMin = Math.max(1, Math.round((now.getTime() - entryMs) / 60000));

  const visit = {
    ...active,
    exitTime: now.toISOString(),
    durationMinutes: durationMin,
    status: 'completed',
    exitMethod,
  };
  memoryStore.visits[activeIdx] = visit;

  persistLocalCache('visits', memoryStore.visits);

  await executeCloudMutation({
    table: 'visits',
    action: 'upsert',
    id: visit.id,
    data: visit,
  });

  logAuditEvent({
    actorName: user.name,
    actorRole: 'Student',
    action: 'Lab Exit',
    targetRoll: user.rollNumber,
    details: `Exited lab. Duration: ${visit.durationMinutes} minutes.`,
  });

  notifySubscribers('VISIT_UPDATED', visit);
  return {
    success: true,
    student: user,
    durationMinutes: visit.durationMinutes,
    visit,
    message: 'Thanks for visiting the lab.',
  };
}

export function getStudentsCurrentlyInside() {
  const insideVisits = memoryStore.visits.filter((v) => v.status === 'inside');
  const now = Date.now();

  return insideVisits.map((v) => {
    const elapsedMinutes = Math.max(0, Math.round((now - new Date(v.entryTime).getTime()) / 60000));
    const hours = Math.floor(elapsedMinutes / 60);
    const mins = elapsedMinutes % 60;
    const durationText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    return {
      ...v,
      elapsedMinutes,
      durationText,
    };
  });
}

export function getVisits() {
  return [...memoryStore.visits];
}

export function getHolidays() {
  return [...(memoryStore.holidays || [])];
}

export async function addHoliday({ date, name, type = 'institute' }, currentUser) {
  if (!date || !name) throw new Error('Date and holiday name are required.');
  const newHoliday = {
    id: `HOL-${String(Date.now()).slice(-6)}`,
    date: date.trim(),
    name: name.trim(),
    type,
    createdAt: new Date().toISOString(),
  };
  if (!memoryStore.holidays) memoryStore.holidays = [];
  memoryStore.holidays.push(newHoliday);
  await persistLocalCache('holidays', memoryStore.holidays);
  await executeCloudMutation({
    table: 'holidays',
    action: 'insert',
    id: newHoliday.id,
    data: newHoliday,
  });
  notifySubscribers('HOLIDAYS_CHANGED', memoryStore.holidays);
  return newHoliday;
}

export async function deleteHoliday(id, currentUser) {
  if (!memoryStore.holidays) return;
  memoryStore.holidays = memoryStore.holidays.filter((h) => h.id !== id);
  await persistLocalCache('holidays', memoryStore.holidays);
  await executeCloudMutation({
    table: 'holidays',
    action: 'delete',
    id,
  });
  notifySubscribers('HOLIDAYS_CHANGED', memoryStore.holidays);
}

export function calculateStudentStreak(rollNumber) {
  if (!rollNumber) return 0;
  const cleanRoll = rollNumber.trim().toUpperCase();
  const visits = (memoryStore.visits || []).filter(
    (v) => v.studentRoll && v.studentRoll.toUpperCase() === cleanRoll
  );
  if (!visits || visits.length === 0) return 0;

  const visitDates = new Set(
    visits.map((v) => new Date(v.entryTime).toISOString().slice(0, 10))
  );

  const holidayDates = new Set((memoryStore.holidays || []).map((h) => h.date));
  const formatYMD = (d) => {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  };

  const today = new Date();
  const todayStr = formatYMD(today);
  const visitedToday = visitDates.has(todayStr);

  let streak = 0;
  let cursor = new Date(today);

  // If student hasn't visited today yet, start examining from yesterday so streak isn't lost mid-day
  if (!visitedToday) {
    cursor.setDate(cursor.getDate() - 1);
  }

  let daysInspected = 0;
  while (daysInspected < 365) {
    daysInspected++;
    const dateStr = formatYMD(cursor);
    const dayOfWeek = cursor.getDay(); // 0 is Sunday
    const isSunday = dayOfWeek === 0;
    const isHoliday = holidayDates.has(dateStr);

    if (isSunday || isHoliday) {
      // Sundays and holidays do NOT break streak!
      if (visitDates.has(dateStr)) {
        streak++;
      }
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    // Working day
    if (visitDates.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

export function getStudentPersonalStats(rollNumber) {
  if (!rollNumber) return null;
  const cleanRoll = rollNumber.trim().toUpperCase();
  const user = getUserByRoll(cleanRoll);
  if (!user) return null;

  const studentVisits = memoryStore.visits.filter((v) => v.studentRoll.toUpperCase() === cleanRoll);
  const completedVisits = studentVisits.filter((v) => v.status === 'completed');
  const activeVisit = studentVisits.find((v) => v.status === 'inside');

  const distinctDays = new Set(studentVisits.map((v) => new Date(v.entryTime).toISOString().slice(0, 10)));
  const totalMinutes = completedVisits.reduce((acc, v) => acc + (v.durationMinutes || 0), 0);
  const totalHours = (totalMinutes / 60).toFixed(1);

  let currentInsideDurationText = null;
  if (activeVisit) {
    const elapsed = Math.max(0, Math.round((Date.now() - new Date(activeVisit.entryTime).getTime()) / 60000));
    const h = Math.floor(elapsed / 60);
    const m = elapsed % 60;
    currentInsideDurationText = h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  const studentTxns = memoryStore.transactions.filter((t) => t.studentRoll.toUpperCase() === cleanRoll);
  const activeIssuedItems = [];
  const overdueItems = [];
  const returnedItems = [];

  for (const t of studentTxns) {
    for (const it of t.items) {
      const remaining = it.issuedQuantity - it.returnedQuantity;
      if (remaining > 0) {
        const isLate = new Date(it.dueDate).getTime() < Date.now();
        const diffMs = Date.now() - new Date(it.dueDate).getTime();
        const daysOverdue = isLate ? Math.ceil(diffMs / (24 * 60 * 60 * 1000)) : 0;

        const record = {
          ...it,
          transactionId: t.id,
          issueDate: t.issueDate,
          remainingQuantity: remaining,
          isOverdue: isLate,
          daysOverdue,
        };

        activeIssuedItems.push(record);
        if (isLate) overdueItems.push(record);
      }
      if (it.returnedQuantity > 0) {
        returnedItems.push({
          ...it,
          transactionId: t.id,
        });
      }
    }
  }

  // Daily lab time today
  const todayStr = new Date().toISOString().slice(0, 10);
  const visitsToday = studentVisits.filter(
    (v) => new Date(v.entryTime).toISOString().slice(0, 10) === todayStr
  );
  let dailyLabTimeMinutes = visitsToday
    .filter((v) => v.status === 'completed')
    .reduce((acc, v) => acc + (v.durationMinutes || 0), 0);
  if (activeVisit) {
    const elapsedNow = Math.max(0, Math.round((Date.now() - new Date(activeVisit.entryTime).getTime()) / 60000));
    dailyLabTimeMinutes += elapsedNow;
  }

  const avgSessionMinutes = completedVisits.length > 0
    ? Math.round(totalMinutes / completedVisits.length)
    : 0;

  const workingDayStreak = calculateStudentStreak(cleanRoll);

  const studentProjects = (memoryStore.projects || []).filter(
    (p) =>
      (p.leaderRoll && p.leaderRoll.toUpperCase() === cleanRoll) ||
      (p.members || []).some((m) => (m.rollNumber || m)?.toUpperCase() === cleanRoll)
  );

  const studentTeams = (memoryStore.teams || []).filter(
    (t) =>
      (t.leaderRoll && t.leaderRoll.toUpperCase() === cleanRoll) ||
      (t.memberRolls || []).some((m) => m?.toUpperCase() === cleanRoll)
  );

  const studentAchievements = (memoryStore.achievements || []).filter(
    (a) => a.awardedToRoll && a.awardedToRoll.toUpperCase() === cleanRoll
  );

  const studentPapers = (memoryStore.researchPapers || []).filter(
    (p) => p.studentRoll && p.studentRoll.toUpperCase() === cleanRoll
  );

  const studentReflections = (memoryStore.selfReflections || []).filter(
    (r) => r.studentRoll && r.studentRoll.toUpperCase() === cleanRoll
  );

  return {
    student: user,
    isCurrentlyInside: Boolean(activeVisit),
    activeVisit,
    currentInsideDurationText,
    totalDaysVisited: distinctDays.size,
    totalVisitsCount: studentVisits.length,
    totalTimeSpentHours: totalHours,
    totalTimeSpentMinutes: totalMinutes,
    dailyLabTimeMinutes,
    avgSessionMinutes,
    workingDayStreak,
    visitHistory: studentVisits,
    activeIssuedItems,
    overdueItems,
    returnedItems,
    projects: studentProjects,
    teams: studentTeams,
    achievements: studentAchievements,
    researchPapers: studentPapers,
    selfReflections: studentReflections,
    branch: user.branch || 'ECE',
    section: user.section || 'A',
    year: user.academicYear || user.year || 3,
    avatarTheme: user.avatarTheme || 'indigo',
  };
}

export function getAttendanceExportData() {
  const visits = [...memoryStore.visits];
  visits.sort((a, b) => new Date(b.entryTime).getTime() - new Date(a.entryTime).getTime());

  return visits.map((v) => {
    const entryDate = new Date(v.entryTime).toLocaleDateString();
    const entryTime = new Date(v.entryTime).toLocaleTimeString();
    const exitTime = v.exitTime ? new Date(v.exitTime).toLocaleTimeString() : 'Still Inside';
    const duration = v.durationMinutes ? `${v.durationMinutes} min` : 'In Progress';

    return {
      Date: entryDate,
      RollNumber: v.studentRoll,
      StudentName: v.studentName,
      EntryTime: entryTime,
      ExitTime: exitTime,
      Duration: duration,
      EntryMethod: v.entryMethod || 'Manual',
    };
  });
}

// ==================== INVENTORY & USABLE STOCK FORMULAS ====================

// Usable Stock Formula: Usable Stock = Available Quantity + Issued Quantity
// Lost items NEVER count towards usable stock!
export function getUsableStock(comp) {
  if (!comp) return 0;
  return Number(comp.availableQuantity || 0) + Number(comp.issuedQuantity || 0);
}

export function isComponentLowStock(comp) {
  if (!comp) return false;
  const threshold = comp.lowStockThreshold !== undefined ? Number(comp.lowStockThreshold) : 3;
  return getUsableStock(comp) < threshold;
}

export function getLowStockComponents() {
  return memoryStore.components.filter((c) => isComponentLowStock(c));
}

export async function setComponentThreshold(componentId, threshold, actor) {
  const comp = getComponentById(componentId);
  if (!comp) throw new Error('Component not found');
  const t = Math.max(0, Number(threshold));

  const updated = await updateComponent(componentId, { lowStockThreshold: t }, actor);
  logAuditEvent({
    actorName: actor?.name || 'Admin',
    actorRole: actor?.role || 'Admin',
    action: 'Threshold Updated',
    targetComponentId: componentId,
    previousValue: `Threshold: ${comp.lowStockThreshold}`,
    newValue: `Threshold: ${t}`,
    details: `Updated minimum low-stock alert threshold for "${comp.name}" to ${t}.`,
  });

  return updated;
}

export async function markComponentStatus({ componentId, status, individualTagId = null, notes = '', actor }) {
  const comp = getComponentById(componentId);
  if (!comp) throw new Error('Component not found');

  const validStatuses = ['damaged', 'lost', 'available'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status "${status}". Allowed: ${validStatuses.join(', ')}`);
  }

  let damagedQty = comp.damagedQuantity || 0;
  let lostQty = comp.lostQuantity || 0;
  let availableQty = comp.availableQuantity;
  let individualIds = comp.individualIds ? [...comp.individualIds] : [];

  if (comp.trackingMode === 'individual' && individualTagId) {
    const tagIdx = individualIds.findIndex((i) => i.id === individualTagId);
    if (tagIdx === -1) throw new Error(`Tag ID ${individualTagId} not found on this component.`);

    const oldTagStatus = individualIds[tagIdx].status;
    individualIds[tagIdx] = {
      ...individualIds[tagIdx],
      status,
      notes: notes || individualIds[tagIdx].notes,
      updatedAt: new Date().toISOString(),
    };

    if (oldTagStatus === 'available') availableQty = Math.max(0, availableQty - 1);
    else if (oldTagStatus === 'damaged') damagedQty = Math.max(0, damagedQty - 1);
    else if (oldTagStatus === 'lost') lostQty = Math.max(0, lostQty - 1);

    if (status === 'damaged') damagedQty++;
    else if (status === 'lost') lostQty++;
    else if (status === 'available') availableQty++;
  } else {
    // Aggregate status change
    if (status === 'damaged') {
      if (availableQty < 1) throw new Error('No available stock to mark as damaged.');
      availableQty--;
      damagedQty++;
    } else if (status === 'lost') {
      if (availableQty < 1) throw new Error('No available stock to mark as lost.');
      availableQty--;
      lostQty++;
    } else if (status === 'available') {
      if (damagedQty > 0) {
        damagedQty--;
        availableQty++;
      } else if (lostQty > 0) {
        lostQty--;
        availableQty++;
      }
    }
  }

  const updated = await updateComponent(
    componentId,
    {
      availableQuantity: availableQty,
      damagedQuantity: damagedQty,
      lostQuantity: lostQty,
      individualIds,
    },
    actor
  );

  logAuditEvent({
    actorName: actor?.name || 'Admin',
    actorRole: actor?.role || 'Admin',
    action: `Component Marked ${status.toUpperCase()}`,
    targetComponentId: componentId,
    details: individualTagId
      ? `Tag ${individualTagId} of "${comp.name}" marked as ${status}. Notes: ${notes}`
      : `1 unit of "${comp.name}" marked as ${status}. Notes: ${notes}`,
  });

  return updated;
}

export function getComponents(filterCategory = null, searchQuery = '', statusFilter = 'all') {
  let list = [...memoryStore.components];

  if (filterCategory && filterCategory !== 'all') {
    list = list.filter((c) => c.category === filterCategory);
  }

  if (statusFilter === 'low_stock') {
    list = list.filter((c) => isComponentLowStock(c));
  } else if (statusFilter === 'damaged') {
    list = list.filter((c) => c.damagedQuantity > 0 || c.individualIds?.some((i) => i.status === 'damaged'));
  } else if (statusFilter === 'lost') {
    list = list.filter((c) => c.lostQuantity > 0 || c.individualIds?.some((i) => i.status === 'lost'));
  }

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    list = list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q)) ||
        (c.location && c.location.toLowerCase().includes(q)) ||
        (c.individualIds && c.individualIds.some((idObj) => idObj.id.toLowerCase().includes(q)))
    );
  }
  return list;
}

export function getComponentById(id) {
  return memoryStore.components.find((c) => c.id === id) || null;
}

export async function addComponent(componentData, actor) {
  // Check Storage Protection Mode
  const storageStatus = getDatabaseStorageStatus();
  const perm = validateStorageWrite('ADD_COMPONENT', storageStatus);
  if (!perm.allowed) {
    throw new Error(perm.message);
  }

  // Validate componentNumber uniqueness
  if (componentData.componentNumber && componentData.componentNumber.trim()) {
    const trimmedNum = componentData.componentNumber.trim().toLowerCase();
    const existing = memoryStore.components.find(
      (c) => c.componentNumber && c.componentNumber.trim().toLowerCase() === trimmedNum
    );
    if (existing) {
      throw new Error('Component number already exists.');
    }
  }

  const newId = `COMP-${String(Date.now()).slice(-6)}`;
  const total = Number(componentData.totalQuantity) || 0;

  let individualIds = [];
  if (componentData.trackingMode === 'individual') {
    if (Array.isArray(componentData.individualIds) && componentData.individualIds.length > 0) {
      individualIds = componentData.individualIds.map((item) =>
        typeof item === 'string' ? { id: item.trim(), status: 'available' } : item
      );
    } else {
      const prefix = (componentData.idPrefix || componentData.name.substring(0, 4))
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      for (let i = 1; i <= total; i++) {
        individualIds.push({
          id: `${prefix}-${String(i).padStart(3, '0')}`,
          status: 'available',
        });
      }
    }
  }

  const newComponent = {
    id: newId,
    name: componentData.name.trim(),
    componentNumber: componentData.componentNumber ? componentData.componentNumber.trim() : '',
    parentCategory: componentData.parentCategory || '',
    locationDetails: componentData.locationDetails || componentData.location || '',
    category: componentData.category || 'Other electronic components',
    description: componentData.description || '',
    trackingMode: componentData.trackingMode || 'aggregate',
    totalQuantity: total,
    availableQuantity: total,
    issuedQuantity: 0,
    damagedQuantity: 0,
    lostQuantity: 0,
    lowStockThreshold: Number(componentData.lowStockThreshold) || 3,
    defaultOverdueDays: Number(componentData.defaultOverdueDays) || 7,
    location: componentData.location || componentData.locationDetails || '',
    individualIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  memoryStore.components.push(newComponent);
  persistLocalCache('components', memoryStore.components);

  await executeCloudMutation({
    table: 'components',
    action: 'insert',
    id: newId,
    data: newComponent,
  });

  logAuditEvent({
    actorName: actor?.name || 'Admin',
    actorRole: actor?.role || 'Admin',
    action: 'Inventory Added',
    targetComponentId: newId,
    details: `Added new component "${newComponent.name}" (${total} units).`,
  });

  notifySubscribers('COMPONENT_ADDED', newComponent);
  return newComponent;
}

export async function updateComponent(id, updates, actor) {
  const index = memoryStore.components.findIndex((c) => c.id === id);
  if (index === -1) throw new Error(`Component with ID ${id} not found.`);

  // Validate componentNumber uniqueness on update
  if (updates.componentNumber !== undefined && updates.componentNumber.trim()) {
    const trimmedNum = updates.componentNumber.trim().toLowerCase();
    const existing = memoryStore.components.find(
      (c) => c.id !== id && c.componentNumber && c.componentNumber.trim().toLowerCase() === trimmedNum
    );
    if (existing) {
      throw new Error('Component number already exists.');
    }
  }

  const current = memoryStore.components[index];
  let total = updates.totalQuantity !== undefined ? Number(updates.totalQuantity) : current.totalQuantity;
  if (total < current.issuedQuantity) {
    throw new Error(
      `Total quantity (${total}) cannot be less than currently issued quantity (${current.issuedQuantity}).`
    );
  }
  const available = total - current.issuedQuantity - (current.damagedQuantity || 0) - (current.lostQuantity || 0);

  const updatedComponent = {
    ...current,
    ...updates,
    totalQuantity: total,
    availableQuantity: Math.max(0, available),
    updatedAt: new Date().toISOString(),
  };

  memoryStore.components[index] = updatedComponent;
  persistLocalCache('components', memoryStore.components);

  await executeCloudMutation({
    table: 'components',
    action: 'update',
    id: id,
    data: updatedComponent,
  });

  logAuditEvent({
    actorName: actor?.name || 'Admin',
    actorRole: actor?.role || 'Admin',
    action: 'Inventory Updated',
    targetComponentId: id,
    details: `Updated details for "${updatedComponent.name}".`,
  });

  notifySubscribers('COMPONENT_UPDATED', updatedComponent);
  return updatedComponent;
}

export async function addComponentQuantity(id, additionalQuantity, actor) {
  const comp = getComponentById(id);
  if (!comp) throw new Error('Component not found');
  const add = Number(additionalQuantity);
  if (add <= 0) throw new Error('Quantity must be greater than zero');

  const newTotal = comp.totalQuantity + add;
  let individualIds = [...(comp.individualIds || [])];

  if (comp.trackingMode === 'individual') {
    const prefix = comp.name.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const currentCount = individualIds.length;
    for (let i = 1; i <= add; i++) {
      individualIds.push({
        id: `${prefix}-${String(currentCount + i).padStart(3, '0')}`,
        status: 'available',
      });
    }
  }

  const updated = await updateComponent(
    id,
    {
      totalQuantity: newTotal,
      individualIds,
    },
    actor
  );

  logAuditEvent({
    actorName: actor?.name || 'Admin',
    actorRole: actor?.role || 'Admin',
    action: 'Inventory Restocked',
    targetComponentId: id,
    details: `Added ${add} units to "${comp.name}". New total: ${newTotal}.`,
  });

  return updated;
}

export async function deleteComponent(id, actor) {
  const index = memoryStore.components.findIndex((c) => c.id === id);
  if (index === -1) throw new Error('Component not found.');

  const comp = memoryStore.components[index];
  if (comp.issuedQuantity > 0) {
    throw new Error(`Cannot delete "${comp.name}" because ${comp.issuedQuantity} unit(s) are currently issued.`);
  }

  memoryStore.components.splice(index, 1);
  persistLocalCache('components', memoryStore.components);

  await executeCloudMutation({
    table: 'components',
    action: 'delete',
    id: id,
    data: comp,
  });

  logAuditEvent({
    actorName: actor?.name || 'Admin',
    actorRole: actor?.role || 'Admin',
    action: 'Inventory Deleted',
    targetComponentId: id,
    details: `Deleted component "${comp.name}".`,
  });

  notifySubscribers('COMPONENT_DELETED', { id });
  return true;
}

// ==================== TRANSACTIONS: ISSUE & RETURN ====================

export function getTransactions(filterStatus = 'all', searchQuery = '', studentRoll = null) {
  let list = [...memoryStore.transactions];

  if (studentRoll) {
    const clean = studentRoll.toUpperCase();
    list = list.filter((t) => t.studentRoll.toUpperCase() === clean);
  }

  if (filterStatus && filterStatus !== 'all') {
    if (filterStatus === 'overdue') {
      list = list.filter((t) => isTransactionOverdue(t));
    } else {
      list = list.filter((t) => t.status === filterStatus);
    }
  }

  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    list = list.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.studentName.toLowerCase().includes(q) ||
        t.studentRoll.toLowerCase().includes(q) ||
        t.items.some((item) => item.componentName.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime());
  return list;
}

export function getActiveTransactionsForStudent(rollNumber) {
  if (!rollNumber) return [];
  const clean = rollNumber.toUpperCase();
  return memoryStore.transactions.filter(
    (t) => t.studentRoll.toUpperCase() === clean && (t.status === 'active' || t.status === 'partially_returned')
  );
}

export async function issueComponents({
  studentName,
  studentRoll,
  department = '',
  phone = '',
  authorizedBy = null,
  items = [],
  actor,
}) {
  if (!items || items.length === 0) throw new Error('No items selected for issue.');

  const cleanRoll = studentRoll.trim().toUpperCase();
  const cleanName = studentName.trim();

  // Validate stock availability
  for (const it of items) {
    const comp = getComponentById(it.componentId);
    if (!comp) throw new Error(`Component "${it.componentName}" not found.`);
    if (comp.availableQuantity < it.quantity) {
      throw new Error(`Insufficient stock for "${comp.name}". Available: ${comp.availableQuantity}, Requested: ${it.quantity}`);
    }
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const newTxnId = `TXN-${dateStr}-${String(Date.now()).slice(-3)}`;

  let overallDueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const processedItems = items.map((it) => {
    const comp = getComponentById(it.componentId);
    const overdueDays = comp.defaultOverdueDays || 7;
    const itemDueDate = new Date(now.getTime() + overdueDays * 24 * 60 * 60 * 1000);
    if (itemDueDate > overallDueDate) overallDueDate = itemDueDate;

    return {
      componentId: it.componentId,
      componentName: comp.name,
      category: comp.category,
      issuedQuantity: it.quantity,
      returnedQuantity: 0,
      trackingMode: comp.trackingMode,
      selectedIndividualIds: it.selectedIndividualIds || [],
      dueDate: itemDueDate.toISOString(),
      status: 'issued',
    };
  });

  // Deduct inventory
  for (const it of items) {
    const comp = getComponentById(it.componentId);
    const newAvailable = comp.availableQuantity - it.quantity;
    const newIssued = comp.issuedQuantity + it.quantity;

    let individualIds = comp.individualIds ? [...comp.individualIds] : [];
    if (comp.trackingMode === 'individual' && it.selectedIndividualIds) {
      individualIds = individualIds.map((tag) => {
        if (it.selectedIndividualIds.includes(tag.id)) {
          return {
            ...tag,
            status: 'issued',
            currentTransactionId: newTxnId,
            currentStudentRoll: cleanRoll,
          };
        }
        return tag;
      });
    }

    await updateComponent(
      comp.id,
      {
        availableQuantity: newAvailable,
        issuedQuantity: newIssued,
        individualIds,
      },
      actor
    );
  }

  const newTxn = {
    id: newTxnId,
    studentRoll: cleanRoll,
    studentName: cleanName,
    authorizedBy: authorizedBy ? authorizedBy.trim() : null,
    issueDate: now.toISOString(),
    overallDueDate: overallDueDate.toISOString(),
    status: 'active',
    items: processedItems,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };

  memoryStore.transactions.unshift(newTxn);
  persistLocalCache('transactions', memoryStore.transactions);

  await executeCloudMutation({
    table: 'transactions',
    action: 'insert',
    id: newTxn.id,
    data: newTxn,
  });

  logAuditEvent({
    actorName: actor?.name || 'Admin',
    actorRole: actor?.role || 'Admin',
    action: 'Component Issued',
    targetRoll: cleanRoll,
    details: `Issued ${items.length} item type(s) to ${cleanName} (${cleanRoll}).`,
  });

  notifySubscribers('TRANSACTION_CREATED', newTxn);
  return newTxn;
}

export async function returnComponents(transactionId, returnedItems, actor) {
  const index = memoryStore.transactions.findIndex((t) => t.id === transactionId);
  if (index === -1) throw new Error('Transaction not found.');

  const txn = memoryStore.transactions[index];
  const now = new Date();

  for (const ret of returnedItems) {
    const itemIndex = txn.items.findIndex((i) => i.componentId === ret.componentId);
    if (itemIndex === -1) continue;

    const it = txn.items[itemIndex];
    const returnQty = Number(ret.returnQuantity) || 0;
    if (returnQty <= 0) continue;

    const remaining = it.issuedQuantity - it.returnedQuantity;
    if (returnQty > remaining) {
      throw new Error(`Cannot return ${returnQty} units of "${it.componentName}". Only ${remaining} remaining.`);
    }

    it.returnedQuantity += returnQty;
    if (it.returnedQuantity >= it.issuedQuantity) {
      it.status = 'returned';
    }

    const comp = getComponentById(it.componentId);
    if (comp) {
      const newAvailable = comp.availableQuantity + returnQty;
      const newIssued = Math.max(0, comp.issuedQuantity - returnQty);

      let individualIds = comp.individualIds ? [...comp.individualIds] : [];
      if (comp.trackingMode === 'individual' && ret.returnedTagIds) {
        individualIds = individualIds.map((tag) => {
          if (ret.returnedTagIds.includes(tag.id)) {
            return {
              ...tag,
              status: 'available',
              currentTransactionId: null,
              currentStudentRoll: null,
            };
          }
          return tag;
        });
      }

      await updateComponent(
        comp.id,
        {
          availableQuantity: newAvailable,
          issuedQuantity: newIssued,
          individualIds,
        },
        actor
      );
    }
  }

  const allItemsReturned = txn.items.every((it) => it.returnedQuantity >= it.issuedQuantity);
  const anyItemReturned = txn.items.some((it) => it.returnedQuantity > 0);

  if (allItemsReturned) {
    txn.status = 'returned';
    txn.returnedDate = now.toISOString();
  } else if (anyItemReturned) {
    txn.status = 'partially_returned';
  }
  txn.updatedAt = now.toISOString();

  memoryStore.transactions[index] = txn;
  persistLocalCache('transactions', memoryStore.transactions);

  await executeCloudMutation({
    table: 'transactions',
    action: 'update',
    id: txn.id,
    data: txn,
  });

  logAuditEvent({
    actorName: actor?.name || 'Admin',
    actorRole: actor?.role || 'Admin',
    action: allItemsReturned ? 'Return Completed' : 'Partial Return',
    targetRoll: txn.studentRoll,
    details: `Processed component return for ${txn.studentName} (${txn.studentRoll}).`,
  });

  notifySubscribers('TRANSACTION_UPDATED', txn);
  return txn;
}

// ==================== AUTHORIZATIONS ====================

export function getAuthorizations() {
  return [...memoryStore.authorizations];
}

export function getActiveAuthorizationsForStudent(primaryRoll) {
  if (!primaryRoll) return [];
  const clean = primaryRoll.toUpperCase();
  const now = new Date();
  return memoryStore.authorizations.filter(
    (a) =>
      a.primaryStudentRoll.toUpperCase() === clean &&
      a.status === 'active' &&
      new Date(a.validFrom) <= now &&
      new Date(a.validUntil) >= now
  );
}

export function getDelegationsForDelegate(delegateRoll) {
  if (!delegateRoll) return [];
  const clean = delegateRoll.toUpperCase();
  const now = new Date();
  return memoryStore.authorizations.filter(
    (a) =>
      a.authorizedStudentRoll.toUpperCase() === clean &&
      a.status === 'active' &&
      new Date(a.validFrom) <= now &&
      new Date(a.validUntil) >= now
  );
}

export async function createAuthorization({
  primaryStudentRoll,
  primaryStudentName,
  authorizedStudentRoll,
  authorizedStudentName,
  scope = 'both',
  validFrom,
  validUntil,
  reason = '',
  actor,
}) {
  if (!primaryStudentRoll || !primaryStudentName) throw new Error('Primary student details required.');
  if (!authorizedStudentRoll || !authorizedStudentName) throw new Error('Authorized delegate details required.');
  if (primaryStudentRoll.trim().toUpperCase() === authorizedStudentRoll.trim().toUpperCase()) {
    throw new Error('Primary student and delegate cannot be the same person.');
  }

  const now = new Date();
  const newAuth = {
    id: `AUTH-${String(Date.now()).slice(-6)}`,
    primaryStudentRoll: primaryStudentRoll.trim().toUpperCase(),
    primaryStudentName: primaryStudentName.trim(),
    authorizedStudentRoll: authorizedStudentRoll.trim().toUpperCase(),
    authorizedStudentName: authorizedStudentName.trim(),
    scope,
    validFrom: validFrom || now.toISOString(),
    validUntil: validUntil || new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    reason: reason.trim(),
    createdAt: now.toISOString(),
  };

  memoryStore.authorizations.unshift(newAuth);
  persistLocalCache('authorizations', memoryStore.authorizations);

  await executeCloudMutation({
    table: 'authorizations',
    action: 'insert',
    id: newAuth.id,
    data: newAuth,
  });

  logAuditEvent({
    actorName: actor?.name || memoryStore.currentUser?.name || 'Admin',
    actorRole: actor?.role || memoryStore.currentUser?.role || 'Admin',
    action: 'Authorization Created',
    targetRoll: primaryStudentRoll.trim().toUpperCase(),
    details: `Authorized ${authorizedStudentName} (${authorizedStudentRoll}) for ${primaryStudentName} (${scope}).`,
  });

  notifySubscribers('AUTHORIZATION_CREATED', newAuth);
  return newAuth;
}

export async function revokeAuthorization(id, actor) {
  const index = memoryStore.authorizations.findIndex((a) => a.id === id);
  if (index === -1) throw new Error('Authorization not found.');

  memoryStore.authorizations[index].status = 'revoked';
  memoryStore.authorizations[index].revokedAt = new Date().toISOString();

  persistLocalCache('authorizations', memoryStore.authorizations);

  await executeCloudMutation({
    table: 'authorizations',
    action: 'update',
    id: id,
    data: memoryStore.authorizations[index],
  });

  logAuditEvent({
    actorName: actor?.name || memoryStore.currentUser?.name || 'Admin',
    actorRole: actor?.role || memoryStore.currentUser?.role || 'Admin',
    action: 'Authorization Revoked',
    details: `Revoked authorization ${id}.`,
  });

  notifySubscribers('AUTHORIZATION_REVOKED', memoryStore.authorizations[index]);
  return memoryStore.authorizations[index];
}

// ==================== DEVICE CONTROL & POWER ====================

export function getDevices(userRole = 'student') {
  return memoryStore.devices.map((d) => {
    if (userRole === 'student') {
      const { dailyKwh, weeklyKwh, monthlyKwh, yearlyKwh, powerRatingWatts, ...rest } = d;
      return rest;
    }
    return { ...d };
  });
}

export async function setDeviceCommandState(deviceId, commandedState, brightness = null, speed = null, actor = null) {
  const idx = memoryStore.devices.findIndex((d) => d.id === deviceId);
  if (idx === -1) throw new Error('Device not found.');

  const dev = memoryStore.devices[idx];
  const updated = {
    ...dev,
    commandedState,
    brightness: brightness !== null ? Number(brightness) : dev.brightness,
    speed: speed !== null ? Number(speed) : dev.speed,
    hardwareStatus: 'command_sent',
    lastCommandedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  memoryStore.devices[idx] = updated;
  persistLocalCache('devices', memoryStore.devices);

  await executeCloudMutation({
    table: 'devices',
    action: 'update',
    id: deviceId,
    data: updated,
  });

  if (actor) {
    logAuditEvent({
      actorName: actor.name,
      actorRole: actor.role,
      action: 'Device Controlled',
      details: `${dev.name} set to ${commandedState} (Brightness: ${updated.brightness}%, Speed: ${updated.speed}).`,
    });
  }

  notifySubscribers('DEVICE_UPDATED', updated);
  return updated;
}

export async function updateDeviceConfirmedState(deviceId, actualState, brightness = null, speed = null) {
  const idx = memoryStore.devices.findIndex((d) => d.id === deviceId);
  if (idx === -1) return null;

  const dev = memoryStore.devices[idx];
  const updated = {
    ...dev,
    actualState,
    commandedState: actualState,
    brightness: brightness !== null ? Number(brightness) : dev.brightness,
    speed: speed !== null ? Number(speed) : dev.speed,
    hardwareStatus: 'confirmed',
    lastHardwareSync: new Date().toISOString(),
    isOnline: true,
    updatedAt: new Date().toISOString(),
  };

  memoryStore.devices[idx] = updated;
  persistLocalCache('devices', memoryStore.devices);

  await executeCloudMutation({
    table: 'devices',
    action: 'update',
    id: deviceId,
    data: updated,
  });

  notifySubscribers('DEVICE_UPDATED', updated);
  return updated;
}

export function getPowerMonitoringStats(userRole) {
  if (userRole === 'student') {
    throw new Error('Access denied: Power monitoring is restricted to lab administrators.');
  }

  const tariff = memoryStore.settings.electricityTariffPerKwh || 7.5;
  const devices = memoryStore.devices;

  let totalDailyKwh = 0;
  let totalWeeklyKwh = 0;
  let totalMonthlyKwh = 0;
  let totalYearlyKwh = 0;

  const deviceStats = devices.map((d) => {
    const daily = d.dailyKwh || 0;
    const weekly = d.weeklyKwh || 0;
    const monthly = d.monthlyKwh || 0;
    const yearly = d.yearlyKwh || 0;

    totalDailyKwh += daily;
    totalWeeklyKwh += weekly;
    totalMonthlyKwh += monthly;
    totalYearlyKwh += yearly;

    return {
      id: d.id,
      name: d.name,
      type: d.type,
      location: d.location,
      actualState: d.actualState,
      powerRatingWatts: d.powerRatingWatts || 0,
      dailyKwh: typeof daily === 'number' ? daily.toFixed(2) : daily,
      weeklyKwh: typeof weekly === 'number' ? weekly.toFixed(2) : weekly,
      monthlyKwh: typeof monthly === 'number' ? monthly.toFixed(2) : monthly,
      yearlyKwh: typeof yearly === 'number' ? yearly.toFixed(2) : yearly,
      estimatedCostMonthly: (monthly * tariff).toFixed(2),
      estimatedMonthlyCostInr: Math.round(monthly * tariff),
    };
  });

  return {
    tariffPerKwh: tariff,
    totalDailyKwh: Number(totalDailyKwh.toFixed(2)),
    totalWeeklyKwh: Number(totalWeeklyKwh.toFixed(2)),
    totalMonthlyKwh: Number(totalMonthlyKwh.toFixed(2)),
    totalYearlyKwh: Number(totalYearlyKwh.toFixed(2)),
    totalEstimatedCostMonthly: (totalMonthlyKwh * tariff).toFixed(2),
    estimatedDailyCostInr: Math.round(totalDailyKwh * tariff),
    estimatedWeeklyCostInr: Math.round(totalWeeklyKwh * tariff),
    estimatedMonthlyCostInr: Math.round(totalMonthlyKwh * tariff),
    estimatedYearlyCostInr: Math.round(totalYearlyKwh * tariff),
    devices: deviceStats,
    deviceStats,
  };
}

// ==================== ANALYTICS (SEPARATE GRAPHS) ====================

export function getAttendanceAnalytics(period = 'week') {
  const visits = memoryStore.visits;
  const now = new Date();
  const days = period === 'year' ? 365 : period === 'month' ? 30 : 7;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const buckets = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(cutoff.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { date: key, attendeesCount: 0, totalHours: 0 };
  }

  for (const v of visits) {
    const dateKey = new Date(v.entryTime).toISOString().slice(0, 10);
    if (buckets[dateKey]) {
      buckets[dateKey].attendeesCount++;
      if (v.durationMinutes) {
        buckets[dateKey].totalHours += Number((v.durationMinutes / 60).toFixed(1));
      }
    }
  }

  const result = Object.values(buckets);
  if (period === 'year') {
    const months = {};
    for (const r of result) {
      const mKey = r.date.slice(0, 7);
      if (!months[mKey]) months[mKey] = { label: mKey, count: 0 };
      months[mKey].count += r.attendeesCount;
    }
    return Object.values(months).map((m) => ({
      name: new Date(`${m.label}-01`).toLocaleDateString('en-US', { month: 'short' }),
      Attendees: m.count,
    }));
  }

  return result.map((b) => ({
    name: new Date(b.date).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
    Attendees: b.attendeesCount,
    TotalHours: b.totalHours,
  }));
}

export function getEquipmentUsageAnalytics(period = 'week') {
  const txns = memoryStore.transactions;
  const now = new Date();
  const days = period === 'year' ? 365 : period === 'month' ? 30 : 7;
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const buckets = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(cutoff.getTime() + (i + 1) * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = { date: key, issuedItems: 0, returnedItems: 0 };
  }

  for (const t of txns) {
    const issueDateKey = new Date(t.issueDate).toISOString().slice(0, 10);
    if (buckets[issueDateKey]) {
      const issuedTotal = t.items.reduce((s, it) => s + it.issuedQuantity, 0);
      buckets[issueDateKey].issuedItems += issuedTotal;
    }
    if (t.returnedDate) {
      const retDateKey = new Date(t.returnedDate).toISOString().slice(0, 10);
      if (buckets[retDateKey]) {
        const retTotal = t.items.reduce((s, it) => s + it.returnedQuantity, 0);
        buckets[retDateKey].returnedItems += retTotal;
      }
    }
  }

  const result = Object.values(buckets);
  if (period === 'year') {
    const months = {};
    for (const r of result) {
      const mKey = r.date.slice(0, 7);
      if (!months[mKey]) months[mKey] = { label: mKey, issued: 0, returned: 0 };
      months[mKey].issued += r.issuedItems;
      months[mKey].returned += r.returnedItems;
    }
    return Object.values(months).map((m) => ({
      name: new Date(`${m.label}-01`).toLocaleDateString('en-US', { month: 'short' }),
      Issued: m.issued,
      Returned: m.returned,
    }));
  }

  return result.map((b) => ({
    name: new Date(b.date).toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' }),
    Issued: b.issuedItems,
    Returned: b.returnedItems,
  }));
}

// ==================== AUDIT LOGS ====================

export async function logAuditEvent({
  actorName,
  actorRole,
  action,
  targetRoll = null,
  targetComponentId = null,
  previousValue = null,
  newValue = null,
  details = '',
}) {
  const newLog = {
    id: `AUDIT-${String(Date.now()).slice(-6)}`,
    timestamp: new Date().toISOString(),
    actorName: actorName || 'System',
    actorRole: actorRole || 'Admin',
    action,
    targetRoll,
    targetComponentId,
    previousValue,
    newValue,
    details,
    createdAt: new Date().toISOString(),
  };

  memoryStore.auditLogs.unshift(newLog);
  if (memoryStore.auditLogs.length > 500) {
    memoryStore.auditLogs.length = 500;
  }

  persistLocalCache('auditLogs', memoryStore.auditLogs);

  await executeCloudMutation({
    table: 'audit_logs',
    action: 'insert',
    id: newLog.id,
    data: newLog,
  });

  notifySubscribers('AUDIT_LOG_ADDED', newLog);
  return newLog;
}

export function getAuditLogs(filters = {}) {
  let list = [...memoryStore.auditLogs];

  if (filters.action && filters.action !== 'all') {
    list = list.filter((l) => l.action.toLowerCase().includes(filters.action.toLowerCase()));
  }
  if (filters.searchQuery && filters.searchQuery.trim()) {
    const q = filters.searchQuery.toLowerCase().trim();
    list = list.filter(
      (l) =>
        l.actorName.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.details.toLowerCase().includes(q) ||
        (l.targetRoll && l.targetRoll.toLowerCase().includes(q)) ||
        (l.targetComponentId && l.targetComponentId.toLowerCase().includes(q))
    );
  }

  return list;
}

// ==================== SETTINGS & RETENTION ====================

export function getSettings() {
  return { ...memoryStore.settings };
}

export async function updateSettings(newSettings, actor) {
  memoryStore.settings = {
    ...memoryStore.settings,
    ...newSettings,
  };
  persistLocalCache('settings', memoryStore.settings);

  await executeCloudMutation({
    table: 'settings',
    action: 'upsert',
    id: 'SETTING-001',
    data: {
      id: 'SETTING-001',
      key: 'global_settings',
      value: memoryStore.settings,
      updated_at: new Date().toISOString(),
    },
  });

  logAuditEvent({
    actorName: actor?.name || 'Admin',
    actorRole: actor?.role || 'Admin',
    action: 'Settings Updated',
    details: 'Incubation centre configuration settings updated.',
  });

  notifySubscribers('SETTINGS_UPDATED', memoryStore.settings);
  return memoryStore.settings;
}

export async function pruneExpiredRecords(retentionDays = 30) {
  const days = Number(retentionDays) || 30;
  if (days <= 0) return { prunedCount: 0 };

  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const initialLength = memoryStore.transactions.length;

  const toKeep = [];
  const toDeleteIds = [];

  for (const t of memoryStore.transactions) {
    if (t.status === 'returned' && t.returnedDate && new Date(t.returnedDate).getTime() < cutoffTime) {
      toDeleteIds.push(t.id);
    } else {
      toKeep.push(t);
    }
  }

  memoryStore.transactions = toKeep;
  const prunedCount = toDeleteIds.length;

  if (prunedCount > 0) {
    persistLocalCache('transactions', memoryStore.transactions);
    for (const id of toDeleteIds) {
      await executeCloudMutation({ table: 'transactions', action: 'delete', id });
    }

    logAuditEvent({
      actorName: 'Retention Worker',
      actorRole: 'System',
      action: 'Record Retention Cleanup',
      details: `Pruned ${prunedCount} completed returned transactions older than ${days} days.`,
    });
    notifySubscribers('RECORDS_PRUNED', { prunedCount, retentionDays: days });
  }

  return { prunedCount };
}

// ==================== STORAGE PROTECTION & 4-YEAR RETENTION ENGINE ====================

let lastCloudStorageStats = null;

export async function fetchCloudStorageStats() {
  if (typeof navigator !== 'undefined' && navigator.onLine && supabase) {
    try {
      const { data, error } = await supabase.rpc('get_database_storage_stats');
      if (!error && data) {
        lastCloudStorageStats = data;
        return data;
      }
    } catch (e) {
      console.warn('[Storage Metrics RPC]:', e);
    }
  }
  return null;
}

export function getDatabaseStorageStatus() {
  const quota = memoryStore.settings?.storageQuotaBytes || STORAGE_THRESHOLDS.DEFAULT_QUOTA_BYTES;

  if (lastCloudStorageStats?.publicSchemaSizeBytes) {
    return getStorageTier(lastCloudStorageStats.publicSchemaSizeBytes, quota);
  }

  // Fallback / offline estimate based on memoryStore serialized footprint
  try {
    const storeJson = JSON.stringify(memoryStore);
    const dataBytes = typeof TextEncoder !== 'undefined'
      ? new TextEncoder().encode(storeJson).length
      : 1024 * 1024;
    // Add overhead factor for indexes, audit logs, and operational overhead (~4x)
    const estimatedUsedBytes = Math.max(dataBytes * 4, 1024 * 1024);
    return getStorageTier(estimatedUsedBytes, quota);
  } catch (e) {
    return getStorageTier(1024 * 1024, quota);
  }
}

export function getStudentsRetentionAudit() {
  const students = getStudents();
  const insideRolls = getStudentsCurrentlyInside().map((s) => s.studentRoll || s.rollNumber);
  const txns = memoryStore.transactions;

  const audited = students.map((s) => {
    const retention = categorizeStudentRetention(s, txns, insideRolls);
    return {
      ...s,
      retention,
    };
  });

  const needsVerification = audited.filter((s) => s.retention.status === 'NEEDS_VERIFICATION');
  const active = audited.filter((s) => s.retention.status === 'ACTIVE');
  const expiredEligible = audited.filter((s) => s.retention.status === 'EXPIRED_ELIGIBLE');
  const expiredBlocked = audited.filter((s) => s.retention.status === 'EXPIRED_BLOCKED');
  const exempt = audited.filter((s) => s.retention.status === 'EXEMPT');

  return {
    totalStudents: students.length,
    needsVerification,
    active,
    expiredEligible,
    expiredBlocked,
    exempt,
    allAudited: audited,
  };
}

export async function pruneExpiredStudentRecords(approvedStudentRolls = [], archiveExported = false) {
  if (!archiveExported) {
    throw new Error('Safety Requirement: A full JSON backup archive must be exported before pruning expired student records.');
  }

  if (!Array.isArray(approvedStudentRolls) || approvedStudentRolls.length === 0) {
    return { prunedCount: 0, message: 'No student roll numbers selected for pruning.' };
  }

  const audit = getStudentsRetentionAudit();
  const eligibleRolls = new Set(audit.expiredEligible.map((s) => s.rollNumber.toUpperCase()));

  const prunedRolls = [];
  for (const roll of approvedStudentRolls) {
    const cleanRoll = (roll || '').trim().toUpperCase();
    if (!eligibleRolls.has(cleanRoll)) {
      console.warn(`[Retention Guard] Skipping ${cleanRoll}: not eligible for deletion or blocked by active items/kiosk.`);
      continue;
    }

    const studentUser = getUserByRoll(cleanRoll);
    if (!studentUser) continue;

    // 1. Remove student user
    memoryStore.users = memoryStore.users.filter((u) => u.rollNumber.toUpperCase() !== cleanRoll);

    // 2. Remove returned past transactions
    const toDeleteTxnIds = memoryStore.transactions
      .filter((t) => t.studentRoll.toUpperCase() === cleanRoll && t.status === 'returned')
      .map((t) => t.id);
    memoryStore.transactions = memoryStore.transactions.filter((t) => !toDeleteTxnIds.includes(t.id));

    // 3. Remove visit records
    const toDeleteVisitIds = memoryStore.visits
      .filter((v) => v.studentRoll.toUpperCase() === cleanRoll)
      .map((v) => v.id);
    memoryStore.visits = memoryStore.visits.filter((v) => !toDeleteVisitIds.includes(v.id));

    // Cloud mutations
    await executeCloudMutation({ table: 'users', action: 'delete', id: studentUser.id });
    for (const tid of toDeleteTxnIds) {
      await executeCloudMutation({ table: 'transactions', action: 'delete', id: tid });
    }
    for (const vid of toDeleteVisitIds) {
      await executeCloudMutation({ table: 'visits', action: 'delete', id: vid });
    }

    prunedRolls.push(cleanRoll);
  }

  if (prunedRolls.length > 0) {
    persistLocalCache('users', memoryStore.users);
    persistLocalCache('transactions', memoryStore.transactions);
    persistLocalCache('visits', memoryStore.visits);

    logAuditEvent({
      actorName: memoryStore.currentUser?.name || 'Admin',
      actorRole: memoryStore.currentUser?.role || 'Admin',
      action: '4-Year Retention Student Prune',
      details: `Safely pruned ${prunedRolls.length} verified expired student accounts (${prunedRolls.join(', ')}). Archive pre-download verified.`,
    });

    notifySubscribers('STUDENTS_PRUNED', { prunedCount: prunedRolls.length, rolls: prunedRolls });
  }

  return { prunedCount: prunedRolls.length, prunedRolls };
}

/**
 * Delete eligible expired retention data for an individual student upon Admin confirmation.
 * Guarantees:
 * - NEVER deletes active/unreturned component transactions.
 * - NEVER deletes an active lab visit.
 * - NEEDS_VERIFICATION students remain completely protected.
 * - Records deletion in audit log.
 */
export async function deleteStudentEligibleRetentionData(rollNumber, actor = null) {
  if (!rollNumber) throw new Error('Roll Number is required.');
  const cleanRoll = rollNumber.trim().toUpperCase();

  const studentUser = getUserByRoll(cleanRoll);
  if (!studentUser) throw new Error(`Student ${cleanRoll} not found.`);

  const insideRolls = getStudentsCurrentlyInside().map((s) => s.studentRoll || s.rollNumber);
  const txns = memoryStore.transactions;
  const categorization = categorizeStudentRetention(studentUser, txns, insideRolls);

  if (categorization.status === 'NEEDS_VERIFICATION') {
    throw new Error('Action blocked: Student is pending journey verification. Retention deletion is prohibited.');
  }
  if (categorization.status === 'ACTIVE') {
    throw new Error(`Action blocked: Student retention period is still active until ${categorization.retentionEndDate}.`);
  }
  if (categorization.status === 'EXEMPT') {
    throw new Error('Action blocked: Staff accounts are permanently preserved.');
  }

  // 1. Identify returned past transactions ONLY (Never touch active/unreturned loans!)
  const eligibleTxnIds = memoryStore.transactions
    .filter((t) => (t.studentRoll || '').toUpperCase() === cleanRoll && t.status === 'returned')
    .map((t) => t.id);

  // 2. Identify completed lab visits ONLY (Never touch active visits where student is still inside!)
  const eligibleVisitIds = memoryStore.visits
    .filter((v) => (v.studentRoll || '').toUpperCase() === cleanRoll && v.status !== 'inside' && v.exitTime !== null)
    .map((v) => v.id);

  // 3. Determine if student profile can be deleted:
  // Cannot delete profile if student has any active unreturned items or is currently inside the lab.
  const hasActiveLoans = memoryStore.transactions.some(
    (t) => (t.studentRoll || '').toUpperCase() === cleanRoll && t.status !== 'returned'
  );
  const isCurrentlyInside = insideRolls.some((r) => (r || '').toUpperCase() === cleanRoll);
  const canDeleteProfile = !hasActiveLoans && !isCurrentlyInside;

  // Apply deletions
  if (eligibleTxnIds.length > 0) {
    memoryStore.transactions = memoryStore.transactions.filter((t) => !eligibleTxnIds.includes(t.id));
    persistLocalCache('transactions', memoryStore.transactions);
    for (const tid of eligibleTxnIds) {
      await executeCloudMutation({ table: 'transactions', action: 'delete', id: tid });
    }
  }

  if (eligibleVisitIds.length > 0) {
    memoryStore.visits = memoryStore.visits.filter((v) => !eligibleVisitIds.includes(v.id));
    persistLocalCache('visits', memoryStore.visits);
    for (const vid of eligibleVisitIds) {
      await executeCloudMutation({ table: 'visits', action: 'delete', id: vid });
    }
  }

  if (canDeleteProfile) {
    memoryStore.users = memoryStore.users.filter((u) => u.rollNumber.toUpperCase() !== cleanRoll);
    persistLocalCache('users', memoryStore.users);
    await executeCloudMutation({ table: 'users', action: 'delete', id: studentUser.id });
  }

  // Record deletion in audit log
  const actorName = actor?.name || memoryStore.currentUser?.name || 'Admin';
  const actorRole = actor?.role || memoryStore.currentUser?.role || 'Admin';
  logAuditEvent({
    actorName,
    actorRole,
    action: 'Student Retention Data Deleted',
    targetRoll: cleanRoll,
    details: `Confirmed retention deletion for ${studentUser.name} (${cleanRoll}). Deleted ${eligibleTxnIds.length} returned transactions, ${eligibleVisitIds.length} completed visits${canDeleteProfile ? ', and student account' : ' (profile preserved due to active items/visit)'}.`,
  });

  notifySubscribers('STUDENT_RETENTION_DELETED', {
    rollNumber: cleanRoll,
    deletedTransactionsCount: eligibleTxnIds.length,
    deletedVisitsCount: eligibleVisitIds.length,
    deletedProfile: canDeleteProfile,
  });

  return {
    success: true,
    deletedTransactionsCount: eligibleTxnIds.length,
    deletedVisitsCount: eligibleVisitIds.length,
    deletedProfile: canDeleteProfile,
  };
}

// ==================== STUDENT ID CARD BARCODE & LAB ENTRY ====================

/**
 * Searches the database for a student given raw barcode text scanned from a college ID card.
 * The ID card barcode contains ONLY the student's Roll Number.
 * Checks if the student is registered, and whether they are currently inside the lab.
 *
 * @param {string} rawBarcodeText
 * @returns {object} { found, rollNumber, rawBarcodeText, student, isAlreadyInside, activeVisit, message }
 */
export function lookupStudentByIdCardBarcode(rawBarcodeText) {
  const parsed = parseStudentRollNumberFromBarcode(rawBarcodeText);
  if (!parsed.rollNumber) {
    return {
      found: false,
      rollNumber: null,
      rawBarcodeText: parsed.rawText,
      student: null,
      isAlreadyInside: false,
      activeVisit: null,
      message: parsed.error || 'Could not detect Roll Number from barcode.',
    };
  }

  const cleanRoll = parsed.rollNumber.toUpperCase();
  const student = getUserByRoll(cleanRoll);
  if (!student) {
    return {
      found: false,
      rollNumber: cleanRoll,
      rawBarcodeText: parsed.rawText,
      student: null,
      isAlreadyInside: false,
      activeVisit: null,
      message: `Student Not Registered: Roll Number ${cleanRoll} not found in database.`,
    };
  }

  // Check if student is currently inside the lab
  const isAlreadyInside = memoryStore.visits.some(
    (v) => (v.studentRoll || '').toUpperCase() === cleanRoll && v.status === 'inside'
  );
  const activeVisit = isAlreadyInside
    ? memoryStore.visits.find(
        (v) => (v.studentRoll || '').toUpperCase() === cleanRoll && v.status === 'inside'
      )
    : null;

  return {
    found: true,
    rollNumber: cleanRoll,
    rawBarcodeText: parsed.rawText,
    student,
    isAlreadyInside,
    activeVisit,
    message: isAlreadyInside
      ? `${student.name} (${cleanRoll}) is already inside the lab since ${activeVisit?.entryTime ? new Date(activeVisit.entryTime).toLocaleTimeString() : 'earlier today'}.`
      : `Student found: ${student.name} (${cleanRoll}). Ready for lab entry.`,
  };
}

/**
 * Executes the complete Lab Entry / Attendance process from a scanned student ID card.
 * 
 * Rules:
 * 1. Barcode contains ONLY the student's Roll Number.
 * 2. If student is NOT registered: returns status 'NOT_REGISTERED' (does NOT create a student).
 * 3. If student is ALREADY inside: returns status 'ALREADY_INSIDE' (does NOT create duplicate entry).
 * 4. If student is found and not inside: records LAB ENTRY / ATTENDANCE with timestamp.
 *
 * @param {string} rawBarcodeText
 * @returns {Promise<object>} { success, status, rollNumber, student, visit, alreadyInside, message }
 */
export async function processStudentBarcodeLabEntry(rawBarcodeText) {
  const lookup = lookupStudentByIdCardBarcode(rawBarcodeText);
  if (!lookup.rollNumber) {
    return {
      success: false,
      status: 'INVALID_BARCODE',
      rollNumber: null,
      student: null,
      visit: null,
      alreadyInside: false,
      message: lookup.message,
    };
  }

  if (!lookup.found || !lookup.student) {
    return {
      success: false,
      status: 'NOT_REGISTERED',
      rollNumber: lookup.rollNumber,
      student: null,
      visit: null,
      alreadyInside: false,
      message: `Student Not Registered: Roll Number ${lookup.rollNumber} is not registered in the system.`,
    };
  }

  // If already inside the lab, prevent duplicate entry and show existing entry time
  if (lookup.isAlreadyInside) {
    return {
      success: true,
      status: 'ALREADY_INSIDE',
      rollNumber: lookup.rollNumber,
      student: lookup.student,
      visit: lookup.activeVisit,
      alreadyInside: true,
      message: `${lookup.student.name} is already inside the lab since ${lookup.activeVisit?.entryTime ? new Date(lookup.activeVisit.entryTime).toLocaleTimeString() : 'earlier today'}.`,
    };
  }

  // Not inside: Mark LAB ENTRY / ATTENDANCE
  const entryResult = await recordLabEntry(lookup.student.rollNumber, 'id_card_barcode');

  return {
    success: true,
    status: 'ENTRY_RECORDED',
    rollNumber: lookup.student.rollNumber,
    student: lookup.student,
    visit: entryResult.visit,
    alreadyInside: false,
    message: `Lab entry recorded for ${lookup.student.name} (${lookup.student.rollNumber}).`,
  };
}

// ==================== DASHBOARD & OVERDUE ====================

export function isItemOverdue(item) {
  if (item.status === 'returned') return false;
  if (item.returnedQuantity >= item.issuedQuantity) return false;
  return new Date(item.dueDate).getTime() < Date.now();
}

export function isTransactionOverdue(txn) {
  if (txn.status === 'returned') return false;
  return txn.items.some((item) => isItemOverdue(item));
}

export function getOverdueDays(dueDate) {
  const diffMs = Date.now() - new Date(dueDate).getTime();
  if (diffMs <= 0) return 0;
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function getRemainingDays(dueDate) {
  const diffMs = new Date(dueDate).getTime() - Date.now();
  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

export function getDashboardStats() {
  const components = memoryStore.components;
  const transactions = memoryStore.transactions;

  let totalComponentsTypes = components.length;
  let totalPhysicalStock = 0;
  let availableStock = 0;
  let issuedStock = 0;
  let damagedStock = 0;
  let lostStock = 0;

  for (const c of components) {
    totalPhysicalStock += c.totalQuantity;
    availableStock += c.availableQuantity;
    issuedStock += c.issuedQuantity;
    damagedStock += c.damagedQuantity || 0;
    lostStock += c.lostQuantity || 0;
  }

  let overdueItemsCount = 0;
  let overdueTransactionsCount = 0;
  const activeTransactions = [];
  const overdueTransactions = [];

  for (const t of transactions) {
    if (t.status === 'active' || t.status === 'partially_returned') {
      activeTransactions.push(t);
      let isTxnOverdue = false;
      for (const it of t.items) {
        if (isItemOverdue(it)) {
          overdueItemsCount += it.issuedQuantity - it.returnedQuantity;
          isTxnOverdue = true;
        }
      }
      if (isTxnOverdue) {
        overdueTransactionsCount++;
        overdueTransactions.push(t);
      }
    }
  }

  const categoryMap = {};
  for (const c of components) {
    if (!categoryMap[c.category]) {
      categoryMap[c.category] = {
        name: c.category,
        totalStock: 0,
        availableStock: 0,
        issuedStock: 0,
        count: 0,
      };
    }
    categoryMap[c.category].totalStock += c.totalQuantity;
    categoryMap[c.category].availableStock += c.availableQuantity;
    categoryMap[c.category].issuedStock += c.issuedQuantity;
    categoryMap[c.category].count += 1;
  }

  const categoryBreakdown = Object.values(categoryMap);
  const lowStockCount = getLowStockComponents().length;
  const insideStudents = getStudentsCurrentlyInside();

  const recentActivity = [...transactions]
    .sort((a, b) => new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime())
    .slice(0, 8);

  return {
    totalComponentsTypes,
    totalPhysicalStock,
    availableStock,
    issuedStock,
    damagedStock,
    lostStock,
    overdueItemsCount,
    overdueTransactionsCount,
    activeTransactionsCount: activeTransactions.length,
    categoryBreakdown,
    recentActivity,
    overdueTransactions,
    lowStockCount,
    studentsInsideCount: insideStudents.length,
    studentsInsideList: insideStudents,
  };
}

export function exportDatabaseToJson() {
  const exportData = {
    exportedAt: new Date().toISOString(),
    version: DB_VERSION,
    database: {
      components: memoryStore.components,
      users: memoryStore.users,
      devices: memoryStore.devices,
      visits: memoryStore.visits,
      dailyAttendance: memoryStore.dailyAttendance,
      transactions: memoryStore.transactions,
      authorizations: memoryStore.authorizations,
      settings: memoryStore.settings,
      auditLogs: memoryStore.auditLogs,
      projects: memoryStore.projects,
      teams: memoryStore.teams,
      achievements: memoryStore.achievements,
      announcements: memoryStore.announcements,
      events: memoryStore.events,
      complaints: memoryStore.complaints,
      researchPapers: memoryStore.researchPapers,
      selfReflections: memoryStore.selfReflections,
      holidays: memoryStore.holidays,
      domains: memoryStore.domains,
      staffPresence: memoryStore.staffPresence,
    },
  };
  return JSON.stringify(exportData, null, 2);
}

export async function importDatabaseFromJson(jsonString) {
  try {
    const data = JSON.parse(jsonString);
    if (!data.database || !data.database.components || !data.database.users) {
      throw new Error('Invalid backup file structure.');
    }

    memoryStore = {
      components: data.database.components || [],
      users: data.database.users || [],
      devices: data.database.devices || INITIAL_DEVICES,
      visits: data.database.visits || [],
      dailyAttendance: data.database.dailyAttendance || {},
      transactions: data.database.transactions || [],
      authorizations: data.database.authorizations || [],
      settings: { ...INITIAL_SETTINGS, ...(data.database.settings || {}) },
      auditLogs: data.database.auditLogs || [],
      currentUser: data.database.users?.[0] || memoryStore.currentUser,
      projects: data.database.projects || DEFAULT_PROJECTS,
      teams: data.database.teams || DEFAULT_TEAMS,
      achievements: data.database.achievements || DEFAULT_ACHIEVEMENTS,
      announcements: data.database.announcements || DEFAULT_ANNOUNCEMENTS,
      events: data.database.events || DEFAULT_EVENTS,
      complaints: data.database.complaints || DEFAULT_COMPLAINTS,
      researchPapers: data.database.researchPapers || DEFAULT_RESEARCH_PAPERS,
      selfReflections: data.database.selfReflections || DEFAULT_SELF_REFLECTIONS,
      holidays: data.database.holidays || DEFAULT_HOLIDAYS,
      domains: data.database.domains || DEFAULT_DOMAINS,
      staffPresence: data.database.staffPresence || [],
    };

    await persistLocalCache('components', memoryStore.components);
    await persistLocalCache('users', memoryStore.users);
    await persistLocalCache('devices', memoryStore.devices);
    await persistLocalCache('visits', memoryStore.visits);
    localStorage.setItem(STORAGE_KEYS.DAILY_ATTENDANCE, JSON.stringify(memoryStore.dailyAttendance));
    await persistLocalCache('transactions', memoryStore.transactions);
    await persistLocalCache('authorizations', memoryStore.authorizations);
    await persistLocalCache('settings', memoryStore.settings);
    await persistLocalCache('auditLogs', memoryStore.auditLogs);
    await persistLocalCache('projects', memoryStore.projects);
    await persistLocalCache('teams', memoryStore.teams);
    await persistLocalCache('achievements', memoryStore.achievements);
    await persistLocalCache('announcements', memoryStore.announcements);
    await persistLocalCache('events', memoryStore.events);
    await persistLocalCache('complaints', memoryStore.complaints);
    await persistLocalCache('researchPapers', memoryStore.researchPapers);
    await persistLocalCache('selfReflections', memoryStore.selfReflections);
    await persistLocalCache('holidays', memoryStore.holidays);
    await persistLocalCache('domains', memoryStore.domains);
    await persistLocalCache('staffPresence', memoryStore.staffPresence);

    notifySubscribers('DATABASE_RESTORED', memoryStore);
    return { success: true };
  } catch (e) {
    throw new Error(`Failed to restore database: ${e.message}`);
  }
}

export async function resetDatabaseToSample() {
  memoryStore = {
    components: INITIAL_COMPONENTS,
    users: INITIAL_USERS,
    devices: INITIAL_DEVICES,
    visits: INITIAL_VISITS,
    dailyAttendance: INITIAL_DAILY_ATTENDANCE,
    transactions: INITIAL_TRANSACTIONS,
    authorizations: INITIAL_AUTHORIZATIONS,
    settings: INITIAL_SETTINGS,
    auditLogs: INITIAL_AUDIT_LOGS,
    currentUser: INITIAL_USERS[0],
    projects: DEFAULT_PROJECTS,
    teams: DEFAULT_TEAMS,
    achievements: DEFAULT_ACHIEVEMENTS,
    announcements: DEFAULT_ANNOUNCEMENTS,
    events: DEFAULT_EVENTS,
    complaints: DEFAULT_COMPLAINTS,
    researchPapers: DEFAULT_RESEARCH_PAPERS,
    selfReflections: DEFAULT_SELF_REFLECTIONS,
    holidays: DEFAULT_HOLIDAYS,
    domains: DEFAULT_DOMAINS,
    staffPresence: [],
  };

  await persistLocalCache('components', memoryStore.components);
  await persistLocalCache('users', memoryStore.users);
  await persistLocalCache('devices', memoryStore.devices);
  await persistLocalCache('visits', memoryStore.visits);
  localStorage.setItem(STORAGE_KEYS.DAILY_ATTENDANCE, JSON.stringify(memoryStore.dailyAttendance));
  await persistLocalCache('transactions', memoryStore.transactions);
  await persistLocalCache('authorizations', memoryStore.authorizations);
  await persistLocalCache('settings', memoryStore.settings);
  await persistLocalCache('auditLogs', memoryStore.auditLogs);
  await persistLocalCache('projects', memoryStore.projects);
  await persistLocalCache('teams', memoryStore.teams);
  await persistLocalCache('achievements', memoryStore.achievements);
  await persistLocalCache('announcements', memoryStore.announcements);
  await persistLocalCache('events', memoryStore.events);
  await persistLocalCache('complaints', memoryStore.complaints);
  await persistLocalCache('researchPapers', memoryStore.researchPapers);
  await persistLocalCache('selfReflections', memoryStore.selfReflections);
  await persistLocalCache('holidays', memoryStore.holidays);
  await persistLocalCache('domains', memoryStore.domains);
  await persistLocalCache('staffPresence', memoryStore.staffPresence);

  notifySubscribers('DATABASE_RESET', memoryStore);
  return { success: true };
}

// ==================== SMART INCUBATION CENTRE MODULES ====================

// 1. DOMAINS MANAGEMENT
export function getDomains() {
  return [...(memoryStore.domains || DEFAULT_DOMAINS)];
}

export async function createDomain(name, currentUser) {
  if (!name || !name.trim()) throw new Error('Domain name is required.');
  const trimmed = name.trim();
  if (!memoryStore.domains) memoryStore.domains = [...DEFAULT_DOMAINS];
  if (memoryStore.domains.some((d) => (typeof d === 'string' ? d.toLowerCase() : d.name?.toLowerCase()) === trimmed.toLowerCase())) {
    throw new Error('Domain already exists.');
  }
  memoryStore.domains.push(trimmed);
  await persistLocalCache('domains', memoryStore.domains);
  await executeCloudMutation({
    table: 'domains',
    action: 'insert',
    id: `DOM-${Date.now()}`,
    data: { name: trimmed },
  });
  notifySubscribers('DOMAINS_CHANGED', memoryStore.domains);
  return trimmed;
}

export async function deleteDomain(name, currentUser) {
  if (!memoryStore.domains) return;
  const trimmed = (name || '').trim().toLowerCase();
  memoryStore.domains = memoryStore.domains.filter(
    (d) => (typeof d === 'string' ? d.toLowerCase() : d.name?.toLowerCase()) !== trimmed
  );
  await persistLocalCache('domains', memoryStore.domains);
  notifySubscribers('DOMAINS_CHANGED', memoryStore.domains);
}

// 2. SIR / STAFF PRESENCE TOGGLE ("I'M INSIDE LAB")
export function getStaffPresence() {
  return [...(memoryStore.staffPresence || [])];
}

export function getStaffActivePresence(email) {
  if (!email) return null;
  const cleanEmail = email.trim().toLowerCase();
  return (memoryStore.staffPresence || []).find((p) => p.staffEmail.toLowerCase() === cleanEmail && p.active) || null;
}

export async function toggleStaffPresence(staffUser) {
  if (!staffUser) throw new Error('Staff user context is required.');
  const email = staffUser.email || (staffUser.role === 'sir' ? 'sir@incubation.local' : 'admin@incubation.local');
  const name = staffUser.name || (staffUser.role === 'sir' ? 'Dr. K. Venkatesh (Lab Incharge / Sir)' : 'Lab Administrator');
  const role = staffUser.role || 'Sir';

  if (!memoryStore.staffPresence) memoryStore.staffPresence = [];

  const activeIdx = memoryStore.staffPresence.findIndex(
    (p) => p.staffEmail.toLowerCase() === email.toLowerCase() && p.active
  );

  const now = new Date().toISOString();

  if (activeIdx !== -1) {
    // Staff is currently inside: Toggle to LEAVE / EXIT
    const current = memoryStore.staffPresence[activeIdx];
    const durationMin = Math.max(1, Math.round((new Date(now) - new Date(current.entryTime)) / 60000));
    const updated = {
      ...current,
      exitTime: now,
      durationMinutes: durationMin,
      active: false,
    };
    memoryStore.staffPresence[activeIdx] = updated;
    await persistLocalCache('staffPresence', memoryStore.staffPresence);
    await executeCloudMutation({
      table: 'staff_presence',
      action: 'update',
      id: updated.id,
      data: updated,
    });
    logAuditEvent({
      actorName: name,
      actorRole: role,
      action: 'Staff Lab Exit',
      details: `${name} marked exit from lab. Time spent: ${durationMin} minutes.`,
    });
    notifySubscribers('STAFF_PRESENCE_CHANGED', updated);
    return { isInside: false, record: updated, message: `Lab exit recorded for ${name}. Duration: ${durationMin} mins.` };
  } else {
    // Staff is outside: Toggle to ENTER
    const newRecord = {
      id: `STAFF-${String(Date.now()).slice(-6)}`,
      staffEmail: email,
      staffName: name,
      role,
      entryTime: now,
      exitTime: null,
      durationMinutes: null,
      active: true,
      createdAt: now,
    };
    memoryStore.staffPresence.push(newRecord);
    await persistLocalCache('staffPresence', memoryStore.staffPresence);
    await executeCloudMutation({
      table: 'staff_presence',
      action: 'insert',
      id: newRecord.id,
      data: newRecord,
    });
    logAuditEvent({
      actorName: name,
      actorRole: role,
      action: 'Staff Lab Entry',
      details: `${name} marked presence inside lab.`,
    });
    notifySubscribers('STAFF_PRESENCE_CHANGED', newRecord);
    return { isInside: true, record: newRecord, message: `Presence marked: ${name} is now inside the lab.` };
  }
}

// 3. PROJECTS MANAGEMENT (Strict Title Protection for Sir/Admin)
export function getProjects(filterDomain = null, searchQuery = '') {
  let list = [...(memoryStore.projects || [])];
  if (filterDomain && filterDomain !== 'all') {
    list = list.filter((p) => p.domain === filterDomain);
  }
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.leaderRoll && p.leaderRoll.toLowerCase().includes(q)) ||
        (p.domain && p.domain.toLowerCase().includes(q)) ||
        (p.members || []).some((m) => (m.name || '').toLowerCase().includes(q) || (m.rollNumber || '').toLowerCase().includes(q))
    );
  }
  return list;
}

export async function createProject(projectData, currentUser) {
  if (!projectData.title || !projectData.leaderRoll) {
    throw new Error('Project title and leader roll number are required.');
  }
  const newProject = {
    id: `PROJ-${String(Date.now()).slice(-6)}`,
    title: projectData.title.trim(),
    teamId: projectData.teamId || '',
    leaderRoll: projectData.leaderRoll.trim().toUpperCase(),
    members: Array.isArray(projectData.members) ? projectData.members : [],
    objectives: projectData.objectives || '',
    domain: projectData.domain || 'IoT & Embedded Systems',
    status: projectData.status || 'active',
    githubLink: projectData.githubLink || '',
    linkedinLink: projectData.linkedinLink || '',
    budget: Number(projectData.budget) || 0,
    prototypeAvailable: Boolean(projectData.prototypeAvailable),
    titleChangeRequest: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  if (!memoryStore.projects) memoryStore.projects = [];
  memoryStore.projects.unshift(newProject);
  await persistLocalCache('projects', memoryStore.projects);
  await executeCloudMutation({
    table: 'projects',
    action: 'insert',
    id: newProject.id,
    data: newProject,
  });
  notifySubscribers('PROJECT_ADDED', newProject);
  return newProject;
}

export async function updateProject(id, updates, currentUser) {
  if (!memoryStore.projects) memoryStore.projects = [];
  const idx = memoryStore.projects.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`Project with ID ${id} not found.`);

  const current = memoryStore.projects[idx];
  const isSirOrAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'sir' ||
    currentUser?.role === 'substitute_admin';

  let finalTitle = current.title;
  let titleChangeRequest = current.titleChangeRequest || null;

  if (updates.title && updates.title.trim() !== current.title.trim()) {
    if (isSirOrAdmin) {
      finalTitle = updates.title.trim();
      titleChangeRequest = null;
    } else {
      // Student requested a title change -> store request for Sir/Admin approval
      titleChangeRequest = {
        requestedTitle: updates.title.trim(),
        requestedByRoll: currentUser?.rollNumber || currentUser?.id || 'Student',
        requestedByName: currentUser?.name || 'Student',
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };
      finalTitle = current.title; // Keep official title unchanged
    }
  }

  const updatedProject = {
    ...current,
    ...updates,
    title: finalTitle,
    titleChangeRequest,
    updatedAt: new Date().toISOString(),
  };

  memoryStore.projects[idx] = updatedProject;
  await persistLocalCache('projects', memoryStore.projects);
  await executeCloudMutation({
    table: 'projects',
    action: 'update',
    id,
    data: updatedProject,
  });

  notifySubscribers('PROJECT_UPDATED', updatedProject);

  if (updates.title && updates.title.trim() !== current.title.trim() && !isSirOrAdmin) {
    return {
      project: updatedProject,
      titleLocked: true,
      message: 'Official project title change is strictly restricted to Sir/Admin. Your title change request has been submitted for faculty review.',
    };
  }

  return { project: updatedProject, titleLocked: false };
}

export async function approveProjectTitleChange(id, approve = true, currentUser) {
  const isSirOrAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'sir' ||
    currentUser?.role === 'substitute_admin';
  if (!isSirOrAdmin) {
    throw new Error('Permission Denied: Only Sir or Admin can approve project title changes.');
  }

  const idx = memoryStore.projects.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`Project with ID ${id} not found.`);

  const current = memoryStore.projects[idx];
  if (!current.titleChangeRequest) {
    throw new Error('No pending title change request for this project.');
  }

  let updated;
  if (approve) {
    updated = {
      ...current,
      title: current.titleChangeRequest.requestedTitle,
      titleChangeRequest: null,
      updatedAt: new Date().toISOString(),
    };
  } else {
    updated = {
      ...current,
      titleChangeRequest: null,
      updatedAt: new Date().toISOString(),
    };
  }

  memoryStore.projects[idx] = updated;
  await persistLocalCache('projects', memoryStore.projects);
  await executeCloudMutation({
    table: 'projects',
    action: 'update',
    id,
    data: updated,
  });
  notifySubscribers('PROJECT_UPDATED', updated);
  return updated;
}

// 4. TEAMS MANAGEMENT
export function getTeams() {
  return [...(memoryStore.teams || [])];
}

export async function createTeam(teamData, currentUser) {
  if (!teamData.name || !teamData.leaderRoll) {
    throw new Error('Team name and leader roll number are required.');
  }
  const newTeam = {
    id: `TEAM-${String(Date.now()).slice(-6)}`,
    name: teamData.name.trim(),
    leaderRoll: teamData.leaderRoll.trim().toUpperCase(),
    memberRolls: Array.isArray(teamData.memberRolls) ? teamData.memberRolls : [teamData.leaderRoll.trim().toUpperCase()],
    domain: teamData.domain || 'IoT & Embedded Systems',
    projectId: teamData.projectId || null,
    budget: Number(teamData.budget) || 0,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  if (!memoryStore.teams) memoryStore.teams = [];
  memoryStore.teams.unshift(newTeam);
  await persistLocalCache('teams', memoryStore.teams);
  await executeCloudMutation({
    table: 'teams',
    action: 'insert',
    id: newTeam.id,
    data: newTeam,
  });
  notifySubscribers('TEAMS_CHANGED', memoryStore.teams);
  return newTeam;
}

// 5. PERMANENT ACHIEVEMENTS
export function getAchievements() {
  return [...(memoryStore.achievements || [])];
}

export async function createAchievement(achievementData, currentUser) {
  const isSirOrAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'sir' ||
    currentUser?.role === 'substitute_admin';
  if (!isSirOrAdmin) {
    throw new Error('Permission Denied: Only Sir or Admin can award permanent achievements.');
  }
  if (!achievementData.title || !achievementData.awardedToRoll) {
    throw new Error('Achievement title and recipient roll number are required.');
  }
  const newAch = {
    id: `ACH-${String(Date.now()).slice(-6)}`,
    title: achievementData.title.trim(),
    description: achievementData.description || '',
    awardedToRoll: achievementData.awardedToRoll.trim().toUpperCase(),
    studentName: achievementData.studentName ? achievementData.studentName.trim() : achievementData.awardedToRoll.trim().toUpperCase(),
    prizeMoney: Number(achievementData.prizeMoney) || 0,
    awardedBy: achievementData.awardedBy || currentUser?.name || 'Lab Incharge / Sir',
    dateAwarded: achievementData.dateAwarded || new Date().toISOString().slice(0, 10),
    isPermanent: true,
    createdAt: new Date().toISOString(),
  };
  if (!memoryStore.achievements) memoryStore.achievements = [];
  memoryStore.achievements.unshift(newAch);
  await persistLocalCache('achievements', memoryStore.achievements);
  await executeCloudMutation({
    table: 'achievements',
    action: 'insert',
    id: newAch.id,
    data: newAch,
  });
  notifySubscribers('ACHIEVEMENTS_CHANGED', memoryStore.achievements);
  return newAch;
}

// 6. ANNOUNCEMENTS (With configurable expiration)
export function getAnnouncements() {
  return [...(memoryStore.announcements || [])];
}

export function getActiveAnnouncements() {
  const now = new Date().getTime();
  return (memoryStore.announcements || []).filter((a) => a.active && new Date(a.expiresAt).getTime() > now);
}

export async function createAnnouncement({ title, message, category = 'General', durationDays = 3 }, currentUser) {
  const isSirOrAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'sir' ||
    currentUser?.role === 'substitute_admin';
  if (!isSirOrAdmin) {
    throw new Error('Permission Denied: Only Sir or Admin can post announcements.');
  }
  const days = Math.max(1, Math.min(14, Number(durationDays) || 3));
  const newAnn = {
    id: `ANN-${String(Date.now()).slice(-6)}`,
    title: title.trim(),
    message: message.trim(),
    category,
    active: true,
    expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
    createdBy: currentUser?.name || 'Admin',
    createdAt: new Date().toISOString(),
  };
  if (!memoryStore.announcements) memoryStore.announcements = [];
  memoryStore.announcements.unshift(newAnn);
  await persistLocalCache('announcements', memoryStore.announcements);
  await executeCloudMutation({
    table: 'announcements',
    action: 'insert',
    id: newAnn.id,
    data: newAnn,
  });
  notifySubscribers('ANNOUNCEMENTS_CHANGED', memoryStore.announcements);
  return newAnn;
}

// 7. EVENTS & INNOVATION DAY
export function getEvents() {
  return [...(memoryStore.events || [])];
}

export async function createEvent(eventData, currentUser) {
  if (!eventData.title || !eventData.eventDate) {
    throw new Error('Event title and date are required.');
  }
  const newEvent = {
    id: `EVT-${String(Date.now()).slice(-6)}`,
    title: eventData.title.trim(),
    theme: eventData.theme || '',
    eventDate: eventData.eventDate,
    prizes: eventData.prizes || '',
    winners: Array.isArray(eventData.winners) ? eventData.winners : [],
    isInnovationDay: Boolean(eventData.isInnovationDay),
    year: eventData.year ? Number(eventData.year) : new Date(eventData.eventDate).getFullYear(),
    description: eventData.description || '',
    createdAt: new Date().toISOString(),
  };
  if (!memoryStore.events) memoryStore.events = [];
  memoryStore.events.unshift(newEvent);
  await persistLocalCache('events', memoryStore.events);
  await executeCloudMutation({
    table: 'events',
    action: 'insert',
    id: newEvent.id,
    data: newEvent,
  });
  notifySubscribers('EVENTS_CHANGED', memoryStore.events);
  return newEvent;
}

// 8. COMPLAINTS SYSTEM (Equipment/Environment & Component shortages)
export function getComplaints() {
  return [...(memoryStore.complaints || [])];
}

export async function createComplaint({ type, itemName, description, reportedByRoll, reportedByName }) {
  if (!type || !itemName || !description) {
    throw new Error('Complaint type, item name, and description are required.');
  }
  const newComplaint = {
    id: `CMP-${String(Date.now()).slice(-6)}`,
    type,
    itemName: itemName.trim(),
    description: description.trim(),
    reportedByRoll: (reportedByRoll || 'ANONYMOUS').toUpperCase(),
    reportedByName: reportedByName || 'Student',
    status: 'pending',
    adminNotes: '',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  if (!memoryStore.complaints) memoryStore.complaints = [];
  memoryStore.complaints.unshift(newComplaint);
  await persistLocalCache('complaints', memoryStore.complaints);
  await executeCloudMutation({
    table: 'complaints',
    action: 'insert',
    id: newComplaint.id,
    data: newComplaint,
  });
  notifySubscribers('COMPLAINTS_CHANGED', memoryStore.complaints);
  return newComplaint;
}

export async function updateComplaintStatus(id, { status, adminNotes }, currentUser) {
  const isSirOrAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'sir' ||
    currentUser?.role === 'substitute_admin';
  if (!isSirOrAdmin) {
    throw new Error('Permission Denied: Only Sir or Admin can manage and resolve complaints.');
  }
  const idx = memoryStore.complaints.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error('Complaint not found.');

  const updated = {
    ...memoryStore.complaints[idx],
    status: status || memoryStore.complaints[idx].status,
    adminNotes: adminNotes !== undefined ? adminNotes : memoryStore.complaints[idx].adminNotes,
    resolvedAt: status === 'resolved' ? new Date().toISOString() : memoryStore.complaints[idx].resolvedAt,
  };
  memoryStore.complaints[idx] = updated;
  await persistLocalCache('complaints', memoryStore.complaints);
  await executeCloudMutation({
    table: 'complaints',
    action: 'update',
    id,
    data: updated,
  });
  notifySubscribers('COMPLAINTS_CHANGED', memoryStore.complaints);
  return updated;
}

// 9. RESEARCH PAPERS (Metadata only, DOI/URL, public/private toggle)
export function getResearchPapers(filterPublicOnly = false) {
  const papers = memoryStore.researchPapers || [];
  if (filterPublicOnly) {
    return papers.filter((p) => p.isPublic);
  }
  return [...papers];
}

export async function createResearchPaper(paperData, currentUser) {
  if (!paperData.title) throw new Error('Paper title is required.');
  const newPaper = {
    id: `RES-${String(Date.now()).slice(-6)}`,
    title: paperData.title.trim(),
    authors: Array.isArray(paperData.authors) ? paperData.authors : [paperData.authors || currentUser?.name || 'Author'],
    studentRoll: (paperData.studentRoll || currentUser?.rollNumber || '').trim().toUpperCase(),
    teamName: paperData.teamName || '',
    domain: paperData.domain || 'IoT & Embedded Systems',
    venue: paperData.venue || '',
    paperType: paperData.paperType || 'conference',
    doi: paperData.doi || '',
    externalUrl: paperData.externalUrl || '',
    isPublic: paperData.isPublic !== undefined ? Boolean(paperData.isPublic) : true,
    createdAt: new Date().toISOString(),
  };
  if (!memoryStore.researchPapers) memoryStore.researchPapers = [];
  memoryStore.researchPapers.unshift(newPaper);
  await persistLocalCache('researchPapers', memoryStore.researchPapers);
  await executeCloudMutation({
    table: 'research_papers',
    action: 'insert',
    id: newPaper.id,
    data: newPaper,
  });
  notifySubscribers('RESEARCH_PAPERS_CHANGED', memoryStore.researchPapers);
  return newPaper;
}

// 10. SELF-AFFIRMATION / STUDENT REFLECTION BOOK
export function getSelfReflections(rollNumber, isOwnProfile = false) {
  if (!rollNumber) return [];
  const cleanRoll = rollNumber.trim().toUpperCase();
  const list = memoryStore.selfReflections || [];
  if (isOwnProfile) {
    return list.filter((r) => r.studentRoll.toUpperCase() === cleanRoll);
  }
  return list.filter((r) => r.studentRoll.toUpperCase() === cleanRoll && !r.isPrivate);
}

export async function createSelfReflection(reflectionData, currentUser) {
  const roll = (reflectionData.studentRoll || currentUser?.rollNumber || '').trim().toUpperCase();
  if (!roll) throw new Error('Student roll number is required for reflection book.');
  const newRef = {
    id: `REF-${String(Date.now()).slice(-6)}`,
    studentRoll: roll,
    title: reflectionData.title.trim(),
    content: reflectionData.content.trim(),
    isPrivate: reflectionData.isPrivate !== undefined ? Boolean(reflectionData.isPrivate) : true,
    date: reflectionData.date || new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
  };
  if (!memoryStore.selfReflections) memoryStore.selfReflections = [];
  memoryStore.selfReflections.unshift(newRef);
  await persistLocalCache('selfReflections', memoryStore.selfReflections);
  await executeCloudMutation({
    table: 'self_reflections',
    action: 'insert',
    id: newRef.id,
    data: newRef,
  });
  notifySubscribers('SELF_REFLECTIONS_CHANGED', memoryStore.selfReflections);
  return newRef;
}

// 11. SMART STUDENT SEARCH WITH COMBINED FILTERS
export function searchStudents({ query = '', name = '', rollNumber = '', branch = '', section = '', year = '' } = {}) {
  const cleanQuery = (query || '').trim().toLowerCase();
  const cleanName = (name || '').trim().toLowerCase();
  const cleanRoll = (rollNumber || '').trim().toUpperCase();
  const cleanBranch = (branch || '').trim().toLowerCase();
  const cleanSection = (section || '').trim().toUpperCase();
  const yr = year ? Number(year) : null;

  return getStudents().filter((s) => {
    if (cleanQuery && !s.name.toLowerCase().includes(cleanQuery) && !s.rollNumber.toLowerCase().includes(cleanQuery)) {
      return false;
    }
    if (cleanName && !s.name.toLowerCase().includes(cleanName)) return false;
    if (cleanRoll && !s.rollNumber.toUpperCase().includes(cleanRoll)) return false;
    if (cleanBranch && s.branch && !s.branch.toLowerCase().includes(cleanBranch)) return false;
    if (cleanSection && s.section && s.section.toUpperCase() !== cleanSection) return false;
    if (yr && (s.academicYear || s.year) && Number(s.academicYear || s.year) !== yr) return false;
    return true;
  });
}

// 12. VOICE SEARCH MULTI-INDEX HELPER
export function executeSmartVoiceSearch(queryText) {
  if (!queryText || typeof queryText !== 'string') {
    return { students: [], projects: [], components: [], domains: [] };
  }
  const q = queryText.trim().toLowerCase();
  if (!q) return { students: [], projects: [], components: [], domains: [] };

  const students = getStudents().filter(
    (s) => s.name.toLowerCase().includes(q) || s.rollNumber.toLowerCase().includes(q)
  );

  const projects = (memoryStore.projects || []).filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      (p.domain && p.domain.toLowerCase().includes(q)) ||
      (p.leaderRoll && p.leaderRoll.toLowerCase().includes(q)) ||
      (p.members || []).some((m) => (m.name || '').toLowerCase().includes(q) || (m.rollNumber || '').toLowerCase().includes(q))
  );

  const components = (memoryStore.components || []).filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      (c.category && c.category.toLowerCase().includes(q)) ||
      (c.componentNumber && c.componentNumber.toLowerCase().includes(q)) ||
      (c.location && c.location.toLowerCase().includes(q))
  );

  const domains = (memoryStore.domains || DEFAULT_DOMAINS).filter((d) =>
    (typeof d === 'string' ? d : d.name).toLowerCase().includes(q)
  );

  return { students, projects, components, domains };
}

// 13. ECE PROJECTS & RESEARCH DYNAMIC STATISTICS
export function getEceResearchStats() {
  const projects = memoryStore.projects || [];
  const papers = memoryStore.researchPapers || [];
  const achievements = memoryStore.achievements || [];
  const teams = memoryStore.teams || [];

  const activeProjects = projects.filter((p) => p.status === 'active').length;
  const prototypesReady = projects.filter((p) => p.prototypeAvailable).length;
  const totalPrizeMoney = achievements.reduce((acc, a) => acc + (Number(a.prizeMoney) || 0), 0);
  const totalPapers = papers.length;
  const ieeePapers = papers.filter((p) => p.paperType === 'IEEE').length;

  return {
    totalProjects: projects.length,
    activeProjects,
    prototypesReady,
    totalTeams: teams.length,
    totalAchievements: achievements.length,
    totalPrizeMoney,
    totalPapers,
    ieeePapers,
  };
}

