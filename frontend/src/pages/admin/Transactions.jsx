// src/pages/Transactions.jsx
// Complete Transaction History with multi-criteria search and item-level return breakdowns

import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  Clock,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  FileText,
  User,
  Hash,
  Tag,
  ArrowDownLeft,
} from 'lucide-react';
import {
  getTransactions,
  isItemOverdue,
  isTransactionOverdue,
  getOverdueDays,
  subscribeToDb,
} from '../../db/database';

export default function Transactions({ setActiveTab, onOpenReturnWithRoll }) {
  const [transactionsList, setTransactionsList] = useState([]);
  const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'active' | 'partially_returned' | 'returned' | 'overdue'
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedTxnId, setExpandedTxnId] = useState(null);

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, [filterStatus, searchQuery]);

  function loadData() {
    setTransactionsList(getTransactions(filterStatus, searchQuery));
  }

  function toggleExpand(id) {
    setExpandedTxnId(expandedTxnId === id ? null : id);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Transaction History
          </h2>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Comprehensive audit log of all component issue and return records
          </p>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-body" style={{ padding: '1rem' }}>
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            {/* Universal Search Bar */}
            <div className="search-wrapper" style={{ maxWidth: '420px' }}>
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="input-field search-input"
                placeholder="Search by student, roll no, component, tag ID, or TXN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Status Filter Tabs */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'All Records' },
                { id: 'active', label: 'Active Loans' },
                { id: 'partially_returned', label: 'Partially Returned' },
                { id: 'returned', label: 'Fully Returned' },
                { id: 'overdue', label: 'Overdue' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`btn-badge ${filterStatus === tab.id ? 'active' : ''}`}
                  style={{
                    background: filterStatus === tab.id ? 'var(--neutral-900)' : 'var(--neutral-100)',
                    color: filterStatus === tab.id ? '#fff' : 'var(--neutral-700)',
                    padding: '0.4rem 0.85rem',
                  }}
                  onClick={() => setFilterStatus(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="card">
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Student</th>
                <th>Components Borrowed</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Return Date</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {transactionsList.length > 0 ? (
                transactionsList.map((txn) => {
                  const isOverdue = isTransactionOverdue(txn);
                  const isExpanded = expandedTxnId === txn.id;
                  const totalIssued = txn.items.reduce((s, it) => s + it.issuedQuantity, 0);
                  const totalReturned = txn.items.reduce((s, it) => s + it.returnedQuantity, 0);

                  return (
                    <React.Fragment key={txn.id}>
                      <tr style={{ background: isExpanded ? 'var(--neutral-50)' : 'transparent' }}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: '0.85rem' }}>
                          {txn.id}
                        </td>
                        <td>
                          <div style={{ fontWeight: 700, color: 'var(--neutral-900)' }}>
                            {txn.studentName}
                          </div>
                          <div className="font-mono text-xs text-muted">
                            {txn.studentRoll}
                          </div>
                          {txn.authorizedBy && (
                            <div className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>
                              Delegate: {txn.authorizedBy}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.85rem' }}>
                            {txn.items.map((it) => (
                              <span
                                key={it.componentId}
                                className="badge badge-neutral"
                                style={{ marginRight: '0.35rem', marginBottom: '0.2rem' }}
                              >
                                {it.issuedQuantity}x {it.componentName.split('(')[0].trim()}
                                {it.returnedQuantity > 0 ? ` (${it.returnedQuantity} ret)` : ''}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="text-sm">
                          {new Date(txn.issueDate).toLocaleDateString()}
                        </td>
                        <td className="text-sm">
                          <span style={{ color: isOverdue ? 'var(--danger-text)' : 'inherit', fontWeight: isOverdue ? 700 : 400 }}>
                            {new Date(txn.overallDueDate).toLocaleDateString()}
                          </span>
                        </td>
                        <td className="text-sm">
                          {txn.returnedDate ? (
                            <span>{new Date(txn.returnedDate).toLocaleDateString()}</span>
                          ) : txn.lastReturnDate ? (
                            <span className="text-xs text-muted">Partial on {new Date(txn.lastReturnDate).toLocaleDateString()}</span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                        <td>
                          {txn.status === 'returned' && (
                            <span className="badge badge-success">Fully Returned</span>
                          )}
                          {txn.status === 'partially_returned' && (
                            <span className="badge badge-warning">
                              Partially Returned ({totalReturned}/{totalIssued})
                            </span>
                          )}
                          {txn.status === 'active' && !isOverdue && (
                            <span className="badge badge-info">Active</span>
                          )}
                          {isOverdue && (
                            <span className="badge badge-danger">
                              <AlertTriangle size={12} /> Overdue
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => toggleExpand(txn.id)}
                          >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {isExpanded ? 'Hide' : 'Breakdown'}
                          </button>
                        </td>
                      </tr>

                      {/* Expandable item breakdown row */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={8} style={{ background: '#f8fafc', padding: '1rem 1.5rem', borderBottom: '2px solid var(--neutral-300)' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                              <div className="flex-between">
                                <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: 'var(--neutral-900)' }}>
                                  Item-by-Item Loan & Return Status for {txn.id}
                                </h4>
                                {txn.status !== 'returned' && (
                                  <button
                                    type="button"
                                    className="btn btn-success btn-sm"
                                    onClick={() => {
                                      if (onOpenReturnWithRoll) onOpenReturnWithRoll(txn.studentRoll);
                                      else setActiveTab('return');
                                    }}
                                  >
                                    <ArrowDownLeft size={14} /> Process Returns for Student
                                  </button>
                                )}
                              </div>

                              {txn.notes && (
                                <div className="text-xs text-muted">
                                  <strong>Notes:</strong> {txn.notes}
                                </div>
                              )}

                              <div className="table-responsive">
                                <table className="table" style={{ background: '#fff', borderRadius: 'var(--radius-md)' }}>
                                  <thead>
                                    <tr>
                                      <th>Component</th>
                                      <th>Category</th>
                                      <th>Issued Qty</th>
                                      <th>Returned Qty</th>
                                      <th>Pending Qty</th>
                                      <th>Tracked Physical IDs</th>
                                      <th>Due Date / Overdue Status</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {txn.items.map((it) => {
                                      const pending = it.issuedQuantity - it.returnedQuantity;
                                      const isLate = isItemOverdue(it);
                                      const overdueDays = getOverdueDays(it.dueDate);

                                      return (
                                        <tr key={it.componentId}>
                                          <td style={{ fontWeight: 600 }}>{it.componentName}</td>
                                          <td><span className="badge badge-neutral">{it.category}</span></td>
                                          <td>{it.issuedQuantity}</td>
                                          <td><span style={{ color: 'var(--success-text)', fontWeight: 600 }}>{it.returnedQuantity}</span></td>
                                          <td>
                                            {pending > 0 ? (
                                              <strong style={{ color: isLate ? 'var(--danger-text)' : 'inherit' }}>
                                                {pending} in use
                                              </strong>
                                            ) : (
                                              <span className="badge badge-success">Completed</span>
                                            )}
                                          </td>
                                          <td>
                                            {it.individualIds && it.individualIds.length > 0 ? (
                                              <div className="id-chips-container">
                                                {it.individualIds.map((tag) => {
                                                  const isReturned = (it.returnedIndividualIds || []).includes(tag);
                                                  return (
                                                    <span
                                                      key={tag}
                                                      className={`id-chip ${isReturned ? 'id-chip-available' : 'id-chip-issued'}`}
                                                      title={isReturned ? 'Returned' : 'Still in use'}
                                                    >
                                                      {isReturned ? '✓ ' : ''}{tag}
                                                    </span>
                                                  );
                                                })}
                                              </div>
                                            ) : (
                                              <span className="text-muted text-xs">Bulk aggregate</span>
                                            )}
                                          </td>
                                          <td>
                                            <span className="text-xs">
                                              {new Date(it.dueDate).toLocaleDateString()}
                                            </span>
                                            {isLate && (
                                              <span className="badge badge-danger" style={{ marginLeft: '0.5rem' }}>
                                                Overdue by {overdueDays}d
                                              </span>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '3rem' }} className="text-muted">
                    No transactions found matching the filter or search query.
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
