// src/pages/projects/Projects.jsx
// Incubation Centre Projects & Research Showcase
// Features: Domain filtering, Team management, GitHub/LinkedIn links, Prototype readiness,
// Strict official project title protection for Sir/Admin with student title change request approval workflow,
// and ECE Research & Projects dynamic statistics.

import React, { useState, useEffect } from 'react';
import {
  FolderGit2,
  Plus,
  Search,
  ExternalLink,
  Cpu,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldCheck,
  TrendingUp,
  Award,
  BookOpen,
  DollarSign,
  Tag,
  Sparkles,
} from 'lucide-react';

function GithubIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function LinkedinIcon({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}
import {
  getProjects,
  createProject,
  updateProject,
  approveProjectTitleChange,
  getDomains,
  getEceResearchStats,
  subscribeToDb,
} from '../../db/database';

export default function Projects({ currentUser, onToast }) {
  const [projects, setProjects] = useState([]);
  const [domains, setDomains] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('all');

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [activeProjectModal, setActiveProjectModal] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editObjectives, setEditObjectives] = useState('');
  const [editDomain, setEditDomain] = useState('');
  const [editGithub, setEditGithub] = useState('');
  const [editLinkedin, setEditLinkedin] = useState('');
  const [editBudget, setEditBudget] = useState(0);
  const [editPrototype, setEditPrototype] = useState(false);
  const [editStatus, setEditStatus] = useState('active');

  // New project form state
  const [newTitle, setNewTitle] = useState('');
  const [newLeaderRoll, setNewLeaderRoll] = useState(currentUser?.rollNumber || '');
  const [newDomain, setNewDomain] = useState('');
  const [newObjectives, setNewObjectives] = useState('');
  const [newGithub, setNewGithub] = useState('');
  const [newLinkedin, setNewLinkedin] = useState('');
  const [newBudget, setNewBudget] = useState(10000);
  const [newPrototype, setNewPrototype] = useState(false);
  const [newMembersText, setNewMembersText] = useState('');

  const isSirOrAdmin =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'sir' ||
    currentUser?.role === 'substitute_admin';

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, []);

  function loadData() {
    setProjects(getProjects());
    setDomains(getDomains());
    setStats(getEceResearchStats());
  }

  function handleOpenProject(p) {
    setActiveProjectModal(p);
    setEditTitle(p.title);
    setEditObjectives(p.objectives || '');
    setEditDomain(p.domain || (domains[0] || 'IoT & Embedded Systems'));
    setEditGithub(p.githubLink || '');
    setEditLinkedin(p.linkedinLink || '');
    setEditBudget(p.budget || 0);
    setEditPrototype(Boolean(p.prototypeAvailable));
    setEditStatus(p.status || 'active');
  }

  async function handleSaveProjectUpdates(e) {
    e.preventDefault();
    if (!activeProjectModal) return;

    try {
      const updates = {
        title: editTitle,
        objectives: editObjectives,
        domain: editDomain,
        githubLink: editGithub,
        linkedinLink: editLinkedin,
        budget: Number(editBudget) || 0,
        prototypeAvailable: editPrototype,
        status: editStatus,
      };

      const res = await updateProject(activeProjectModal.id, updates, currentUser);
      if (res.titleLocked) {
        onToast(res.message);
      } else {
        onToast(`Project "${res.project.title}" updated successfully.`);
      }
      setActiveProjectModal(null);
      loadData();
    } catch (err) {
      onToast(`Update failed: ${err.message}`);
    }
  }

  async function handleApproveTitle(projectId, approve) {
    try {
      const updated = await approveProjectTitleChange(projectId, approve, currentUser);
      onToast(approve ? `Approved new title: "${updated.title}"` : 'Title change request rejected.');
      loadData();
      if (activeProjectModal && activeProjectModal.id === projectId) {
        setActiveProjectModal(updated);
      }
    } catch (err) {
      onToast(`Approval failed: ${err.message}`);
    }
  }

  async function handleCreateProjectSubmit(e) {
    e.preventDefault();
    try {
      const members = newMembersText
        ? newMembersText.split(',').map((m) => {
            const trimmed = m.trim();
            return { rollNumber: trimmed, name: trimmed, role: 'Member' };
          })
        : [{ rollNumber: newLeaderRoll.trim().toUpperCase(), name: currentUser?.name || newLeaderRoll, role: 'Team Lead' }];

      const payload = {
        title: newTitle,
        leaderRoll: newLeaderRoll,
        domain: newDomain || domains[0] || 'IoT & Embedded Systems',
        objectives: newObjectives,
        githubLink: newGithub,
        linkedinLink: newLinkedin,
        budget: Number(newBudget) || 0,
        prototypeAvailable: newPrototype,
        members,
      };

      const created = await createProject(payload, currentUser);
      onToast(`Project "${created.title}" created successfully!`);
      setIsCreateModalOpen(false);
      setNewTitle('');
      setNewObjectives('');
      setNewGithub('');
      setNewLinkedin('');
      setNewMembersText('');
      loadData();
    } catch (err) {
      onToast(`Creation error: ${err.message}`);
    }
  }

  const filteredProjects = projects.filter((p) => {
    if (selectedDomain !== 'all' && p.domain !== selectedDomain) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(q);
      const matchLead = p.leaderRoll.toLowerCase().includes(q);
      const matchDomain = (p.domain || '').toLowerCase().includes(q);
      const matchMembers = (p.members || []).some(
        (m) => (m.name || '').toLowerCase().includes(q) || (m.rollNumber || '').toLowerCase().includes(q)
      );
      if (!matchTitle && !matchLead && !matchDomain && !matchMembers) return false;
    }
    return true;
  });

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            ECE Incubation Projects & Showcase
          </h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Innovations, prototypes, research repositories & multidisciplinary student engineering teams.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsCreateModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={18} />
          <span>New Project</span>
        </button>
      </div>

      {/* DYNAMIC ECE RESEARCH & PROJECTS STATS */}
      {stats && (
        <div className="stats-grid" style={{ marginBottom: '1.75rem' }}>
          <div className="stat-card stat-primary">
            <div className="stat-card-left">
              <span className="stat-label">Total Projects</span>
              <span className="stat-value">{stats.totalProjects}</span>
              <span className="stat-subtext">{stats.activeProjects} actively prototyping</span>
            </div>
            <div className="stat-icon-wrapper">
              <FolderGit2 size={24} />
            </div>
          </div>

          <div className="stat-card stat-success">
            <div className="stat-card-left">
              <span className="stat-label">Prototypes Ready</span>
              <span className="stat-value">{stats.prototypesReady}</span>
              <span className="stat-subtext">Working physical hardware</span>
            </div>
            <div className="stat-icon-wrapper">
              <Cpu size={24} />
            </div>
          </div>

          <div className="stat-card stat-warning">
            <div className="stat-card-left">
              <span className="stat-label">Prize Money Won</span>
              <span className="stat-value">₹{(stats.totalPrizeMoney || 0).toLocaleString('en-IN')}</span>
              <span className="stat-subtext">Across {stats.totalAchievements} hackathon awards</span>
            </div>
            <div className="stat-icon-wrapper">
              <Award size={24} />
            </div>
          </div>

          <div className="stat-card stat-primary">
            <div className="stat-card-left">
              <span className="stat-label">Research Publications</span>
              <span className="stat-value">{stats.totalPapers}</span>
              <span className="stat-subtext">{stats.ieeePapers} IEEE conferences / journals</span>
            </div>
            <div className="stat-icon-wrapper">
              <BookOpen size={24} />
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '1', minWidth: '240px', position: 'relative' }}>
            <Search
              size={18}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--neutral-400)',
              }}
            />
            <input
              type="text"
              className="input-field"
              placeholder="Search by project title, roll number, team member, domain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '2.5rem' }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--neutral-600)' }}>
              Domain:
            </span>
            <select
              className="input-field"
              style={{ width: 'auto', padding: '0.45rem 1rem' }}
              value={selectedDomain}
              onChange={(e) => setSelectedDomain(e.target.value)}
            >
              <option value="all">All Domains ({projects.length})</option>
              {domains.map((d, idx) => {
                const name = typeof d === 'string' ? d : d.name;
                return (
                  <option key={idx} value={name}>
                    {name}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {/* PROJECTS GRID */}
      {filteredProjects.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
          <FolderGit2 size={40} style={{ opacity: 0.3, margin: '0 auto 1rem' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>No projects found</h4>
          <p className="text-muted text-sm">
            Try adjusting your search filters or click "New Project" to register an incubation project.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {filteredProjects.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                cursor: 'pointer',
              }}
              onClick={() => handleOpenProject(p)}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--shadow-md)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'none';
                e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
              }}
            >
              <div style={{ padding: '1.25rem' }}>
                <div className="flex-between" style={{ alignItems: 'flex-start', marginBottom: '0.65rem', gap: '0.5rem' }}>
                  <span
                    style={{
                      display: 'inline-block',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '0.2rem 0.6rem',
                      borderRadius: 999,
                      border: '1px solid #bfdbfe',
                    }}
                  >
                    {p.domain}
                  </span>

                  <span
                    className={`badge ${
                      p.status === 'active'
                        ? 'badge-success'
                        : p.status === 'in_progress'
                        ? 'badge-warning'
                        : 'badge-secondary'
                    }`}
                  >
                    {p.status}
                  </span>
                </div>

                <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--neutral-900)', marginBottom: '0.45rem', lineHeight: '1.35' }}>
                  {p.title}
                </h3>

                {p.titleChangeRequest && (
                  <div
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      padding: '0.35rem 0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.75rem',
                      color: '#b45309',
                      marginBottom: '0.65rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                    }}
                  >
                    <AlertCircle size={14} />
                    <span>Title change pending approval: "{p.titleChangeRequest.requestedTitle}"</span>
                  </div>
                )}

                <p
                  style={{
                    fontSize: '0.84rem',
                    color: 'var(--neutral-600)',
                    lineHeight: '1.45',
                    marginBottom: '1rem',
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {p.objectives || 'No objectives specified.'}
                </p>

                {/* Team Members List */}
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--neutral-500)', textTransform: 'uppercase', marginBottom: '0.35rem' }}>
                    Team Members
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    <span
                      style={{
                        background: '#e0e7ff',
                        color: '#3730a3',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      ★ {p.leaderRoll}
                    </span>
                    {(p.members || [])
                      .filter((m) => (m.rollNumber || m)?.toUpperCase() !== p.leaderRoll.toUpperCase())
                      .map((m, idx) => (
                        <span
                          key={idx}
                          style={{
                            background: '#f1f5f9',
                            color: '#475569',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            padding: '0.15rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          {m.name || m.rollNumber || m}
                        </span>
                      ))}
                  </div>
                </div>
              </div>

              {/* Card Footer */}
              <div
                style={{
                  padding: '0.75rem 1.25rem',
                  background: '#f8fafc',
                  borderTop: '1px solid var(--neutral-200)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  {p.prototypeAvailable ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: '#16a34a', fontSize: '0.75rem', fontWeight: 700 }}>
                      <CheckCircle2 size={14} /> Prototype Ready
                    </span>
                  ) : (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', color: 'var(--neutral-500)', fontSize: '0.75rem' }}>
                      <Clock size={14} /> Design Phase
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {p.githubLink && (
                    <a
                      href={p.githubLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-icon"
                      style={{ padding: '4px' }}
                      title="GitHub Repository"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GithubIcon size={16} />
                    </a>
                  )}
                  {p.linkedinLink && (
                    <a
                      href={p.linkedinLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-icon"
                      style={{ padding: '4px', color: '#0284c7' }}
                      title="LinkedIn Showcase"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <LinkedinIcon size={16} />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PROJECT DETAILS & TITLE LOCK MODAL */}
      {activeProjectModal && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setActiveProjectModal(null)}>
          <div
            className="modal-content"
            style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FolderGit2 size={22} className="text-primary" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Project Details</h3>
              </div>
              <span className="badge badge-secondary">{activeProjectModal.id}</span>
            </div>

            {/* Title Approval Banner for Sir/Admin */}
            {activeProjectModal.titleChangeRequest && isSirOrAdmin && (
              <div
                style={{
                  background: '#fef3c7',
                  border: '1px solid #f59e0b',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem',
                  marginBottom: '1.25rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', color: '#92400e', fontWeight: 700, marginBottom: '0.35rem' }}>
                  <ShieldCheck size={18} />
                  <span>Student Requested Project Title Change</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#78350f', marginBottom: '0.75rem' }}>
                  Requested by <strong>{activeProjectModal.titleChangeRequest.requestedByName}</strong> ({activeProjectModal.titleChangeRequest.requestedByRoll}):
                  <div style={{ marginTop: '0.25rem', fontWeight: 700, color: '#451a03' }}>
                    "{activeProjectModal.titleChangeRequest.requestedTitle}"
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-success btn-sm"
                    onClick={() => handleApproveTitle(activeProjectModal.id, true)}
                  >
                    ✓ Approve Official Title
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleApproveTitle(activeProjectModal.id, false)}
                  >
                    ✕ Dismiss Request
                  </button>
                </div>
              </div>
            )}

            {/* Pending Notice for Student */}
            {activeProjectModal.titleChangeRequest && !isSirOrAdmin && (
              <div
                style={{
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.84rem',
                  color: '#1e40af',
                }}
              >
                <strong>Pending Faculty Review:</strong> You requested to change the title to "
                {activeProjectModal.titleChangeRequest.requestedTitle}". Sir / Admin will review and approve.
              </div>
            )}

            <form onSubmit={handleSaveProjectUpdates}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="editTitle">
                  Project Title {!isSirOrAdmin && <span style={{ color: '#d97706', fontSize: '0.75rem' }}>(Official title changes require Sir/Admin approval)</span>}
                </label>
                <input
                  id="editTitle"
                  type="text"
                  className="input-field"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="editDomain">Domain</label>
                  <select
                    id="editDomain"
                    className="input-field"
                    value={editDomain}
                    onChange={(e) => setEditDomain(e.target.value)}
                  >
                    {domains.map((d, idx) => {
                      const name = typeof d === 'string' ? d : d.name;
                      return <option key={idx} value={name}>{name}</option>;
                    })}
                  </select>
                </div>

                <div className="form-group">
                  <label className="input-label" htmlFor="editStatus">Status</label>
                  <select
                    id="editStatus"
                    className="input-field"
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                  >
                    <option value="active">Active</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="editObjectives">Project Objectives & Abstract</label>
                <textarea
                  id="editObjectives"
                  className="input-field"
                  rows={4}
                  value={editObjectives}
                  onChange={(e) => setEditObjectives(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="editGithub">GitHub Repo URL</label>
                  <input
                    id="editGithub"
                    type="url"
                    className="input-field"
                    placeholder="https://github.com/..."
                    value={editGithub}
                    onChange={(e) => setEditGithub(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="input-label" htmlFor="editLinkedin">LinkedIn Showcase URL</label>
                  <input
                    id="editLinkedin"
                    type="url"
                    className="input-field"
                    placeholder="https://linkedin.com/in/..."
                    value={editLinkedin}
                    onChange={(e) => setEditLinkedin(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="editBudget">Approved Budget (₹)</label>
                  <input
                    id="editBudget"
                    type="number"
                    className="input-field"
                    value={editBudget}
                    onChange={(e) => setEditBudget(e.target.value)}
                  />
                </div>

                <div style={{ paddingTop: '1.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editPrototype}
                      onChange={(e) => setEditPrototype(e.target.checked)}
                      style={{ width: 18, height: 18 }}
                    />
                    <strong style={{ fontSize: '0.88rem' }}>Physical Prototype Available in Lab</strong>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveProjectModal(null)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  {isSirOrAdmin ? 'Save Changes' : 'Submit Updates / Title Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE NEW PROJECT MODAL */}
      {isCreateModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setIsCreateModalOpen(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '640px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Plus size={22} className="text-primary" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Register New Incubation Project</h3>
              </div>
            </div>

            <form onSubmit={handleCreateProjectSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="newTitle">Project Title *</label>
                <input
                  id="newTitle"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Smart Lab Environmental Controller"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="newLeaderRoll">Team Lead Roll No. *</label>
                  <input
                    id="newLeaderRoll"
                    type="text"
                    className="input-field"
                    placeholder="e.g. 238W1A0477"
                    value={newLeaderRoll}
                    onChange={(e) => setNewLeaderRoll(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="input-label" htmlFor="newDomain">Domain</label>
                  <select
                    id="newDomain"
                    className="input-field"
                    value={newDomain}
                    onChange={(e) => setNewDomain(e.target.value)}
                  >
                    {domains.map((d, idx) => {
                      const name = typeof d === 'string' ? d : d.name;
                      return <option key={idx} value={name}>{name}</option>;
                    })}
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="newObjectives">Objectives & Abstract</label>
                <textarea
                  id="newObjectives"
                  className="input-field"
                  rows={3}
                  placeholder="Summarize the project aims, architecture, and expected impact..."
                  value={newObjectives}
                  onChange={(e) => setNewObjectives(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="newMembersText">Team Member Roll Numbers (Comma-separated)</label>
                <input
                  id="newMembersText"
                  type="text"
                  className="input-field"
                  placeholder="e.g. 238W1A0412, 238W1A04C2, 238W1A0445"
                  value={newMembersText}
                  onChange={(e) => setNewMembersText(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="newGithub">GitHub Repository URL</label>
                  <input
                    id="newGithub"
                    type="url"
                    className="input-field"
                    placeholder="https://github.com/vrsec/..."
                    value={newGithub}
                    onChange={(e) => setNewGithub(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="input-label" htmlFor="newLinkedin">LinkedIn Showcase URL</label>
                  <input
                    id="newLinkedin"
                    type="url"
                    className="input-field"
                    placeholder="https://linkedin.com/..."
                    value={newLinkedin}
                    onChange={(e) => setNewLinkedin(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem', alignItems: 'center' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="newBudget">Estimated Budget (₹)</label>
                  <input
                    id="newBudget"
                    type="number"
                    className="input-field"
                    value={newBudget}
                    onChange={(e) => setNewBudget(e.target.value)}
                  />
                </div>

                <div style={{ paddingTop: '1.25rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={newPrototype}
                      onChange={(e) => setNewPrototype(e.target.checked)}
                      style={{ width: 18, height: 18 }}
                    />
                    <strong style={{ fontSize: '0.88rem' }}>Prototype Already Available</strong>
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Register Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
