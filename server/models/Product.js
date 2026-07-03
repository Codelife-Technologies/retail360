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
    required: true,
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
    required: true,
    trim: true
  },
  
  // Classification & Codes
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: true
  },
  subCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subcategory',
    required: true
  },
  hsnCode: {
    type: String,
    required: true,
    trim: true
  },
  manufacturerName: {
    type: String,
    required: true,
    trim: true
  },
  contactDetails: {
    type: String,
    required: true,
    trim: true
  },
  
  // Product Details
  colour: {
    type: String,
    required: true,
    trim: true
  },
  material: {
    type: String,
    required: true,
    trim: true
  },
  size: {
    type: String,
    required: true,
    trim: true
  },
  shape: {
    type: String,
    trim: true
  },
  weight: {
    type: Number,
    required: true,
    min: 0
  },
  specialFeature: {
    type: String,
    trim: true
  },
  
  // Dimensions
  productDimensionCm: {
    length: { type: Number, required: true, min: 0 },
    width: { type: Number, required: true, min: 0 },
    height: { type: Number, required: true, min: 0 }
  },
  packageDimensionCm: {
    length: { type: Number, required: true, min: 0 },
    width: { type: Number, required: true, min: 0 },
    height: { type: Number, required: true, min: 0 }
  },
  
  // Marketing
  bulletPoints: [{
    type: String,
    trim: true
  }],
  
  // Media - at least one image required
  images: {
    type: [{
      type: String,
      trim: true
    }],
    validate: {
      validator: function(v) {
        return v && Array.isArray(v) && v.filter(i => i && String(i).trim()).length > 0;
      },
      message: 'At least one image is required'
    }
  },

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
    required: true,
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

