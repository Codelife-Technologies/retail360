const express = require('express');
const router = express.Router();
const multer = require('multer');
const Location = require('../models/Location');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { parseExcel } = require('../utils/excelParser');
const { generateTemplate } = require('../utils/excelGenerator');
const { requirePermission } = require('../middleware/auth');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

async function setHomeBranch(locationId) {
  await Location.updateMany({ _id: { $ne: locationId } }, { $set: { isHomeBranch: false } });
  return Location.findByIdAndUpdate(
    locationId,
    { isHomeBranch: true },
    { new: true, runValidators: true }
  );
}

// GET home branch location
router.get('/home-branch', async (req, res) => {
  try {
    const location = await Location.findOne({ isHomeBranch: true });
    if (!location) {
      return res.status(404).json({ error: 'Home branch not set' });
    }
    res.json(location);
  } catch (error) {
    logger.backend.error('Error fetching home branch', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET all locations (with pagination)
router.get('/', requirePermission('locations.view'), async (req, res) => {
  try {
    const { search, city, isActive, page, limit } = req.query;
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
        { city: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (city) {
      query.city = city;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (page || limit) {
      const result = await paginate(Location, query, {
        page: page || 1,
        limit: limit || 25,
        sort: { isHomeBranch: -1, createdAt: -1 }
      });
      res.json(result);
    } else {
      const locations = await Location.find(query).sort({ isHomeBranch: -1, createdAt: -1 });
      res.json(locations);
    }
  } catch (error) {
    logger.backend.error('Error fetching locations', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET Excel template (must be before /:id)
router.get('/template', requirePermission('locations.view'), (req, res) => {
  try {
    const headers = [
      { key: 'code', label: 'Code *' },
      { key: 'name', label: 'Name *' },
      { key: 'address', label: 'Address' },
      { key: 'city', label: 'City' },
      { key: 'state', label: 'State' },
      { key: 'country', label: 'Country' },
      { key: 'pincode', label: 'Pincode' },
      { key: 'contactPerson', label: 'Contact Person' },
      { key: 'phone', label: 'Phone' },
      { key: 'email', label: 'Email' }
    ];
    
    const buffer = generateTemplate(headers);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=locations_template.xlsx');
    res.send(buffer);
  } catch (error) {
    logger.backend.error('Error generating location template', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST import locations from Excel (must be before /:id)
router.post('/import', requirePermission('locations.create'), upload.single('file'), async (req, res) => {
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
        const locationData = {
          code: (row['Code *'] || '').toString().toUpperCase().trim(),
          name: row['Name *'] || '',
          address: row['Address'] || '',
          city: row['City'] || '',
          state: row['State'] || '',
          country: row['Country'] || 'India',
          pincode: row['Pincode'] || '',
          contactPerson: row['Contact Person'] || '',
          phone: row['Phone'] || '',
          email: (row['Email'] || '').toLowerCase().trim()
        };

        if (!locationData.code || !locationData.name) {
          errors.push({ row: rowNum, field: 'code/name', message: 'Code and Name are required', data: row });
          failed++;
          continue;
        }

        const existingLocation = await Location.findOne({ code: locationData.code });

        if (existingLocation) {
          if (mode === 'create') {
            errors.push({ row: rowNum, field: 'code', message: 'Location code already exists', data: row });
            failed++;
            continue;
          }
          await Location.findByIdAndUpdate(existingLocation._id, locationData, { runValidators: true });
          updated++;
        } else {
          if (mode === 'update') {
            errors.push({ row: rowNum, field: 'code', message: 'Location not found for update', data: row });
            failed++;
            continue;
          }
          const location = new Location(locationData);
          await location.save();
          imported++;
        }
      } catch (error) {
        errors.push({ row: rowNum, field: 'general', message: error.message, data: row });
        failed++;
      }
    }

    res.json({ success: true, imported, updated, failed, errors: errors.slice(0, 100) });
  } catch (error) {
    logger.backend.error('Error importing locations', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST set location as home branch
router.post('/:id/home-branch', async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    const updated = await setHomeBranch(location._id);
    res.json(updated);
  } catch (error) {
    logger.backend.error('Error setting home branch', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET single location
router.get('/:id', requirePermission('locations.view'), async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json(location);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create location
router.post('/', requirePermission('locations.create'), async (req, res) => {
  try {
    logger.backend.info('Creating location', { body: req.body });
    const location = new Location(req.body);
    await location.save();
    if (req.body.isHomeBranch) {
      await setHomeBranch(location._id);
    }
    logger.backend.info('Location created successfully', { locationId: location._id });
    res.status(201).json(await Location.findById(location._id));
  } catch (error) {
    logger.backend.error('Error creating location', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      code: error.code
    });
    if (error.code === 11000) {
      res.status(400).json({ error: 'Location code already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update location
router.put('/:id', requirePermission('locations.update'), async (req, res) => {
  try {
    const location = await Location.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    if (req.body.isHomeBranch) {
      await setHomeBranch(location._id);
    }
    const refreshed = await Location.findById(location._id);
    res.json(refreshed);
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({ error: 'Location code already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// DELETE location
router.delete('/:id', requirePermission('locations.delete'), async (req, res) => {
  try {
    const location = await Location.findByIdAndDelete(req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json({ message: 'Location deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

