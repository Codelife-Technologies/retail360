const mongoose = require('mongoose');

/**
 * Generic compliance tasks used by dashboard KPIs / activity feed.
 * Also auto-derived events come from GST/TDS/EPF/etc.; this model stores manual tasks.
 */
const taskSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },
    category: {
      type: String,
      enum: ['GST', 'TDS', 'Payroll', 'EPF', 'ESIC', 'Labour', 'License', 'Audit', 'Other'],
      default: 'Other',
    },
    dueDate: { type: Date },
    completedDate: { type: Date },
    status: {
      type: String,
      enum: ['Pending', 'Completed', 'Overdue', 'In Progress'],
      default: 'Pending',
    },
    department: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComplianceTask', taskSchema);
