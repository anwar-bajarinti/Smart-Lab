// src/pages/events/AchievementsEvents.jsx
// Permanent Achievements, Active Lab Announcements (2-3 day expiry), and Innovation Day History

import React, { useState, useEffect } from 'react';
import {
  Trophy,
  Award,
  Megaphone,
  Calendar,
  Plus,
  Clock,
  CheckCircle2,
  DollarSign,
  Sparkles,
  Users,
  ChevronRight,
} from 'lucide-react';
import {
  getAchievements,
  createAchievement,
  getActiveAnnouncements,
  getAnnouncements,
  createAnnouncement,
  getEvents,
  createEvent,
  subscribeToDb,
} from '../../db/database';

export default function AchievementsEvents({ currentUser, onToast }) {
  const [activeTab, setActiveTab] = useState('achievements'); // 'achievements', 'announcements', 'events'
  const [achievements, setAchievements] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [events, setEvents] = useState([]);

  // Modals
  const [isAchievementModalOpen, setIsAchievementModalOpen] = useState(false);
  const [isAnnouncementModalOpen, setIsAnnouncementModalOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  // Form states
  const [achTitle, setAchTitle] = useState('');
  const [achDesc, setAchDesc] = useState('');
  const [achRoll, setAchRoll] = useState('');
  const [achName, setAchName] = useState('');
  const [achPrize, setAchPrize] = useState(10000);

  const [annTitle, setAnnTitle] = useState('');
  const [annMsg, setAnnMsg] = useState('');
  const [annCategory, setAnnCategory] = useState('General Notice');
  const [annDuration, setAnnDuration] = useState(3);

  const [evtTitle, setEvtTitle] = useState('');
  const [evtTheme, setEvtTheme] = useState('');
  const [evtDate, setEvtDate] = useState('');
  const [evtPrizes, setEvtPrizes] = useState('₹1,00,000');
  const [evtIsInnovation, setEvtIsInnovation] = useState(true);
  const [evtDesc, setEvtDesc] = useState('');

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
    setAchievements(getAchievements());
    setAnnouncements(getAnnouncements());
    setEvents(getEvents());
  }

  async function handleCreateAchievementSubmit(e) {
    e.preventDefault();
    try {
      await createAchievement(
        {
          title: achTitle,
          description: achDesc,
          awardedToRoll: achRoll,
          studentName: achName || achRoll,
          prizeMoney: Number(achPrize) || 0,
          awardedBy: currentUser?.name || 'Dr. K. Venkatesh (Lab Incharge / Sir)',
        },
        currentUser
      );
      onToast(`Permanent achievement awarded to ${achRoll}!`);
      setIsAchievementModalOpen(false);
      setAchTitle('');
      setAchDesc('');
      setAchRoll('');
      setAchName('');
      loadData();
    } catch (err) {
      onToast(`Error awarding achievement: ${err.message}`);
    }
  }

  async function handleCreateAnnouncementSubmit(e) {
    e.preventDefault();
    try {
      await createAnnouncement(
        {
          title: annTitle,
          message: annMsg,
          category: annCategory,
          durationDays: Number(annDuration) || 3,
        },
        currentUser
      );
      onToast('Announcement posted with automatic expiration!');
      setIsAnnouncementModalOpen(false);
      setAnnTitle('');
      setAnnMsg('');
      loadData();
    } catch (err) {
      onToast(`Error posting announcement: ${err.message}`);
    }
  }

  async function handleCreateEventSubmit(e) {
    e.preventDefault();
    try {
      await createEvent(
        {
          title: evtTitle,
          theme: evtTheme,
          eventDate: evtDate,
          prizes: evtPrizes,
          isInnovationDay: evtIsInnovation,
          description: evtDesc,
        },
        currentUser
      );
      onToast('Innovation event created!');
      setIsEventModalOpen(false);
      setEvtTitle('');
      setEvtTheme('');
      setEvtDate('');
      loadData();
    } catch (err) {
      onToast(`Error creating event: ${err.message}`);
    }
  }

  const activeAnnouncements = getActiveAnnouncements();

  return (
    <div className="page-container" style={{ padding: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div className="flex-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Achievements, Announcements & Innovation Day
          </h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Permanent national hackathon honors, lab notices, and historical VRSEC Innovation Day records.
          </p>
        </div>

        {isSirOrAdmin && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsAnnouncementModalOpen(true)}
            >
              <Megaphone size={16} /> Post Notice
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setIsAchievementModalOpen(true)}
            >
              <Award size={16} /> Award Achievement
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--neutral-200)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={`btn ${activeTab === 'achievements' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('achievements')}
        >
          <Trophy size={14} style={{ marginRight: '4px' }} />
          Permanent Achievements ({achievements.length})
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'announcements' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('announcements')}
        >
          <Megaphone size={14} style={{ marginRight: '4px' }} />
          Active Announcements ({activeAnnouncements.length})
        </button>
        <button
          type="button"
          className={`btn ${activeTab === 'events' ? 'btn-primary' : 'btn-secondary'} btn-sm`}
          onClick={() => setActiveTab('events')}
        >
          <Calendar size={14} style={{ marginRight: '4px' }} />
          Innovation Day History ({events.length})
        </button>
      </div>

      {/* TAB 1: PERMANENT ACHIEVEMENTS */}
      {activeTab === 'achievements' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {achievements.map((ach) => (
            <div
              key={ach.id}
              className="card"
              style={{
                padding: '1.5rem',
                background: 'linear-gradient(135deg, #ffffff 0%, #fdfbf7 100%)',
                border: '1px solid #fef3c7',
                boxShadow: 'var(--shadow-md)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '-10px',
                  right: '-10px',
                  width: 60,
                  height: 60,
                  background: 'rgba(245, 158, 11, 0.1)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Trophy size={28} style={{ color: '#d97706' }} />
              </div>

              <div style={{ marginBottom: '0.75rem' }}>
                <span
                  style={{
                    background: '#fef3c7',
                    color: '#92400e',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    padding: '0.2rem 0.6rem',
                    borderRadius: 999,
                    border: '1px solid #fde68a',
                  }}
                >
                  PERMANENT RECORD
                </span>
              </div>

              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--neutral-900)', marginBottom: '0.35rem' }}>
                {ach.title}
              </h3>

              <p style={{ fontSize: '0.85rem', color: 'var(--neutral-600)', lineHeight: '1.45', marginBottom: '1rem' }}>
                {ach.description}
              </p>

              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--neutral-200)',
                  borderRadius: 'var(--radius-md)',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                }}
              >
                <div className="flex-between" style={{ marginBottom: '0.35rem' }}>
                  <span className="text-xs text-muted">Awarded To:</span>
                  <strong style={{ fontSize: '0.88rem' }}>{ach.studentName} ({ach.awardedToRoll})</strong>
                </div>

                {ach.prizeMoney > 0 && (
                  <div className="flex-between" style={{ marginBottom: '0.35rem' }}>
                    <span className="text-xs text-muted">Prize Money:</span>
                    <strong style={{ fontSize: '0.95rem', color: '#16a34a' }}>
                      ₹{ach.prizeMoney.toLocaleString('en-IN')}
                    </strong>
                  </div>
                )}

                <div className="flex-between">
                  <span className="text-xs text-muted">Awarded By:</span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{ach.awardedBy}</span>
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', color: 'var(--neutral-400)', textAlign: 'right' }}>
                Award Date: {new Date(ach.dateAwarded).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* TAB 2: ACTIVE ANNOUNCEMENTS */}
      {activeTab === 'announcements' && (
        <div>
          {activeAnnouncements.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
              <Megaphone size={36} style={{ opacity: 0.3, margin: '0 auto 0.75rem' }} />
              <h4 style={{ fontSize: '1.1rem', fontWeight: 700 }}>No active notices</h4>
              <p className="text-muted text-sm">All recent announcements have naturally expired.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {activeAnnouncements.map((ann) => {
                const diffMs = new Date(ann.expiresAt).getTime() - Date.now();
                const daysRemaining = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));

                return (
                  <div
                    key={ann.id}
                    className="card"
                    style={{
                      padding: '1.25rem 1.5rem',
                      borderLeft: '4px solid var(--primary)',
                      background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
                    }}
                  >
                    <div className="flex-between" style={{ marginBottom: '0.45rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="badge badge-primary">{ann.category}</span>
                        <span style={{ fontSize: '0.75rem', color: '#b45309', fontWeight: 600 }}>
                          ⏱ Expires in {daysRemaining} day{daysRemaining === 1 ? '' : 's'}
                        </span>
                      </div>
                      <span className="text-xs text-muted">{new Date(ann.createdAt).toLocaleDateString()}</span>
                    </div>

                    <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--neutral-900)', marginBottom: '0.35rem' }}>
                      {ann.title}
                    </h3>
                    <p style={{ fontSize: '0.88rem', color: 'var(--neutral-700)', lineHeight: '1.45', margin: '0.45rem 0' }}>
                      {ann.message}
                    </p>

                    <div style={{ fontSize: '0.78rem', color: 'var(--neutral-500)', marginTop: '0.5rem' }}>
                      Posted by: <strong>{ann.createdBy}</strong>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: INNOVATION DAY & EVENTS */}
      {activeTab === 'events' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {isSirOrAdmin && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setIsEventModalOpen(true)}
              >
                <Plus size={16} /> Add Innovation Day Event
              </button>
            </div>
          )}

          {events.map((evt) => (
            <div
              key={evt.id}
              className="card"
              style={{
                padding: '1.5rem',
                borderLeft: evt.isInnovationDay ? '4px solid #f59e0b' : '4px solid var(--primary)',
              }}
            >
              <div className="flex-between" style={{ marginBottom: '0.5rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <span className={`badge ${evt.isInnovationDay ? 'badge-warning' : 'badge-primary'}`}>
                      {evt.isInnovationDay ? 'VRSEC Innovation Day' : 'Centre Event'}
                    </span>
                    <span className="font-mono text-xs text-muted">Year {evt.year}</span>
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
                    {evt.title}
                  </h3>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#16a34a' }}>
                    Prizes: {evt.prizes}
                  </div>
                  <div className="text-xs text-muted">{new Date(evt.eventDate).toLocaleDateString()}</div>
                </div>
              </div>

              {evt.theme && (
                <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--primary)', marginBottom: '0.5rem' }}>
                  Theme: "{evt.theme}"
                </div>
              )}

              <p style={{ fontSize: '0.85rem', color: 'var(--neutral-600)', lineHeight: '1.45', marginBottom: '1rem' }}>
                {evt.description}
              </p>

              {/* Winners Table */}
              {evt.winners && evt.winners.length > 0 && (
                <div style={{ background: '#f8fafc', padding: '0.85rem 1rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--neutral-200)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--neutral-500)', marginBottom: '0.5rem' }}>
                    Honored Winners & Projects
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {evt.winners.map((w, idx) => (
                      <div key={idx} className="flex-between text-xs">
                        <span>
                          <strong>{w.rank}:</strong> {w.team} — <em>{w.project}</em>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AWARD ACHIEVEMENT MODAL */}
      {isAchievementModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setIsAchievementModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Trophy size={22} className="text-primary" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Award Permanent Achievement</h3>
              </div>
            </div>

            <form onSubmit={handleCreateAchievementSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="achTitle">Achievement / Honor Title *</label>
                <input
                  id="achTitle"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Smart India Hackathon 2026 Winner"
                  value={achTitle}
                  onChange={(e) => setAchTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="achRoll">Student Roll No. *</label>
                  <input
                    id="achRoll"
                    type="text"
                    className="input-field"
                    placeholder="e.g. 238W1A0477"
                    value={achRoll}
                    onChange={(e) => setAchRoll(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="input-label" htmlFor="achName">Student Full Name</label>
                  <input
                    id="achName"
                    type="text"
                    className="input-field"
                    placeholder="e.g. Anwar Bajarinti"
                    value={achName}
                    onChange={(e) => setAchName(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="achPrize">Prize Money (₹)</label>
                <input
                  id="achPrize"
                  type="number"
                  className="input-field"
                  value={achPrize}
                  onChange={(e) => setAchPrize(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="input-label" htmlFor="achDesc">Citation / Description</label>
                <textarea
                  id="achDesc"
                  className="input-field"
                  rows={3}
                  placeholder="Details of the innovation, problem statement solved, and honor awarded..."
                  value={achDesc}
                  onChange={(e) => setAchDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAchievementModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Award Permanent Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POST ANNOUNCEMENT MODAL */}
      {isAnnouncementModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setIsAnnouncementModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Megaphone size={22} className="text-primary" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Post Lab Announcement</h3>
              </div>
            </div>

            <form onSubmit={handleCreateAnnouncementSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="annTitle">Notice Title *</label>
                <input
                  id="annTitle"
                  type="text"
                  className="input-field"
                  placeholder="e.g. Prototype Submissions Open"
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="annCategory">Category</label>
                  <select
                    id="annCategory"
                    className="input-field"
                    value={annCategory}
                    onChange={(e) => setAnnCategory(e.target.value)}
                  >
                    <option value="General Notice">General Notice</option>
                    <option value="Innovation Day">Innovation Day</option>
                    <option value="Component Restock">Component Restock</option>
                    <option value="Workshop / Hackathon">Workshop / Hackathon</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="input-label" htmlFor="annDuration">Auto-Expire In (Days)</label>
                  <select
                    id="annDuration"
                    className="input-field"
                    value={annDuration}
                    onChange={(e) => setAnnDuration(Number(e.target.value))}
                  >
                    <option value={1}>1 Day</option>
                    <option value={2}>2 Days</option>
                    <option value={3}>3 Days (Recommended)</option>
                    <option value={5}>5 Days</option>
                    <option value={7}>7 Days</option>
                  </select>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="input-label" htmlFor="annMsg">Notice Message *</label>
                <textarea
                  id="annMsg"
                  className="input-field"
                  rows={4}
                  placeholder="Detailed text for student researchers and visitors..."
                  value={annMsg}
                  onChange={(e) => setAnnMsg(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsAnnouncementModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Publish Notice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE EVENT MODAL */}
      {isEventModalOpen && (
        <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={() => setIsEventModalOpen(false)}>
          <div className="modal-content" style={{ maxWidth: '520px', width: '100%' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Calendar size={22} className="text-primary" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Create Innovation Day / Event</h3>
              </div>
            </div>

            <form onSubmit={handleCreateEventSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="evtTitle">Event Title *</label>
                <input
                  id="evtTitle"
                  type="text"
                  className="input-field"
                  placeholder="e.g. VRSEC Innovation Day 2026"
                  value={evtTitle}
                  onChange={(e) => setEvtTitle(e.target.value)}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label className="input-label" htmlFor="evtTheme">Theme</label>
                <input
                  id="evtTheme"
                  type="text"
                  className="input-field"
                  placeholder="e.g. AI-Driven IoT & Edge Hardware"
                  value={evtTheme}
                  onChange={(e) => setEvtTheme(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div className="form-group">
                  <label className="input-label" htmlFor="evtDate">Date *</label>
                  <input
                    id="evtDate"
                    type="date"
                    className="input-field"
                    value={evtDate}
                    onChange={(e) => setEvtDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="input-label" htmlFor="evtPrizes">Prize Pool</label>
                  <input
                    id="evtPrizes"
                    type="text"
                    className="input-field"
                    value={evtPrizes}
                    onChange={(e) => setEvtPrizes(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label className="input-label" htmlFor="evtDesc">Description</label>
                <textarea
                  id="evtDesc"
                  className="input-field"
                  rows={3}
                  value={evtDesc}
                  onChange={(e) => setEvtDesc(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsEventModalOpen(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Save Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
