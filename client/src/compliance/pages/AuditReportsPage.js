import React from 'react';
import ComplianceCrudPage from '../components/ComplianceCrudPage';
import { complianceAuditsAPI } from '../services/complianceApi';

const TYPES = ['Internal Audit', 'External Audit', 'Tax Audit', 'Stock Audit'];
const STATUS = ['Scheduled', 'In Progress', 'Completed', 'Open Findings'];

function AuditReportsPage() {
  return (
    <ComplianceCrudPage
      title="Audit Reports"
      subtitle="Internal, external, tax, and stock audit tracking."
      api={complianceAuditsAPI}
      createPermission="compliance.audits.create"
      updatePermission="compliance.audits.update"
      deletePermission="compliance.audits.delete"
      statusOptions={STATUS}
      dateFilterFieldHint="Audit date"
      columns={[
        { key: 'auditType', label: 'Audit Type' },
        { key: 'auditor', label: 'Auditor' },
        { key: 'auditDate', label: 'Audit Date' },
        { key: 'findings', label: 'Findings' },
        { key: 'actionTaken', label: 'Action Taken' },
        { key: 'status', label: 'Status' },
      ]}
      fields={[
        { name: 'auditType', label: 'Audit Type', type: 'select', options: TYPES, required: true },
        { name: 'auditor', label: 'Auditor' },
        { name: 'auditDate', label: 'Audit Date', type: 'date' },
        { name: 'findings', label: 'Findings', type: 'textarea', fullWidth: true },
        { name: 'actionTaken', label: 'Action Taken', type: 'textarea', fullWidth: true },
        { name: 'status', label: 'Status', type: 'select', options: STATUS, defaultValue: 'Scheduled' },
        { name: 'department', label: 'Department' },
        { name: 'dueDate', label: 'Due Date', type: 'date' },
        { name: 'attachment', label: 'Attachment' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', fullWidth: true },
      ]}
    />
  );
}

export default AuditReportsPage;
