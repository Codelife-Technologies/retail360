const { createCrudRouter } = require('../utils/crudFactory');
const ComplianceAudit = require('../models/ComplianceAudit');

module.exports = createCrudRouter(ComplianceAudit, {
  resourceName: 'Audit Reports',
  searchFields: ['auditType', 'auditor', 'findings', 'actionTaken', 'status', 'department'],
  dateField: 'auditDate',
  viewPerm: 'compliance.audits.view',
  createPerm: 'compliance.audits.create',
  updatePerm: 'compliance.audits.update',
  deletePerm: 'compliance.audits.delete',
});
