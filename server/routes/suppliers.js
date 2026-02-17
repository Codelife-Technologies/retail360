const express = require('express');
const router = express.Router();
const multer = require('multer');
const Supplier = require('../models/Supplier');
const { paginate } = require('../utils/pagination');
const { parseExcel, validateExcelData } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');
const { requirePermission } = require('../middleware/auth');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// GET all suppliers (with pagination)
router.get('/', requirePermission('suppliers.view'), async (req, res) => {
  try {
    const { search, page, limit } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (page || limit) {
      const result = await paginate(Supplier, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 }
      });
      res.json(result);
    } else {
      const suppliers = await Supplier.find(query).sort({ createdAt: -1 });
      res.json(suppliers);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single supplier
router.get('/:id', requirePermission('suppliers.view'), async (req, res) => {
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
router.post('/', requirePermission('suppliers.create'), async (req, res) => {
  try {
    const supplier = new Supplier(req.body);
    await supplier.save();
    res.status(201).json(supplier);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update supplier
router.put('/:id', requirePermission('suppliers.update'), async (req, res) => {
  try {
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }
    res.json(supplier);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE supplier
router.delete('/:id', requirePermission('suppliers.delete'), async (req, res) => {
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
router.get('/template', requirePermission('suppliers.view'), (req, res) => {
  try {
    const headers = [
      { key: 'name', label: 'Name *' },
      { key: 'contactPerson', label: 'Contact Person' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'address', label: 'Address' }
    ];
    
    const buffer = generateTemplate(headers);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=suppliers_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import suppliers from Excel
router.post('/import', requirePermission('suppliers.create'), upload.single('file'), async (req, res) => {
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
        const supplierData = {
          name: row['Name *'] || '',
          contactPerson: row['Contact Person'] || '',
          email: row['Email'] || '',
          phone: row['Phone'] || '',
          address: row['Address'] || ''
        };

        if (!supplierData.name) {
          errors.push({ row: rowNum, field: 'name', message: 'Name is required', data: row });
          failed++;
          continue;
        }

        const existingSupplier = await Supplier.findOne({ name: supplierData.name });

        if (existingSupplier) {
          if (mode === 'create') {
            errors.push({ row: rowNum, field: 'name', message: 'Supplier already exists', data: row });
            failed++;
            continue;
          }
          await Supplier.findByIdAndUpdate(existingSupplier._id, supplierData, { runValidators: true });
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

