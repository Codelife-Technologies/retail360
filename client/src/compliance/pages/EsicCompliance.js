import React from 'react';
import ComplianceCrudPage from '../components/ComplianceCrudPage';
import { complianceEsicAPI } from '../services/complianceApi';
import { formatCurrency } from '../utils/complianceUtils';

const STATUS = ['Pending', 'Paid', 'Overdue', 'In Progress'];

function EsicCompliance() {
  return (
    <ComplianceCrudPage
      title="ESIC Compliance"
      subtitle="Employees’ State Insurance contributions and coverage."
      api={complianceEsicAPI}
      createPermission="compliance.esic.create"
      updatePermission="compliance.esic.update"
      deletePermission="compliance.esic.delete"
      statusOptions={STATUS}
      columns={[
        { key: 'month', label: 'Month' },
        { key: 'employeesCovered', label: 'Employees Covered' },
        { key: 'employerContribution', label: 'Employer', render: (v) => formatCurrency(v) },
        { key: 'employeeContribution', label: 'Employee', render: (v) => formatCurrency(v) },
        { key: 'challanNumber', label: 'Challan Number' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'paymentDate', label: 'Payment Date' },
        { key: 'status', label: 'Status' },
      ]}
      fields={[
        { name: 'month', label: 'Month', required: true },
        { name: 'employeesCovered', label: 'Employees Covered', type: 'number' },
        { name: 'employerContribution', label: 'Employer Contribution', type: 'number' },
        { name: 'employeeContribution', label: 'Employee Contribution', type: 'number' },
        { name: 'challanNumber', label: 'Challan Number' },
        { name: 'dueDate', label: 'Due Date', type: 'date' },
        { name: 'paymentDate', label: 'Payment Date', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS, defaultValue: 'Pending' },
        { name: 'department', label: 'Department' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', fullWidth: true },
      ]}
    />
  );
}

export default EsicCompliance;
