import React, { useState, useEffect, useCallback } from 'react';
import { hrPayrollAPI } from '../services/hrApi';
import HrKpiCard from '../components/HrKpiCard';
import HrPagination from '../components/HrPagination';
import HrStatusBadge from '../components/HrStatusBadge';
import PayrollSlip from '../payslip/PayrollSlip';
import {
  extractList,
  extractPagination,
  formatCurrency,
  employeeName,
} from '../utils/hrUtils';

function Payroll() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({
    totalPayroll: 0,
    processedSalary: 0,
    pendingSalary: 0,
    employeesPaid: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [showPayslip, setShowPayslip] = useState(null);
  const [generating, setGenerating] = useState(false);

  const fetchPayroll = useCallback(async () => {
    try {
      setLoading(true);
      const [recordsRes, summaryRes] = await Promise.all([
        hrPayrollAPI.getAll({ search: searchTerm, month, year, page, limit: 15 }),
        hrPayrollAPI.getSummary({ month, year }),
      ]);
      setRecords(extractList(recordsRes));
      setPagination(extractPagination(recordsRes));
      setSummary(summaryRes.data || {});
    } catch (error) {
      console.error('Error fetching payroll:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, month, year, page]);

  useEffect(() => {
    fetchPayroll();
  }, [fetchPayroll]);

  const handleGenerate = async () => {
    if (!window.confirm(`Generate payroll for ${month}/${year} for all active employees?`)) return;
    try {
      setGenerating(true);
      await hrPayrollAPI.generate({ month, year });
      fetchPayroll();
      alert('Payroll generated successfully');
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkPaid = async (record) => {
    try {
      await hrPayrollAPI.update(record._id, { paymentStatus: 'Paid' });
      fetchPayroll();
    } catch (error) {
      alert(error.response?.data?.error || 'Failed to update payment status');
    }
  };

  return (
    <div className="hr-page">
      <header className="hr-page-header">
        <div>
          <h1>Payroll Management</h1>
          <p className="hr-page-subtitle">
            Generate and manage employee salary processing. Basic salary is pulled from Employee Master automatically.
          </p>
        </div>
        <div className="hr-header-actions">
          <select className="hr-filter-select" value={month} onChange={(e) => setMonth(parseInt(e.target.value, 10))}>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en-US', { month: 'long' })}</option>
            ))}
          </select>
          <input type="number" className="hr-filter-input" value={year} min="2020" max="2030" onChange={(e) => setYear(parseInt(e.target.value, 10))} />
          <button type="button" className="hr-btn hr-btn-primary" onClick={handleGenerate} disabled={generating}>
            {generating ? 'Generating...' : 'Generate / Refresh Payroll'}
          </button>
        </div>
      </header>

      <div className="hr-kpi-grid">
        <HrKpiCard icon="💰" label="Total Payroll" value={formatCurrency(summary.totalPayroll)} variant="info" />
        <HrKpiCard icon="✅" label="Processed Salary" value={formatCurrency(summary.processedSalary)} variant="success" />
        <HrKpiCard icon="⏳" label="Pending Salary" value={formatCurrency(summary.pendingSalary)} variant="warning" />
        <HrKpiCard icon="👤" label="Employees Paid" value={summary.employeesPaid ?? 0} />
      </div>

      <div className="hr-filters-row">
        <input
          type="text"
          className="hr-search-input"
          placeholder="Search employee..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="hr-loading">Loading payroll...</div>
      ) : (
        <div className="hr-table-card">
          <table className="hr-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Basic Salary</th>
                <th>Allowances</th>
                <th>Deductions</th>
                <th>Net Salary</th>
                <th>Payment Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr><td colSpan={7} className="hr-empty">No payroll records. Click Generate Payroll to create.</td></tr>
              ) : (
                records.map((row) => (
                  <tr key={row._id}>
                    <td>{employeeName(row.employee)}</td>
                    <td>{formatCurrency(row.basicSalary)}</td>
                    <td>{formatCurrency(row.allowances)}</td>
                    <td>{formatCurrency(row.deductions)}</td>
                    <td><strong>{formatCurrency(row.netSalary)}</strong></td>
                    <td><HrStatusBadge status={row.paymentStatus} /></td>
                    <td>
                      <div className="hr-actions-cell">
                        <button type="button" className="hr-btn hr-btn-secondary hr-btn-sm" onClick={() => setShowPayslip(row)}>View Payslip</button>
                        <button type="button" className="hr-btn hr-btn-primary hr-btn-sm" onClick={() => setShowPayslip(row)}>Download</button>
                        {row.paymentStatus !== 'Paid' && (
                          <button type="button" className="hr-btn hr-btn-success hr-btn-sm" onClick={() => handleMarkPaid(row)}>Mark Paid</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          <HrPagination pagination={pagination} onPageChange={setPage} />
        </div>
      )}

      {showPayslip && (
        <PayrollSlip
          payrollRecord={showPayslip}
          month={month}
          year={year}
          onClose={() => setShowPayslip(null)}
        />
      )}
    </div>
  );
}

export default Payroll;
