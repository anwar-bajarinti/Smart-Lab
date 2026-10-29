// src/pages/admin/DomainsHolidays.jsx
// Incubation Domains & Working-Day Holidays Management (Sir / Admin only)
// Configures research domains and maintains holiday calendar for student streaks.

import React, { useState, useEffect } from 'react';
import {
  Globe,
  Calendar,
  Plus,
  Trash2,
  Tag,
  ShieldCheck,
  Flame,
  CheckCircle2,
} from 'lucide-react';
import {
  getDomains,
  createDomain,
  deleteDomain,
  getHolidays,
  addHoliday,
  deleteHoliday,
  getProjects,
  getResearchPapers,
  subscribeToDb,
} from '../../db/database';

export default function DomainsHolidays({ currentUser, onToast }) {
  const [activeTab, setActiveTab] = useState('domains'); // 'domains' or 'holidays'
  const [domains, setDomains] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [projects, setProjects] = useState([]);
  const [papers, setPapers] = useState([]);

  // Modals / Form state
  const [newDomainName, setNewDomainName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayType, setNewHolidayType] = useState('institute');

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, []);

  function loadData() {
    setDomains(getDomains());
    setHolidays(getHolidays());
    setProjects(getProjects());
    setPapers(getResearchPapers());
  }

  async function handleAddDomain(e) {
    e.preventDefault();
    if (!newDomainName.trim()) return;
    try {
      await createDomain(newDomainName, currentUser);
      onToast(`Domain "${newDomainName.trim()}" added successfully.`);
      setNewDomainName('');
      loadData();
    } catch (err) {
      onToast(`Error adding domain: ${err.message}`);
    }
  }

  async function handleDeleteDomain(domainName) {
    if (!confirm(`Are you sure you want to remove domain "${domainName}"?`)) return;
    try {
      await deleteDomain(domainName, currentUser);
      onToast(`Domain "${domainName}" deleted.`);
      loadData();
    } catch (err) {
      onToast(`Error deleting domain: ${err.message}`);
    }
  }

  async function handleAddHoliday(e) {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName.trim()) return;
    try {
      await addHoliday(
        { date: newHolidayDate, name: newHolidayName, type: newHolidayType },
        currentUser
      );
      onToast(`Holiday "${newHolidayName.trim()}" registered.`);
      setNewHolidayDate('');
      setNewHolidayName('');
      loadData();
    } catch (err) {
      onToast(`Error adding holiday: ${err.message}`);
    }
  }

  async function handleDeleteHoliday(holidayId) {
    try {
      await deleteHoliday(holidayId, currentUser);
      onToast('Holiday removed.');
      loadData();
    } catch (err) {
      onToast(`Error deleting holiday: ${err.message}`);
    }
  }

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Domains & Working-Day Calendar
          </h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Faculty & Admin controls for incubation research fields and streak-preserving holiday dates.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--neutral-200)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'domains' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('domains')}
        >
          <Globe size={14} style={{ marginRight: '4px' }} />
          Incubation Domains ({domains.length})
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'holidays' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('holidays')}
        >
          <Calendar size={14} style={{ marginRight: '4px' }} />
          Holidays & Streak Calendar ({holidays.length})
        </button>
      </div>

      {/* TAB 1: DOMAINS */}
      {activeTab === 'domains' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem', alignItems: 'flex-start' }}>
          {/* Domains List */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>
              Active Incubation Domains
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {domains.map((d, idx) => {
                const name = typeof d === 'string' ? d : d.name;
                const projCount = projects.filter((p) => p.domain === name).length;
                const paperCount = papers.filter((p) => p.domain === name).length;

                return (
                  <div
                    key={idx}
                    className="flex-between"
                    style={{
                      padding: '0.75rem 1rem',
                      background: '#f8fafc',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--neutral-200)',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.92rem', color: 'var(--neutral-900)' }}>{name}</strong>
                      <div className="text-xs text-muted" style={{ marginTop: '0.2rem' }}>
                        {projCount} project{projCount === 1 ? '' : 's'} • {paperCount} publication{paperCount === 1 ? '' : 's'}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-icon"
                      style={{ color: 'var(--danger-text)' }}
                      onClick={() => handleDeleteDomain(name)}
                      title="Delete Domain"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Domain Form */}
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem' }}>
              Add New Domain
            </h3>
            <p className="text-xs text-muted" style={{ marginBottom: '1rem' }}>
              Adds a research domain across projects, paper catalog, and voice search.
            </p>

            <form onSubmit={handleAddDomain}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="newDomainName">Domain Name *</label>
                <input
                  id="newDomainName"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Biomedical Instrumentation"
                  value={newDomainName}
                  onChange={(e) => setNewDomainName(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                <Plus size={16} /> Add Domain
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 2: HOLIDAYS & STREAK CALENDAR */}
      {activeTab === 'holidays' && (
        <div>
          {/* Explanation Alert */}
          <div className="alert alert-info" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Flame size={24} style={{ color: '#ea580c', flexShrink: 0 }} />
            <div>
              <strong style={{ fontSize: '0.92rem' }}>Working-Day Streak Protection Engine</strong>
              <p style={{ fontSize: '0.84rem', marginTop: '0.2rem' }}>
                All Sundays are automatically skipped. Institute and national holidays added below do <strong>NOT</strong> break student daily lab streaks.
              </p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '1.5rem', alignItems: 'flex-start' }}>
            {/* Holidays Table */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1rem' }}>
                Registered Institute & National Holidays
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {holidays.map((h) => (
                  <div
                    key={h.id || h.date}
                    className="flex-between"
                    style={{
                      padding: '0.75rem 1rem',
                      background: '#f8fafc',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--neutral-200)',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '0.92rem' }}>{h.name}</strong>
                      <div className="text-xs text-muted font-mono" style={{ marginTop: '0.2rem' }}>
                        Date: {h.date} • Type: {h.type || 'institute'}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-icon"
                      style={{ color: 'var(--danger-text)' }}
                      onClick={() => handleDeleteHoliday(h.id)}
                      title="Remove Holiday"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Add Holiday Form */}
            <div className="card" style={{ padding: '1.25rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.5rem' }}>
                Register New Holiday
              </h3>
              <p className="text-xs text-muted" style={{ marginBottom: '1rem' }}>
                Protects student working-day attendance streaks when lab is closed.
              </p>

              <form onSubmit={handleAddHoliday}>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="input-label" htmlFor="newHolidayDate">Holiday Date *</label>
                  <input
                    id="newHolidayDate"
                    type="date"
                    className="input-field"
                    value={newHolidayDate}
                    onChange={(e) => setNewHolidayDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label className="input-label" htmlFor="newHolidayName">Holiday Name / Occasion *</label>
                  <input
                    id="newHolidayName"
                    type="text"
                    className="input-field"
                    placeholder="e.g. College Tech Fest or Pongal"
                    value={newHolidayName}
                    onChange={(e) => setNewHolidayName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                  <label className="input-label" htmlFor="newHolidayType">Holiday Classification</label>
                  <select
                    id="newHolidayType"
                    className="input-field"
                    value={newHolidayType}
                    onChange={(e) => setNewHolidayType(e.target.value)}
                  >
                    <option value="institute">College / Institute Holiday</option>
                    <option value="national">National Holiday</option>
                    <option value="festival">Festival Holiday</option>
                  </select>
                </div>

                <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
                  <Plus size={16} /> Save Holiday
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
