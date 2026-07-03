const express = require('express');
const router = express.Router();
const multer = require('multer');
const SalesLocation = require('../models/SalesLocation');
const { paginate } = require('../utils/pagination');
const { parseExcel } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const SALES_LOCATION_HEADERS = [
  { key: 'channelCode', label: 'Sales Channel Code *' },
  { key: 'warehouseCode', label: 'Warehouse Location Code *' },
  { key: 'code', label: 'Code *' },
  { key: 'name', label: 'Name *' },
  { key: 'address', label: 'Address' },
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'isActive', label: 'Active (true/false)' }
];

// GET all sales locations (with pagination)
router.get('/', async (req, res) => {
  try {
    const { salesChannel, location, isActive, search, page, limit } = req.query;
    const query = {};
    
    if (salesChannel) {
      query.salesChannel = salesChannel;
    }
    
    if (location) {
      query.location = location;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (page || limit) {
      const result = await paginate(SalesLocation, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: [
          { path: 'salesChannel', select: 'name code type' },
          { path: 'location', select: 'name code city' }
        ]
      });
      res.json(result);
    } else {
      const salesLocations = await SalesLocation.find(query)
        .populate('salesChannel', 'name code type')
        .populate('location', 'name code city country')
        .sort({ createdAt: -1 });
      res.json(salesLocations);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET sales locations by channel
router.get('/channel/:channelId', async (req, res) => {
  try {
    const salesLocations = await SalesLocation.find({ salesChannel: req.params.channelId })
      .populate('salesChannel', 'name code')
      .populate('location', 'name code city country')
      .sort({ name: 1 });
    res.json(salesLocations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET sales location import template
router.get('/template', (req, res) => {
  try {
    const sampleData = [
      {
        channelCode: 'WEB',
        warehouseCode: 'WH-01',
        code: 'WEB-01',
        name: 'Web Store - Main Warehouse',
        address: '123 Main St',
        contactPerson: 'Jane Doe',
        phone: '9999999999',
        email: 'web@example.com',
        isActive: 'true'
      }
    ];
    const buffer = generateTemplate(SALES_LOCATION_HEADERS, sampleData);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_locations_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import sales locations from Excel
router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const SalesChannel = require('../models/SalesChannel');
    const Location = require('../models/Location');
    const mode = req.body.mode || 'both';

    const rows = parseExcel(req.file.buffer);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'Excel file is empty' });
    }

    let imported = 0;
    let updated = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;
      try {
        const channelCode = (row['Sales Channel Code *'] || '').toString().trim();
        const warehouseCode = (row['Warehouse Location Code *'] || '').toString().trim();
        const code = (row['Code *'] || '').toString().trim();
        const name = (row['Name *'] || '').toString().trim();

        if (!channelCode) throw new Error('Sales Channel Code is required');
        if (!warehouseCode) throw new Error('Warehouse Location Code is required');
        if (!code) throw new Error('Code is required');
        if (!name) throw new Error('Name is required');

        const channel = await SalesChannel.findOne({ code: channelCode });
        if (!channel) throw new Error(`Sales Channel code '${channelCode}' not found`);
        const warehouse = await Location.findOne({ code: warehouseCode.toUpperCase() });
        if (!warehouse) throw new Error(`Warehouse Location code '${warehouseCode}' not found`);

        const activeRaw = (row['Active (true/false)'] || '').toString().trim().toLowerCase();
        const isActive = activeRaw === '' ? true : !['false', 'no', '0', 'inactive'].includes(activeRaw);

        const data = {
          salesChannel: channel._id,
          location: warehouse._id,
          code: code.toUpperCase(),
          name,
          address: row['Address'] || '',
          contactPerson: row['Contact Person'] || '',
          phone: row['Phone'] || '',
          email: row['Email'] || '',
          isActive
        };

        const existing = await SalesLocation.findOne({ code: data.code });
        if (existing) {
          if (mode === 'create') {
            throw new Error(`Sales location code '${data.code}' already exists`);
          }
          await SalesLocation.findByIdAndUpdate(existing._id, data, { runValidators: true });
          updated++;
        } else {
          if (mode === 'update') {
            throw new Error(`Sales location code '${data.code}' does not exist`);
          }
          await new SalesLocation(data).save();
          imported++;
        }
      } catch (err) {
        failed++;
        errors.push({ row: rowNum, field: row['Code *'] || '', message: err.message });
      }
    }

    res.json({ imported, updated, failed, errors });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single sales location
router.get('/:id', async (req, res) => {
  if (req.params.id === 'template' || req.params.id === 'import') {
    return res.status(404).json({ error: 'Route not found' });
  }
  try {
    const salesLocation = await SalesLocation.findById(req.params.id)
      .populate('salesChannel', 'name code type')
      .populate('location', 'name code city address');
    if (!salesLocation) {
      return res.status(404).json({ error: 'Sales location not found' });
    }
    res.json(salesLocation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create sales location
router.post('/', async (req, res) => {
  try {
    const salesLocation = new SalesLocation(req.body);
    await salesLocation.save();
    
    const populated = await SalesLocation.findById(salesLocation._id)
      .populate('salesChannel', 'name code')
      .populate('location', 'name code');
    
    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating sales location:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    if (error.code === 11000) {
      if (error.keyPattern.code) {
        res.status(400).json({ error: 'Sales location code already exists' });
      } else {
        res.status(400).json({ error: 'This sales channel and location combination already exists' });
      }
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update sales location
router.put('/:id', async (req, res) => {
  try {
    const salesLocation = await SalesLocation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('salesChannel', 'name code')
      .populate('location', 'name code');
    
    if (!salesLocation) {
      return res.status(404).json({ error: 'Sales location not found' });
    }
    res.json(salesLocation);
  } catch (error) {
    console.error('Error updating sales location:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      salesLocationId: req.params.id,
      body: req.body
    });
    if (error.code === 11000) {
      if (error.keyPattern.code) {
        res.status(400).json({ error: 'Sales location code already exists' });
      } else {
        res.status(400).json({ error: 'This sales channel and location combination already exists' });
      }
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// DELETE sales location (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const salesLocation = await SalesLocation.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!salesLocation) {
      return res.status(404).json({ error: 'Sales location not found' });
    }
    res.json({ message: 'Sales location deactivated successfully', salesLocation });
  } catch (error) {
    console.error('Error deleting sales location:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      salesLocationId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

