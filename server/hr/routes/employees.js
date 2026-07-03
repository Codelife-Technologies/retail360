const express = require('express');
const router = express.Router();
const Employee = require('../models/Employee');
const { paginate } = require('../../utils/pagination');
const { generateNextEmployeeId } = require('../utils/employeeId');
const { mergeDepartments } = require('../utils/departments');
const { syncPendingPayrollsForEmployee } = require('../utils/payrollSync');

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
    const departments = await Employee.distinct('department');
    res.json(mergeDepartments(departments));
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
    res.status(201).json(employee);
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
    res.json(employee);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (!employee) return res.status(404).json({ error: 'Employee not found' });
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
