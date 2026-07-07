const mongoose = require('mongoose');

const employeeTaskSchema = new mongoose.Schema(
  {
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'HrEmployee', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    dueDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['Pending', 'In Progress', 'Completed'],
      default: 'Pending',
    },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'Medium',
    },
    assignedBy: { type: String, default: 'HR' },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

employeeTaskSchema.index({ employee: 1, dueDate: 1, status: 1 });

module.exports = mongoose.model('HrEmployeeTask', employeeTaskSchema);
