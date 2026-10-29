// src/pages/Analytics.jsx
// Attendance Analytics Graph, Equipment-Usage Graph (Two completely SEPARATE graphs),
// and Excel Attendance Export for Admin and Substitute Admin.

import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  Calendar,
  Download,
  FileSpreadsheet,
  Cpu,
  Users,
  TrendingUp,
  Layers,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts';
import {
  getAttendanceAnalytics,
  getEquipmentUsageAnalytics,
  getAttendanceExportData,
  subscribeToDb,
} from '../../db/database';
import { downloadAttendanceExcel } from '../../utils/excelExport';

export default function Analytics({ onToast }) {
  const [attendancePeriod, setAttendancePeriod] = useState('week'); // 'week' | 'month' | 'year'
  const [equipmentPeriod, setEquipmentPeriod] = useState('week'); // 'week' | 'month' | 'year'

  const [attendanceData, setAttendanceData] = useState([]);
  const [equipmentData, setEquipmentData] = useState([]);

  useEffect(() => {
    loadData();
    const unsubscribe = subscribeToDb(() => loadData());
    return () => unsubscribe();
  }, [attendancePeriod, equipmentPeriod]);

  function loadData() {
    setAttendanceData(getAttendanceAnalytics(attendancePeriod));
    setEquipmentData(getEquipmentUsageAnalytics(equipmentPeriod));
  }

  function handleExportExcel() {
    try {
      const records = getAttendanceExportData();
      downloadAttendanceExcel(records, 'Incubation_Centre_Attendance_Export');
      if (onToast) onToast('Attendance records downloaded as Excel (.csv) successfully!');
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div>
      {/* Header & Excel Export Action */}
      <div className="flex-between" style={{ marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-900)' }}>
            Laboratory Analytics & Reporting
          </h2>
          <p className="text-muted" style={{ fontSize: '0.88rem' }}>
            Daily attendance and equipment usage analytics with Excel spreadsheet export
          </p>
        </div>

        <button type="button" className="btn btn-success" onClick={handleExportExcel}>
          <FileSpreadsheet size={18} /> Download Attendance Excel
        </button>
      </div>

      {/* ==================== GRAPH 1: ATTENDANCE ANALYTICS GRAPH ==================== */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Users size={20} className="icon-primary" />
            <div>
              <h3 className="card-title">1. Student Attendance Graph</h3>
              <p className="text-xs text-muted">Number of students who visited the lab each day</p>
            </div>
          </div>

          {/* Period Selector */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {['week', 'month', 'year'].map((p) => (
              <button
                key={p}
                type="button"
                className={`btn-badge ${attendancePeriod === p ? 'active' : ''}`}
                style={{
                  textTransform: 'capitalize',
                  background: attendancePeriod === p ? 'var(--primary)' : '#f1f5f9',
                  color: attendancePeriod === p ? '#fff' : '#475569',
                  fontWeight: attendancePeriod === p ? 700 : 500,
                  padding: '0.35rem 0.75rem',
                }}
                onClick={() => setAttendancePeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="card-body" style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={attendanceData} margin={{ top: 10, right: 20, left: -20, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip formatter={(val) => [`${val} Students`, 'Attendance']} />
              <Bar dataKey="studentsCount" name="Students in Lab" fill="#4f46e5" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ==================== GRAPH 2: EQUIPMENT USAGE GRAPH (SEPARATE!) ==================== */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Cpu size={20} style={{ color: '#0ea5e9' }} />
            <div>
              <h3 className="card-title">2. Equipment-Usage Graph</h3>
              <p className="text-xs text-muted">Number of students who borrowed components each day (Kept separate from attendance)</p>
            </div>
          </div>

          {/* Period Selector */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {['week', 'month', 'year'].map((p) => (
              <button
                key={p}
                type="button"
                className={`btn-badge ${equipmentPeriod === p ? 'active' : ''}`}
                style={{
                  textTransform: 'capitalize',
                  background: equipmentPeriod === p ? '#0ea5e9' : '#f1f5f9',
                  color: equipmentPeriod === p ? '#fff' : '#475569',
                  fontWeight: equipmentPeriod === p ? 700 : 500,
                  padding: '0.35rem 0.75rem',
                }}
                onClick={() => setEquipmentPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="card-body" style={{ height: '320px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equipmentData} margin={{ top: 10, right: 20, left: -20, bottom: 20 }}>
              <defs>
                <linearGradient id="equipGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
              <Tooltip formatter={(val) => [`${val} Students`, 'Component Borrowers']} />
              <Area type="monotone" dataKey="borrowersCount" name="Component Borrowers" stroke="#0284c7" strokeWidth={2} fillOpacity={1} fill="url(#equipGradient)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
