import React from 'react';
import ComplianceCrudPage from '../components/ComplianceCrudPage';
import { complianceLicensesAPI } from '../services/complianceApi';

const STATUS = ['Valid', 'Expiring Soon', 'Expired'];

function licenseRowClass(row) {
  if (row.status === 'Expired') return 'cmp-row-danger';
  if (row.status === 'Expiring Soon') return 'cmp-row-warning';
  return 'cmp-row-success';
}

function LicensesPage() {
  return (
    <ComplianceCrudPage
      title="Licenses"
      subtitle="Company licenses with automatic expiry highlighting."
      api={complianceLicensesAPI}
      createPermission="compliance.licenses.create"
      updatePermission="compliance.licenses.update"
      deletePermission="compliance.licenses.delete"
      statusOptions={STATUS}
      dateFilterFieldHint="Expiry date"
      rowClassName={licenseRowClass}
      columns={[
        { key: 'licenseName', label: 'License Name' },
        { key: 'licenseNumber', label: 'License Number' },
        { key: 'issueDate', label: 'Issue Date' },
        { key: 'expiryDate', label: 'Expiry Date' },
        { key: 'department', label: 'Department' },
        { key: 'responsiblePerson', label: 'Responsible Person' },
        {
          key: 'status',
          label: 'Status',
          render: (value) => (
            <span className={`cmp-badge license-${String(value || '').toLowerCase().replace(/\s+/g, '-')}`}>
              {value}
            </span>
          ),
        },
      ]}
      fields={[
        { name: 'licenseName', label: 'License Name', required: true },
        { name: 'licenseNumber', label: 'License Number' },
        { name: 'issueDate', label: 'Issue Date', type: 'date' },
        { name: 'expiryDate', label: 'Expiry Date', type: 'date' },
        { name: 'department', label: 'Department' },
        { name: 'responsiblePerson', label: 'Responsible Person' },
        { name: 'attachment', label: 'Attachment' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', fullWidth: true },
      ]}
    />
  );
}

export default LicensesPage;
