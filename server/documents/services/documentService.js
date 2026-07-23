const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Document = require('../models/Document');
const DocumentFolder = require('../models/DocumentFolder');
const DocumentSettings = require('../models/DocumentSettings');
const Product = require('../../models/Product');
const Category = require('../../models/Category');
const Subcategory = require('../../models/Subcategory');
const {
  AI_DIR,
  MANUAL_DIR,
  ensureDocumentFolders,
  extensionOf,
  isImageMime,
  toPublicUrl,
  relativeFromUploads,
  generateThumbnail,
  UPLOADS_ROOT,
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

/** Personal folders are visible only to the owning employee and documents admins. */
function canAccessFolder(folder, scope = {}) {
  if (!folder) return true;
  const visibility = folder.visibility || 'Shared';
  if (visibility !== 'Personal') return true;
  if (scope.admin) return true;
  return String(folder.createdByUserId || '') === String(scope.userId || '');
}

async function assertFolderAccess(folderId, scope = {}) {
  const folder = await assertFolderExists(folderId);
  if (folder && !canAccessFolder(folder, scope)) {
    throw new Error('Access denied to personal folder');
  }
  return folder;
}

async function collectDescendantFolderIds(rootFolderId) {
  const rootId = toObjectId(rootFolderId);
  if (!rootId) return [];
  const ids = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const children = await DocumentFolder.find({
      parentId: { $in: frontier },
      status: 'Active',
    })
      .select('_id')
      .lean();
    frontier = children.map((c) => c._id);
    ids.push(...frontier);
  }
  return ids;
}

function productImagePublicUrl(imagePath) {
  if (!imagePath) return '';
  const raw = String(imagePath).trim();
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('/uploads/')) return raw;
  if (raw.startsWith('uploads/')) return `/${raw}`;
  return `/uploads/${raw.replace(/^\/+/, '')}`;
}

/**
 * Find an Active Shared folder by name within parent + source (case-insensitive,
 * matching unique_shared_folder_name index collation).
 */
async function findSharedFolderByName({ name, parentId, sourceScope }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) return null;
  return DocumentFolder.findOne({
    status: 'Active',
    visibility: 'Shared',
    sourceScope,
    parentId: parentId || null,
    name: trimmedName,
  }).collation({ locale: 'en', strength: 2 });
}

/**
 * Find or create a shared catalog folder (category / subcategory / sku).
 * Safe against unique_shared_folder_name (case-insensitive) collisions.
 */
async function findOrCreateCatalogFolder({
  name,
  parentId = null,
  sourceScope = 'AI Generator',
  folderKind,
  categoryId = null,
  subCategoryId = null,
  linkedSku = '',
  user = null,
  description = '',
}) {
  const scopeValue = sourceScope === 'Manual Upload' ? 'Manual Upload' : 'AI Generator';
  const parentObjectId = toObjectId(parentId);
  const trimmedName = String(name || '').trim().slice(0, 120);
  if (!trimmedName) throw new Error('Folder name is required');
  if (!['category', 'subcategory', 'sku'].includes(folderKind)) {
    throw new Error('Invalid catalog folder kind');
  }

  const identity = {
    status: 'Active',
    sourceScope: scopeValue,
    visibility: 'Shared',
    folderKind,
  };
  if (folderKind === 'category' && categoryId) identity.categoryId = categoryId;
  else if (folderKind === 'subcategory' && subCategoryId) identity.subCategoryId = subCategoryId;
  else if (folderKind === 'sku' && linkedSku) {
    identity.linkedSku = String(linkedSku).trim();
    identity.parentId = parentObjectId;
  } else {
    identity.parentId = parentObjectId;
    identity.name = trimmedName;
  }

  let folder = await DocumentFolder.findOne(identity);
  if (!folder && folderKind === 'sku' && linkedSku) {
    folder = await DocumentFolder.findOne({
      status: 'Active',
      sourceScope: scopeValue,
      folderKind: 'sku',
      linkedSku: String(linkedSku).trim(),
    });
  }
  if (!folder && folderKind === 'category' && categoryId) {
    folder = await DocumentFolder.findOne({
      status: 'Active',
      sourceScope: scopeValue,
      folderKind: 'category',
      categoryId,
    });
  }
  if (!folder && folderKind === 'subcategory' && subCategoryId) {
    folder = await DocumentFolder.findOne({
      status: 'Active',
      sourceScope: scopeValue,
      folderKind: 'subcategory',
      subCategoryId,
    });
  }

  // Reuse existing Shared folder with same display name (case-insensitive)
  if (!folder) {
    folder = await findSharedFolderByName({
      name: trimmedName,
      parentId: parentObjectId,
      sourceScope: scopeValue,
    });
  }

  if (folder) {
    let dirty = false;
    const nameTaken = await findSharedFolderByName({
      name: trimmedName,
      parentId: parentObjectId,
      sourceScope: scopeValue,
    });
    const canRename =
      folder.name !== trimmedName &&
      (!nameTaken || String(nameTaken._id) === String(folder._id));

    if (canRename) {
      folder.name = trimmedName;
      dirty = true;
    }
    if (parentObjectId && String(folder.parentId || '') !== String(parentObjectId)) {
      const clashAtNewParent = await findSharedFolderByName({
        name: folder.name,
        parentId: parentObjectId,
        sourceScope: scopeValue,
      });
      if (!clashAtNewParent || String(clashAtNewParent._id) === String(folder._id)) {
        folder.parentId = parentObjectId;
        dirty = true;
      }
    }
    if (categoryId && String(folder.categoryId || '') !== String(categoryId)) {
      folder.categoryId = categoryId;
      dirty = true;
    }
    if (subCategoryId && String(folder.subCategoryId || '') !== String(subCategoryId)) {
      folder.subCategoryId = subCategoryId;
      dirty = true;
    }
    if (linkedSku && folder.linkedSku !== String(linkedSku).trim()) {
      folder.linkedSku = String(linkedSku).trim();
      dirty = true;
    }
    if (folder.folderKind === 'custom') {
      folder.folderKind = folderKind;
      dirty = true;
    }
    if (folder.visibility !== 'Shared') {
      folder.visibility = 'Shared';
      dirty = true;
    }
    if (dirty) {
      try {
        await folder.save();
      } catch (err) {
        if (err && err.code === 11000) {
          const existing = await findSharedFolderByName({
            name: trimmedName,
            parentId: parentObjectId,
            sourceScope: scopeValue,
          });
          if (existing) return existing;
        }
        throw err;
      }
    }
    return folder;
  }

  let order = 0;
  const last = await DocumentFolder.findOne({
    status: 'Active',
    sourceScope: scopeValue,
    parentId: parentObjectId,
  })
    .sort({ sortOrder: -1 })
    .select('sortOrder')
    .lean();
  order = (last?.sortOrder ?? -1) + 1;

  try {
    return await DocumentFolder.create({
      name: trimmedName,
      description: description || '',
      sourceScope: scopeValue,
      visibility: 'Shared',
      folderKind,
      categoryId: categoryId || null,
      subCategoryId: subCategoryId || null,
      linkedSku: linkedSku ? String(linkedSku).trim() : '',
      parentId: parentObjectId,
      sortOrder: order,
      createdBy: actorLabel(user) || 'Catalog Sync',
      createdByUserId: user?.id || user?._id || null,
      status: 'Active',
    });
  } catch (err) {
    if (err && err.code === 11000) {
      const existing = await findSharedFolderByName({
        name: trimmedName,
        parentId: parentObjectId,
        sourceScope: scopeValue,
      });
      if (existing) {
        let dirty = false;
        if (categoryId && !existing.categoryId) {
          existing.categoryId = categoryId;
          dirty = true;
        }
        if (subCategoryId && !existing.subCategoryId) {
          existing.subCategoryId = subCategoryId;
          dirty = true;
        }
        if (linkedSku && !existing.linkedSku) {
          existing.linkedSku = String(linkedSku).trim();
          dirty = true;
        }
        if (existing.folderKind === 'custom') {
          existing.folderKind = folderKind;
          dirty = true;
        }
        if (dirty) {
          try {
            await existing.save();
          } catch (_saveErr) {
            // return as-is if identity update races
          }
        }
        return existing;
      }
    }
    throw err;
  }
}

/**
 * Ensure Category → Subcategory → SKU folder path for a product.
 * Returns the leaf SKU folder (or subcategory/category if SKU missing).
 */
async function ensureCatalogFolderPath(productMeta = {}, { user, sourceScope = 'AI Generator' } = {}) {
  let categoryId = productMeta.categoryId || null;
  let subCategoryId = productMeta.subCategoryId || null;
  let categoryName = String(productMeta.category || '').trim();
  let subCategoryName = String(productMeta.subCategory || '').trim();
  const sku = String(productMeta.sku || '').trim();

  if (productMeta.productId && (!categoryId || !subCategoryId || !categoryName || !subCategoryName)) {
    const product = await Product.findById(productMeta.productId)
      .populate('category', 'name')
      .populate('subCategory', 'name')
      .lean();
    if (product) {
      categoryId = product.category?._id || categoryId;
      subCategoryId = product.subCategory?._id || subCategoryId;
      categoryName = product.category?.name || categoryName;
      subCategoryName = product.subCategory?.name || subCategoryName;
    }
  }

  if (!categoryName && !subCategoryName && !sku) return null;

  let categoryFolder = null;
  if (categoryName || categoryId) {
    categoryFolder = await findOrCreateCatalogFolder({
      name: categoryName || 'Uncategorized',
      parentId: null,
      sourceScope,
      folderKind: 'category',
      categoryId,
      user,
      description: 'Category folder',
    });
  }

  let subFolder = null;
  if ((subCategoryName || subCategoryId) && categoryFolder) {
    subFolder = await findOrCreateCatalogFolder({
      name: subCategoryName || 'General',
      parentId: categoryFolder._id,
      sourceScope,
      folderKind: 'subcategory',
      categoryId,
      subCategoryId,
      user,
      description: 'Subcategory folder',
    });
  }

  if (sku && (subFolder || categoryFolder)) {
    return findOrCreateCatalogFolder({
      name: sku,
      parentId: (subFolder || categoryFolder)._id,
      sourceScope,
      folderKind: 'sku',
      categoryId,
      subCategoryId,
      linkedSku: sku,
      user,
      description: productMeta.productName
        ? `SKU images · ${productMeta.productName}`
        : 'SKU images',
    });
  }

  return subFolder || categoryFolder;
}

/**
 * Build Category → Subcategory → SKU folders from master catalog + existing AI docs.
 */
async function syncCatalogFolders({ sourceScope = 'AI Generator', user = null } = {}) {
  const scopeValue = sourceScope === 'Manual Upload' ? 'Manual Upload' : 'AI Generator';
  const categories = await Category.find({}).select('_id name').sort({ name: 1 }).lean();
  const subcategories = await Subcategory.find({})
    .select('_id name category')
    .sort({ name: 1 })
    .lean();
  const products = await Product.find({})
    .select('_id sku title name category subCategory images')
    .lean();

  const skusWithDocs = await Document.distinct('sku', {
    source: scopeValue,
    status: { $ne: 'Deleted' },
    sku: { $nin: [null, ''] },
  });
  const skuDocSet = new Set(skusWithDocs.map((s) => String(s).trim()).filter(Boolean));

  let categoriesCreated = 0;
  let subcategoriesCreated = 0;
  let skusCreated = 0;

  const categoryFolderById = new Map();
  for (const category of categories) {
    try {
      const before = await DocumentFolder.findOne({
        status: 'Active',
        sourceScope: scopeValue,
        folderKind: 'category',
        categoryId: category._id,
      }).select('_id').lean();
      const folder = await findOrCreateCatalogFolder({
        name: category.name,
        parentId: null,
        sourceScope: scopeValue,
        folderKind: 'category',
        categoryId: category._id,
        user,
        description: 'Category folder',
      });
      categoryFolderById.set(String(category._id), folder);
      if (!before) categoriesCreated += 1;
    } catch (err) {
      console.warn(`Catalog sync: skipped category "${category.name}":`, err.message);
    }
  }

  const subFolderById = new Map();
  for (const sub of subcategories) {
    const parent = categoryFolderById.get(String(sub.category));
    if (!parent) continue;
    try {
      const before = await DocumentFolder.findOne({
        status: 'Active',
        sourceScope: scopeValue,
        folderKind: 'subcategory',
        subCategoryId: sub._id,
      }).select('_id').lean();
      const folder = await findOrCreateCatalogFolder({
        name: sub.name,
        parentId: parent._id,
        sourceScope: scopeValue,
        folderKind: 'subcategory',
        categoryId: sub.category,
        subCategoryId: sub._id,
        user,
        description: 'Subcategory folder',
      });
      subFolderById.set(String(sub._id), folder);
      if (!before) subcategoriesCreated += 1;
    } catch (err) {
      console.warn(`Catalog sync: skipped subcategory "${sub.name}":`, err.message);
    }
  }

  for (const product of products) {
    const sku = String(product.sku || '').trim();
    if (!sku) continue;
    const hasImages = Array.isArray(product.images) && product.images.some(Boolean);
    if (!hasImages && !skuDocSet.has(sku)) continue;

    const parent =
      subFolderById.get(String(product.subCategory)) ||
      categoryFolderById.get(String(product.category));
    if (!parent) continue;

    try {
      const before = await DocumentFolder.findOne({
        status: 'Active',
        sourceScope: scopeValue,
        folderKind: 'sku',
        linkedSku: sku,
      }).select('_id').lean();

      await findOrCreateCatalogFolder({
        name: sku,
        parentId: parent._id,
        sourceScope: scopeValue,
        folderKind: 'sku',
        categoryId: product.category,
        subCategoryId: product.subCategory,
        linkedSku: sku,
        user,
        description: product.title || product.name || 'SKU images',
      });
      if (!before) skusCreated += 1;
    } catch (err) {
      console.warn(`Catalog sync: skipped SKU "${sku}":`, err.message);
    }
  }

  return {
    sourceScope: scopeValue,
    categories: categories.length,
    subcategories: subcategories.length,
    skuFoldersCreated: skusCreated,
    categoryFoldersCreated: categoriesCreated,
    subcategoryFoldersCreated: subcategoriesCreated,
  };
}

async function getProductImagesForSku(sku) {
  const trimmed = String(sku || '').trim();
  if (!trimmed) return [];
  const product = await Product.findOne({ sku: trimmed })
    .select('sku title name images brandName category subCategory')
    .populate('category', 'name')
    .populate('subCategory', 'name')
    .lean();
  if (!product) return [];
  return (product.images || []).filter(Boolean).map((img, index) => ({
    id: `product-${product._id}-${index}`,
    kind: 'product',
    sku: product.sku,
    productName: product.title || product.name || '',
    category: product.category?.name || '',
    subCategory: product.subCategory?.name || '',
    brand: product.brandName || '',
    title: `${product.sku || 'SKU'} · Image ${index + 1}`,
    fileUrl: productImagePublicUrl(img),
    thumbnailUrl: productImagePublicUrl(img),
    source: 'Product Catalog',
  }));
}

/**
 * Browse a catalog folder: child folders + documents (+ product images for SKU folders).
 */
async function browseFolder(folderId, scope = {}, filters = {}, { page = 1, limit = 48 } = {}) {
  const folder = await assertFolderAccess(folderId, scope);
  const children = await DocumentFolder.find({
    status: 'Active',
    parentId: folder._id,
  })
    .sort({ folderKind: 1, sortOrder: 1, name: 1 })
    .lean();

  const childIds = children.map((c) => c._id);
  const childCounts = childIds.length
    ? await Document.aggregate([
        {
          $match: {
            status: { $ne: 'Deleted' },
            source: folder.sourceScope,
            folderId: { $in: childIds },
          },
        },
        { $group: { _id: '$folderId', count: { $sum: 1 } } },
      ])
    : [];
  const childCountMap = Object.fromEntries(childCounts.map((c) => [String(c._id), c.count]));

  // For subcategory children that are SKU folders, also count product catalog images
  const enrichedChildren = await Promise.all(
    children.map(async (child) => {
      let productImageCount = 0;
      let previewUrl = '';
      if (child.folderKind === 'sku' && child.linkedSku) {
        const productImages = await getProductImagesForSku(child.linkedSku);
        productImageCount = productImages.length;
        previewUrl = productImages[0]?.thumbnailUrl || '';
      }
      return {
        ...child,
        documentCount: childCountMap[String(child._id)] || 0,
        productImageCount,
        previewUrl,
      };
    })
  );

  const descendantIds = await collectDescendantFolderIds(folder._id);
  const listFilters = {
    ...filters,
    source: folder.sourceScope,
    status: filters.status || 'Active',
    folderId: undefined,
    folderIds: descendantIds,
  };

  // SKU folder: prefer exact folder + sku match for docs, plus product images
  if (folder.folderKind === 'sku') {
    listFilters.folderIds = [folder._id];
    if (folder.linkedSku) listFilters.skuExact = folder.linkedSku;
  } else if (folder.folderKind === 'subcategory' || folder.folderKind === 'category') {
    // Show only docs directly in this folder when browsing mid-level with children;
    // images live in SKU children. Still include docs filed on this folder itself.
    listFilters.folderIds = [folder._id];
  }

  const docsResult = await listDocuments(listFilters, scope, { page, limit });
  let productImages = [];
  if (folder.folderKind === 'sku' && folder.linkedSku) {
    productImages = await getProductImagesForSku(folder.linkedSku);
  }

  return {
    folder: {
      ...(typeof folder.toObject === 'function' ? folder.toObject() : folder),
      folderKind: folder.folderKind || 'custom',
    },
    children: enrichedChildren,
    documents: docsResult.data,
    pagination: docsResult.pagination,
    productImages,
  };
}

async function getInaccessiblePersonalFolderIds(scope = {}) {
  if (scope.admin) return [];
  const query = {
    status: 'Active',
    visibility: 'Personal',
  };
  if (scope.userId) {
    query.createdByUserId = { $ne: scope.userId };
  }
  const folders = await DocumentFolder.find(query).select('_id').lean();
  return folders.map((f) => f._id);
}

async function listFolders(scope = {}, filters = {}) {
  const sourceScope = filters.sourceScope || 'Manual Upload';

  // Backfill folders created before sourceScope / visibility existed
  await DocumentFolder.updateMany(
    { $or: [{ sourceScope: { $exists: false } }, { sourceScope: null }, { sourceScope: '' }] },
    { $set: { sourceScope: 'Manual Upload' } }
  );
  await DocumentFolder.updateMany(
    { $or: [{ visibility: { $exists: false } }, { visibility: null }, { visibility: '' }] },
    { $set: { visibility: 'Shared' } }
  );

  const query = { status: 'Active', sourceScope };
  if (!scope.admin) {
    query.$or = [
      { visibility: { $ne: 'Personal' } },
      { visibility: 'Personal', createdByUserId: scope.userId },
      { visibility: { $exists: false } },
    ];
  }

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
      visibility: f.visibility || 'Shared',
      folderKind: f.folderKind || 'custom',
      documentCount: countMap[String(f._id)] || 0,
    })),
    unfiledCount,
    sourceScope,
  };
}

async function createFolder({
  name,
  description,
  parentId,
  department,
  user,
  sortOrder,
  sourceScope,
  visibility,
  scope = {},
}) {
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Folder name is required');

  const scopeValue = sourceScope === 'AI Generator' ? 'AI Generator' : 'Manual Upload';
  const visibilityValue = String(visibility || '').toLowerCase() === 'personal' ? 'Personal' : 'Shared';
  const ownerId = user?.id || user?.userId || user?._id || null;

  if (visibilityValue === 'Personal' && !ownerId) {
    throw new Error('You must be signed in to create a personal folder');
  }

  let parent = null;
  const parentObjectId = toObjectId(parentId);
  if (parentObjectId) {
    parent = await assertFolderAccess(parentObjectId, scope.admin != null ? scope : { admin: false, userId: ownerId });
    if (parent.sourceScope && parent.sourceScope !== scopeValue) {
      throw new Error('Parent folder belongs to a different source');
    }
    if ((parent.visibility || 'Shared') === 'Personal' && visibilityValue !== 'Personal') {
      throw new Error('Shared folders cannot be nested under a personal folder');
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
      visibility: visibilityValue,
      parentId: parent?._id || null,
      sortOrder: Number(order) || 0,
      createdBy: actorLabel(user),
      createdByUserId: ownerId,
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
    const folder = await assertFolderAccess(nextFolderId, scope);
    if (folder.sourceScope && folder.sourceScope !== doc.source) {
      throw new Error('Folder does not match this document type');
    }
  } else if (doc.folderId) {
    // Leaving a personal folder also requires access to that folder
    await assertFolderAccess(doc.folderId, scope);
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
      categoryId: null,
      subCategoryId: null,
      brand: '',
    };
  }
  return {
    productId: product._id,
    sku: product.sku || sku || '',
    productName: product.title || product.name || '',
    category: product.category?.name || '',
    subCategory: product.subCategory?.name || '',
    categoryId: product.category?._id || null,
    subCategoryId: product.subCategory?._id || null,
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
  scope = {},
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
    const folder = await assertFolderAccess(resolvedFolderId, scope);
    if (folder.sourceScope && folder.sourceScope !== 'AI Generator') {
      throw new Error('Selected folder is not an AI images folder');
    }
  }

  const productMeta = await resolveProductMeta({ productId, sku });
  const {
    categoryId: _omitCategoryId,
    subCategoryId: _omitSubCategoryId,
    ...documentProductMeta
  } = productMeta;

  let finalFolderId = resolvedFolderId;
  if (!finalFolderId) {
    try {
      const catalogFolder = await ensureCatalogFolderPath(productMeta, {
        user: uploadedByUserId ? { id: uploadedByUserId, username: uploadedBy } : null,
        sourceScope: 'AI Generator',
      });
      if (catalogFolder?._id) finalFolderId = catalogFolder._id;
    } catch (_err) {
      // Non-fatal — still save the image unfiled if catalog folders fail
    }
  }

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
    ...documentProductMeta,
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
    folderId: finalFolderId,
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
  scope = {},
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
    const folder = await assertFolderAccess(resolvedFolderId, scope);
    if (folder.sourceScope && folder.sourceScope !== 'Manual Upload') {
      throw new Error('Selected folder is not an employee documents folder');
    }
  }

  const productMeta = await resolveProductMeta({ productId, sku });
  const {
    categoryId: _omitCat,
    subCategoryId: _omitSub,
    ...documentProductMeta
  } = productMeta;
  const destName = file.filename;
  const destAbs = path.join(MANUAL_DIR, destName);
  const storageRelative = relativeFromUploads(file.path || destAbs).replace(/\\/g, '/');
  const mimeType = file.mimetype || 'application/octet-stream';
  const thumb = await generateThumbnail(file.path || destAbs, mimeType);

  const document = await Document.create({
    documentType: isImageMime(mimeType) ? 'Image' : 'Document',
    source: 'Manual Upload',
    ...documentProductMeta,
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

/**
 * Upload a desktop image file into AI Generated Images (source: AI Generator).
 */
async function createAiDesktopUpload({
  file,
  user,
  title,
  description,
  tags,
  sku,
  productId,
  folderId,
  scope = {},
}) {
  ensureDocumentFolders();
  if (!file) throw new Error('File is required');

  const mimeType = file.mimetype || '';
  if (!isImageMime(mimeType)) {
    throw new Error('Only image files can be added to Product images');
  }

  const settings = await getSettings();
  const ext = extensionOf(file.originalname || file.filename).toLowerCase() || '.jpg';
  const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
  if (!imageExts.includes(ext)) {
    throw new Error(`Image type ${ext} is not allowed`);
  }
  if (file.size > settings.maxUploadBytes) {
    throw new Error(`File exceeds maximum size of ${Math.round(settings.maxUploadBytes / (1024 * 1024))} MB`);
  }

  const resolvedFolderId = toObjectId(folderId);
  if (resolvedFolderId) {
    const folder = await assertFolderAccess(resolvedFolderId, scope);
    if (folder.sourceScope && folder.sourceScope !== 'AI Generator') {
      throw new Error('Selected folder is not an AI images folder');
    }
  }

  const productMeta = await resolveProductMeta({ productId, sku });
  const {
    categoryId: _omitCategoryId,
    subCategoryId: _omitSubCategoryId,
    ...documentProductMeta
  } = productMeta;

  let finalFolderId = resolvedFolderId;
  if (!finalFolderId) {
    try {
      const catalogFolder = await ensureCatalogFolderPath(productMeta, {
        user,
        sourceScope: 'AI Generator',
      });
      if (catalogFolder?._id) finalFolderId = catalogFolder._id;
    } catch (_err) {
      // non-fatal
    }
  }

  const version = await nextAiVersion(productMeta.sku);
  const destName = file.filename;
  const destAbs = path.join(AI_DIR, destName);
  const storageRelative = relativeFromUploads(file.path || destAbs).replace(/\\/g, '/');
  const thumb = await generateThumbnail(file.path || destAbs, mimeType);

  const document = await Document.create({
    documentType: 'Image',
    source: 'AI Generator',
    ...documentProductMeta,
    title: title || file.originalname || `${productMeta.productName || productMeta.sku || 'AI Image'} (v${version})`,
    description: description || '',
    tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map((t) => t.trim()).filter(Boolean) : []),
    fileName: file.originalname || destName,
    fileExtension: ext,
    mimeType,
    fileSize: file.size || 0,
    fileUrl: toPublicUrl(storageRelative),
    thumbnailUrl: thumb.thumbnailUrl || toPublicUrl(storageRelative),
    storagePath: storageRelative,
    thumbnailPath: thumb.thumbnailPath || '',
    uploadedBy: actorLabel(user),
    uploadedByUserId: user?.id || user?.userId || user?._id || null,
    department: '',
    folderId: finalFolderId,
    status: 'Active',
    version,
    promptOrder: null,
    promptText: '',
    sourceFileKey: `ai-desktop:${storageRelative}`,
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
  if (filters.subCategory) query.subCategory = filters.subCategory;
  if (filters.skuExact) {
    query.sku = String(filters.skuExact).trim();
  } else if (filters.sku) {
    query.sku = { $regex: escapeRegex(filters.sku), $options: 'i' };
  }
  if (filters.uploadedBy) {
    query.uploadedBy = { $regex: escapeRegex(filters.uploadedBy), $options: 'i' };
  }
  if (filters.employeeId) query.uploadedByUserId = filters.employeeId;

  // Folder filter: 'all' / omit = no filter; 'unfiled' / 'null' = no folder; else ObjectId
  // folderIds = include documents in any of these folders (descendants)
  if (Array.isArray(filters.folderIds) && filters.folderIds.length) {
    query.folderId = { $in: filters.folderIds };
  } else if (filters.folderId != null && filters.folderId !== '' && filters.folderId !== 'all') {
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

  // Hide documents that live in other users' personal folders (admins see all)
  const hiddenFolderIds = await getInaccessiblePersonalFolderIds(scope);
  if (hiddenFolderIds.length) {
    const requestedFolderId = filters.folderId && filters.folderId !== 'unfiled'
      ? toObjectId(filters.folderId)
      : null;
    if (requestedFolderId && hiddenFolderIds.some((id) => String(id) === String(requestedFolderId))) {
      return {
        data: [],
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    }
    query.$and = (query.$and || []).concat([
      {
        $or: [
          { folderId: null },
          { folderId: { $exists: false } },
          { folderId: { $nin: hiddenFolderIds } },
        ],
      },
    ]);
  }

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
  createAiDesktopUpload,
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
  canAccessFolder,
  syncCatalogFolders,
  ensureCatalogFolderPath,
  browseFolder,
  getProductImagesForSku,
  collectDescendantFolderIds,
};
