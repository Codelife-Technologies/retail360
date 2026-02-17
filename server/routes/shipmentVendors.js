const express = require('express');
const router = express.Router();
const multer = require('multer');
const ShipmentVendor = require('../models/ShipmentVendor');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { parseExcel } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');
const { requirePermission } = require('../middleware/auth');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// GET all vendors (with pagination)
router.get('/', requirePermission('shipmentVendors.view'), async (req, res) => {
  try {
    const { isActive, serviceType, search, page, limit } = req.query;
    const query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (serviceType) {
      query.serviceTypes = { $in: [serviceType] };
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (page || limit) {
      const result = await paginate(ShipmentVendor, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 }
      });
      res.json(result);
    } else {
      const vendors = await ShipmentVendor.find(query).sort({ createdAt: -1 });
      res.json(vendors);
    }
  } catch (error) {
    logger.backend.error('Error fetching shipment vendors', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET single vendor
router.get('/:id', requirePermission('shipmentVendors.view'), async (req, res) => {
  try {
    const vendor = await ShipmentVendor.findById(req.params.id);
    if (!vendor) {
      return res.status(404).json({ error: 'Shipment vendor not found' });
    }
    res.json(vendor);
  } catch (error) {
    logger.backend.error('Error fetching shipment vendor', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST create vendor
router.post('/', requirePermission('shipmentVendors.create'), async (req, res) => {
  try {
    const vendor = new ShipmentVendor(req.body);
    await vendor.save();
    res.status(201).json(vendor);
  } catch (error) {
    logger.backend.error('Error creating shipment vendor', { error: error.message, stack: error.stack });
    res.status(400).json({ error: error.message });
  }
});

// PUT update vendor
router.put('/:id', requirePermission('shipmentVendors.update'), async (req, res) => {
  try {
    const vendor = await ShipmentVendor.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!vendor) {
      return res.status(404).json({ error: 'Shipment vendor not found' });
    }
    res.json(vendor);
  } catch (error) {
    logger.backend.error('Error updating shipment vendor', { error: error.message, stack: error.stack });
    res.status(400).json({ error: error.message });
  }
});

// DELETE vendor (soft delete)
router.delete('/:id', requirePermission('shipmentVendors.delete'), async (req, res) => {
  try {
    const vendor = await ShipmentVendor.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!vendor) {
      return res.status(404).json({ error: 'Shipment vendor not found' });
    }
    res.json({ message: 'Shipment vendor deactivated successfully' });
  } catch (error) {
    logger.backend.error('Error deleting shipment vendor', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET Excel template
router.get('/template', requirePermission('shipmentVendors.view'), (req, res) => {
  try {
    const headers = [
      { key: 'code', label: 'Code *' },
      { key: 'name', label: 'Name *' },
      { key: 'contactPerson', label: 'Contact Person' },
      { key: 'email', label: 'Email' },
      { key: 'phone', label: 'Phone' },
      { key: 'address', label: 'Address' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'country', label: 'Country' },
      { key: 'pincode', label: 'Pincode' }
    ];
    
    const buffer = generateTemplate(headers);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=shipment_vendors_template.xlsx');
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error generating shipment vendor template', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST import shipment vendors from Excel
router.post('/import', requirePermission('shipmentVendors.create'), upload.single('file'), async (req, res) => {
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
        const vendorData = {
          code: (row['Code *'] || '').toString().toUpperCase().trim(),
          name: row['Name *'] || '',
          contactPerson: row['Contact Person'] || '',
          email: (row['Email'] || '').toLowerCase().trim(),
          phone: row['Phone'] || '',
          address: row['Address'] || '',
          city: row['City'] || '',
          state: row['State'] || '',
          country: row['Country'] || 'India',
          pincode: row['Pincode'] || ''
        };

        if (!vendorData.code || !vendorData.name) {
          errors.push({ row: rowNum, field: 'code/name', message: 'Code and Name are required', data: row });
          failed++;
          continue;
        }

        const existingVendor = await ShipmentVendor.findOne({ code: vendorData.code });

        if (existingVendor) {
          if (mode === 'create') {
            errors.push({ row: rowNum, field: 'code', message: 'Vendor code already exists', data: row });
            failed++;
            continue;
          }
          await ShipmentVendor.findByIdAndUpdate(existingVendor._id, vendorData, { runValidators: true });
          updated++;
        } else {
          if (mode === 'update') {
            errors.push({ row: rowNum, field: 'code', message: 'Vendor not found for update', data: row });
            failed++;
            continue;
          }
          const vendor = new ShipmentVendor(vendorData);
          await vendor.save();
          imported++;
        }
      } catch (error) {
        errors.push({ row: rowNum, field: 'general', message: error.message, data: row });
        failed++;
      }
    }

    res.json({ success: true, imported, updated, failed, errors: errors.slice(0, 100) });
  } catch (error) {
    logger.backend.error('Error importing shipment vendors', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

