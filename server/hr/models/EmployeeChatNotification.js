const mongoose = require('mongoose');

const employeeChatNotificationSchema = new mongoose.Schema(
  {
    message: { type: mongoose.Schema.Types.ObjectId, ref: 'EmployeeChatMessage', required: true },
    recipientUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipientEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee' },
    senderName: { type: String, required: true, trim: true },
    bodyPreview: { type: String, required: true, trim: true, maxlength: 280 },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

employeeChatNotificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 });
employeeChatNotificationSchema.index({ recipientUser: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('EmployeeChatNotification', employeeChatNotificationSchema);
