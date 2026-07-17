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
    const byDept = await OfficeLocation.findOne({
      isActive: true,
      assignedDepartments: employee.department,
    }).lean();
    if (byDept) return byDept;
  }

  return OfficeLocation.findOne({ isActive: true, isDefault: true }).lean();
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
    return {
      ok: false,
      error: 'You are outside the allowed attendance area.',
      code: 'OUTSIDE_RADIUS',
      office,
      distanceMeters,
      allowedRadiusMeters: office.radiusMeters,
      currentDistanceMeters: distanceMeters,
    };
  }

  return {
    ok: true,
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
