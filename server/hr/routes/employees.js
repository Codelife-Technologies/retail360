const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const { paginate } = require('../../utils/pagination');
const { requirePermission } = require('../../middleware/auth');
const { generateNextEmployeeId } = require('../utils/employeeId');
const { mergeDepartments } = require('../utils/departments');
const Department = require('../models/Department');
const { seedIfEmpty } = require('../utils/hrMasterSeed');
const { syncPendingPayrollsForEmployee } = require('../utils/payrollSync');
const {
  ensureUserForEmployee,
  deactivateUserForEmployee,
  syncAllEmployeeUsers,
} = require('../../utils/employeeUserSync');

function buildSearchQuery(search) {
  if (!search?.trim()) return {};
  const term = search.trim();
  return {
    $or: [
      { employeeId: { $regex: term, $options: 'i' } },
      { firstName: { $regex: term, $options: 'i' } },
      { lastName: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { department: { $regex: term, $options: 'i' } },
      { designation: { $regex: term, $options: 'i' } },
    ],
  };
}

function buildSort(sortBy, sortOrder) {
  const allowed = ['employeeId', 'firstName', 'department', 'designation', 'joiningDate', 'status', 'createdAt'];
  const field = allowed.includes(sortBy) ? sortBy : 'createdAt';
  const dir = sortOrder === 'asc' ? 1 : -1;
  return { [field]: dir };
}

router.get('/', async (req, res) => {
  try {
    const { search, department, status, employmentType, page, limit, sortBy, sortOrder } = req.query;
    const query = { ...buildSearchQuery(search) };
    if (department) query.department = department;
    if (status) query.status = status;
    if (employmentType) query.employmentType = employmentType;

    if (page || limit) {
      const result = await paginate(Employee, query, {
        page,
        limit,
        sort: buildSort(sortBy, sortOrder),
      });
      return res.json(result);
    }

    const employees = await Employee.find(query).sort(buildSort(sortBy, sortOrder));
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/departments/list', async (req, res) => {
  try {
    await seedIfEmpty();
    const masterRows = await Department.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
    if (masterRows.length > 0) {
      const fromEmployees = await Employee.distinct('department');
      return res.json(mergeDepartments([
        ...masterRows.map((row) => row.name),
        ...fromEmployees,
      ]));
    }
    const departments = await Employee.distinct('department');
    res.json(mergeDepartments(departments));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/sync-users', async (req, res) => {
  try {
    const result = await syncAllEmployeeUsers();
    res.json({
      message: 'Employee user accounts synced',
      ...result,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const payload = { ...req.body };
    if (!payload.employeeId?.trim()) {
      payload.employeeId = await generateNextEmployeeId();
    } else {
      payload.employeeId = payload.employeeId.trim().toUpperCase();
    }
    const employee = new Employee(payload);
    await employee.save();
    const userSync = await ensureUserForEmployee(employee);
    const response = employee.toObject();
    if (!userSync.skipped) {
      response.userAccount = {
        username: userSync.user.username,
        email: userSync.user.email,
        created: userSync.created,
        defaultPassword: userSync.defaultPassword,
      };
    } else if (userSync.reason) {
      response.userAccount = { error: userSync.reason };
    }
    res.status(201).json(response);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const payload = { ...req.body };
    if (payload.employeeId) payload.employeeId = payload.employeeId.trim().toUpperCase();
    const employee = await Employee.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    await syncPendingPayrollsForEmployee(employee._id, employee.basicSalary);
    const userSync = await ensureUserForEmployee(employee);
    const response = employee.toObject();
    if (!userSync.skipped) {
      response.userAccount = {
        username: userSync.user.username,
        email: userSync.user.email,
        created: userSync.created,
        isActive: userSync.user.isActive,
      };
    } else if (userSync.reason) {
      response.userAccount = { error: userSync.reason };
    }
    res.json(response);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', requirePermission('admin.all'), async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    await deactivateUserForEmployee(employee);
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
