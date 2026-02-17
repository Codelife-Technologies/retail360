const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'retailos-jwt-secret-change-in-production';

const SKIP_AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/seed',
  '/api/health'
];

function shouldSkipAuth(req) {
  const path = (req.originalUrl || req.url || '').split('?')[0];
  return SKIP_AUTH_PATHS.some(p => path === p || path.startsWith(p));
}

async function getEffectivePermissions(userId) {
  const user = await User.findById(userId)
    .populate({ path: 'roles', populate: { path: 'permissions' } })
    .populate({ path: 'groups', populate: { path: 'roles', populate: { path: 'permissions' } } })
    .lean();
  if (!user) return new Set();
  const codes = new Set();
  (user.roles || []).forEach(r => {
    (r.permissions || []).forEach(p => {
      if (p && p.code) codes.add(p.code);
    });
  });
  (user.groups || []).forEach(g => {
    (g.roles || []).forEach(r => {
      (r.permissions || []).forEach(p => {
        if (p && p.code) codes.add(p.code);
      });
    });
  });
  return codes;
}

function authenticate(req, res, next) {
  if (shouldSkipAuth(req)) return next();
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id, username: decoded.username };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requirePermission(permissionCode) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    const permissions = await getEffectivePermissions(req.user.id);
    if (permissions.has('admin.all') || permissions.has(permissionCode)) {
      return next();
    }
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

module.exports = {
  authenticate,
  requirePermission,
  getEffectivePermissions,
  JWT_SECRET
};
