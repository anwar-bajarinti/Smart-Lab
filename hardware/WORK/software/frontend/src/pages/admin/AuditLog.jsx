// src/pages/AuditLog.jsx
// Administrative Audit Log (Strictly Admin & Substitute Admin Only)
// Records WHAT action happened, WHO performed it, WHEN it occurred, and previous/new values.

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  User,
  Clock,
  Shield,
  Tag,
  Hash,
  AlertCircle,
} from 'lucide-react';
import { getAuditLogs, subscribeToDb } from '../../db/database';

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [actionFilter, setActionFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, [actionFilter, searchQuery]);

  function loadData() {
    const list = getAuditLogs({ action: actionFilter, searchQuery });
    setLogs(list);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Administrative Audit Log
          </h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Tamper-evident record of all administrative transactions, inventory adjustments, and account operations
          </p>
        </div>
        <span className="badge badge-primary">Admin & Substitute Access Only</span>
      </div>

      {/* Filter & Search Bar */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-body" style={{ padding: '0.85rem 1rem' }}>
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <div className="search-wrapper" style={{ maxWidth: '380px' }}>
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="input-field search-input"
                placeholder="Search by actor, action, student, component ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All Events' },
                { id: 'Issued', label: 'Issues' },
                { id: 'Returned', label: 'Returns' },
                { id: 'Damaged', label: 'Damaged' },
                { id: 'Lost', label: 'Lost' },
                { id: 'Threshold', label: 'Thresholds' },
                { id: 'User', label: 'Accounts' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`btn-badge ${actionFilter === tab.id ? 'active' : ''}`}
                  style={{
                    background: actionFilter === tab.id ? 'var(--neutral-900)' : '#f1f5f9',
                    color: actionFilter === tab.id ? '#fff' : '#475569',
                    padding: '0.35rem 0.75rem',
                  }}
                  onClick={() => setActionFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Authorized Actor</th>
                <th>Action Type</th>
                <th>Target Reference</th>
                <th>Action Details</th>
                <th>State Change</th>
              </tr>
            </thead>
            <tbody>
              {logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td className="text-sm">
                      <div>{new Date(log.timestamp).toLocaleDateString()}</div>
                      <div className="font-mono text-xs text-muted">
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--neutral-900)' }}>
                        {log.actorName}
                      </div>
                      <span className="badge badge-neutral text-xs">
                        {log.actorRole}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          log.action.includes('Issue')
                            ? 'badge-info'
                            : log.action.includes('Return')
                            ? 'badge-success'
                            : log.action.includes('Damaged') || log.action.includes('Lost')
                            ? 'badge-danger'
                            : log.action.includes('Threshold')
                            ? 'badge-warning'
                            : 'badge-neutral'
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="text-sm">
                      {log.targetRoll && (
                        <div className="font-mono" style={{ fontWeight: 600 }}>
                          Roll: {log.targetRoll}
                        </div>
                      )}
                      {log.targetComponentId && (
                        <div className="font-mono text-xs text-muted">
                          Comp: {log.targetComponentId}
                        </div>
                      )}
                      {!log.targetRoll && !log.targetComponentId && <span className="text-muted">—</span>}
                    </td>
                    <td className="text-sm" style={{ maxWidth: '320px' }}>
                      {log.details}
                    </td>
                    <td className="text-xs">
                      {log.previousValue !== null && log.newValue !== null ? (
                        <div>
                          <span className="text-muted">Prev:</span> <strong style={{ color: 'var(--danger)' }}>{log.previousValue}</strong>
                          <br />
                          <span className="text-muted">New:</span> <strong style={{ color: 'var(--success)' }}>{log.newValue}</strong>
                        </div>
                      ) : log.newValue ? (
                        <strong style={{ color: 'var(--success)' }}>{log.newValue}</strong>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '3rem' }} className="text-muted">
                    No audit records matching your criteria.
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
