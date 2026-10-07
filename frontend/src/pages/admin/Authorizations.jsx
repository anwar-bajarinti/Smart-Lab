// src/pages/Authorizations.jsx
// Student delegation management: enables a student to authorize another student to collect/return on their behalf

import React, { useState, useEffect } from 'react';
import {
  UserCheck,
  Plus,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
  Camera,
  Calendar,
  AlertCircle,
  Clock,
  Trash2,
  CheckCircle2,
} from 'lucide-react';
import {
  getAuthorizations,
  createAuthorization,
  revokeAuthorization,
  subscribeToDb,
} from '../../db/database';

export default function Authorizations({ onOpenOcrModal, onToast }) {
  const [authorizationsList, setAuthorizationsList] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Creation form state
  const [formData, setFormData] = useState({
    primaryStudentRoll: '',
    primaryStudentName: '',
    authorizedStudentRoll: '',
    authorizedStudentName: '',
    scope: 'both', // 'collect' | 'return' | 'both'
    validDays: 30,
    reason: '',
  });

  const [modalError, setModalError] = useState('');

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, []);

  function loadData() {
    setAuthorizationsList(getAuthorizations());
  }

  function handleCreate(e) {
    e.preventDefault();
    setModalError('');

    try {
      if (!formData.primaryStudentRoll.trim() || !formData.primaryStudentName.trim()) {
        throw new Error('Primary student details (Name and Roll No) are required.');
      }
      if (!formData.authorizedStudentRoll.trim() || !formData.authorizedStudentName.trim()) {
        throw new Error('Authorized delegate details (Name and Roll No) are required.');
      }
      if (formData.primaryStudentRoll.trim().toUpperCase() === formData.authorizedStudentRoll.trim().toUpperCase()) {
        throw new Error('Primary student and authorized delegate cannot have the same roll number.');
      }

      const now = new Date();
      const validUntil = new Date(now.getTime() + Number(formData.validDays) * 24 * 60 * 60 * 1000).toISOString();

      createAuthorization({
        primaryStudentRoll: formData.primaryStudentRoll.trim().toUpperCase(),
        primaryStudentName: formData.primaryStudentName.trim(),
        authorizedStudentRoll: formData.authorizedStudentRoll.trim().toUpperCase(),
        authorizedStudentName: formData.authorizedStudentName.trim(),
        scope: formData.scope,
        validFrom: now.toISOString(),
        validUntil,
        reason: formData.reason,
      });

      setIsModalOpen(false);
      setFormData({
        primaryStudentRoll: '',
        primaryStudentName: '',
        authorizedStudentRoll: '',
        authorizedStudentName: '',
        scope: 'both',
        validDays: 30,
        reason: '',
      });
      if (onToast) onToast('Student delegation authorized successfully!');
    } catch (err) {
      setModalError(err.message);
    }
  }

  function handleRevoke(auth) {
    if (confirm(`Revoke authorization for delegate ${auth.authorizedStudentName}?`)) {
      try {
        revokeAuthorization(auth.id);
        if (onToast) onToast('Authorization revoked.');
      } catch (err) {
        alert(err.message);
      }
    }
  }

  const filtered = authorizationsList.filter((auth) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase().trim();
    return (
      auth.id.toLowerCase().includes(q) ||
      auth.primaryStudentName.toLowerCase().includes(q) ||
      auth.primaryStudentRoll.toLowerCase().includes(q) ||
      auth.authorizedStudentName.toLowerCase().includes(q) ||
      auth.authorizedStudentRoll.toLowerCase().includes(q) ||
      (auth.reason && auth.reason.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Student Authorizations & Delegations
          </h2>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Empower students to assign project partners or proxies to collect/return electronic components
          </p>
        </div>

        <button type="button" className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
          <Plus size={18} /> Create New Authorization
        </button>
      </div>

      {/* Search Bar */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-body" style={{ padding: '0.75rem 1rem' }}>
          <div className="search-wrapper">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              className="input-field search-input"
              placeholder="Search by student name, delegate, or roll number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Authorizations Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Primary Student (Owner)</th>
                <th>Authorized Delegate (Proxy)</th>
                <th>Permissions Scope</th>
                <th>Validity Period</th>
                <th>Status</th>
                <th>Reason / Project Note</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length > 0 ? (
                filtered.map((auth) => {
                  const isExpired = new Date(auth.validUntil) < new Date();
                  const isRevoked = auth.status === 'revoked';
                  const isActive = auth.status === 'active' && !isExpired;

                  return (
                    <tr key={auth.id}>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--neutral-900)' }}>
                          {auth.primaryStudentName}
                        </div>
                        <div className="font-mono text-xs text-muted">
                          {auth.primaryStudentRoll}
                        </div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, color: 'var(--primary)' }}>
                          {auth.authorizedStudentName}
                        </div>
                        <div className="font-mono text-xs text-muted">
                          {auth.authorizedStudentRoll}
                        </div>
                      </td>
                      <td>
                        {auth.scope === 'both' && (
                          <span className="badge badge-info">Collect & Return</span>
                        )}
                        {auth.scope === 'collect' && (
                          <span className="badge badge-primary">Collect Only</span>
                        )}
                        {auth.scope === 'return' && (
                          <span className="badge badge-neutral">Return Only</span>
                        )}
                      </td>
                      <td className="text-sm">
                        <div>Until: <strong>{new Date(auth.validUntil).toLocaleDateString()}</strong></div>
                        <div className="text-xs text-muted">Created: {new Date(auth.createdAt).toLocaleDateString()}</div>
                      </td>
                      <td>
                        {isActive && (
                          <span className="badge badge-success">
                            <ShieldCheck size={12} /> Active
                          </span>
                        )}
                        {isRevoked && (
                          <span className="badge badge-danger">
                            <ShieldAlert size={12} /> Revoked
                          </span>
                        )}
                        {isExpired && !isRevoked && (
                          <span className="badge badge-neutral">
                            <Clock size={12} /> Expired
                          </span>
                        )}
                      </td>
                      <td className="text-sm">
                        {auth.reason || <span className="text-muted">—</span>}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isActive ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ color: 'var(--danger)' }}
                            onClick={() => handleRevoke(auth)}
                          >
                            Revoke
                          </button>
                        ) : (
                          <span className="text-muted text-xs">Inactive</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }} className="text-muted">
                    No student delegations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE AUTHORIZATION MODAL */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleCreate}>
              <div className="modal-header">
                <div className="modal-title-group">
                  <UserCheck className="icon-primary" size={24} />
                  <div>
                    <h3 className="modal-title">Create Student Delegation</h3>
                    <p className="modal-subtitle">Authorize another student to act on behalf of the borrower</p>
                  </div>
                </div>
                <button type="button" className="btn-icon" onClick={() => setIsModalOpen(false)}>
                  <X size={20} />
                </button>
              </div>

              <div className="modal-body">
                {modalError && (
                  <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                    <AlertCircle size={16} />
                    <span>{modalError}</span>
                  </div>
                )}

                {/* Primary Student */}
                <div style={{ background: 'var(--neutral-50)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--neutral-200)' }}>
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--neutral-900)', marginBottom: '0.75rem' }}>
                    1. Primary Student (Borrower Account Owner)
                  </h4>
                  <div className="review-grid">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="input-label">Roll Number <span className="required-star">*</span></label>
                      <input
                        type="text"
                        className="input-field uppercase-input"
                        placeholder="e.g. 238W1A0477"
                        value={formData.primaryStudentRoll}
                        onChange={(e) => setFormData({ ...formData, primaryStudentRoll: e.target.value.toUpperCase() })}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="input-label">Student Name <span className="required-star">*</span></label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. Anwar Bajarinti"
                        value={formData.primaryStudentName}
                        onChange={(e) => setFormData({ ...formData, primaryStudentName: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Authorized Delegate */}
                <div style={{ background: 'var(--primary-light)', padding: '1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--primary-border)' }}>
                  <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.75rem' }}>
                    2. Authorized Delegate (Proxy Person)
                  </h4>
                  <div className="review-grid">
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="input-label">Delegate Roll Number <span className="required-star">*</span></label>
                      <input
                        type="text"
                        className="input-field uppercase-input"
                        placeholder="e.g. 238W1A0412"
                        value={formData.authorizedStudentRoll}
                        onChange={(e) => setFormData({ ...formData, authorizedStudentRoll: e.target.value.toUpperCase() })}
                        required
                      />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="input-label">Delegate Name <span className="required-star">*</span></label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. Kavya Sharma"
                        value={formData.authorizedStudentName}
                        onChange={(e) => setFormData({ ...formData, authorizedStudentName: e.target.value })}
                        required
                      />
                    </div>
                  </div>
                </div>

                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Delegation Scope <span className="required-star">*</span></label>
                    <select
                      className="select-field"
                      value={formData.scope}
                      onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                    >
                      <option value="both">Both: Can Collect & Return Components</option>
                      <option value="collect">Collect Components Only</option>
                      <option value="return">Return Components Only</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="input-label">Validity Duration (Days)</label>
                    <input
                      type="number"
                      min={1}
                      max={180}
                      className="input-field"
                      value={formData.validDays}
                      onChange={(e) => setFormData({ ...formData, validDays: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="input-label">Reason / Project Team Partnership</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Final year capstone project partner - IoT lab team"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm & Create Delegation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
