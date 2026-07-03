const mongoose = require('mongoose');
const { LEAVE_TYPE_ENUM } = require('../utils/leavePolicies');

const leaveSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true },
    leaveType: {
      type: String,
      enum: LEAVE_TYPE_ENUM,
      required: true,
    },    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    days: { type: Number, required: true, min: 0.5 },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
    },
    reviewedAt: { type: Date },
    reviewNotes: { type: String, default: '' },
  },
  { timestamps: true }
);

leaveSchema.index({ status: 1, fromDate: -1 });
leaveSchema.index({ employee: 1, fromDate: -1 });

module.exports = mongoose.model('HrLeave', leaveSchema);
