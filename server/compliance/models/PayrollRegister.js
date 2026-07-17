const mongoose = require('mongoose');

const payrollRegisterSchema = new mongoose.Schema(
  {
    registerType: {
      type: String,
      enum: ['Salary Register', 'Wage Register', 'Overtime Register', 'Bonus Register', 'Payslip Status'],
      required: true,
    },
    month: { type: String, trim: true, required: true },
    employeeCount: { type: Number, default: 0 },
    amount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Overdue', 'In Progress'],
      default: 'Pending',
    },
    dueDate: { type: Date },
    completedDate: { type: Date },
    department: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },
    attachment: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CompliancePayrollRegister', payrollRegisterSchema);
