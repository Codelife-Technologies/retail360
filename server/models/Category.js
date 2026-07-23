const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  hsnCode: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  /** GST % for this HSN — used on PO/Sales tax calculation */
  gstRate: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  description: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Indexes for faster searches
categorySchema.index({ name: 1 });
categorySchema.index({ hsnCode: 1 });

module.exports = mongoose.model('Category', categorySchema);

