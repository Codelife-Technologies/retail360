const mongoose = require('mongoose');
const DocumentShare = require('../models/DocumentShare');
const DocumentFolder = require('../models/DocumentFolder');
const Document = require('../models/Document');
const User = require('../../models/User');

function toId(value) {
  if (!value) return null;
  if (mongoose.Types.ObjectId.isValid(value)) return String(value);
  return null;
}

function isShareActive(share) {
  if (!share || share.status !== 'Active') return false;
  if (share.expiresAt && new Date(share.expiresAt).getTime() < Date.now()) return false;
  return true;
}

/**
 * Load folder/document IDs shared with the current user into scope.
 */
async function enrichScopeWithShares(scope = {}) {
  const userId = toId(scope.userId);
  if (!userId || scope.admin) {
    return {
      ...scope,
      sharedViewFolderIds: new Set(),
      sharedEditFolderIds: new Set(),
      sharedViewDocIds: new Set(),
      sharedEditDocIds: new Set(),
    };
  }

  const shares = await DocumentShare.find({
    status: 'Active',
    sharedWithUserId: userId,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  })
    .select('resourceType resourceId role')
    .lean();

  const sharedViewFolderIds = new Set();
  const sharedEditFolderIds = new Set();
  const sharedViewDocIds = new Set();
  const sharedEditDocIds = new Set();

  shares.forEach((share) => {
    const id = String(share.resourceId);
    if (share.resourceType === 'folder') {
      sharedViewFolderIds.add(id);
      if (share.role === 'editor') sharedEditFolderIds.add(id);
    } else if (share.resourceType === 'document') {
      sharedViewDocIds.add(id);
      if (share.role === 'editor') sharedEditDocIds.add(id);
    }
  });

  return {
    ...scope,
    sharedViewFolderIds,
    sharedEditFolderIds,
    sharedViewDocIds,
    sharedEditDocIds,
  };
}

function hasFolderViewShare(folder, scope = {}) {
  const id = String(folder?._id || folder || '');
  if (!id) return false;
  return Boolean(
    scope.sharedViewFolderIds?.has(id) ||
      scope.sharedEditFolderIds?.has(id)
  );
}

function hasFolderEditShare(folder, scope = {}) {
  const id = String(folder?._id || folder || '');
  if (!id) return false;
  return Boolean(scope.sharedEditFolderIds?.has(id));
}

function hasDocViewShare(doc, scope = {}) {
  const id = String(doc?._id || doc || '');
  if (!id) return false;
  return Boolean(scope.sharedViewDocIds?.has(id) || scope.sharedEditDocIds?.has(id));
}

function hasDocEditShare(doc, scope = {}) {
  const id = String(doc?._id || doc || '');
  if (!id) return false;
  return Boolean(scope.sharedEditDocIds?.has(id));
}

async function assertCanManageShares({ resourceType, resourceId, scope, user }) {
  if (scope.admin) return { ok: true };

  if (resourceType === 'folder') {
    const folder = await DocumentFolder.findById(resourceId);
    if (!folder || folder.status === 'Deleted') throw new Error('Folder not found');
    if (String(folder.createdByUserId || '') !== String(scope.userId)) {
      throw new Error('Only the owner can manage sharing');
    }
    return { folder };
  }

  const doc = await Document.findById(resourceId);
  if (!doc || doc.status === 'Deleted') throw new Error('Document not found');
  const ownerId = String(doc.uploadedByUserId || '');
  if (ownerId && ownerId !== String(scope.userId)) {
    throw new Error('Only the owner can manage sharing');
  }
  return { doc };
}

async function listShareRecipients({ search = '', limit = 30 } = {}) {
  const query = { isActive: { $ne: false } };
  const term = String(search || '').trim();
  if (term) {
    const rx = { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    query.$or = [{ username: rx }, { email: rx }];
  }
  const users = await User.find(query)
    .select('username email isActive')
    .sort({ username: 1 })
    .limit(Math.min(Number(limit) || 30, 50))
    .lean();
  return users.map((u) => ({
    _id: u._id,
    username: u.username,
    email: u.email,
  }));
}

async function listSharesForResource(resourceType, resourceId) {
  const shares = await DocumentShare.find({
    resourceType,
    resourceId,
    status: 'Active',
  })
    .populate('sharedWithUserId', 'username email')
    .populate('sharedByUserId', 'username email')
    .sort({ createdAt: -1 })
    .lean();

  return shares.map((s) => ({
    ...s,
    sharedWith: s.sharedWithUserId,
    sharedBy: s.sharedByUserId,
    isExpired: Boolean(s.expiresAt && new Date(s.expiresAt).getTime() < Date.now()),
  }));
}

async function createShare({
  resourceType,
  resourceId,
  sharedWithUserId,
  role = 'viewer',
  message = '',
  expiresAt = null,
  scope,
  user,
}) {
  if (!['folder', 'document'].includes(resourceType)) {
    throw new Error('Invalid resource type');
  }
  if (!['viewer', 'editor'].includes(role)) {
    throw new Error('Role must be viewer or editor');
  }
  const targetUserId = toId(sharedWithUserId);
  if (!targetUserId) throw new Error('Employee is required');
  if (targetUserId === String(scope.userId)) {
    throw new Error('You already own this item');
  }

  const target = await User.findById(targetUserId).select('_id username email isActive');
  if (!target || target.isActive === false) {
    throw new Error('Employee not found or inactive');
  }

  await assertCanManageShares({ resourceType, resourceId, scope, user });

  const existing = await DocumentShare.findOne({
    resourceType,
    resourceId,
    sharedWithUserId: targetUserId,
    status: 'Active',
  });

  if (existing) {
    existing.role = role;
    existing.message = message ? String(message).trim() : existing.message;
    existing.expiresAt = expiresAt ? new Date(expiresAt) : null;
    existing.sharedByUserId = scope.userId;
    await existing.save();
    return existing.populate([
      { path: 'sharedWithUserId', select: 'username email' },
      { path: 'sharedByUserId', select: 'username email' },
    ]);
  }

  try {
    const share = await DocumentShare.create({
      resourceType,
      resourceId,
      sharedWithUserId: targetUserId,
      role,
      sharedByUserId: scope.userId,
      message: message ? String(message).trim() : '',
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      status: 'Active',
    });
    return share.populate([
      { path: 'sharedWithUserId', select: 'username email' },
      { path: 'sharedByUserId', select: 'username email' },
    ]);
  } catch (err) {
    if (err && err.code === 11000) {
      throw new Error('Already shared with this employee');
    }
    throw err;
  }
}

async function updateShare(shareId, patch = {}, scope = {}) {
  const share = await DocumentShare.findById(shareId);
  if (!share || share.status === 'Revoked') throw new Error('Share not found');

  await assertCanManageShares({
    resourceType: share.resourceType,
    resourceId: share.resourceId,
    scope,
  });

  if (patch.role != null) {
    if (!['viewer', 'editor'].includes(patch.role)) {
      throw new Error('Role must be viewer or editor');
    }
    share.role = patch.role;
  }
  if (patch.expiresAt !== undefined) {
    share.expiresAt = patch.expiresAt ? new Date(patch.expiresAt) : null;
  }
  if (patch.message !== undefined) {
    share.message = String(patch.message || '').trim();
  }
  await share.save();
  return share.populate([
    { path: 'sharedWithUserId', select: 'username email' },
    { path: 'sharedByUserId', select: 'username email' },
  ]);
}

async function revokeShare(shareId, scope = {}) {
  const share = await DocumentShare.findById(shareId);
  if (!share || share.status === 'Revoked') throw new Error('Share not found');

  const isRecipient = String(share.sharedWithUserId) === String(scope.userId);
  if (!isRecipient) {
    await assertCanManageShares({
      resourceType: share.resourceType,
      resourceId: share.resourceId,
      scope,
    });
  }

  share.status = 'Revoked';
  await share.save();
  return { revoked: true, id: share._id };
}

async function listSharesWithMe(scope = {}) {
  const userId = toId(scope.userId);
  if (!userId) return { folders: [], documents: [] };

  const shares = await DocumentShare.find({
    status: 'Active',
    sharedWithUserId: userId,
    $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }],
  })
    .populate('sharedByUserId', 'username email')
    .sort({ updatedAt: -1 })
    .lean();

  const folderIds = shares.filter((s) => s.resourceType === 'folder').map((s) => s.resourceId);
  const docIds = shares.filter((s) => s.resourceType === 'document').map((s) => s.resourceId);

  const [folders, documents] = await Promise.all([
    folderIds.length
      ? DocumentFolder.find({ _id: { $in: folderIds }, status: 'Active' }).lean()
      : [],
    docIds.length
      ? Document.find({ _id: { $in: docIds }, status: { $ne: 'Deleted' } }).lean()
      : [],
  ]);

  const folderMap = Object.fromEntries(folders.map((f) => [String(f._id), f]));
  const docMap = Object.fromEntries(documents.map((d) => [String(d._id), d]));

  return {
    folders: shares
      .filter((s) => s.resourceType === 'folder' && folderMap[String(s.resourceId)])
      .map((s) => ({
        ...folderMap[String(s.resourceId)],
        _driveKind: 'folder',
        shareRole: s.role,
        sharedBy: s.sharedByUserId,
        shareId: s._id,
        sharedAt: s.createdAt,
      })),
    documents: shares
      .filter((s) => s.resourceType === 'document' && docMap[String(s.resourceId)])
      .map((s) => ({
        ...docMap[String(s.resourceId)],
        _driveKind: 'document',
        shareRole: s.role,
        sharedBy: s.sharedByUserId,
        shareId: s._id,
        sharedAt: s.createdAt,
      })),
  };
}

module.exports = {
  enrichScopeWithShares,
  hasFolderViewShare,
  hasFolderEditShare,
  hasDocViewShare,
  hasDocEditShare,
  isShareActive,
  listShareRecipients,
  listSharesForResource,
  createShare,
  updateShare,
  revokeShare,
  listSharesWithMe,
  assertCanManageShares,
};
