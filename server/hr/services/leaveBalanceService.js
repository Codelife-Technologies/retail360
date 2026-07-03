const Leave = require('../models/Leave');
const Employee = require('../models/Employee');
const {
  LEAVE_POLICIES,
  LEAVE_TYPE_ALIASES,
  normalizeLeaveType,
  getPolicy,
  daysToQuotaUnits,
  getAnnualQuotaInDays,
  getApplicablePolicyKeys,
} = require('../utils/leavePolicies');
function yearBounds(year) {
  const y = year || new Date().getFullYear();
  return {
    start: new Date(y, 0, 1),
    end: new Date(y, 11, 31, 23, 59, 59, 999),
  };
}

function leaveTypesForPolicy(policyKey) {
  const aliases = Object.entries(LEAVE_TYPE_ALIASES)
    .filter(([, target]) => target === policyKey)
    .map(([source]) => source);
  return [policyKey, ...aliases];
}

async function sumLeaveDays(employeeId, leaveType, year, { statuses, excludeLeaveId } = {}) {
  const policyKey = normalizeLeaveType(leaveType);
  const { start, end } = yearBounds(year);
  const query = {
    employee: employeeId,
    leaveType: { $in: leaveTypesForPolicy(policyKey) },
    status: { $in: statuses || ['Approved', 'Pending'] },
    fromDate: { $gte: start, $lte: end },
  };
  if (excludeLeaveId) {
    query._id = { $ne: excludeLeaveId };
  }
  const rows = await Leave.find(query).select('days leaveType').lean();
  return rows.reduce((sum, row) => sum + (Number(row.days) || 0), 0);
}

async function getLeaveBalanceForType(employeeId, leaveType, year, excludeLeaveId) {
  const policyKey = normalizeLeaveType(leaveType);
  const policy = getPolicy(policyKey);
  if (!policy) {
    return {
      leaveType: policyKey,
      label: policyKey,
      allocated: 0,
      used: 0,
      pending: 0,
      remaining: 0,
      unlimited: false,
      unit: 'days',
    };
  }

  const usedApproved = await sumLeaveDays(employeeId, policyKey, year, {
    statuses: ['Approved'],
    excludeLeaveId,
  });
  const usedPending = await sumLeaveDays(employeeId, policyKey, year, {
    statuses: ['Pending'],
    excludeLeaveId,
  });

  if (policy.unlimited) {
    return {
      leaveType: policyKey,
      label: policy.label,
      allocated: null,
      used: usedApproved,
      pending: usedPending,
      remaining: null,
      unlimited: true,
      unit: policy.unit,
      requiresApproval: policy.requiresApproval || false,
    };
  }

  const quotaDays = getAnnualQuotaInDays(policyKey);
  const totalUsed = usedApproved + usedPending;
  const remaining = Math.max(quotaDays - totalUsed, 0);

  return {
    leaveType: policyKey,
    label: policy.label,
    allocated: quotaDays,
    allocatedDisplay: policy.unit === 'weeks' ? policy.annualQuota : policy.annualQuota,
    used: usedApproved,
    pending: usedPending,
    remaining,
    unlimited: false,
    unit: policy.unit,
  };
}

async function getEmployeeLeaveBalances(employeeId, year) {
  const employee = await Employee.findById(employeeId).select('personalInfo.gender').lean();
  const gender = employee?.personalInfo?.gender || '';
  const balances = [];
  for (const policyKey of getApplicablePolicyKeys(gender)) {
    balances.push(await getLeaveBalanceForType(employeeId, policyKey, year));
  }
  return balances;
}
async function validateLeaveBalance(employeeId, leaveType, days, year, excludeLeaveId) {
  const policyKey = normalizeLeaveType(leaveType);
  const policy = getPolicy(policyKey);
  if (!policy) {
    throw new Error(`Unknown leave type: ${leaveType}`);
  }
  if (policy.unlimited) {
    return { ok: true, remaining: null };
  }

  const balance = await getLeaveBalanceForType(employeeId, policyKey, year, excludeLeaveId);
  const requestedDays = Number(days) || 0;
  if (requestedDays <= balance.remaining) {
    return { ok: true, remaining: balance.remaining - requestedDays };
  }

  const unitLabel = policy.unit === 'weeks' ? 'weeks' : 'days';
  const allocatedLabel =
    policy.unit === 'weeks'
      ? `${policy.annualQuota} weeks (${policy.annualQuota * 7} days)`
      : `${policy.annualQuota} days`;

  throw new Error(
    `Insufficient ${policy.label} balance. Allocated: ${allocatedLabel}, ` +
      `Used: ${balance.used} days, Pending: ${balance.pending} days, ` +
      `Remaining: ${balance.remaining} days, Requested: ${requestedDays} days`
  );
}

module.exports = {
  getEmployeeLeaveBalances,
  getLeaveBalanceForType,
  validateLeaveBalance,
  sumLeaveDays,
};
