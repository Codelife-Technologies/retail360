import React from 'react';
import ComplianceCrudPage from '../components/ComplianceCrudPage';
import { complianceEpfAPI } from '../services/complianceApi';
import { formatCurrency } from '../utils/complianceUtils';

const STATUS = ['Pending', 'Paid', 'Overdue', 'In Progress'];

function EpfCompliance() {
  return (
    <ComplianceCrudPage
      title="EPF Compliance"
      subtitle="Employer and employee provident fund contributions."
      api={complianceEpfAPI}
      createPermission="compliance.epf.create"
      updatePermission="compliance.epf.update"
      deletePermission="compliance.epf.delete"
      statusOptions={STATUS}
      columns={[
        { key: 'month', label: 'Month' },
        { key: 'uanCount', label: 'UAN Count' },
        { key: 'employerContribution', label: 'Employer', render: (v) => formatCurrency(v) },
        { key: 'employeeContribution', label: 'Employee', render: (v) => formatCurrency(v) },
        { key: 'challanNumber', label: 'Challan Number' },
        { key: 'paymentDate', label: 'Payment Date' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'status', label: 'Status' },
      ]}
      fields={[
        { name: 'month', label: 'Month', required: true },
        { name: 'uanCount', label: 'UAN Count', type: 'number' },
        { name: 'employerContribution', label: 'Employer Contribution', type: 'number' },
        { name: 'employeeContribution', label: 'Employee Contribution', type: 'number' },
        { name: 'challanNumber', label: 'Challan Number' },
        { name: 'paymentDate', label: 'Payment Date', type: 'date' },
        { name: 'dueDate', label: 'Due Date', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS, defaultValue: 'Pending' },
        { name: 'department', label: 'Department' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', fullWidth: true },
      ]}
    />
  );
}

export default EpfCompliance;
