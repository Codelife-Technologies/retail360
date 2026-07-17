const mongoose = require('mongoose');

const officeLocationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    radiusMeters: { type: Number, required: true, min: 10, max: 50000, default: 200 },
    address: { type: String, default: '', trim: true },
    assignedDepartments: [{ type: String, trim: true }],
    assignedEmployees: [{ type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee' }],
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    notes: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

officeLocationSchema.index({ name: 1 }, { unique: true });
officeLocationSchema.index({ isActive: 1, isDefault: 1 });
officeLocationSchema.index({ assignedEmployees: 1 });
officeLocationSchema.index({ assignedDepartments: 1 });

module.exports = mongoose.model('HrOfficeLocation', officeLocationSchema);
