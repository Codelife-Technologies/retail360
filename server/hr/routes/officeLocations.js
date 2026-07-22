const express = require('express');
const router = express.Router();
const OfficeLocation = require('../models/OfficeLocation');
const Employee = require('../models/Employee');
const { paginate } = require('../../utils/pagination');
const { isValidCoordinate } = require('../utils/geoDistance');
const { resolveAttendanceScope } = require('../utils/attendanceAccess');
const { resolveOfficeForEmployee: resolveOffice } = require('../utils/attendanceLocation');

function normalizeDepartments(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((d) => String(d || '').trim()).filter(Boolean))];
}

function normalizeEmployeeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || '').trim()).filter(Boolean))];
}

function buildPayload(body) {
  const latitude = Number(body.latitude);
  const longitude = Number(body.longitude);
  const radiusMeters = Number(body.radiusMeters);

  if (!body.name || !String(body.name).trim()) {
    const err = new Error('Office name is required');
    err.status = 400;
    throw err;
  }
  if (!isValidCoordinate(latitude, longitude)) {
    const err = new Error('Valid latitude and longitude are required');
    err.status = 400;
    throw err;
  }
  if (!Number.isFinite(radiusMeters) || radiusMeters < 10 || radiusMeters > 50000) {
    const err = new Error('Allowed radius must be between 10 and 50,000 meters');
    err.status = 400;
    throw err;
  }

  return {
    name: String(body.name).trim(),
    latitude,
    longitude,
    radiusMeters,
    address: String(body.address || '').trim(),
    assignedDepartments: normalizeDepartments(body.assignedDepartments),
    assignedEmployees: normalizeEmployeeIds(body.assignedEmployees),
    isActive: body.isActive !== false && body.isActive !== 'false',
    isDefault: Boolean(body.isDefault === true || body.isDefault === 'true'),
    notes: String(body.notes || '').trim(),
  };
}

async function ensureSingleDefault(officeId, isDefault) {
  if (!isDefault) return;
  await OfficeLocation.updateMany(
    officeId ? { _id: { $ne: officeId }, isDefault: true } : { isDefault: true },
    { $set: { isDefault: false } }
  );
}

async function syncEmployeeOfficeLinks(office) {
  const linkedIds = new Set((office.assignedEmployees || []).map((id) => String(id)));

  // Also link active employees in assigned departments so direct officeLocation is set.
  const departments = (office.assignedDepartments || [])
    .map((d) => String(d || '').trim())
    .filter(Boolean);
  if (departments.length) {
    const deptRegexes = departments.map(
      (d) => new RegExp(`^${String(d).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    );
    const byDept = await Employee.find({
      status: 'Active',
      $or: deptRegexes.map((rx) => ({ department: rx })),
    })
      .select('_id')
      .lean();
    byDept.forEach((emp) => linkedIds.add(String(emp._id)));
  }

  const employeeIds = [...linkedIds];
  if (employeeIds.length) {
    await Employee.updateMany(
      { _id: { $in: employeeIds } },
      { $set: { officeLocation: office._id } }
    );
  }

  // Clear direct link for employees who were previously linked only via this office
  // but are no longer covered by assignment / department.
  // Default / single-office coverage is resolved at attendance time without forcing links.
  await Employee.updateMany(
    {
      officeLocation: office._id,
      _id: { $nin: employeeIds },
    },
    { $set: { officeLocation: null } }
  );
}

router.get('/my-office', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    const employeeId = req.query.employee && scope.canManageAll
      ? req.query.employee
      : scope.employeeId;

    if (!employeeId) {
      return res.status(403).json({ error: 'Employee profile not linked' });
    }

    const office = await resolveOffice(employeeId);
    res.json({
      office: office
        ? {
            _id: office._id,
            name: office.name,
            latitude: office.latitude,
            longitude: office.longitude,
            radiusMeters: office.radiusMeters,
            address: office.address || '',
          }
        : null,
      locationEnforcementEnabled: Boolean(office),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Only HR and Admin can manage office locations' });
    }

    const query = {};
    if (req.query.isActive === 'true') query.isActive = true;
    if (req.query.isActive === 'false') query.isActive = false;
    if (req.query.search) {
      query.name = { $regex: String(req.query.search).trim(), $options: 'i' };
    }

    const result = await paginate(OfficeLocation, query, {
      page: req.query.page,
      limit: req.query.limit || 50,
      sort: { isDefault: -1, name: 1 },
      populate: [
        { path: 'assignedEmployees', select: 'employeeId firstName lastName department' },
      ],
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Only HR and Admin can manage office locations' });
    }
    const office = await OfficeLocation.findById(req.params.id)
      .populate('assignedEmployees', 'employeeId firstName lastName department');
    if (!office) return res.status(404).json({ error: 'Office location not found' });
    res.json(office);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Only HR and Admin can manage office locations' });
    }

    const payload = buildPayload(req.body);
    await ensureSingleDefault(null, payload.isDefault);
    const office = await OfficeLocation.create(payload);
    await syncEmployeeOfficeLinks(office);
    await office.populate('assignedEmployees', 'employeeId firstName lastName department');
    res.status(201).json(office);
  } catch (error) {
    const status = error.status || (error.code === 11000 ? 400 : 500);
    res.status(status).json({
      error: error.code === 11000 ? 'An office with this name already exists' : error.message,
    });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Only HR and Admin can manage office locations' });
    }

    const existing = await OfficeLocation.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Office location not found' });

    const payload = buildPayload({ ...existing.toObject(), ...req.body });
    await ensureSingleDefault(existing._id, payload.isDefault);
    Object.assign(existing, payload);
    await existing.save();
    await syncEmployeeOfficeLinks(existing);
    await existing.populate('assignedEmployees', 'employeeId firstName lastName department');
    res.json(existing);
  } catch (error) {
    const status = error.status || (error.code === 11000 ? 400 : 500);
    res.status(status).json({
      error: error.code === 11000 ? 'An office with this name already exists' : error.message,
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const scope = await resolveAttendanceScope(req);
    if (!scope.canManageAll) {
      return res.status(403).json({ error: 'Only HR and Admin can manage office locations' });
    }

    const office = await OfficeLocation.findByIdAndDelete(req.params.id);
    if (!office) return res.status(404).json({ error: 'Office location not found' });

    await Employee.updateMany(
      { officeLocation: office._id },
      { $set: { officeLocation: null } }
    );

    res.json({ message: 'Office location deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
