const { createCrudRouter } = require('../utils/crudFactory');
const TdsFiling = require('../models/TdsFiling');

module.exports = createCrudRouter(TdsFiling, {
  resourceName: 'TDS Filings',
  searchFields: ['tdsType', 'quarter', 'challanNumber', 'remarks', 'status'],
  dateField: 'dueDate',
  viewPerm: 'compliance.tds.view',
  createPerm: 'compliance.tds.create',
  updatePerm: 'compliance.tds.update',
  deletePerm: 'compliance.tds.delete',
});
