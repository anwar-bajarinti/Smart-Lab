// src/pages/Overdue.jsx
// Overdue tracker and management view with severity filters, overdue day counters, and direct return actions

import React, { useState, useEffect } from 'react';
import {
  Clock,
  AlertTriangle,
  Calendar,
  User,
  ArrowDownLeft,
  Filter,
  CheckCircle,
  Sliders,
  Bell,
  Mail,
  Phone,
} from 'lucide-react';
import {
  getTransactions,
  getOverdueDays,
  getRemainingDays,
  isItemOverdue,
  getSettings,
  updateSettings,
  subscribeToDb,
} from '../../db/database';

export default function Overdue({ setActiveTab, onToast, onOpenReturnWithRoll }) {
  const [transactions, setTransactions] = useState([]);
  const [settings, setSettings] = useState({ defaultOverdueDays: 7 });
  const [filterSeverity, setFilterSeverity] = useState('all'); // 'all' | 'critical' | 'moderate' | 'duesoon'
  const [isEditingSettings, setIsEditingSettings] = useState(false);
  const [tempDefaultDays, setTempDefaultDays] = useState(7);

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, []);

  function loadData() {
    const allTxns = getTransactions('all');
    setTransactions(allTxns);
    const currSettings = getSettings();
    setSettings(currSettings);
    setTempDefaultDays(currSettings.defaultOverdueDays || 7);
  }

  function handleSaveSettings(e) {
    e.preventDefault();
    const days = Math.max(1, Number(tempDefaultDays) || 7);
    updateSettings({ defaultOverdueDays: days });
    setIsEditingSettings(false);
    if (onToast) onToast(`Default overdue duration set to ${days} days.`);
  }

  // Extract all active or overdue item records
  const itemRecords = [];
  for (const txn of transactions) {
    if (txn.status === 'returned') continue;

    for (const item of txn.items) {
      const remaining = item.issuedQuantity - item.returnedQuantity;
      if (remaining <= 0) continue;

      const isLate = isItemOverdue(item);
      const overdueDays = getOverdueDays(item.dueDate);
      const remainingDays = getRemainingDays(item.dueDate);

      let severity = 'ontime';
      if (isLate) {
        severity = overdueDays > 7 ? 'critical' : 'moderate';
      } else if (remainingDays <= 2) {
        severity = 'duesoon';
      }

      itemRecords.push({
        txnId: txn.id,
        studentName: txn.studentName,
        studentRoll: txn.studentRoll,
        componentId: item.componentId,
        componentName: item.componentName,
        category: item.category,
        remainingQuantity: remaining,
        individualIds: (item.individualIds || []).filter(
          (id) => !(item.returnedIndividualIds || []).includes(id)
        ),
        issueDate: txn.issueDate,
        dueDate: item.dueDate,
        isLate,
        overdueDays,
        remainingDays,
        severity,
      });
    }
  }

  // Filter items
  const filteredItems = itemRecords.filter((rec) => {
    if (filterSeverity === 'all') return rec.isLate || rec.severity === 'duesoon';
    if (filterSeverity === 'critical') return rec.severity === 'critical';
    if (filterSeverity === 'moderate') return rec.severity === 'moderate';
    if (filterSeverity === 'duesoon') return rec.severity === 'duesoon';
    return true;
  });

  const criticalCount = itemRecords.filter((r) => r.severity === 'critical').length;
  const moderateCount = itemRecords.filter((r) => r.severity === 'moderate').length;
  const dueSoonCount = itemRecords.filter((r) => r.severity === 'duesoon').length;

  return (
    <div>
      {/* Header & Settings */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Overdue Tracker & Policy
          </h2>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Monitor unreturned components past due date and configure lab return policies
          </p>
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setIsEditingSettings(!isEditingSettings)}
        >
          <Sliders size={16} /> Configure Loan Durations
        </button>
      </div>

      {/* OVERDUE DURATION SETTINGS DRAWER */}
      {isEditingSettings && (
        <div className="card" style={{ background: 'var(--primary-light)', border: '1px solid var(--primary-border)', marginBottom: '1.5rem' }}>
          <div className="card-body">
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--primary)', marginBottom: '0.5rem' }}>
              Incubation Centre Overdue Policies
            </h3>
            <p className="text-sm text-muted" style={{ marginBottom: '1rem' }}>
              Loans exceeding this duration without return will automatically trigger overdue warnings across the dashboard.
            </p>

            <form onSubmit={handleSaveSettings} style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="input-label">Default Overall Overdue Duration (Days)</label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  className="input-field"
                  style={{ width: '160px' }}
                  value={tempDefaultDays}
                  onChange={(e) => setTempDefaultDays(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary">
                Save Policy
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsEditingSettings(false)}
              >
                Cancel
              </button>
            </form>
          </div>
        </div>
      )}

      {/* OVERDUE METRIC CARDS */}
      <div className="stats-grid">
        <div className="stat-card stat-danger">
          <div className="stat-card-left">
            <span className="stat-label">Critical (&gt; 7 Days Overdue)</span>
            <span className="stat-value">{criticalCount}</span>
            <span className="stat-subtext">Immediate follow-up required</span>
          </div>
          <div className="stat-icon-wrapper">
            <AlertTriangle size={24} />
          </div>
        </div>

        <div className="stat-card stat-warning">
          <div className="stat-card-left">
            <span className="stat-label">Moderate (1-7 Days Overdue)</span>
            <span className="stat-value">{moderateCount}</span>
            <span className="stat-subtext">Recently expired loans</span>
          </div>
          <div className="stat-icon-wrapper">
            <Clock size={24} />
          </div>
        </div>

        <div className="stat-card stat-primary">
          <div className="stat-card-left">
            <span className="stat-label">Due Soon (Next 48 Hours)</span>
            <span className="stat-value">{dueSoonCount}</span>
            <span className="stat-subtext">Upcoming return deadlines</span>
          </div>
          <div className="stat-icon-wrapper">
            <Calendar size={24} />
          </div>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-body" style={{ padding: '0.75rem 1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn-badge ${filterSeverity === 'all' ? 'active' : ''}`}
              style={{
                background: filterSeverity === 'all' ? 'var(--neutral-900)' : 'var(--neutral-100)',
                color: filterSeverity === 'all' ? '#fff' : 'var(--neutral-700)',
                padding: '0.4rem 0.85rem',
              }}
              onClick={() => setFilterSeverity('all')}
            >
              All Alerts ({itemRecords.filter((r) => r.isLate || r.severity === 'duesoon').length})
            </button>

            <button
              type="button"
              className={`btn-badge ${filterSeverity === 'critical' ? 'active' : ''}`}
              style={{
                background: filterSeverity === 'critical' ? 'var(--danger)' : 'var(--neutral-100)',
                color: filterSeverity === 'critical' ? '#fff' : 'var(--neutral-700)',
                padding: '0.4rem 0.85rem',
              }}
              onClick={() => setFilterSeverity('critical')}
            >
              Critical Overdue ({criticalCount})
            </button>

            <button
              type="button"
              className={`btn-badge ${filterSeverity === 'moderate' ? 'active' : ''}`}
              style={{
                background: filterSeverity === 'moderate' ? 'var(--warning)' : 'var(--neutral-100)',
                color: filterSeverity === 'moderate' ? '#fff' : 'var(--neutral-700)',
                padding: '0.4rem 0.85rem',
              }}
              onClick={() => setFilterSeverity('moderate')}
            >
              Moderate Overdue ({moderateCount})
            </button>

            <button
              type="button"
              className={`btn-badge ${filterSeverity === 'duesoon' ? 'active' : ''}`}
              style={{
                background: filterSeverity === 'duesoon' ? 'var(--primary)' : 'var(--neutral-100)',
                color: filterSeverity === 'duesoon' ? '#fff' : 'var(--neutral-700)',
                padding: '0.4rem 0.85rem',
              }}
              onClick={() => setFilterSeverity('duesoon')}
            >
              Due Within 48 Hrs ({dueSoonCount})
            </button>
          </div>
        </div>
      </div>

      {/* OVERDUE ITEMS TABLE */}
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Component & Physical Tag(s)</th>
                <th>Qty Outstanding</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Status / Days Overdue</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.length > 0 ? (
                filteredItems.map((item, idx) => (
                  <tr key={`${item.txnId}-${item.componentId}-${idx}`}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--neutral-900)' }}>
                        {item.studentName}
                      </div>
                      <div className="font-mono text-xs text-muted">
                        {item.studentRoll}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{item.componentName}</div>
                      <div className="text-xs text-muted">{item.category}</div>
                      {item.individualIds && item.individualIds.length > 0 && (
                        <div className="id-chips-container" style={{ marginTop: '0.35rem' }}>
                          {item.individualIds.map((tag) => (
                            <span key={tag} className="id-chip id-chip-issued">{tag}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <strong style={{ fontSize: '1rem', color: item.isLate ? 'var(--danger-text)' : 'inherit' }}>
                        {item.remainingQuantity} unit(s)
                      </strong>
                    </td>
                    <td className="text-sm">
                      {new Date(item.issueDate).toLocaleDateString()}
                    </td>
                    <td className="text-sm">
                      <strong>{new Date(item.dueDate).toLocaleDateString()}</strong>
                    </td>
                    <td>
                      {item.severity === 'critical' && (
                        <span className="badge badge-danger">
                          <AlertTriangle size={12} /> Overdue by {item.overdueDays} days!
                        </span>
                      )}
                      {item.severity === 'moderate' && (
                        <span className="badge badge-warning">
                          <Clock size={12} /> Overdue by {item.overdueDays} days
                        </span>
                      )}
                      {item.severity === 'duesoon' && (
                        <span className="badge badge-info">
                          Due in {item.remainingDays <= 0 ? 'Today' : `${item.remainingDays} days`}
                        </span>
                      )}
                      {item.severity === 'ontime' && (
                        <span className="badge badge-success">On Schedule</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-success btn-sm"
                        onClick={() => {
                          if (onOpenReturnWithRoll) {
                            onOpenReturnWithRoll(item.studentRoll);
                          } else {
                            setActiveTab('return');
                          }
                        }}
                      >
                        <ArrowDownLeft size={14} /> Process Return
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }} className="text-muted">
                    <CheckCircle size={32} style={{ color: 'var(--success)', margin: '0 auto 0.5rem' }} />
                    <p style={{ fontWeight: 600, color: 'var(--neutral-800)' }}>
                      No items currently matching this overdue filter!
                    </p>
                    <span className="text-xs">All borrowed components are either returned or within their loan duration.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
