// src/pages/Components.jsx
// Inventory Management with Low-Stock Alerts, Damaged/Lost Tracking (NO Under-Maintenance),
// Individual Physical IDs, Threshold settings, and Advanced Search & Filtering.

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Search,
  Cpu,
  Edit2,
  Trash2,
  PlusCircle,
  Hash,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Layers,
  MapPin,
  X,
  Sliders,
  ShieldAlert,
  Flame,
  HelpCircle,
  FolderTree,
  List,
} from 'lucide-react';
import {
  getComponents,
  addComponent,
  updateComponent,
  addComponentQuantity,
  deleteComponent,
  setComponentThreshold,
  markComponentStatus,
  getUsableStock,
  isComponentLowStock,
  subscribeToDb,
} from '../../db/database';

export const COMPONENT_CATEGORIES = [
  'All',
  'Microcontrollers',
  'Sensors',
  'Modules',
  'Displays',
  'Motors',
  'Communication modules',
  'Other electronic components',
];

export default function Components({ currentUser, onToast }) {
  const [componentsList, setComponentsList] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'low_stock' | 'damaged' | 'lost'
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [isInspectModalOpen, setIsInspectModalOpen] = useState(false);
  const [isThresholdModalOpen, setIsThresholdModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);

  const [activeComponent, setActiveComponent] = useState(null);
  const [activeTagId, setActiveTagId] = useState(null);

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    category: 'Microcontrollers',
    parentCategory: '',
    componentNumber: '',
    description: '',
    trackingMode: 'aggregate',
    totalQuantity: 10,
    lowStockThreshold: 3,
    defaultOverdueDays: 7,
    location: '',
    idPrefix: '',
  });

  const [restockQty, setRestockQty] = useState(5);
  const [thresholdInput, setThresholdInput] = useState(3);
  const [statusInput, setStatusInput] = useState('damaged'); // 'damaged' | 'lost' | 'available'
  const [statusNotes, setStatusNotes] = useState('');
  const [modalError, setModalError] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'tree'

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, [selectedCategory, searchQuery, statusFilter]);

  function loadData() {
    const list = getComponents(selectedCategory, searchQuery, statusFilter);
    setComponentsList(list);
  }

  function openAddModal() {
    setFormData({
      name: '',
      category: 'Microcontrollers',
      parentCategory: '',
      componentNumber: '',
      description: '',
      trackingMode: 'aggregate',
      totalQuantity: 10,
      lowStockThreshold: 3,
      defaultOverdueDays: 7,
      location: '',
      idPrefix: '',
    });
    setModalError('');
    setIsAddModalOpen(true);
  }

  function openEditModal(comp) {
    setActiveComponent(comp);
    setFormData({
      name: comp.name,
      category: comp.category,
      parentCategory: comp.parentCategory || '',
      componentNumber: comp.componentNumber || '',
      description: comp.description || '',
      trackingMode: comp.trackingMode,
      totalQuantity: comp.totalQuantity,
      lowStockThreshold: comp.lowStockThreshold || 3,
      defaultOverdueDays: comp.defaultOverdueDays || 7,
      location: comp.location || comp.locationDetails || '',
      idPrefix: '',
    });
    setModalError('');
    setIsEditModalOpen(true);
  }

  function openThresholdModal(comp) {
    setActiveComponent(comp);
    setThresholdInput(comp.lowStockThreshold || 0);
    setModalError('');
    setIsThresholdModalOpen(true);
  }

  function openStatusModal(comp, tagId = null) {
    setActiveComponent(comp);
    setActiveTagId(tagId);
    setStatusInput('damaged');
    setStatusNotes('');
    setModalError('');
    setIsStatusModalOpen(true);
  }

  async function handleSaveAdd(e) {
    e.preventDefault();
    setModalError('');
    try {
      if (!formData.name.trim()) throw new Error('Component Name is required.');
      await addComponent(formData, currentUser);
      setIsAddModalOpen(false);
      if (onToast) onToast(`Component "${formData.name}" added successfully!`);
      loadData();
    } catch (err) {
      setModalError(err.message);
    }
  }

  async function handleSaveEdit(e) {
    e.preventDefault();
    setModalError('');
    try {
      await updateComponent(activeComponent.id, formData, currentUser);
      setIsEditModalOpen(false);
      if (onToast) onToast(`Component "${formData.name}" updated.`);
      loadData();
    } catch (err) {
      setModalError(err.message);
    }
  }

  function handleSaveThreshold(e) {
    e.preventDefault();
    try {
      setComponentThreshold(activeComponent.id, thresholdInput, currentUser);
      setIsThresholdModalOpen(false);
      if (onToast) onToast(`Low-stock threshold set to ${thresholdInput} for ${activeComponent.name}.`);
    } catch (err) {
      setModalError(err.message);
    }
  }

  function handleSaveStatus(e) {
    e.preventDefault();
    try {
      markComponentStatus({
        componentId: activeComponent.id,
        status: statusInput,
        individualTagId: activeTagId,
        notes: statusNotes,
        actor: currentUser,
      });
      setIsStatusModalOpen(false);
      if (onToast) onToast(`Marked ${activeComponent.name} as ${statusInput}.`);
    } catch (err) {
      setModalError(err.message);
    }
  }

  function handleDelete(comp) {
    if (comp.issuedQuantity > 0) {
      alert(`Cannot delete "${comp.name}" because ${comp.issuedQuantity} unit(s) are currently issued.`);
      return;
    }
    if (confirm(`Delete component "${comp.name}"?`)) {
      try {
        deleteComponent(comp.id, currentUser);
        if (onToast) onToast(`Component "${comp.name}" deleted.`);
      } catch (err) {
        alert(err.message);
      }
    }
  }

  return (
    <div>
      {/* Header & Actions */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Component & Lab Inventory
          </h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Dual-mode stock management with low-stock alerts, Damaged/Lost tracking, and individual physical tags
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={openAddModal}>
          <Plus size={18} /> Add New Component
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-body" style={{ padding: '0.85rem 1rem' }}>
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: '1rem' }}>
            <div className="search-wrapper" style={{ maxWidth: '360px' }}>
              <Search size={18} className="search-icon" />
              <input
                type="text"
                className="input-field search-input"
                placeholder="Search by name, category, or physical tag ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Status Filter Tabs (Low Stock, Damaged, Lost) */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
              {[
                { id: 'all', label: 'All Inventory' },
                { id: 'low_stock', label: 'Low-Stock Alerts', badgeColor: 'var(--danger)' },
                { id: 'damaged', label: 'Damaged' },
                { id: 'lost', label: 'Lost Items' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`btn-badge ${statusFilter === tab.id ? 'active' : ''}`}
                  style={{
                    background: statusFilter === tab.id ? 'var(--neutral-900)' : '#f1f5f9',
                    color: statusFilter === tab.id ? '#fff' : '#475569',
                    padding: '0.4rem 0.85rem',
                  }}
                  onClick={() => setStatusFilter(tab.id)}
                >
                  {tab.label}
                </button>
              ))}

              {/* View Mode Toggle: List vs Hierarchy Tree */}
              <div style={{ display: 'flex', gap: '0.25rem', marginLeft: '0.5rem', borderLeft: '1px solid var(--neutral-300)', paddingLeft: '0.5rem' }}>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: viewMode === 'list' ? 'var(--primary)' : '#f1f5f9',
                    color: viewMode === 'list' ? '#fff' : 'var(--neutral-700)',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                  onClick={() => setViewMode('list')}
                  title="Table List View"
                >
                  <List size={14} /> List
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{
                    background: viewMode === 'tree' ? 'var(--primary)' : '#f1f5f9',
                    color: viewMode === 'tree' ? '#fff' : 'var(--neutral-700)',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.8rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                  onClick={() => setViewMode('tree')}
                  title="Category Hierarchy View"
                >
                  <FolderTree size={14} /> Hierarchy
                </button>
              </div>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div style={{ display: 'flex', gap: '0.35rem', overflowX: 'auto', paddingBottom: '0.25rem', marginTop: '0.75rem' }}>
            {COMPONENT_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`btn-badge ${selectedCategory === cat ? 'active' : ''}`}
                style={{
                  background: selectedCategory === cat ? 'var(--neutral-800)' : '#f1f5f9',
                  color: selectedCategory === cat ? '#fff' : '#475569',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.75rem',
                  borderRadius: '999px',
                  border: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main View: Hierarchy Tree or Table */}
      {viewMode === 'tree' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {(() => {
            const categoriesInList = Array.from(new Set(componentsList.map((c) => c.category || 'Other electronic components')));
            if (categoriesInList.length === 0) {
              return (
                <div className="card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--neutral-500)' }}>
                  No components match your search or filter.
                </div>
              );
            }
            return categoriesInList.map((cat) => {
              const catItems = componentsList.filter((c) => (c.category || 'Other electronic components') === cat);
              const parentMap = {};
              catItems.forEach((c) => {
                const p = c.parentCategory ? c.parentCategory.trim() : 'General / Direct Items';
                if (!parentMap[p]) parentMap[p] = [];
                parentMap[p].push(c);
              });

              return (
                <div key={cat} className="card" style={{ overflow: 'hidden' }}>
                  <div
                    className="card-header flex-between"
                    style={{ background: '#f8fafc', borderBottom: '1px solid var(--neutral-200)', padding: '0.85rem 1.25rem' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <FolderTree size={18} className="text-primary" />
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>{cat}</h3>
                      <span className="badge badge-neutral" style={{ fontSize: '0.75rem' }}>
                        {catItems.length} items
                      </span>
                    </div>
                  </div>

                  <div className="card-body" style={{ padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {Object.entries(parentMap).map(([parentGroup, items]) => (
                      <div key={parentGroup} style={{ borderLeft: '3px solid var(--primary-light)', paddingLeft: '1rem', marginLeft: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.6rem' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--neutral-700)' }}>
                            📂 {parentGroup}
                          </span>
                          <span className="badge badge-neutral text-xs">{items.length}</span>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                          {items.map((comp) => {
                            const usable = getUsableStock(comp);
                            const isLow = isComponentLowStock(comp);
                            return (
                              <div
                                key={comp.id}
                                style={{
                                  border: '1px solid var(--neutral-200)',
                                  borderRadius: 'var(--radius-md)',
                                  padding: '0.85rem',
                                  background: isLow ? '#fffbeb' : '#fff',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '0.5rem',
                                }}
                              >
                                <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                                  <div>
                                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--neutral-900)' }}>
                                      {comp.name}
                                    </div>
                                    <div className="font-mono text-xs text-muted">
                                      {comp.componentNumber ? `Tag: ${comp.componentNumber}` : `ID: ${comp.id}`}
                                    </div>
                                  </div>
                                  {isLow && (
                                    <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>
                                      Low Stock
                                    </span>
                                  )}
                                </div>

                                <div style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', color: 'var(--neutral-600)' }}>
                                  <span>Usable: <strong style={{ color: isLow ? 'var(--danger-text)' : 'var(--neutral-900)' }}>{usable}</strong></span>
                                  <span>Avail: <strong style={{ color: 'var(--success-text)' }}>{comp.availableQuantity}</strong></span>
                                  <span>Issued: <strong>{comp.issuedQuantity}</strong></span>
                                </div>

                                {comp.location && (
                                  <div className="text-xs text-muted" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <MapPin size={12} /> {comp.location}
                                  </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem', marginTop: '0.25rem', borderTop: '1px solid var(--neutral-100)', paddingTop: '0.5rem' }}>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => openStatusModal(comp)}
                                    title="Mark Condition"
                                  >
                                    <ShieldAlert size={14} style={{ color: '#d97706' }} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => openEditModal(comp)}
                                    title="Edit"
                                  >
                                    <Edit2 size={14} style={{ color: 'var(--primary)' }} />
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-icon"
                                    onClick={() => handleDelete(comp)}
                                    title="Delete"
                                    disabled={comp.issuedQuantity > 0}
                                  >
                                    <Trash2 size={14} style={{ color: comp.issuedQuantity > 0 ? 'var(--neutral-300)' : 'var(--danger)' }} />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      ) : (
        /* Inventory Table */
        <div className="card">
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Category</th>
                  <th>Usable vs Threshold</th>
                  <th>Stock Breakdown</th>
                  <th>Physical ID Tags</th>
                  <th>Location</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {componentsList.length > 0 ? (
                  componentsList.map((comp) => {
                    const usableStock = getUsableStock(comp);
                    const threshold = comp.lowStockThreshold || 0;
                    const isLow = isComponentLowStock(comp);

                    return (
                      <tr key={comp.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 700, color: 'var(--neutral-900)', fontSize: '0.95rem' }}>
                              {comp.name}
                            </span>
                            {comp.componentNumber && (
                              <span className="badge badge-primary font-mono text-xs">
                                {comp.componentNumber}
                              </span>
                            )}
                          </div>
                          <div className="font-mono text-xs text-muted">
                            ID: {comp.id} • Loan: {comp.defaultOverdueDays || 7}d
                          </div>
                        </td>

                        <td>
                          <span className="badge badge-neutral">{comp.category}</span>
                          {comp.parentCategory && (
                            <div className="text-xs text-muted" style={{ marginTop: '0.2rem' }}>
                              Sub: <strong style={{ color: 'var(--neutral-700)' }}>{comp.parentCategory}</strong>
                            </div>
                          )}
                        </td>

                        {/* LOW-STOCK THRESHOLD & USABLE STOCK CALCULATION */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <strong style={{ fontSize: '1rem', color: isLow ? 'var(--danger-text)' : 'var(--neutral-900)' }}>
                              {usableStock}
                            </strong>
                            <span className="text-muted text-xs">/ threshold {threshold}</span>
                            <button
                              type="button"
                              className="btn-icon"
                              style={{ padding: '0.2rem' }}
                              onClick={() => openThresholdModal(comp)}
                              title="Edit Minimum Low-Stock Threshold"
                            >
                              <Sliders size={13} />
                            </button>
                          </div>

                          {isLow ? (
                            <span className="badge badge-danger" style={{ marginTop: '0.25rem' }}>
                              <AlertTriangle size={11} /> Low Stock Alert
                            </span>
                          ) : (
                            <span className="badge badge-success" style={{ marginTop: '0.25rem' }}>
                              Adequate Stock
                            </span>
                          )}
                        </td>

                        {/* DETAILED STOCK BREAKDOWN (Available, Issued, Damaged, Lost) */}
                        <td>
                          <div className="text-xs" style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                            <span>Avail: <strong style={{ color: 'var(--success-text)' }}>{comp.availableQuantity}</strong></span>
                            <span>Issued: <strong>{comp.issuedQuantity}</strong></span>
                            {comp.damagedQuantity > 0 && (
                              <span style={{ color: '#d97706' }}>Damaged: <strong>{comp.damagedQuantity}</strong></span>
                            )}
                            {comp.lostQuantity > 0 && (
                              <span style={{ color: 'var(--danger-text)' }}>Lost: <strong>{comp.lostQuantity}</strong></span>
                            )}
                          </div>
                        </td>

                        {/* INDIVIDUAL PHYSICAL TAGS */}
                        <td>
                          {comp.trackingMode === 'individual' ? (
                            <div>
                              <button
                                type="button"
                                className="btn-link text-xs font-mono"
                                onClick={() => {
                                  setActiveComponent(comp);
                                  setIsInspectModalOpen(true);
                                }}
                              >
                                <Hash size={12} /> {comp.individualIds?.length || 0} Physical Tags
                              </button>
                            </div>
                          ) : (
                            <span className="badge badge-neutral text-xs">
                              <Layers size={11} /> Bulk
                            </span>
                          )}
                        </td>

                        <td className="text-sm">
                          {comp.location || <span className="text-muted">—</span>}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => openStatusModal(comp)}
                              title="Mark Damaged or Lost"
                            >
                              <ShieldAlert size={16} style={{ color: '#d97706' }} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => openEditModal(comp)}
                              title="Edit component"
                            >
                              <Edit2 size={16} style={{ color: 'var(--primary)' }} />
                            </button>
                            <button
                              type="button"
                              className="btn-icon"
                              onClick={() => handleDelete(comp)}
                              title="Delete"
                              disabled={comp.issuedQuantity > 0}
                            >
                              <Trash2 size={16} style={{ color: comp.issuedQuantity > 0 ? 'var(--neutral-300)' : 'var(--danger)' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '3rem' }} className="text-muted">
                      No components found matching your filter or search query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================== THRESHOLD CONFIGURATION MODAL ==================== */}
      {isThresholdModalOpen && activeComponent && (
        <div className="modal-overlay" onClick={() => setIsThresholdModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveThreshold}>
              <div className="modal-header">
                <div className="modal-title-group">
                  <Sliders className="icon-primary" size={22} />
                  <div>
                    <h3 className="modal-title">Low-Stock Alert Threshold</h3>
                    <p className="modal-subtitle">{activeComponent.name}</p>
                  </div>
                </div>
                <button type="button" className="btn-icon" onClick={() => setIsThresholdModalOpen(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group">
                  <label className="input-label">Minimum Usable Stock Threshold</label>
                  <input
                    type="number"
                    min={0}
                    className="input-field"
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    required
                    autoFocus
                  />
                  <span className="input-hint">
                    Alert triggers when Usable Stock (Available + Issued) drops below this number.
                    <br />
                    <strong>Note:</strong> Lost components do not count towards usable stock.
                  </span>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsThresholdModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Threshold
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== MARK DAMAGED / LOST MODAL ==================== */}
      {isStatusModalOpen && activeComponent && (
        <div className="modal-overlay" onClick={() => setIsStatusModalOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveStatus}>
              <div className="modal-header">
                <div className="modal-title-group">
                  <ShieldAlert className="icon-primary" size={22} style={{ color: 'var(--danger)' }} />
                  <div>
                    <h3 className="modal-title">Mark Component Condition</h3>
                    <p className="modal-subtitle">{activeComponent.name} {activeTagId ? `(${activeTagId})` : ''}</p>
                  </div>
                </div>
                <button type="button" className="btn-icon" onClick={() => setIsStatusModalOpen(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body">
                <div className="form-group">
                  <label className="input-label">Condition Status</label>
                  <select
                    className="select-field"
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value)}
                  >
                    <option value="damaged">Damaged (Physical unit exists but cannot be issued)</option>
                    <option value="lost">Lost (Unit missing / unaccounted for)</option>
                    <option value="available">Restored to Available</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="input-label">Reason / Condition Details</label>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="e.g. Broken header pins / Missing after mini-project exhibition"
                    value={statusNotes}
                    onChange={(e) => setStatusNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsStatusModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Confirm Status Change
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== PHYSICAL TAGS INSPECTOR MODAL ==================== */}
      {isInspectModalOpen && activeComponent && (
        <div className="modal-overlay" onClick={() => setIsInspectModalOpen(false)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <Hash className="icon-primary" size={22} />
                <div>
                  <h3 className="modal-title">Physical ID Tags: {activeComponent.name}</h3>
                  <p className="modal-subtitle">Track individual hardware serials and condition</p>
                </div>
              </div>
              <button type="button" className="btn-icon" onClick={() => setIsInspectModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {activeComponent.individualIds && activeComponent.individualIds.length > 0 ? (
                  activeComponent.individualIds.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        border: '1px solid var(--neutral-200)',
                        borderRadius: 'var(--radius-md)',
                        padding: '0.75rem',
                        background:
                          item.status === 'damaged'
                            ? '#fef3c7'
                            : item.status === 'lost'
                            ? '#fee2e2'
                            : item.status === 'issued'
                            ? 'var(--warning-light)'
                            : 'var(--success-light)',
                      }}
                    >
                      <div className="flex-between">
                        <span className="font-mono" style={{ fontWeight: 700, fontSize: '0.9rem' }}>
                          {item.id}
                        </span>
                        <span
                          className={`badge ${
                            item.status === 'damaged'
                              ? 'badge-warning'
                              : item.status === 'lost'
                              ? 'badge-danger'
                              : item.status === 'issued'
                              ? 'badge-info'
                              : 'badge-success'
                          }`}
                        >
                          {item.status.toUpperCase()}
                        </span>
                      </div>

                      {item.notes && (
                        <div className="text-xs text-muted" style={{ marginTop: '0.35rem' }}>
                          {item.notes}
                        </div>
                      )}

                      <div style={{ marginTop: '0.5rem', textAlign: 'right' }}>
                        <button
                          type="button"
                          className="btn-link text-xs"
                          onClick={() => {
                            setIsInspectModalOpen(false);
                            openStatusModal(activeComponent, item.id);
                          }}
                        >
                          Change Status
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-muted" style={{ padding: '2rem', textAlign: 'center', gridColumn: '1/-1' }}>
                    No individual physical tags registered.
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setIsInspectModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== ADD COMPONENT MODAL ==================== */}
      {isAddModalOpen && (
        <div className="modal-overlay" onClick={() => setIsAddModalOpen(false)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveAdd}>
              <div className="modal-header">
                <h3 className="modal-title">Add Electronic Component</h3>
                <button type="button" className="btn-icon" onClick={() => setIsAddModalOpen(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body">
                {modalError && (
                  <div
                    style={{
                      background: '#fee2e2',
                      border: '1px solid #f87171',
                      color: '#991b1b',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '1rem',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Component Name *</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. ESP32-WROOM-32"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Component Number / Tag (Unique)</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. COMP-ESP-001 (Unique)"
                      value={formData.componentNumber}
                      onChange={(e) => setFormData({ ...formData, componentNumber: e.target.value })}
                    />
                    <span className="input-hint">Checked for duplicate collisions</span>
                  </div>
                </div>

                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Category *</label>
                    <select
                      className="select-field"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    >
                      {COMPONENT_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="input-label">Family / Sub-Category (Hierarchy)</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. ESP32 Family / Ultrasonic / Actuators"
                      value={formData.parentCategory}
                      onChange={(e) => setFormData({ ...formData, parentCategory: e.target.value })}
                    />
                  </div>
                </div>

                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Total Quantity *</label>
                    <input
                      type="number"
                      min={1}
                      className="input-field"
                      value={formData.totalQuantity}
                      onChange={(e) => setFormData({ ...formData, totalQuantity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Minimum Low-Stock Threshold</label>
                    <input
                      type="number"
                      min={0}
                      className="input-field"
                      value={formData.lowStockThreshold}
                      onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                    />
                  </div>
                </div>

                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Physical Storage Location</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Shelf A-3, Cabinet 2, Box 5"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Default Loan Period (Days)</label>
                    <input
                      type="number"
                      min={1}
                      className="input-field"
                      value={formData.defaultOverdueDays}
                      onChange={(e) => setFormData({ ...formData, defaultOverdueDays: Number(e.target.value) || 7 })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="input-label">Description / Technical Notes</label>
                  <textarea
                    className="input-field"
                    rows={2}
                    placeholder="Pinout information, voltage rating, special handling instructions..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Component
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== EDIT COMPONENT MODAL ==================== */}
      {isEditModalOpen && activeComponent && (
        <div className="modal-overlay" onClick={() => setIsEditModalOpen(false)}>
          <div className="modal-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveEdit}>
              <div className="modal-header">
                <h3 className="modal-title">Edit: {activeComponent.name}</h3>
                <button type="button" className="btn-icon" onClick={() => setIsEditModalOpen(false)}>
                  <X size={18} />
                </button>
              </div>

              <div className="modal-body">
                {modalError && (
                  <div
                    style={{
                      background: '#fee2e2',
                      border: '1px solid #f87171',
                      color: '#991b1b',
                      padding: '0.75rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      marginBottom: '1rem',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                    }}
                  >
                    <AlertCircle size={16} />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Component Name *</label>
                    <input
                      type="text"
                      className="input-field"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Component Number / Tag (Unique)</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. COMP-ESP-001 (Unique)"
                      value={formData.componentNumber}
                      onChange={(e) => setFormData({ ...formData, componentNumber: e.target.value })}
                    />
                    <span className="input-hint">Checked for duplicate collisions</span>
                  </div>
                </div>

                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Category *</label>
                    <select
                      className="select-field"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    >
                      {COMPONENT_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="input-label">Family / Sub-Category (Hierarchy)</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. ESP32 Family / Ultrasonic / Actuators"
                      value={formData.parentCategory}
                      onChange={(e) => setFormData({ ...formData, parentCategory: e.target.value })}
                    />
                  </div>
                </div>

                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Total Quantity *</label>
                    <input
                      type="number"
                      min={activeComponent.issuedQuantity}
                      className="input-field"
                      value={formData.totalQuantity}
                      onChange={(e) => setFormData({ ...formData, totalQuantity: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Low-Stock Alert Threshold</label>
                    <input
                      type="number"
                      min={0}
                      className="input-field"
                      value={formData.lowStockThreshold}
                      onChange={(e) => setFormData({ ...formData, lowStockThreshold: e.target.value })}
                    />
                  </div>
                </div>

                <div className="review-grid">
                  <div className="form-group">
                    <label className="input-label">Physical Storage Location</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="e.g. Shelf A-3, Cabinet 2, Box 5"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label className="input-label">Default Loan Period (Days)</label>
                    <input
                      type="number"
                      min={1}
                      className="input-field"
                      value={formData.defaultOverdueDays}
                      onChange={(e) => setFormData({ ...formData, defaultOverdueDays: Number(e.target.value) || 7 })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="input-label">Description / Technical Notes</label>
                  <textarea
                    className="input-field"
                    rows={2}
                    placeholder="Pinout information, voltage rating, special handling instructions..."
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Update Component
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
