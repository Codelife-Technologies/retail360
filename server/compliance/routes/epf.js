const { createCrudRouter } = require('../utils/crudFactory');
const EpfFiling = require('../models/EpfFiling');

module.exports = createCrudRouter(EpfFiling, {
  resourceName: 'EPF Filings',
  searchFields: ['month', 'challanNumber', 'remarks', 'status'],
  dateField: 'dueDate',
  viewPerm: 'compliance.epf.view',
  createPerm: 'compliance.epf.create',
  updatePerm: 'compliance.epf.update',
  deletePerm: 'compliance.epf.delete',
});
