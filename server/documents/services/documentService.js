const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Document = require('../models/Document');
const DocumentFolder = require('../models/DocumentFolder');
const DocumentSettings = require('../models/DocumentSettings');
const Product = require('../../models/Product');
const {
  AI_DIR,
  MANUAL_DIR,
  ensureDocumentFolders,
  extensionOf,
  isImageMime,
  toPublicUrl,
  relativeFromUploads,
  generateThumbnail,
} = require('../utils/storage');

ensureDocumentFolders();

async function getSettings() {
  let settings = await DocumentSettings.findOne({ key: 'documents' });
  if (!settings) {
    settings = await DocumentSettings.create({ key: 'documents' });
  }
  return settings;
}

async function updateSettings(patch = {}) {
  const settings = await getSettings();
  if (patch.maxUploadBytes != null) settings.maxUploadBytes = Number(patch.maxUploadBytes);
  if (Array.isArray(patch.allowedExtensions)) {
    settings.allowedExtensions = patch.allowedExtensions.map((e) => {
      const v = String(e).trim().toLowerCase();
      return v.startsWith('.') ? v : `.${v}`;
    });
  }
  if (patch.retentionDaysInTrash != null) {
    settings.retentionDaysInTrash = Number(patch.retentionDaysInTrash);
  }
  await settings.save();
  return settings;
}

function actorLabel(user) {
  if (!user) return 'System';
  return user.username || user.email || user.name || 'User';
}

function toObjectId(value) {
  if (value == null || value === '' || value === 'null' || value === 'unfiled') return null;
  if (!mongoose.Types.ObjectId.isValid(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

async function assertFolderExists(folderId) {
  if (!folderId) return null;
  const folder = await DocumentFolder.findOne({ _id: folderId, status: 'Active' });
  if (!folder) throw new Error('Folder not found');
  return folder;
}

async function listFolders(scope = {}, filters = {}) {
  const sourceScope = filters.sourceScope || 'Manual Upload';

  // Backfill folders created before sourceScope existed
  await DocumentFolder.updateMany(
    { $or: [{ sourceScope: { $exists: false } }, { sourceScope: null }, { sourceScope: '' }] },
    { $set: { sourceScope: 'Manual Upload' } }
  );

  const query = { status: 'Active', sourceScope };

  const folders = await DocumentFolder.find(query)
    .sort({ sortOrder: 1, name: 1 })
    .lean();

  const folderIds = folders.map((f) => f._id);
  const countMatch = {
    status: { $ne: 'Deleted' },
    source: sourceScope,
    folderId: { $in: folderIds },
  };
  if (scope.ownOnly && scope.userId) {
    countMatch.uploadedByUserId = scope.userId;
  }

  const counts = folderIds.length
    ? await Document.aggregate([
        { $match: countMatch },
        { $group: { _id: '$folderId', count: { $sum: 1 } } },
      ])
    : [];
  const countMap = Object.fromEntries(counts.map((c) => [String(c._id), c.count]));

  const unfiledMatch = {
    status: { $ne: 'Deleted' },
    source: sourceScope,
    $or: [{ folderId: null }, { folderId: { $exists: false } }],
  };
  if (scope.ownOnly && scope.userId) {
    unfiledMatch.uploadedByUserId = scope.userId;
  }
  const unfiledCount = await Document.countDocuments(unfiledMatch);

  return {
    folders: folders.map((f) => ({
      ...f,
      documentCount: countMap[String(f._id)] || 0,
    })),
    unfiledCount,
    sourceScope,
  };
}

async function createFolder({ name, description, parentId, department, user, sortOrder, sourceScope }) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Folder name is required');

  const scopeValue = sourceScope === 'AI Generator' ? 'AI Generator' : 'Manual Upload';

  let parent = null;
  const parentObjectId = toObjectId(parentId);
  if (parentObjectId) {
    parent = await assertFolderExists(parentObjectId);
    if (parent.sourceScope && parent.sourceScope !== scopeValue) {
      throw new Error('Parent folder belongs to a different source');
    }
  }

  let order = sortOrder;
  if (order == null) {
    const last = await DocumentFolder.findOne({
      status: 'Active',
      sourceScope: scopeValue,
      parentId: parentObjectId,
    })
      .sort({ sortOrder: -1 })
      .select('sortOrder')
      .lean();
    order = (last?.sortOrder ?? -1) + 1;
  }

  try {
    const folder = await DocumentFolder.create({
      name: trimmed,
      description: description ? String(description).trim() : '',
      sourceScope: scopeValue,
      parentId: parent?._id || null,
      sortOrder: Number(order) || 0,
      createdBy: actorLabel(user),
      createdByUserId: user?.id || user?.userId || user?._id || null,
      department: department || '',
      status: 'Active',
    });
    return folder;
  } catch (err) {
    if (err && err.code === 11000) {
      throw new Error('A folder with this name already exists here');
    }
    throw err;
  }
}

async function updateFolder(id, patch = {}, scope = {}) {
  const folder = await DocumentFolder.findById(id);
  if (!folder || folder.status === 'Deleted') throw new Error('Folder not found');
  if (scope.ownOnly && String(folder.createdByUserId || '') !== String(scope.userId)) {
    throw new Error('Access denied');
  }

  if (patch.name != null) {
    const trimmed = String(patch.name).trim();
    if (!trimmed) throw new Error('Folder name is required');
    folder.name = trimmed;
  }
  if (patch.description != null) folder.description = String(patch.description).trim();
  if (patch.department != null) folder.department = String(patch.department).trim();
  if (patch.sortOrder != null) folder.sortOrder = Number(patch.sortOrder) || 0;

  if (patch.parentId !== undefined) {
    const nextParentId = toObjectId(patch.parentId);
    if (nextParentId && String(nextParentId) === String(folder._id)) {
      throw new Error('Folder cannot be its own parent');
    }
    if (nextParentId) {
      await assertFolderExists(nextParentId);
      let cursor = nextParentId;
      const seen = new Set([String(folder._id)]);
      while (cursor) {
        if (seen.has(String(cursor))) throw new Error('Cannot create circular folder hierarchy');
        seen.add(String(cursor));
        const parent = await DocumentFolder.findById(cursor).select('parentId').lean();
        cursor = parent?.parentId || null;
      }
    }
    folder.parentId = nextParentId;
  }

  try {
    await folder.save();
    return folder;
  } catch (err) {
    if (err && err.code === 11000) {
      throw new Error('A folder with this name already exists here');
    }
    throw err;
  }
}

async function reorderFolders(orderedIds = [], scope = {}, filters = {}) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) {
    throw new Error('orderedIds array is required');
  }
  const ops = [];
  orderedIds.forEach((id, index) => {
    if (!mongoose.Types.ObjectId.isValid(id)) return;
    const filter = { _id: id, status: 'Active' };
    if (scope.ownOnly && scope.userId) filter.createdByUserId = scope.userId;
    ops.push({
      updateOne: {
        filter,
        update: { $set: { sortOrder: index } },
      },
    });
  });
  if (!ops.length) throw new Error('No valid folder ids');
  await DocumentFolder.bulkWrite(ops);
  return listFolders(scope, filters);
}

/**
 * Soft-delete a folder. Documents are moved to unfiled (folderId = null).
 * Child folders are also soft-deleted recursively.
 */
async function deleteFolder(id, scope = {}) {
  const folder = await DocumentFolder.findById(id);
  if (!folder || folder.status === 'Deleted') throw new Error('Folder not found');
  if (scope.ownOnly && String(folder.createdByUserId || '') !== String(scope.userId)) {
    throw new Error('Access denied');
  }

  const toDelete = [folder._id];
  let frontier = [folder._id];
  while (frontier.length) {
    const children = await DocumentFolder.find({
      parentId: { $in: frontier },
      status: 'Active',
    }).select('_id').lean();
    const childIds = children.map((c) => c._id);
    toDelete.push(...childIds);
    frontier = childIds;
  }

  await Document.updateMany(
    { folderId: { $in: toDelete } },
    { $set: { folderId: null } }
  );

  await DocumentFolder.updateMany(
    { _id: { $in: toDelete } },
    { $set: { status: 'Deleted', deletedAt: new Date() } }
  );

  return { deleted: true, foldersRemoved: toDelete.length };
}

async function moveDocumentToFolder(documentId, folderId, scope = {}) {
  const doc = await Document.findById(documentId);
  if (!doc) throw new Error('Document not found');
  if (scope.ownOnly && String(doc.uploadedByUserId || '') !== String(scope.userId)) {
    throw new Error('Access denied');
  }

  const nextFolderId = toObjectId(folderId);
  if (nextFolderId) {
    const folder = await assertFolderExists(nextFolderId);
    if (folder.sourceScope && folder.sourceScope !== doc.source) {
      throw new Error('Folder does not match this document type');
    }
  }
  doc.folderId = nextFolderId;
  await doc.save();
  return doc;
}

async function resolveProductMeta({ productId, sku }) {
  let product = null;
  if (productId) {
    product = await Product.findById(productId)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .lean();
  } else if (sku) {
    product = await Product.findOne({ sku: String(sku).trim() })
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .lean();
  }
  if (!product) {
    return {
      productId: productId || null,
      sku: sku || '',
      productName: '',
      category: '',
      subCategory: '',
      brand: '',
    };
  }
  return {
    productId: product._id,
    sku: product.sku || sku || '',
    productName: product.title || product.name || '',
    category: product.category?.name || '',
    subCategory: product.subCategory?.name || '',
    brand: product.brandName || '',
  };
}

async function nextAiVersion(sku) {
  if (!sku) return 1;
  const latest = await Document.findOne({
    source: 'AI Generator',
    sku: String(sku).trim(),
  })
    .sort({ version: -1 })
    .select('version')
    .lean();
  return (latest?.version || 0) + 1;
}

/**
 * Persist an AI-generated image into Document Management.
 * Idempotent on sourceFileKey (same generated file won't create duplicates).
 * Regenerations create a new version when the file path differs.
 */
async function saveAiGeneratedImage({
  sourceAbsPath,
  sourceUrl,
  productId,
  sku,
  promptOrder,
  promptText,
  uploadedBy,
  uploadedByUserId,
  mimeType = 'image/jpeg',
  title,
  description,
  tags = [],
  folderId,
}) {
  ensureDocumentFolders();

  if (!sourceAbsPath || !fs.existsSync(sourceAbsPath)) {
    throw new Error('AI source image file not found');
  }

  const sourceFileKey = relativeFromUploads(sourceAbsPath).replace(/\\/g, '/');
  const existing = await Document.findOne({ sourceFileKey });
  if (existing) {
    return { document: existing, created: false, duplicate: true };
  }

  const resolvedFolderId = toObjectId(folderId);
  if (resolvedFolderId) {
    const folder = await assertFolderExists(resolvedFolderId);
    if (folder.sourceScope && folder.sourceScope !== 'AI Generator') {
      throw new Error('Selected folder is not an AI images folder');
    }
  }

  const productMeta = await resolveProductMeta({ productId, sku });
  const version = await nextAiVersion(productMeta.sku);
  const ext = extensionOf(sourceAbsPath) || '.jpg';
  const safeSku = (productMeta.sku || 'unassigned').replace(/[<>:"/\\|?*]/g, '_');
  const destName = `${safeSku}_v${version}_${Date.now()}${ext}`;
  const destAbs = path.join(AI_DIR, destName);
  fs.copyFileSync(sourceAbsPath, destAbs);

  const storageRelative = relativeFromUploads(destAbs).replace(/\\/g, '/');
  const stats = fs.statSync(destAbs);
  const thumb = await generateThumbnail(destAbs, mimeType);

  const document = await Document.create({
    documentType: 'Image',
    source: 'AI Generator',
    ...productMeta,
    title: title || `${productMeta.productName || productMeta.sku || 'AI Image'} (v${version})`,
    description: description || promptText || '',
    tags: Array.isArray(tags) ? tags : [],
    fileName: destName,
    fileExtension: ext,
    mimeType,
    fileSize: stats.size,
    fileUrl: toPublicUrl(storageRelative),
    thumbnailUrl: thumb.thumbnailUrl || toPublicUrl(storageRelative),
    storagePath: storageRelative,
    thumbnailPath: thumb.thumbnailPath || '',
    uploadedBy: uploadedBy || 'AI Generator',
    uploadedByUserId: uploadedByUserId || null,
    department: '',
    folderId: resolvedFolderId,
    status: 'Active',
    version,
    promptOrder: promptOrder != null ? Number(promptOrder) : null,
    promptText: promptText || '',
    sourceFileKey,
  });

  return { document, created: true, duplicate: false };
}

/**
 * Save from an already-public upload URL (e.g. /uploads/gemini-generated/...).
 */
async function saveAiFromUploadUrl(payload = {}) {
  const {
    fileUrl,
    path: filePath,
    ...rest
  } = payload;

  const raw = String(fileUrl || filePath || '').trim();
  if (!raw) throw new Error('fileUrl is required');

  let relative = raw;
  try {
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      relative = new URL(raw).pathname;
    }
  } catch (_e) {
    // keep
  }
  relative = relative.replace(/^\/+/, '');
  if (relative.startsWith('uploads/')) relative = relative.slice('uploads/'.length);

  const abs = path.join(require('../utils/storage').UPLOADS_ROOT, relative);
  return saveAiGeneratedImage({
    ...rest,
    sourceAbsPath: abs,
    sourceUrl: raw,
    mimeType: rest.mimeType || (extensionOf(abs) === '.png' ? 'image/png' : 'image/jpeg'),
  });
}

async function createManualUpload({
  file,
  user,
  title,
  description,
  tags,
  department,
  sku,
  productId,
  folderId,
}) {
  ensureDocumentFolders();
  if (!file) throw new Error('File is required');

  const settings = await getSettings();
  const ext = extensionOf(file.originalname || file.filename).toLowerCase();
  if (settings.allowedExtensions?.length && !settings.allowedExtensions.includes(ext)) {
    throw new Error(`File type ${ext || '(none)'} is not allowed`);
  }
  if (file.size > settings.maxUploadBytes) {
    throw new Error(`File exceeds maximum size of ${Math.round(settings.maxUploadBytes / (1024 * 1024))} MB`);
  }

  const resolvedFolderId = toObjectId(folderId);
  if (resolvedFolderId) {
    const folder = await assertFolderExists(resolvedFolderId);
    if (folder.sourceScope && folder.sourceScope !== 'Manual Upload') {
      throw new Error('Selected folder is not an employee documents folder');
    }
  }

  const productMeta = await resolveProductMeta({ productId, sku });
  const destName = file.filename;
  const destAbs = path.join(MANUAL_DIR, destName);
  const storageRelative = relativeFromUploads(file.path || destAbs).replace(/\\/g, '/');
  const mimeType = file.mimetype || 'application/octet-stream';
  const thumb = await generateThumbnail(file.path || destAbs, mimeType);

  const document = await Document.create({
    documentType: isImageMime(mimeType) ? 'Image' : 'Document',
    source: 'Manual Upload',
    ...productMeta,
    title: title || file.originalname || destName,
    description: description || '',
    tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map((t) => t.trim()).filter(Boolean) : []),
    fileName: file.originalname || destName,
    fileExtension: ext,
    mimeType,
    fileSize: file.size || 0,
    fileUrl: toPublicUrl(storageRelative),
    thumbnailUrl: thumb.thumbnailUrl || '',
    storagePath: storageRelative,
    thumbnailPath: thumb.thumbnailPath || '',
    uploadedBy: actorLabel(user),
    uploadedByUserId: user?.id || user?.userId || user?._id || null,
    department: department || '',
    folderId: resolvedFolderId,
    status: 'Active',
    version: 1,
    sourceFileKey: `manual:${storageRelative}`,
  });

  return document;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildListQuery(filters = {}, scope = {}) {
  const query = {};

  if (filters.status) {
    query.status = filters.status;
  } else if (filters.includeDeleted) {
    // no status filter
  } else {
    query.status = { $ne: 'Deleted' };
  }

  if (filters.source) query.source = filters.source;
  if (filters.documentType) query.documentType = filters.documentType;
  if (filters.department) query.department = filters.department;
  if (filters.category) query.category = filters.category;
  if (filters.sku) query.sku = { $regex: escapeRegex(filters.sku), $options: 'i' };
  if (filters.uploadedBy) {
    query.uploadedBy = { $regex: escapeRegex(filters.uploadedBy), $options: 'i' };
  }
  if (filters.employeeId) query.uploadedByUserId = filters.employeeId;

  // Folder filter: 'all' / omit = no filter; 'unfiled' / 'null' = no folder; else ObjectId
  if (filters.folderId != null && filters.folderId !== '' && filters.folderId !== 'all') {
    if (filters.folderId === 'unfiled' || filters.folderId === 'null') {
      query.$and = (query.$and || []).concat([
        { $or: [{ folderId: null }, { folderId: { $exists: false } }] },
      ]);
    } else {
      const oid = toObjectId(filters.folderId);
      if (oid) query.folderId = oid;
    }
  }

  if (filters.dateFrom || filters.dateTo) {
    query.createdAt = {};
    if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
    if (filters.dateTo) {
      const end = new Date(filters.dateTo);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  if (filters.search) {
    const term = String(filters.search).trim();
    if (term) {
      const rx = { $regex: escapeRegex(term), $options: 'i' };
      query.$or = [
        { sku: rx },
        { productName: rx },
        { fileName: rx },
        { title: rx },
        { uploadedBy: rx },
        { department: rx },
        { category: rx },
        { tags: rx },
      ];
    }
  }

  if (scope.ownOnly && scope.userId) {
    query.uploadedByUserId = scope.userId;
  } else if (scope.department && !scope.admin) {
    query.$and = (query.$and || []).concat([
      {
        $or: [
          { department: scope.department },
          { uploadedByUserId: scope.userId },
          { source: 'AI Generator' },
        ],
      },
    ]);
  }

  return query;
}

async function listDocuments(filters, scope, { page = 1, limit = 24 } = {}) {
  const query = buildListQuery(filters, scope);
  const skip = (Math.max(1, page) - 1) * Math.max(1, limit);
  const [data, total] = await Promise.all([
    Document.find(query).sort({ createdAt: -1 }).skip(skip).limit(Math.max(1, Math.min(100, limit))).lean(),
    Document.countDocuments(query),
  ]);
  return {
    data,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      totalPages: Math.ceil(total / limit) || 1,
      hasNextPage: skip + data.length < total,
      hasPrevPage: page > 1,
    },
  };
}

async function getAnalytics(scope = {}) {
  const base = buildListQuery({ status: 'Active' }, scope);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

  const [
    totalFiles,
    aiCount,
    manualCount,
    sizeAgg,
    todayUploads,
    monthUploads,
    largestFiles,
  ] = await Promise.all([
    Document.countDocuments(base),
    Document.countDocuments({ ...base, source: 'AI Generator' }),
    Document.countDocuments({ ...base, source: 'Manual Upload' }),
    Document.aggregate([
      { $match: base },
      { $group: { _id: null, totalSize: { $sum: '$fileSize' } } },
    ]),
    Document.countDocuments({ ...base, createdAt: { $gte: startOfToday } }),
    Document.countDocuments({ ...base, createdAt: { $gte: startOfMonth } }),
    Document.find(base).sort({ fileSize: -1 }).limit(10).select('title fileName fileSize source sku createdAt').lean(),
  ]);

  return {
    totalFiles,
    aiGeneratedImages: aiCount,
    manualDocuments: manualCount,
    storageUsedBytes: sizeAgg[0]?.totalSize || 0,
    todaysUploads: todayUploads,
    thisMonthUploads: monthUploads,
    largestFiles,
  };
}

async function softDelete(id, user) {
  const doc = await Document.findById(id);
  if (!doc) throw new Error('Document not found');
  if (doc.status === 'Deleted') return doc;
  doc.status = 'Deleted';
  doc.deletedAt = new Date();
  await doc.save();
  return doc;
}

async function restore(id) {
  const doc = await Document.findById(id);
  if (!doc) throw new Error('Document not found');
  doc.status = 'Active';
  doc.deletedAt = null;
  await doc.save();
  return doc;
}

async function permanentDelete(id) {
  const doc = await Document.findById(id);
  if (!doc) throw new Error('Document not found');

  const abs = path.join(require('../utils/storage').UPLOADS_ROOT, doc.storagePath);
  if (fs.existsSync(abs) && abs.includes('document-management')) {
    try { fs.unlinkSync(abs); } catch (_e) { /* ignore */ }
  }
  if (doc.thumbnailPath) {
    const thumbAbs = path.join(require('../utils/storage').UPLOADS_ROOT, doc.thumbnailPath);
    if (fs.existsSync(thumbAbs) && thumbAbs.includes('thumbnails')) {
      try { fs.unlinkSync(thumbAbs); } catch (_e) { /* ignore */ }
    }
  }
  await Document.findByIdAndDelete(id);
  return { deleted: true };
}

async function archive(id) {
  const doc = await Document.findById(id);
  if (!doc) throw new Error('Document not found');
  doc.status = 'Archived';
  await doc.save();
  return doc;
}

module.exports = {
  getSettings,
  updateSettings,
  saveAiGeneratedImage,
  saveAiFromUploadUrl,
  createManualUpload,
  listDocuments,
  getAnalytics,
  softDelete,
  restore,
  permanentDelete,
  archive,
  resolveProductMeta,
  actorLabel,
  listFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  reorderFolders,
  moveDocumentToFolder,
};
