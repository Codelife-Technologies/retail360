/** Client-side leave policy definitions (mirrors server/hr/utils/leavePolicies.js). */
export const LEAVE_POLICIES = {
  'Casual Leave': { label: 'Casual Leave', annualQuota: 7, unit: 'days', unlimited: false },
  'Sick Leave': { label: 'Sick Leave', annualQuota: 7, unit: 'days', unlimited: false },
  'Earned Leave': { label: 'Earned Leave', annualQuota: 18, unit: 'days', unlimited: false },
  'Leave Without Pay': {
    label: 'Leave Without Pay',
    annualQuota: null,
    unit: 'days',
    unlimited: true,
    requiresApproval: true,
  },
  'Public Holiday': { label: 'Public Holiday', annualQuota: 12, unit: 'days', unlimited: false },
  'Maternity Leave': {
    label: 'Maternity Leave',
    annualQuota: 26,
    unit: 'weeks',
    unlimited: false,
    femaleOnly: true,
  },
};

export const LEAVE_TYPES = Object.keys(LEAVE_POLICIES);

export function isMaternityLeaveEligible(gender) {
  return String(gender || '').trim() === 'Female';
}

export function getLeaveTypesForEmployee(employee) {
  const gender = employee?.personalInfo?.gender || '';
  return LEAVE_TYPES.filter((type) => {
    const policy = LEAVE_POLICIES[type];
    if (policy?.femaleOnly || type === 'Maternity Leave') {
      return isMaternityLeaveEligible(gender);
    }
    return true;
  });
}

export const MATERNITY_LEAVE_TYPE = 'Maternity Leave';

function formatInputDate(date) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getMaternityLeaveDays(remainingDays) {
  const fullDays = LEAVE_POLICIES[MATERNITY_LEAVE_TYPE].annualQuota * 7;
  if (remainingDays != null && remainingDays > 0) {
    return Math.min(remainingDays, fullDays);
  }
  return fullDays;
}

/** Build default from/to dates and day count for maternity leave (26 weeks). */
export function buildMaternityLeavePeriod(startDate = new Date(), remainingDays) {
  const days = getMaternityLeaveDays(remainingDays);
  const from = new Date(startDate);
  if (Number.isNaN(from.getTime())) {
    from.setTime(Date.now());
  }
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days - 1);

  return {
    fromDate: formatInputDate(from),
    toDate: formatInputDate(to),
    days,
  };
}

export function isMaternityLeaveType(leaveType) {
  return leaveType === MATERNITY_LEAVE_TYPE;
}

export function formatLeaveQuota(policy) {
  if (!policy) return '—';
  if (policy.unlimited) return 'Unlimited (with approval)';
  if (policy.unit === 'weeks') return `${policy.annualQuota} weeks`;
  return `${policy.annualQuota} days`;
}

export function formatLeaveRemaining(balance) {
  if (!balance) return '—';
  if (balance.unlimited) return 'Unlimited';
  if (balance.unit === 'weeks') {
    const weeksLeft = (balance.remaining / 7).toFixed(1);
    return `${weeksLeft} weeks (${balance.remaining} days)`;
  }
  return `${balance.remaining} days`;
}
