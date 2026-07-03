const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const { paginate } = require('../../utils/pagination');
const { startOfDay, endOfDay } = require('../utils/employeeId');

function parseDateRange(date, month, year) {
  if (date) {
    const d = startOfDay(date);
    return { $gte: d, $lte: endOfDay(date) };
  }
  if (month && year) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);
    return { $gte: start, $lte: end };
  }
  const today = startOfDay(new Date());
  return { $gte: today, $lte: endOfDay(new Date()) };
}

router.get('/summary', async (req, res) => {
  try {
    const dateRange = parseDateRange(req.query.date, req.query.month, req.query.year);
    const [present, absent, late, leave] = await Promise.all([
      Attendance.countDocuments({ date: dateRange, status: 'Present' }),
      Attendance.countDocuments({ date: dateRange, status: 'Absent' }),
      Attendance.countDocuments({ date: dateRange, status: 'Half Day' }),
      Attendance.countDocuments({ date: dateRange, status: 'Leave' }),
    ]);
    res.json({ present, absent, late, leave });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/trend', async (req, res) => {
  try {
    const { month, year, employee } = req.query;
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const daysInMonth = new Date(y, m, 0).getDate();

    const trend = [];
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dateObj = new Date(y, m - 1, d);
      const dayStart = startOfDay(dateObj);
      const dayEnd = endOfDay(dateObj);
      const match = { date: { $gte: dayStart, $lte: dayEnd } };
      if (employee) match.employee = employee;

      const [present, absent, leave] = await Promise.all([
        Attendance.countDocuments({ ...match, status: 'Present' }),
        Attendance.countDocuments({ ...match, status: 'Absent' }),
        Attendance.countDocuments({ ...match, status: 'Leave' }),
      ]);

      trend.push({
        date: dayStart.toISOString().slice(0, 10),
        label: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        present,
        absent,
        leave,
      });
    }

    res.json({ trend });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { search, employee, status, date, month, year, page, limit, sortBy, sortOrder } = req.query;
    const query = { date: parseDateRange(date, month, year) };
    if (employee) query.employee = employee;
    if (status) query.status = status;

    const sortField = sortBy === 'date' ? 'date' : 'createdAt';
    const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };

    const populate = { path: 'employee', select: 'employeeId firstName lastName department photo' };

    if (page || limit) {
      const result = await paginate(Attendance, query, { page, limit, sort, populate });
      if (search?.trim()) {
        const term = search.trim().toLowerCase();
        result.data = result.data.filter((row) => {
          const emp = row.employee;
          if (!emp) return false;
          const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
          return name.includes(term) || (emp.employeeId || '').toLowerCase().includes(term);
        });
      }
      return res.json(result);
    }

    let records = await Attendance.find(query).populate(populate).sort(sort);
    if (search?.trim()) {
      const term = search.trim().toLowerCase();
      records = records.filter((row) => {
        const emp = row.employee;
        if (!emp) return false;
        const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
        return name.includes(term) || (emp.employeeId || '').toLowerCase().includes(term);
      });
    }
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const record = await Attendance.findById(req.params.id).populate(
      'employee',
      'employeeId firstName lastName department'
    );
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = { ...req.body, date: startOfDay(req.body.date || new Date()) };
    const record = new Attendance(payload);
    await record.save();
    await record.populate('employee', 'employeeId firstName lastName department photo');
    res.status(201).json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.date) payload.date = startOfDay(payload.date);
    const record = await Attendance.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    }).populate('employee', 'employeeId firstName lastName department photo');
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });
    res.json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const record = await Attendance.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });
    res.json({ message: 'Attendance record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
