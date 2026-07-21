const mongoose = require('mongoose');

const FOLDER_SCOPES = ['AI Generator', 'Manual Upload'];

const folderSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    /** Which document source this folder organizes */
    sourceScope: {
      type: String,
      enum: FOLDER_SCOPES,
      required: true,
      default: 'Manual Upload',
    },
    /** null = top-level folder */
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DocumentFolder',
      default: null,
    },
    /** User-controlled order within the same parent */
    sortOrder: {
      type: Number,
      default: 0,
    },
    createdBy: { type: String, trim: true, default: '' },
    createdByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    department: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['Active', 'Deleted'],
      default: 'Active',
    },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

folderSchema.index({ status: 1, sourceScope: 1, parentId: 1, sortOrder: 1, name: 1 });
folderSchema.index({ createdByUserId: 1, status: 1 });
folderSchema.index(
  { name: 1, parentId: 1, sourceScope: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'Active' },
    collation: { locale: 'en', strength: 2 },
  }
);

module.exports = mongoose.model('DocumentFolder', folderSchema);
module.exports.FOLDER_SCOPES = FOLDER_SCOPES;
