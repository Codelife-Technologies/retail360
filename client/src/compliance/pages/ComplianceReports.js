import React, { useEffect, useState } from 'react';
import { complianceReportsAPI } from '../services/complianceApi';

const REPORTS = [
  { type: 'summary', label: 'Overall Compliance Summary' },
];

function ComplianceReports() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const response = await complianceReportsAPI.getSummary();
        setSummary(response.data);
      } catch (error) {
        setSummary(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const exportReport = async (type, format) => {
    try {
      await complianceReportsAPI.export(type, format);
      setToast(`Exported ${type} as ${format.toUpperCase()}`);
      window.setTimeout(() => setToast(''), 2500);
    } catch (error) {
      alert(error.response?.data?.error || 'Export failed');
    }
  };

  return (
    <div className="cmp-page">
      <div className="cmp-page-header cmp-sticky-header">
        <div>
          <h1>Compliance Reports</h1>
          <p className="cmp-page-subtitle">Generate Excel, CSV, or PDF exports for statutory reporting.</p>
        </div>
      </div>

      {toast ? <div className="cmp-toast">{toast}</div> : null}

      <div className="cmp-kpi-grid">
        {loading || !summary ? (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="cmp-skeleton-card" />)
        ) : (
          <>
            <div className="cmp-kpi-card info"><div className="cmp-kpi-body"><h3>{summary.overall?.total || 0}</h3><p>Total Items</p></div></div>
            <div className="cmp-kpi-card success"><div className="cmp-kpi-body"><h3>{summary.overall?.completed || 0}</h3><p>Completed</p></div></div>
            <div className="cmp-kpi-card warning"><div className="cmp-kpi-body"><h3>{summary.overall?.pending || 0}</h3><p>Pending</p></div></div>
            <div className="cmp-kpi-card info"><div className="cmp-kpi-body"><h3>{summary.overall?.complianceRate || 0}%</h3><p>Compliance Rate</p></div></div>
          </>
        )}
      </div>

      <div className="cmp-reports-grid">
        {REPORTS.map((report) => (
          <div key={report.type} className="cmp-card cmp-report-card">
            <h3>{report.label}</h3>
            <p className="cmp-muted">Export current records for {report.label.toLowerCase()}.</p>
            <div className="cmp-page-actions">
              <button type="button" className="cmp-btn" onClick={() => exportReport(report.type, 'xlsx')}>Excel</button>
              <button type="button" className="cmp-btn" onClick={() => exportReport(report.type, 'csv')}>CSV</button>
              <button type="button" className="cmp-btn" onClick={() => exportReport(report.type, 'pdf')}>PDF</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ComplianceReports;
