const mongoose = require('mongoose');

const partySchema = new mongoose.Schema({
  companyName: { type: String, trim: true },
  registeredAddress: { type: String, trim: true },
  gstin: { type: String, trim: true, uppercase: true },
  pan: { type: String, trim: true, uppercase: true },
  state: { type: String, trim: true },
  contactPerson: { type: String, trim: true },
  contactNumber: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
}, { _id: false });

const addressSchema = new mongoose.Schema({
  companyName: { type: String, trim: true },
  warehouseName: { type: String, trim: true },
  address: { type: String, trim: true },
  gstin: { type: String, trim: true, uppercase: true },
  contactPerson: { type: String, trim: true },
  contactNumber: { type: String, trim: true },
}, { _id: false });

const signatorySchema = new mongoose.Schema({
  name: { type: String, trim: true },
  designation: { type: String, trim: true },
}, { _id: false });

const companyProfileSchema = new mongoose.Schema({
  singletonKey: {
    type: String,
    default: 'master',
    unique: true,
    immutable: true,
  },
  buyer: partySchema,
  billingAddress: addressSchema,
  shippingAddress: addressSchema,
  jurisdiction: { type: String, trim: true },
  termsAndConditions: [{ type: String, trim: true }],
  advancePercent: { type: Number, default: 0, min: 0, max: 100 },
  creditDays: { type: Number, default: 0, min: 0 },
  deliveryMode: { type: String, trim: true },
  incoterms: { type: String, trim: true },
  preparedBy: signatorySchema,
  checkedBy: signatorySchema,
  approvedBy: signatorySchema,
}, {
  timestamps: true,
});

module.exports = mongoose.model('CompanyProfile', companyProfileSchema);
