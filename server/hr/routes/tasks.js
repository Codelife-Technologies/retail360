const express = require('express');
const router = express.Router();
const EmployeeTask = require('../models/EmployeeTask');
const Employee = require('../models/Employee');
const { paginate } = require('../../utils/pagination');
const { startOfDay, endOfDay } = require('../utils/employeeId');
const { getDateKeyInAppTz } = require('../../utils/appTimezone');
const { exportToExcel } = require('../../utils/excelGenerator');
const {
  resolveAttendanceScope,
  applyEmployeeScope,
  applySelfEmployeeScope,
  wantsSelfService,
  recordMatchesScope,
} = require('../utils/attendanceAccess');

const EMPLOYEE_POPULATE = { path: 'employee', select: 'employeeId firstName lastName department' };
const TASK_STATUSES = ['Pending', 'In Progress', 'On Hold', 'Completed', 'Backlog', 'Cancelled'];

function parseInputDate(value, fallback = new Date()) {
  if (!value) return startOfDay(fallback);
  const date = startOfDay(value);
  return Number.isNaN(date.getTime()) ? startOfDay(fallback) : date;
}

function employeeDisplayName(emp) {
  if (!emp) return '';
  return `${emp.firstName || ''} ${emp.lastName || ''}`.trim();
}

function formatExportDate(value) {
  if (!value) return '';
  const key = getDateKeyInAppTz(value);
  if (!key) return '';
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y}`;
}

/** Move overdue Pending tasks to Backlog (deadline before today). Same-day stays Pending. */
async function promoteOverduePendingToBacklog() {
  const todayStart = startOfDay(new Date());
  await EmployeeTask.updateMany(
    {
      status: 'Pending',
      dueDate: { $lt: todayStart },
    },
    { $set: { status: 'Backlog' } }
  );
  // Undo incorrect backlog for deadlines on/after today (timezone / earlier bug)
  await EmployeeTask.updateMany(
    {
      status: 'Backlog',
      dueDate: { $gte: todayStart },
    },
    { $set: { status: 'Pending' } }
  );
}

function buildActiveTodayQuery(todayStart, todayEnd) {
  return {
    status: { $nin: ['Completed', 'Cancelled', 'On Hold'] },
    $or: [
      // Carry forward overdue work at the top of "today"
      { status: 'Backlog' },
      { dueDate: { $gte: todayStart, $lte: todayEnd } },
      { startDate: { $lte: todayEnd }, dueDate: { $gte: todayStart } },
    ],
  };
}

function sortTodayTasks(tasks = []) {
  const statusOrder = {
    Backlog: 0,
    Pending: 1,
    'In Progress': 2,
    'On Hold': 3,
    Completed: 4,
    Cancelled: 5,
  };
  return [...tasks].sort((a, b) => {
    const aRank = statusOrder[a.status] ?? 50;
    const bRank = statusOrder[b.status] ?? 50;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
  });
}

function buildTimelineOverlapQuery(fromDate, toDate) {
  const rangeStart = startOfDay(fromDate);
  const rangeEnd = endOfDay(toDate);
  return {
    startDate: { $lte: rangeEnd },
    dueDate: { $gte: rangeStart },
  };
}

function buildTaskListQuery(req, scope) {
  const { status, source, fromDate, toDate } = req.query;
  const query = {};
  if (status) query.status = status;
  if (source) query.source = source;
  if (fromDate && toDate) {
    Object.assign(query, buildTimelineOverlapQuery(fromDate, toDate));
  }
  if (wantsSelfService(req)) {
    applySelfEmployeeScope(query, scope);
  } else {
    applyEmployeeScope(query, scope, req.query.employee);
  }
  return query;
}

function sortTasksByStatusThenDate(list = []) {
  const statusOrder = {
    Backlog: 0,
    Pending: 1,
    'In Progress': 2,
    'On Hold': 3,
    Completed: 4,
    Cancelled: 5,
  };
  return [...list].sort((a, b) => {
    const aRank = statusOrder[a.status] ?? 50;
    const bRank = statusOrder[b.status] ?? 50;
    if (aRank !== bRank) return aRank - bRank;
    return new Date(a.dueDate || 0) - new Date(b.dueDate || 0);
  });
}

router.get('/today', async (req, res) => {
  try {
    await promoteOverduePendingToBacklog();
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll && !scope.employeeId) {
      return res.json([]);
    }
    if (wantsSelfService(req) && !scope.employeeId) {
      return res.json([]);
    }

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const query = buildActiveTodayQuery(todayStart, todayEnd);
    if (wantsSelfService(req)) {
      applySelfEmployeeScope(query, scope);
    } else {
      applyEmployeeScope(query, scope, req.query.employee);
    }

    const tasks = await EmployeeTask.find(query)
      .populate(EMPLOYEE_POPULATE)
      .sort({ dueDate: 1, priority: -1, createdAt: 1 })
      .lean();
    res.json(sortTodayTasks(tasks));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    await promoteOverduePendingToBacklog();
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll && !scope.employeeId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const query = buildTaskListQuery(req, scope);
    const tasks = sortTasksByStatusThenDate(
      await EmployeeTask.find(query)
        .populate(EMPLOYEE_POPULATE)
        .sort({ startDate: 1, dueDate: 1, priority: -1 })
        .lean()
    );

    const rows = tasks.map((task) => ({
      issueDate: formatExportDate(task.startDate),
      deadline: formatExportDate(task.dueDate),
      employeeId: task.employee?.employeeId || '',
      employee: employeeDisplayName(task.employee),
      department: task.employee?.department || '',
      task: task.title || '',
      description: task.description || '',
      priority: task.priority || '',
      status: task.status || '',
      source: task.source || '',
      assignedBy: task.assignedBy || '',
      notes: task.delayReason || '',
      completedAt: formatExportDate(task.completedAt),
    }));

    const headers = [
      { key: 'issueDate', label: 'Date of Issue' },
      { key: 'deadline', label: 'Deadline' },
      { key: 'employeeId', label: 'Employee ID' },
      { key: 'employee', label: 'Employee' },
      { key: 'department', label: 'Department' },
      { key: 'task', label: 'Task' },
      { key: 'description', label: 'Description' },
      { key: 'priority', label: 'Priority' },
      { key: 'status', label: 'Status' },
      { key: 'source', label: 'Source' },
      { key: 'assignedBy', label: 'Assigned By' },
      { key: 'notes', label: 'Task Notes' },
      { key: 'completedAt', label: 'Completed At' },
    ];

    const buffer = exportToExcel(rows, headers);
    const stamp = getDateKeyInAppTz(new Date());
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=hr_tasks_${stamp}.xlsx`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    await promoteOverduePendingToBacklog();
    const scope = await resolveAttendanceScope(req);
    const { page, limit } = req.query;
    const query = buildTaskListQuery(req, scope);

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
      result.data = sortTasksByStatusThenDate(result.data);
      return res.json(result);
    }

    const tasks = await EmployeeTask.find(query)
      .populate(EMPLOYEE_POPULATE)
      .sort(sort);
    res.json(sortTasksByStatusThenDate(tasks));
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
      (!requestedEmployee && !scope.canManageAll);

    // Personal / self task from Employee Dashboard
    if (wantsPersonal) {
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

    // HR-assigned task (may include assigning to self)
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'You can only create personal tasks for yourself' });
    }
    if (!requestedEmployee) {
      return res.status(400).json({ error: 'Employee is required' });
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
      // Any employee can add/update task update notes on their own tasks (HR or personal).
      if (req.body.delayReason != null) {
        task.delayReason = String(req.body.delayReason).trim().slice(0, 2000);
        task.delayReasonUpdatedAt = new Date();
      }

      if (task.source !== 'Personal') {
        // For HR-assigned tasks, employees may only update task notes (and status via PATCH).
        if (req.body.delayReason == null) {
          return res.status(403).json({ error: 'You can only edit your personal tasks' });
        }
        await task.save();
        await task.populate(EMPLOYEE_POPULATE);
        return res.json(task);
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
      if (req.body.delayReason != null) {
        task.delayReason = String(req.body.delayReason).trim().slice(0, 2000);
        task.delayReasonUpdatedAt = new Date();
      }
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
    if (!TASK_STATUSES.includes(status)) {
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
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Employees cannot delete tasks. Contact HR if a task should be removed.' });
    }

    const task = await EmployeeTask.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await EmployeeTask.findByIdAndDelete(req.params.id);
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
