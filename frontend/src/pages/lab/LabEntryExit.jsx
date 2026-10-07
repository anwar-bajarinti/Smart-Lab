// src/pages/LabEntryExit.jsx
// Biometric Entrance/Exit Station: R305 Fingerprint, Face Recognition, Manual Identification,
// First-Visit Registration, "Is this your roll number?" confirmation with inline "Reset Password" button.

import React, { useState } from 'react';
import {
  Fingerprint,
  Camera,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  RotateCcw,
  Key,
  UserPlus,
  Lock,
  UserCheck,
  ShieldCheck,
  Sparkles,
  ScanLine,
} from 'lucide-react';
import {
  recordLabEntry,
  recordLabExit,
  registerStudentFirstVisit,
  resetStudentPassword,
  getUserByRoll,
  getAllUsers,
  getStudentActiveVisit,
} from '../../db/database';
import { biometricService } from '../../services/biometric/biometricService';

export default function LabEntryExit({ onToast, onOpenBarcodeScanner }) {
  const [activeMode, setActiveMode] = useState('entry'); // 'entry' | 'exit' | 'first_registration'

  // Identification State
  const [selectedMethod, setSelectedMethod] = useState('fingerprint'); // 'fingerprint' | 'face' | 'manual'
  const [isScanning, setIsScanning] = useState(false);
  const [manualRollInput, setManualRollInput] = useState('');

  // Confirmation Step State
  // When recognized: shows roll number, "Is this your roll number?", and "Reset Password"
  const [identifiedStudent, setIdentifiedStudent] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [resetError, setResetError] = useState('');

  // Result messages
  const [completionMessage, setCompletionMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Mode Switch Handler - cleanly resets all transient UI states
  function handleModeSwitch(newMode) {
    setActiveMode(newMode);
    setIdentifiedStudent(null);
    setCompletionMessage(null);
    setErrorMessage('');
    setManualRollInput('');
    setIsScanning(false);
    setIsConfirming(false);
  }

  // First-Visit Registration Form State
  const [regName, setRegName] = useState('');
  const [regRoll, setRegRoll] = useState('');
  const [regMobile, setRegMobile] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regDepartment, setRegDepartment] = useState('Electronics & Communication Engineering');
  const [regStartDate, setRegStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [regAcademicYear, setRegAcademicYear] = useState('1');
  const [regFingers, setRegFingers] = useState(['Right Thumb', 'Right Index', 'Left Index']);
  const [enrollmentStep, setEnrollmentStep] = useState(null);

  // 1. Run Identification (Fingerprint / Face / Manual)
  async function handleIdentify() {
    setErrorMessage('');
    setCompletionMessage(null);
    setIsScanning(true);

    try {
      let result;
      if (selectedMethod === 'fingerprint') {
        result = await biometricService.identifyFingerprint();
      } else if (selectedMethod === 'face') {
        result = await biometricService.identifyFace();
      } else {
        result = biometricService.identifyManual(manualRollInput);
      }

      // Exit mode validation: verify student currently has an active inside visit
      if (activeMode === 'exit') {
        const activeVisit = getStudentActiveVisit(result.user.rollNumber);
        if (!activeVisit) {
          setErrorMessage(`Student ${result.user.name} (${result.user.rollNumber}) is not currently inside the lab.`);
          setIdentifiedStudent(null);
          return;
        }
      }

      // Display identified roll number for confirmation
      setIdentifiedStudent(result.user);
    } catch (err) {
      setErrorMessage(err.message || 'Identification failed. Please try again or use manual entry.');
    } finally {
      setIsScanning(false);
    }
  }

  // 2. Student Confirms "Is this your roll number?" -> YES
  async function handleConfirmYes() {
    if (!identifiedStudent || isConfirming) return;
    setIsConfirming(true);
    setErrorMessage('');
    setCompletionMessage(null);

    try {
      if (activeMode === 'entry') {
        const res = await recordLabEntry(identifiedStudent.rollNumber, selectedMethod);
        if (res?.alreadyInside) {
          const entryTimeStr = res.visit?.entryTime
            ? new Date(res.visit.entryTime).toLocaleTimeString()
            : 'earlier today';
          setCompletionMessage({
            type: 'info',
            title: 'Already Inside Lab',
            subtitle: `Roll Number: ${identifiedStudent.rollNumber} (${identifiedStudent.name})`,
            details: `${identifiedStudent.name} is already registered inside the lab since ${entryTimeStr}. Duplicate entry prevented.`,
          });
          if (onToast) onToast(`${identifiedStudent.name} is already inside the lab.`);
        } else {
          const entryTimeStr = res?.visit?.entryTime
            ? new Date(res.visit.entryTime).toLocaleTimeString()
            : new Date().toLocaleTimeString();
          setCompletionMessage({
            type: 'success',
            title: 'You are entered in the lab.',
            subtitle: `Roll Number: ${identifiedStudent.rollNumber} (${identifiedStudent.name})`,
            details: `Entry time recorded: ${entryTimeStr}. Your lab time is now being tracked.`,
          });
          if (onToast) onToast('Lab entry recorded!');
        }
      } else {
        // Exit flow
        const res = await recordLabExit(identifiedStudent.rollNumber, selectedMethod);
        const duration = res?.durationMinutes ?? (res?.visit?.durationMinutes ?? 0);
        setCompletionMessage({
          type: 'success',
          title: 'Thanks for visiting the lab.',
          subtitle: `Roll Number: ${identifiedStudent.rollNumber} (${identifiedStudent.name})`,
          details: `Time spent in lab: ${duration} minutes. Visit record saved.`,
        });
        if (onToast) onToast('Lab exit recorded!');
      }

      setIdentifiedStudent(null);
      setManualRollInput('');
    } catch (err) {
      setErrorMessage(err.message || 'Failed to record lab status. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  }

  // 3. Student Confirms "Is this your roll number?" -> NO
  function handleConfirmNo() {
    setIdentifiedStudent(null);
    setErrorMessage('Please try identifying yourself again with fingerprint, face, or manual entry.');
  }

  // 4. Reset Password during identification
  function handleSavePasswordReset(e) {
    e.preventDefault();
    setResetError('');
    try {
      resetStudentPassword(identifiedStudent.rollNumber, newPasswordInput, `${identifiedStudent.name} (Entrance Station)`);
      setIsResetPasswordModalOpen(false);
      setNewPasswordInput('');
      if (onToast) onToast('Password reset successfully! You can now confirm your roll number.');
    } catch (err) {
      setResetError(err.message);
    }
  }

  // 5. First-Visit Registration Submission
  async function handleFirstVisitRegister(e) {
    e.preventDefault();
    setErrorMessage('');

    try {
      // Simulate R305 3-finger enrollment sequence
      setEnrollmentStep('Enrolling 3 fingerprints on R305 sensor...');
      const fResult = await biometricService.enrollThreeFingers(regFingers, (progress) => {
        setEnrollmentStep(`Step ${progress.step} of 3: Place ${progress.fingerName} on R305 sensor...`);
      });

      setEnrollmentStep('Capturing face encoding...');
      await new Promise((res) => setTimeout(res, 600));

      const newUser = await registerStudentFirstVisit({
        name: regName,
        rollNumber: regRoll,
        mobileNumber: regMobile,
        password: regPassword,
        fingerprintIds: fResult.fingerprintIds,
        fingerLabels: regFingers,
        department: regDepartment,
        faceRegistered: true,
        incubationStartDate: regStartDate,
        academicYearAtStart: Number(regAcademicYear),
      });

      setEnrollmentStep(null);
      setActiveMode('entry');
      setCompletionMessage({
        type: 'success',
        title: 'Registration Complete!',
        subtitle: `Welcome ${newUser.name}! Your User ID is ${newUser.rollNumber}.`,
        details: `3 fingerprints, face encoding, and ${newUser.retentionPeriodYears || 4}-year retention journey registered. You can now enter the lab.`,
      });

      // Clear form
      setRegName('');
      setRegRoll('');
      setRegMobile('');
      setRegPassword('');
      setRegStartDate(new Date().toISOString().slice(0, 10));
      setRegAcademicYear('1');
      if (onToast) onToast(`Student ${newUser.name} registered successfully!`);
    } catch (err) {
      setEnrollmentStep(null);
      setErrorMessage(err.message);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Physical Lab Entrance & Exit Station
          </h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Biometric student identification, daily attendance (roll number only), and lab duration tracking
          </p>
        </div>

        {/* Mode Switcher */}
        <div style={{ display: 'flex', gap: '0.5rem', background: '#e2e8f0', padding: '0.25rem', borderRadius: 'var(--radius-md)' }}>
          <button
            type="button"
            className="btn btn-sm"
            style={{
              background: activeMode === 'entry' ? 'var(--primary)' : 'transparent',
              color: activeMode === 'entry' ? '#fff' : 'var(--neutral-700)',
              border: 'none',
              fontWeight: 700,
            }}
            onClick={() => handleModeSwitch('entry')}
          >
            Entering Lab
          </button>

          <button
            type="button"
            className="btn btn-sm"
            style={{
              background: activeMode === 'exit' ? 'var(--primary)' : 'transparent',
              color: activeMode === 'exit' ? '#fff' : 'var(--neutral-700)',
              border: 'none',
              fontWeight: 700,
            }}
            onClick={() => handleModeSwitch('exit')}
          >
            Leaving Lab
          </button>

          <button
            type="button"
            className="btn btn-sm"
            style={{
              background: activeMode === 'first_registration' ? 'var(--primary)' : 'transparent',
              color: activeMode === 'first_registration' ? '#fff' : 'var(--neutral-700)',
              border: 'none',
              fontWeight: 700,
            }}
            onClick={() => handleModeSwitch('first_registration')}
          >
            First Lab Visit (Register)
          </button>
        </div>
      </div>

      {errorMessage && (
        <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {completionMessage && (
        <div
          className={`alert ${completionMessage.type === 'info' ? 'alert-info' : 'alert-success'}`}
          style={{
            marginBottom: '1.25rem',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <CheckCircle2
              size={28}
              style={{
                color: completionMessage.type === 'info' ? 'var(--info)' : 'var(--success)',
                flexShrink: 0,
                marginTop: '2px',
              }}
            />
            <div>
              <h3
                style={{
                  fontSize: '1.15rem',
                  fontWeight: 800,
                  color: completionMessage.type === 'info' ? 'var(--info-text, #1e40af)' : 'var(--success-text)',
                }}
              >
                {completionMessage.title}
              </h3>
              <div style={{ fontWeight: 600, fontSize: '0.92rem', marginTop: '0.2rem' }}>
                {completionMessage.subtitle}
              </div>
              <div className="text-xs text-muted" style={{ marginTop: '0.25rem' }}>
                {completionMessage.details}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{
              padding: '0.25rem 0.5rem',
              minWidth: 'auto',
              color: 'var(--neutral-600)',
              cursor: 'pointer',
              lineHeight: 1,
            }}
            onClick={() => setCompletionMessage(null)}
            title="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ==================== NORMAL ENTRY & EXIT STATION ==================== */}
      {activeMode !== 'first_registration' && (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          {/* STEP 1: IDENTIFICATION METHODS */}
          {!identifiedStudent && (
            <div className="card">
              <div className="card-header">
                <h3 className="card-title">
                  {activeMode === 'entry' ? 'Identify to Enter Lab' : 'Identify to Exit Lab'}
                </h3>
                <span className="badge badge-info">Identification Methods</span>
              </div>

              <div className="card-body">
                <p className="text-sm text-muted" style={{ marginBottom: '1.25rem' }}>
                  Please scan your college ID card barcode, place your finger on the sensor, look into the camera, or enter your roll number:
                </p>

                {/* Identification Method Selectors */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <button
                    type="button"
                    className="card"
                    style={{
                      padding: '1rem',
                      textAlign: 'center',
                      border: selectedMethod === 'barcode' ? '2px solid var(--primary)' : '1px solid var(--neutral-200)',
                      background: selectedMethod === 'barcode' ? 'var(--primary-light)' : '#fff',
                      cursor: 'pointer',
                      marginBottom: 0,
                    }}
                    onClick={() => {
                      setSelectedMethod('barcode');
                      if (onOpenBarcodeScanner) onOpenBarcodeScanner();
                    }}
                  >
                    <ScanLine size={28} style={{ color: selectedMethod === 'barcode' ? 'var(--primary)' : 'var(--neutral-500)', margin: '0 auto 0.5rem' }} />
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>College ID Barcode</strong>
                  </button>

                  <button
                    type="button"
                    className="card"
                    style={{
                      padding: '1rem',
                      textAlign: 'center',
                      border: selectedMethod === 'fingerprint' ? '2px solid var(--primary)' : '1px solid var(--neutral-200)',
                      background: selectedMethod === 'fingerprint' ? 'var(--primary-light)' : '#fff',
                      cursor: 'pointer',
                      marginBottom: 0,
                    }}
                    onClick={() => setSelectedMethod('fingerprint')}
                  >
                    <Fingerprint size={28} style={{ color: selectedMethod === 'fingerprint' ? 'var(--primary)' : 'var(--neutral-500)', margin: '0 auto 0.5rem' }} />
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>R305 Fingerprint</strong>
                  </button>

                  <button
                    type="button"
                    className="card"
                    style={{
                      padding: '1rem',
                      textAlign: 'center',
                      border: selectedMethod === 'face' ? '2px solid var(--primary)' : '1px solid var(--neutral-200)',
                      background: selectedMethod === 'face' ? 'var(--primary-light)' : '#fff',
                      cursor: 'pointer',
                      marginBottom: 0,
                    }}
                    onClick={() => setSelectedMethod('face')}
                  >
                    <Camera size={28} style={{ color: selectedMethod === 'face' ? 'var(--primary)' : 'var(--neutral-500)', margin: '0 auto 0.5rem' }} />
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>Face Recognition</strong>
                  </button>

                  <button
                    type="button"
                    className="card"
                    style={{
                      padding: '1rem',
                      textAlign: 'center',
                      border: selectedMethod === 'manual' ? '2px solid var(--primary)' : '1px solid var(--neutral-200)',
                      background: selectedMethod === 'manual' ? 'var(--primary-light)' : '#fff',
                      cursor: 'pointer',
                      marginBottom: 0,
                    }}
                    onClick={() => setSelectedMethod('manual')}
                  >
                    <Search size={28} style={{ color: selectedMethod === 'manual' ? 'var(--primary)' : 'var(--neutral-500)', margin: '0 auto 0.5rem' }} />
                    <strong style={{ display: 'block', fontSize: '0.85rem' }}>Manual Roll No</strong>
                  </button>
                </div>

                {/* Method Specific UI */}
                {selectedMethod === 'barcode' && (
                  <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>
                      Scan the 1D barcode on your physical college ID card to record lab entry and mark attendance.
                    </p>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        if (onOpenBarcodeScanner) onOpenBarcodeScanner();
                      }}
                    >
                      <ScanLine size={16} /> Open College ID Barcode Scanner
                    </button>
                  </div>
                )}

                {selectedMethod === 'manual' && (
                  <div className="form-group">
                    <label className="input-label">Enter Roll Number</label>
                    <input
                      type="text"
                      className="input-field uppercase-input"
                      placeholder="e.g. 238W1A0477"
                      value={manualRollInput}
                      onChange={(e) => setManualRollInput(e.target.value)}
                      autoFocus
                    />
                  </div>
                )}

                {selectedMethod === 'fingerprint' && (
                  <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <p className="text-sm text-muted">
                      Touch any of your 3 registered fingers to the R305 optical prism.
                    </p>
                  </div>
                )}

                {selectedMethod === 'face' && (
                  <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                    <p className="text-sm text-muted">
                      Look directly into the camera lens for facial recognition.
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                  onClick={handleIdentify}
                  disabled={isScanning || (selectedMethod === 'manual' && !manualRollInput.trim())}
                >
                  {isScanning ? (
                    'Recognizing Student...'
                  ) : (
                    <>
                      Verify Identity <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CONFIRMATION SCREEN ("Is this your roll number?" + "Reset Password" button) */}
          {identifiedStudent && (
            <div className="card" style={{ border: '2px solid var(--primary)', boxShadow: 'var(--shadow-lg)' }}>
              <div className="card-header" style={{ background: 'var(--primary-light)', textAlign: 'center' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)' }}>
                  Student Identified
                </h3>
              </div>

              <div className="card-body" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
                <span className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '1px' }}>
                  Detected Roll Number
                </span>
                <div
                  className="font-mono"
                  style={{
                    fontSize: '2.5rem',
                    fontWeight: 900,
                    color: 'var(--neutral-900)',
                    margin: '0.25rem 0 1rem',
                  }}
                >
                  {identifiedStudent.rollNumber}
                </div>

                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--neutral-800)', marginBottom: '1.5rem' }}>
                  Is this your roll number?
                </div>

                {/* YES and NO Confirmation Buttons */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginBottom: '1.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-success btn-lg"
                    style={{ minWidth: '150px' }}
                    onClick={handleConfirmYes}
                    disabled={isConfirming}
                  >
                    <CheckCircle2 size={20} /> {isConfirming ? 'Confirming...' : 'YES, Confirm'}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-lg"
                    style={{ minWidth: '150px' }}
                    onClick={handleConfirmNo}
                    disabled={isConfirming}
                  >
                    NO, Retry
                  </button>
                </div>

                {/* INLINE RESET PASSWORD BUTTON (NO separate question asked!) */}
                <div style={{ borderTop: '1px solid var(--neutral-200)', paddingTop: '1.25rem' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setIsResetPasswordModalOpen(true)}
                  >
                    <Key size={14} /> Reset Password
                  </button>
                  <span className="input-hint" style={{ marginTop: '0.35rem' }}>
                    Forgot your account password? Change it now and return here to complete entry.
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================== FIRST LAB VISIT REGISTRATION ==================== */}
      {activeMode === 'first_registration' && (
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <UserPlus size={20} className="icon-primary" /> First Lab Visit: Student Registration
              </h3>
              <span className="badge badge-primary">3 Fingers + Face + Password</span>
            </div>

            <div className="card-body">
              <p className="text-sm text-muted" style={{ marginBottom: '1.25rem' }}>
                On your first visit, register your 3 fingerprints and face encoding. Your Roll Number will become your User ID.
              </p>

              <form onSubmit={handleFirstVisitRegister}>
                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Student Full Name <span className="required-star">*</span></label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Anwar Bajarinti"
                      value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="input-label">Roll Number (User ID) <span className="required-star">*</span></label>
                    <input
                      type="text"
                      className="input-field uppercase-input"
                      placeholder="e.g. 238W1A0477"
                      value={regRoll}
                      onChange={(e) => setRegRoll(e.target.value.toUpperCase())}
                      required
                    />
                  </div>
                </div>

                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Mobile Number</label>
                    <input
                      type="tel"
                      className="input-field"
                      placeholder="+91 98765 43210"
                      value={regMobile}
                      onChange={(e) => setRegMobile(e.target.value)}
                    />
                  </div>

                  <div className="form-group">
                    <label className="input-label">Create Account Password <span className="required-star">*</span></label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="••••••••"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Incubation Journey & Academic Year at Start */}
                <div className="review-grid" style={{ marginBottom: '1rem' }}>
                  <div className="form-group">
                    <label className="input-label">
                      Incubation Journey Start Date <span className="required-star">*</span>
                    </label>
                    <input
                      type="date"
                      className="input-field"
                      value={regStartDate}
                      onChange={(e) => setRegStartDate(e.target.value)}
                      required
                    />
                    <span className="input-hint">Official date student joined the incubation lab</span>
                  </div>

                  <div className="form-group">
                    <label className="input-label">
                      Academic Year at Joining <span className="required-star">*</span>
                    </label>
                    <select
                      className="select-field"
                      value={regAcademicYear}
                      onChange={(e) => setRegAcademicYear(e.target.value)}
                      required
                    >
                      <option value="1">1st Year (4-Year Retention Plan)</option>
                      <option value="2">2nd Year (3-Year Retention Plan)</option>
                      <option value="3">3rd Year (2-Year Retention Plan)</option>
                      <option value="4">4th Year (1-Year Retention Plan)</option>
                    </select>
                    <span className="input-hint">
                      Retention period is strictly calculated from this date & year. Never guessed from roll numbers.
                    </span>
                  </div>
                </div>

                {/* 3 Fingerprint Selection */}
                <div style={{ background: 'var(--neutral-50)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--neutral-200)' }}>
                  <label className="input-label" style={{ marginBottom: '0.5rem' }}>
                    <Fingerprint size={16} /> Choose 3 Fingers for R305 Registration:
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                    {[0, 1, 2].map((idx) => (
                      <select
                        key={idx}
                        className="select-field text-xs"
                        value={regFingers[idx]}
                        onChange={(e) => {
                          const updated = [...regFingers];
                          updated[idx] = e.target.value;
                          setRegFingers(updated);
                        }}
                      >
                        <option value="Right Thumb">Right Thumb</option>
                        <option value="Right Index">Right Index</option>
                        <option value="Right Middle">Right Middle</option>
                        <option value="Left Thumb">Left Thumb</option>
                        <option value="Left Index">Left Index</option>
                        <option value="Left Middle">Left Middle</option>
                      </select>
                    ))}
                  </div>
                </div>

                {enrollmentStep && (
                  <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                    <Sparkles size={18} />
                    <span>{enrollmentStep}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%' }}
                  disabled={Boolean(enrollmentStep)}
                >
                  {enrollmentStep ? 'Capturing Biometrics...' : 'Enroll 3 Fingerprints, Face & Create Account'}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ==================== RESET PASSWORD MODAL ==================== */}
      {isResetPasswordModalOpen && identifiedStudent && (
        <div className="modal-overlay" onClick={() => setIsResetPasswordModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSavePasswordReset}>
              <div className="modal-header">
                <div className="modal-title-group">
                  <Key size={22} className="icon-primary" />
                  <div>
                    <h3 className="modal-title">Reset Password</h3>
                    <p className="modal-subtitle">Roll Number: {identifiedStudent.rollNumber}</p>
                  </div>
                </div>
              </div>

              <div className="modal-body">
                {resetError && (
                  <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                    <AlertCircle size={16} />
                    <span>{resetError}</span>
                  </div>
                )}

                <div className="form-group">
                  <label className="input-label">New Password</label>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="Enter new password (min 4 characters)"
                    value={newPasswordInput}
                    onChange={(e) => setNewPasswordInput(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsResetPasswordModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save New Password & Return
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
