const { createCrudRouter } = require('../utils/crudFactory');
const ComplianceTask = require('../models/ComplianceTask');

module.exports = createCrudRouter(ComplianceTask, {
  resourceName: 'Compliance Tasks',
  searchFields: ['title', 'category', 'status', 'department', 'remarks'],
  dateField: 'dueDate',
  viewPerm: 'compliance.dashboard.view',
  createPerm: 'compliance.full',
  updatePerm: 'compliance.full',
  deletePerm: 'compliance.full',
});
