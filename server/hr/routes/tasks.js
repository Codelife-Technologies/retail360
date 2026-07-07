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

router.get('/today', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll && !scope.employeeId) {
      return res.json([]);
    }

    const todayStart = startOfDay(new Date());
    const todayEnd = endOfDay(new Date());
    const query = {
      dueDate: { $gte: todayStart, $lte: todayEnd },
      status: { $ne: 'Completed' },
    };
    applyEmployeeScope(query, scope, req.query.employee);

    const tasks = await EmployeeTask.find(query)
      .sort({ priority: -1, createdAt: 1 })
      .lean();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const { status, page, limit } = req.query;
    const query = {};
    if (status) query.status = status;
    applyEmployeeScope(query, scope, req.query.employee);

    if (!scope.canManageAll && !scope.employeeId) {
      if (page || limit) {
        return res.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
      }
      return res.json([]);
    }

    const sort = { dueDate: 1, priority: -1 };
    if (page || limit) {
      const result = await paginate(EmployeeTask, query, { page, limit, sort });
      return res.json(result);
    }

    const tasks = await EmployeeTask.find(query).sort(sort);
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Only HR or admin can assign tasks' });
    }

    const employee = await Employee.findById(req.body.employee);
    if (!employee) {
      return res.status(400).json({ error: 'Employee not found' });
    }

    const task = new EmployeeTask({
      employee: req.body.employee,
      title: req.body.title,
      description: req.body.description || '',
      dueDate: startOfDay(req.body.dueDate || new Date()),
      priority: req.body.priority || 'Medium',
      assignedBy: req.body.assignedBy || 'HR',
      status: 'Pending',
    });
    await task.save();
    res.status(201).json(task);
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
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Only HR or admin can delete tasks' });
    }

    const task = await EmployeeTask.findByIdAndDelete(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
