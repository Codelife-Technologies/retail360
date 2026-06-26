const mongoose = require('mongoose');

const locationSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    uppercase: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    trim: true,
    default: 'India'
  },
  pincode: {
    type: String,
    trim: true
  },
  contactPerson: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isHomeBranch: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true
});

// Indexes for faster searches
locationSchema.index({ code: 1 });
locationSchema.index({ name: 1 });
locationSchema.index({ city: 1 });
locationSchema.index({ isActive: 1 });
locationSchema.index({ isHomeBranch: 1 });

module.exports = mongoose.model('Location', locationSchema);

