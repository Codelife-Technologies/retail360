const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    module: {
      type: String,
      enum: ['auth', 'users', 'roles', 'groups', 'permissions', 'system'],
      default: 'system',
      index: true,
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    actorUsername: {
      type: String,
      trim: true,
      default: 'System',
    },
    targetType: {
      type: String,
      trim: true,
    },
    targetId: {
      type: String,
      trim: true,
      index: true,
    },
    targetLabel: {
      type: String,
      trim: true,
    },
    summary: {
      type: String,
      trim: true,
      required: true,
    },
    changes: {
      type: mongoose.Schema.Types.Mixed,
    },
    ipAddress: {
      type: String,
      trim: true,
    },
    performedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { timestamps: true }
);

activityLogSchema.index({ performedAt: -1 });
activityLogSchema.index({ module: 1, performedAt: -1 });
activityLogSchema.index({ actorUsername: 1, performedAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
