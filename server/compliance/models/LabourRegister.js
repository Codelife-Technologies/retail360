const mongoose = require('mongoose');

const labourRegisterSchema = new mongoose.Schema(
  {
    registerType: {
      type: String,
      enum: [
        'Attendance Register',
        'Wage Register',
        'Leave Register',
        'Overtime Register',
        'Employee Register',
        'Contractor Register',
        'Accident Register',
      ],
      required: true,
    },
    period: { type: String, trim: true, default: '' },
    entryDate: { type: Date, default: Date.now },
    employeeName: { type: String, trim: true, default: '' },
    employeeId: { type: String, trim: true, default: '' },
    department: { type: String, trim: true, default: '' },
    details: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['Active', 'Closed', 'Pending'],
      default: 'Active',
    },
    dueDate: { type: Date },
    remarks: { type: String, trim: true, default: '' },
    attachment: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComplianceLabourRegister', labourRegisterSchema);
