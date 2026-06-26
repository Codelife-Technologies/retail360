const express = require('express');
const router = express.Router();
const multer = require('multer');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const mongoose = require('mongoose');
const { paginate } = require('../utils/pagination');
const { parseExcel, validateExcelData } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

async function generateNextSupplierId() {
  const suppliers = await Supplier.find({ supplierId: /^SUP-/i })
    .select('supplierId')
    .lean();
  let maxNum = 0;
  for (const s of suppliers) {
    const match = String(s.supplierId || '').match(/^SUP-(\d+)$/i);
    if (match) {
      maxNum = Math.max(maxNum, parseInt(match[1], 10));
    }
  }
  return `SUP-${String(maxNum + 1).padStart(4, '0')}`;
}

function mapSupplierRow(row) {
  return {
    supplierId: row['Supplier ID'] ? String(row['Supplier ID']).trim().toUpperCase() : '',
    name: row['Supplier Name *'] || row['Name *'] || '',
    supplierCode: row['Supplier Code'] || '',
    phone: row['Supplier Contact'] || row['Phone'] || '',
    contactPerson: row['Contact Person'] || '',
    gstin: row['GST No.'] || row['GST Number'] || '',
    bankDetails: row['Bank Detail'] || row['Bank Details'] || '',
    ifscCode: row['IFSC Code'] || '',
    bankPinCode: row['Bank Pin Code'] || '',
    email: row['Email'] || '',
    address: row['Address'] || '',
    pan: row['PAN Number'] || '',
  };
}

function extractSupplierLinkForProduct(product, supplierId) {
  const sid = String(supplierId);
  for (const entry of product.suppliers || []) {
    if (!entry) continue;
    const entrySupplierId = entry.supplier?._id || entry.supplier;
    if (entrySupplierId && String(entrySupplierId) === sid) {
      return {
        sku: entry.sku || product.sku || '',
        unit: entry.unit || product.unit || 'pcs',
      };
    }
    if (!entry.supplier && mongoose.Types.ObjectId.isValid(String(entry))) {
      if (String(entry) === sid) {
        return {
          sku: product.sku || '',
          unit: product.unit || 'pcs',
        };
      }
    }
  }
  return { sku: product.sku || '', unit: product.unit || 'pcs' };
}

async function attachLinkedProductsToSuppliers(suppliers) {
  const list = suppliers.map((s) => (s.toObject ? s.toObject() : { ...s }));
  if (list.length === 0) return list;

  const supplierIdSet = new Set(list.map((s) => String(s._id)));
  const products = await Product.find({
    $or: [
      { 'suppliers.supplier': { $in: list.map((s) => s._id) } },
      { suppliers: { $in: list.map((s) => s._id) } },
    ],
  })
    .select('sku title name unit suppliers')
    .lean();

  const bySupplier = new Map();
  for (const product of products) {
    const seenForProduct = new Set();
    for (const entry of product.suppliers || []) {
      let sid = entry?.supplier?._id || entry?.supplier;
      if (!sid && entry && mongoose.Types.ObjectId.isValid(String(entry))) {
        sid = entry;
      }
      if (!sid || !supplierIdSet.has(String(sid)) || seenForProduct.has(String(sid))) continue;
      seenForProduct.add(String(sid));
      const link = extractSupplierLinkForProduct(product, sid);
      if (!bySupplier.has(String(sid))) bySupplier.set(String(sid), []);
      bySupplier.get(String(sid)).push({
        _id: product._id,
        sku: link.sku,
        unit: link.unit,
        title: product.title || product.name || '',
      });
    }
  }

  return list.map((supplier) => {
    const linkedProducts = (bySupplier.get(String(supplier._id)) || []).sort((a, b) =>
      (a.sku || '').localeCompare(b.sku || '')
    );
    return {
      ...supplier,
      productCount: linkedProducts.length,
      linkedProducts,
    };
  });
}

// GET all suppliers (with pagination)
router.get('/', async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { supplierId: { $regex: search, $options: 'i' } },
        { name: { $regex: search, $options: 'i' } },
        { supplierCode: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
        { contactPerson: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { gstin: { $regex: search, $options: 'i' } },
        { ifscCode: { $regex: search, $options: 'i' } },
        { pan: { $regex: search, $options: 'i' } },
      ];
    }
    
    if (page || limit) {
      const result = await paginate(Supplier, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 }
      });
      result.data = await attachLinkedProductsToSuppliers(result.data);
      res.json(result);
    } else {
      const suppliers = await Supplier.find(query).sort({ createdAt: -1 });
      res.json(await attachLinkedProductsToSuppliers(suppliers));
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET products linked to a supplier
router.get('/:id/products', async (req, res) => {
  try {
    const supplierId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(supplierId)) {
      return res.status(400).json({ error: 'Invalid supplier id' });
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const products = await Product.find({
      $or: [{ 'suppliers.supplier': supplierId }, { suppliers: supplierId }],
    })
      .populate('category', 'name')
      .select('sku title name unit category suppliers')
      .sort({ title: 1, name: 1 })
      .lean();

    const data = products.map((product) => {
      const link = extractSupplierLinkForProduct(product, supplierId);
      return {
        _id: product._id,
        sku: link.sku,
        unit: link.unit,
        title: product.title || product.name || '',
        category: product.category?.name || '',
      };
    });

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single supplier
router.get('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create supplier
router.post('/', async (req, res) => {
  try {
    const body = { ...req.body };
    if (!body.supplierId || !String(body.supplierId).trim()) {
      body.supplierId = await generateNextSupplierId();
    } else {
      body.supplierId = String(body.supplierId).trim().toUpperCase();
    }
    const supplier = new Supplier(body);
    await supplier.save();
    res.status(201).json(supplier);
  } catch (error) {
    if (error.code === 11000) {
      const field = error.keyPattern?.supplierId ? 'Supplier ID' : 'field';
      return res.status(400).json({ error: `${field} already exists` });
    }
    res.status(400).json({ error: error.message });
  }
});

// PUT update supplier
router.put('/:id', async (req, res) => {
  try {
    const existing = await Supplier.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    const body = { ...req.body };
    if (body.supplierId) {
      body.supplierId = String(body.supplierId).trim().toUpperCase();
    } else if (!existing.supplierId) {
      body.supplierId = await generateNextSupplierId();
    }
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    );
    res.json(supplier);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Supplier ID already exists' });
    }
    res.status(400).json({ error: error.message });
  }
});

// DELETE supplier
router.delete('/:id', async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Excel template
router.get('/template', (req, res) => {
  try {
    const headers = [
      { key: 'supplierId', label: 'Supplier ID' },
      { key: 'name', label: 'Supplier Name *' },
      { key: 'supplierCode', label: 'Supplier Code' },
      { key: 'phone', label: 'Supplier Contact' },
      { key: 'contactPerson', label: 'Contact Person' },
      { key: 'gstin', label: 'GST No.' },
      { key: 'bankDetails', label: 'Bank Detail' },
      { key: 'ifscCode', label: 'IFSC Code' },
      { key: 'bankPinCode', label: 'Bank Pin Code' },
    ];
    
    const sampleData = [
      {
        supplierId: 'SUP-0001',
        name: 'Sample Supplier Pvt Ltd',
        supplierCode: 'SSPL-01',
        phone: '+91 9876543210',
        contactPerson: 'John Doe',
        gstin: '22AAAAA0000A1Z5',
        bankDetails: 'HDFC Bank, A/C 1234567890',
        ifscCode: 'HDFC0001234',
        bankPinCode: '201301',
      },
    ];
    
    const buffer = generateTemplate(headers, sampleData);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=suppliers_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import suppliers from Excel
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { mode = 'both' } = req.body;
    const fileBuffer = req.file.buffer;
    const excelData = parseExcel(fileBuffer);
    
    if (excelData.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < excelData.length; i++) {
      const row = excelData[i];
      const rowNum = i + 2;

      try {
        const supplierData = mapSupplierRow(row);

        if (!supplierData.name) {
          errors.push({ row: rowNum, field: 'name', message: 'Supplier name is required', data: row });
          failed++;
          continue;
        }

        if (!supplierData.supplierId) {
          supplierData.supplierId = await generateNextSupplierId();
        }

        let existingSupplier = null;
        if (supplierData.supplierId) {
          existingSupplier = await Supplier.findOne({ supplierId: supplierData.supplierId });
        }
        if (!existingSupplier && supplierData.supplierCode) {
          existingSupplier = await Supplier.findOne({
            supplierCode: supplierData.supplierCode,
          });
        }
        if (!existingSupplier) {
          existingSupplier = await Supplier.findOne({ name: supplierData.name });
        }

        if (existingSupplier) {
          if (mode === 'create') {
            errors.push({
              row: rowNum,
              field: 'supplierId',
              message: 'Supplier already exists (matching ID, code, or name)',
              data: row,
            });
            failed++;
            continue;
          }
          if (!supplierData.supplierId && existingSupplier.supplierId) {
            delete supplierData.supplierId;
          }
          await Supplier.findByIdAndUpdate(existingSupplier._id, supplierData, {
            runValidators: true,
          });
          updated++;
        } else {
          if (mode === 'update') {
            errors.push({ row: rowNum, field: 'name', message: 'Supplier not found for update', data: row });
            failed++;
            continue;
          }
          const supplier = new Supplier(supplierData);
          await supplier.save();
          imported++;
        }
      } catch (error) {
        errors.push({ row: rowNum, field: 'general', message: error.message, data: row });
        failed++;
      }
    }

    res.json({ success: true, imported, updated, failed, errors: errors.slice(0, 100) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

