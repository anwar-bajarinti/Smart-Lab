// src/utils/excelExport.js
// Utility to download lab attendance records as an Excel file (.xlsx / formatted CSV)
// Strictly accessible to Admin and Substitute Admin only

export function downloadAttendanceExcel(attendanceRecords, fileName = 'Incubation_Lab_Attendance') {
  if (!attendanceRecords || attendanceRecords.length === 0) {
    throw new Error('No attendance records available to export.');
  }

  // Define headers as required: Date, Roll number, Entry time, Exit time, Duration
  const headers = ['Date', 'Roll Number', 'Student Name', 'Entry Time', 'Exit Time', 'Duration', 'Verification Method'];

  const rows = attendanceRecords.map((r) => [
    `"${r.Date || ''}"`,
    `"${r.RollNumber || ''}"`,
    `"${r.StudentName || ''}"`,
    `"${r.EntryTime || ''}"`,
    `"${r.ExitTime || ''}"`,
    `"${r.Duration || ''}"`,
    `"${r.EntryMethod || ''}"`,
  ]);

  // Generate CSV content with UTF-8 BOM so Microsoft Excel opens it cleanly with exact columns
  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileName}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return true;
}
