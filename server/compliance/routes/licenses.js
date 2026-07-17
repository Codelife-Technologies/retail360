const { createCrudRouter } = require('../utils/crudFactory');
const ComplianceLicense = require('../models/ComplianceLicense');
const { computeLicenseStatus } = require('../utils/licenseStatus');

module.exports = createCrudRouter(ComplianceLicense, {
  resourceName: 'Licenses',
  searchFields: ['licenseName', 'licenseNumber', 'department', 'responsiblePerson', 'status'],
  dateField: 'expiryDate',
  viewPerm: 'compliance.licenses.view',
  createPerm: 'compliance.licenses.create',
  updatePerm: 'compliance.licenses.update',
  deletePerm: 'compliance.licenses.delete',
  beforeSave: async (payload) => {
    if (payload.expiryDate) {
      payload.status = computeLicenseStatus(payload.expiryDate);
    }
    return payload;
  },
});
