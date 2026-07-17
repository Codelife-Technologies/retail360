const { getEffectivePermissions } = require('../../middleware/auth');

/**
 * Allow access if user has admin.all, compliance.full, or any of the given codes.
 */
function requireCompliance(...codes) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    try {
      const permissions = await getEffectivePermissions(req.user.id);
      if (permissions.has('admin.all') || permissions.has('compliance.full')) {
        return next();
      }
      if (codes.some((code) => permissions.has(code))) {
        return next();
      }
      return res.status(403).json({ error: 'Insufficient permissions' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };
}

function requireComplianceAccess() {
  return requireCompliance(
    'compliance.access',
    'compliance.full',
    'compliance.dashboard.view',
    'compliance.company.view',
    'compliance.filingMaster.view',
    'compliance.filings.view',
    'compliance.calendar.view',
    'compliance.documents.view',
    'compliance.reports.view'
  );
}

module.exports = { requireCompliance, requireComplianceAccess };
