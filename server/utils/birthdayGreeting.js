const Employee = require('../hr/models/Employee');
const User = require('../models/User');
const { findEmployeeForUser, employeeDisplayName } = require('./userEmployeeLink');
const { getZonedParts, getDateKeyInAppTz } = require('./appTimezone');

/**
 * Date-of-birth from HR is usually a calendar date (date input → UTC midnight).
 * Compare month/day in UTC for the stored DOB against today's month/day in app TZ.
 */
function isBirthdayToday(dateOfBirth, now = new Date()) {
  if (!dateOfBirth) return false;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return false;

  const today = getZonedParts(now);
  if (!today) return false;

  return dob.getUTCMonth() + 1 === today.month && dob.getUTCDate() === today.day;
}

function buildGreeting(employee, user) {
  const name = employeeDisplayName(employee) || user?.username || 'there';
  return {
    isToday: true,
    name,
    employeeId: employee.employeeId || null,
    dateKey: getDateKeyInAppTz(new Date()),
  };
}

async function getBirthdayGreetingForUser(user) {
  if (!user) return null;

  let employee = await findEmployeeForUser(user);
  if (!employee) return null;

  // Ensure we have DOB even if a lean select was used elsewhere
  if (!employee.personalInfo?.dateOfBirth && employee._id) {
    employee = await Employee.findById(employee._id)
      .select('employeeId firstName lastName personalInfo.dateOfBirth')
      .lean();
  }

  if (!employee?.personalInfo?.dateOfBirth || !isBirthdayToday(employee.personalInfo.dateOfBirth)) {
    return null;
  }

  return buildGreeting(employee, user);
}

async function getBirthdayGreetingForUserId(userId) {
  const user = await User.findById(userId).select('email username').lean();
  if (!user) return null;
  return getBirthdayGreetingForUser(user);
}

module.exports = {
  isBirthdayToday,
  getBirthdayGreetingForUser,
  getBirthdayGreetingForUserId,
};
