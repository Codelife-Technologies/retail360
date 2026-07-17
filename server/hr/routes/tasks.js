const express = require('express');
const router = express.Router();
const EmployeeTask = require('../models/EmployeeTask');
const Employee = require('../models/Employee');
const { paginate } = require('../../utils/pagination');
const { startOfDay, endOfDay } = require('../utils/employeeId');
const {
  resolveAttendanceScope,
  applyEmployeeScope,
  recordMatchesScope,
} = require('../utils/attendanceAccess');

const EMPLOYEE_POPULATE = { path: 'employee', select: 'employeeId firstName lastName department' };

function parseInputDate(value, fallback = new Date()) {
  if (!value) return startOfDay(fallback);
  const date = startOfDay(value);
  return Number.isNaN(date.getTime()) ? startOfDay(fallback) : date;
}

function buildActiveTodayQuery(todayStart, todayEnd) {
  return {
    status: { $ne: 'Completed' },
    $or: [
      { dueDate: { $gte: todayStart, $lte: todayEnd } },
      { startDate: { $lte: todayEnd }, dueDate: { $gte: todayStart } },
    ],
  };
}

function buildTimelineOverlapQuery(fromDate, toDate) {
  const rangeStart = startOfDay(fromDate);
  const rangeEnd = endOfDay(toDate);
  return {
    startDate: { $lte: rangeEnd },
    dueDate: { $gte: rangeStart },
  };
}

router.get('/today', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll && !scope.employeeId) {
      return res.json([]);
    }

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const query = buildActiveTodayQuery(todayStart, todayEnd);
    applyEmployeeScope(query, scope, req.query.employee);

    const tasks = await EmployeeTask.find(query)
      .populate(EMPLOYEE_POPULATE)
      .sort({ priority: -1, dueDate: 1, createdAt: 1 })
      .lean();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const { status, source, page, limit, fromDate, toDate } = req.query;
    const query = {};

    if (status) query.status = status;
    if (source) query.source = source;
    if (fromDate && toDate) {
      Object.assign(query, buildTimelineOverlapQuery(fromDate, toDate));
    }

    applyEmployeeScope(query, scope, req.query.employee);

    if (!scope.canManageAll && !scope.employeeId) {
      if (page || limit) {
        return res.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
      }
      return res.json([]);
    }

    const sort = { startDate: 1, dueDate: 1, priority: -1 };
    if (page || limit) {
      const result = await paginate(EmployeeTask, query, {
        page,
        limit,
        sort,
        populate: EMPLOYEE_POPULATE,
      });
      return res.json(result);
    }

    const tasks = await EmployeeTask.find(query)
      .populate(EMPLOYEE_POPULATE)
      .sort(sort);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const startDate = parseInputDate(req.body.startDate, req.body.dueDate || new Date());
    const dueDate = parseInputDate(req.body.dueDate || req.body.startDate || new Date());
    const requestedEmployee = req.body.employee || null;
    const wantsPersonal =
      req.body.source === 'Personal' ||
      req.body.assignedBy === 'Self' ||
      !requestedEmployee;

    // Personal / self task — including admins with a linked employee profile
    if (wantsPersonal || (requestedEmployee && scope.employeeId && String(requestedEmployee) === String(scope.employeeId))) {
      if (!scope.employeeId) {
        return res.status(403).json({
          error: 'Employee profile not linked. Link your user account to an employee record to add personal tasks.',
        });
      }

      const task = new EmployeeTask({
        employee: scope.employeeId,
        title: req.body.title,
        description: req.body.description || '',
        startDate,
        dueDate,
        priority: req.body.priority || 'Medium',
        source: 'Personal',
        assignedBy: 'Self',
        status: 'Pending',
      });
      await task.save();
      await task.populate(EMPLOYEE_POPULATE);
      return res.status(201).json(task);
    }

    // HR-assigned task for another employee
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'You can only create personal tasks for yourself' });
    }

    const employee = await Employee.findById(requestedEmployee);
    if (!employee) {
      return res.status(400).json({ error: 'Employee not found' });
    }

    const task = new EmployeeTask({
      employee: requestedEmployee,
      title: req.body.title,
      description: req.body.description || '',
      startDate,
      dueDate,
      priority: req.body.priority || 'Medium',
      source: 'HR',
      assignedBy: req.body.assignedBy || 'HR',
      status: 'Pending',
    });
    await task.save();
    await task.populate(EMPLOYEE_POPULATE);
    return res.status(201).json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const task = await EmployeeTask.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!recordMatchesScope(task.employee, scope)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!scope.canManageAll) {
      if (task.source !== 'Personal') {
        return res.status(403).json({ error: 'You can only edit your personal tasks' });
      }
      if (req.body.title != null) task.title = req.body.title;
      if (req.body.description != null) task.description = req.body.description;
      if (req.body.startDate != null) task.startDate = parseInputDate(req.body.startDate);
      if (req.body.dueDate != null) task.dueDate = parseInputDate(req.body.dueDate);
      if (req.body.priority != null) task.priority = req.body.priority;
      if (req.body.status != null) {
        task.status = req.body.status;
        task.completedAt = req.body.status === 'Completed' ? new Date() : null;
      }
    } else {
      if (req.body.title != null) task.title = req.body.title;
      if (req.body.description != null) task.description = req.body.description;
      if (req.body.startDate != null) task.startDate = parseInputDate(req.body.startDate);
      if (req.body.dueDate != null) task.dueDate = parseInputDate(req.body.dueDate);
      if (req.body.priority != null) task.priority = req.body.priority;
      if (req.body.status != null) {
        task.status = req.body.status;
        task.completedAt = req.body.status === 'Completed' ? new Date() : null;
      }
    }

    await task.save();
    await task.populate(EMPLOYEE_POPULATE);
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.patch('/:id/status', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const task = await EmployeeTask.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (!recordMatchesScope(task.employee, scope)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const status = req.body.status;
    if (!['Pending', 'In Progress', 'Completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    task.status = status;
    task.completedAt = status === 'Completed' ? new Date() : null;
    await task.save();
    res.json(task);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const task = await EmployeeTask.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    if (scope.canManageAll) {
      await EmployeeTask.findByIdAndDelete(req.params.id);
      return res.json({ message: 'Task deleted' });
    }

    if (!recordMatchesScope(task.employee, scope)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (task.source !== 'Personal') {
      return res.status(403).json({ error: 'You can only delete your personal tasks' });
    }

    await EmployeeTask.findByIdAndDelete(req.params.id);
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
