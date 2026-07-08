const User = require('../models/User');
const Employee = require('../hr/models/Employee');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function employeeDisplayName(employee) {
  return `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
}

async function findEmployeesByName(nameInput) {
  const normalized = normalizeName(nameInput);
  if (!normalized) return [];

  const employees = await Employee.find({
    status: { $in: ['Active', 'On Leave'] },
  })
    .select('_id firstName lastName email employeeId')
    .lean();

  return employees.filter((employee) => {
    const fullName = normalizeName(employeeDisplayName(employee));
    const firstName = normalizeName(employee.firstName);
    return fullName === normalized || firstName === normalized;
  });
}

async function findEmployeeForUser(user) {
  if (!user) return null;

  if (user.email) {
    const byEmail = await Employee.findOne({ email: user.email.toLowerCase() }).lean();
    if (byEmail) return byEmail;
  }

  const usernameNorm = normalizeName(user.username);
  if (!usernameNorm) return null;

  const matches = await findEmployeesByName(user.username);
  return matches.length === 1 ? matches[0] : null;
}

async function findUserForEmployee(employee) {
  if (!employee) return null;

  const selectFields = 'email username lastLoginAt lastLogoutAt attendanceSession';

  if (employee.email) {
    const byEmail = await User.findOne({ email: employee.email.toLowerCase() }).select(selectFields).lean();
    if (byEmail) return byEmail;
  }

  const fullName = employeeDisplayName(employee);
  const candidates = await User.find({
    $or: [
      { username: { $regex: new RegExp(`^${escapeRegex(employee.firstName || '')}$`, 'i') } },
      { username: { $regex: new RegExp(`^${escapeRegex(fullName)}$`, 'i') } },
      { username: { $regex: new RegExp(`^${escapeRegex(employee.employeeId || '')}$`, 'i') } },
    ],
  })
    .select(selectFields)
    .lean();

  if (candidates.length === 1) return candidates[0];
  return null;
}

async function getEmployeeIdForUser(userId) {
  const user = await User.findById(userId).select('email username').lean();
  if (!user) return null;
  const employee = await findEmployeeForUser(user);
  return employee?._id?.toString() || null;
}

async function findUserByLoginIdentifier(identifier) {
  const trimmed = String(identifier || '').trim();
  if (!trimmed) return null;

  const lowerEmail = trimmed.toLowerCase();

  let user = await User.findOne({
    $or: [
      { username: trimmed },
      { email: lowerEmail },
      { username: { $regex: new RegExp(`^${escapeRegex(trimmed)}$`, 'i') } },
    ],
  })
    .populate('roles', 'name code')
    .populate('groups', 'name code');

  if (user) return user;

  const employees = await findEmployeesByName(trimmed);
  if (employees.length !== 1) return null;

  return User.findOne({ email: employees[0].email.toLowerCase() })
    .populate('roles', 'name code')
    .populate('groups', 'name code');
}

module.exports = {
  normalizeName,
  employeeDisplayName,
  findEmployeesByName,
  findEmployeeForUser,
  findUserForEmployee,
  getEmployeeIdForUser,
  findUserByLoginIdentifier,
  escapeRegex,
};
