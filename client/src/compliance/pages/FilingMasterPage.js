import React from 'react';
import ComplianceCrudPage from '../components/ComplianceCrudPage';
import { complianceFilingMastersAPI } from '../services/complianceApi';

const CATEGORIES = ['GST', 'TDS', 'ITR', 'EPF', 'ESIC', 'Labour', 'Other'];
const FREQUENCIES = ['Monthly', 'Quarterly', 'Half-Yearly', 'Annual', 'As Required'];

function FilingMasterPage() {
  return (
    <ComplianceCrudPage
      title="Filing Master"
      subtitle="Configure GST, TDS, ITR, EPF, ESIC and other statutory forms with filing frequency and due dates for your company."
      api={complianceFilingMastersAPI}
      createPermission="compliance.filingMaster.create"
      updatePermission="compliance.filingMaster.update"
      deletePermission="compliance.filingMaster.delete"
      showStatusFilter={false}
      showDateFilter={false}
      extraFilters={[
        { name: 'category', label: 'All Categories', options: CATEGORIES },
        { name: 'frequency', label: 'All Frequencies', options: FREQUENCIES },
        {
          name: 'isActive',
          label: 'All (Active/Inactive)',
          options: [
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ],
        },
      ]}
      columns={[
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Form Name' },
        { key: 'category', label: 'Category' },
        { key: 'frequency', label: 'Frequency' },
        { key: 'dueDay', label: 'Due Day' },
        { key: 'dueOffsetMonths', label: 'Offset (months)' },
        { key: 'governmentPortal', label: 'Portal' },
        { key: 'department', label: 'Department' },
        {
          key: 'isActive',
          label: 'Active',
          render: (v) => (v ? 'Yes' : 'No'),
        },
      ]}
      fields={[
        { name: 'code', label: 'Form Code', required: true, placeholder: 'e.g. GSTR-1' },
        { name: 'name', label: 'Form Name', required: true },
        { name: 'category', label: 'Category', type: 'select', options: CATEGORIES, required: true },
        { name: 'frequency', label: 'Frequency', type: 'select', options: FREQUENCIES, defaultValue: 'Monthly' },
        { name: 'dueDay', label: 'Due Day (of month)', type: 'number', defaultValue: 15 },
        { name: 'dueOffsetMonths', label: 'Due Offset (months after period)', type: 'number', defaultValue: 1 },
        { name: 'dueMonth', label: 'Due Month (annual/half-yearly)', type: 'number' },
        { name: 'department', label: 'Department', defaultValue: 'Accounts' },
        { name: 'governmentPortal', label: 'Government Portal', placeholder: 'GSTN / Income Tax / EPFO' },
        { name: 'governmentFormCode', label: 'Government Form Code (API)', placeholder: 'e.g. GSTR3B' },
        { name: 'reminderDaysBefore', label: 'Reminder Days Before Due', type: 'number', defaultValue: 7 },
        { name: 'isActive', label: 'Active', type: 'checkbox', defaultValue: true },
        { name: 'description', label: 'Description', type: 'textarea', fullWidth: true },
        { name: 'companyDueDateNote', label: 'Company Due Date Note', type: 'textarea', fullWidth: true },
      ]}
    />
  );
}

export default FilingMasterPage;
