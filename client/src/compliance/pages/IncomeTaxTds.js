import React from 'react';
import ComplianceCrudPage from '../components/ComplianceCrudPage';
import { complianceTdsAPI } from '../services/complianceApi';
import { formatCurrency } from '../utils/complianceUtils';

const STATUS = ['Pending', 'Filed', 'Overdue', 'In Progress'];

function IncomeTaxTds() {
  return (
    <ComplianceCrudPage
      title="Income Tax & TDS"
      subtitle="Track TDS challans, quarters, and filing status."
      api={complianceTdsAPI}
      createPermission="compliance.tds.create"
      updatePermission="compliance.tds.update"
      deletePermission="compliance.tds.delete"
      statusOptions={STATUS}
      columns={[
        { key: 'tdsType', label: 'TDS Type' },
        { key: 'quarter', label: 'Quarter' },
        { key: 'dueDate', label: 'Due Date' },
        { key: 'filingDate', label: 'Filing Date' },
        { key: 'challanNumber', label: 'Challan Number' },
        { key: 'amount', label: 'Amount', render: (v) => formatCurrency(v) },
        { key: 'status', label: 'Status' },
      ]}
      fields={[
        { name: 'tdsType', label: 'TDS Type', required: true },
        { name: 'quarter', label: 'Quarter', required: true },
        { name: 'dueDate', label: 'Due Date', type: 'date' },
        { name: 'filingDate', label: 'Filing Date', type: 'date' },
        { name: 'challanNumber', label: 'Challan Number' },
        { name: 'amount', label: 'Amount', type: 'number' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS, defaultValue: 'Pending' },
        { name: 'department', label: 'Department' },
        { name: 'attachment', label: 'Attachment (URL / file ref)' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', fullWidth: true },
      ]}
    />
  );
}

export default IncomeTaxTds;
