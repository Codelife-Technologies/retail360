const mongoose = require('mongoose');

const DOCUMENT_TYPES = ['Image', 'Document'];
const DOCUMENT_SOURCES = ['AI Generator', 'Manual Upload'];
const DOCUMENT_STATUSES = ['Active', 'Archived', 'Deleted'];

const documentSchema = new mongoose.Schema(
  {
    documentType: {
      type: String,
      enum: DOCUMENT_TYPES,
      required: true,
    },
    source: {
      type: String,
      enum: DOCUMENT_SOURCES,
      required: true,
    },
    sku: { type: String, trim: true, default: '' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    productName: { type: String, trim: true, default: '' },
    category: { type: String, trim: true, default: '' },
    subCategory: { type: String, trim: true, default: '' },
    brand: { type: String, trim: true, default: '' },
    title: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },
    tags: [{ type: String, trim: true }],
    fileName: { type: String, required: true, trim: true },
    fileExtension: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    fileSize: { type: Number, default: 0 },
    fileUrl: { type: String, required: true, trim: true },
    thumbnailUrl: { type: String, trim: true, default: '' },
    storagePath: { type: String, required: true, trim: true },
    thumbnailPath: { type: String, trim: true, default: '' },
    uploadedBy: { type: String, trim: true, default: '' },
    uploadedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    department: { type: String, trim: true, default: '' },
    /** Logical folder for organizing employee documents (null = unfiled) */
    folderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentFolder',
      default: null,
    },
    status: {
      type: String,
      enum: DOCUMENT_STATUSES,
      default: 'Active',
    },
    version: { type: Number, default: 1 },
    promptOrder: { type: Number, default: null },
    promptText: { type: String, trim: true, default: '' },
    /** Unique key for AI source files — prevents duplicate records for the same generated file */
    sourceFileKey: { type: String, trim: true, default: '' },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

documentSchema.index({ source: 1, status: 1, createdAt: -1 });
documentSchema.index({ sku: 1, source: 1, status: 1 });
documentSchema.index({ productId: 1 });
documentSchema.index({ uploadedByUserId: 1, status: 1 });
documentSchema.index({ folderId: 1, status: 1, createdAt: -1 });
documentSchema.index({ title: 'text', productName: 'text', sku: 'text', fileName: 'text', tags: 'text' });
documentSchema.index(
  { sourceFileKey: 1 },
  { unique: true, partialFilterExpression: { sourceFileKey: { $type: 'string', $gt: '' } } }
);

module.exports = mongoose.model('ManagedDocument', documentSchema);
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
module.exports.DOCUMENT_SOURCES = DOCUMENT_SOURCES;
module.exports.DOCUMENT_STATUSES = DOCUMENT_STATUSES;
