// src/pages/ReturnComponent.jsx
// Return components workflow with Camera OCR, active issue lookup, and FULL PARTIAL RETURN support

import React, { useState, useEffect } from 'react';
import {
  Camera,
  Search,
  ArrowDownLeft,
  CheckCircle2,
  AlertCircle,
  Clock,
  Package,
  Layers,
  Hash,
  AlertTriangle,
  User,
  History,
  RotateCcw,
} from 'lucide-react';
import {
  getActiveTransactionsForStudent,
  returnComponents,
  getStudentByRoll,
  isItemOverdue,
  getOverdueDays,
  subscribeToDb,
} from '../../db/database';

export default function ReturnComponent({ onOpenOcrModal, scannedStudent, onClearScannedStudent, onToast, setActiveTab }) {
  const [studentRoll, setStudentRoll] = useState('');
  const [studentName, setStudentName] = useState('');
  const [activeTransactions, setActiveTransactions] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  // Return selections: map of txnId -> map of componentId -> { returnQuantity, returnedIndividualIds }
  const [returnSelections, setReturnSelections] = useState({});

  const [errorMessage, setErrorMessage] = useState('');
  const [successResult, setSuccessResult] = useState(null);

  useEffect(() => {
    if (studentRoll.trim()) {
      searchActiveBorrows(studentRoll);
    }
    const unsubscribe = subscribeToDb(() => {
      if (studentRoll.trim()) {
        searchActiveBorrows(studentRoll);
      }
    });
    return () => unsubscribe();
  }, [studentRoll]);

  // Sync if student was scanned from global Camera modal
  useEffect(() => {
    if (scannedStudent) {
      setStudentRoll(scannedStudent.rollNumber);
      setStudentName(scannedStudent.name);
      searchActiveBorrows(scannedStudent.rollNumber);
      if (onClearScannedStudent) onClearScannedStudent();
    }
  }, [scannedStudent]);

  function searchActiveBorrows(roll) {
    if (!roll || !roll.trim()) {
      setActiveTransactions([]);
      setHasSearched(false);
      return;
    }

    const cleanRoll = roll.trim().toUpperCase();
    const student = getStudentByRoll(cleanRoll);
    if (student && !studentName) {
      setStudentName(student.name);
    }

    const txns = getActiveTransactionsForStudent(cleanRoll);
    setActiveTransactions(txns);
    setHasSearched(true);
    setErrorMessage('');
    setSuccessResult(null);

    // Initialize return selections state
    const initialSelections = {};
    for (const t of txns) {
      initialSelections[t.id] = {};
      for (const item of t.items) {
        const remaining = item.issuedQuantity - item.returnedQuantity;
        if (remaining > 0) {
          initialSelections[t.id][item.componentId] = {
            returnQuantity: 0,
            returnedIndividualIds: [],
          };
        }
      }
    }
    setReturnSelections(initialSelections);
  }

  // Update returned quantity for an item
  function setItemReturnQuantity(txnId, componentId, maxAllowed, qty) {
    const num = Math.min(maxAllowed, Math.max(0, Number(qty) || 0));
    setReturnSelections((prev) => {
      const txnMap = { ...(prev[txnId] || {}) };
      const current = txnMap[componentId] || { returnQuantity: 0, returnedIndividualIds: [] };
      return {
        ...prev,
        [txnId]: {
          ...txnMap,
          [componentId]: {
            ...current,
            returnQuantity: num,
          },
        },
      };
    });
  }

  // Toggle individual physical ID return
  function toggleIndividualTagReturn(txnId, componentId, tagId) {
    setReturnSelections((prev) => {
      const txnMap = { ...(prev[txnId] || {}) };
      const current = txnMap[componentId] || { returnQuantity: 0, returnedIndividualIds: [] };
      const tags = [...current.returnedIndividualIds];
      const idx = tags.indexOf(tagId);

      if (idx !== -1) {
        tags.splice(idx, 1);
      } else {
        tags.push(tagId);
      }

      return {
        ...prev,
        [txnId]: {
          ...txnMap,
          [componentId]: {
            ...current,
            returnedIndividualIds: tags,
            returnQuantity: tags.length, // Quantity matches selected tags
          },
        },
      };
    });
  }

  // Quick helper: Select All currently pending items for a transaction
  function handleSelectAllForTxn(txn) {
    setReturnSelections((prev) => {
      const txnMap = {};
      for (const item of txn.items) {
        const remaining = item.issuedQuantity - item.returnedQuantity;
        if (remaining > 0) {
          if (item.trackingMode === 'individual') {
            const pendingTags = (item.individualIds || []).filter(
              (id) => !(item.returnedIndividualIds || []).includes(id)
            );
            txnMap[item.componentId] = {
              returnQuantity: pendingTags.length,
              returnedIndividualIds: pendingTags,
            };
          } else {
            txnMap[item.componentId] = {
              returnQuantity: remaining,
              returnedIndividualIds: [],
            };
          }
        }
      }
      return {
        ...prev,
        [txn.id]: txnMap,
      };
    });
  }

  // Submit return for a transaction
  function handleProcessReturn(txn) {
    setErrorMessage('');
    try {
      const txnSelections = returnSelections[txn.id] || {};
      const returnedPayload = [];

      for (const [componentId, data] of Object.entries(txnSelections)) {
        if (data.returnQuantity > 0) {
          returnedPayload.push({
            componentId,
            returnQuantity: data.returnQuantity,
            returnedIndividualIds: data.returnedIndividualIds || [],
          });
        }
      }

      if (returnedPayload.length === 0) {
        throw new Error('Please select at least one component or tag to return.');
      }

      const updatedTxn = returnComponents(txn.id, returnedPayload);
      setSuccessResult({
        txnId: updatedTxn.id,
        status: updatedTxn.status,
        returnedItems: returnedPayload,
        items: updatedTxn.items,
      });

      if (onToast) {
        onToast(
          updatedTxn.status === 'returned'
            ? 'All items returned successfully! Transaction complete.'
            : 'Partial return recorded successfully! Remaining items stay issued.'
        );
      }

      // Re-query active issues
      searchActiveBorrows(studentRoll);
    } catch (err) {
      console.error('Return error:', err);
      setErrorMessage(err.message);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Return Components
          </h2>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Scan student ID card, retrieve active loans, and record complete or partial returns
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onOpenOcrModal}>
          <Camera size={18} /> Scan Student ID Card
        </button>
      </div>

      {/* Student Identification & Lookup Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <h3 className="card-title">
            <Search size={18} /> Student Lookup
          </h3>
          <span className="badge badge-neutral">OCR or Manual Entry</span>
        </div>
        <div className="card-body">
          {errorMessage && (
            <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
              <AlertCircle size={16} />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="review-grid">
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="input-label">
                <Hash size={15} /> Student Roll Number <span className="required-star">*</span>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  className="input-field uppercase-input"
                  placeholder="e.g. 238W1A0477"
                  value={studentRoll}
                  onChange={(e) => {
                    setStudentRoll(e.target.value.toUpperCase());
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => searchActiveBorrows(studentRoll)}
                >
                  <Search size={16} /> Search Loans
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onOpenOcrModal}
                  title="Scan with Camera"
                >
                  <Camera size={18} />
                </button>
              </div>
              <span className="input-hint">Search for all active issued components under this roll number</span>
            </div>

            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="input-label">
                <User size={15} /> Student Name (Editable)
              </label>
              <input
                type="text"
                className="input-field"
                placeholder="Student Name"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
              />
              <span className="input-hint">Displayed from OCR scan or existing records</span>
            </div>
          </div>
        </div>
      </div>

      {/* SUCCESS RETURN RECEIPT BANNER */}
      {successResult && (
        <div className="card" style={{ border: '2px solid var(--success)', background: '#f0fdf4', marginBottom: '1.5rem' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#14532d' }}>
                  {successResult.status === 'returned'
                    ? 'All Components Returned Successfully!'
                    : 'Partial Return Processed Successfully!'}
                </h3>
                <span className="text-sm" style={{ color: '#166534' }}>
                  {successResult.status === 'returned'
                    ? 'The transaction has been fully cleared and marked as returned.'
                    : 'Unreturned components remain marked as active/issued for this student.'}
                </span>
              </div>
            </div>

            <div className="table-responsive">
              <table className="table" style={{ background: '#fff', borderRadius: 'var(--radius-md)' }}>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Returned Now</th>
                    <th>Total Returned / Issued</th>
                    <th>Remaining Loan</th>
                  </tr>
                </thead>
                <tbody>
                  {successResult.items.map((it) => {
                    const remaining = it.issuedQuantity - it.returnedQuantity;
                    return (
                      <tr key={it.componentId}>
                        <td style={{ fontWeight: 600 }}>{it.componentName}</td>
                        <td>
                          {successResult.returnedItems.find((r) => r.componentId === it.componentId)?.returnQuantity || 0} unit(s)
                        </td>
                        <td>
                          <strong>{it.returnedQuantity}</strong> / {it.issuedQuantity}
                        </td>
                        <td>
                          {remaining > 0 ? (
                            <span className="badge badge-warning">{remaining} units still in use</span>
                          ) : (
                            <span className="badge badge-success">Fully Cleared</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE LOANS LIST FOR THE STUDENT */}
      {hasSearched && (
        <div>
          {activeTransactions.length === 0 ? (
            <div className="card">
              <div className="card-body" style={{ textAlign: 'center', padding: '3.5rem 1rem' }}>
                <CheckCircle2 size={42} style={{ color: 'var(--success)', margin: '0 auto 0.75rem' }} />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--neutral-900)' }}>
                  No Active Borrowed Components
                </h3>
                <p className="text-muted" style={{ maxWidth: 460, margin: '0.5rem auto 1.5rem', fontSize: '0.9rem' }}>
                  Roll number <strong>{studentRoll}</strong> currently has zero outstanding components in use.
                  All previously borrowed items have been returned!
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setActiveTab('issue')}
                >
                  Issue Components Instead
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--neutral-900)' }}>
                  Active Issued Transactions ({activeTransactions.length})
                </h3>
                <span className="badge badge-warning">Partial returns supported</span>
              </div>

              {activeTransactions.map((txn) => {
                const isOverdue = txn.status !== 'returned' && new Date(txn.overallDueDate) < new Date();
                const overdueDays = getOverdueDays(txn.overallDueDate);

                return (
                  <div key={txn.id} className="card" style={{ marginBottom: '1.5rem' }}>
                    <div className="card-header" style={{ background: isOverdue ? 'var(--danger-light)' : 'var(--neutral-50)' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span className="font-mono" style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                            {txn.id}
                          </span>
                          {txn.status === 'partially_returned' && (
                            <span className="badge badge-warning">Partially Returned</span>
                          )}
                          {isOverdue && (
                            <span className="badge badge-danger">
                              <AlertTriangle size={12} /> Overdue by {overdueDays} day(s)
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted" style={{ marginTop: '0.2rem' }}>
                          Issued: {new Date(txn.issueDate).toLocaleString()} • Overall Due: {new Date(txn.overallDueDate).toLocaleDateString()}
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleSelectAllForTxn(txn)}
                      >
                        <RotateCcw size={14} /> Select All Items
                      </button>
                    </div>

                    <div className="card-body">
                      <div className="table-responsive">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Component Details</th>
                              <th>Issued Qty</th>
                              <th>Already Returned</th>
                              <th>Still Issued (In Use)</th>
                              <th>Quantity to Return Now</th>
                            </tr>
                          </thead>
                          <tbody>
                            {txn.items.map((item) => {
                              const remaining = item.issuedQuantity - item.returnedQuantity;
                              const isItemDone = remaining <= 0;
                              const isItemLate = !isItemDone && isItemOverdue(item);
                              const itemOverdueDays = getOverdueDays(item.dueDate);

                              const currentSelection = returnSelections[txn.id]?.[item.componentId] || {
                                returnQuantity: 0,
                                returnedIndividualIds: [],
                              };

                              const pendingTags = item.trackingMode === 'individual'
                                ? (item.individualIds || []).filter((id) => !(item.returnedIndividualIds || []).includes(id))
                                : [];

                              return (
                                <tr key={item.componentId} style={{ opacity: isItemDone ? 0.5 : 1 }}>
                                  <td>
                                    <div style={{ fontWeight: 700, color: 'var(--neutral-900)' }}>
                                      {item.componentName}
                                    </div>
                                    <div className="text-xs text-muted">
                                      {item.category} • Due: {new Date(item.dueDate).toLocaleDateString()}
                                      {isItemLate && (
                                        <span style={{ color: 'var(--danger-text)', fontWeight: 700, marginLeft: '0.35rem' }}>
                                          (Overdue by {itemOverdueDays} days!)
                                        </span>
                                      )}
                                    </div>

                                    {/* Physical IDs breakdown if tracked individually */}
                                    {item.trackingMode === 'individual' && pendingTags.length > 0 && (
                                      <div style={{ marginTop: '0.5rem' }}>
                                        <span className="text-xs font-semibold" style={{ display: 'block', marginBottom: '0.25rem' }}>
                                          Check off returning tag(s):
                                        </span>
                                        <div className="id-chips-container">
                                          {pendingTags.map((tagId) => {
                                            const isSelected = currentSelection.returnedIndividualIds.includes(tagId);
                                            return (
                                              <span
                                                key={tagId}
                                                className={`id-chip id-chip-selectable ${isSelected ? 'selected' : 'id-chip-issued'}`}
                                                onClick={() => toggleIndividualTagReturn(txn.id, item.componentId, tagId)}
                                              >
                                                {isSelected ? '✓ ' : ' '} {tagId}
                                              </span>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                  <td>{item.issuedQuantity}</td>
                                  <td>
                                    <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>
                                      {item.returnedQuantity}
                                    </span>
                                  </td>
                                  <td>
                                    {remaining > 0 ? (
                                      <strong style={{ color: isItemLate ? 'var(--danger)' : 'var(--neutral-900)' }}>
                                        {remaining} unit(s)
                                      </strong>
                                    ) : (
                                      <span className="badge badge-success">Returned</span>
                                    )}
                                  </td>
                                  <td>
                                    {isItemDone ? (
                                      <span className="text-muted text-xs">All Returned</span>
                                    ) : item.trackingMode === 'individual' ? (
                                      <div>
                                        <span className="badge badge-info">
                                          {currentSelection.returnedIndividualIds.length} tag(s) selected
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="quantity-stepper">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setItemReturnQuantity(txn.id, item.componentId, remaining, currentSelection.returnQuantity - 1)
                                          }
                                        >
                                          -
                                        </button>
                                        <span>{currentSelection.returnQuantity}</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setItemReturnQuantity(txn.id, item.componentId, remaining, currentSelection.returnQuantity + 1)
                                          }
                                        >
                                          +
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Process Return Action Button */}
                      <div className="flex-between" style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
                        <span className="text-muted text-xs">
                          * Unreturned items in this loan will remain active and continue being tracked.
                        </span>
                        <button
                          type="button"
                          className="btn btn-success"
                          onClick={() => handleProcessReturn(txn)}
                        >
                          <ArrowDownLeft size={18} /> Confirm Selected Returns
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
