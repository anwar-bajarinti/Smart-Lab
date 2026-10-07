// src/App.jsx
// Main Application Coordinator & View Router
// Features: Two Main Tabs ("Control" & "Components / Lab Management"),
// Role-Based Routing (Admin, Substitute Admin, Student),
// Biometric Entrance Station Kiosk Mode, Global Camera OCR Modal, and Reactive State Container.

import React, { useState, useEffect } from 'react';
import { Clock } from 'lucide-react';
import {
  initDatabase,
  getDashboardStats,
  getSettings,
  getCurrentUser,
  setCurrentUser,
  logoutUser,
  subscribeToDb,
  getStudentsRetentionAudit,
  deleteStudentEligibleRetentionData,
} from '../db/database';

import Navbar from '../components/layout/Navbar';
import Sidebar from '../components/layout/Sidebar';
import CameraModal from '../components/ocr/CameraModal';
import BarcodeScannerModal from '../components/barcode/BarcodeScannerModal';
import VoiceSearchModal from '../components/search/VoiceSearchModal';

// Pages
import ControlTab from '../pages/admin/ControlTab';
import Dashboard from '../pages/admin/Dashboard';
import Components from '../pages/admin/Components';
import IssueComponent from '../pages/admin/IssueComponent';
import ReturnComponent from '../pages/admin/ReturnComponent';
import Overdue from '../pages/admin/Overdue';
import Authorizations from '../pages/admin/Authorizations';
import Transactions from '../pages/admin/Transactions';
import Students from '../pages/admin/Students';
import StudentsInside from '../pages/lab/StudentsInside';
import LabEntryExit from '../pages/lab/LabEntryExit';
import Analytics from '../pages/admin/Analytics';
import AuditLog from '../pages/admin/AuditLog';
import StudentPortal from '../pages/student/StudentPortal';
import BackupRestore from '../pages/admin/BackupRestore';
import Login from '../pages/auth/Login';
import Projects from '../pages/projects/Projects';
import Complaints from '../pages/complaints/Complaints';
import AchievementsEvents from '../pages/events/AchievementsEvents';
import ResearchPapers from '../pages/research/ResearchPapers';
import DomainsHolidays from '../pages/admin/DomainsHolidays';

export default function App() {
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [currentUser, setCurrentUserState] = useState(null);

  // Two Main Application Tabs: 'control' (Tab 1) | 'management' (Tab 2)
  const [mainTab, setMainTab] = useState('management');

  // Sub-navigation under 'management'
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Standalone Biometric Entrance Station Kiosk Mode (can be launched from login)
  const [isEntranceStationKiosk, setIsEntranceStationKiosk] = useState(false);

  // Global Camera OCR Modal state
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [scannedStudentData, setScannedStudentData] = useState(null);

  // Student ID Card Barcode / QR Scanner Modal state
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false);

  // Voice Search Modal state
  const [isVoiceSearchOpen, setIsVoiceSearchOpen] = useState(false);

  // Live Stats & Settings
  const [dashboardStats, setDashboardStats] = useState(null);
  const [settings, setSettings] = useState({});

  // Toast notifications
  const [toasts, setToasts] = useState([]);

  // Automatic Retention Expiration Detection State (Admin confirmation)
  const [dismissedRetentionRolls, setDismissedRetentionRolls] = useState(new Set());
  const [activeRetentionPromptStudent, setActiveRetentionPromptStudent] = useState(null);

  function addToast(message) {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }

  // Initialize offline IndexedDB database on startup
  useEffect(() => {
    async function setupDb() {
      try {
        await initDatabase();
        const user = getCurrentUser();
        setCurrentUserState(user);
        setDashboardStats(getDashboardStats());
        setSettings(getSettings());
        setIsDbLoaded(true);
      } catch (err) {
        console.error('Database initialization error:', err);
        setIsDbLoaded(true);
      }
    }
    setupDb();

    const unsubscribe = subscribeToDb((changeType, data) => {
      setDashboardStats(getDashboardStats());
      setSettings(getSettings());
      if (changeType === 'AUTH_CHANGED') {
        setCurrentUserState(data);
      }
    });
    return () => unsubscribe();
  }, []);

  // Automatic Retention Expiration Detection
  // Checks if any student's individual retention period has completed and prompts Admin for confirmation
  useEffect(() => {
    if (!isDbLoaded) return;
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'substitute_admin';
    if (!isAdmin) return;

    try {
      const audit = getStudentsRetentionAudit();
      const nextCandidate = (audit.expiredEligible || []).find(
        (s) => !dismissedRetentionRolls.has(s.rollNumber.toUpperCase())
      );
      if (nextCandidate && !activeRetentionPromptStudent) {
        setActiveRetentionPromptStudent(nextCandidate);
      }
    } catch (e) {
      console.warn('Retention auto-detection check error:', e);
    }
  }, [isDbLoaded, currentUser, dashboardStats, dismissedRetentionRolls, activeRetentionPromptStudent]);

  function handleCancelRetentionDeletion() {
    if (!activeRetentionPromptStudent) return;
    const roll = activeRetentionPromptStudent.rollNumber.toUpperCase();
    setDismissedRetentionRolls((prev) => new Set([...prev, roll]));
    setActiveRetentionPromptStudent(null);
    addToast(`Retention data kept for ${activeRetentionPromptStudent.name} (${roll}).`);
  }

  async function handleConfirmRetentionDeletion() {
    if (!activeRetentionPromptStudent) return;
    const student = activeRetentionPromptStudent;
    const roll = student.rollNumber.toUpperCase();
    try {
      await deleteStudentEligibleRetentionData(student.rollNumber, currentUser);
      setDismissedRetentionRolls((prev) => new Set([...prev, roll]));
      setActiveRetentionPromptStudent(null);
      addToast(`Eligible retention data deleted for ${student.name} (${student.rollNumber}).`);
    } catch (err) {
      addToast(`Deletion failed: ${err.message}`);
    }
  }

  // Handle OCR scan confirmation from global camera modal
  function handleOcrConfirm(studentDetails) {
    setScannedStudentData(studentDetails);
    addToast(`ID Card Scanned: ${studentDetails.name} (${studentDetails.rollNumber})`);

    setMainTab('management');
    if (activeTab !== 'issue' && activeTab !== 'return') {
      setActiveTab('issue');
    }
  }

  function handleOpenReturnWithRoll(roll) {
    setScannedStudentData({ rollNumber: roll, name: '' });
    setMainTab('management');
    setActiveTab('return');
  }

  function handleOpenIssueWithStudent(student) {
    setScannedStudentData({ rollNumber: student.rollNumber, name: student.name });
    setMainTab('management');
    setActiveTab('issue');
  }

  function handleLoginSuccess(user) {
    setCurrentUserState(user);
    setIsEntranceStationKiosk(false);
    addToast(`Welcome, ${user.name} (${user.role === 'student' ? user.rollNumber : user.role})!`);
    if (user.role === 'student') {
      setMainTab('management'); // Student Portal
    } else {
      setMainTab('management');
      setActiveTab('dashboard');
    }
  }

  function handleLogout() {
    logoutUser();
    setCurrentUserState(null);
    addToast('You have been signed out.');
  }

  // If database is still initializing, show clean splash
  if (!isDbLoaded) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f8fafc',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        <div className="spinner-large"></div>
        <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--neutral-900)' }}>
          Loading Incubation-CMS...
        </h3>
        <p className="text-muted text-sm">Opening persistent offline database</p>
      </div>
    );
  }

  // Standalone Biometric Entrance Station Kiosk (accessible from login or direct link)
  if (isEntranceStationKiosk) {
    return (
      <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '1rem' }}>
        <div
          style={{
            maxWidth: '960px',
            margin: '0 auto 1rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.4rem' }}>⚡</span>
            <strong style={{ fontSize: '1.1rem', color: 'var(--neutral-900)' }}>
              {settings.incubationCenterName || 'Incubation Centre'} — Entrance Kiosk
            </strong>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setIsEntranceStationKiosk(false)}
          >
            ← Back to System Login
          </button>
        </div>
        <LabEntryExit onToast={addToast} />
        {/* Floating Toast Container */}
        <div className="toast-container">
          {toasts.map((toast) => (
            <div key={toast.id} className="toast">
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // If user is not logged in, show login screen
  if (!currentUser) {
    return (
      <Login
        onLogin={handleLoginSuccess}
        onOpenEntranceStation={() => setIsEntranceStationKiosk(true)}
        centreName={settings.incubationCenterName || 'Incubation Centre'}
      />
    );
  }

  const isStudent = currentUser?.role === 'student';
  const isAdminOrSubstitute =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'substitute_admin' ||
    currentUser?.role === 'sir';

  return (
    <div className="app-container">
      {/* SIDEBAR NAVIGATION */}
      <Sidebar
        currentUser={currentUser}
        mainTab={mainTab}
        setMainTab={setMainTab}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isSidebarOpen={isSidebarOpen}
        setIsSidebarOpen={setIsSidebarOpen}
        overdueCount={dashboardStats?.overdueItemsCount || 0}
        insideCount={dashboardStats?.studentsInsideCount || 0}
        lowStockCount={dashboardStats?.lowStockCount || 0}
        centreName={settings.incubationCenterName || 'Incubation Centre'}
        onOpenBarcodeScanner={() => setIsBarcodeScannerOpen(true)}
      />

      {/* MAIN VIEWPORT */}
      <div className="main-wrapper">
        {/* TOP NAVBAR */}
        <Navbar
          stats={dashboardStats}
          currentUser={currentUser}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onLogout={handleLogout}
          mainTab={mainTab}
          setMainTab={setMainTab}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onOpenBarcodeScanner={() => setIsBarcodeScannerOpen(true)}
          onOpenVoiceSearch={() => setIsVoiceSearchOpen(true)}
        />

        {/* ACTIVE PAGE CONTENT */}
        <main className="content-body">
          {/* TAB 1: CONTROL (Environmental & Hardware Controls) */}
          {mainTab === 'control' && (
            <ControlTab currentUser={currentUser} onToast={addToast} />
          )}

          {/* TAB 2: COMPONENTS / LAB MANAGEMENT OR STUDENT PORTAL */}
          {mainTab === 'management' && (
            <>
              {/* REGULAR STUDENT VIEW: Private Student Portal & Student Pages */}
              {isStudent && (
                <>
                  {(activeTab === 'student_portal' || !activeTab) && (
                    <StudentPortal currentUser={currentUser} onToast={addToast} />
                  )}
                  {activeTab === 'projects' && (
                    <Projects currentUser={currentUser} onToast={addToast} />
                  )}
                  {activeTab === 'achievements_events' && (
                    <AchievementsEvents currentUser={currentUser} onToast={addToast} />
                  )}
                  {activeTab === 'research_papers' && (
                    <ResearchPapers currentUser={currentUser} onToast={addToast} />
                  )}
                  {activeTab === 'complaints' && (
                    <Complaints currentUser={currentUser} onToast={addToast} />
                  )}
                </>
              )}

              {/* ADMIN, SIR & SUBSTITUTE ADMIN MANAGEMENT VIEWS */}
              {isAdminOrSubstitute && (
                <>
                  {activeTab === 'dashboard' && (
                    <Dashboard
                      setActiveTab={setActiveTab}
                      onOpenOcrModal={() => setIsCameraModalOpen(true)}
                    />
                  )}

                  {activeTab === 'components' && (
                    <Components onToast={addToast} currentUser={currentUser} />
                  )}

                  {activeTab === 'issue' && (
                    <IssueComponent
                      onOpenOcrModal={() => setIsCameraModalOpen(true)}
                      scannedStudent={scannedStudentData}
                      onClearScannedStudent={() => setScannedStudentData(null)}
                      onToast={addToast}
                      setActiveTab={setActiveTab}
                    />
                  )}

                  {activeTab === 'return' && (
                    <ReturnComponent
                      onOpenOcrModal={() => setIsCameraModalOpen(true)}
                      scannedStudent={scannedStudentData}
                      onClearScannedStudent={() => setScannedStudentData(null)}
                      onToast={addToast}
                      setActiveTab={setActiveTab}
                    />
                  )}

                  {activeTab === 'overdue' && (
                    <Overdue
                      setActiveTab={setActiveTab}
                      onToast={addToast}
                      onOpenReturnWithRoll={handleOpenReturnWithRoll}
                    />
                  )}

                  {activeTab === 'students_inside' && (
                    <StudentsInside currentUser={currentUser} onToast={addToast} />
                  )}

                  {activeTab === 'lab_entry_exit' && (
                    <LabEntryExit
                      onToast={addToast}
                      onOpenBarcodeScanner={() => setIsBarcodeScannerOpen(true)}
                    />
                  )}

                  {activeTab === 'projects' && (
                    <Projects currentUser={currentUser} onToast={addToast} />
                  )}

                  {activeTab === 'achievements_events' && (
                    <AchievementsEvents currentUser={currentUser} onToast={addToast} />
                  )}

                  {activeTab === 'research_papers' && (
                    <ResearchPapers currentUser={currentUser} onToast={addToast} />
                  )}

                  {activeTab === 'complaints' && (
                    <Complaints currentUser={currentUser} onToast={addToast} />
                  )}

                  {activeTab === 'domains_holidays' && (
                    <DomainsHolidays currentUser={currentUser} onToast={addToast} />
                  )}

                  {activeTab === 'authorizations' && (
                    <Authorizations
                      onOpenOcrModal={() => setIsCameraModalOpen(true)}
                      onToast={addToast}
                    />
                  )}

                  {activeTab === 'transactions' && (
                    <Transactions
                      setActiveTab={setActiveTab}
                      onOpenReturnWithRoll={handleOpenReturnWithRoll}
                    />
                  )}

                  {activeTab === 'students' && (
                    <Students
                      currentUser={currentUser}
                      setActiveTab={setActiveTab}
                      onOpenIssueWithStudent={handleOpenIssueWithStudent}
                      onOpenReturnWithRoll={handleOpenReturnWithRoll}
                      onToast={addToast}
                      onOpenBarcodeScanner={() => setIsBarcodeScannerOpen(true)}
                    />
                  )}

                  {activeTab === 'analytics' && (
                    <Analytics onToast={addToast} currentUser={currentUser} />
                  )}

                  {activeTab === 'audit_log' && (
                    <AuditLog currentUser={currentUser} />
                  )}

                  {activeTab === 'settings' && (
                    <BackupRestore onToast={addToast} />
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {/* AUTOMATIC RETENTION EXPIRATION ADMIN CONFIRMATION MODAL */}
      {activeRetentionPromptStudent && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }}>
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Clock size={22} className="text-warning" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Retention Period Completed</h3>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--neutral-200)', fontSize: '0.9rem' }}>
              <div style={{ marginBottom: '0.45rem' }}>
                <span className="text-muted">Student:</span>{' '}
                <strong>{activeRetentionPromptStudent.name} / {activeRetentionPromptStudent.rollNumber}</strong>
              </div>
              <div style={{ marginBottom: '0.45rem' }}>
                <span className="text-muted">Incubation Start Date:</span>{' '}
                <strong className="font-mono">{activeRetentionPromptStudent.incubationStartDate || '—'}</strong>
              </div>
              <div style={{ marginBottom: '0.45rem' }}>
                <span className="text-muted">Retention Period:</span>{' '}
                <strong>
                  {activeRetentionPromptStudent.retention?.retentionYears || activeRetentionPromptStudent.retentionPeriodYears || 4} year
                  {(activeRetentionPromptStudent.retention?.retentionYears || activeRetentionPromptStudent.retentionPeriodYears) === 1 ? '' : 's'}
                </strong>
              </div>
              <div>
                <span className="text-muted">Retention Completed:</span>{' '}
                <strong className="font-mono text-danger">
                  {activeRetentionPromptStudent.retention?.retentionEndDate || activeRetentionPromptStudent.retentionEndDate || '—'}
                </strong>
              </div>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--neutral-700)', marginBottom: '1.5rem', lineHeight: '1.45' }}>
              The retention period for this student's eligible data has been completed. Do you want to delete the eligible data?
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleCancelRetentionDeletion}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmRetentionDeletion}
              >
                Confirm Deletion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GLOBAL CAMERA OCR MODAL */}
      <CameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onConfirm={handleOcrConfirm}
        title="Student ID Card Scanner (OCR)"
      />

      {/* STUDENT ID CARD BARCODE & QR SCANNER MODAL */}
      <BarcodeScannerModal
        isOpen={isBarcodeScannerOpen}
        onClose={() => setIsBarcodeScannerOpen(false)}
        onStudentSelected={(student) => {
          addToast(`Scanned ID Card: ${student.name} (${student.rollNumber})`);
        }}
      />

      {/* GLOBAL VOICE & MULTI-FILTER SEARCH MODAL */}
      <VoiceSearchModal
        isOpen={isVoiceSearchOpen}
        onClose={() => setIsVoiceSearchOpen(false)}
        currentUser={currentUser}
        onSelectResult={(item) => {
          setIsVoiceSearchOpen(false);
          setMainTab('management');
          if (item.category === 'student') {
            if (currentUser?.role === 'student') {
              setActiveTab('student_portal');
            } else {
              setActiveTab('students');
            }
          } else if (item.category === 'project') {
            setActiveTab('projects');
          } else if (item.category === 'component') {
            setActiveTab('components');
          } else if (item.category === 'domain') {
            if (currentUser?.role === 'student') {
              setActiveTab('projects');
            } else {
              setActiveTab('domains_holidays');
            }
          }
        }}
      />

      {/* FLOATING TOAST NOTIFICATIONS */}
      <div className="toast-container">
        {toasts.map((toast) => (
          <div key={toast.id} className="toast">
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
