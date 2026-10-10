// src/components/search/VoiceSearchModal.jsx
// Web Speech API Voice Search with text input fallback & multi-index lookup
// Supports Students, Projects, Components, and Domains.

import React, { useState, useEffect, useRef } from 'react';
import {
  Mic,
  MicOff,
  Search,
  X,
  Volume2,
  Users,
  FolderGit2,
  Cpu,
  Tag,
  ArrowRight,
} from 'lucide-react';
import { executeSmartVoiceSearch } from '../../db/database';

export default function VoiceSearchModal({ isOpen, onClose, onSelectResult }) {
  const [query, setQuery] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [speechError, setSpeechError] = useState('');
  const [results, setResults] = useState({ students: [], projects: [], components: [], domains: [] });

  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechSupported(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = 'en-IN'; // Standard Indian English for student names/roll numbers

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError('');
      };

      recognition.onresult = (event) => {
        const transcript = Array.from(event.results)
          .map((res) => res[0].transcript)
          .join('');
        setQuery(transcript);
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setSpeechError('Microphone access denied. You can type in the search bar below.');
        } else if (event.error !== 'no-speech') {
          setSpeechError(`Voice recognition: ${event.error}. Use text search fallback.`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (err) {
      console.warn('Failed to initialize speech recognition:', err);
      setSpeechSupported(false);
    }
  }, []);

  // Auto-listen when modal opens if speech is supported
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSpeechError('');
      if (speechSupported && recognitionRef.current) {
        startListening();
      }
    } else {
      stopListening();
    }
  }, [isOpen, speechSupported]);

  // Execute search whenever query changes
  useEffect(() => {
    if (!query || !query.trim()) {
      setResults({ students: [], projects: [], components: [], domains: [] });
      return;
    }
    const searchRes = executeSmartVoiceSearch(query);
    setResults(searchRes);
  }, [query]);

  function startListening() {
    if (!recognitionRef.current) return;
    try {
      setSpeechError('');
      recognitionRef.current.start();
    } catch {
      // If already started or aborting
    }
  }

  function stopListening() {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore
      }
    }
    setIsListening(false);
  }

  function handleSelect(type, item) {
    if (onSelectResult) {
      onSelectResult(type, item);
    }
    onClose();
  }

  if (!isOpen) return null;

  const totalResults =
    results.students.length +
    results.projects.length +
    results.components.length +
    results.domains.length;

  return (
    <div className="modal-backdrop" style={{ zIndex: 1200 }} onClick={onClose}>
      <div
        className="modal-content"
        style={{
          maxWidth: '620px',
          width: '100%',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
          padding: 0,
          boxShadow: 'var(--shadow-xl)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header / Listening Visualizer */}
        <div
          style={{
            background: isListening
              ? 'linear-gradient(135deg, #1e3a8a 0%, #312e81 100%)'
              : 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
            color: '#ffffff',
            padding: '1.75rem 1.5rem',
            textAlign: 'center',
            position: 'relative',
            transition: 'background 0.3s ease',
          }}
        >
          <button
            type="button"
            className="btn-icon"
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            <X size={20} />
          </button>

          {/* Pulse Button */}
          <button
            type="button"
            onClick={isListening ? stopListening : startListening}
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: 'none',
              background: isListening ? '#ef4444' : 'var(--primary)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              cursor: 'pointer',
              boxShadow: isListening
                ? '0 0 0 8px rgba(239, 68, 68, 0.25), 0 0 0 16px rgba(239, 68, 68, 0.15)'
                : '0 4px 14px rgba(0,0,0,0.3)',
              transition: 'all 0.25s ease',
            }}
            title={isListening ? 'Click to pause voice' : 'Click to start voice input'}
          >
            {isListening ? <Mic size={32} /> : <MicOff size={30} />}
          </button>

          <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
            {isListening ? 'Listening for your search...' : 'Smart Voice & Text Search'}
          </h3>
          <p style={{ fontSize: '0.84rem', opacity: 0.8, marginTop: '0.35rem' }}>
            Speak or type: e.g. <span style={{ textDecoration: 'underline' }}>"Anwar"</span>,{' '}
            <span style={{ textDecoration: 'underline' }}>"238W1A0477"</span>,{' '}
            <span style={{ textDecoration: 'underline' }}>"ESP32"</span>,{' '}
            <span style={{ textDecoration: 'underline' }}>"IoT Controller"</span>
          </p>
        </div>

        {/* Input Bar */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--neutral-200)' }}>
          <div style={{ position: 'relative' }}>
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
              placeholder="Search students, roll numbers, projects, components, domains..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                paddingLeft: '2.5rem',
                paddingRight: query ? '2.5rem' : '1rem',
                fontSize: '0.95rem',
              }}
              autoFocus
            />
            {query && (
              <button
                type="button"
                className="btn-icon"
                onClick={() => setQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  padding: '4px',
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {speechError && (
            <div
              style={{
                fontSize: '0.78rem',
                color: 'var(--danger-text)',
                marginTop: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <Volume2 size={14} />
              <span>{speechError}</span>
            </div>
          )}
        </div>

        {/* Results Area */}
        <div
          style={{
            maxHeight: '380px',
            overflowY: 'auto',
            padding: '1rem 1.5rem 1.5rem',
          }}
        >
          {!query.trim() && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--neutral-500)' }}>
              <Search size={32} style={{ opacity: 0.3, margin: '0 auto 0.75rem' }} />
              <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>Start speaking or type keywords</p>
              <span className="text-xs text-muted">
                Instantly searches across Incubation Centre projects, components, students, and research domains.
              </span>
            </div>
          )}

          {query.trim() && totalResults === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--neutral-500)' }}>
              <p style={{ fontSize: '0.92rem', fontWeight: 600 }}>No results found for "{query}"</p>
              <span className="text-xs text-muted">
                Try searching with a student Roll Number, keyword like "Sensors", or project name.
              </span>
            </div>
          )}

          {/* 1. STUDENTS RESULTS */}
          {results.students.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: 'var(--neutral-500)',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Users size={14} className="text-primary" />
                <span>Students ({results.students.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {results.students.map((s) => (
                  <div
                    key={s.id || s.rollNumber}
                    onClick={() => handleSelect('student', s)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      background: '#f8fafc',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--neutral-200)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  >
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--neutral-900)' }}>{s.name}</strong>
                      <div className="font-mono text-xs text-muted">
                        Roll: {s.rollNumber} • {s.branch || 'ECE'} • Sec {s.section || 'A'}
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-primary" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. PROJECTS RESULTS */}
          {results.projects.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: 'var(--neutral-500)',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <FolderGit2 size={14} className="text-primary" />
                <span>Projects ({results.projects.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {results.projects.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => handleSelect('project', p)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      background: '#f8fafc',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--neutral-200)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  >
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--neutral-900)' }}>{p.title}</strong>
                      <div className="text-xs text-muted">
                        Domain: {p.domain} • Lead: {p.leaderRoll} {p.prototypeAvailable ? '• Prototype Ready' : ''}
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-primary" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 3. COMPONENTS RESULTS */}
          {results.components.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: 'var(--neutral-500)',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Cpu size={14} className="text-primary" />
                <span>Components & Hardware ({results.components.length})</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {results.components.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => handleSelect('component', c)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.65rem 0.85rem',
                      background: '#f8fafc',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--neutral-200)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#f8fafc')}
                  >
                    <div>
                      <strong style={{ fontSize: '0.9rem', color: 'var(--neutral-900)' }}>{c.name}</strong>
                      <div className="text-xs text-muted">
                        {c.componentNumber ? `[#${c.componentNumber}] ` : ''}
                        Category: {c.category} • Avail: {c.availableQuantity}/{c.totalQuantity} {c.location ? `• Loc: ${c.location}` : ''}
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-primary" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. DOMAINS RESULTS */}
          {results.domains.length > 0 && (
            <div>
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  color: 'var(--neutral-500)',
                  marginBottom: '0.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <Tag size={14} className="text-primary" />
                <span>Domains ({results.domains.length})</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {results.domains.map((d, idx) => {
                  const domainName = typeof d === 'string' ? d : d.name;
                  return (
                    <button
                      key={idx}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSelect('domain', domainName)}
                      style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                    >
                      {domainName}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
