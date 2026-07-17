const ActivityLog = require('../models/ActivityLog');

function getClientIp(req) {
  if (!req) return '';
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection?.remoteAddress || '';
}

async function logActivity({
  action,
  module = 'system',
  actor = null,
  actorUsername = 'System',
  targetType = '',
  targetId = '',
  targetLabel = '',
  summary,
  changes,
  ipAddress = '',
  req = null,
}) {
  try {
    return await ActivityLog.create({
      action,
      module,
      actor: actor || undefined,
      actorUsername: actorUsername || 'System',
      targetType,
      targetId: targetId ? String(targetId) : '',
      targetLabel,
      summary: summary || action,
      changes,
      ipAddress: ipAddress || getClientIp(req),
      performedAt: new Date(),
    });
  } catch (error) {
    // Never block the main request if audit write fails
    console.error('Failed to write activity log:', error.message);
    return null;
  }
}

function logFromRequest(req, payload) {
  return logActivity({
    ...payload,
    actor: payload.actor || req?.user?.id || null,
    actorUsername: payload.actorUsername || req?.user?.username || 'System',
    req,
  });
}

async function listActivityLogs({
  page = 1,
  limit = 25,
  module,
  action,
  search,
  actor,
  startDate,
  endDate,
} = {}) {
  const query = {};

  if (module) query.module = module;
  if (action) query.action = action;
  if (actor) query.actor = actor;

  if (startDate || endDate) {
    query.performedAt = {};
    if (startDate) query.performedAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      query.performedAt.$lte = end;
    }
  }

  if (search && String(search).trim()) {
    const term = String(search).trim();
    query.$or = [
      { summary: { $regex: term, $options: 'i' } },
      { actorUsername: { $regex: term, $options: 'i' } },
      { targetLabel: { $regex: term, $options: 'i' } },
      { action: { $regex: term, $options: 'i' } },
      { module: { $regex: term, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
  const skip = (pageNum - 1) * limitNum;

  const [data, total] = await Promise.all([
    ActivityLog.find(query)
      .populate('actor', 'username email')
      .sort({ performedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    ActivityLog.countDocuments(query),
  ]);

  return {
    data,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  };
}

module.exports = {
  logActivity,
  logFromRequest,
  listActivityLogs,
  getClientIp,
};
