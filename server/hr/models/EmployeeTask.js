const mongoose = require('mongoose');
const { getDateKeyInAppTz } = require('../../utils/appTimezone');

const employeeTaskSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    startDate: { type: Date, required: true },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'On Hold', 'Completed', 'Backlog', 'Cancelled'],
      default: 'Pending',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },
    source: {
      type: String,
      enum: ['HR', 'Personal'],
      default: 'HR',
    },
    assignedBy: { type: String, default: 'HR' },
    completedAt: { type: Date },
    delayReason: { type: String, default: '', trim: true },
    delayReasonUpdatedAt: { type: Date },
  },
  { timestamps: true }
);

employeeTaskSchema.pre('save', function prepareDates(next) {
  if (!this.startDate && this.dueDate) {
    this.startDate = this.dueDate;
  }
  if (!this.dueDate && this.startDate) {
    this.dueDate = this.startDate;
  }
  if (this.startDate && this.dueDate && this.startDate > this.dueDate) {
    this.dueDate = this.startDate;
  }

  // Overdue pending → Backlog only when deadline calendar day is before today (app TZ).
  // Same-day deadlines stay Pending.
  if (this.status === 'Pending' && this.dueDate) {
    const dueKey = getDateKeyInAppTz(this.dueDate);
    const todayKey = getDateKeyInAppTz(new Date());
    if (dueKey && todayKey && dueKey < todayKey) {
      this.status = 'Backlog';
    }
  }

  // Same-day (or future) backlog should not stay backlog
  if (this.status === 'Backlog' && this.dueDate) {
    const dueKey = getDateKeyInAppTz(this.dueDate);
    const todayKey = getDateKeyInAppTz(new Date());
    if (dueKey && todayKey && dueKey >= todayKey) {
      this.status = 'Pending';
    }
  }

  next();
});

employeeTaskSchema.index({ employee: 1, dueDate: 1, status: 1 });
employeeTaskSchema.index({ employee: 1, startDate: 1, status: 1 });

module.exports = mongoose.model('HrEmployeeTask', employeeTaskSchema);
