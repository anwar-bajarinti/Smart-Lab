// src/pages/Login.jsx
// Role-Based Authentication (Admin, Substitute Admin, Regular Student)
// Supports username or Roll Number login with password, quick test credentials,
// and direct launch of the Biometric Entrance/Exit Station.

import React, { useState } from 'react';
import {
  Lock,
  User,
  Key,
  ShieldCheck,
  AlertCircle,
  Cpu,
  WifiOff,
  Fingerprint,
  Users,
  Shield,
} from 'lucide-react';
import { loginUser } from '../../db/database';

export default function Login({ onLogin, onOpenEntranceStation, centreName = 'Incubation Centre' }) {
  const [identifier, setIdentifier] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const user = await loginUser(identifier, password);
      onLogin(user);
    } catch (err) {
      setError(err.message || 'Login failed. Please check credentials.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleQuickFill(id, pass) {
    setIdentifier(id);
    setPassword(pass);
    setError('');
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
        padding: '1.5rem',
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '460px',
          boxShadow: 'var(--shadow-xl)',
          borderRadius: 'var(--radius-xl)',
          overflow: 'hidden',
        }}
      >
        {/* Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, var(--primary) 0%, #312e81 100%)',
            padding: '2.5rem 2rem 2rem',
            textAlign: 'center',
            color: '#ffffff',
          }}
        >
          <div
            style={{
              width: 60,
              height: 60,
              background: 'rgba(255, 255, 255, 0.15)',
              backdropFilter: 'blur(4px)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1rem',
              border: '1px solid rgba(255, 255, 255, 0.25)',
            }}
          >
            <Cpu size={32} />
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
            Incubation-CMS
          </h2>
          <p style={{ fontSize: '0.85rem', opacity: 0.85, marginTop: '0.25rem' }}>
            Component & Equipment Management System
          </p>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              background: 'rgba(16, 185, 129, 0.25)',
              border: '1px solid rgba(16, 185, 129, 0.4)',
              color: '#a7f3d0',
              padding: '0.2rem 0.65rem',
              borderRadius: 9999,
              fontSize: '0.72rem',
              fontWeight: 600,
              marginTop: '0.75rem',
            }}
          >
            <WifiOff size={12} />
            <span>100% Offline-First Lab Storage</span>
          </div>
        </div>

        {/* Login Form */}
        <div className="card-body" style={{ padding: '2rem' }}>
          {error && (
            <div className="alert alert-danger" style={{ marginBottom: '1.25rem' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="input-label" htmlFor="identifier">
                <User size={15} /> Username or Student Roll Number
              </label>
              <input
                id="identifier"
                type="text"
                className="input-field"
                placeholder="admin or Roll No. (e.g. 238W1A0477)"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="input-label" htmlFor="password">
                <Key size={15} /> Password
              </label>
              <input
                id="password"
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-lg"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={isLoading}
            >
              <ShieldCheck size={18} />
              {isLoading ? 'Signing In...' : 'Sign In to Lab System'}
            </button>
          </form>

          {/* Entrance Station Direct Button */}
          {onOpenEntranceStation && (
            <div style={{ marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}
                onClick={onOpenEntranceStation}
              >
                <Fingerprint size={18} className="text-primary" />
                <span>Launch Biometric Entrance Station</span>
              </button>
            </div>
          )}

          {/* Quick Demo Credentials */}
          <div
            style={{
              marginTop: '1.5rem',
              paddingTop: '1rem',
              borderTop: '1px solid var(--neutral-200)',
            }}
          >
            <div
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: 'var(--neutral-500)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                marginBottom: '0.5rem',
                textAlign: 'center',
              }}
            >
              Quick Test Credentials
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.72rem', padding: '0.35rem 0.25rem' }}
                onClick={() => handleQuickFill('admin', 'admin123')}
              >
                <strong>Admin</strong>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.72rem', padding: '0.35rem 0.25rem' }}
                onClick={() => handleQuickFill('subadmin', 'subadmin123')}
              >
                <strong>Sub-Admin</strong>
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.72rem', padding: '0.35rem 0.25rem' }}
                onClick={() => handleQuickFill('238W1A0477', 'student123')}
              >
                <strong>Student</strong>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
