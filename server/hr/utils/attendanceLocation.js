const OfficeLocation = require('../models/OfficeLocation');
const Employee = require('../models/Employee');
const { haversineDistanceMeters, isValidCoordinate } = require('./geoDistance');

async function countActiveOffices() {
  return OfficeLocation.countDocuments({ isActive: true });
}

async function resolveOfficeForEmployee(employeeId) {
  if (!employeeId) return null;

  const employee = await Employee.findById(employeeId)
    .select('department officeLocation')
    .lean();
  if (!employee) return null;

  if (employee.officeLocation) {
    const direct = await OfficeLocation.findOne({
      _id: employee.officeLocation,
      isActive: true,
    }).lean();
    if (direct) return direct;
  }

  const byEmployee = await OfficeLocation.findOne({
    isActive: true,
    assignedEmployees: employeeId,
  }).lean();
  if (byEmployee) return byEmployee;

  if (employee.department) {
    const dept = String(employee.department).trim();
    const byDept = await OfficeLocation.findOne({
      isActive: true,
      assignedDepartments: {
        $elemMatch: { $regex: `^${escapeRegex(dept)}$`, $options: 'i' },
      },
    }).lean();
    if (byDept) return byDept;
  }

  const defaultOffice = await OfficeLocation.findOne({ isActive: true, isDefault: true }).lean();
  if (defaultOffice) return defaultOffice;

  // Single active office → apply to everyone (common HR setup).
  const activeOffices = await OfficeLocation.find({ isActive: true }).limit(2).lean();
  if (activeOffices.length === 1) return activeOffices[0];

  return null;
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Validate GPS payload for office attendance.
 * Returns { ok, error, office, distanceMeters, locationPayload }.
 */
async function validateAttendanceLocation({
  employeeId,
  latitude,
  longitude,
  requireLocation = true,
  deviceInfo = '',
  browserInfo = '',
}) {
  const activeCount = await countActiveOffices();
  if (activeCount === 0) {
    // No offices configured yet — keep legacy attendance flow working.
    return { ok: true, office: null, distanceMeters: null, locationPayload: null, skipped: true };
  }

  const office = await resolveOfficeForEmployee(employeeId);

  if (!office) {
    if (!requireLocation) {
      return { ok: true, office: null, distanceMeters: null, locationPayload: null };
    }
    return {
      ok: false,
      error: 'No office location is assigned. Ask HR to configure Location Settings.',
      code: 'NO_OFFICE',
    };
  }

  if (latitude == null || longitude == null || latitude === '' || longitude === '') {
    if (!requireLocation) {
      return {
        ok: true,
        office,
        distanceMeters: null,
        locationPayload: null,
        outsideRadius: false,
        locationUnavailable: true,
      };
    }
    return {
      ok: false,
      error: 'Location permission is required to mark office attendance. Please enable GPS and try again.',
      code: 'LOCATION_DENIED',
      office,
    };
  }

  if (!isValidCoordinate(latitude, longitude)) {
    return {
      ok: false,
      error: 'GPS location is unavailable or invalid. Please enable location services and try again.',
      code: 'LOCATION_UNAVAILABLE',
      office,
    };
  }

  const distanceMeters = haversineDistanceMeters(
    latitude,
    longitude,
    office.latitude,
    office.longitude
  );

  if (distanceMeters > office.radiusMeters) {
    // Outside radius — allow mark, but flag so callers can auto-assign Work From Home
    return {
      ok: true,
      outsideRadius: true,
      office,
      distanceMeters,
      allowedRadiusMeters: office.radiusMeters,
      currentDistanceMeters: distanceMeters,
      locationPayload: {
        latitude: Number(latitude),
        longitude: Number(longitude),
        distanceMeters,
        officeName: office.name,
        officeLocation: office._id,
        capturedAt: new Date(),
        deviceInfo: String(deviceInfo || '').slice(0, 500),
        browserInfo: String(browserInfo || '').slice(0, 500),
      },
    };
  }

  return {
    ok: true,
    outsideRadius: false,
    office,
    distanceMeters,
    locationPayload: {
      latitude: Number(latitude),
      longitude: Number(longitude),
      distanceMeters,
      officeName: office.name,
      officeLocation: office._id,
      capturedAt: new Date(),
      deviceInfo: String(deviceInfo || '').slice(0, 500),
      browserInfo: String(browserInfo || '').slice(0, 500),
    },
  };
}

module.exports = {
  countActiveOffices,
  resolveOfficeForEmployee,
  validateAttendanceLocation,
};
