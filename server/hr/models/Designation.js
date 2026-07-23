const mongoose = require('mongoose');

const designationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    department: {
      type: String,
      default: '',
      trim: true,
      maxlength: 100,
    },
    grade: { type: String, default: '', trim: true, maxlength: 40 },
    description: { type: String, default: '', trim: true, maxlength: 500 },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

designationSchema.index({ name: 1, department: 1 }, { unique: true });
designationSchema.index({ isActive: 1, sortOrder: 1, name: 1 });

module.exports = mongoose.model('HrDesignation', designationSchema);
