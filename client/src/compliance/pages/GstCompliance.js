import React from 'react';
import ComplianceCrudPage from '../components/ComplianceCrudPage';
import { complianceGstAPI } from '../services/complianceApi';
import { formatCurrency } from '../utils/complianceUtils';

const STATUS = ['Pending', 'Filed', 'Overdue', 'In Progress'];

function GstCompliance() {
  return (
    <ComplianceCrudPage
      title="GST Compliance"
      subtitle="Maintain GST filing records, tax amounts, and late fees."
      api={complianceGstAPI}
      createPermission="compliance.gst.create"
      updatePermission="compliance.gst.update"
      deletePermission="compliance.gst.delete"
      statusOptions={STATUS}
      columns={[
        { key: 'filingType', label: 'Filing Type' },
        { key: 'returnPeriod', label: 'Return Period' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'filedDate', label: 'Filed Date' },
        { key: 'status', label: 'Status' },
        { key: 'taxAmount', label: 'Tax Amount', render: (v) => formatCurrency(v) },
        { key: 'interest', label: 'Interest', render: (v) => formatCurrency(v) },
        { key: 'lateFee', label: 'Late Fee', render: (v) => formatCurrency(v) },
      ]}
      fields={[
        { name: 'filingType', label: 'Filing Type', required: true },
        { name: 'returnPeriod', label: 'Return Period', required: true },
        { name: 'dueDate', label: 'Due Date', type: 'date' },
        { name: 'filedDate', label: 'Filed Date', type: 'date' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS, defaultValue: 'Pending' },
        { name: 'taxAmount', label: 'Tax Amount', type: 'number' },
        { name: 'interest', label: 'Interest', type: 'number' },
        { name: 'lateFee', label: 'Late Fee', type: 'number' },
        { name: 'department', label: 'Department' },
        { name: 'attachment', label: 'Attachment (URL / file ref)' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', fullWidth: true },
      ]}
    />
  );
}

export default GstCompliance;
