const { getEffectivePermissions } = require('../../middleware/auth');

function requireFinance(...codes) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    try {
      const permissions = await getEffectivePermissions(req.user.id);
      if (permissions.has('admin.all') || permissions.has('finance.full')) {
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

module.exports = { requireFinance };
