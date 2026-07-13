const mongoose = require('mongoose');

const mentionSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, trim: true },
  },
  { _id: false }
);

const employeeChatMessageSchema = new mongoose.Schema(
  {
    senderUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true },
    senderName: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true, maxlength: 2000 },
    mentions: { type: [mentionSchema], default: [] },
  },
  { timestamps: true }
);

employeeChatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7200 });
employeeChatMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('EmployeeChatMessage', employeeChatMessageSchema);
