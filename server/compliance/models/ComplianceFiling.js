const mongoose = require('mongoose');

const complianceFilingSchema = new mongoose.Schema(
  {
    filingMaster: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ComplianceFilingMaster',
      required: true,
    },
    formCode: { type: String, trim: true, required: true },
    formName: { type: String, trim: true, required: true },
    category: {
      type: String,
      enum: ['GST', 'TDS', 'ITR', 'EPF', 'ESIC', 'Labour', 'Other'],
      required: true,
    },
    period: { type: String, trim: true, required: true },
    dueDate: { type: Date },
    filedDate: { type: Date },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Filed', 'Overdue', 'Rejected'],
      default: 'Pending',
    },
    amount: { type: Number, default: 0, min: 0 },
    department: { type: String, trim: true, default: 'Accounts' },
    remarks: { type: String, trim: true, default: '' },
    attachment: { type: String, trim: true, default: '' },
    governmentPortal: { type: String, trim: true, default: '' },
    governmentFormCode: { type: String, trim: true, default: '' },
    governmentStatus: {
      type: String,
      enum: ['Not Submitted', 'Submitted', 'Acknowledged', 'Rejected'],
      default: 'Not Submitted',
    },
    governmentReference: { type: String, trim: true, default: '' },
    governmentSubmittedAt: { type: Date },
    governmentResponse: { type: String, trim: true, default: '' },
    filedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

complianceFilingSchema.index({ dueDate: 1, status: 1 });
complianceFilingSchema.index({ category: 1, period: 1 });
complianceFilingSchema.index({ formCode: 1, period: 1 });

module.exports = mongoose.model('ComplianceFiling', complianceFilingSchema);
