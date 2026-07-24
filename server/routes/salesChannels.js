const express = require('express');
const router = express.Router();
const multer = require('multer');
const SalesChannel = require('../models/SalesChannel');
const { currencyForCountry } = require('../currency/constants');
const { paginate } = require('../utils/pagination');
const { parseExcel } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');
const { requirePermission } = require('../middleware/auth');
const {
  normalizeIdList,
  syncChannelWarehouseLinks,
} = require('../services/syncChannelWarehouses');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const WAREHOUSE_POPULATE = { path: 'warehouses', select: 'name code city country isActive' };

function prepareChannelBody(body = {}) {
  const data = { ...body };
  if (data.warehouses !== undefined) {
    data.warehouses = normalizeIdList(data.warehouses);
  }
  return data;
}

async function respondWithChannel(channelDoc) {
  return SalesChannel.findById(channelDoc._id).populate(WAREHOUSE_POPULATE);
}

// GET all sales channels (with pagination)
router.get('/', requirePermission('salesChannels.view'), async (req, res) => {
  try {
    const { isActive, type, search, page, limit } = req.query;
    const query = {};
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (type) {
      query.type = type;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (page || limit) {
      const result = await paginate(SalesChannel, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { createdAt: -1 },
        populate: WAREHOUSE_POPULATE,
      });
      res.json(result);
    } else {
      const salesChannels = await SalesChannel.find(query)
        .populate(WAREHOUSE_POPULATE)
        .sort({ name: 1 });
      res.json(salesChannels);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Excel template (must be before /:id)
router.get('/template', requirePermission('salesChannels.view'), (req, res) => {
  try {
    const headers = [
      { key: 'code', label: 'Code *' },
      { key: 'name', label: 'Name *' },
      { key: 'description', label: 'Description' },
      { key: 'type', label: 'Type' },
      { key: 'country', label: 'Country *' },
      { key: 'defaultCurrency', label: 'Currency' },
      { key: 'commissionRate', label: 'Commission Rate (%)' },
      { key: 'paymentTerms', label: 'Payment Terms' },
      { key: 'isActive', label: 'Is Active' }
    ];
    
    const buffer = generateTemplate(headers);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=sales_channels_template.xlsx');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import sales channels from Excel (must be before /:id)
router.post('/import', requirePermission('salesChannels.create'), upload.single('file'), async (req, res) => {
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
        const country = (row['Country *'] || row['Country'] || '').toString().trim().toUpperCase().slice(0, 2);
        const defaultCurrency = (row['Currency'] || row['Default Currency'] || '').toString().trim().toUpperCase().slice(0, 3);
        const isActiveRaw = row['Is Active'] ?? row['Active (true/false)'] ?? row['Active'];
        const isActiveStr = String(isActiveRaw ?? 'true').trim().toLowerCase();
        const isActive = !['false', '0', 'no', 'n', 'inactive'].includes(isActiveStr);

        const channelData = {
          code: (row['Code *'] || '').toString().toUpperCase().trim(),
          name: row['Name *'] || '',
          description: row['Description'] || '',
          type: row['Type'] || '',
          country,
          defaultCurrency: defaultCurrency || undefined,
          commissionRate: row['Commission Rate (%)'] ? parseFloat(row['Commission Rate (%)']) : undefined,
          paymentTerms: row['Payment Terms'] || '',
          isActive,
        };

        if (!channelData.code || !channelData.name) {
          errors.push({ row: rowNum, field: 'code/name', message: 'Code and Name are required', data: row });
          failed++;
          continue;
        }
        if (!channelData.country || channelData.country.length !== 2) {
          errors.push({ row: rowNum, field: 'country', message: 'Country is required (2-letter code, e.g. IN, AE)', data: row });
          failed++;
          continue;
        }

        const existingChannel = await SalesChannel.findOne({ code: channelData.code });

        if (existingChannel) {
          if (mode === 'create') {
            errors.push({ row: rowNum, field: 'code', message: 'Sales channel code already exists', data: row });
            failed++;
            continue;
          }
          await SalesChannel.findByIdAndUpdate(existingChannel._id, channelData, { runValidators: true });
          updated++;
        } else {
          if (mode === 'update') {
            errors.push({ row: rowNum, field: 'code', message: 'Sales channel not found for update', data: row });
            failed++;
            continue;
          }
          const channel = new SalesChannel(channelData);
          await channel.save();
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

// GET single sales channel
router.get('/:id', requirePermission('salesChannels.view'), async (req, res) => {
  try {
    const salesChannel = await SalesChannel.findById(req.params.id).populate(WAREHOUSE_POPULATE);
    if (!salesChannel) {
      return res.status(404).json({ error: 'Sales channel not found' });
    }
    res.json(salesChannel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create sales channel
router.post('/', requirePermission('salesChannels.create'), async (req, res) => {
  try {
    const body = prepareChannelBody(req.body);
    const salesChannel = new SalesChannel(body);
    await salesChannel.save();
    await syncChannelWarehouseLinks(salesChannel, salesChannel.warehouses);
    res.status(201).json(await respondWithChannel(salesChannel));
  } catch (error) {
    console.error('Error creating sales channel:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      body: req.body
    });
    if (error.code === 11000) {
      const code = String(req.body?.code || '').trim().toUpperCase();
      if (code) {
        const existing = await SalesChannel.findOne({ code });
        if (existing) {
          // If channel already exists but is inactive (common for Amazon UAE), activate it.
          const update = prepareChannelBody({
            ...req.body,
            isActive: true,
          });

          if (update.country) {
            update.country = String(update.country).trim().toUpperCase().slice(0, 2);
          }
          if (update.defaultCurrency) {
            update.defaultCurrency = String(update.defaultCurrency).trim().toUpperCase().slice(0, 3);
          }
          if (!update.defaultCurrency && update.country) {
            update.defaultCurrency = currencyForCountry(update.country);
          }

          const updated = await SalesChannel.findByIdAndUpdate(existing._id, update, {
            new: true,
            runValidators: true,
          });
          if (update.warehouses !== undefined) {
            await syncChannelWarehouseLinks(updated, update.warehouses);
          }
          return res.status(201).json(await respondWithChannel(updated));
        }
      }

      return res.status(400).json({ error: 'Sales channel code already exists' });
    }

    return res.status(400).json({ error: error.message });
  }
});

// PUT update sales channel
router.put('/:id', requirePermission('salesChannels.update'), async (req, res) => {
  try {
    const body = prepareChannelBody(req.body);
    const salesChannel = await SalesChannel.findByIdAndUpdate(
      req.params.id,
      body,
      { new: true, runValidators: true }
    );
    if (!salesChannel) {
      return res.status(404).json({ error: 'Sales channel not found' });
    }
    if (body.warehouses !== undefined) {
      await syncChannelWarehouseLinks(salesChannel, body.warehouses);
    }
    res.json(await respondWithChannel(salesChannel));
  } catch (error) {
    console.error('Error updating sales channel:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      salesChannelId: req.params.id,
      body: req.body
    });
    if (error.code === 11000) {
      res.status(400).json({ error: 'Sales channel code already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// DELETE sales channel (soft delete)
router.delete('/:id', requirePermission('salesChannels.delete'), async (req, res) => {
  try {
    const salesChannel = await SalesChannel.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!salesChannel) {
      return res.status(404).json({ error: 'Sales channel not found' });
    }
    res.json({ message: 'Sales channel deactivated successfully', salesChannel });
  } catch (error) {
    console.error('Error deleting sales channel:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      salesChannelId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

