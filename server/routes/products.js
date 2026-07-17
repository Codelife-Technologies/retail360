const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const Product = require('../models/Product');
const Category = require('../models/Category');
const Subcategory = require('../models/Subcategory');
const Supplier = require('../models/Supplier');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { parseExcel, buildImportErrorSummary } = require('../utils/excelParser');
const { generateTemplate, exportToExcel } = require('../utils/excelGenerator');
const { parseSupplierLinksPayload, dedupeSupplierLinks } = require('../utils/productSuppliers');
const { requireAdminOrRole } = require('../middleware/auth');

const productEditAccess = requireAdminOrRole('admin', 'warehouse');

const SUPPLIER_POPULATE = {
  path: 'suppliers.supplier',
  select: 'name supplierCode supplierId email phone contactPerson',
};

const PRODUCT_EXPORT_HEADERS = [
  { key: 'slno', label: 'SL No' },
  { key: 'parentSkuOrAsin', label: 'Parent SKU' },
  { key: 'variation', label: 'Variation' },
  { key: 'sku', label: 'Child SKU' },
  { key: 'ean', label: 'EAN' },
  { key: 'category', label: 'Category' },
  { key: 'subCategory', label: 'Sub Category' },
  { key: 'brandName', label: 'Brand Name' },
  { key: 'title', label: 'Title' },
  { key: 'name', label: 'Name' },
  { key: 'productUrl', label: 'Product URL' },
  { key: 'colour', label: 'Colour' },
  { key: 'material', label: 'Material' },
  { key: 'size', label: 'Size' },
  { key: 'hsnCode', label: 'HSN Code' },
  { key: 'description', label: 'Description' },
  { key: 'manufacturerName', label: 'Manufacturer Name' },
  { key: 'contactDetails', label: 'Contact Details' },
  { key: 'bulletPoint1', label: 'Bullet Point 1' },
  { key: 'bulletPoint2', label: 'Bullet Point 2' },
  { key: 'bulletPoint3', label: 'Bullet Point 3' },
  { key: 'bulletPoint4', label: 'Bullet Point 4' },
  { key: 'bulletPoint5', label: 'Bullet Point 5' },
  { key: 'productDimensionLength', label: 'Product Dimension Length (cm)' },
  { key: 'productDimensionWidth', label: 'Product Dimension Width (cm)' },
  { key: 'productDimensionHeight', label: 'Product Dimension Height (cm)' },
  { key: 'packageDimensionLength', label: 'Package Dimension Length (cm)' },
  { key: 'packageDimensionWidth', label: 'Package Dimension Width (cm)' },
  { key: 'packageDimensionHeight', label: 'Package Dimension Height (cm)' },
  { key: 'weight', label: 'Weight (kg)' },
  { key: 'shape', label: 'Shape' },
  { key: 'specialFeature', label: 'Special Feature' },
  { key: 'images', label: 'Images (comma-separated URLs)' },
  { key: 'keywords', label: 'Keywords (comma-separated)' },
  { key: 'unit', label: 'Unit' },
  { key: 'supplierCode', label: 'Supplier Code' },
  { key: 'suppliers', label: 'Suppliers' },
  { key: 'createdAt', label: 'Created At' },
  { key: 'updatedAt', label: 'Updated At' },
];

const PRODUCT_TEMPLATE_HEADERS = [
  { key: 'slno', label: 'SL No' },
  {
    key: 'parentSkuOrAsin',
    label: 'Parent SKU *',
    required: true,
    aliases: ['P-SKU (Parent SKU) *', 'Parent SKU/ASIN', 'Parent SKU'],
  },
  { key: 'variation', label: 'Variation' },
  {
    key: 'sku',
    label: 'Child SKU * (if Variation=YES)',
    requiredWhen: 'variationYes',
    aliases: ['Child SKU', 'C-SKU (Child SKU)', 'SKU *'],
  },
  { key: 'ean', label: 'EAN' },
  { key: 'category', label: 'Category' },
  { key: 'subCategory', label: 'Sub Category' },
  { key: 'brandName', label: 'Brand Name' },
  {
    key: 'supplierCode',
    label: 'Supplier Code',
    aliases: ['Supplier Codes', 'Vendor Code', 'Vendor Codes'],
  },
  { key: 'title', label: 'Title *', requiredOr: 'name' },
  { key: 'name', label: 'Name *', requiredOr: 'title', aliases: ['Name'] },
  { key: 'colour', label: 'Colour' },
  { key: 'material', label: 'Material' },
  { key: 'size', label: 'Size' },
  { key: 'hsnCode', label: 'HSN Code' },
  { key: 'description', label: 'Description' },
  { key: 'manufacturerName', label: 'Manufacturer Name' },
  { key: 'contactDetails', label: 'Contact Details' },
  { key: 'bulletPoint1', label: 'Bullet Point 1' },
  { key: 'bulletPoint2', label: 'Bullet Point 2' },
  { key: 'bulletPoint3', label: 'Bullet Point 3' },
  { key: 'bulletPoint4', label: 'Bullet Point 4' },
  { key: 'bulletPoint5', label: 'Bullet Point 5' },
  { key: 'productDimensionLength', label: 'Product Dimension Length (cm)' },
  { key: 'productDimensionWidth', label: 'Product Dimension Width (cm)' },
  { key: 'productDimensionHeight', label: 'Product Dimension Height (cm)' },
  { key: 'packageDimensionLength', label: 'Package Dimension Length (cm)' },
  { key: 'packageDimensionWidth', label: 'Package Dimension Width (cm)' },
  { key: 'packageDimensionHeight', label: 'Package Dimension Height (cm)' },
  { key: 'weight', label: 'Weight (kg)' },
  { key: 'shape', label: 'Shape' },
  { key: 'specialFeature', label: 'Special Feature' },
  { key: 'images', label: 'Images (comma-separated URLs)' },
];

const PRODUCT_TEMPLATE_INSTRUCTIONS = [
  'Product import — mandatory fields (columns marked with * in the Data sheet)',
  '',
  'Always required:',
  '  • Parent SKU * — used as the product SKU when Variation is blank or NO',
  '  • Title * OR Name * — at least one must be filled',
  '',
  'Required when Variation = YES:',
  '  • Child SKU * (if Variation=YES)',
  '  • Parent SKU * must also be filled',
  '',
  'Variation column:',
  '  • Leave blank or set NO for a single-SKU product (SKU = Parent SKU)',
  '  • Set YES for a variant product (SKU = Child SKU; Parent SKU links variants)',
  '',
  'Supplier Code (optional):',
  '  • Enter the supplier code from Master → Suppliers (Supplier Code field)',
  '  • Multiple suppliers: comma-separated codes (e.g. SSPL-01, VND-02)',
  '  • Codes must already exist; unknown codes will fail that row',
  '  • Leave blank to keep existing suppliers on update (or assign none on create)',
  '',
  'All other columns are optional for import pre-checks.',
  'Note: empty optional fields may still cause row save errors (category, dimensions, images, etc.).',
];

const PRODUCT_IMPORT_LABEL_MAP = PRODUCT_TEMPLATE_HEADERS.reduce((acc, header) => {
  acc[header.key] = [header.label, ...(header.aliases || [])];
  return acc;
}, {});

function getImportRowValue(row, key) {
  const labels = PRODUCT_IMPORT_LABEL_MAP[key] || [];
  for (const label of labels) {
    const value = row[label];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function parseProductImportSkuFields(row) {
  const variation = getImportRowValue(row, 'variation').toUpperCase();
  const parentSku = getImportRowValue(row, 'parentSkuOrAsin');
  const childSku = getImportRowValue(row, 'sku');
  const isVariation = variation === 'YES';
  const sku = isVariation ? childSku : parentSku || childSku;

  return { variation, parentSku, childSku, isVariation, sku };
}

function validateProductImportRow(row, rowNum) {
  const { variation, parentSku, childSku, isVariation, sku } = parseProductImportSkuFields(row);
  const name = getImportRowValue(row, 'name') || getImportRowValue(row, 'title');
  const title = getImportRowValue(row, 'title') || name;

  const hasAnyData =
    sku ||
    parentSku ||
    name ||
    title ||
    getImportRowValue(row, 'category') ||
    getImportRowValue(row, 'ean') ||
    getImportRowValue(row, 'brandName');

  if (!hasAnyData) {
    return { skip: true };
  }

  if (!sku) {
    return {
      error: {
        row: rowNum,
        field: 'sku',
        message: isVariation
          ? 'Child SKU is required when Variation is YES'
          : 'Parent SKU is required',
        data: row,
      },
    };
  }

  if (isVariation && !parentSku) {
    return {
      error: {
        row: rowNum,
        field: 'parentSkuOrAsin',
        message: 'Parent SKU is required when Variation is YES',
        data: row,
      },
    };
  }

  if (!name) {
    return {
      error: {
        row: rowNum,
        field: 'name',
        message: 'Name or Title is required',
        data: row,
      },
    };
  }

  return {
    skip: false,
    parsed: { variation, parentSku, childSku, isVariation, sku, name, title },
  };
}

function buildProductDataFromImportRow(row, parsed, categoryRefs) {
  const { isVariation, parentSku, sku, name, title } = parsed;

  const productData = {
    slno: getImportRowValue(row, 'slno') ? parseInt(getImportRowValue(row, 'slno'), 10) : undefined,
    parentSkuOrAsin: isVariation ? parentSku : '',
    variation: getImportRowValue(row, 'variation'),
    sku,
    ean: getImportRowValue(row, 'ean'),
    brandName: getImportRowValue(row, 'brandName'),
    title,
    name,
    colour: getImportRowValue(row, 'colour'),
    material: getImportRowValue(row, 'material'),
    size: getImportRowValue(row, 'size'),
    hsnCode: getImportRowValue(row, 'hsnCode'),
    description: getImportRowValue(row, 'description'),
    manufacturerName: getImportRowValue(row, 'manufacturerName'),
    contactDetails: getImportRowValue(row, 'contactDetails'),
    bulletPoints: [
      getImportRowValue(row, 'bulletPoint1'),
      getImportRowValue(row, 'bulletPoint2'),
      getImportRowValue(row, 'bulletPoint3'),
      getImportRowValue(row, 'bulletPoint4'),
      getImportRowValue(row, 'bulletPoint5'),
    ].filter((bp) => bp),
    productDimensionCm: {
      length: getImportRowValue(row, 'productDimensionLength')
        ? parseFloat(getImportRowValue(row, 'productDimensionLength'))
        : undefined,
      width: getImportRowValue(row, 'productDimensionWidth')
        ? parseFloat(getImportRowValue(row, 'productDimensionWidth'))
        : undefined,
      height: getImportRowValue(row, 'productDimensionHeight')
        ? parseFloat(getImportRowValue(row, 'productDimensionHeight'))
        : undefined,
    },
    packageDimensionCm: {
      length: getImportRowValue(row, 'packageDimensionLength')
        ? parseFloat(getImportRowValue(row, 'packageDimensionLength'))
        : undefined,
      width: getImportRowValue(row, 'packageDimensionWidth')
        ? parseFloat(getImportRowValue(row, 'packageDimensionWidth'))
        : undefined,
      height: getImportRowValue(row, 'packageDimensionHeight')
        ? parseFloat(getImportRowValue(row, 'packageDimensionHeight'))
        : undefined,
    },
    weight: getImportRowValue(row, 'weight') ? parseFloat(getImportRowValue(row, 'weight')) : undefined,
    shape: getImportRowValue(row, 'shape'),
    specialFeature: getImportRowValue(row, 'specialFeature'),
    images: parseImagesCell(getImportRowValue(row, 'images') || row['Images (comma-separated URLs)']),
    ...categoryRefs,
  };

  Object.keys(productData).forEach((key) => {
    if (productData[key] === undefined) delete productData[key];
  });

  if (
    productData.productDimensionCm &&
    Object.values(productData.productDimensionCm).every((v) => v === undefined)
  ) {
    delete productData.productDimensionCm;
  }
  if (
    productData.packageDimensionCm &&
    Object.values(productData.packageDimensionCm).every((v) => v === undefined)
  ) {
    delete productData.packageDimensionCm;
  }

  return productData;
}

function buildProductQuery(queryParams = {}) {
  const { search, category, subCategory, brandName } = queryParams;
  const query = {};

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { title: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
      { ean: { $regex: search, $options: 'i' } },
      { brandName: { $regex: search, $options: 'i' } },
      { hsnCode: { $regex: search, $options: 'i' } },
      { manufacturerName: { $regex: search, $options: 'i' } },
    ];
  }

  if (category) {
    query.category = category;
  }

  if (subCategory) {
    query.subCategory = subCategory;
  }

  if (brandName) {
    query.brandName = brandName;
  }

  return query;
}

function formatSupplierCodesForExport(suppliers) {
  if (!suppliers || !suppliers.length) return '';
  return suppliers
    .map((link) => link.supplier?.supplierCode || link.supplier?.supplierId || '')
    .filter(Boolean)
    .join(', ');
}

function formatSuppliersForExport(suppliers) {
  if (!suppliers || !suppliers.length) return '';
  return suppliers
    .map((link) => {
      const name = link.supplier?.name || 'Unknown';
      const code = link.supplier?.supplierCode || link.supplier?.supplierId;
      const parts = code ? [`${name} (${code})`] : [name];
      if (link.sku) parts.push(`SKU: ${link.sku}`);
      if (link.unit) parts.push(`Unit: ${link.unit}`);
      return parts.join(' — ');
    })
    .join('; ');
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve comma/semicolon-separated supplier codes to product supplier links.
 * Returns null when no codes were provided (caller should leave existing suppliers untouched).
 */
async function resolveSupplierLinksFromCodes(codesRaw, productSku, productUnit = 'pcs') {
  if (codesRaw === undefined || codesRaw === null || String(codesRaw).trim() === '') {
    return null;
  }

  const codes = String(codesRaw)
    .split(/[,;]/)
    .map((code) => code.trim())
    .filter(Boolean);

  if (codes.length === 0) {
    return { links: [], missing: [] };
  }

  const links = [];
  const missing = [];

  for (const code of codes) {
    const pattern = new RegExp(`^${escapeRegex(code)}$`, 'i');
    const supplier = await Supplier.findOne({
      $or: [{ supplierCode: pattern }, { supplierId: pattern }],
    }).select('_id supplierCode supplierId name');

    if (!supplier) {
      missing.push(code);
      continue;
    }

    links.push({
      supplier: supplier._id,
      sku: productSku || '',
      unit: productUnit || 'pcs',
    });
  }

  return {
    links: dedupeSupplierLinks(links),
    missing,
  };
}

function mapProductToExportRow(product) {
  const bulletPoints = product.bulletPoints || [];
  const pd = product.productDimensionCm || {};
  const pkd = product.packageDimensionCm || {};

  return {
    slno: product.slno ?? '',
    parentSkuOrAsin: product.parentSkuOrAsin || '',
    variation: product.variation || '',
    sku: product.sku || '',
    ean: product.ean || '',
    category: product.category?.name || '',
    subCategory: product.subCategory?.name || '',
    brandName: product.brandName || '',
    title: product.title || '',
    name: product.name || '',
    productUrl: product.productUrl || '',
    colour: product.colour || '',
    material: product.material || '',
    size: product.size || '',
    hsnCode: product.hsnCode || '',
    description: product.description || '',
    manufacturerName: product.manufacturerName || '',
    contactDetails: product.contactDetails || '',
    bulletPoint1: bulletPoints[0] || '',
    bulletPoint2: bulletPoints[1] || '',
    bulletPoint3: bulletPoints[2] || '',
    bulletPoint4: bulletPoints[3] || '',
    bulletPoint5: bulletPoints[4] || '',
    productDimensionLength: pd.length ?? '',
    productDimensionWidth: pd.width ?? '',
    productDimensionHeight: pd.height ?? '',
    packageDimensionLength: pkd.length ?? '',
    packageDimensionWidth: pkd.width ?? '',
    packageDimensionHeight: pkd.height ?? '',
    weight: product.weight ?? '',
    shape: product.shape || '',
    specialFeature: product.specialFeature || '',
    images: (product.images || []).filter(Boolean).join(', '),
    keywords: (product.keywords || []).filter(Boolean).join(', '),
    unit: product.unit || '',
    supplierCode: formatSupplierCodesForExport(product.suppliers),
    suppliers: formatSuppliersForExport(product.suppliers),
    createdAt: product.createdAt ? new Date(product.createdAt).toISOString() : '',
    updatedAt: product.updatedAt ? new Date(product.updatedAt).toISOString() : '',
  };
}

async function resolveProductHsnCode(body, fallbackCategoryId) {
  if (body.hsnCode && String(body.hsnCode).trim()) {
    return String(body.hsnCode).trim();
  }
  const categoryId = body.category || fallbackCategoryId;
  if (!categoryId) return null;
  const category = await Category.findById(categoryId).select('hsnCode').lean();
  if (category?.hsnCode && String(category.hsnCode).trim()) {
    return String(category.hsnCode).trim();
  }
  return null;
}

// File management utilities
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads', 'products');

// Ensure uploads directory exists
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Sanitize SKU for use as folder name
function sanitizeSkuForFolderName(sku) {
  if (!sku) return null;
  // Remove or replace invalid characters for folder names
  return sku.replace(/[<>:"/\\|?*]/g, '_').trim();
}

// Get upload directory for a product
function getUploadDirectory(productId, sku) {
  ensureDirectoryExists(UPLOADS_DIR);
  if (sku) {
    const sanitizedSku = sanitizeSkuForFolderName(sku);
    return path.join(UPLOADS_DIR, sanitizedSku);
  } else {
    return path.join(UPLOADS_DIR, `_temp_${productId}`);
  }
}

// Move files from temp folder to SKU folder
async function moveTempImagesToSkuFolder(productId, sku) {
  try {
    const tempDir = path.join(UPLOADS_DIR, `_temp_${productId}`);
    const skuDir = path.join(UPLOADS_DIR, sanitizeSkuForFolderName(sku));
    
    if (!fs.existsSync(tempDir)) {
      return; // No temp folder to move
    }
    
    ensureDirectoryExists(skuDir);
    
    const files = fs.readdirSync(tempDir);
    const movedFiles = [];
    
    for (const file of files) {
      const sourcePath = path.join(tempDir, file);
      const destPath = path.join(skuDir, file);
      fs.renameSync(sourcePath, destPath);
      movedFiles.push(`products/${sanitizeSkuForFolderName(sku)}/${file}`);
    }
    
    // Remove temp directory
    fs.rmdirSync(tempDir);
    
    // Update product images paths
    const product = await Product.findById(productId);
    if (product && product.images) {
      product.images = product.images.map(img => {
        if (img.startsWith(`products/_temp_${productId}/`)) {
          return img.replace(`products/_temp_${productId}/`, `products/${sanitizeSkuForFolderName(sku)}/`);
        }
        return img;
      });
      await product.save();
    }
    
    logger.backend.info('Moved temp images to SKU folder', { productId, sku, movedFiles: movedFiles.length });
    return movedFiles;
  } catch (error) {
    logger.backend.error('Error moving temp images to SKU folder', { error: error.message, stack: error.stack });
    throw error;
  }
}

// Configure multer for image uploads with disk storage
// We'll create a dynamic storage function that can be configured per route
function createImageStorage(productId, sku) {
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = getUploadDirectory(productId, sku);
      ensureDirectoryExists(uploadDir);
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      const ext = path.extname(file.originalname);
      const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
      cb(null, `${name}_${timestamp}${ext}`);
    }
  });
}

// File filter for images only
const imageFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images (jpg, jpeg, png, gif, webp) are allowed.'), false);
  }
};

// Configure multer for image uploads - will be configured dynamically per route
function getImageUploadMiddleware(productId, sku) {
  return multer({
    storage: createImageStorage(productId, sku),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit per image
    fileFilter: imageFilter
  });
}

// Configure multer for Excel uploads (keep memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Helper function to generate next sequential serial number
async function generateNextSerialNumber() {
  try {
    // Find the maximum slno value in the Product collection
    const maxProduct = await Product.findOne({ slno: { $exists: true, $ne: null } })
      .sort({ slno: -1 })
      .select('slno')
      .lean();
    
    // If no products exist or no slno found, return 1
    if (!maxProduct || maxProduct.slno === null || maxProduct.slno === undefined) {
      return 1;
    }
    
    // Return the next sequential number
    return maxProduct.slno + 1;
  } catch (error) {
    logger.backend.error('Error generating next serial number', { error: error.message, stack: error.stack });
    // On error, default to 1 to ensure we can still create products
    return 1;
  }
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugifyCategoryHsn(name) {
  return (
    String(name)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 12) || 'GEN'
  );
}

async function findCategoryByName(catName) {
  const trimmed = String(catName).trim();
  if (!trimmed) return null;

  let category = await Category.findOne({
    name: { $regex: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') },
  });
  if (category) return category;

  // Gemstones ↔ Gemstone, Brass ↔ Brasses, etc.
  const lower = trimmed.toLowerCase();
  const variants = [];
  if (lower.endsWith('s') && lower.length > 3) {
    variants.push(lower.slice(0, -1));
  } else {
    variants.push(`${lower}s`);
  }
  if (lower.endsWith('es') && lower.length > 4) {
    variants.push(lower.slice(0, -2));
  }

  for (const variant of variants) {
    category = await Category.findOne({
      name: { $regex: new RegExp(`^${escapeRegex(variant)}$`, 'i') },
    });
    if (category) return category;
  }

  return null;
}

async function getOrCreateCategory(catName, productHsnCode, cache) {
  const key = String(catName).trim().toLowerCase();
  if (cache.has(key)) return cache.get(key);

  let category = await findCategoryByName(catName);
  if (!category) {
    const displayName = String(catName).trim();
    let hsnCode = productHsnCode ? String(productHsnCode).trim() : '';

    if (hsnCode) {
      const existingByHsn = await Category.findOne({ hsnCode });
      if (existingByHsn) {
        cache.set(key, existingByHsn);
        return existingByHsn;
      }
    } else {
      hsnCode = slugifyCategoryHsn(displayName);
      let suffix = 0;
      while (await Category.findOne({ hsnCode })) {
        suffix += 1;
        hsnCode = `${slugifyCategoryHsn(displayName).slice(0, 8)}-${suffix}`;
      }
    }

    try {
      category = new Category({ name: displayName, hsnCode });
      await category.save();
      logger.backend.info('Auto-created category during product import', {
        name: displayName,
        hsnCode,
      });
    } catch (err) {
      if (err.code === 11000) {
        category =
          (await findCategoryByName(catName)) ||
          (hsnCode ? await Category.findOne({ hsnCode }) : null);
      }
      if (!category) throw err;
    }
  }

  cache.set(key, category);
  return category;
}

async function resolveCategoryRefs(categoryName, subCategoryName, options = {}) {
  const {
    autoCreate = false,
    productHsnCode = '',
    categoryCache,
    subcategoryCache,
  } = options;
  const refs = {};
  const catName = categoryName ? String(categoryName).trim() : '';
  if (!catName) {
    return refs;
  }

  const category =
    autoCreate && categoryCache
      ? await getOrCreateCategory(catName, productHsnCode, categoryCache)
      : await findCategoryByName(catName);

  if (!category) {
    throw new Error(`Category not found: "${catName}". Create it in Categories first.`);
  }
  refs.category = category._id;

  const subName = subCategoryName ? String(subCategoryName).trim() : '';
  if (subName) {
    const subKey = `${category._id}:${subName.toLowerCase()}`;
    let subCategory = subcategoryCache?.get(subKey);

    if (!subCategory) {
      subCategory = await Subcategory.findOne({
        name: { $regex: new RegExp(`^${escapeRegex(subName)}$`, 'i') },
        category: category._id,
      });

      if (!subCategory && autoCreate) {
        try {
          subCategory = new Subcategory({ name: subName, category: category._id });
          await subCategory.save();
          logger.backend.info('Auto-created subcategory during product import', {
            name: subName,
            category: category.name,
          });
        } catch (err) {
          if (err.code === 11000) {
            subCategory = await Subcategory.findOne({
              name: { $regex: new RegExp(`^${escapeRegex(subName)}$`, 'i') },
              category: category._id,
            });
          } else {
            throw err;
          }
        }
      }

      if (subCategory && subcategoryCache) {
        subcategoryCache.set(subKey, subCategory);
      }
    }

    if (!subCategory) {
      throw new Error(
        `Sub Category not found: "${subName}" under category "${catName}". Create it in Subcategories first.`
      );
    }
    refs.subCategory = subCategory._id;
  }

  return refs;
}

function parseImagesCell(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return [];
  }
  return String(value)
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);
}

// GET all products (with pagination)
// GET product count
router.get('/count', async (req, res) => {
  try {
    const query = buildProductQuery(req.query);
    const count = await Product.countDocuments(query);
    res.json({ count });
  } catch (error) {
    logger.backend.error('Error counting products', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { page, limit } = req.query;
    const query = buildProductQuery(req.query);

    // Use pagination if page/limit provided, otherwise return all
    if (page || limit) {
      const result = await paginate(Product, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: [
          { path: 'category', select: 'name hsnCode' },
          { path: 'subCategory', select: 'name category', populate: { path: 'category', select: 'name hsnCode' } },
          SUPPLIER_POPULATE,
        ]
      });
      res.json(result);
    } else {
      const products = await Product.find(query)
        .populate('category', 'name hsnCode')
        .populate({ path: 'subCategory', select: 'name category', populate: { path: 'category', select: 'name hsnCode' } })
        .populate(SUPPLIER_POPULATE)
        .sort({ createdAt: -1 });
      res.json(products);
    }
  } catch (error) {
    logger.backend.error('Error fetching products', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET Excel template (must be before /:id route)
router.get('/template', (req, res) => {
  try {
    logger.backend.info('Generating product template');
    const sampleData = [
      {
        slno: 1,
        parentSkuOrAsin: 'PARENT-001',
        variation: 'YES',
        sku: 'CHILD-001-RED',
        ean: '',
        category: 'Brass',
        subCategory: 'Statues',
        brandName: 'Sample Brand',
        supplierCode: 'SSPL-01',
        title: 'Sample Variant Product',
        name: 'Sample Variant Product',
        colour: 'Gold',
        material: 'Brass',
        size: 'Medium',
        hsnCode: '',
        description: 'Variant row — Variation=YES requires Parent SKU and Child SKU',
        manufacturerName: '',
        contactDetails: '',
        bulletPoint1: 'Feature one',
        productDimensionLength: 10,
        productDimensionWidth: 5,
        productDimensionHeight: 3,
        weight: 0.5,
        images: '',
      },
      {
        slno: 2,
        parentSkuOrAsin: 'SINGLE-002',
        variation: 'NO',
        sku: '',
        ean: '',
        category: 'Brass',
        subCategory: '',
        brandName: 'Sample Brand',
        supplierCode: 'SSPL-01',
        title: 'Sample Single SKU Product',
        name: 'Sample Single SKU Product',
        colour: 'Gold',
        material: 'Brass',
        size: 'Large',
        hsnCode: '',
        description: 'Single-SKU row — Parent SKU is used as the product SKU',
        manufacturerName: '',
        contactDetails: '',
        bulletPoint1: 'Feature one',
        productDimensionLength: 12,
        productDimensionWidth: 6,
        productDimensionHeight: 4,
        weight: 0.8,
        images: '',
      },
    ];

    logger.backend.info('Calling generateTemplate with', { headerCount: PRODUCT_TEMPLATE_HEADERS.length });
    const buffer = generateTemplate(PRODUCT_TEMPLATE_HEADERS, sampleData, {
      instructions: PRODUCT_TEMPLATE_INSTRUCTIONS,
    });
    logger.backend.info('Template generated, buffer size:', buffer.length);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=products_template.xlsx');
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error generating product template', { 
      error: error.message, 
      stack: error.stack,
      name: error.name
    });
    console.error('Template generation error:', error);
    res.status(500).json({ error: error.message, details: error.stack });
  }
});

// GET export products as Excel (must be before /:id route)
router.get('/export', async (req, res) => {
  try {
    const query = buildProductQuery(req.query);
    const products = await Product.find(query)
      .populate('category', 'name hsnCode')
      .populate({
        path: 'subCategory',
        select: 'name category',
        populate: { path: 'category', select: 'name hsnCode' },
      })
      .populate(SUPPLIER_POPULATE)
      .sort({ createdAt: -1 });

    const rows = products.map(mapProductToExportRow);
    const buffer = exportToExcel(rows, PRODUCT_EXPORT_HEADERS);
    const filename = `products_export_${new Date().toISOString().slice(0, 10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error exporting products', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET single product
router.get('/:id', async (req, res) => {
  try {
    // Prevent matching special routes
    if (req.params.id === 'template' || req.params.id === 'import' || req.params.id === 'export') {
      return res.status(404).json({ error: 'Route not found' });
    }
    
    const product = await Product.findById(req.params.id)
      .populate('category', 'name hsnCode')
      .populate({ path: 'subCategory', select: 'name category', populate: { path: 'category', select: 'name hsnCode' } })
      .populate(SUPPLIER_POPULATE);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST upload images for a product
router.post('/:id/images', productEditAccess, async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findById(productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    const sku = product.sku || null;
    const uploadMiddleware = getImageUploadMiddleware(productId, sku);
    
    uploadMiddleware.array('images', 10)(req, res, async (err) => {
      if (err) {
        logger.backend.error('Multer error', { error: err.message });
        return res.status(400).json({ error: err.message });
      }
      
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images uploaded' });
      }
      
      const imagePaths = req.files.map(file => {
        const relativePath = sku 
          ? `products/${sanitizeSkuForFolderName(sku)}/${file.filename}`
          : `products/_temp_${productId}/${file.filename}`;
        return relativePath;
      });
      
      // Add new image paths to existing images array
      if (!product.images) {
        product.images = [];
      }
      product.images = [...product.images, ...imagePaths];
      await product.save();
      
      res.json({ 
        success: true, 
        images: imagePaths,
        message: `${imagePaths.length} image(s) uploaded successfully`
      });
    });
  } catch (error) {
    logger.backend.error('Error uploading images', { error: error.message, stack: error.stack });
    // Clean up uploaded files on error
    if (req.files && req.files.length > 0) {
      req.files.forEach(file => {
        try {
          fs.unlinkSync(file.path);
        } catch (err) {
          logger.backend.error('Error cleaning up file on error', { error: err.message });
        }
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// POST create product
router.post('/', productEditAccess, async (req, res) => {
  try {
    if (!req.body.sku || !String(req.body.sku).trim()) {
      return res.status(400).json({ error: 'SKU is required' });
    }
    req.body.sku = String(req.body.sku).trim();

    // Check if slno is provided, if not auto-generate it
    if (!req.body.slno || req.body.slno === '' || req.body.slno === null || req.body.slno === undefined) {
      req.body.slno = await generateNextSerialNumber();
    }

    const hsnCode = await resolveProductHsnCode(req.body);
    if (!hsnCode) {
      return res.status(400).json({
        error: 'HSN Code is required. Select a category that has an HSN code defined.',
      });
    }
    req.body.hsnCode = hsnCode;

    const product = new Product(req.body);
    await product.save();
    
    // If SKU was added and there are temp images, move them
    if (product.sku && product.images && product.images.some(img => img.includes('_temp_'))) {
      try {
        await moveTempImagesToSkuFolder(product._id.toString(), product.sku);
      } catch (error) {
        logger.backend.error('Error moving temp images after product creation', { error: error.message });
        // Don't fail product creation if image move fails
      }
    }
    
    res.status(201).json(product);
  } catch (error) {
    logger.backend.error('Error creating product', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      code: error.code
    });
    if (error.code === 11000) {
      res.status(400).json({ error: 'SKU already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update product
router.put('/:id', productEditAccess, async (req, res) => {
  try {
    const productId = req.params.id;
    const oldProduct = await Product.findById(productId);
    
    if (!oldProduct) {
      return res.status(404).json({ error: 'Product not found' });
    }

    if (req.body.sku !== undefined && !String(req.body.sku).trim()) {
      return res.status(400).json({ error: 'SKU is required' });
    }
    if (req.body.sku) {
      req.body.sku = String(req.body.sku).trim();
    }

    const hsnCode = await resolveProductHsnCode(req.body, oldProduct.category);
    if (!hsnCode) {
      return res.status(400).json({
        error: 'HSN Code is required. Select a category that has an HSN code defined.',
      });
    }
    req.body.hsnCode = hsnCode;

    const oldSku = oldProduct.sku;
    const newSku = req.body.sku;
    
    // Update product
    const product = await Product.findByIdAndUpdate(
      productId,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('category', 'name hsnCode')
      .populate({ path: 'subCategory', select: 'name category', populate: { path: 'category', select: 'name hsnCode' } })
      .populate(SUPPLIER_POPULATE);
    
    // If SKU changed from empty to value, or from one value to another, move images
    if (newSku && newSku !== oldSku) {
      try {
        // If old SKU was empty, move from temp folder
        if (!oldSku) {
          await moveTempImagesToSkuFolder(productId, newSku);
        } else {
          // If SKU changed, move from old SKU folder to new SKU folder
          const oldSkuDir = path.join(UPLOADS_DIR, sanitizeSkuForFolderName(oldSku));
          const newSkuDir = path.join(UPLOADS_DIR, sanitizeSkuForFolderName(newSku));
          
          if (fs.existsSync(oldSkuDir)) {
            ensureDirectoryExists(newSkuDir);
            const files = fs.readdirSync(oldSkuDir);
            
            for (const file of files) {
              const sourcePath = path.join(oldSkuDir, file);
              const destPath = path.join(newSkuDir, file);
              fs.renameSync(sourcePath, destPath);
            }
            
            // Update image paths in product
            if (product.images) {
              product.images = product.images.map(img => {
                if (img.startsWith(`products/${sanitizeSkuForFolderName(oldSku)}/`)) {
                  return img.replace(
                    `products/${sanitizeSkuForFolderName(oldSku)}/`,
                    `products/${sanitizeSkuForFolderName(newSku)}/`
                  );
                }
                return img;
              });
              await product.save();
            }
            
            // Remove old SKU directory
            fs.rmdirSync(oldSkuDir);
          }
        }
      } catch (error) {
        logger.backend.error('Error moving images after SKU update', { error: error.message });
        // Don't fail product update if image move fails
      }
    }
    
    res.json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update product suppliers (multiple)
router.put('/:id/suppliers', productEditAccess, async (req, res) => {
  try {
    if (req.params.id === 'template' || req.params.id === 'import') {
      return res.status(404).json({ error: 'Route not found' });
    }

    const { suppliers } = req.body;
    if (!Array.isArray(suppliers)) {
      return res.status(400).json({ error: 'suppliers must be an array' });
    }

    const existing = await Product.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const supplierLinks = parseSupplierLinksPayload(suppliers, existing);
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { suppliers: supplierLinks },
      { new: true, runValidators: true }
    )
      .populate('category', 'name hsnCode')
      .populate({ path: 'subCategory', select: 'name category', populate: { path: 'category', select: 'name hsnCode' } })
      .populate(SUPPLIER_POPULATE);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE product
router.delete('/:id', productEditAccess, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import products from Excel
router.post('/import', productEditAccess, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { mode = 'both' } = req.body; // 'create', 'update', or 'both'
    const fileBuffer = req.file.buffer;
    
    // Parse Excel file
    const excelData = parseExcel(fileBuffer);
    
    if (excelData.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    let imported = 0;
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    let categoriesCreated = 0;
    let subcategoriesCreated = 0;
    const errors = [];
    const fileSkuFirstRow = new Map();
    const categoryCache = new Map();
    const subcategoryCache = new Map();

    // Process each row
    for (let i = 0; i < excelData.length; i++) {
      const row = excelData[i];
      const rowNum = i + 2; // +2 for header row and 0-index

      try {
        const rowValidation = validateProductImportRow(row, rowNum);
        if (rowValidation.skip) {
          skipped++;
          continue;
        }
        if (rowValidation.error) {
          errors.push(rowValidation.error);
          failed++;
          continue;
        }

        const { parsed } = rowValidation;
        const { sku } = parsed;

        if (fileSkuFirstRow.has(sku)) {
          if (mode === 'create') {
            errors.push({
              row: rowNum,
              field: 'sku',
              message: `Duplicate SKU in Excel (first used on row ${fileSkuFirstRow.get(sku)})`,
              data: row,
            });
            failed++;
            continue;
          }
        } else {
          fileSkuFirstRow.set(sku, rowNum);
        }

        const catNameForImport = getImportRowValue(row, 'category');
        const categoryCountBefore = categoryCache.size;
        const subcategoryCountBefore = subcategoryCache.size;

        const categoryRefs = await resolveCategoryRefs(
          getImportRowValue(row, 'category') || row['Category'],
          getImportRowValue(row, 'subCategory') || row['Sub Category'],
          {
            autoCreate: true,
            productHsnCode: getImportRowValue(row, 'hsnCode') || row['HSN Code'],
            categoryCache,
            subcategoryCache,
          }
        );

        if (catNameForImport && categoryCache.size > categoryCountBefore) {
          categoriesCreated += categoryCache.size - categoryCountBefore;
        }
        if (subcategoryCache.size > subcategoryCountBefore) {
          subcategoriesCreated += subcategoryCache.size - subcategoryCountBefore;
        }

        const productData = buildProductDataFromImportRow(row, parsed, categoryRefs);

        const supplierCodesRaw = getImportRowValue(row, 'supplierCode');
        if (supplierCodesRaw) {
          const resolved = await resolveSupplierLinksFromCodes(
            supplierCodesRaw,
            productData.sku,
            productData.unit || 'pcs'
          );
          if (resolved.missing.length) {
            errors.push({
              row: rowNum,
              field: 'supplierCode',
              message: `Supplier code(s) not found: ${resolved.missing.join(', ')}`,
              data: row,
            });
            failed++;
            continue;
          }
          productData.suppliers = resolved.links;
        }

        if (!productData.slno) {
          productData.slno = await generateNextSerialNumber();
        }

        // Match existing products by SKU only (never by name — names repeat across variants)
        const existingProduct = await Product.findOne({ sku: productData.sku });

        if (existingProduct) {
          if (mode === 'create') {
            errors.push({
              row: rowNum,
              field: 'sku',
              message: `SKU already exists in database: ${productData.sku}`,
              data: row,
            });
            failed++;
            continue;
          }
          await Product.findByIdAndUpdate(existingProduct._id, productData, { runValidators: true });
          updated++;
        } else {
          if (mode === 'update') {
            errors.push({
              row: rowNum,
              field: 'sku',
              message: `Product not found for update (SKU: ${productData.sku})`,
              data: row,
            });
            failed++;
            continue;
          }
          const product = new Product(productData);
          await product.save();
          imported++;
        }
      } catch (error) {
        errors.push({
          row: rowNum,
          field: 'general',
          message: error.message,
          data: row,
        });
        failed++;
      }
    }

    const errorSummary = buildImportErrorSummary(errors);

    res.json({
      success: true,
      totalRows: excelData.length,
      imported,
      updated,
      failed,
      skipped,
      categoriesCreated,
      subcategoriesCreated,
      processed: imported + updated + failed,
      errorSummary,
      errors: errors.slice(0, 100),
    });
  } catch (error) {
    logger.backend.error('Error importing products', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

