import React from 'react';
import ComplianceCrudPage from '../components/ComplianceCrudPage';
import { complianceLabourAPI } from '../services/complianceApi';

const REGISTER_TYPES = [
  'Attendance Register',
  'Wage Register',
  'Leave Register',
  'Overtime Register',
  'Employee Register',
  'Contractor Register',
  'Accident Register',
];
const STATUS = ['Active', 'Closed', 'Pending'];

function LabourCompliance() {
  return (
    <ComplianceCrudPage
      title="Labour Compliance"
      subtitle="Maintain statutory labour registers with export support."
      api={complianceLabourAPI}
      createPermission="compliance.labour.create"
      updatePermission="compliance.labour.update"
      deletePermission="compliance.labour.delete"
      statusOptions={STATUS}
      dateFilterFieldHint="Entry date"
      extraFilters={[{ name: 'registerType', label: 'All Registers', options: REGISTER_TYPES }]}
      columns={[
        { key: 'registerType', label: 'Register' },
        { key: 'period', label: 'Period' },
        { key: 'entryDate', label: 'Entry Date' },
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'employeeName', label: 'Employee Name' },
        { key: 'department', label: 'Department' },
        { key: 'status', label: 'Status' },
      ]}
      fields={[
        { name: 'registerType', label: 'Register Type', type: 'select', options: REGISTER_TYPES, required: true },
        { name: 'period', label: 'Period' },
        { name: 'entryDate', label: 'Entry Date', type: 'date' },
        { name: 'employeeId', label: 'Employee ID' },
        { name: 'employeeName', label: 'Employee Name' },
        { name: 'department', label: 'Department' },
        { name: 'details', label: 'Details', type: 'textarea', fullWidth: true },
        { name: 'status', label: 'Status', type: 'select', options: STATUS, defaultValue: 'Active' },
        { name: 'dueDate', label: 'Due Date', type: 'date' },
        { name: 'attachment', label: 'Attachment' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', fullWidth: true },
      ]}
    />
  );
}

export default LabourCompliance;
