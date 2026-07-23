const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const { paginate } = require('../../utils/pagination');
const { startOfDay, endOfDay, formatTimeHHMM } = require('../utils/employeeId');
const {
  resolveAttendanceScope,
  applyEmployeeScope,
  applySelfEmployeeScope,
  wantsSelfService,
  recordMatchesScope,
  getEmployeeAttendanceTimes,
  getAttendanceTimesForUser,
  ensureUserAttendanceSession,
  isSelfAttendanceRequest,
  withComputedWorkingHours,
} = require('../utils/attendanceAccess');
const { calcWorkingHoursFromTimes, getDateKey, pickEarlierTime, pickLaterTime } = require('../../utils/attendanceSession');
const { zonedDateTimeToUtc, APP_TIMEZONE } = require('../../utils/appTimezone');
const {
  HALF_DAY_CUTOFF,
  isPastHalfDayCutoff,
  getNowHHMM,
  resolveSelfMarkStatus,
} = require('../utils/attendanceCutoff');
const { validateAttendanceLocation } = require('../utils/attendanceLocation');

function applyAttendanceEmployeeScope(query, scope, req) {
  if (wantsSelfService(req)) {
    applySelfEmployeeScope(query, scope);
  } else {
    applyEmployeeScope(query, scope, req.query.employee);
  }
}

function parseClientLocation(body = {}) {
  return {
    latitude: body.latitude ?? body.location?.latitude,
    longitude: body.longitude ?? body.location?.longitude,
    accuracy: body.accuracy ?? body.location?.accuracy,
    deviceInfo: body.deviceInfo || body.location?.deviceInfo || '',
    browserInfo: body.browserInfo || body.location?.browserInfo || '',
  };
}

/**
 * If GPS is outside office radius, auto-assign Work From Home.
 */
function applyOutsideRadiusStatus(status, locationCheck, notes = '') {
  if (!locationCheck?.outsideRadius) {
    return { status, notes, autoWfh: false };
  }

  const wfhNote = 'Auto Work From Home — marked outside office attendance radius';
  let nextNotes = String(notes || '').trim();
  if (!nextNotes.includes('outside office attendance radius')) {
    nextNotes = nextNotes ? `${nextNotes} | ${wfhNote}` : wfhNote;
  }

  return { status: 'Work From Home', notes: nextNotes, autoWfh: true };
}

async function applyLocationValidation({
  employeeId,
  body,
}) {
  // GPS is optional for SaaS / desktop use. When coords are present and outside
  // the office radius, attendance is auto-marked Work From Home.
  const loc = parseClientLocation(body);
  if (loc.latitude == null || loc.longitude == null) {
    return { ok: true, locationPayload: null, outsideRadius: false, locationUnavailable: true };
  }

  const result = await validateAttendanceLocation({
    employeeId,
    ...loc,
    requireLocation: false,
  });
  if (result.ok) return result;

  // Invalid GPS should not block marking for customers without location access
  return { ok: true, locationPayload: null, outsideRadius: false, locationUnavailable: true };
}

function enrichAttendanceRecord(record) {
  if (!record) return record;
  if (Array.isArray(record)) {
    return record.map(enrichAttendanceRecord);
  }
  const plain = withComputedWorkingHours(record);
  if (plain.employee && typeof plain.employee.toObject === 'function') {
    plain.employee = plain.employee.toObject();
  }
  return plain;
}

function parseDateRange(date, month, year) {
  if (date) {
    const d = startOfDay(date);
    return { $gte: d, $lte: endOfDay(date) };
  }
  if (month && year) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const startKey = `${y}-${String(m).padStart(2, '0')}-01`;
    const endKey = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const start = zonedDateTimeToUtc(startKey, '00:00:00');
    const end = zonedDateTimeToUtc(endKey, '23:59:59');
    end.setMilliseconds(999);
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
    applyAttendanceEmployeeScope(match, scope, req);

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
    const m = parseInt(month, 10) || Number(getDateKey(new Date()).slice(5, 7));
    const y = parseInt(year, 10) || Number(getDateKey(new Date()).slice(0, 4));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();

    if (!scope.canManageAll && !scope.employeeId) {
      return res.json({ trend: [] });
    }

    const trend = [];
    for (let d = 1; d <= daysInMonth; d += 1) {
      const dateKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayStart = zonedDateTimeToUtc(dateKey, '00:00:00');
      const dayEnd = endOfDay(dateKey);
      const match = { date: { $gte: dayStart, $lte: dayEnd } };
      applyAttendanceEmployeeScope(match, scope, req);

      const [present, absent, leave] = await Promise.all([
        Attendance.countDocuments({ ...match, status: 'Present' }),
        Attendance.countDocuments({ ...match, status: 'Absent' }),
        Attendance.countDocuments({ ...match, status: 'Leave' }),
      ]);

      trend.push({
        date: dateKey,
        label: dayStart.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          timeZone: APP_TIMEZONE,
        }),
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

/** One row per employee for a month — counts by status, not day-by-day detail. */
router.get('/employee-summary', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const { month, year, search, status } = req.query;

    if (!scope.canManageAll && !scope.employeeId) {
      return res.json({ employees: [] });
    }

    const dateRange = parseDateRange(undefined, month, year);
    const match = { date: dateRange };
    applyAttendanceEmployeeScope(match, scope, req);
    if (status) match.status = status;

    if (match.employee && typeof match.employee === 'string' && mongoose.Types.ObjectId.isValid(match.employee)) {
      match.employee = new mongoose.Types.ObjectId(match.employee);
    }

    const rows = await Attendance.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$employee',
          present: {
            $sum: { $cond: [{ $eq: ['$status', 'Present'] }, 1, 0] },
          },
          absent: {
            $sum: { $cond: [{ $eq: ['$status', 'Absent'] }, 1, 0] },
          },
          halfDay: {
            $sum: { $cond: [{ $eq: ['$status', 'Half Day'] }, 1, 0] },
          },
          leave: {
            $sum: { $cond: [{ $eq: ['$status', 'Leave'] }, 1, 0] },
          },
          holiday: {
            $sum: { $cond: [{ $eq: ['$status', 'Holiday'] }, 1, 0] },
          },
          wfh: {
            $sum: { $cond: [{ $eq: ['$status', 'Work From Home'] }, 1, 0] },
          },
          totalDays: { $sum: 1 },
          workingHours: { $sum: { $ifNull: ['$workingHours', 0] } },
        },
      },
      {
        $lookup: {
          from: 'hremployees',
          localField: '_id',
          foreignField: '_id',
          as: 'employee',
        },
      },
      { $unwind: { path: '$employee', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          employeeId: '$_id',
          employeeCode: '$employee.employeeId',
          firstName: '$employee.firstName',
          lastName: '$employee.lastName',
          department: '$employee.department',
          photo: '$employee.photo',
          present: 1,
          absent: 1,
          halfDay: 1,
          leave: 1,
          holiday: 1,
          wfh: 1,
          totalDays: 1,
          workingHours: 1,
        },
      },
      { $sort: { firstName: 1, lastName: 1 } },
    ]);

    let employees = rows;
    if (search?.trim()) {
      const term = search.trim().toLowerCase();
      employees = rows.filter((row) => {
        const name = `${row.firstName || ''} ${row.lastName || ''}`.toLowerCase();
        return name.includes(term) || String(row.employeeCode || '').toLowerCase().includes(term);
      });
    }

    res.json({ employees });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const { search, status, date, month, year, page, limit, sortBy, sortOrder } = req.query;
    const query = { date: parseDateRange(date, month, year) };
    applyAttendanceEmployeeScope(query, scope, req);
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
      result.data = enrichAttendanceRecord(result.data);
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
    res.json(enrichAttendanceRecord(records));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/mark-defaults', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    let employeeId = req.query.employee;

    if (wantsSelfService(req)) {
      if (!scope.employeeId) {
        return res.status(403).json({ error: 'Employee profile not linked' });
      }
      employeeId = scope.employeeId;
    } else if (scope.canManageAll) {
      if (!employeeId) {
        if (!scope.employeeId) {
          return res.status(400).json({ error: 'Employee is required' });
        }
        employeeId = scope.employeeId;
      }
    } else if (!scope.employeeId) {
      return res.status(403).json({ error: 'Employee profile not linked' });
    } else {
      employeeId = scope.employeeId;
    }

    const today = startOfDay(new Date());
    let times = { checkIn: '', checkOut: '' };
    const selfRequest =
      wantsSelfService(req) || isSelfAttendanceRequest(scope, employeeId);

    if (selfRequest || !scope.canManageAll) {
      await ensureUserAttendanceSession(req.user.id, { allowCurrentTime: true });
      times = await getAttendanceTimesForUser(req.user.id, today);
    } else {
      times = await getEmployeeAttendanceTimes(employeeId, today);
    }
    const existing = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: today, $lte: endOfDay(today) },
    }).lean();

    const isToday = getDateKey(today) === getDateKey(new Date());
    const effectiveCheckOut = times.checkOut
      || (isToday && times.checkIn ? formatTimeHHMM(new Date()) : '');

    const pastCutoff = isPastHalfDayCutoff();
    res.json({
      date: today.toISOString().slice(0, 10),
      checkIn: times.checkIn,
      checkOut: times.checkOut,
      workingHours: calcWorkingHoursFromTimes(times.checkIn, effectiveCheckOut),
      hoursInProgress: isToday && Boolean(times.checkIn) && !times.checkOut,
      alreadyMarked: Boolean(existing),
      existingRecord: existing ? withComputedWorkingHours(existing) : null,
      halfDayCutoff: HALF_DAY_CUTOFF,
      pastHalfDayCutoff: pastCutoff,
      predictedStatus:
        existing?.status
        || (pastCutoff ? 'Half Day' : 'Present'),
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
    res.json(enrichAttendanceRecord(record));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const today = startOfDay(new Date());
    const todayEnd = endOfDay(today);
    const nowTime = getNowHHMM(new Date());

    let employeeId = req.body.employee;
    if (wantsSelfService(req)) {
      if (!scope.employeeId) {
        return res.status(403).json({ error: 'Employee profile not linked' });
      }
      employeeId = scope.employeeId;
    } else if (!scope.canManageAll) {
      if (!scope.employeeId) {
        return res.status(403).json({ error: 'Employee profile not linked' });
      }
      employeeId = scope.employeeId;
    } else if (!employeeId) {
      if (!scope.employeeId) {
        return res.status(400).json({ error: 'Employee is required' });
      }
      employeeId = scope.employeeId;
    }

    const selfRequest =
      wantsSelfService(req) || isSelfAttendanceRequest(scope, employeeId);
    const employeeMarking = selfRequest || !scope.canManageAll;

    let sessionTimes = { checkIn: '', checkOut: '' };
    if (employeeMarking) {
      await ensureUserAttendanceSession(req.user.id, { allowCurrentTime: true });
      sessionTimes = await getAttendanceTimesForUser(req.user.id, today);
    } else {
      sessionTimes = await getEmployeeAttendanceTimes(employeeId, today);
    }

    const checkIn =
      scope.canManageAll && req.body.checkIn != null && req.body.checkIn !== ''
        ? req.body.checkIn
        : (req.body.checkIn || sessionTimes.checkIn);
    const checkOut =
      scope.canManageAll && req.body.checkOut != null && req.body.checkOut !== ''
        ? req.body.checkOut
        : (req.body.checkOut || sessionTimes.checkOut);
    // Employees only get check-out after they log out of the app (session times)
    const resolvedCheckOut = checkOut || '';

    if (employeeMarking && !checkIn) {
      return res.status(400).json({
        error: 'No login recorded today. Log in to the app first, then mark attendance.',
      });
    }

    const existing = await Attendance.findOne({
      employee: employeeId,
      date: { $gte: today, $lte: todayEnd },
    });

    if (existing) {
      if (employeeMarking) {
        let nextStatus = resolveSelfMarkStatus({
          requestedStatus: req.body.status,
          existing,
          nowHHMM: nowTime,
        });

        const locationCheck = await applyLocationValidation({
          employeeId,
          body: req.body,
        });
        if (!locationCheck.ok) {
          return res.status(400).json({
            error: locationCheck.error,
            code: locationCheck.code,
            currentDistanceMeters: locationCheck.currentDistanceMeters,
            allowedRadiusMeters: locationCheck.allowedRadiusMeters,
            officeName: locationCheck.office?.name,
          });
        }

        const adjusted = applyOutsideRadiusStatus(
          nextStatus,
          locationCheck,
          req.body.notes != null ? req.body.notes : existing.notes
        );
        nextStatus = adjusted.status;

        if (checkIn) {
          existing.checkIn = existing.checkIn
            ? pickEarlierTime(existing.checkIn, checkIn)
            : checkIn;
        }
        if (employeeMarking) {
          // Check-out only after real logout; clear any previously invented time
          existing.checkOut = resolvedCheckOut || '';
        } else if (resolvedCheckOut) {
          existing.checkOut = existing.checkOut
            ? pickLaterTime(existing.checkOut, resolvedCheckOut)
            : resolvedCheckOut;
        }
        existing.notes = adjusted.notes;
        existing.status = nextStatus;
        if (
          existing.status === 'Half Day'
          && (!existing.notes || existing.notes.includes('Auto-marked absent'))
        ) {
          existing.notes = existing.notes?.includes('Auto-marked absent')
            ? 'Marked after 12:30 — counted as half day'
            : (existing.notes || 'Marked after 12:30 — counted as half day');
        }
        if (locationCheck.locationPayload) {
          existing.location = locationCheck.locationPayload;
        }
        await existing.save();
        await existing.populate('employee', 'employeeId firstName lastName department photo');
        const enriched = enrichAttendanceRecord(existing);
        return res.json({
          ...(enriched && typeof enriched === 'object' ? enriched : { data: enriched }),
          autoWorkFromHome: Boolean(adjusted.autoWfh),
          currentDistanceMeters: locationCheck.currentDistanceMeters ?? locationCheck.distanceMeters,
          allowedRadiusMeters: locationCheck.allowedRadiusMeters ?? locationCheck.office?.radiusMeters,
          officeName: locationCheck.office?.name || locationCheck.locationPayload?.officeName || '',
        });
      }
      return res.status(400).json({ error: 'Attendance already marked for this employee today' });
    }

    let defaultStatus;
    if (employeeMarking) {
      defaultStatus = resolveSelfMarkStatus({
        requestedStatus: req.body.status,
        existing: null,
        nowHHMM: nowTime,
      });
    } else {
      defaultStatus = req.body.status || 'Present';
    }

    const locationCheck = await applyLocationValidation({
      employeeId,
      body: req.body,
    });
    if (!locationCheck.ok) {
      return res.status(400).json({
        error: locationCheck.error,
        code: locationCheck.code,
        currentDistanceMeters: locationCheck.currentDistanceMeters,
        allowedRadiusMeters: locationCheck.allowedRadiusMeters,
        officeName: locationCheck.office?.name,
      });
    }

    const baseNotes = req.body.notes
      || (employeeMarking && defaultStatus === 'Half Day'
        ? 'Marked after 12:30 — counted as half day'
        : '');
    const adjusted = applyOutsideRadiusStatus(defaultStatus, locationCheck, baseNotes);
    defaultStatus = adjusted.status;

    const payload = {
      employee: employeeId,
      date: today,
      checkIn,
      checkOut: resolvedCheckOut,
      status: defaultStatus,
      notes: adjusted.notes,
    };
    if (locationCheck.locationPayload) {
      payload.location = locationCheck.locationPayload;
    }

    const record = new Attendance(payload);
    await record.save();
    await record.populate('employee', 'employeeId firstName lastName department photo');
    const enriched = enrichAttendanceRecord(record);
    res.status(201).json({
      ...(enriched && typeof enriched === 'object' ? enriched : { data: enriched }),
      autoWorkFromHome: Boolean(adjusted.autoWfh),
      currentDistanceMeters: locationCheck.currentDistanceMeters ?? locationCheck.distanceMeters,
      allowedRadiusMeters: locationCheck.allowedRadiusMeters ?? locationCheck.office?.radiusMeters,
      officeName: locationCheck.office?.name || locationCheck.locationPayload?.officeName || '',
    });
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
    delete payload.workingHours;

    const checkIn = payload.checkIn != null ? payload.checkIn : existing.checkIn;
    const checkOut = payload.checkOut != null ? payload.checkOut : existing.checkOut;
    payload.workingHours = calcWorkingHoursFromTimes(checkIn, checkOut);

    Object.assign(existing, payload);
    await existing.save();
    await existing.populate('employee', 'employeeId firstName lastName department photo');
    res.json(enrichAttendanceRecord(existing));
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
