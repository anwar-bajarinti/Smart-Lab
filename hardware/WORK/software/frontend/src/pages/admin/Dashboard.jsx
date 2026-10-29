// src/pages/Dashboard.jsx
// Main Admin Dashboard displaying system overview, inventory metrics, overdue alerts, and recent activities

import React, { useState, useEffect } from 'react';
import {
  Layers,
  CheckCircle2,
  Package,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownLeft,
  PlusCircle,
  Camera,
  ChevronRight,
  Clock,
  User,
  Tag,
  Fingerprint,
  Sliders,
  Users,
  HardDrive,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import {
  getDashboardStats,
  getDatabaseStorageStatus,
  getStudentsRetentionAudit,
  subscribeToDb,
} from '../../db/database';

export default function Dashboard({ setActiveTab, onOpenOcrModal }) {
  const [stats, setStats] = useState(null);
  const [storageStatus, setStorageStatus] = useState(getDatabaseStorageStatus());
  const [unverifiedCount, setUnverifiedCount] = useState(0);

  useEffect(() => {
    function loadStats() {
      setStats(getDashboardStats());
      setStorageStatus(getDatabaseStorageStatus());
      const audit = getStudentsRetentionAudit();
      setUnverifiedCount(audit.needsVerification.length);
    }
    loadStats();
    const unsubscribe = subscribeToDb(() => {
      loadStats();
    });
    return () => unsubscribe();
  }, []);

  if (!stats) return <div className="card-body">Loading dashboard analytics...</div>;

  const chartData = (stats.categoryBreakdown || []).map((cat) => ({
    name: cat.name.length > 12 ? `${cat.name.substring(0, 10)}..` : cat.name,
    fullName: cat.name,
    Available: cat.availableStock,
    Issued: cat.issuedStock,
  }));

  const categoryColors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#64748b'];

  return (
    <div className="dashboard-container">
      {/* Welcome & Quick Action Header */}
      <div className="flex-between" style={{ marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Admin Dashboard
          </h2>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Live component inventory & student issue/return management
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setActiveTab('control')}
            title="Tab 1: Control (Devices & Environment)"
          >
            <Sliders size={18} />
            Lab Controls
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setActiveTab('lab_entry_exit')}
            title="Biometric Entrance / Exit Station"
          >
            <Fingerprint size={18} />
            Entrance Station
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenOcrModal}
            title="Scan Student ID Card"
          >
            <Camera size={18} />
            Scan ID
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setActiveTab('issue')}
          >
            <ArrowUpRight size={18} />
            Issue
          </button>
          <button
            type="button"
            className="btn btn-success"
            onClick={() => setActiveTab('return')}
          >
            <ArrowDownLeft size={18} />
            Return
          </button>
        </div>
      </div>

      {/* STORAGE PROTECTION BANNER (Visible if storage >= 80%) */}
      {storageStatus.percentage >= 80 && (
        <div
          className={`alert ${storageStatus.percentage >= 95 ? 'alert-danger' : 'alert-warning'}`}
          style={{
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <HardDrive size={20} />
            <div>
              <strong>
                {storageStatus.percentage >= 95
                  ? `STORAGE PROTECTION MODE ACTIVE (${storageStatus.percentage}% Used)`
                  : storageStatus.percentage >= 90
                  ? `Critical Storage Warning (${storageStatus.percentage}% Used)`
                  : `Storage Quota Warning (${storageStatus.percentage}% Used)`}
              </strong>
              <div className="text-xs" style={{ marginTop: '0.15rem' }}>
                {storageStatus.percentage >= 95
                  ? 'Non-essential component and student additions are temporarily paused. Core operations, returns, and lab exits remain 100% active.'
                  : 'Database quota is reaching capacity. Review and prune expired retention records or download an offline archive.'}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setActiveTab('backup_restore')}
          >
            Manage Storage & Retention
          </button>
        </div>
      )}

      {/* UNVERIFIED LEGACY STUDENTS NOTICE */}
      {unverifiedCount > 0 && (
        <div
          className="alert alert-info"
          style={{
            marginBottom: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Users size={18} />
            <div>
              <strong>{unverifiedCount} student(s) pending Incubation Journey Verification</strong>
              <div className="text-xs text-muted" style={{ marginTop: '0.15rem' }}>
                Existing records are 100% protected from retention deletion. Verify their joining date to activate retention tracking.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setActiveTab('students')}
          >
            Verify Students ({unverifiedCount})
          </button>
        </div>
      )}

      {/* OVERDUE ALERT BANNER */}
      {stats.overdueItemsCount > 0 && (
        <div
          className="alert alert-danger"
          style={{
            marginBottom: '1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 260px', minWidth: '220px' }}>
            <AlertTriangle size={24} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                Action Required: {stats.overdueItemsCount} component unit(s) are currently overdue!
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>
                {stats.overdueTransactionsCount} student transaction(s) have passed their due date.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('overdue')}
          >
            View Overdue Items <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* LOW-STOCK ALERT BANNER */}
      {stats.lowStockCount > 0 && (
        <div
          className="alert alert-warning"
          style={{
            marginBottom: '1.5rem',
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            width: '100%',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: '1 1 260px', minWidth: '220px' }}>
            <AlertTriangle size={24} style={{ flexShrink: 0, color: '#d97706' }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                Low Stock Warning: {stats.lowStockCount} component type(s) below threshold!
              </div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.2rem', color: '#b45309' }}>
                Usable stock (Available + Issued) has fallen below minimum threshold. Lost items are excluded.
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-warning btn-sm"
            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            onClick={() => setActiveTab('components')}
          >
            Manage Inventory <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* 6 CORE KPI METRIC CARDS */}
      <div className="stats-grid">
        {/* Total Components */}
        <div className="stat-card stat-primary">
          <div className="stat-card-left">
            <span className="stat-label">Total Inventory</span>
            <span className="stat-value">{stats.totalPhysicalStock}</span>
            <span className="stat-subtext">Across {stats.totalComponentsTypes} component types</span>
          </div>
          <div className="stat-icon-wrapper">
            <Layers size={24} />
          </div>
        </div>

        {/* Available Components */}
        <div className="stat-card stat-success">
          <div className="stat-card-left">
            <span className="stat-label">Available in Lab</span>
            <span className="stat-value">{stats.availableStock}</span>
            <span className="stat-subtext">Ready for immediate issue</span>
          </div>
          <div className="stat-icon-wrapper">
            <CheckCircle2 size={24} />
          </div>
        </div>

        {/* Currently Issued */}
        <div className="stat-card stat-warning">
          <div className="stat-card-left">
            <span className="stat-label">Issued / In Use</span>
            <span className="stat-value">{stats.issuedStock}</span>
            <span className="stat-subtext">In {stats.activeTransactionsCount} active borrows</span>
          </div>
          <div className="stat-icon-wrapper">
            <Package size={24} />
          </div>
        </div>

        {/* Overdue Items */}
        <div className="stat-card stat-danger">
          <div className="stat-card-left">
            <span className="stat-label">Overdue Units</span>
            <span className="stat-value">{stats.overdueItemsCount}</span>
            <span className="stat-subtext">Across {stats.overdueTransactionsCount} transactions</span>
          </div>
          <div className="stat-icon-wrapper">
            <Clock size={24} />
          </div>
        </div>

        {/* Low-Stock Alert KPI Card */}
        <div
          className="stat-card"
          style={{
            background: stats.lowStockCount > 0 ? '#fffbeb' : 'var(--card-bg)',
            borderColor: stats.lowStockCount > 0 ? '#f59e0b' : 'var(--neutral-200)',
            cursor: 'pointer',
          }}
          onClick={() => setActiveTab('components')}
          title="Click to view components inventory"
        >
          <div className="stat-card-left">
            <span className="stat-label" style={{ color: stats.lowStockCount > 0 ? '#b45309' : 'inherit' }}>
              Low-Stock Alert
            </span>
            <span className="stat-value" style={{ color: stats.lowStockCount > 0 ? '#d97706' : 'inherit' }}>
              {stats.lowStockCount}
            </span>
            <span className="stat-subtext">
              {stats.lowStockCount > 0 ? 'Item(s) below threshold' : 'All stock levels healthy'}
            </span>
          </div>
          <div
            className="stat-icon-wrapper"
            style={{
              background: stats.lowStockCount > 0 ? '#fef3c7' : 'var(--neutral-100)',
              color: stats.lowStockCount > 0 ? '#d97706' : 'var(--neutral-600)',
            }}
          >
            <AlertTriangle size={24} />
          </div>
        </div>

        {/* Students Currently Inside KPI Card */}
        <div
          className="stat-card"
          style={{
            background: stats.studentsInsideCount > 0 ? '#ecfdf5' : 'var(--card-bg)',
            borderColor: stats.studentsInsideCount > 0 ? '#10b981' : 'var(--neutral-200)',
            cursor: 'pointer',
          }}
          onClick={() => setActiveTab('students_inside')}
          title="Click to view students currently inside the lab"
        >
          <div className="stat-card-left">
            <span className="stat-label" style={{ color: stats.studentsInsideCount > 0 ? '#065f46' : 'inherit' }}>
              Students in Lab
            </span>
            <span className="stat-value" style={{ color: stats.studentsInsideCount > 0 ? '#059669' : 'inherit' }}>
              {stats.studentsInsideCount}
            </span>
            <span className="stat-subtext">
              {stats.studentsInsideCount > 0 ? 'Live checked-in students' : 'No students in lab'}
            </span>
          </div>
          <div
            className="stat-icon-wrapper"
            style={{
              background: stats.studentsInsideCount > 0 ? '#d1fae5' : 'var(--neutral-100)',
              color: stats.studentsInsideCount > 0 ? '#059669' : 'var(--neutral-600)',
            }}
          >
            <Users size={24} />
          </div>
        </div>
      </div>

      {/* CHARTS & RECENT ACTIVITY SECTION */}
      <div className="grid-2">
        {/* Stock Breakdown By Category Chart */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Layers size={18} /> Category Stock Distribution
            </h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setActiveTab('components')}
            >
              Manage Inventory
            </button>
          </div>
          <div className="card-body" style={{ height: '320px' }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(val, name, item) => [
                      `${val} units`,
                      name === 'Available' ? 'Available in Lab' : 'Currently Issued',
                    ]}
                    labelFormatter={(label, items) => items?.[0]?.payload?.fullName || label}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="Available" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Issued" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-muted" style={{ textAlign: 'center', paddingTop: '4rem' }}>
                No categories registered yet.
              </div>
            )}
          </div>
        </div>

        {/* Category Breakdown Cards */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">
              <Tag size={18} /> Component Categories
            </h3>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => setActiveTab('components')}
            >
              <PlusCircle size={14} /> Add Component
            </button>
          </div>
          <div className="card-body" style={{ maxHeight: '320px', overflowY: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {stats.categoryBreakdown.map((cat, idx) => {
                const total = cat.totalStock || 1;
                const percentIssued = Math.round((cat.issuedStock / total) * 100);
                const color = categoryColors[idx % categoryColors.length];

                return (
                  <div
                    key={cat.name}
                    style={{
                      padding: '0.65rem 0.85rem',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--neutral-200)',
                      background: 'var(--neutral-50)',
                    }}
                  >
                    <div className="flex-between" style={{ marginBottom: '0.35rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>{cat.name}</span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--neutral-600)' }}>
                        <strong>{cat.availableStock}</strong> / {cat.totalStock} available
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div style={{ width: '100%', height: 6, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${percentIssued}%`,
                          height: '100%',
                          background: color,
                          borderRadius: 999,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* RECENT ISSUE / RETURN ACTIVITY TABLE */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">
            <Clock size={18} /> Recent Issue & Return Activity
          </h3>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setActiveTab('transactions')}
          >
            View All Transactions <ChevronRight size={14} />
          </button>
        </div>
        <div className="table-responsive">
          <table className="table">
            <thead>
              <tr>
                <th>Transaction ID</th>
                <th>Student</th>
                <th>Components Borrowed</th>
                <th>Issue Date</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentActivity && stats.recentActivity.length > 0 ? (
                stats.recentActivity.map((txn) => {
                  const isOverdue = txn.status !== 'returned' && new Date(txn.overallDueDate) < new Date();
                  const totalIssued = txn.items.reduce((s, it) => s + it.issuedQuantity, 0);
                  const totalReturned = txn.items.reduce((s, it) => s + it.returnedQuantity, 0);

                  return (
                    <tr key={txn.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: '0.82rem' }}>
                        {txn.id}
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--neutral-900)' }}>{txn.studentName}</div>
                        <div className="font-mono text-muted text-xs">{txn.studentRoll}</div>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.85rem' }}>
                          {txn.items.map((it) => (
                            <span
                              key={it.componentId}
                              className="badge badge-neutral"
                              style={{ marginRight: '0.35rem', marginBottom: '0.2rem' }}
                            >
                              {it.issuedQuantity}x {it.componentName.split('(')[0].trim()}
                              {it.returnedQuantity > 0 ? ` (${it.returnedQuantity} ret)` : ''}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="text-sm">
                        {new Date(txn.issueDate).toLocaleDateString()}
                      </td>
                      <td className="text-sm">
                        <span style={{ color: isOverdue ? 'var(--danger-text)' : 'inherit', fontWeight: isOverdue ? 700 : 400 }}>
                          {new Date(txn.overallDueDate).toLocaleDateString()}
                        </span>
                      </td>
                      <td>
                        {txn.status === 'returned' && (
                          <span className="badge badge-success">Fully Returned</span>
                        )}
                        {txn.status === 'partially_returned' && (
                          <span className="badge badge-warning">
                            Partial ({totalReturned}/{totalIssued})
                          </span>
                        )}
                        {txn.status === 'active' && !isOverdue && (
                          <span className="badge badge-info">Active</span>
                        )}
                        {isOverdue && (
                          <span className="badge badge-danger">Overdue</span>
                        )}
                      </td>
                      <td>
                        {txn.status !== 'returned' ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={() => setActiveTab('return')}
                          >
                            Return
                          </button>
                        ) : (
                          <span className="text-muted text-xs">Completed</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }} className="text-muted">
                    No transactions recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
