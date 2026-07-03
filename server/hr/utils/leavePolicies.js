/** Annual leave quotas per leave type. */
const LEAVE_POLICIES = {
  'Casual Leave': {
    label: 'Casual Leave',
    annualQuota: 7,
    unit: 'days',
    unlimited: false,
  },
  'Sick Leave': {
    label: 'Sick Leave',
    annualQuota: 7,
    unit: 'days',
    unlimited: false,
  },
  'Earned Leave': {
    label: 'Earned Leave',
    annualQuota: 18,
    unit: 'days',
    unlimited: false,
  },
  'Leave Without Pay': {
    label: 'Leave Without Pay',
    annualQuota: null,
    unit: 'days',
    unlimited: true,
    requiresApproval: true,
  },
  'Public Holiday': {
    label: 'Public Holiday',
    annualQuota: 12,
    unit: 'days',
    unlimited: false,
  },
  'Maternity Leave': {
    label: 'Maternity Leave',
    annualQuota: 26,
    unit: 'weeks',
    unlimited: false,
    femaleOnly: true,
  },
};

/** Legacy type names mapped to current policy keys. */
const LEAVE_TYPE_ALIASES = {
  'Paid Leave': 'Earned Leave',
  'Unpaid Leave': 'Leave Without Pay',
};

const LEAVE_TYPE_ENUM = [
  ...Object.keys(LEAVE_POLICIES),
  'Paid Leave',
  'Unpaid Leave',
];

function normalizeLeaveType(leaveType) {
  return LEAVE_TYPE_ALIASES[leaveType] || leaveType;
}

function getPolicy(leaveType) {
  return LEAVE_POLICIES[normalizeLeaveType(leaveType)] || null;
}

/** Convert requested days to quota units (maternity uses weeks). */
function daysToQuotaUnits(leaveType, days) {
  const policy = getPolicy(leaveType);
  if (!policy) return days;
  if (policy.unit === 'weeks') {
    return days / 7;
  }
  return days;
}

function quotaToDisplayAmount(leaveType, quota) {
  const policy = getPolicy(leaveType);
  if (!policy) return quota;
  if (policy.unit === 'weeks') {
    return `${quota} weeks`;
  }
  return `${quota} days`;
}

function getAnnualQuotaInDays(leaveType) {
  const policy = getPolicy(leaveType);
  if (!policy || policy.unlimited) return null;
  if (policy.unit === 'weeks') {
    return policy.annualQuota * 7;
  }
  return policy.annualQuota;
}

const MATERNITY_LEAVE_TYPE = 'Maternity Leave';

function isMaternityLeaveEligible(gender) {
  return String(gender || '').trim() === 'Female';
}

function isLeaveTypeAllowedForGender(leaveType, gender) {
  const policyKey = normalizeLeaveType(leaveType);
  const policy = getPolicy(policyKey);
  if (!policy) return false;
  if (policy.femaleOnly || policyKey === MATERNITY_LEAVE_TYPE) {
    return isMaternityLeaveEligible(gender);
  }
  return true;
}

function getApplicablePolicyKeys(gender) {
  return Object.keys(LEAVE_POLICIES).filter((key) => isLeaveTypeAllowedForGender(key, gender));
}

module.exports = {
  LEAVE_POLICIES,
  LEAVE_TYPE_ALIASES,
  LEAVE_TYPE_ENUM,
  MATERNITY_LEAVE_TYPE,
  normalizeLeaveType,
  getPolicy,
  daysToQuotaUnits,
  quotaToDisplayAmount,
  getAnnualQuotaInDays,
  isMaternityLeaveEligible,
  isLeaveTypeAllowedForGender,
  getApplicablePolicyKeys,
};
