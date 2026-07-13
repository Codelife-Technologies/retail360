import React, { useCallback, useEffect, useState } from 'react';
import { hrPayrollAPI } from '../../hr/services/hrApi';
import EmployeeContextGate, { EmployeeWelcome } from '../components/EmployeeContextGate';
import PayrollSlip from '../../hr/payslip/PayrollSlip';
import { extractList, formatCurrency } from '../../hr/utils/hrUtils';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function EmployeeSalarySlipContent({ employeeId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewingSlip, setViewingSlip] = useState(null);

  const fetchPayroll = useCallback(async () => {
    if (!employeeId) return;
    try {
      setLoading(true);
      const response = await hrPayrollAPI.getAll({
        employee: employeeId,
        limit: 24,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      });
      setRecords(extractList(response));
    } catch (error) {
      console.error('Error fetching payroll:', error);
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    fetchPayroll();
  }, [fetchPayroll]);

  return (
    <>
      <header className="ed-section-header">
        <div>
          <h2>Salary Slip</h2>
          <p>View and download your payslips.</p>
        </div>
      </header>

      {loading ? (
        <div className="ed-loading">Loading salary records...</div>
      ) : records.length === 0 ? (
        <div className="ed-empty-panel">No salary slips available yet.</div>
      ) : (
        <div className="ed-table-card">
          <table className="ed-table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Basic Salary</th>
                <th>Net Salary</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record._id}>
                  <td>{MONTH_NAMES[record.month - 1]} {record.year}</td>
                  <td>{formatCurrency(record.basicSalary)}</td>
                  <td>{formatCurrency(record.netSalary)}</td>
                  <td>{record.paymentStatus}</td>
                  <td>
                    <button
                      type="button"
                      className="ed-btn ed-btn-primary"
                      onClick={() => setViewingSlip(record)}
                    >
                      View Slip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewingSlip && (
        <PayrollSlip
          payrollRecord={viewingSlip}
          month={viewingSlip.month}
          year={viewingSlip.year}
          onClose={() => setViewingSlip(null)}
        />
      )}
    </>
  );
}

function EmployeeSalarySlip() {
  return (
    <EmployeeContextGate>
      {(context) => (
        <div className="hr-page ed-page">
          <EmployeeWelcome employee={context.employee} />
          <EmployeeSalarySlipContent employeeId={context.employeeId} />
        </div>
      )}
    </EmployeeContextGate>
  );
}

export default EmployeeSalarySlip;
