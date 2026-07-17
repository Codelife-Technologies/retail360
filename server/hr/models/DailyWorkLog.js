const mongoose = require('mongoose');
const { startOfDayInAppTz } = require('../../utils/appTimezone');

const workLogEntrySchema = new mongoose.Schema(
  {
    description: { type: String, required: true, trim: true },
    details: { type: String, default: '', trim: true },
    timeSpentMinutes: { type: Number, required: true, min: 1 },
  },
  { _id: true }
);

const dailyWorkLogSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true },
    date: { type: Date, required: true },
    entries: { type: [workLogEntrySchema], default: [] },
    totalMinutes: { type: Number, default: 0, min: 0 },
    notes: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Draft', 'Submitted'],
      default: 'Draft',
    },
    submittedAt: { type: Date },
  },
  { timestamps: true }
);

dailyWorkLogSchema.pre('save', function normalizeWorkLog(next) {
  // Always normalize to app-timezone midnight (Asia/Kolkata), never server-local setHours —
  // setHours on a UTC host shifts the calendar day and breaks the unique employee+date index.
  if (this.date) {
    this.date = startOfDayInAppTz(this.date);
  }
  this.totalMinutes = (this.entries || []).reduce(
    (sum, entry) => sum + (Number(entry.timeSpentMinutes) || 0),
    0
  );
  if (this.status === 'Submitted' && !this.submittedAt) {
    this.submittedAt = new Date();
  }
  if (this.status === 'Draft') {
    this.submittedAt = null;
  }
  next();
});

dailyWorkLogSchema.index({ employee: 1, date: 1 }, { unique: true });
dailyWorkLogSchema.index({ date: 1, status: 1 });

module.exports = mongoose.model('HrDailyWorkLog', dailyWorkLogSchema);
