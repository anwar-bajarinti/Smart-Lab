// src/pages/BackupRestore.jsx
// Storage Protection System & 4-Year Student Retention Management Console

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  CheckCircle,
  AlertCircle,
  Clock,
  ShieldAlert,
  Building,
  Save,
  HardDrive,
  ShieldCheck,
  Calendar,
  UserX,
  UserCheck,
  Lock,
  X,
  ScanLine,
  QrCode,
} from 'lucide-react';
import {
  getSettings,
  updateSettings,
  pruneExpiredRecords,
  exportDatabaseToJson,
  importDatabaseFromJson,
  resetDatabaseToSample,
  subscribeToDb,
  getDatabaseStorageStatus,
  fetchCloudStorageStats,
  getStudentsRetentionAudit,
  pruneExpiredStudentRecords,
  updateStudentAccount,
} from '../../db/database';
import {
  calculateRetentionYears,
  calculateRetentionEndDate,
} from '../../services/storage/storageProtectionService';

export default function BackupRestore({ onToast }) {
  const [settings, setSettings] = useState({});
  const [retentionDays, setRetentionDays] = useState(30);
  const [centerName, setCenterName] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  // Storage Protection & Retention State
  const [storageStatus, setStorageStatus] = useState(getDatabaseStorageStatus());
  const [retentionAudit, setRetentionAudit] = useState(getStudentsRetentionAudit());

  const [pruneResult, setPruneResult] = useState(null);
  const [statusMessage, setStatusMessage] = useState(null);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [isPruneConfirmOpen, setIsPruneConfirmOpen] = useState(false);
  const [selectedStudentToVerify, setSelectedStudentToVerify] = useState(null);
  const [verifyForm, setVerifyForm] = useState({
    incubationStartDate: '',
    academicYearAtStart: '1',
  });

  useEffect(() => {
    loadSettings();
    fetchCloudStorageStats().then(() => {
      setStorageStatus(getDatabaseStorageStatus());
    });
    const unsubscribe = subscribeToDb(() => loadSettings());
    return () => unsubscribe();
  }, []);

  function loadSettings() {
    const s = getSettings();
    setSettings(s);
    setRetentionDays(s.defaultRetentionDays || 30);
    setCenterName(s.incubationCenterName || '');
    setCollegeName(s.collegeName || '');
    setContactEmail(s.contactEmail || '');
    setContactPhone(s.contactPhone || '');
    setStorageStatus(getDatabaseStorageStatus());
    setRetentionAudit(getStudentsRetentionAudit());
  }

  function handleSaveSettings(e) {
    e.preventDefault();
    try {
      const days = Math.max(1, Number(retentionDays) || 30);
      updateSettings({
        defaultRetentionDays: days,
        incubationCenterName: centerName.trim(),
        collegeName: collegeName.trim(),
        contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(),
      });
      setStatusMessage({ type: 'success', text: 'System settings saved successfully!' });
      if (onToast) onToast('Settings saved.');
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  }

  // Trigger manual retention cleanup
  function handleRunPruning() {
    try {
      const res = pruneExpiredRecords(retentionDays);
      setPruneResult(res);
      const text = res.prunedCount > 0
        ? `Cleaned ${res.prunedCount} completed records returned over ${retentionDays} days ago.`
        : `No records older than ${retentionDays} days found to prune. Database is clean.`;
      setStatusMessage({ type: 'info', text });
      if (onToast) onToast(text);
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  }

  // Export full database to JSON
  function handleExportBackup() {
    try {
      const json = exportDatabaseToJson();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `incubation_cms_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setHasDownloadedArchive(true);
      if (onToast) onToast('Database backup archive downloaded successfully!');
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  }

  // Open Quick Verify Modal
  function handleOpenQuickVerify(student) {
    setSelectedStudentToVerify(student);
    setVerifyForm({
      incubationStartDate: student.incubationStartDate || new Date().toISOString().slice(0, 10),
      academicYearAtStart: student.academicYearAtStart ? String(student.academicYearAtStart) : '1',
    });
  }

  // Save Quick Verification
  async function handleSaveQuickVerify(e) {
    e.preventDefault();
    if (!selectedStudentToVerify) return;
    try {
      await updateStudentAccount(
        selectedStudentToVerify.rollNumber,
        {
          incubationStartDate: verifyForm.incubationStartDate,
          academicYearAtStart: Number(verifyForm.academicYearAtStart),
        }
      );
      setStatusMessage({
        type: 'success',
        text: `Verified incubation journey for ${selectedStudentToVerify.name} (${selectedStudentToVerify.rollNumber}).`,
      });
      if (onToast) onToast(`Journey verified for ${selectedStudentToVerify.name}`);
      setSelectedStudentToVerify(null);
      loadSettings();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  }

  // Safe student retention pruning
  async function handleExecuteStudentPruning() {
    if (!hasDownloadedArchive) {
      if (onToast) onToast('Please download the full archive backup first.');
      return;
    }
    const rollsToPrune = retentionAudit.expiredEligible.map((s) => s.rollNumber);
    try {
      const res = await pruneExpiredStudentRecords(rollsToPrune, true);
      setIsPruneConfirmOpen(false);
      setStatusMessage({
        type: 'success',
        text: `Safely pruned ${res.prunedCount} expired student records. Archive pre-verified.`,
      });
      if (onToast) onToast(`Pruned ${res.prunedCount} expired student records.`);
      loadSettings();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  }

  // Import JSON backup
  function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        await importDatabaseFromJson(event.target.result);
        setStatusMessage({ type: 'success', text: 'Database successfully restored from backup file!' });
        if (onToast) onToast('Database restored.');
      } catch (err) {
        setStatusMessage({ type: 'error', text: err.message });
      }
    };
    reader.readAsText(file);
  }

  // Reset to initial sample data
  async function handleResetToSample() {
    try {
      await resetDatabaseToSample();
      setIsResetConfirmOpen(false);
      setStatusMessage({ type: 'success', text: 'Database restored to initial sample incubation inventory!' });
      if (onToast) onToast('Database reset to sample data.');
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  }

  const usedMB = (storageStatus.usedBytes / (1024 * 1024)).toFixed(2);
  const quotaMB = (storageStatus.quotaBytes / (1024 * 1024)).toFixed(0);

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Storage Protection & 4-Year Retention Plan
          </h2>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            System storage monitoring, 4-tier protection, student incubation lifecycle, and disaster recovery
          </p>
        </div>
      </div>

      {statusMessage && (
        <div className={`alert ${statusMessage.type === 'success' ? 'alert-success' : statusMessage.type === 'error' ? 'alert-danger' : 'alert-info'}`} style={{ marginBottom: '1.5rem' }}>
          {statusMessage.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* 1. STORAGE PROTECTION SYSTEM METER */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <HardDrive className="icon-primary" size={20} />
            <div>
              <h3 className="card-title">Storage Protection System (Phase 6)</h3>
              <p className="text-muted text-xs">
                Real-time storage accounting with 4-tier protection against quota exhaustion
              </p>
            </div>
          </div>
          <div>
            {storageStatus.tier === 'NORMAL' && (
              <span className="badge badge-success">Tier 1: Normal ({storageStatus.percentage}%)</span>
            )}
            {storageStatus.tier === 'WARNING' && (
              <span className="badge badge-warning">Tier 2: Warning ({storageStatus.percentage}%)</span>
            )}
            {storageStatus.tier === 'CRITICAL' && (
              <span className="badge badge-warning" style={{ background: '#ffedd5', color: '#c2410c' }}>
                Tier 3: Critical ({storageStatus.percentage}%)
              </span>
            )}
            {storageStatus.tier === 'PROTECTION_MODE' && (
              <span className="badge badge-danger">
                Tier 4: Protection Mode Active ({storageStatus.percentage}%)
              </span>
            )}
          </div>
        </div>

        <div className="card-body">
          {/* Storage Meter Progress Bar */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.85rem' }}>
              <span style={{ fontWeight: 600 }}>Allocated Database Storage</span>
              <span className="font-mono text-muted">
                {usedMB} MB used of {quotaMB} MB ({storageStatus.percentage}%)
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: '10px',
                background: 'var(--neutral-100)',
                borderRadius: '999px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, storageStatus.percentage)}%`,
                  height: '100%',
                  background:
                    storageStatus.percentage >= 95
                      ? 'var(--danger)'
                      : storageStatus.percentage >= 90
                      ? '#ea580c'
                      : storageStatus.percentage >= 80
                      ? '#f59e0b'
                      : 'var(--primary)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>

          {/* System Non-Interference Guarantee */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid var(--neutral-200)',
              borderRadius: 'var(--radius-md)',
              padding: '0.85rem',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
            }}
          >
            <ShieldCheck size={18} style={{ color: 'var(--success)', flexShrink: 0 }} />
            <div>
              <strong>Storage Protection Guarantee:</strong> The incubation site is <strong>never taken offline</strong>.
              Even if storage reaches 95%+, logins, catalog browsing, lab exits, component returns, and backups remain 100% active.
            </div>
          </div>
        </div>
      </div>

      {/* 2. 4-YEAR STUDENT RETENTION PLAN */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Calendar className="icon-primary" size={20} />
            <div>
              <h3 className="card-title">4-Year Student Incubation Retention Lifecycle</h3>
              <p className="text-muted text-xs">
                Derived strictly from the student's stored Incubation Journey Start Date and Joining Year
              </p>
            </div>
          </div>
          <span className="badge badge-primary">Zero Guessing Rule</span>
        </div>

        <div className="card-body">
          {/* Policy Rule Matrix */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '0.75rem',
              marginBottom: '1.25rem',
            }}
          >
            <div style={{ background: 'var(--neutral-50)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--neutral-200)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>1st Year Start</div>
              <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.1rem' }}>4 Years</div>
              <div className="text-xs text-muted">Complete B.Tech cycle</div>
            </div>
            <div style={{ background: 'var(--neutral-50)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--neutral-200)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>2nd Year Start</div>
              <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.1rem' }}>3 Years</div>
              <div className="text-xs text-muted">Remaining study years</div>
            </div>
            <div style={{ background: 'var(--neutral-50)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--neutral-200)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>3rd Year Start</div>
              <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.1rem' }}>2 Years</div>
              <div className="text-xs text-muted">Junior & Senior years</div>
            </div>
            <div style={{ background: 'var(--neutral-50)', padding: '0.65rem', borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--neutral-200)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>4th Year Start</div>
              <div style={{ color: 'var(--primary)', fontWeight: 800, fontSize: '1.1rem' }}>1 Year</div>
              <div className="text-xs text-muted">Final project year</div>
            </div>
          </div>

          {/* Unverified Legacy Students Section */}
          {retentionAudit.needsVerification.length > 0 && (
            <div
              style={{
                background: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                marginBottom: '1.25rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <AlertCircle size={18} style={{ color: '#d97706' }} />
                <strong style={{ color: '#92400e' }}>
                  {retentionAudit.needsVerification.length} Existing Student(s) Pending Journey Verification
                </strong>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#b45309', marginBottom: '0.75rem' }}>
                Existing records without a verified incubation start date are <strong>100% exempt from automatic deletion</strong>.
                Verify their actual start date to apply the retention plan.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '180px', overflowY: 'auto' }}>
                {retentionAudit.needsVerification.map((stud) => (
                  <div
                    key={stud.rollNumber}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: '#fff',
                      padding: '0.5rem 0.75rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid #fef3c7',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.85rem' }}>{stud.name}</strong>{' '}
                      <span className="font-mono text-xs text-muted">({stud.rollNumber})</span>
                    </div>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleOpenQuickVerify(stud)}
                    >
                      <UserCheck size={13} /> Verify Start Date
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Retention Candidates & Safe Pruning Workflow */}
          <div style={{ borderTop: '1px solid var(--neutral-200)', paddingTop: '1rem' }}>
            <div className="flex-between" style={{ marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h4 style={{ fontSize: '1rem', fontWeight: 700 }}>
                  Expired Retention Candidates ({retentionAudit.expiredEligible.length})
                </h4>
                <p className="text-muted text-xs">
                  Students who have completed their retention lifecycle with zero active loans. Silent deletion is forbidden.
                </p>
              </div>

              {retentionAudit.expiredEligible.length > 0 && (
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className={`btn btn-sm ${hasDownloadedArchive ? 'btn-secondary' : 'btn-primary'}`}
                    onClick={handleExportBackup}
                  >
                    <Download size={14} /> Step 1: Download Archive
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={!hasDownloadedArchive}
                    onClick={() => setIsPruneConfirmOpen(true)}
                    title={!hasDownloadedArchive ? 'Download the backup archive first to enable pruning' : ''}
                  >
                    <UserX size={14} /> Step 2: Approve & Prune ({retentionAudit.expiredEligible.length})
                  </button>
                </div>
              )}
            </div>

            {retentionAudit.expiredEligible.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '1.25rem', background: 'var(--neutral-50)', borderRadius: 'var(--radius-sm)' }}>
                <CheckCircle size={20} style={{ color: 'var(--success)', margin: '0 auto 0.35rem' }} />
                <p style={{ fontSize: '0.85rem', color: 'var(--neutral-700)', fontWeight: 600 }}>
                  No expired student records eligible for pruning.
                </p>
                <p className="text-xs text-muted">
                  All students are either active, awaiting journey verification, holding borrowed items, or checked into the lab.
                </p>
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Roll Number</th>
                      <th>Journey Start</th>
                      <th>Plan</th>
                      <th>Expired Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {retentionAudit.expiredEligible.map((s) => (
                      <tr key={s.rollNumber}>
                        <td>{s.name}</td>
                        <td className="font-mono">{s.rollNumber}</td>
                        <td>{s.incubationStartDate || '—'}</td>
                        <td>{s.retention?.retentionYears} Years</td>
                        <td className="font-mono text-danger">{s.retentionEndDate}</td>
                        <td>
                          <span className="badge badge-danger">Eligible for Pruning</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Blocked Expired Students */}
            {retentionAudit.expiredBlocked.length > 0 && (
              <div style={{ marginTop: '1rem', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: 'var(--radius-sm)', padding: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#991b1b', fontWeight: 600, fontSize: '0.85rem' }}>
                  <Lock size={14} /> {retentionAudit.expiredBlocked.length} Expired Student(s) Blocked by Active Obligations
                </div>
                <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>
                  These students have passed their retention date, but are protected from deletion because they hold unreturned components or are inside the lab.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>



      {/* 3. TRANSACTION RECORD RETENTION SETTINGS */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Clock className="icon-primary" size={20} />
            <div>
              <h3 className="card-title">Completed Loan Retention Policy</h3>
              <p className="text-muted text-xs">
                Returned transaction records are automatically pruned after this period. Active/issued loans are NEVER deleted.
              </p>
            </div>
          </div>
          <span className="badge badge-primary">Default: 30 Days</span>
        </div>

        <div className="card-body">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ maxWidth: '580px' }}>
              <div className="form-group" style={{ marginBottom: '0.5rem' }}>
                <label className="input-label">Default Retention Duration (Days After Return)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    className="input-field"
                    style={{ width: '130px' }}
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(e.target.value)}
                  />
                  <span className="text-sm text-muted">days after return completion</span>
                </div>
                <span className="input-hint">
                  Admin does <strong>not</strong> need to specify retention per transaction. The system applies this default automatically.
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" className="btn btn-secondary" onClick={handleRunPruning}>
                <Trash2 size={16} /> Prune Expired Records Now
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSaveSettings}>
                <Save size={16} /> Save Retention Policy
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CENTRE INFORMATION */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">
            <Building size={18} /> Incubation Centre Information
          </h3>
        </div>
        <div className="card-body">
          <form onSubmit={handleSaveSettings}>
            <div className="review-grid">
              <div className="form-group">
                <label className="input-label">Centre / Lab Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={centerName}
                  onChange={(e) => setCenterName(e.target.value)}
                  placeholder="e.g. Innovation & Incubation Centre"
                />
              </div>

              <div className="form-group">
                <label className="input-label">Host College / Institute</label>
                <input
                  type="text"
                  className="input-field"
                  value={collegeName}
                  onChange={(e) => setCollegeName(e.target.value)}
                  placeholder="e.g. College of Engineering & Technology"
                />
              </div>
            </div>

            <div className="review-grid">
              <div className="form-group">
                <label className="input-label">Contact Email</label>
                <input
                  type="email"
                  className="input-field"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="incubation@college.edu"
                />
              </div>

              <div className="form-group">
                <label className="input-label">Contact Phone</label>
                <input
                  type="text"
                  className="input-field"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              <Save size={16} /> Update Information
            </button>
          </form>
        </div>
      </div>

      {/* 3. OFFLINE BACKUP & RESTORE */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <Database size={18} /> Offline Backup, Export & Reset
          </h3>
          <span className="badge badge-success">100% Offline-First</span>
        </div>
        <div className="card-body">
          <p className="text-sm text-muted" style={{ marginBottom: '1.25rem' }}>
            All data is saved securely in your browser's persistent local database (IndexedDB).
            You can export a full JSON backup file at any time for disaster recovery, or transfer data to another workstation.
          </p>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            {/* Export */}
            <button type="button" className="btn btn-secondary" onClick={handleExportBackup}>
              <Download size={16} /> Export Full JSON Backup
            </button>

            {/* Import */}
            <label className="btn btn-secondary" style={{ cursor: 'pointer' }}>
              <Upload size={16} /> Restore from JSON Backup
              <input
                type="file"
                accept=".json"
                onChange={handleImportFile}
                style={{ display: 'none' }}
              />
            </label>

            {/* Reset */}
            <button
              type="button"
              className="btn btn-secondary"
              style={{ color: 'var(--danger)', marginLeft: 'auto' }}
              onClick={() => setIsResetConfirmOpen(true)}
            >
              <RotateCcw size={16} /> Reset to Sample Data
            </button>
          </div>
        </div>
      </div>

      {/* QUICK VERIFY MODAL */}
      {selectedStudentToVerify && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={20} className="text-primary" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800 }}>
                  Verify Journey ({selectedStudentToVerify.rollNumber})
                </h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setSelectedStudentToVerify(null)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveQuickVerify}>
              <p style={{ fontSize: '0.85rem', color: 'var(--neutral-700)', marginBottom: '1rem' }}>
                Verify actual journey details for <strong>{selectedStudentToVerify.name}</strong>:
              </p>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label">Incubation Journey Start Date *</label>
                <input
                  type="date"
                  className="input-field"
                  value={verifyForm.incubationStartDate}
                  onChange={(e) => setVerifyForm({ ...verifyForm, incubationStartDate: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="input-label">Academic Year at Joining *</label>
                <select
                  className="select-field"
                  value={verifyForm.academicYearAtStart}
                  onChange={(e) => setVerifyForm({ ...verifyForm, academicYearAtStart: e.target.value })}
                  required
                >
                  <option value="1">1st Year (4-Year Retention Plan)</option>
                  <option value="2">2nd Year (3-Year Retention Plan)</option>
                  <option value="3">3rd Year (2-Year Retention Plan)</option>
                  <option value="4">4th Year (1-Year Retention Plan)</option>
                </select>
                <span className="input-hint">
                  Retention end date: {calculateRetentionEndDate(verifyForm.incubationStartDate, verifyForm.academicYearAtStart)}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedStudentToVerify(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle size={16} /> Save & Verify
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRUNE CONFIRMATION MODAL */}
      {isPruneConfirmOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldAlert size={22} style={{ color: 'var(--danger)' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Confirm Expired Records Prune</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsPruneConfirmOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--neutral-700)', marginBottom: '0.75rem' }}>
              You are about to prune <strong>{retentionAudit.expiredEligible.length}</strong> expired student account(s):
            </p>
            <div style={{ maxHeight: '120px', overflowY: 'auto', background: 'var(--neutral-50)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
              {retentionAudit.expiredEligible.map((s) => (
                <div key={s.rollNumber} className="text-xs font-mono" style={{ padding: '0.2rem 0' }}>
                  • {s.name} ({s.rollNumber}) — Expired: {s.retentionEndDate}
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--danger-text)', fontWeight: 600, marginBottom: '1.25rem' }}>
              ✓ Pre-cleanup archive verified. Their returned past history will be removed.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsPruneConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleExecuteStudentPruning}
              >
                Yes, Prune Expired Records
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET CONFIRMATION MODAL */}
      {isResetConfirmOpen && (
        <div className="modal-overlay" onClick={() => setIsResetConfirmOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <ShieldAlert size={24} style={{ color: 'var(--danger)' }} />
                <h3 className="modal-title">Reset Database to Sample Data?</h3>
              </div>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: '0.9rem', color: 'var(--neutral-700)' }}>
                This will replace all current inventory, active transactions, and student records with the default
                sample incubation components and demo records.
              </p>
              <p style={{ fontSize: '0.85rem', color: 'var(--danger-text)', marginTop: '0.5rem', fontWeight: 600 }}>
                This action cannot be undone unless you have exported a JSON backup.
              </p>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsResetConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleResetToSample}>
                Yes, Reset to Sample Data
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
