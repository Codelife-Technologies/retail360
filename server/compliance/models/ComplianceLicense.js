const mongoose = require('mongoose');
const { computeLicenseStatus } = require('../utils/licenseStatus');

const licenseSchema = new mongoose.Schema(
  {
    licenseName: { type: String, trim: true, required: true },
    licenseNumber: { type: String, trim: true, default: '' },
    issueDate: { type: Date },
    expiryDate: { type: Date },
    department: { type: String, trim: true, default: '' },
    responsiblePerson: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['Valid', 'Expiring Soon', 'Expired'],
      default: 'Valid',
    },
    attachment: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

licenseSchema.pre('save', function computeStatus(next) {
  this.status = computeLicenseStatus(this.expiryDate);
  next();
});

licenseSchema.pre('findOneAndUpdate', function computeStatusOnUpdate(next) {
  const update = this.getUpdate() || {};
  const expiryDate = update.expiryDate ?? update.$set?.expiryDate;
  if (expiryDate !== undefined) {
    const status = computeLicenseStatus(expiryDate);
    if (update.$set) update.$set.status = status;
    else update.status = status;
    this.setUpdate(update);
  }
  next();
});

module.exports = mongoose.model('ComplianceLicense', licenseSchema);
