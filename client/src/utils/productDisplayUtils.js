const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
const UPLOADS_BASE = API_BASE_URL.replace('/api', '');

export const PRODUCT_IMAGE_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="50" height="50" viewBox="0 0 50 50">
      <rect width="50" height="50" fill="#e5e7eb" rx="8"/>
      <path d="M16 32l6-8 5 6 4-5 9 11H16z" fill="#9ca3af"/>
      <circle cx="20" cy="19" r="3" fill="#9ca3af"/>
    </svg>`
  );

export function resolveProductImageUrl(image) {
  if (!image) return null;
  if (image.startsWith('http://') || image.startsWith('https://')) {
    return image;
  }
  if (image.startsWith('products/')) {
    return `${UPLOADS_BASE}/uploads/${image}`;
  }
  return image;
}

export function getProductThumbnail(product) {
  const images = product?.images || [];
  const first = images.find((img) => img && img.trim() !== '');
  return first ? resolveProductImageUrl(first) : null;
}

export function getProductDisplayName(product) {
  return product?.title || product?.name || '';
}

export function normalizeProductSupplierLinks(product, allSuppliers = []) {
  const defaultSku = product?.sku || '';
  const defaultUnit = product?.unit || 'pcs';

  return (product?.suppliers || [])
    .map((entry) => {
      if (!entry) return null;

      if (entry.supplier && typeof entry.supplier === 'object') {
        return {
          supplierId: entry.supplier._id,
          supplier: entry.supplier,
          sku: entry.sku || defaultSku,
          unit: entry.unit || defaultUnit,
        };
      }

      if (entry.name && entry._id) {
        return {
          supplierId: entry._id,
          supplier: entry,
          sku: defaultSku,
          unit: defaultUnit,
        };
      }

      if (entry.supplier) {
        const supplierId = entry.supplier;
        return {
          supplierId,
          supplier: allSuppliers.find((s) => s._id === supplierId) || null,
          sku: entry.sku || defaultSku,
          unit: entry.unit || defaultUnit,
        };
      }

      return null;
    })
    .filter(Boolean);
}
