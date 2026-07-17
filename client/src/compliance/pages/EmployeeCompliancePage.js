import React from 'react';
import ComplianceCrudPage from '../components/ComplianceCrudPage';
import { complianceEmployeesAPI } from '../services/complianceApi';

const KYC = ['Pending', 'Verified', 'Rejected', 'In Progress'];
const BG = ['Pending', 'Cleared', 'Failed', 'In Progress'];
const STATUS = ['Compliant', 'Non-Compliant', 'In Progress', 'Pending'];

function EmployeeCompliance() {
  return (
    <ComplianceCrudPage
      title="Employee Compliance"
      subtitle="KYC, statutory IDs, and employment document checklist."
      api={complianceEmployeesAPI}
      createPermission="compliance.employees.create"
      updatePermission="compliance.employees.update"
      deletePermission="compliance.employees.delete"
      statusOptions={STATUS}
      columns={[
        { key: 'employeeId', label: 'Employee ID' },
        { key: 'name', label: 'Name' },
        { key: 'department', label: 'Department' },
        { key: 'pan', label: 'PAN' },
        { key: 'uan', label: 'UAN' },
        { key: 'esicNumber', label: 'ESIC Number' },
        { key: 'kycStatus', label: 'KYC' },
        { key: 'backgroundVerification', label: 'BGV' },
        { key: 'status', label: 'Status' },
      ]}
      fields={[
        { name: 'employeeId', label: 'Employee ID', required: true },
        { name: 'name', label: 'Name', required: true },
        { name: 'department', label: 'Department' },
        { name: 'pan', label: 'PAN' },
        { name: 'aadhaar', label: 'Aadhaar' },
        { name: 'bankAccount', label: 'Bank Account' },
        { name: 'uan', label: 'UAN' },
        { name: 'esicNumber', label: 'ESIC Number' },
        { name: 'offerLetterUploaded', label: 'Offer Letter Uploaded', type: 'checkbox' },
        { name: 'appointmentLetterUploaded', label: 'Appointment Letter Uploaded', type: 'checkbox' },
        { name: 'ndaUploaded', label: 'NDA Uploaded', type: 'checkbox' },
        { name: 'kycStatus', label: 'KYC Status', type: 'select', options: KYC, defaultValue: 'Pending' },
        { name: 'backgroundVerification', label: 'Background Verification', type: 'select', options: BG, defaultValue: 'Pending' },
        { name: 'status', label: 'Status', type: 'select', options: STATUS, defaultValue: 'Pending' },
        { name: 'remarks', label: 'Remarks', type: 'textarea', fullWidth: true },
      ]}
      defaultForm={{
        offerLetterUploaded: false,
        appointmentLetterUploaded: false,
        ndaUploaded: false,
      }}
    />
  );
}

export default EmployeeCompliance;
