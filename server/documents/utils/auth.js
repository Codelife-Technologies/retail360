const { getEffectivePermissions } = require('../../middleware/auth');

function requireDocuments(...codes) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    try {
      const permissions = await getEffectivePermissions(req.user.id);
      if (
        permissions.has('admin.all')
        || permissions.has('documents.full')
        || codes.some((code) => permissions.has(code))
      ) {
        return next();
      }
      return res.status(403).json({
        error: 'Insufficient permissions',
        required: codes,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  };
}

async function userPermissionSet(userId) {
  return getEffectivePermissions(userId);
}

function isDocumentsAdmin(permissions) {
  return permissions.has('admin.all') || permissions.has('documents.full') || permissions.has('documents.manage');
}

function isDocumentsManager(permissions) {
  return isDocumentsAdmin(permissions) || permissions.has('documents.department.view');
}

module.exports = {
  requireDocuments,
  userPermissionSet,
  isDocumentsAdmin,
  isDocumentsManager,
};
