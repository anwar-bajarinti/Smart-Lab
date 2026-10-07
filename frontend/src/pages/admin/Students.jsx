// src/pages/Students.jsx
// Student Directory & Account Management for Admin & Substitute Admin
// Features: Student search, active loan counts, biometric status badges,
// account editing (Name, Mobile, Department), password reset modal, and new account registration.

import React, { useState, useEffect } from 'react';
import {
  Users,
  Search,
  User,
  Hash,
  Phone,
  BookOpen,
  ArrowUpRight,
  ArrowDownLeft,
  Package,
  PlusCircle,
  Key,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Fingerprint,
  Camera,
  X,
  ShieldCheck,
  Calendar,
  ScanLine,
} from 'lucide-react';
import {
  getStudents,
  getStudentsCurrentlyInside,
  getTransactions,
  registerStudentFirstVisit,
  updateStudentAccount,
  resetStudentPassword,
  subscribeToDb,
} from '../../db/database';
import {
  categorizeStudentRetention,
  calculateRetentionYears,
  calculateRetentionEndDate,
} from '../../services/storage/storageProtectionService';

export default function Students({
  currentUser,
  setActiveTab,
  onOpenIssueWithStudent,
  onOpenReturnWithRoll,
  onToast,
  onOpenBarcodeScanner,
}) {
  const [studentsList, setStudentsList] = useState([]);
  const [transactionsList, setTransactionsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [retentionFilter, setRetentionFilter] = useState('all'); // 'all' | 'needs_verification' | 'active' | 'expired'

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetPassModalOpen, setIsResetPassModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  // Add Student Form State
  const [newStudentForm, setNewStudentForm] = useState({
    name: '',
    rollNumber: '',
    mobileNumber: '',
    department: 'Electronics & Communication',
    password: '',
    incubationStartDate: new Date().toISOString().slice(0, 10),
    academicYearAtStart: '1',
  });

  // Edit Student Form State
  const [editForm, setEditForm] = useState({
    name: '',
    mobileNumber: '',
    department: '',
    role: 'student',
    incubationStartDate: '',
    academicYearAtStart: '',
  });

  // Reset Password State
  const [newPasswordInput, setNewPasswordInput] = useState('');

  const isAdminOrSubstitute =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'substitute_admin' ||
    !currentUser?.role; // Fallback if local offline without auth

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, []);

  function loadData() {
    setStudentsList(getStudents());
    setTransactionsList(getTransactions('all'));
  }

  // Handle Add Student
  async function handleAddStudent(e) {
    e.preventDefault();
    if (!newStudentForm.name.trim() || !newStudentForm.rollNumber.trim()) {
      if (onToast) onToast('Name and Roll Number are required.');
      return;
    }
    if (!newStudentForm.password || newStudentForm.password.length < 4) {
      if (onToast) onToast('Password must be at least 4 characters.');
      return;
    }

    try {
      await registerStudentFirstVisit({
        name: newStudentForm.name,
        rollNumber: newStudentForm.rollNumber,
        mobileNumber: newStudentForm.mobileNumber,
        department: newStudentForm.department,
        password: newStudentForm.password,
        faceRegistered: true,
        incubationStartDate: newStudentForm.incubationStartDate,
        academicYearAtStart: Number(newStudentForm.academicYearAtStart),
      });

      if (onToast) {
        onToast(`Student ${newStudentForm.name} (${newStudentForm.rollNumber.toUpperCase()}) registered successfully.`);
      }

      setIsAddModalOpen(false);
      setNewStudentForm({
        name: '',
        rollNumber: '',
        mobileNumber: '',
        department: 'Electronics & Communication',
        password: '',
        incubationStartDate: new Date().toISOString().slice(0, 10),
        academicYearAtStart: '1',
      });
      loadData();
    } catch (err) {
      if (onToast) onToast(`Registration error: ${err.message}`);
    }
  }

  // Handle Open Edit Modal
  function handleOpenEdit(student) {
    setSelectedStudent(student);
    setEditForm({
      name: student.name || '',
      mobileNumber: student.mobileNumber || '',
      department: student.department || '',
      role: student.role || 'student',
      incubationStartDate: student.incubationStartDate || '',
      academicYearAtStart: student.academicYearAtStart ? String(student.academicYearAtStart) : '',
    });
    setIsEditModalOpen(true);
  }

  // Handle Submit Edit
  async function handleSubmitEdit(e) {
    e.preventDefault();
    if (!selectedStudent) return;
    try {
      await updateStudentAccount(
        selectedStudent.rollNumber,
        {
          ...editForm,
          incubationStartDate: editForm.incubationStartDate || null,
          academicYearAtStart: editForm.academicYearAtStart ? Number(editForm.academicYearAtStart) : null,
        },
        currentUser
      );
      if (onToast) onToast(`Updated details for ${selectedStudent.name}.`);
      setIsEditModalOpen(false);
      setSelectedStudent(null);
      loadData();
    } catch (err) {
      if (onToast) onToast(`Update failed: ${err.message}`);
    }
  }

  // Handle Open Reset Password Modal
  function handleOpenResetPassword(student) {
    setSelectedStudent(student);
    setNewPasswordInput('');
    setIsResetPassModalOpen(true);
  }

  // Handle Submit Password Reset
  function handleSubmitPasswordReset(e) {
    e.preventDefault();
    if (!selectedStudent) return;
    if (!newPasswordInput || newPasswordInput.length < 4) {
      if (onToast) onToast('Password must be at least 4 characters.');
      return;
    }

    try {
      resetStudentPassword(
        selectedStudent.rollNumber,
        newPasswordInput,
        `${currentUser?.name || 'Admin'} (Account Management)`
      );
      if (onToast) onToast(`Password reset successfully for ${selectedStudent.name}.`);
      setIsResetPassModalOpen(false);
      setSelectedStudent(null);
      setNewPasswordInput('');
      loadData();
    } catch (err) {
      if (onToast) onToast(`Password reset failed: ${err.message}`);
    }
  }

  // Calculate stats per student
  const insideRolls = (getStudentsCurrentlyInside?.() || []).map((s) => s.rollNumber);
  const studentStats = studentsList.map((stud) => {
    const studentTxns = transactionsList.filter(
      (t) => t.studentRoll.toUpperCase() === stud.rollNumber.toUpperCase()
    );
    const activeTxns = studentTxns.filter(
      (t) => t.status === 'active' || t.status === 'partially_returned'
    );
    let activeComponentsCount = 0;
    for (const t of activeTxns) {
      for (const it of t.items) {
        activeComponentsCount += it.issuedQuantity - it.returnedQuantity;
      }
    }

    const retention = categorizeStudentRetention(stud, transactionsList, insideRolls);

    return {
      ...stud,
      totalBorrows: studentTxns.length,
      activeBorrows: activeTxns.length,
      activeComponentsCount,
      retention,
    };
  });

  const unverifiedCount = studentStats.filter((s) => s.retention?.status === 'NEEDS_VERIFICATION').length;
  const expiredCount = studentStats.filter((s) => s.retention?.status === 'EXPIRED_ELIGIBLE' || s.retention?.status === 'EXPIRED_BLOCKED').length;

  const filtered = studentStats.filter((stud) => {
    // Retention filter
    if (retentionFilter === 'needs_verification' && stud.retention?.status !== 'NEEDS_VERIFICATION') {
      return false;
    }
    if (retentionFilter === 'active' && stud.retention?.status !== 'ACTIVE') {
      return false;
    }
    if (retentionFilter === 'expired' && (stud.retention?.status !== 'EXPIRED_ELIGIBLE' && stud.retention?.status !== 'EXPIRED_BLOCKED')) {
      return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      stud.name.toLowerCase().includes(q) ||
      stud.rollNumber.toLowerCase().includes(q) ||
      (stud.department && stud.department.toLowerCase().includes(q)) ||
      (stud.mobileNumber && stud.mobileNumber.toLowerCase().includes(q))
    );
  });

  if (!isAdminOrSubstitute) {
    return (
      <div className="card">
        <div className="card-body" style={{ textAlign: 'center', padding: '3rem' }}>
          <AlertCircle size={48} style={{ color: 'var(--danger)', margin: '0 auto 1rem' }} />
          <h3>Access Restricted</h3>
          <p className="text-muted">
            Only the Lab Admin and Substitute Admin are authorized to access the Students Directory.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Students & Accounts Management
          </h2>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Registered student borrowers, biometric authentication profiles, and account controls
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setActiveTab('lab_entry_exit')}
            title="Open Biometric Entrance/Exit Station"
          >
            <Fingerprint size={18} />
            Entrance Station
          </button>
          {onOpenBarcodeScanner && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onOpenBarcodeScanner}
              title="Scan Student ID Card Barcode / QR Code"
            >
              <ScanLine size={18} />
              Scan ID Barcode
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIsAddModalOpen(true)}
          >
            <PlusCircle size={18} />
            Register Student Account
          </button>
        </div>
      </div>

      {/* Unverified Legacy Students Alert Banner */}
      {unverifiedCount > 0 && (
        <div
          className="alert alert-warning"
          style={{
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <AlertCircle size={20} style={{ color: '#d97706', flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '0.95rem' }}>
                {unverifiedCount} Student{unverifiedCount !== 1 ? 's' : ''} Need Incubation Journey Verification
              </strong>
              <div className="text-xs" style={{ marginTop: '0.15rem', color: '#b45309' }}>
                Existing records without an explicit start date are 100% protected and exempt from deletion.
                Please verify their actual incubation start date and joining year.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRetentionFilter('needs_verification')}
          >
            Review Unverified ({unverifiedCount})
          </button>
        </div>
      )}

      {/* Filter Tabs & Search Bar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          type="button"
          className={`btn btn-sm ${retentionFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setRetentionFilter('all')}
        >
          All Students ({studentsList.length})
        </button>
        <button
          type="button"
          className={`btn btn-sm ${retentionFilter === 'needs_verification' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setRetentionFilter('needs_verification')}
          style={unverifiedCount > 0 && retentionFilter !== 'needs_verification' ? { borderColor: '#f59e0b', color: '#b45309' } : {}}
        >
          Needs Verification {unverifiedCount > 0 ? `(${unverifiedCount})` : ''}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${retentionFilter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setRetentionFilter('active')}
        >
          Active Retention
        </button>
        {expiredCount > 0 && (
          <button
            type="button"
            className={`btn btn-sm ${retentionFilter === 'expired' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setRetentionFilter('expired')}
            style={{ color: 'var(--danger)' }}
          >
            Expired ({expiredCount})
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-body" style={{ padding: '0.75rem 1rem' }}>
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="input-field search-input"
              placeholder="Search by student name, roll number, mobile, or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Students Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Student Details</th>
                <th>Department</th>
                <th>Contact</th>
                <th>Biometrics</th>
                <th>Journey & Retention</th>
                <th>Active Loans</th>
                <th>Total Borrows</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((stud) => (
                  <tr key={stud.rollNumber}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--neutral-900)' }}>
                        {stud.name}
                      </div>
                      <div className="font-mono text-xs text-muted">
                        Roll: {stud.rollNumber}
                      </div>
                    </td>
                    <td className="text-sm">
                      {stud.department || <span className="text-muted">—</span>}
                    </td>
                    <td className="text-sm font-mono">
                      {stud.mobileNumber || <span className="text-muted">—</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        {stud.fingerprintIds && stud.fingerprintIds.length > 0 ? (
                          <span
                            className="badge badge-success"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}
                            title={`Registered finger slots: ${stud.fingerprintIds.join(', ')}`}
                          >
                            <Fingerprint size={12} /> {stud.fingerprintIds.length} Fingers Enrolled
                          </span>
                        ) : (
                          <span className="badge badge-neutral" style={{ width: 'fit-content' }}>
                            No Fingerprints
                          </span>
                        )}
                        {stud.faceRegistered ? (
                          <span
                            className="badge badge-info"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', width: 'fit-content' }}
                          >
                            <Camera size={12} /> Face Enrolled
                          </span>
                        ) : (
                          <span className="badge badge-neutral" style={{ width: 'fit-content' }}>
                            No Face
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {stud.retention?.status === 'NEEDS_VERIFICATION' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span
                            className="badge badge-warning"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer', width: 'fit-content' }}
                            onClick={() => handleOpenEdit(stud)}
                            title="Click to verify journey start date and year"
                          >
                            <AlertCircle size={12} /> Verify Journey Start
                          </span>
                          <span className="text-xs text-muted">Exempt from Pruning</span>
                        </div>
                      ) : stud.retention?.status === 'ACTIVE' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span className="badge badge-success" style={{ width: 'fit-content' }}>
                            {stud.academicYearAtStart ? `Year ${stud.academicYearAtStart} Start` : 'Active'} ({stud.retentionPeriodYears || 4}y Plan)
                          </span>
                          <span className="text-xs text-muted font-mono">
                            Exp: {stud.retentionEndDate}
                          </span>
                        </div>
                      ) : stud.retention?.status === 'EXPIRED_ELIGIBLE' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span className="badge badge-danger" style={{ width: 'fit-content' }}>
                            Retention Expired
                          </span>
                          <span className="text-xs text-muted font-mono">
                            Ended {stud.retentionEndDate} (Eligible)
                          </span>
                        </div>
                      ) : stud.retention?.status === 'EXPIRED_BLOCKED' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                          <span className="badge badge-warning" style={{ width: 'fit-content' }}>
                            Expired (Protected)
                          </span>
                          <span className="text-xs text-muted">
                            {stud.retention.blockReason}
                          </span>
                        </div>
                      ) : (
                        <span className="badge badge-neutral">Staff Account</span>
                      )}
                      {stud.idCardValidityYear && (
                        <div style={{ marginTop: '0.25rem' }}>
                          <span
                            className="badge"
                            style={{
                              background: stud.idCardValidityYear >= new Date().getFullYear() ? '#ecfdf5' : '#fef2f2',
                              color: stud.idCardValidityYear >= new Date().getFullYear() ? '#065f46' : '#991b1b',
                              border: `1px solid ${stud.idCardValidityYear >= new Date().getFullYear() ? '#a7f3d0' : '#fecaca'}`,
                              fontSize: '0.72rem',
                              width: 'fit-content',
                            }}
                            title={`College ID Card Validity: ${stud.idCardValidityYear}`}
                          >
                            Card: {stud.idCardValidityYear} ({stud.idCardValidityYear >= new Date().getFullYear() ? 'Valid' : 'Expired'})
                          </span>
                        </div>
                      )}
                    </td>
                    <td>
                      {stud.activeComponentsCount > 0 ? (
                        <span className="badge badge-warning">
                          {stud.activeComponentsCount} item(s) in use
                        </span>
                      ) : (
                        <span className="badge badge-success">No active loans</span>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-neutral">
                        {stud.totalBorrows} transaction{stud.totalBorrows !== 1 ? 's' : ''}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            if (onOpenIssueWithStudent) onOpenIssueWithStudent(stud);
                            else setActiveTab('issue');
                          }}
                          title="Issue components to this student"
                        >
                          <ArrowUpRight size={14} /> Issue
                        </button>
                        {stud.activeComponentsCount > 0 && (
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            onClick={() => {
                              if (onOpenReturnWithRoll) onOpenReturnWithRoll(stud.rollNumber);
                              else setActiveTab('return');
                            }}
                            title="Process returns"
                          >
                            <ArrowDownLeft size={14} /> Return
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleOpenEdit(stud)}
                          title="Edit Student Information"
                        >
                          <Edit2 size={13} /> Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn-warning btn-sm"
                          onClick={() => handleOpenResetPassword(stud)}
                          title="Reset Password"
                        >
                          <Key size={13} /> Password
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }} className="text-muted">
                    No students found matching your search query.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: REGISTER NEW STUDENT ACCOUNT */}
      {isAddModalOpen && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Users size={20} className="text-primary" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Register Student Account</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsAddModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddStudent}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label">Full Name *</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Ramesh Kumar"
                  value={newStudentForm.name}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label">Roll Number (Unique ID) *</label>
                <input
                  type="text"
                  className="input-field font-mono"
                  placeholder="e.g. 238W1A0477"
                  value={newStudentForm.rollNumber}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, rollNumber: e.target.value.toUpperCase() })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label">Mobile Number</label>
                <input
                  type="tel"
                  className="input-field font-mono"
                  placeholder="e.g. +91 98765 43210"
                  value={newStudentForm.mobileNumber}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, mobileNumber: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label">Department / Branch</label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Electronics & Communication"
                  value={newStudentForm.department}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, department: e.target.value })}
                />
              </div>

              {/* Incubation Journey Inputs */}
              <div className="review-grid" style={{ marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="input-label">Incubation Start Date *</label>
                  <input
                    type="date"
                    className="input-field"
                    value={newStudentForm.incubationStartDate}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, incubationStartDate: e.target.value })}
                    required
                  />
                  <span className="input-hint">Official joining date</span>
                </div>
                <div className="form-group">
                  <label className="input-label">Joining Academic Year *</label>
                  <select
                    className="select-field"
                    value={newStudentForm.academicYearAtStart}
                    onChange={(e) => setNewStudentForm({ ...newStudentForm, academicYearAtStart: e.target.value })}
                    required
                  >
                    <option value="1">1st Year (4-Year Retention Plan)</option>
                    <option value="2">2nd Year (3-Year Retention Plan)</option>
                    <option value="3">3rd Year (2-Year Retention Plan)</option>
                    <option value="4">4th Year (1-Year Retention Plan)</option>
                  </select>
                  <span className="input-hint">Never guessed from roll number</span>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="input-label">Initial Password *</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Minimum 4 characters"
                  value={newStudentForm.password}
                  onChange={(e) => setNewStudentForm({ ...newStudentForm, password: e.target.value })}
                  required
                />
                <span className="text-xs text-muted" style={{ display: 'block', marginTop: '0.25rem' }}>
                  Student can reset this password at the Entrance Station or with an Admin.
                </span>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAddModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle2 size={16} /> Register Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT STUDENT DETAILS */}
      {isEditModalOpen && selectedStudent && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Edit2 size={20} className="text-primary" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                  Edit Student ({selectedStudent.rollNumber})
                </h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsEditModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmitEdit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label">Student Name</label>
                <input
                  type="text"
                  className="input-field"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label">Mobile Number</label>
                <input
                  type="tel"
                  className="input-field font-mono"
                  value={editForm.mobileNumber}
                  onChange={(e) => setEditForm({ ...editForm, mobileNumber: e.target.value })}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label">Department / Branch</label>
                <input
                  type="text"
                  className="input-field"
                  value={editForm.department}
                  onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
                />
              </div>

              {/* Incubation Journey Verification Fields */}
              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1.25rem', border: '1px solid var(--neutral-200)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '0.5rem', color: 'var(--neutral-800)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Calendar size={15} className="text-primary" /> Incubation Journey & 4-Year Retention Verification
                </div>
                <div className="review-grid" style={{ gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <label className="input-label text-xs">Journey Start Date</label>
                    <input
                      type="date"
                      className="input-field"
                      value={editForm.incubationStartDate}
                      onChange={(e) => setEditForm({ ...editForm, incubationStartDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <label className="input-label text-xs">Academic Year at Start</label>
                    <select
                      className="select-field"
                      value={editForm.academicYearAtStart}
                      onChange={(e) => setEditForm({ ...editForm, academicYearAtStart: e.target.value })}
                    >
                      <option value="">-- Not Verified --</option>
                      <option value="1">1st Year (4-Year Retention Plan)</option>
                      <option value="2">2nd Year (3-Year Retention Plan)</option>
                      <option value="3">3rd Year (2-Year Retention Plan)</option>
                      <option value="4">4th Year (1-Year Retention Plan)</option>
                    </select>
                  </div>
                </div>
                <div className="text-xs text-muted" style={{ marginTop: '0.45rem' }}>
                  {editForm.incubationStartDate && editForm.academicYearAtStart ? (
                    <span style={{ color: 'var(--success-text, #059669)', fontWeight: 600 }}>
                      ✓ Retention Plan: {calculateRetentionYears(editForm.academicYearAtStart)} years (Expires: {calculateRetentionEndDate(editForm.incubationStartDate, editForm.academicYearAtStart)})
                    </span>
                  ) : (
                    <span style={{ color: 'var(--warning-text, #d97706)' }}>
                      ⚠️ Start date or joining year unverified. Student is exempt from deletion.
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEditModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  <CheckCircle2 size={16} /> Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RESET STUDENT PASSWORD */}
      {isResetPassModalOpen && selectedStudent && (
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Key size={20} className="text-warning" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Reset Password</h3>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsResetPassModalOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--neutral-100)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--neutral-900)' }}>
                {selectedStudent.name}
              </div>
              <div className="font-mono text-xs text-muted">
                Roll Number: {selectedStudent.rollNumber}
              </div>
            </div>

            <form onSubmit={handleSubmitPasswordReset}>
              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="input-label">New Password</label>
                <input
                  type="password"
                  className="input-field"
                  placeholder="Enter new password (min 4 characters)"
                  value={newPasswordInput}
                  onChange={(e) => setNewPasswordInput(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsResetPassModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-warning">
                  <Key size={16} /> Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
