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

const CHANNEL_POPULATE = 'name code type country defaultCurrency';

const SALES_LOCATION_HEADERS = [
  { key: 'channelCode', label: 'Sales Channel Code * (comma-separated)' },
  { key: 'warehouseCode', label: 'Warehouse Location Code *' },
  { key: 'code', label: 'Code *' },
  { key: 'name', label: 'Name *' },
  { key: 'country', label: 'Country *' },
  { key: 'currency', label: 'Currency' },
  { key: 'address', label: 'Address' },
  { key: 'contactPerson', label: 'Contact Person' },
  { key: 'phone', label: 'Phone' },
  { key: 'email', label: 'Email' },
  { key: 'isActive', label: 'Active (true/false)' }
];

/** Accept salesChannels[] or legacy salesChannel → normalized body */
function normalizeSalesLocationBody(body = {}) {
  const data = { ...body };
  delete data.salesChannel;

  let channels = data.salesChannels;
  if (!Array.isArray(channels) || channels.length === 0) {
    if (body.salesChannel) {
      channels = [body.salesChannel];
    } else {
      channels = [];
    }
  }
  data.salesChannels = channels.filter(Boolean).map((id) => id);
  return data;
}

// GET all sales locations (with pagination)
router.get('/', async (req, res) => {
  try {
    const { salesChannel, location, isActive, search, page, limit } = req.query;
    const query = {};

    if (salesChannel) {
      query.salesChannels = salesChannel;
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
          { path: 'salesChannels', select: CHANNEL_POPULATE },
          { path: 'location', select: 'name code city' }
        ]
      });
      res.json(result);
    } else {
      const salesLocations = await SalesLocation.find(query)
        .populate('salesChannels', CHANNEL_POPULATE)
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
    const salesLocations = await SalesLocation.find({ salesChannels: req.params.channelId })
      .populate('salesChannels', CHANNEL_POPULATE)
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
        channelCode: 'WEB, RETAIL',
        warehouseCode: 'WH-01',
        code: 'WEB-01',
        name: 'Web Store - Main Warehouse',
        country: 'IN',
        currency: 'INR',
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
        const channelCodeRaw = (
          row['Sales Channel Code * (comma-separated)'] ||
          row['Sales Channel Code *'] ||
          row['Sales Channel Code'] ||
          ''
        ).toString().trim();
        const warehouseCode = (row['Warehouse Location Code *'] || '').toString().trim();
        const code = (row['Code *'] || '').toString().trim();
        const name = (row['Name *'] || '').toString().trim();

        if (!warehouseCode) throw new Error('Warehouse Location Code is required');
        if (!code) throw new Error('Code is required');
        if (!name) throw new Error('Name is required');

        const warehouse = await Location.findOne({ code: warehouseCode.toUpperCase() });
        if (!warehouse) throw new Error(`Warehouse Location code '${warehouseCode}' not found`);

        const existing = await SalesLocation.findOne({ code: code.toUpperCase() });

        let channelIds = [];
        if (channelCodeRaw) {
          const channelCodes = channelCodeRaw
            .split(/[,;|]/)
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean);
          if (channelCodes.length === 0) {
            throw new Error('At least one Sales Channel Code is required');
          }
          for (const channelCode of channelCodes) {
            const channel = await SalesChannel.findOne({ code: channelCode });
            if (!channel) throw new Error(`Sales Channel code '${channelCode}' not found`);
            channelIds.push(channel._id);
          }
        } else if (existing?.salesChannels?.length) {
          channelIds = existing.salesChannels;
        } else {
          throw new Error('Sales Channel Code is required');
        }

        const firstChannel = channelIds[0]
          ? await SalesChannel.findById(channelIds[0])
          : null;

        const activeRaw = (row['Active (true/false)'] || '').toString().trim().toLowerCase();
        const isActive = activeRaw === '' ? true : !['false', 'no', '0', 'inactive'].includes(activeRaw);

        let country = (row['Country *'] || row['Country'] || '').toString().trim().toUpperCase().slice(0, 2);
        let currency = (row['Currency'] || '').toString().trim().toUpperCase().slice(0, 3);
        if (!country && firstChannel?.country) {
          country = String(firstChannel.country).trim().toUpperCase().slice(0, 2);
        }
        if (!currency && firstChannel?.defaultCurrency) {
          currency = String(firstChannel.defaultCurrency).trim().toUpperCase().slice(0, 3);
        }
        if (!country || country.length !== 2) {
          throw new Error('Country is required (2-letter code, e.g. IN, AE)');
        }

        const data = {
          salesChannels: channelIds,
          location: warehouse._id,
          code: code.toUpperCase(),
          name,
          country,
          currency: currency || undefined,
          address: row['Address'] || '',
          contactPerson: row['Contact Person'] || '',
          phone: row['Phone'] || '',
          email: row['Email'] || '',
          isActive
        };

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
      .populate('salesChannels', CHANNEL_POPULATE)
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
    const data = normalizeSalesLocationBody(req.body);
    const salesLocation = new SalesLocation(data);
    await salesLocation.save();

    const populated = await SalesLocation.findById(salesLocation._id)
      .populate('salesChannels', CHANNEL_POPULATE)
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
      res.status(400).json({ error: 'Sales location code already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update sales location
router.put('/:id', async (req, res) => {
  try {
    const data = normalizeSalesLocationBody(req.body);
    const salesLocation = await SalesLocation.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true, runValidators: true }
    )
      .populate('salesChannels', CHANNEL_POPULATE)
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
      res.status(400).json({ error: 'Sales location code already exists' });
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
