const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true },
    date: { type: Date, required: true },
    checkIn: { type: String, default: '' },
    checkOut: { type: String, default: '' },
    workingHours: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Half Day', 'Leave', 'Holiday', 'Work From Home'],
      default: 'Present',
    },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });

module.exports = mongoose.model('HrAttendance', attendanceSchema);
