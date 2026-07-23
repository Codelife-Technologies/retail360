const express = require('express');
const router = express.Router();
const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const { paginate } = require('../../utils/pagination');
const { calcLeaveDays, startOfDay } = require('../utils/employeeId');
const { LEAVE_POLICIES, isLeaveTypeAllowedForGender } = require('../utils/leavePolicies');
const {
  getEmployeeLeaveBalances,
  validateLeaveBalance,
} = require('../services/leaveBalanceService');
const { syncAttendanceForApprovedLeave } = require('../services/leaveAttendanceSync');

async function assertLeaveTypeAllowed(employeeId, leaveType) {
  const employee = await Employee.findById(employeeId).select('personalInfo.gender').lean();
  const gender = employee?.personalInfo?.gender || '';
  if (!isLeaveTypeAllowedForGender(leaveType, gender)) {
    throw new Error('Maternity Leave is only available for female employees');
  }
}

router.get('/policies', async (req, res) => {
  try {
    let gender = '';
    if (req.query.employee) {
      const employee = await Employee.findById(req.query.employee).select('personalInfo.gender').lean();
      gender = employee?.personalInfo?.gender || '';
    }
    const policies = Object.entries(LEAVE_POLICIES)
      .filter(([key]) => isLeaveTypeAllowedForGender(key, gender))
      .map(([key, policy]) => ({
        leaveType: key,
        ...policy,
        annualQuotaDays: policy.unit === 'weeks' ? policy.annualQuota * 7 : policy.annualQuota,
      }));
    res.json(policies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/balances', async (req, res) => {
  try {
    const employeeId = req.query.employee;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    if (!employeeId) {
      return res.status(400).json({ error: 'employee query parameter is required' });
    }
    const balances = await getEmployeeLeaveBalances(employeeId, year);
    res.json({ year, employee: employeeId, balances });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { search, employee, status, leaveType, page, limit, sortBy, sortOrder } = req.query;
    const query = {};
    if (employee) query.employee = employee;
    if (status) query.status = status;
    if (leaveType) query.leaveType = leaveType;

    const sortField = ['fromDate', 'status', 'createdAt'].includes(sortBy) ? sortBy : 'createdAt';
    const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };
    const populate = { path: 'employee', select: 'employeeId firstName lastName department designation' };

    if (page || limit) {
      const result = await paginate(Leave, query, { page, limit, sort, populate });
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

    let leaves = await Leave.find(query).populate(populate).sort(sort);
    if (search?.trim()) {
      const term = search.trim().toLowerCase();
      leaves = leaves.filter((row) => {
        const emp = row.employee;
        if (!emp) return false;
        const name = `${emp.firstName} ${emp.lastName}`.toLowerCase();
        return name.includes(term) || (emp.employeeId || '').toLowerCase().includes(term);
      });
    }
    res.json(leaves);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id).populate(
      'employee',
      'employeeId firstName lastName department designation email'
    );
    if (!leave) return res.status(404).json({ error: 'Leave application not found' });
    res.json(leave);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = {
      ...req.body,
      fromDate: startOfDay(req.body.fromDate),
      toDate: startOfDay(req.body.toDate),
    };
    if (!payload.days) {
      payload.days = calcLeaveDays(payload.fromDate, payload.toDate);
    }
    const year = payload.fromDate.getFullYear();
    await assertLeaveTypeAllowed(payload.employee, payload.leaveType);
    await validateLeaveBalance(payload.employee, payload.leaveType, payload.days, year);
    const leave = new Leave(payload);
    await leave.save();
    await leave.populate('employee', 'employeeId firstName lastName department');
    res.status(201).json(leave);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const existing = await Leave.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Leave application not found' });

    const payload = { ...req.body };
    if (payload.fromDate) payload.fromDate = startOfDay(payload.fromDate);
    if (payload.toDate) payload.toDate = startOfDay(payload.toDate);
    if (payload.fromDate && payload.toDate && !payload.days) {
      payload.days = calcLeaveDays(payload.fromDate, payload.toDate);
    }

    const employee = payload.employee || existing.employee;
    const leaveType = payload.leaveType || existing.leaveType;
    const days = payload.days ?? existing.days;
    const fromDate = payload.fromDate || existing.fromDate;
    const year = new Date(fromDate).getFullYear();
    const nextStatus = payload.status || existing.status;

    if (['Pending', 'Approved'].includes(nextStatus)) {
      await assertLeaveTypeAllowed(employee, leaveType);
      await validateLeaveBalance(employee, leaveType, days, year, existing._id);
    }

    const leave = await Leave.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    }).populate('employee', 'employeeId firstName lastName department');
    res.json(leave);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const existing = await Leave.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Leave application not found' });
    if (existing.status === 'Approved') {
      await existing.populate('employee', 'employeeId firstName lastName department');
      return res.json(existing);
    }

    const year = new Date(existing.fromDate).getFullYear();
    await assertLeaveTypeAllowed(existing.employee, existing.leaveType);
    await validateLeaveBalance(
      existing.employee,
      existing.leaveType,
      existing.days,
      year,
      existing._id
    );

    const leave = await Leave.findByIdAndUpdate(
      req.params.id,
      { status: 'Approved', reviewedAt: new Date(), reviewNotes: req.body.reviewNotes || '' },
      { new: true, runValidators: true }
    ).populate('employee', 'employeeId firstName lastName department');

    try {
      await syncAttendanceForApprovedLeave(leave);
    } catch (syncError) {
      console.error('Failed to sync leave attendance:', syncError.message);
    }

    res.json(leave);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const reviewNotes = String(req.body.reviewNotes || '').trim();
    if (!reviewNotes) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }
    const leave = await Leave.findByIdAndUpdate(
      req.params.id,
      { status: 'Rejected', reviewedAt: new Date(), reviewNotes },
      { new: true, runValidators: true }
    ).populate('employee', 'employeeId firstName lastName department');
    if (!leave) return res.status(404).json({ error: 'Leave application not found' });
    res.json(leave);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const leave = await Leave.findByIdAndUpdate(
      req.params.id,
      { status: 'Cancelled', reviewedAt: new Date(), reviewNotes: req.body.reviewNotes || '' },
      { new: true, runValidators: true }
    ).populate('employee', 'employeeId firstName lastName department');
    if (!leave) return res.status(404).json({ error: 'Leave application not found' });
    res.json(leave);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const leave = await Leave.findByIdAndDelete(req.params.id);
    if (!leave) return res.status(404).json({ error: 'Leave application not found' });
    res.json({ message: 'Leave application deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
