const { createCrudRouter } = require('../utils/crudFactory');
const PayrollRegister = require('../models/PayrollRegister');

module.exports = createCrudRouter(PayrollRegister, {
  resourceName: 'Payroll Registers',
  searchFields: ['registerType', 'month', 'remarks', 'status', 'department'],
  dateField: 'dueDate',
  extraFilters: ['registerType'],
  viewPerm: 'compliance.payroll.view',
  createPerm: 'compliance.payroll.create',
  updatePerm: 'compliance.payroll.update',
  deletePerm: 'compliance.payroll.delete',
});
