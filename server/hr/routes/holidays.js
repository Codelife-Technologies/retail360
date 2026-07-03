const express = require('express');
const router = express.Router();
const Holiday = require('../models/Holiday');
const { dayName, startOfDay, endOfDay } = require('../utils/employeeId');
const {
  getStandardHolidaysForYear,
  getSupportedHolidayYears,
} = require('../utils/indianStandardHolidays');
const { dedupeHolidaysByDate } = require('../utils/holidayUtils');

async function findHolidayOnDate(date, excludeId) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);
  const query = { date: { $gte: dayStart, $lte: dayEnd }, status: 'Active' };
  if (excludeId) query._id = { $ne: excludeId };
  return Holiday.findOne(query);
}

async function removeDuplicateHolidaysForYear(year) {
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  const all = await Holiday.find({ date: { $gte: yearStart, $lte: yearEnd } });
  const keep = dedupeHolidaysByDate(all);
  const keepIds = new Set(keep.map((h) => String(h._id)));
  const removeIds = all.filter((h) => !keepIds.has(String(h._id))).map((h) => h._id);
  if (removeIds.length) await Holiday.deleteMany({ _id: { $in: removeIds } });
  return removeIds.length;
}

async function seedStandardHolidays(req, res) {
  try {
    const year = parseInt(req.body.year || req.query.year, 10) || new Date().getFullYear();
    const holidays = getStandardHolidaysForYear(year);

    if (holidays.length === 0) {
      return res.status(400).json({
        error: `Holiday list not available for ${year}. Supported years: ${getSupportedHolidayYears().join(', ')}`,
      });
    }

    let inserted = 0;
    let skipped = 0;

    for (const item of holidays) {
      const date = startOfDay(new Date(year, item.month - 1, item.day));
      const dayEnd = endOfDay(date);
      const onDate = await Holiday.findOne({ date: { $gte: date, $lte: dayEnd } });

      if (onDate) {
        skipped += 1;
        continue;
      }

      await Holiday.create({
        name: item.name,
        date,
        day: dayName(date),
        type: item.type || 'National',
        status: 'Active',
      });
      inserted += 1;
    }

    const removed = await removeDuplicateHolidaysForYear(year);

    res.json({
      year,
      inserted,
      skipped,
      removed,
      total: holidays.length,
      message: `Added ${inserted} holidays for ${year} (${skipped} skipped, ${removed} duplicate-day entries removed).`,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

router.get('/standard-years', (_req, res) => {
  res.json({ years: getSupportedHolidayYears() });
});

router.post('/seed-standard', seedStandardHolidays);
router.get('/restricted-years', (_req, res) => {
  res.json({ years: getSupportedHolidayYears() });
});
router.post('/seed-restricted', seedStandardHolidays);

router.get('/calendar', async (req, res) => {
  try {
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);

    const holidays = dedupeHolidaysByDate(
      await Holiday.find({
        date: { $gte: start, $lte: end },
        status: 'Active',
      }).sort({ date: 1 })
    );

    res.json(holidays);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { search, type, status, year, page, limit, sortBy, sortOrder } = req.query;
    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (year) {
      const y = parseInt(year, 10);
      query.date = { $gte: new Date(y, 0, 1), $lte: new Date(y, 11, 31, 23, 59, 59, 999) };
    }
    if (search?.trim()) {
      query.name = { $regex: search.trim(), $options: 'i' };
    }

    const sortField = ['date', 'name', 'createdAt'].includes(sortBy) ? sortBy : 'date';
    const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };

    const allHolidays = dedupeHolidaysByDate(await Holiday.find(query).sort(sort));

    if (page || limit) {
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.max(parseInt(limit, 10) || 15, 1);
      const start = (pageNum - 1) * limitNum;
      return res.json({
        data: allHolidays.slice(start, start + limitNum),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: allHolidays.length,
          totalPages: Math.max(Math.ceil(allHolidays.length / limitNum), 1),
        },
      });
    }

    res.json(allHolidays);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const holiday = await Holiday.findById(req.params.id);
    if (!holiday) return res.status(404).json({ error: 'Holiday not found' });
    res.json(holiday);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = {
      ...req.body,
      date: startOfDay(req.body.date),
      day: req.body.day || dayName(req.body.date),
    };
    const conflict = await findHolidayOnDate(payload.date);
    if (conflict) {
      return res.status(400).json({ error: 'A holiday already exists on this date' });
    }
    const holiday = new Holiday(payload);
    await holiday.save();
    res.status(201).json(holiday);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.date) {
      payload.date = startOfDay(payload.date);
      payload.day = payload.day || dayName(payload.date);
      const conflict = await findHolidayOnDate(payload.date, req.params.id);
      if (conflict) {
        return res.status(400).json({ error: 'A holiday already exists on this date' });
      }
    }
    const holiday = await Holiday.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!holiday) return res.status(404).json({ error: 'Holiday not found' });
    res.json(holiday);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const holiday = await Holiday.findByIdAndDelete(req.params.id);
    if (!holiday) return res.status(404).json({ error: 'Holiday not found' });
    res.json({ message: 'Holiday deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
