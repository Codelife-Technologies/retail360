const path = require('path');
const fs = require('fs');
const Product = require('../models/Product');
const { UPLOADS_ROOT } = require('../documents/utils/storage');

function normalizeImagePath(imagePath) {
  let normalized = String(imagePath || '').replace(/\\/g, '/').trim();
  if (!normalized) return '';
  try {
    if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
      normalized = new URL(normalized).pathname;
    }
  } catch (_e) {
    // keep as-is
  }
  normalized = normalized.replace(/^\/+/, '');
  if (normalized.startsWith('uploads/')) {
    normalized = normalized.slice('uploads/'.length);
  }
  return normalized;
}

/** Resolve ManagedDocument → product.images path (relative to uploads/). */
function documentToProductImagePath(doc) {
  if (!doc) return '';
  if (doc.storagePath) {
    return normalizeImagePath(doc.storagePath);
  }
  return normalizeImagePath(doc.fileUrl || doc.path || doc.url || '');
}

/**
 * Set a product's default image by moving/inserting the path at images[0].
 * Document and AI paths are referenced directly (no copy) so the same URL
 * is used in Product Master and the Images module.
 */
async function setProductDefaultImagePath(productId, imagePath) {
  const product = await Product.findById(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const normalized = normalizeImagePath(imagePath);
  if (!normalized) {
    throw new Error('Image path is required');
  }

  const images = Array.isArray(product.images)
    ? product.images.map(normalizeImagePath).filter(Boolean)
    : [];
  const existingIdx = images.findIndex((p) => p === normalized);

  if (existingIdx === 0) {
    return product;
  }

  if (existingIdx > 0) {
    images.splice(existingIdx, 1);
    images.unshift(normalized);
  } else {
    images.unshift(normalized);
  }

  product.images = images;
  product.markModified('images');
  await product.save();
  return product;
}

async function setProductDefaultImageByIndex(productId, index) {
  const product = await Product.findById(productId);
  if (!product) {
    throw new Error('Product not found');
  }

  const images = Array.isArray(product.images) ? [...product.images] : [];
  const idx = Number(index);
  if (!Number.isInteger(idx) || idx < 0 || idx >= images.length) {
    throw new Error('Invalid image index');
  }

  if (idx === 0) return product;

  const [selected] = images.splice(idx, 1);
  images.unshift(selected);
  product.images = images;
  product.markModified('images');
  await product.save();
  return product;
}

/**
 * Set default from a managed document (AI / uploads). Links the document to the product
 * and uses its storage path as images[0].
 */
async function setProductDefaultFromDocument(doc, { sku: skuOverride } = {}) {
  if (!doc) throw new Error('Document not found');

  let product = null;
  if (doc.productId) {
    product = await Product.findById(doc.productId);
  }
  if (!product) {
    const sku = String(skuOverride || doc.sku || '').trim();
    if (!sku) {
      throw new Error('Link this image to a product SKU first (open the product SKU folder), then set as default');
    }
    product = await Product.findOne({
      sku: new RegExp(`^${sku.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    });
    if (!product) {
      throw new Error(`No product found for SKU ${sku}`);
    }
    doc.productId = product._id;
    doc.sku = product.sku;
    if (typeof doc.save === 'function') await doc.save();
  }

  const imagePath = documentToProductImagePath(doc);
  if (!imagePath) {
    throw new Error('Document has no file path');
  }

  const abs = path.join(UPLOADS_ROOT, imagePath);
  if (!fs.existsSync(abs)) {
    throw new Error('Image file not found on disk');
  }

  return setProductDefaultImagePath(product._id, imagePath);
}

module.exports = {
  normalizeImagePath,
  documentToProductImagePath,
  setProductDefaultImagePath,
  setProductDefaultImageByIndex,
  setProductDefaultFromDocument,
};
