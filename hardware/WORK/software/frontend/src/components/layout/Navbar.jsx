import React, { useState, useEffect } from 'react';
import {
  Menu,
  AlertTriangle,
  PackageCheck,
  LogOut,
  Sliders,
  Layers,
  Users,
  Shield,
  User,
  Sparkles,
  ScanLine,
  Mic,
  GraduationCap,
  CheckCircle,
} from 'lucide-react';
import { toggleStaffPresence, getStaffActivePresence } from '../../db/database';

export default function Navbar({
  stats,
  currentUser,
  onToggleSidebar,
  onLogout,
  mainTab = 'management',
  setMainTab,
  activeTab,
  setActiveTab,
  onOpenBarcodeScanner,
  onOpenVoiceSearch,
}) {
  const overdueCount = stats?.overdueItemsCount || 0;
  const activeCount = stats?.activeTransactionsCount || 0;
  const insideCount = stats?.studentsInsideCount || 0;

  const isStudent = currentUser?.role === 'student';
  const isSir = currentUser?.role === 'sir';
  const isAdminOrSubstitute =
    currentUser?.role === 'admin' ||
    currentUser?.role === 'substitute_admin' ||
    currentUser?.role === 'sir' ||
    !currentUser?.role;

  const [staffInside, setStaffInside] = useState(false);

  useEffect(() => {
    if ((currentUser?.role === 'sir' || currentUser?.role === 'admin') && currentUser) {
      const active = getStaffActivePresence(currentUser.email);
      setStaffInside(Boolean(active));
    }
  }, [currentUser]);

  async function handleToggleStaffPresence() {
    try {
      const res = await toggleStaffPresence(currentUser);
      setStaffInside(res.isInside);
    } catch (err) {
      console.error('Staff presence toggle failed:', err);
    }
  }

  return (
    <header className="navbar">
      <div className="navbar-brand">
        <button
          type="button"
          className="btn-icon mobile-menu-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle menu"
          style={{ display: 'none' }}
        >
          <Menu size={22} />
        </button>
        <div
          style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
            color: '#fbbf24',
            fontWeight: 900,
            fontSize: '0.82rem',
            padding: '0.35rem 0.6rem',
            borderRadius: 'var(--radius-md)',
            letterSpacing: '0.5px',
            boxShadow: '0 2px 4px rgba(30, 58, 138, 0.25)',
            border: '1px solid rgba(251, 191, 36, 0.4)',
          }}
        >
          VRSEC
        </div>
        <div>
          <h1 className="navbar-title">VRSEC Incubation Centre</h1>
          <p className="navbar-subtitle">Smart Lab Management System • Dept of ECE</p>
        </div>
      </div>

      {/* TWO MAIN APPLICATION TABS SWITCHER */}
      <div className="main-tab-nav">
        <button
          type="button"
          className={`main-tab-pill ${mainTab === 'control' ? 'active' : ''}`}
          onClick={() => {
            if (setMainTab) setMainTab('control');
          }}
          title="Tab 1: Lab Environmental & Device Controls"
        >
          <Sliders size={16} />
          <span>Tab 1: Control</span>
        </button>

        <button
          type="button"
          className={`main-tab-pill ${mainTab === 'management' ? 'active' : ''}`}
          onClick={() => {
            if (setMainTab) setMainTab('management');
          }}
          title={isStudent ? 'Tab 2: My Personal Records & Portal' : 'Tab 2: Components & Lab Administration'}
        >
          <Layers size={16} />
          <span>{isStudent ? 'Tab 2: Student Portal' : 'Tab 2: Components / Lab Management'}</span>
        </button>
      </div>

      <div className="navbar-actions">
        {/* Global Voice Search Button */}
        {onOpenVoiceSearch && (
          <button
            type="button"
            className="navbar-stat-pill"
            style={{
              background: '#f5f3ff',
              color: '#6d28d9',
              border: '1px solid #ddd6fe',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            onClick={onOpenVoiceSearch}
            title="Global Voice & Text Search across Students, Projects, Components & Domains"
          >
            <Mic size={15} />
            <span>Voice Search</span>
          </button>
        )}

        {/* Sir / Staff "I'm Inside Lab" One-Click Toggle */}
        {(currentUser?.role === 'sir' || currentUser?.role === 'admin') && (
          <button
            type="button"
            className="navbar-stat-pill"
            style={{
              background: staffInside ? '#ecfdf5' : '#f8fafc',
              color: staffInside ? '#065f46' : 'var(--neutral-700)',
              border: `1px solid ${staffInside ? '#10b981' : 'var(--neutral-300)'}`,
              cursor: 'pointer',
              fontWeight: 700,
            }}
            onClick={handleToggleStaffPresence}
            title={staffInside ? "Click to record your Lab Exit" : "Click to record your Lab Entry without barcode"}
          >
            {staffInside ? (
              <>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', display: 'inline-block' }} />
                <span>Sir Inside (Exit)</span>
              </>
            ) : (
              <>
                <GraduationCap size={15} className="text-primary" />
                <span>I'm Inside Lab</span>
              </>
            )}
          </button>
        )}

        {/* Students Inside Lab Live Badge */}
        {isAdminOrSubstitute && (
          <button
            type="button"
            className="navbar-stat-pill"
            style={{
              background: insideCount > 0 ? '#ecfdf5' : 'var(--neutral-100)',
              color: insideCount > 0 ? '#065f46' : 'var(--neutral-600)',
              border: `1px solid ${insideCount > 0 ? '#a7f3d0' : 'var(--neutral-200)'}`,
            }}
            onClick={() => {
              if (setMainTab) setMainTab('management');
              if (setActiveTab) setActiveTab('students_inside');
            }}
            title="View Students Currently Inside the Lab"
          >
            <Users size={15} />
            <span>{insideCount} Inside Lab</span>
          </button>
        )}

        {/* Scan Student ID Barcode Button */}
        {isAdminOrSubstitute && onOpenBarcodeScanner && (
          <button
            type="button"
            className="navbar-stat-pill"
            style={{
              background: '#eff6ff',
              color: '#1d4ed8',
              border: '1px solid #bfdbfe',
              cursor: 'pointer',
              fontWeight: 600,
            }}
            onClick={onOpenBarcodeScanner}
            title="Scan Student ID Card Barcode / QR Code"
          >
            <ScanLine size={15} />
            <span>Scan ID Card</span>
          </button>
        )}

        {/* Active Issues Counter (Admin/Sub-Admin) */}
        {isAdminOrSubstitute && (
          <button
            type="button"
            className="navbar-stat-pill pill-active"
            onClick={() => {
              if (setMainTab) setMainTab('management');
              if (setActiveTab) setActiveTab('transactions');
            }}
            title="View Active Transactions"
          >
            <PackageCheck size={16} />
            <span>{activeCount} Active</span>
          </button>
        )}

        {/* Overdue Alert Pill (Admin/Sub-Admin) */}
        {isAdminOrSubstitute && (
          overdueCount > 0 ? (
            <button
              type="button"
              className="navbar-stat-pill pill-overdue"
              onClick={() => {
                if (setMainTab) setMainTab('management');
                if (setActiveTab) setActiveTab('overdue');
              }}
              title="View Overdue Items"
            >
              <AlertTriangle size={16} />
              <span>{overdueCount} Overdue</span>
            </button>
          ) : (
            <div
              className="navbar-stat-pill"
              style={{
                background: 'var(--success-light)',
                color: 'var(--success-text)',
                border: '1px solid var(--success-border)',
              }}
            >
              <span>✓ No Overdues</span>
            </div>
          )
        )}

        {/* User Role Badge */}
        <div
          className="user-role-badge"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.3rem 0.65rem',
            borderRadius: 999,
            fontSize: '0.78rem',
            fontWeight: 700,
            background:
              currentUser?.role === 'admin'
                ? '#e0e7ff'
                : currentUser?.role === 'sir'
                ? '#dcfce7'
                : currentUser?.role === 'substitute_admin'
                ? '#e0f2fe'
                : '#f1f5f9',
            color:
              currentUser?.role === 'admin'
                ? '#3730a3'
                : currentUser?.role === 'sir'
                ? '#15803d'
                : currentUser?.role === 'substitute_admin'
                ? '#0369a1'
                : '#334155',
            border: '1px solid rgba(0,0,0,0.08)',
          }}
          title={`Logged in as ${currentUser?.name || 'User'} (${currentUser?.role || 'Admin'})`}
        >
          {currentUser?.role === 'admin' ? (
            <Shield size={14} className="text-primary" />
          ) : currentUser?.role === 'sir' ? (
            <GraduationCap size={14} style={{ color: '#16a34a' }} />
          ) : currentUser?.role === 'substitute_admin' ? (
            <Sparkles size={14} style={{ color: '#0284c7' }} />
          ) : (
            <User size={14} />
          )}
          <span>
            {currentUser?.role === 'admin'
              ? 'Admin'
              : currentUser?.role === 'sir'
              ? 'Faculty / Sir'
              : currentUser?.role === 'substitute_admin'
              ? 'Substitute Admin'
              : currentUser?.rollNumber || 'Student'}
          </span>
        </div>

        {/* Logout Button */}
        <button
          type="button"
          className="btn-icon"
          onClick={onLogout}
          title="Sign Out"
          style={{ marginLeft: '0.35rem' }}
        >
          <LogOut size={18} />
        </button>
      </div>

      <style>{`
        .main-tab-nav {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          background: var(--neutral-100);
          padding: 0.25rem;
          border-radius: var(--radius-lg);
          border: 1px solid var(--neutral-200);
        }
        .main-tab-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.4rem 0.85rem;
          border-radius: var(--radius-md);
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--neutral-600);
          background: transparent;
          border: none;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .main-tab-pill:hover {
          color: var(--neutral-900);
        }
        .main-tab-pill.active {
          background: #ffffff;
          color: var(--primary);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
        @media (max-width: 900px) {
          .mobile-menu-btn {
            display: inline-flex !important;
          }
          .navbar-subtitle {
            display: none;
          }
          .main-tab-nav {
            margin: 0 auto;
          }
          .main-tab-pill span {
            display: none;
          }
        }
      `}</style>
    </header>
  );
}
