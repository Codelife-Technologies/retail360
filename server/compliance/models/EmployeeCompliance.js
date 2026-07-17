const mongoose = require('mongoose');

const employeeComplianceSchema = new mongoose.Schema(
  {
    employeeId: { type: String, trim: true, required: true },
    name: { type: String, trim: true, required: true },
    department: { type: String, trim: true, default: '' },
    pan: { type: String, trim: true, uppercase: true, default: '' },
    aadhaar: { type: String, trim: true, default: '' },
    bankAccount: { type: String, trim: true, default: '' },
    uan: { type: String, trim: true, default: '' },
    esicNumber: { type: String, trim: true, default: '' },
    offerLetterUploaded: { type: Boolean, default: false },
    appointmentLetterUploaded: { type: Boolean, default: false },
    ndaUploaded: { type: Boolean, default: false },
    kycStatus: {
      type: String,
      enum: ['Pending', 'Verified', 'Rejected', 'In Progress'],
      default: 'Pending',
    },
    backgroundVerification: {
      type: String,
      enum: ['Pending', 'Cleared', 'Failed', 'In Progress'],
      default: 'Pending',
    },
    status: {
      type: String,
      enum: ['Compliant', 'Non-Compliant', 'In Progress', 'Pending'],
      default: 'Pending',
    },
    remarks: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComplianceEmployeeRecord', employeeComplianceSchema);
