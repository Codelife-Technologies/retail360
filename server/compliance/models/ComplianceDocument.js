const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema(
  {
    fileName: { type: String, trim: true, required: true },
    originalName: { type: String, trim: true, default: '' },
    category: {
      type: String,
      enum: [
        'GST',
        'TDS',
        'Payroll',
        'EPF',
        'ESIC',
        'Licenses',
        'Employee Documents',
        'Audit Reports',
      ],
      required: true,
    },
    uploadDate: { type: Date, default: Date.now },
    uploadedBy: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 },
    storagePath: { type: String, trim: true, required: true },
    department: { type: String, trim: true, default: '' },
    remarks: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ComplianceDocument', documentSchema);
