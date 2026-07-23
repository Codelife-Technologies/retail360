const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

departmentSchema.index({ code: 1 }, { unique: true });
departmentSchema.index({ name: 1 }, { unique: true });
departmentSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

module.exports = mongoose.model('HrDepartment', departmentSchema);
