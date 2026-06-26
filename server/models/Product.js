const mongoose = require('mongoose');
const { normalizeSupplierLinks } = require('../utils/productSuppliers');

const productSchema = new mongoose.Schema({
  // Basic Information
  slno: {
    type: Number,
    trim: true
  },
  parentSkuOrAsin: {
    type: String,
    trim: true
  },
  variation: {
    type: String,
    trim: true
  },
  sku: {
    type: String,
    unique: true,
    trim: true,
    sparse: true
  },
  ean: {
    type: String,
    trim: true
  },
  title: {
    type: String,
    trim: true
  },
  productUrl: {
    type: String,
    trim: true
  },
  name: {
    type: String,
    trim: true
  },
  brandName: {
    type: String,
    trim: true
  },
  
  // Classification & Codes
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category'
  },
  subCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory'
  },
  // Keep hsnCode for backward compatibility during migration (will be removed later)
  hsnCode: {
    type: String,
    trim: true
  },
  manufacturerName: {
    type: String,
    trim: true
  },
  contactDetails: {
    type: String,
    trim: true
  },
  
  // Product Details
  colour: {
    type: String,
    trim: true
  },
  material: {
    type: String,
    trim: true
  },
  size: {
    type: String,
    trim: true
  },
  shape: {
    type: String,
    trim: true
  },
  weight: {
    type: Number,
    min: 0
  },
  specialFeature: {
    type: String,
    trim: true
  },
  
  // Dimensions
  productDimensionCm: {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 }
  },
  packageDimensionCm: {
    length: { type: Number, min: 0 },
    width: { type: Number, min: 0 },
    height: { type: Number, min: 0 }
  },
  
  // Marketing
  bulletPoints: [{
    type: String,
    trim: true
  }],
  
  // Media
  images: [{
    type: String,
    trim: true
  }],
  
  // Existing Fields
  description: {
    type: String,
    trim: true
  },
  keywords: [{
    type: String,
    trim: true
  }],
  unit: {
    type: String,
    default: 'pcs',
    trim: true
  },
  suppliers: [{
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
    },
    sku: { type: String, trim: true },
    unit: { type: String, trim: true, default: 'pcs' },
  }],
}, {
  timestamps: true
});

// Index for faster searches
productSchema.index({ name: 1 });
productSchema.index({ title: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ ean: 1 });
productSchema.index({ category: 1 });
productSchema.index({ subCategory: 1 });
productSchema.index({ brandName: 1 });
productSchema.index({ hsnCode: 1 });
productSchema.index({ manufacturerName: 1 });
productSchema.index({ keywords: 1 });
productSchema.index({ suppliers: 1 });
productSchema.index({ 'suppliers.supplier': 1 });

function suppliersNeedMigration(suppliers) {
  return (suppliers || []).some(
    (entry) => entry && !entry.supplier && mongoose.Types.ObjectId.isValid(String(entry))
  );
}

async function migrateSuppliersIfNeeded(doc) {
  if (!doc || !suppliersNeedMigration(doc.suppliers)) return;
  doc.suppliers = normalizeSupplierLinks(doc.suppliers, doc);
  doc.markModified('suppliers');
  await doc.save();
}

productSchema.post('find', async function (docs) {
  await Promise.all((docs || []).map((doc) => migrateSuppliersIfNeeded(doc)));
});

productSchema.post('findOne', async function (doc) {
  await migrateSuppliersIfNeeded(doc);
});

module.exports = mongoose.model('Product', productSchema);

