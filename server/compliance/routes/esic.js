const { createCrudRouter } = require('../utils/crudFactory');
const EsicFiling = require('../models/EsicFiling');

module.exports = createCrudRouter(EsicFiling, {
  resourceName: 'ESIC Filings',
  searchFields: ['month', 'challanNumber', 'remarks', 'status'],
  dateField: 'dueDate',
  viewPerm: 'compliance.esic.view',
  createPerm: 'compliance.esic.create',
  updatePerm: 'compliance.esic.update',
  deletePerm: 'compliance.esic.delete',
});
