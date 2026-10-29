// src/pages/complaints/Complaints.jsx
// Smart Lab Complaints & Component Requests System
// Categorized into:
// 1. Equipment & Environment (Fans, AC, Lights, Soldering Stations, Lab Furnishings)
// 2. Component Availability & Shortages (Sensors, ICs, Microcontrollers, Prototyping Wires)
// Allows student submissions, prevents student deletion of official records, and empowers Sir/Admin resolution workflow.

import React, { useState, useEffect } from 'react';
import {
  MessageSquareWarning,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Lightbulb,
  Cpu,
  Filter,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  getComplaints,
  createComplaint,
  updateComplaintStatus,
  subscribeToDb,
} from '../../db/database';

export default function Complaints({ currentUser, onToast }) {
  const [complaints, setComplaints] = useState([]);
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'equipment_environment', 'component_availability'
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  // Submit form state
  const [complaintType, setComplaintType] = useState('equipment_environment');
  const [itemName, setItemName] = useState('');
  const [description, setDescription] = useState('');

  // Admin resolution modal state
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [newStatus, setNewStatus] = useState('in_progress');
  const [adminNotes, setAdminNotes] = useState('');

  const isSirOrAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'sir' ||
    currentUser?.role === 'substitute_admin';

  useEffect(() => {
    loadComplaints();
    const unsubscribe = subscribeToDb(() => loadComplaints());
    return () => unsubscribe();
  }, []);

  function loadComplaints() {
    setComplaints(getComplaints());
  }

  async function handleSubmitComplaint(e) {
    e.preventDefault();
    try {
      await createComplaint({
        type: complaintType,
        itemName,
        description,
        reportedByRoll: currentUser?.rollNumber || currentUser?.id || 'STUDENT',
        reportedByName: currentUser?.name || 'Student',
      });
      onToast('Issue report submitted successfully to lab administrators.');
      setIsSubmitModalOpen(false);
      setItemName('');
      setDescription('');
      loadComplaints();
    } catch (err) {
      onToast(`Submission error: ${err.message}`);
    }
  }

  async function handleResolveComplaint(e) {
    e.preventDefault();
    if (!selectedComplaint) return;
    try {
      await updateComplaintStatus(
        selectedComplaint.id,
        { status: newStatus, adminNotes },
        currentUser
      );
      onToast(`Complaint ${selectedComplaint.id} updated to "${newStatus}".`);
      setSelectedComplaint(null);
      loadComplaints();
    } catch (err) {
      onToast(`Update error: ${err.message}`);
    }
  }

  const filteredComplaints = complaints.filter((c) => {
    if (activeTab === 'all') return true;
    return c.type === activeTab;
  });

  const pendingCount = complaints.filter((c) => c.status === 'pending').length;
  const inProgressCount = complaints.filter((c) => c.status === 'in_progress').length;
  const resolvedCount = complaints.filter((c) => c.status === 'resolved').length;

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Lab Complaints & Equipment Shortages
          </h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Report malfunctioning equipment, environment issues, or request missing hardware components.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsSubmitModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={18} />
          <span>Report New Issue / Shortage</span>
        </button>
      </div>

      {/* Overview Stat Cards */}
      <div className="stats-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card stat-warning">
          <div className="stat-card-left">
            <span className="stat-label">Pending Review</span>
            <span className="stat-value">{pendingCount}</span>
            <span className="stat-subtext">Awaiting administrative triage</span>
          </div>
          <div className="stat-icon-wrapper">
            <Clock size={24} />
          </div>
        </div>

        <div className="stat-card stat-primary">
          <div className="stat-card-left">
            <span className="stat-label">In Progress</span>
            <span className="stat-value">{inProgressCount}</span>
            <span className="stat-subtext">Under active procurement / repair</span>
          </div>
          <div className="stat-icon-wrapper">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="stat-card stat-success">
          <div className="stat-card-left">
            <span className="stat-label">Resolved</span>
            <span className="stat-value">{resolvedCount}</span>
            <span className="stat-subtext">Completed issues & restocked items</span>
          </div>
          <div className="stat-icon-wrapper">
            <CheckCircle2 size={24} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--neutral-200)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'all' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('all')}
        >
          All Issues ({complaints.length})
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'equipment_environment' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('equipment_environment')}
        >
          <Lightbulb size={14} style={{ marginRight: '4px' }} />
          Equipment & Environment
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'component_availability' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('component_availability')}
        >
          <Cpu size={14} style={{ marginRight: '4px' }} />
          Component Availability Shortages
        </button>
      </div>

      {/* Complaints List */}
      {filteredComplaints.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <CheckCircle2 size={36} style={{ color: '#16a34a', margin: '0 auto 0.75rem' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>No reports in this category</h4>
          <p className="text-muted text-sm">All equipment and inventory requirements are currently satisfied.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredComplaints.map((c) => (
            <div
              key={c.id}
              className="card"
              style={{
                padding: '1.25rem',
                borderLeft: `4px solid ${
                  c.status === 'resolved'
                    ? '#16a34a'
                    : c.status === 'in_progress'
                    ? '#2563eb'
                    : '#f59e0b'
                }`,
              }}
            >
              <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: 999,
                        background: c.type === 'equipment_environment' ? '#fef3c7' : '#e0e7ff',
                        color: c.type === 'equipment_environment' ? '#92400e' : '#3730a3',
                      }}
                    >
                      {c.type === 'equipment_environment' ? 'Equipment / Lab Facility' : 'Component Shortage'}
                    </span>
                    <span className="font-mono text-xs text-muted">{c.id}</span>
                  </div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
                    {c.itemName}
                  </h3>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span
                    className={`badge ${
                      c.status === 'resolved'
                        ? 'badge-success'
                        : c.status === 'in_progress'
                        ? 'badge-primary'
                        : 'badge-warning'
                    }`}
                  >
                    {c.status.replace('_', ' ').toUpperCase()}
                  </span>

                  {isSirOrAdmin && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setSelectedComplaint(c);
                        setNewStatus(c.status);
                        setAdminNotes(c.adminNotes || '');
                      }}
                    >
                      Manage / Resolve
                    </button>
                  )}
                </div>
              </div>

              <p style={{ fontSize: '0.9rem', color: 'var(--neutral-700)', lineHeight: '1.45', margin: '0.5rem 0' }}>
                {c.description}
              </p>

              {c.adminNotes && (
                <div
                  style={{
                    background: '#f8fafc',
                    border: '1px solid var(--neutral-200)',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    marginTop: '0.65rem',
                    fontSize: '0.84rem',
                  }}
                >
                  <strong className="text-primary">Admin / Sir Action Notes:</strong> {c.adminNotes}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.78rem',
                  color: 'var(--neutral-500)',
                  marginTop: '0.75rem',
                  borderTop: '1px solid var(--neutral-100)',
                  paddingTop: '0.5rem',
                }}
              >
                <span>
                  Reported by: <strong>{c.reportedByName}</strong> ({c.reportedByRoll})
                </span>
                <span>{new Date(c.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUBMIT COMPLAINT MODAL */}
      {isSubmitModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setIsSubmitModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MessageSquareWarning size={22} className="text-primary" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Submit Lab Issue / Shortage</h3>
              </div>
            </div>

            <form onSubmit={handleSubmitComplaint}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="complaintType">Category *</label>
                <select
                  id="complaintType"
                  className="input-field"
                  value={complaintType}
                  onChange={(e) => setComplaintType(e.target.value)}
                >
                  <option value="equipment_environment">Equipment & Environment (Fan, AC, Light, Bench Power, Chairs)</option>
                  <option value="component_availability">Component Availability (Missing ICs, Microcontrollers, Sensors)</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="itemName">Equipment / Component Name *</label>
                <input
                  id="itemName"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Bench 4 Soldering Station or ESP32-CAM"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="input-label" htmlFor="description">Detailed Description *</label>
                <textarea
                  id="description"
                  className="input-field"
                  rows={4}
                  placeholder="Explain what is broken, where it is located, or which project requires the missing component..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsSubmitModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Submit to Lab Incharge
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESOLVE / MANAGE COMPLAINT MODAL (SIR / ADMIN) */}
      {selectedComplaint && isSirOrAdmin && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setSelectedComplaint(null)}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <CheckCircle size={22} className="text-primary" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Manage Issue #{selectedComplaint.id}</h3>
              </div>
            </div>

            <form onSubmit={handleResolveComplaint}>
              <div style={{ background: '#f8fafc', padding: '0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--neutral-200)' }}>
                <strong>{selectedComplaint.itemName}</strong>
                <p style={{ fontSize: '0.84rem', color: 'var(--neutral-600)', marginTop: '0.25rem' }}>
                  {selectedComplaint.description}
                </p>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="newStatus">Action Status</label>
                <select
                  id="newStatus"
                  className="input-field"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress (Repairing / Ordering)</option>
                  <option value="resolved">Resolved (Complete)</option>
                  <option value="dismissed">Dismissed</option>
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="input-label" htmlFor="adminNotes">Resolution / Procurement Notes</label>
                <textarea
                  id="adminNotes"
                  className="input-field"
                  rows={3}
                  placeholder="e.g. Technician replaced heating element / Ordered 10 units from vendor..."
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setSelectedComplaint(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Status
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
