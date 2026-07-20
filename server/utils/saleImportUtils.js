const Product = require('../models/Product');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');

const PLACEHOLDER_IMAGE = 'https://placehold.co/100x100/png?text=Import';
const IMPORT_CATEGORY_NAME = 'Sales Import';
const IMPORT_CATEGORY_HSN = '99999999';
const IMPORT_SUBCATEGORY_NAME = 'General';

const SKU_COLUMN_KEYS = ['Product SKU *', 'Product SKU', 'SKU', 'Sku', 'Child SKU', 'ASIN'];
const QUANTITY_COLUMN_KEYS = ['Quantity *', 'Quantity', 'Qty', 'QTY', 'Qty Sold'];
const UNIT_PRICE_COLUMN_KEYS = [
  'Unit Price *',
  'Unit Price (Amount) *',
  'Unit Price',
  'Unit Price (Amount)',
  'Price',
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\*/g, '')
    .replace(/\s+/g, ' ');
}

function getImportCellValue(row, preferredKeys = []) {
  for (const key of preferredKeys) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }

  const preferredNormalized = new Set(preferredKeys.map(normalizeHeader));
  for (const [rowKey, value] of Object.entries(row || {})) {
    if (value === undefined || value === null || String(value).trim() === '') continue;
    if (preferredNormalized.has(normalizeHeader(rowKey))) {
      return value;
    }
  }

  return '';
}

function parseExcelNumber(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return NaN;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : NaN;
  }

  const cleaned = String(value)
    .trim()
    .replace(/,/g, '')
    .replace(/[^\d.-]/g, '');

  if (!cleaned || cleaned === '-' || cleaned === '.') {
    return NaN;
  }

  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : NaN;
}

async function getOrCreateImportCategoryRefs() {
  let category = await Category.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(IMPORT_CATEGORY_NAME)}$`, 'i') },
  });

  if (!category) {
    try {
      category = await Category.create({
        name: IMPORT_CATEGORY_NAME,
        hsnCode: IMPORT_CATEGORY_HSN,
        description: 'Auto-created for sales Excel imports',
      });
    } catch (err) {
      if (err.code === 11000) {
        category =
          (await Category.findOne({
            name: { $regex: new RegExp(`^${escapeRegex(IMPORT_CATEGORY_NAME)}$`, 'i') },
          })) ||
          (await Category.findOne({ hsnCode: IMPORT_CATEGORY_HSN }));
      }
      if (!category) throw err;
    }
  }

  let subCategory = await Subcategory.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(IMPORT_SUBCATEGORY_NAME)}$`, 'i') },
    category: category._id,
  });

  if (!subCategory) {
    subCategory = await Subcategory.create({
      name: IMPORT_SUBCATEGORY_NAME,
      category: category._id,
      description: 'Auto-created for sales Excel imports',
    });
  }

  return { category: category._id, subCategory: subCategory._id };
}

async function createPlaceholderProduct(sku) {
  const { category, subCategory } = await getOrCreateImportCategoryRefs();
  const label = `Imported product ${sku}`;

  const product = new Product({
    sku,
    title: label,
    name: label,
    brandName: 'Unknown',
    category,
    subCategory,
    hsnCode: IMPORT_CATEGORY_HSN,
    manufacturerName: 'Unknown',
    contactDetails: 'N/A',
    colour: 'N/A',
    material: 'N/A',
    size: 'N/A',
    weight: 0,
    productDimensionCm: { length: 0, width: 0, height: 0 },
    packageDimensionCm: { length: 0, width: 0, height: 0 },
    images: [PLACEHOLDER_IMAGE],
    unit: 'pcs',
  });

  try {
    await product.save();
  } catch (err) {
    if (err.code === 11000) {
      return Product.findOne({ sku }).populate('category', 'name');
    }
    throw err;
  }

  return product.populate('category', 'name');
}

function buildSkuLookupCandidates(sku) {
  const normalized = String(sku || '').trim();
  if (!normalized) return [];

  const candidates = new Set([normalized]);
  const collapsed = normalized.replace(/\s+/g, '');
  candidates.add(collapsed);
  candidates.add(collapsed.replace(/([A-Za-z]+-)(\d+)/i, '$1 $2'));

  const prefixNum = collapsed.match(/^(.+-)(\d+)$/i);
  if (prefixNum) {
    const [, prefix, numStr] = prefixNum;
    const num = parseInt(numStr, 10);
    if (!Number.isNaN(num)) {
      candidates.add(`${prefix}${num}`);
      candidates.add(`${prefix}${String(num).padStart(2, '0')}`);
      candidates.add(`${prefix}${String(num).padStart(3, '0')}`);
      candidates.add(`${prefix}${numStr}`);
    }
  }

  return Array.from(candidates);
}

async function findProductBySkuForImport(sku) {
  const candidates = buildSkuLookupCandidates(sku);
  for (const candidate of candidates) {
    let product = await Product.findOne({ sku: candidate });
    if (product) return product;
    product = await Product.findOne({
      sku: { $regex: new RegExp(`^${escapeRegex(candidate)}$`, 'i') },
    });
    if (product) return product;
  }

  const normalized = String(sku || '').trim();
  let product = await Product.findOne({ parentSkuOrAsin: normalized });
  if (product) return product;
  return Product.findOne({ ean: normalized });
}

async function resolveProductForImport(sku, { autoCreate = true, createdSkus = new Set() } = {}) {
  const normalized = String(sku || '').trim();
  if (!normalized) return { product: null, created: false };

  let product = await findProductBySkuForImport(normalized);
  if (product) {
    product = await product.populate('category', 'name');
    return { product, created: false };
  }

  if (!autoCreate) {
    return { product: null, created: false };
  }

  if (createdSkus.has(normalized.toLowerCase())) {
    product = await Product.findOne({ sku: normalized }).populate('category', 'name');
    return { product, created: false };
  }

  product = await createPlaceholderProduct(normalized);
  createdSkus.add(normalized.toLowerCase());
  return { product, created: true };
}

function mergeSaleItems(items) {
  const merged = new Map();

  for (const item of items) {
    const key = String(item.product);
    if (merged.has(key)) {
      const existing = merged.get(key);
      existing.quantity += item.quantity;
      existing.total += item.total;
    } else {
      merged.set(key, { ...item });
    }
  }

  return Array.from(merged.values());
}

// Excel stores dates as serial numbers (days since 1899-12-30, accounting for
// the Lotus 1900 leap-year bug). When a date cell is formatted as General/Number
// the importer receives the raw serial (e.g. "46117") instead of a real date.
function excelSerialToDate(serial) {
  const ms = Math.round(serial * 86400000);
  return new Date(Date.UTC(1899, 11, 30) + ms);
}

function isReasonableSaleDate(date) {
  if (!date || Number.isNaN(date.getTime())) return false;
  const year = date.getUTCFullYear();
  return year >= 2000 && year <= 2100;
}

function parseImportSaleDate(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return new Date();
  }

  const raw = String(value).trim();

  // Pure numeric value → treat as an Excel date serial number.
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const num = parseFloat(raw);
    // Serials in this range map to roughly 1954–2119.
    if (num >= 20000 && num <= 80000) {
      const serialDate = excelSerialToDate(num);
      if (isReasonableSaleDate(serialDate)) {
        return serialDate;
      }
    }
  }

  const parsed = new Date(raw);
  if (isReasonableSaleDate(parsed)) {
    return parsed;
  }

  const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    const fallback = new Date(year, month, day);
    if (isReasonableSaleDate(fallback)) {
      return fallback;
    }
  }

  return new Date();
}

module.exports = {
  SKU_COLUMN_KEYS,
  QUANTITY_COLUMN_KEYS,
  UNIT_PRICE_COLUMN_KEYS,
  getImportCellValue,
  parseExcelNumber,
  buildSkuLookupCandidates,
  findProductBySkuForImport,
  resolveProductForImport,
  mergeSaleItems,
  parseImportSaleDate,
};
