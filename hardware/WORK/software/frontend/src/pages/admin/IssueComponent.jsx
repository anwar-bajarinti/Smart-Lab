// src/pages/IssueComponent.jsx
// Issue components workflow with Camera OCR, delegation check, component cart, individual ID selection, per-component overdue settings, and stock validation.

import React, { useState, useEffect } from 'react';
import {
  Camera,
  User,
  Hash,
  Search,
  ShoppingCart,
  Plus,
  Trash2,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  UserCheck,
  PackageCheck,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  getComponents,
  issueComponents,
  getStudentByRoll,
  getActiveAuthorizationsForStudent,
  getDelegationsForDelegate,
  getSettings,
  subscribeToDb,
} from '../../db/database';

export default function IssueComponent({ onOpenOcrModal, scannedStudent, onClearScannedStudent, onToast, setActiveTab }) {
  const [componentsList, setComponentsList] = useState([]);
  const [settings, setSettings] = useState({ defaultOverdueDays: 7 });

  // Student details
  const [studentRoll, setStudentRoll] = useState('');
  const [studentName, setStudentName] = useState('');
  const [studentDept, setStudentDept] = useState('');
  const [studentPhone, setStudentPhone] = useState('');
  const [authorizedBy, setAuthorizedBy] = useState('');

  // Delegations detection
  const [activeAuthorizations, setActiveAuthorizations] = useState([]);
  const [delegateFor, setDelegateFor] = useState([]);

  // Component Cart: array of { component, quantity, selectedIndividualIds, dueDays }
  const [cart, setCart] = useState([]);

  // Component search & selector
  const [searchComponentQuery, setSearchComponentQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [defaultDuration, setDefaultDuration] = useState(7);
  const [issueNotes, setIssueNotes] = useState('');

  // UI status
  const [errorMessage, setErrorMessage] = useState('');
  const [successReceipt, setSuccessReceipt] = useState(null);

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, []);

  function loadData() {
    const comps = getComponents();
    setComponentsList(comps);
    const setts = getSettings();
    setSettings(setts);
    setDefaultDuration(setts.defaultOverdueDays || 7);
  }

  // Sync if student was scanned from global Camera modal
  useEffect(() => {
    if (scannedStudent) {
      setStudentRoll(scannedStudent.rollNumber);
      setStudentName(scannedStudent.name);
      checkStudentRecords(scannedStudent.rollNumber);
      if (onClearScannedStudent) onClearScannedStudent();
    }
  }, [scannedStudent]);

  function checkStudentRecords(roll) {
    if (!roll) return;
    const cleanRoll = roll.trim().toUpperCase();
    const existing = getStudentByRoll(cleanRoll);
    if (existing) {
      if (!studentName) setStudentName(existing.name);
      setStudentDept(existing.department || '');
      setStudentPhone(existing.phone || '');
    }

    // Check delegations
    const auths = getActiveAuthorizationsForStudent(cleanRoll);
    setActiveAuthorizations(auths);

    const asDelegate = getDelegationsForDelegate(cleanRoll);
    setDelegateFor(asDelegate);
  }

  function handleRollChange(val) {
    const upper = val.toUpperCase();
    setStudentRoll(upper);
    checkStudentRecords(upper);
  }

  // Cart operations
  function addToCart(comp) {
    setErrorMessage('');
    if (comp.availableQuantity <= 0) {
      setErrorMessage(`Cannot add "${comp.name}". Zero units available in inventory.`);
      return;
    }

    const existingIndex = cart.findIndex((item) => item.component.id === comp.id);
    if (existingIndex !== -1) {
      // Increase quantity if aggregate
      const item = cart[existingIndex];
      if (comp.trackingMode === 'aggregate') {
        if (item.quantity >= comp.availableQuantity) {
          setErrorMessage(`Cannot add more than ${comp.availableQuantity} available units for "${comp.name}".`);
          return;
        }
        const updated = [...cart];
        updated[existingIndex].quantity += 1;
        setCart(updated);
      } else {
        setErrorMessage(`"${comp.name}" is individually tracked. Please select specific physical tags below.`);
      }
    } else {
      // Add new item to cart
      const initialIds = comp.trackingMode === 'individual'
        ? comp.individualIds.filter((x) => x.status === 'available').slice(0, 1).map((x) => x.id)
        : [];

      setCart([
        ...cart,
        {
          component: comp,
          quantity: 1,
          selectedIndividualIds: initialIds,
          dueDays: comp.defaultOverdueDays || defaultDuration,
        },
      ]);
    }
  }

  function updateCartQuantity(index, newQty) {
    const item = cart[index];
    const qty = Number(newQty);
    if (qty <= 0) {
      removeFromCart(index);
      return;
    }
    if (qty > item.component.availableQuantity) {
      setErrorMessage(`Only ${item.component.availableQuantity} units available for "${item.component.name}".`);
      return;
    }

    const updated = [...cart];
    updated[index].quantity = qty;

    // Adjust selected IDs if individual tracking
    if (item.component.trackingMode === 'individual') {
      const availableTags = item.component.individualIds
        .filter((x) => x.status === 'available')
        .map((x) => x.id);
      updated[index].selectedIndividualIds = availableTags.slice(0, qty);
    }

    setCart(updated);
  }

  function toggleIndividualId(index, tagId) {
    const item = cart[index];
    const current = [...item.selectedIndividualIds];
    const tagIdx = current.indexOf(tagId);

    if (tagIdx !== -1) {
      // Remove
      current.splice(tagIdx, 1);
    } else {
      // Add
      current.push(tagId);
    }

    const updated = [...cart];
    updated[index].selectedIndividualIds = current;
    updated[index].quantity = current.length; // Quantity follows tag count
    setCart(updated);
  }

  function updateCartDueDays(index, days) {
    const updated = [...cart];
    updated[index].dueDays = Math.max(1, Number(days) || 1);
    setCart(updated);
  }

  function removeFromCart(index) {
    const updated = [...cart];
    updated.splice(index, 1);
    setCart(updated);
  }

  // Issue transaction submission
  function handleSubmitIssue(e) {
    e.preventDefault();
    setErrorMessage('');

    try {
      if (!studentRoll.trim()) throw new Error('Student Roll Number is required.');
      if (!studentName.trim()) throw new Error('Student Name is required.');
      if (cart.length === 0) throw new Error('Please select at least one component to issue.');

      // Validate all cart items
      for (const item of cart) {
        if (item.quantity <= 0) {
          throw new Error(`Quantity for "${item.component.name}" must be greater than zero.`);
        }
        if (item.quantity > item.component.availableQuantity) {
          throw new Error(
            `Requested ${item.quantity} units of "${item.component.name}", but only ${item.component.availableQuantity} are available.`
          );
        }
        if (item.component.trackingMode === 'individual') {
          if (item.selectedIndividualIds.length !== item.quantity) {
            throw new Error(
              `Please select exactly ${item.quantity} individual physical ID tag(s) for "${item.component.name}".`
            );
          }
        }
      }

      const issuePayload = {
        studentRoll: studentRoll.trim().toUpperCase(),
        studentName: studentName.trim(),
        studentDept,
        studentPhone,
        authorizedBy: authorizedBy ? authorizedBy.trim() : null,
        defaultOverdueDays: defaultDuration,
        notes: issueNotes,
        items: cart.map((it) => ({
          componentId: it.component.id,
          quantity: it.quantity,
          individualIds: it.selectedIndividualIds,
          dueDays: it.dueDays,
        })),
      };

      const txn = issueComponents(issuePayload);
      setSuccessReceipt(txn);
      setCart([]);
      setIssueNotes('');
      if (onToast) onToast(`Successfully issued components! Transaction: ${txn.id}`);
    } catch (err) {
      console.error('Issue error:', err);
      setErrorMessage(err.message);
    }
  }

  function resetForm() {
    setSuccessReceipt(null);
    setStudentRoll('');
    setStudentName('');
    setStudentDept('');
    setStudentPhone('');
    setAuthorizedBy('');
    setCart([]);
    setErrorMessage('');
  }

  // Filter available components to display in catalog
  const filteredCatalog = componentsList.filter((comp) => {
    if (selectedCategory !== 'All' && comp.category !== selectedCategory) return false;
    if (searchComponentQuery.trim()) {
      const q = searchComponentQuery.toLowerCase().trim();
      return (
        comp.name.toLowerCase().includes(q) ||
        comp.category.toLowerCase().includes(q) ||
        (comp.individualIds && comp.individualIds.some((id) => id.id.toLowerCase().includes(q)))
      );
    }
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Issue Components
          </h2>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Identify student via camera OCR, select components & physical IDs, and record borrow transaction
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={onOpenOcrModal}>
          <Camera size={18} /> Open Camera OCR
        </button>
      </div>

      {/* SUCCESS CONFIRMATION RECEIPT */}
      {successReceipt && (
        <div className="card" style={{ border: '2px solid var(--success)', background: '#f0fdf4', marginBottom: '1.5rem' }}>
          <div className="card-header" style={{ background: '#dcfce7', borderBottom: '1px solid #bbf7d0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <CheckCircle2 size={24} style={{ color: 'var(--success)' }} />
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#14532d' }}>
                  Components Issued Successfully!
                </h3>
                <span className="font-mono text-sm" style={{ color: '#166534' }}>
                  Receipt ID: {successReceipt.id}
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
                Print Receipt
              </button>
              <button type="button" className="btn btn-success btn-sm" onClick={resetForm}>
                Issue Another
              </button>
            </div>
          </div>
          <div className="card-body">
            <div className="review-grid" style={{ marginBottom: '1rem' }}>
              <div>
                <span className="text-muted text-xs">ISSUED TO:</span>
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--neutral-900)' }}>
                  {successReceipt.studentName}
                </div>
                <div className="font-mono" style={{ fontWeight: 600, color: 'var(--neutral-600)' }}>
                  Roll: {successReceipt.studentRoll}
                </div>
                {successReceipt.authorizedBy && (
                  <div className="badge badge-warning" style={{ marginTop: '0.35rem' }}>
                    Collected via Delegate: {successReceipt.authorizedBy}
                  </div>
                )}
              </div>
              <div>
                <span className="text-muted text-xs">LOAN DETAILS:</span>
                <div style={{ fontSize: '0.9rem' }}>
                  Issue Date: <strong>{new Date(successReceipt.issueDate).toLocaleString()}</strong>
                </div>
                <div style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>
                  Overall Due Date: <strong>{new Date(successReceipt.overallDueDate).toLocaleDateString()}</strong>
                </div>
              </div>
            </div>

            <h4 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.5rem' }}>Issued Items:</h4>
            <div className="table-responsive">
              <table className="table" style={{ background: '#fff', borderRadius: 'var(--radius-md)' }}>
                <thead>
                  <tr>
                    <th>Component</th>
                    <th>Quantity</th>
                    <th>Assigned Physical IDs</th>
                    <th>Due Date</th>
                  </tr>
                </thead>
                <tbody>
                  {successReceipt.items.map((it) => (
                    <tr key={it.componentId}>
                      <td style={{ fontWeight: 600 }}>{it.componentName}</td>
                      <td>{it.issuedQuantity} unit(s)</td>
                      <td>
                        {it.individualIds && it.individualIds.length > 0 ? (
                          <div className="id-chips-container">
                            {it.individualIds.map((tag) => (
                              <span key={tag} className="id-chip id-chip-issued">{tag}</span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted">Bulk / Aggregate</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{new Date(it.dueDate).toLocaleDateString()} ({it.dueDays} days)</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MAIN TWO COLUMN LAYOUT: Student & Cart / Catalog */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 1.2fr) minmax(340px, 1.8fr)', gap: '1.5rem' }}>
        {/* LEFT COLUMN: Student Information & Issue Cart */}
        <div>
          {/* Student Identification Card */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <User size={18} /> Student Identification
              </h3>
              <button type="button" className="btn btn-secondary btn-sm" onClick={onOpenOcrModal}>
                <Camera size={14} /> Scan ID Card
              </button>
            </div>
            <div className="card-body">
              {errorMessage && (
                <div className="alert alert-danger" style={{ marginBottom: '1rem' }}>
                  <AlertCircle size={16} />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="form-group">
                <label className="input-label">
                  <Hash size={15} /> Roll Number <span className="required-star">*</span>
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <input
                    type="text"
                    className="input-field uppercase-input"
                    placeholder="e.g. 238W1A0477"
                    value={studentRoll}
                    onChange={(e) => handleRollChange(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onOpenOcrModal}
                    title="Open Camera OCR"
                  >
                    <Camera size={18} />
                  </button>
                </div>
                <span className="input-hint">Capture ID card via camera OCR or type manually</span>
              </div>

              <div className="form-group">
                <label className="input-label">
                  <User size={15} /> Student Full Name <span className="required-star">*</span>
                </label>
                <input
                  type="text"
                  className="input-field"
                  placeholder="e.g. Anwar Bajarinti"
                  value={studentName}
                  onChange={(e) => setStudentName(e.target.value)}
                  required
                />
              </div>

              <div className="review-grid">
                <div className="form-group">
                  <label className="input-label">Department / Branch</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. ECE / CSE"
                    value={studentDept}
                    onChange={(e) => setStudentDept(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="input-label">Contact Phone</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. +91 98765 43210"
                    value={studentPhone}
                    onChange={(e) => setStudentPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Active Delegation Alert */}
              {activeAuthorizations.length > 0 && (
                <div className="alert alert-info" style={{ marginTop: '0.75rem' }}>
                  <UserCheck size={18} />
                  <div>
                    <strong style={{ fontSize: '0.85rem' }}>Authorized Proxy Available:</strong>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                      {activeAuthorizations.map((a) => (
                        <div key={a.id}>
                          • {a.authorizedStudentName} ({a.authorizedStudentRoll}) is authorized to collect for this student.
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* If student is acting as delegate */}
              {delegateFor.length > 0 && (
                <div className="alert alert-warning" style={{ marginTop: '0.75rem' }}>
                  <Info size={18} />
                  <div>
                    <strong style={{ fontSize: '0.85rem' }}>Proxy Delegate Detected:</strong>
                    <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                      This student is an authorized delegate for:
                      {delegateFor.map((d) => (
                        <div key={d.id}>
                          • {d.primaryStudentName} ({d.primaryStudentRoll})
                          <button
                            type="button"
                            className="btn-badge"
                            style={{ marginLeft: '0.5rem' }}
                            onClick={() => {
                              setStudentRoll(d.primaryStudentRoll);
                              setStudentName(d.primaryStudentName);
                              setAuthorizedBy(`${studentName} (${studentRoll})`);
                              checkStudentRecords(d.primaryStudentRoll);
                            }}
                          >
                            Switch to Primary Student
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {authorizedBy && (
                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label className="input-label">Acting Delegate / Proxy</label>
                  <input
                    type="text"
                    className="input-field"
                    value={authorizedBy}
                    onChange={(e) => setAuthorizedBy(e.target.value)}
                  />
                  <span className="input-hint">Name/Roll of authorized person collecting the components</span>
                </div>
              )}
            </div>
          </div>

          {/* Issue Cart & Overdue Config */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">
                <ShoppingCart size={18} /> Selected Components Cart ({cart.length})
              </h3>
              {cart.length > 0 && (
                <button type="button" className="btn-link text-xs" onClick={() => setCart([])}>
                  Clear All
                </button>
              )}
            </div>

            <div className="card-body">
              {cart.length === 0 ? (
                <div className="text-muted" style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                  <PackageCheck size={32} style={{ opacity: 0.3, margin: '0 auto 0.5rem' }} />
                  <p style={{ fontSize: '0.9rem' }}>No components selected yet.</p>
                  <span className="text-xs">Select items from the catalog on the right to add them to this cart.</span>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  {cart.map((item, idx) => {
                    const isIndiv = item.component.trackingMode === 'individual';
                    const availableTags = isIndiv
                      ? item.component.individualIds.filter((x) => x.status === 'available').map((x) => x.id)
                      : [];

                    return (
                      <div
                        key={item.component.id}
                        style={{
                          border: '1px solid var(--neutral-200)',
                          borderRadius: 'var(--radius-md)',
                          padding: '0.85rem',
                          background: 'var(--neutral-50)',
                        }}
                      >
                        <div className="flex-between">
                          <div>
                            <strong style={{ fontSize: '0.92rem', color: 'var(--neutral-900)' }}>
                              {item.component.name}
                            </strong>
                            <div className="text-xs text-muted">
                              {item.component.category} • Max available: {item.component.availableQuantity}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-icon"
                            onClick={() => removeFromCart(idx)}
                            title="Remove from cart"
                          >
                            <Trash2 size={16} style={{ color: 'var(--danger)' }} />
                          </button>
                        </div>

                        {/* Quantity and Overdue Stepper */}
                        <div className="flex-between" style={{ marginTop: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span className="text-xs font-semibold">Qty:</span>
                            {isIndiv ? (
                              <span className="badge badge-info">{item.selectedIndividualIds.length} tag(s)</span>
                            ) : (
                              <div className="quantity-stepper">
                                <button type="button" onClick={() => updateCartQuantity(idx, item.quantity - 1)}>-</button>
                                <span>{item.quantity}</span>
                                <button type="button" onClick={() => updateCartQuantity(idx, item.quantity + 1)}>+</button>
                              </div>
                            )}
                          </div>

                          {/* Per-component overdue duration config */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Clock size={14} className="text-muted" />
                            <span className="text-xs">Loan:</span>
                            <input
                              type="number"
                              min={1}
                              max={90}
                              style={{ width: 55, padding: '0.2rem 0.4rem', borderRadius: 4, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
                              value={item.dueDays}
                              onChange={(e) => updateCartDueDays(idx, e.target.value)}
                            />
                            <span className="text-xs text-muted">days</span>
                          </div>
                        </div>

                        {/* Individual physical IDs tag selector */}
                        {isIndiv && (
                          <div style={{ marginTop: '0.65rem', borderTop: '1px dashed #cbd5e1', paddingTop: '0.5rem' }}>
                            <span className="text-xs font-semibold" style={{ display: 'block', marginBottom: '0.35rem' }}>
                              Select Physical Serial Tag(s):
                            </span>
                            <div className="id-chips-container">
                              {availableTags.map((tagId) => {
                                const isSelected = item.selectedIndividualIds.includes(tagId);
                                return (
                                  <span
                                    key={tagId}
                                    className={`id-chip id-chip-selectable ${isSelected ? 'selected' : 'id-chip-available'}`}
                                    onClick={() => toggleIndividualId(idx, tagId)}
                                  >
                                    {isSelected ? '✓ ' : '+ '} {tagId}
                                  </span>
                                );
                              })}
                            </div>
                            {item.selectedIndividualIds.length === 0 && (
                              <span className="text-xs" style={{ color: 'var(--danger)', marginTop: '0.25rem', display: 'block' }}>
                                Please select at least one physical ID tag above.
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Transaction Notes */}
                  <div className="form-group" style={{ marginTop: '0.5rem' }}>
                    <label className="input-label">Transaction Notes / Project Purpose</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. IoT Smart Home prototype / Mini-project lab work"
                      value={issueNotes}
                      onChange={(e) => setIssueNotes(e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%', marginTop: '0.5rem' }}
                    onClick={handleSubmitIssue}
                    disabled={cart.length === 0 || !studentRoll || !studentName}
                  >
                    Confirm & Issue Components
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Available Components Catalog */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Search size={18} /> Component Inventory Catalog
            </h3>
            <span className="badge badge-neutral">{filteredCatalog.length} available</span>
          </div>

          <div className="card-body">
            {/* Catalog search bar */}
            <div style={{ marginBottom: '1rem' }}>
              <div className="search-wrapper" style={{ maxWidth: '100%' }}>
                <Search size={18} className="search-icon" />
                <input
                  type="text"
                  className="input-field search-input"
                  placeholder="Filter catalog by component name or category..."
                  value={searchComponentQuery}
                  onChange={(e) => setSearchComponentQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Catalog Items List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxHeight: '680px', overflowY: 'auto' }}>
              {filteredCatalog.map((comp) => {
                const inCart = cart.find((item) => item.component.id === comp.id);
                const isOutOfStock = comp.availableQuantity <= 0;

                return (
                  <div
                    key={comp.id}
                    style={{
                      border: '1px solid var(--neutral-200)',
                      borderRadius: 'var(--radius-md)',
                      padding: '0.85rem 1rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isOutOfStock ? 'var(--neutral-100)' : '#fff',
                      opacity: isOutOfStock ? 0.6 : 1,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: '1rem' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--neutral-900)' }}>
                        {comp.name}
                      </div>
                      <div className="text-xs text-muted" style={{ marginTop: '0.2rem' }}>
                        {comp.category} • Location: {comp.location || 'Main Storage'}
                      </div>
                      <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span className={`badge ${comp.availableQuantity > 0 ? 'badge-success' : 'badge-danger'}`}>
                          {comp.availableQuantity} available
                        </span>
                        {comp.trackingMode === 'individual' ? (
                          <span className="badge badge-info">Individual IDs</span>
                        ) : (
                          <span className="badge badge-neutral">Bulk Aggregate</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <button
                        type="button"
                        className={`btn ${inCart ? 'btn-secondary' : 'btn-primary'} btn-sm`}
                        onClick={() => addToCart(comp)}
                        disabled={isOutOfStock}
                      >
                        {inCart ? (
                          <>+ Add More ({inCart.quantity})</>
                        ) : (
                          <>
                            <Plus size={15} /> Select
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
