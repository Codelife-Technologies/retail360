const express = require('express');
const router = express.Router();
const Payroll = require('../models/Payroll');
const Employee = require('../models/Employee');
const { paginate } = require('../../utils/pagination');
const { calcNetSalary, syncPendingPayrollsForQuery } = require('../utils/payrollSync');

router.get('/summary', async (req, res) => {
  try {
    const month = parseInt(req.query.month, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const match = { month, year };

    await syncPendingPayrollsForQuery(match);

    const [agg, paidCount, pendingCount] = await Promise.all([
      Payroll.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalPayroll: { $sum: '$netSalary' },
            processedSalary: {
              $sum: { $cond: [{ $in: ['$paymentStatus', ['Processed', 'Paid']] }, '$netSalary', 0] },
            },
            pendingSalary: {
              $sum: { $cond: [{ $eq: ['$paymentStatus', 'Pending'] }, '$netSalary', 0] },
            },
          },
        },
      ]),
      Payroll.countDocuments({ ...match, paymentStatus: 'Paid' }),
      Payroll.countDocuments({ ...match, paymentStatus: 'Pending' }),
    ]);

    const summary = agg[0] || { totalPayroll: 0, processedSalary: 0, pendingSalary: 0 };
    res.json({
      totalPayroll: summary.totalPayroll,
      processedSalary: summary.processedSalary,
      pendingSalary: summary.pendingSalary,
      employeesPaid: paidCount,
      pendingCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const { search, employee, month, year, paymentStatus, page, limit, sortBy, sortOrder } = req.query;
    const query = {};
    if (employee) query.employee = employee;
    if (month) query.month = parseInt(month, 10);
    if (year) query.year = parseInt(year, 10);
    if (paymentStatus) query.paymentStatus = paymentStatus;

    // Keep pending payroll in sync with employee master basic salary
    await syncPendingPayrollsForQuery(query);

    const sortField = ['netSalary', 'paymentStatus', 'createdAt'].includes(sortBy) ? sortBy : 'createdAt';
    const sort = { [sortField]: sortOrder === 'asc' ? 1 : -1 };
    const populate = { path: 'employee', select: 'employeeId firstName lastName department designation' };

    if (page || limit) {
      const result = await paginate(Payroll, query, { page, limit, sort, populate });
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

    let records = await Payroll.find(query).populate(populate).sort(sort);
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
    const record = await Payroll.findById(req.params.id).populate(
      'employee',
      'employeeId firstName lastName department designation email bankDetails basicSalary'
    );
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const month = parseInt(req.body.month, 10) || new Date().getMonth() + 1;
    const year = parseInt(req.body.year, 10) || new Date().getFullYear();
    const defaultAllowances = parseFloat(req.body.allowances) || 0;
    const defaultDeductions = parseFloat(req.body.deductions) || 0;

    const employees = await Employee.find({ status: 'Active' });
    const created = [];

    for (const emp of employees) {
      const basic = Number(emp.basicSalary) || 0;
      const existing = await Payroll.findOne({ employee: emp._id, month, year });

      if (existing?.paymentStatus === 'Paid') {
        continue;
      }

      const allowances = existing ? existing.allowances : defaultAllowances;
      const deductions = existing ? existing.deductions : defaultDeductions;
      const netSalary = calcNetSalary(basic, allowances, deductions);

      const record = await Payroll.findOneAndUpdate(
        { employee: emp._id, month, year },
        {
          employee: emp._id,
          month,
          year,
          basicSalary: basic,
          allowances,
          deductions,
          netSalary,
          ...(existing ? {} : { paymentStatus: 'Pending' }),
        },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
      );
      created.push(record);
    }

    res.status(201).json({ message: `Generated payroll for ${created.length} employees`, count: created.length });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.basicSalary != null || payload.allowances != null || payload.deductions != null) {
      const existing = await Payroll.findById(req.params.id);
      if (!existing) return res.status(404).json({ error: 'Payroll record not found' });
      const basic = payload.basicSalary ?? existing.basicSalary;
      const allowances = payload.allowances ?? existing.allowances;
      const deductions = payload.deductions ?? existing.deductions;
      payload.netSalary = calcNetSalary(basic, allowances, deductions);
    }
    if (payload.paymentStatus === 'Paid' && !payload.paidAt) {
      payload.paidAt = new Date();
    }
    const record = await Payroll.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    }).populate('employee', 'employeeId firstName lastName department');
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });
    res.json(record);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const record = await Payroll.findByIdAndDelete(req.params.id);
    if (!record) return res.status(404).json({ error: 'Payroll record not found' });
    res.json({ message: 'Payroll record deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
