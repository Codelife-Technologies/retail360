const mongoose = require('mongoose');

const holidaySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    day: { type: String, default: '' },
    type: {
      type: String,
      enum: ['National', 'Regional', 'Company', 'Restricted'],
      default: 'Company',
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
  },
  { timestamps: true }
);

holidaySchema.index({ date: 1 });
holidaySchema.index({ status: 1, date: 1 });

module.exports = mongoose.model('HrHoliday', holidaySchema);
