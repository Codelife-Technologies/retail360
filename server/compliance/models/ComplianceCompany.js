const mongoose = require('mongoose');

const complianceCompanySchema = new mongoose.Schema(
  {
    singletonKey: {
      type: String,
      default: 'compliance',
      unique: true,
      immutable: true,
    },
    companyName: { type: String, trim: true, default: '' },
    cin: { type: String, trim: true, uppercase: true, default: '' },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    pan: { type: String, trim: true, uppercase: true, default: '' },
    tan: { type: String, trim: true, uppercase: true, default: '' },
    address: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    contactPerson: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComplianceCompany', complianceCompanySchema);
