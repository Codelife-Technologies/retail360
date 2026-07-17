const { createCrudRouter } = require('../utils/crudFactory');
const GstFiling = require('../models/GstFiling');

module.exports = createCrudRouter(GstFiling, {
  resourceName: 'GST Filings',
  searchFields: ['filingType', 'returnPeriod', 'remarks', 'status'],
  dateField: 'dueDate',
  viewPerm: 'compliance.gst.view',
  createPerm: 'compliance.gst.create',
  updatePerm: 'compliance.gst.update',
  deletePerm: 'compliance.gst.delete',
});
