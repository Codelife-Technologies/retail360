const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'documents' },
    maxUploadBytes: { type: Number, default: 25 * 1024 * 1024 },
    allowedExtensions: {
      type: [String],
      default: [
        '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
        '.jpg', '.jpeg', '.png', '.gif', '.webp',
        '.zip', '.txt', '.csv',
      ],
    },
    retentionDaysInTrash: { type: Number, default: 30 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DocumentSettings', settingsSchema);
