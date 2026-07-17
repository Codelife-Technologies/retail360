const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    employeeId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    photo: { type: String, default: '' },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, default: '', trim: true },
    department: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    officeLocation: { type: mongoose.Schema.Types.ObjectId, ref: 'HrOfficeLocation', default: null },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    joiningDate: { type: Date, required: true },
    employmentType: {
      type: String,
      enum: ['Full-time', 'Part-time', 'Contract', 'Intern'],
      default: 'Full-time',
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive', 'On Leave', 'Terminated'],
      default: 'Active',
    },
    basicSalary: { type: Number, default: 0, min: 0 },
    personalInfo: {
      dateOfBirth: { type: Date },
      gender: { type: String, enum: ['Male', 'Female', 'Other', ''], default: '' },
      maritalStatus: { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed', ''], default: '' },
    },
    contactInfo: {
      address: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      pinCode: { type: String, default: '' },
    },
    emergencyContact: {
      name: { type: String, default: '' },
      relationship: { type: String, default: '' },
      phone: { type: String, default: '' },
    },
    bankDetails: {
      bankName: { type: String, default: '' },
      accountNumber: { type: String, default: '' },
      ifscCode: { type: String, default: '' },
      accountHolderName: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

employeeSchema.index({ firstName: 'text', lastName: 'text', email: 'text', employeeId: 'text' });
employeeSchema.index({ department: 1, status: 1 });

employeeSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

employeeSchema.set('toJSON', { virtuals: true });
employeeSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('HrEmployee', employeeSchema);
