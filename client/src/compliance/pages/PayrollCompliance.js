import React from 'react';
import ComplianceCrudPage from '../components/ComplianceCrudPage';
import { compliancePayrollAPI } from '../services/complianceApi';
import { formatCurrency } from '../utils/complianceUtils';

const REGISTER_TYPES = [
  'Salary Register',
  'Wage Register',
  'Overtime Register',
  'Bonus Register',
  'Payslip Status',
];
const STATUS = ['Pending', 'Completed', 'Overdue', 'In Progress'];

function PayrollCompliance() {
  return (
    <ComplianceCrudPage
      title="Payroll Compliance"
      subtitle="Statutory payroll registers and payslip status."
      api={compliancePayrollAPI}
      createPermission="compliance.payroll.create"
      updatePermission="compliance.payroll.update"
      deletePermission="compliance.payroll.delete"
      statusOptions={STATUS}
      extraFilters={[{ name: 'registerType', label: 'All Registers', options: REGISTER_TYPES }]}
      columns={[
        { key: 'registerType', label: 'Register' },
        { key: 'month', label: 'Month' },
        { key: 'employeeCount', label: 'Employees' },
        { key: 'amount', label: 'Amount', render: (v) => formatCurrency(v) },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'status', label: 'Status' },
        { key: 'department', label: 'Department' },
      ]}
      fields={[
        { name: 'registerType', label: 'Register Type', type: 'select', options: REGISTER_TYPES, required: true },
        { name: 'month', label: 'Month', required: true },
        { name: 'employeeCount', label: 'Employee Count', type: 'number' },
        { name: 'amount', label: 'Amount', type: 'number' },
        { name: 'dueDate', label: 'Due Date', type: 'date' },
        { name: 'completedDate', label: 'Completed Date', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS, defaultValue: 'Pending' },
        { name: 'department', label: 'Department' },
        { name: 'attachment', label: 'Attachment' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', fullWidth: true },
      ]}
    />
  );
}

export default PayrollCompliance;
