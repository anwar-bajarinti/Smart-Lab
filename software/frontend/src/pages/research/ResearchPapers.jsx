// src/pages/research/ResearchPapers.jsx
// Research Publications & Conference Papers Catalog
// Metadata-only storage (Zero Heavy PDF Blobs to guarantee storage protection)
// Features: Domain filter, IEEE/Journal badges, DOI links, and Public/Private toggle.

import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  ExternalLink,
  Globe,
  Lock,
  Tag,
  Users,
  Award,
} from 'lucide-react';
import {
  getResearchPapers,
  createResearchPaper,
  getDomains,
  subscribeToDb,
} from '../../db/database';

export default function ResearchPapers({ currentUser, onToast }) {
  const [papers, setPapers] = useState([]);
  const [domains, setDomains] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDomain, setSelectedDomain] = useState('all');
  const [isSubmitModalOpen, setIsSubmitModalOpen] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [authorsText, setAuthorsText] = useState(currentUser?.name || '');
  const [studentRoll, setStudentRoll] = useState(currentUser?.rollNumber || '');
  const [teamName, setTeamName] = useState('');
  const [domain, setDomain] = useState('');
  const [venue, setVenue] = useState('');
  const [paperType, setPaperType] = useState('conference');
  const [doi, setDoi] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [isPublic, setIsPublic] = useState(true);

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, []);

  function loadData() {
    setPapers(getResearchPapers());
    setDomains(getDomains());
  }

  async function handleSubmitPaper(e) {
    e.preventDefault();
    try {
      const authors = authorsText
        ? authorsText.split(',').map((a) => a.trim())
        : [currentUser?.name || 'Author'];

      await createResearchPaper(
        {
          title,
          authors,
          studentRoll,
          teamName,
          domain: domain || domains[0] || 'IoT & Embedded Systems',
          venue,
          paperType,
          doi,
          externalUrl,
          isPublic,
        },
        currentUser
      );

      onToast(`Research paper "${title}" registered successfully!`);
      setIsSubmitModalOpen(false);
      setTitle('');
      setVenue('');
      setDoi('');
      setExternalUrl('');
      loadData();
    } catch (err) {
      onToast(`Error submitting paper: ${err.message}`);
    }
  }

  const filteredPapers = papers.filter((p) => {
    if (selectedDomain !== 'all' && p.domain !== selectedDomain) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = p.title.toLowerCase().includes(q);
      const matchRoll = (p.studentRoll || '').toLowerCase().includes(q);
      const matchDomain = (p.domain || '').toLowerCase().includes(q);
      const matchVenue = (p.venue || '').toLowerCase().includes(q);
      const matchAuthors = (p.authors || []).some((a) => a.toLowerCase().includes(q));
      if (!matchTitle && !matchRoll && !matchDomain && !matchVenue && !matchAuthors) return false;
    }
    return true;
  });

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Research Papers & Conference Publications
          </h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Faculty & student peer-reviewed papers (IEEE, Springer, Elsevier, Journals) with DOI links.
          </p>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsSubmitModalOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <Plus size={18} />
          <span>Register Research Paper</span>
        </button>
      </div>

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
              placeholder="Search papers by title, author, DOI, venue, or student roll number..."
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
              <option value="all">All Domains ({papers.length})</option>
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

      {/* PAPERS LIST */}
      {filteredPapers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <BookOpen size={36} style={{ opacity: 0.3, margin: '0 auto 0.75rem' }} />
          <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>No research papers found</h4>
          <p className="text-muted text-sm">Register your IEEE, journal, or conference publication metadata above.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filteredPapers.map((p) => (
            <div
              key={p.id}
              className="card"
              style={{
                padding: '1.5rem',
                borderLeft: p.paperType === 'IEEE' ? '4px solid #1d4ed8' : '4px solid #10b981',
              }}
            >
              <div className="flex-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 800,
                        padding: '0.15rem 0.6rem',
                        borderRadius: 999,
                        background: p.paperType === 'IEEE' ? '#dbeafe' : '#dcfce7',
                        color: p.paperType === 'IEEE' ? '#1e40af' : '#15803d',
                        textTransform: 'uppercase',
                      }}
                    >
                      {p.paperType}
                    </span>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: 999,
                        background: '#f1f5f9',
                        color: '#475569',
                      }}
                    >
                      {p.domain}
                    </span>
                    {p.isPublic ? (
                      <span className="badge badge-success" style={{ fontSize: '0.68rem' }}>Public</span>
                    ) : (
                      <span className="badge badge-secondary" style={{ fontSize: '0.68rem' }}>Private</span>
                    )}
                  </div>

                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--neutral-900)', lineHeight: '1.4' }}>
                    {p.title}
                  </h3>
                </div>

                {p.externalUrl && (
                  <a
                    href={p.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary btn-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                  >
                    <span>View Publisher</span>
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>

              <div style={{ fontSize: '0.85rem', color: 'var(--neutral-600)', marginBottom: '0.75rem' }}>
                <strong>Authors:</strong> {(p.authors || []).join(', ')}
              </div>

              {p.venue && (
                <div style={{ fontSize: '0.84rem', color: 'var(--neutral-700)', marginBottom: '0.5rem' }}>
                  <strong>Venue / Conference:</strong> {p.venue}
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '0.78rem',
                  color: 'var(--neutral-500)',
                  borderTop: '1px solid var(--neutral-100)',
                  paddingTop: '0.5rem',
                  marginTop: '0.5rem',
                }}
              >
                <div>
                  {p.doi && (
                    <span>
                      DOI: <strong className="font-mono text-primary">{p.doi}</strong>
                    </span>
                  )}
                  {p.studentRoll && (
                    <span style={{ marginLeft: '1rem' }}>
                      Affiliated Student: <strong className="font-mono">{p.studentRoll}</strong>
                    </span>
                  )}
                </div>
                <span>{new Date(p.createdAt).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* REGISTER PAPER MODAL */}
      {isSubmitModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setIsSubmitModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '580px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BookOpen size={22} className="text-primary" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Register Research Paper</h3>
              </div>
            </div>

            <form onSubmit={handleSubmitPaper}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="title">Paper Title *</label>
                <input
                  id="title"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Design of Energy-Harvesting BLE Sensor Node"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="authorsText">Authors (Comma-separated) *</label>
                <input
                  id="authorsText"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Anwar Bajarinti, Dr. K. Venkatesh"
                  value={authorsText}
                  onChange={(e) => setAuthorsText(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="studentRoll">Student Roll No.</label>
                  <input
                    id="studentRoll"
                    type="text"
                    className="input-field"
                    placeholder="e.g. 238W1A0477"
                    value={studentRoll}
                    onChange={(e) => setStudentRoll(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="input-label" htmlFor="domain">Domain</label>
                  <select
                    id="domain"
                    className="input-field"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                  >
                    {domains.map((d, idx) => {
                      const name = typeof d === 'string' ? d : d.name;
                      return <option key={idx} value={name}>{name}</option>;
                    })}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="paperType">Publication Type</label>
                  <select
                    id="paperType"
                    className="input-field"
                    value={paperType}
                    onChange={(e) => setPaperType(e.target.value)}
                  >
                    <option value="IEEE">IEEE Conference / Journal</option>
                    <option value="conference">National / International Conference</option>
                    <option value="journal">Scopus / SCI Indexed Journal</option>
                    <option value="workshop">Technical Workshop</option>
                    <option value="other">Other Peer-Reviewed</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="input-label" htmlFor="doi">DOI (Digital Object Identifier)</label>
                  <input
                    id="doi"
                    type="text"
                    className="input-field"
                    placeholder="10.1109/..."
                    value={doi}
                    onChange={(e) => setDoi(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="venue">Conference / Journal Venue Name</label>
                <input
                  id="venue"
                  type="text"
                  className="input-field"
                  placeholder="e.g. IEEE ICAIOT 2026 or Springer CCIS"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="input-label" htmlFor="externalUrl">External Publisher URL</label>
                <input
                  id="externalUrl"
                  type="url"
                  className="input-field"
                  placeholder="https://ieeexplore.ieee.org/document/..."
                  value={externalUrl}
                  onChange={(e) => setExternalUrl(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                    style={{ width: 18, height: 18 }}
                  />
                  <strong style={{ fontSize: '0.88rem' }}>Make Paper Publicly Visible in Incubation Showcase</strong>
                </label>
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
                  Save Publication
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
