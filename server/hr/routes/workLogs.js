const express = require('express');
const router = express.Router();
const DailyWorkLog = require('../models/DailyWorkLog');
const Employee = require('../models/Employee');
const { paginate } = require('../../utils/pagination');
const { startOfDay, endOfDay } = require('../utils/employeeId');
const { getDateKeyInAppTz, zonedDateTimeToUtc } = require('../../utils/appTimezone');
const {
  resolveAttendanceScope,
  applyEmployeeScope,
  recordMatchesScope,
} = require('../utils/attendanceAccess');

const EMPLOYEE_POPULATE = { path: 'employee', select: 'employeeId firstName lastName department' };

function parseCalendarDate(value, fallback = new Date()) {
  if (!value) return startOfDay(fallback);

  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return zonedDateTimeToUtc(`${match[1]}-${match[2]}-${match[3]}`, '00:00:00');
  }

  const date = startOfDay(value);
  return Number.isNaN(date.getTime()) ? startOfDay(fallback) : date;
}

function buildDayRangeQuery(dateValue) {
  const dayStart = parseCalendarDate(dateValue);
  return { $gte: dayStart, $lte: endOfDay(dayStart) };
}

/** Find day's log, including legacy docs saved as UTC midnight (buggy setHours on UTC hosts). */
async function findLogForEmployeeDay(employeeId, dateValue) {
  const dateKey =
    typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue).trim())
      ? String(dateValue).trim()
      : getDateKeyInAppTz(parseCalendarDate(dateValue));
  const logDate = parseCalendarDate(dateKey);
  const dayEnd = endOfDay(logDate);
  const [year, month, day] = dateKey.split('-').map(Number);
  const legacyUtcMidnight = new Date(Date.UTC(year, month - 1, day - 1));

  let log = await DailyWorkLog.findOne({
    employee: employeeId,
    $or: [
      { date: logDate },
      { date: { $gte: logDate, $lte: dayEnd } },
      { date: legacyUtcMidnight },
    ],
  }).sort({ updatedAt: -1 });

  if (log && log.date.getTime() !== logDate.getTime()) {
    log.date = logDate;
    try {
      await log.save();
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      // Another doc already owns the normalized date — use that one instead.
      const canonical = await DailyWorkLog.findOne({ employee: employeeId, date: logDate });
      if (canonical) {
        await DailyWorkLog.deleteOne({ _id: log._id });
        log = canonical;
      }
    }
  }

  return log;
}

function isDuplicateKeyError(error) {
  if (!error) return false;
  if (error.code === 11000 || error.code === 'E11000' || error.codeName === 'DuplicateKey') {
    return true;
  }
  return /duplicate key/i.test(String(error.message || ''));
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      let minutes = Number(entry.timeSpentMinutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        const hours = Number(entry.hours) || 0;
        const mins = Number(entry.minutes) || 0;
        minutes = Math.round(hours * 60 + mins);
      }
      return {
        description: String(entry.description || '').trim(),
        details: String(entry.details || '').trim(),
        timeSpentMinutes: Math.max(0, Math.round(minutes)),
      };
    })
    .filter((entry) => entry.description && entry.timeSpentMinutes > 0);
}

function buildDateRangeQuery(fromDate, toDate) {
  if (!fromDate && !toDate) return {};
  const query = {};
  if (fromDate) query.$gte = parseCalendarDate(fromDate);
  if (toDate) query.$lte = endOfDay(parseCalendarDate(toDate));
  if (Object.keys(query).length === 0) return {};
  return { date: query };
}

router.get('/today', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll && !scope.employeeId) {
      return res.json(null);
    }

    const todayKey = getDateKeyInAppTz(new Date());
    const employeeId = scope.canManageAll
      ? req.query.employee || null
      : scope.employeeId;

    let log = null;
    if (employeeId) {
      log = await findLogForEmployeeDay(employeeId, todayKey);
      if (log) await log.populate(EMPLOYEE_POPULATE);
    } else {
      const query = { date: buildDayRangeQuery(todayKey) };
      applyEmployeeScope(query, scope, req.query.employee);
      log = await DailyWorkLog.findOne(query).populate(EMPLOYEE_POPULATE);
    }
    res.json(log ? (log.toObject ? log.toObject() : log) : null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/by-date', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll && !scope.employeeId) {
      return res.json(null);
    }

    const requestedEmployeeId = req.query.employee;
    const employeeId = scope.canManageAll
      ? requestedEmployeeId || null
      : scope.employeeId;

    let log = null;
    if (employeeId) {
      log = await findLogForEmployeeDay(employeeId, req.query.date);
      if (log) await log.populate(EMPLOYEE_POPULATE);
    } else {
      const query = { date: buildDayRangeQuery(req.query.date) };
      applyEmployeeScope(query, scope, requestedEmployeeId);
      log = await DailyWorkLog.findOne(query).populate(EMPLOYEE_POPULATE);
    }
    res.json(log ? (log.toObject ? log.toObject() : log) : null);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/summary', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { fromDate, toDate, status } = req.query;
    const match = {
      ...buildDateRangeQuery(fromDate, toDate),
    };
    if (status) match.status = status;
    applyEmployeeScope(match, scope, req.query.employee);

    const [totals, byEmployee] = await Promise.all([
      DailyWorkLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            logCount: { $sum: 1 },
            totalMinutes: { $sum: '$totalMinutes' },
            submittedCount: {
              $sum: { $cond: [{ $eq: ['$status', 'Submitted'] }, 1, 0] },
            },
          },
        },
      ]),
      DailyWorkLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: '$employee',
            logCount: { $sum: 1 },
            totalMinutes: { $sum: '$totalMinutes' },
          },
        },
        { $sort: { totalMinutes: -1 } },
        { $limit: 20 },
      ]),
    ]);

    const employeeIds = byEmployee.map((row) => row._id).filter(Boolean);
    const employees = await Employee.find({ _id: { $in: employeeIds } })
      .select('employeeId firstName lastName department')
      .lean();
    const employeeMap = new Map(employees.map((emp) => [String(emp._id), emp]));

    res.json({
      totals: totals[0] || { logCount: 0, totalMinutes: 0, submittedCount: 0 },
      byEmployee: byEmployee.map((row) => ({
        employee: employeeMap.get(String(row._id)) || { _id: row._id },
        logCount: row.logCount,
        totalMinutes: row.totalMinutes,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/monthly-report', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
    const { department, status } = req.query;

    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'Invalid month' });
    }

    const fromDate = startOfDay(new Date(year, month - 1, 1));
    const toDate = endOfDay(new Date(year, month, 0));

    const employeeQuery = { status: 'Active' };
    if (department) employeeQuery.department = department;
    if (req.query.employee) employeeQuery._id = req.query.employee;

    const employees = await Employee.find(employeeQuery)
      .select('employeeId firstName lastName department designation')
      .sort({ firstName: 1, lastName: 1 })
      .lean();

    const logQuery = {
      date: { $gte: fromDate, $lte: toDate },
      employee: { $in: employees.map((emp) => emp._id) },
    };
    if (status) logQuery.status = status;

    const logs = await DailyWorkLog.find(logQuery)
      .sort({ date: 1 })
      .lean();

    const logsByEmployee = new Map();
    for (const log of logs) {
      const key = String(log.employee);
      if (!logsByEmployee.has(key)) logsByEmployee.set(key, []);
      logsByEmployee.get(key).push(log);
    }

    const employeeReports = employees.map((employee) => {
      const employeeLogs = logsByEmployee.get(String(employee._id)) || [];
      const submittedCount = employeeLogs.filter((log) => log.status === 'Submitted').length;
      const draftCount = employeeLogs.filter((log) => log.status === 'Draft').length;
      const totalMinutes = employeeLogs.reduce((sum, log) => sum + (log.totalMinutes || 0), 0);

      return {
        employee,
        summary: {
          logCount: employeeLogs.length,
          totalMinutes,
          submittedCount,
          draftCount,
          daysLogged: employeeLogs.length,
        },
        logs: employeeLogs.map((log) => ({
          _id: log._id,
          date: log.date,
          status: log.status,
          totalMinutes: log.totalMinutes,
          notes: log.notes || '',
          entries: log.entries || [],
        })),
      };
    });

    const totals = employeeReports.reduce(
      (acc, row) => {
        acc.logCount += row.summary.logCount;
        acc.totalMinutes += row.summary.totalMinutes;
        acc.submittedCount += row.summary.submittedCount;
        if (row.summary.logCount > 0) acc.employeesWithLogs += 1;
        return acc;
      },
      {
        employeeCount: employeeReports.length,
        logCount: 0,
        totalMinutes: 0,
        submittedCount: 0,
        employeesWithLogs: 0,
      }
    );

    res.json({
      period: {
        year,
        month,
        fromDate,
        toDate,
        label: new Date(year, month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      },
      totals,
      employees: employeeReports,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const { status, page, limit, fromDate, toDate } = req.query;
    const query = {
      ...buildDateRangeQuery(fromDate, toDate),
    };

    if (status) query.status = status;
    applyEmployeeScope(query, scope, req.query.employee);

    if (!scope.canManageAll && !scope.employeeId) {
      if (page || limit) {
        return res.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
      }
      return res.json([]);
    }

    const sort = { date: -1, updatedAt: -1 };
    if (page || limit) {
      const result = await paginate(DailyWorkLog, query, {
        page,
        limit,
        sort,
        populate: EMPLOYEE_POPULATE,
      });
      return res.json(result);
    }

    const logs = await DailyWorkLog.find(query)
      .populate(EMPLOYEE_POPULATE)
      .sort(sort);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const entries = normalizeEntries(req.body.entries);
    if (entries.length === 0) {
      return res.status(400).json({ error: 'Add at least one work entry with description and time' });
    }

    const logDate = parseCalendarDate(req.body.date);
    const dayRange = buildDayRangeQuery(req.body.date);
    const targetStatus = req.body.status === 'Submitted' ? 'Submitted' : 'Draft';
    let employeeId = scope.employeeId;

    if (req.body.employee) {
      if (!scope.canManageAll && String(req.body.employee) !== String(scope.employeeId)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const employee = await Employee.findById(req.body.employee);
      if (!employee) {
        return res.status(400).json({ error: 'Employee not found' });
      }
      employeeId = employee._id;
    }

    if (!employeeId) {
      return res.status(403).json({ error: 'Employee profile not linked' });
    }

    const applyEntriesToLog = async (log, { created = false } = {}) => {
      const previousEntryCount = log.entries?.length || 0;
      const isAddingTasks = entries.length > previousEntryCount;

      if (!scope.canManageAll && log.status === 'Submitted') {
        if (entries.length < previousEntryCount) {
          const err = new Error('Submitted tasks cannot be removed or edited');
          err.statusCode = 403;
          throw err;
        }
        if (!isAddingTasks && targetStatus === 'Submitted') {
          const err = new Error('This day\'s work log is already submitted');
          err.statusCode = 403;
          throw err;
        }
      }

      log.date = logDate;
      log.entries = entries;
      log.notes = req.body.notes || '';
      log.status = (!scope.canManageAll && log.status === 'Submitted' && isAddingTasks && targetStatus === 'Draft')
        ? 'Draft'
        : targetStatus;
      await log.save();
      await DailyWorkLog.deleteMany({
        employee: employeeId,
        date: dayRange,
        _id: { $ne: log._id },
      });
      return { log, created };
    };

    let log = await findLogForEmployeeDay(employeeId, req.body.date || logDate);
    let created = false;

    if (log) {
      ({ log, created } = await applyEntriesToLog(log, { created: false }));
    } else {
      created = true;
      try {
        log = new DailyWorkLog({
          employee: employeeId,
          date: logDate,
          entries,
          notes: req.body.notes || '',
          status: targetStatus,
        });
        await log.save();
      } catch (error) {
        if (!isDuplicateKeyError(error)) throw error;
        // Concurrent create or leftover row: always fall back to update.
        log = await findLogForEmployeeDay(employeeId, req.body.date || logDate);
        if (!log) {
          log = await DailyWorkLog.findOne({ employee: employeeId, date: logDate });
        }
        if (!log) throw error;
        ({ log, created } = await applyEntriesToLog(log, { created: false }));
      }
    }

    await log.populate(EMPLOYEE_POPULATE);
    res.status(created ? 201 : 200).json(log);
  } catch (error) {
    res.status(error.statusCode || 400).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const log = await DailyWorkLog.findById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Work log not found' });
    }

    if (!recordMatchesScope(log.employee, scope)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (req.body.entries != null) {
      const entries = normalizeEntries(req.body.entries);
      if (entries.length === 0) {
        return res.status(400).json({ error: 'Add at least one work entry with description and time' });
      }

      const previousEntryCount = log.entries?.length || 0;
      const isAddingTasks = entries.length > previousEntryCount;
      const targetStatus = req.body.status === 'Submitted'
        ? 'Submitted'
        : (req.body.status === 'Draft' ? 'Draft' : log.status);

      if (!scope.canManageAll && log.status === 'Submitted') {
        if (entries.length < previousEntryCount) {
          return res.status(403).json({ error: 'Submitted tasks cannot be removed or edited' });
        }
        if (!isAddingTasks && targetStatus === 'Submitted') {
          return res.status(403).json({ error: 'Submitted work logs cannot be edited' });
        }
      }

      log.entries = entries;
      if (!scope.canManageAll && log.status === 'Submitted' && isAddingTasks && targetStatus === 'Draft') {
        log.status = 'Draft';
      } else if (req.body.status != null && ['Draft', 'Submitted'].includes(req.body.status)) {
        log.status = req.body.status;
      }
    } else if (!scope.canManageAll && log.status === 'Submitted') {
      return res.status(403).json({ error: 'Submitted work logs cannot be edited' });
    } else if (req.body.status != null && ['Draft', 'Submitted'].includes(req.body.status)) {
      log.status = req.body.status;
    }

    if (req.body.notes != null) log.notes = req.body.notes;

    await log.save();
    await log.populate(EMPLOYEE_POPULATE);
    res.json(log);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/:id/submit', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const log = await DailyWorkLog.findById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Work log not found' });
    }

    if (!recordMatchesScope(log.employee, scope)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!log.entries?.length) {
      return res.status(400).json({ error: 'Add work entries before submitting' });
    }

    log.status = 'Submitted';
    await log.save();
    await log.populate(EMPLOYEE_POPULATE);
    res.json(log);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const log = await DailyWorkLog.findById(req.params.id);
    if (!log) {
      return res.status(404).json({ error: 'Work log not found' });
    }

    if (!recordMatchesScope(log.employee, scope)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!scope.canManageAll && log.status === 'Submitted') {
      return res.status(403).json({ error: 'Submitted work logs cannot be deleted' });
    }

    await DailyWorkLog.findByIdAndDelete(req.params.id);
    res.json({ message: 'Work log deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
