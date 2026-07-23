const mongoose = require('mongoose');

/**
 * HSN / SAC tax master — source of truth for PO GST rates and related details.
 */
const hsnMasterSchema = new mongoose.Schema(
  {
    hsnCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    /** Total GST % (IGST rate). CGST/SGST default to half when not set. */
    gstRate: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max: 100,
    },
    cgstRate: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    sgstRate: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    igstRate: {
      type: Number,
      default: null,
      min: 0,
      max: 100,
    },
    cessRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    /** Default unit of measure hint for PO lines using this HSN */
    defaultUom: {
      type: String,
      trim: true,
      default: 'PCS',
      uppercase: true,
    },
    chapter: {
      type: String,
      trim: true,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    effectiveFrom: {
      type: Date,
      default: null,
    },
    effectiveTo: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

hsnMasterSchema.index({ hsnCode: 1 });
hsnMasterSchema.index({ isActive: 1, hsnCode: 1 });
hsnMasterSchema.index({ description: 1 });

hsnMasterSchema.pre('validate', function normalizeRates(next) {
  if (this.hsnCode) {
    this.hsnCode = String(this.hsnCode).trim().toUpperCase();
  }
  const gst = Number(this.gstRate) || 0;
  this.gstRate = gst;
  if (this.igstRate == null || this.igstRate === '') {
    this.igstRate = gst;
  }
  if (this.cgstRate == null || this.cgstRate === '') {
    this.cgstRate = Math.round((gst / 2) * 100) / 100;
  }
  if (this.sgstRate == null || this.sgstRate === '') {
    this.sgstRate = Math.round((gst / 2) * 100) / 100;
  }
  if (this.cessRate == null || this.cessRate === '') {
    this.cessRate = 0;
  }
  next();
});

/** Effective GST % for a document date (defaults to today). */
hsnMasterSchema.methods.getEffectiveGstRate = function getEffectiveGstRate(asOf = new Date()) {
  const when = asOf instanceof Date ? asOf : new Date(asOf);
  if (this.effectiveFrom && when < this.effectiveFrom) return null;
  if (this.effectiveTo && when > this.effectiveTo) return null;
  return Number(this.gstRate) || 0;
};

module.exports = mongoose.model('HsnMaster', hsnMasterSchema);
