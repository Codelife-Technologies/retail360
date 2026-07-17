const { createCrudRouter } = require('../utils/crudFactory');
const LabourRegister = require('../models/LabourRegister');

module.exports = createCrudRouter(LabourRegister, {
  resourceName: 'Labour Registers',
  searchFields: ['registerType', 'employeeName', 'employeeId', 'details', 'remarks', 'department'],
  dateField: 'entryDate',
  extraFilters: ['registerType'],
  viewPerm: 'compliance.labour.view',
  createPerm: 'compliance.labour.create',
  updatePerm: 'compliance.labour.update',
  deletePerm: 'compliance.labour.delete',
});
