const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const { paginate } = require('../../utils/pagination');
const { startOfDay, endOfDay } = require('../utils/employeeId');
const {
  resolveAttendanceScope,
  applyEmployeeScope,
  recordMatchesScope,
  getEmployeeAttendanceTimes,
  getAttendanceTimesForUser,
  ensureUserAttendanceSession,
} = require('../utils/attendanceAccess');
const { calcWorkingHoursFromTimes } = require('../../utils/attendanceSession');

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

router.get('/context', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    res.json({
      canManageAll: scope.canManageAll,
      linkedEmployeeId: scope.employeeId,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const dateRange = parseDateRange(req.query.date, req.query.month, req.query.year);
    const match = { date: dateRange };
    applyEmployeeScope(match, scope, req.query.employee);

    if (!scope.canManageAll && !scope.employeeId) {
      return res.json({ present: 0, absent: 0, late: 0, leave: 0 });
    }

    const [present, absent, late, leave] = await Promise.all([
      Attendance.countDocuments({ ...match, status: 'Present' }),
      Attendance.countDocuments({ ...match, status: 'Absent' }),
      Attendance.countDocuments({ ...match, status: 'Half Day' }),
      Attendance.countDocuments({ ...match, status: 'Leave' }),
    ]);
    res.json({ present, absent, late, leave });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/trend', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const { month, year } = req.query;
    const m = parseInt(month, 10) || new Date().getMonth() + 1;
    const y = parseInt(year, 10) || new Date().getFullYear();
    const daysInMonth = new Date(y, m, 0).getDate();

    if (!scope.canManageAll && !scope.employeeId) {
      return res.json({ trend: [] });
    }

    const trend = [];
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dateObj = new Date(y, m - 1, d);
      const dayStart = startOfDay(dateObj);
      const dayEnd = endOfDay(dateObj);
      const match = { date: { $gte: dayStart, $lte: dayEnd } };
      applyEmployeeScope(match, scope, req.query.employee);

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
    const scope = await resolveAttendanceScope(req);
    const { search, status, date, month, year, page, limit, sortBy, sortOrder } = req.query;
    const query = { date: parseDateRange(date, month, year) };
    applyEmployeeScope(query, scope, req.query.employee);
    if (status) query.status = status;

    if (!scope.canManageAll && !scope.employeeId) {
      if (page || limit) {
        return res.json({ data: [], page: 1, limit: limit || 25, total: 0, totalPages: 0 });
      }
      return res.json([]);
    }

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

router.get('/mark-defaults', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    let employeeId = req.query.employee;

    if (scope.canManageAll) {
      if (!employeeId) {
        return res.status(400).json({ error: 'Employee is required' });
      }
    } else if (!scope.employeeId) {
      return res.status(403).json({ error: 'Employee profile not linked' });
    } else {
      employeeId = scope.employeeId;
    }

    const today = startOfDay(new Date());
    let times = { checkIn: '', checkOut: '' };

    if (!scope.canManageAll) {
      await ensureUserAttendanceSession(req.user.id, { allowCurrentTime: true });
      times = await getAttendanceTimesForUser(req.user.id, today);
    } else {
      times = await getEmployeeAttendanceTimes(employeeId, today);
    }
    const existing = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: today, $lte: endOfDay(today) },
    }).lean();

    res.json({
      date: today.toISOString().slice(0, 10),
      checkIn: times.checkIn,
      checkOut: times.checkOut,
      workingHours: calcWorkingHoursFromTimes(times.checkIn, times.checkOut),
      alreadyMarked: Boolean(existing),
      existingRecord: existing,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    if (req.params.id === 'context' || req.params.id === 'mark-defaults') {
      return res.status(404).json({ error: 'Route not found' });
    }
    const scope = await resolveAttendanceScope(req);
    const record = await Attendance.findById(req.params.id).populate(
      'employee',
      'employeeId firstName lastName department'
    );
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });
    if (!recordMatchesScope(record.employee?._id || record.employee, scope)) {
      return res.status(403).json({ error: 'You can only view your own attendance records' });
    }
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const EMPLOYEE_SELF_STATUSES = new Set(['Present', 'Work From Home']);

function resolveEmployeeSelfStatus(status, fallback = 'Present') {
  if (EMPLOYEE_SELF_STATUSES.has(status)) {
    return status;
  }
  return fallback;
}

router.post('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const today = startOfDay(new Date());
    const todayEnd = endOfDay(today);

    let employeeId = req.body.employee;
    if (!scope.canManageAll) {
      if (!scope.employeeId) {
        return res.status(403).json({ error: 'Employee profile not linked' });
      }
      employeeId = scope.employeeId;
    } else if (!employeeId) {
      return res.status(400).json({ error: 'Employee is required' });
    }

    let sessionTimes = { checkIn: '', checkOut: '' };
    if (!scope.canManageAll) {
      await ensureUserAttendanceSession(req.user.id, { allowCurrentTime: true });
      sessionTimes = await getAttendanceTimesForUser(req.user.id, today);
    } else {
      sessionTimes = await getEmployeeAttendanceTimes(employeeId, today);
    }

    const checkIn = req.body.checkIn || sessionTimes.checkIn;
    const checkOut = req.body.checkOut || sessionTimes.checkOut;
    const workingHours =
      req.body.workingHours != null && req.body.workingHours !== ''
        ? req.body.workingHours
        : calcWorkingHoursFromTimes(checkIn, checkOut);

    if (!scope.canManageAll && !checkIn) {
      return res.status(400).json({
        error: 'No login recorded today. Log in to the app first, then mark attendance.',
      });
    }

    const existing = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: today, $lte: todayEnd },
    });

    if (existing) {
      if (!scope.canManageAll) {
        if (checkOut) existing.checkOut = checkOut;
        if (checkIn && !existing.checkIn) existing.checkIn = checkIn;
        existing.workingHours = calcWorkingHoursFromTimes(existing.checkIn, existing.checkOut);
        if (req.body.notes != null) existing.notes = req.body.notes;
        if (req.body.status != null) {
          existing.status = resolveEmployeeSelfStatus(req.body.status, existing.status);
        }
        await existing.save();
        await existing.populate('employee', 'employeeId firstName lastName department photo');
        return res.json(existing);
      }
      return res.status(400).json({ error: 'Attendance already marked for this employee today' });
    }

    const defaultStatus = scope.canManageAll
      ? (req.body.status || 'Present')
      : resolveEmployeeSelfStatus(req.body.status, 'Present');

    const payload = {
      employee: employeeId,
      date: today,
      checkIn,
      checkOut,
      workingHours,
      status: defaultStatus,
      notes: req.body.notes || '',
    };

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
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Only HR and Admin can update attendance records' });
    }

    const existing = await Attendance.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Attendance record not found' });

    const payload = { ...req.body };
    delete payload.date;
    delete payload.checkIn;
    delete payload.checkOut;

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
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Only HR and Admin can delete attendance records' });
    }
    const record = await Attendance.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: 'Attendance record not found' });
    res.json({ message: 'Attendance record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
