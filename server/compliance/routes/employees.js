const { createCrudRouter } = require('../utils/crudFactory');
const EmployeeCompliance = require('../models/EmployeeCompliance');

module.exports = createCrudRouter(EmployeeCompliance, {
  resourceName: 'Employee Compliance',
  searchFields: ['employeeId', 'name', 'department', 'pan', 'uan', 'esicNumber', 'status', 'kycStatus'],
  dateField: null,
  viewPerm: 'compliance.employees.view',
  createPerm: 'compliance.employees.create',
  updatePerm: 'compliance.employees.update',
  deletePerm: 'compliance.employees.delete',
});
