const mongoose = require('mongoose');

const SHARE_ROLES = ['viewer', 'editor'];
const RESOURCE_TYPES = ['folder', 'document'];
const SHARE_STATUSES = ['Active', 'Revoked'];

const documentShareSchema = new mongoose.Schema(
  {
    resourceType: {
      type: String,
      enum: RESOURCE_TYPES,
      required: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    sharedWithUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: SHARE_ROLES,
      default: 'viewer',
      required: true,
    },
    sharedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: { type: String, trim: true, default: '', maxlength: 500 },
    expiresAt: { type: Date, default: null },
    status: {
      type: String,
      enum: SHARE_STATUSES,
      default: 'Active',
    },
  },
  { timestamps: true }
);

documentShareSchema.index(
  { resourceType: 1, resourceId: 1, sharedWithUserId: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'Active' } }
);
documentShareSchema.index({ sharedWithUserId: 1, status: 1, role: 1 });

module.exports = mongoose.model('DocumentShare', documentShareSchema);
module.exports.SHARE_ROLES = SHARE_ROLES;
module.exports.RESOURCE_TYPES = RESOURCE_TYPES;
module.exports.SHARE_STATUSES = SHARE_STATUSES;
