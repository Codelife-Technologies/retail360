import { amountInWordsINR } from './amountInWords';

const EARNING_WEIGHTS = {
  houseRentAllowance: 0.35,
  dearnessAllowance: 0.12,
  specialAllowance: 0.22,
  medicalAllowance: 0.08,
  travelAllowance: 0.08,
  performanceBonus: 0.07,
  overtime: 0.04,
  otherAllowances: 0.04,
};

function round(value) {
  return Math.round(Number(value) || 0);
}

function allocatePool(total, weights) {
  const pool = Math.max(round(total), 0);
  if (pool === 0) {
    return Object.fromEntries(Object.keys(weights).map((key) => [key, 0]));
  }

  const keys = Object.keys(weights);
  const raw = keys.map((key) => ({ key, value: pool * weights[key] }));
  const floored = raw.map((item) => ({ ...item, value: Math.floor(item.value) }));
  let remainder = pool - floored.reduce((sum, item) => sum + item.value, 0);

  const ranked = [...floored].sort(
    (a, b) => raw.find((r) => r.key === b.key).value - b.value - (raw.find((r) => r.key === a.key).value - a.value)
  );

  for (let i = 0; remainder > 0; i += 1) {
    ranked[i % ranked.length].value += 1;
    remainder -= 1;
  }

  return Object.fromEntries(ranked.map((item) => [item.key, item.value]));
}

function splitDeductions(basicSalary, grossEarnings, totalDeductions) {
  const total = Math.max(round(totalDeductions), 0);
  if (total === 0) {
    return {
      providentFund: 0,
      employeeStateInsurance: 0,
      professionalTax: 0,
      incomeTax: 0,
      advanceRecovery: 0,
      loanRecovery: 0,
      leaveWithoutPayDeduction: 0,
      otherDeductions: 0,
    };
  }

  let remaining = total;
  const statutoryPf = Math.min(round(basicSalary * 0.12), remaining);
  remaining -= statutoryPf;

  const statutoryEsi =
    basicSalary <= 21000 ? Math.min(round(grossEarnings * 0.0075), remaining) : 0;
  remaining -= statutoryEsi;

  const professionalTax = Math.min(200, remaining);
  remaining -= professionalTax;

  const incomeTax = Math.min(Math.max(round(remaining * 0.55), 0), remaining);
  remaining -= incomeTax;

  const advanceRecovery = Math.min(Math.max(round(remaining * 0.35), 0), remaining);
  remaining -= advanceRecovery;

  const loanRecovery = Math.min(Math.max(round(remaining * 0.35), 0), remaining);
  remaining -= loanRecovery;

  const leaveWithoutPayDeduction = Math.min(Math.max(round(remaining * 0.5), 0), remaining);
  remaining -= leaveWithoutPayDeduction;

  return {
    providentFund: statutoryPf,
    employeeStateInsurance: statutoryEsi,
    professionalTax,
    incomeTax,
    advanceRecovery,
    loanRecovery,
    leaveWithoutPayDeduction,
    otherDeductions: remaining,
  };
}

export function maskAccountNumber(accountNumber) {
  const value = String(accountNumber || '').replace(/\s/g, '');
  if (!value) return '—';
  if (value.length <= 4) return `XXXX${value}`;
  return `${'X'.repeat(Math.max(value.length - 4, 4))}${value.slice(-4)}`;
}

export function computeEmployerContributions(basicSalary, grossEarnings) {
  const basic = Number(basicSalary) || 0;
  const gross = Number(grossEarnings) || 0;
  return {
    employerPf: round(basic * 0.12),
    employerEsi: basic <= 21000 ? round(gross * 0.0325) : 0,
    gratuity: round(basic * 0.0481),
  };
}

export function computeAttendanceSummary({ month, year, attendanceRecords = [], holidays = [], leaveRecords = [] }) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, daysInMonth, 23, 59, 59, 999);

  let weeklyOff = 0;
  for (let day = 1; day <= daysInMonth; day += 1) {
    if (new Date(year, month - 1, day).getDay() === 0) weeklyOff += 1;
  }

  const publicHolidays = holidays.filter((h) => {
    const d = new Date(h.date);
    return d.getDay() !== 0;
  }).length;

  const workingDays = daysInMonth - weeklyOff;

  let presentDays = 0;
  let overtimeHours = 0;
  attendanceRecords.forEach((record) => {
    if (record.status === 'Present' || record.status === 'Work From Home') presentDays += 1;
    else if (record.status === 'Half Day') presentDays += 0.5;
    else if (record.status === 'Holiday') presentDays += 1;
    overtimeHours += Math.max((Number(record.workingHours) || 0) - 8, 0);
  });

  const approvedLeaves = leaveRecords.filter((leave) => leave.status === 'Approved');
  const leaveInMonth = (leave) => {
    const from = new Date(leave.fromDate);
    const to = new Date(leave.toDate);
    return to >= monthStart && from <= monthEnd;
  };

  const sumLeaveDays = (type) =>
    approvedLeaves
      .filter((leave) => leave.leaveType === type && leaveInMonth(leave))
      .reduce((sum, leave) => sum + (Number(leave.days) || 0), 0);

  const casualLeave = sumLeaveDays('Casual Leave');
  const sickLeave = sumLeaveDays('Sick Leave');
  const earnedLeave = sumLeaveDays('Earned Leave');
  const leaveWithoutPay = sumLeaveDays('Leave Without Pay');

  const absentDays = attendanceRecords.filter((record) => record.status === 'Absent').length;
  const lopDays = leaveWithoutPay + absentDays;
  const paidDays = Math.max(presentDays + publicHolidays + casualLeave + sickLeave + earnedLeave - lopDays, 0);

  return {
    workingDays,
    presentDays: round(presentDays * 10) / 10,
    weeklyOff,
    publicHolidays,
    casualLeave,
    sickLeave,
    earnedLeave,
    leaveWithoutPay,
    overtimeHours: round(overtimeHours * 10) / 10,
    paidDays: round(Math.min(paidDays, workingDays) * 10) / 10,
    lopDays,
  };
}

export function buildPayslipBreakdown(payrollRecord, attendanceSummary = {}) {
  const basicSalary = round(payrollRecord.basicSalary);
  const totalAllowances = round(payrollRecord.allowances);
  const totalDeductions = round(payrollRecord.deductions);
  const netSalary = round(payrollRecord.netSalary);
  const allowanceParts = allocatePool(totalAllowances, EARNING_WEIGHTS);

  const earnings = {
    basicSalary,
    houseRentAllowance: allowanceParts.houseRentAllowance,
    dearnessAllowance: allowanceParts.dearnessAllowance,
    specialAllowance: allowanceParts.specialAllowance,
    medicalAllowance: allowanceParts.medicalAllowance,
    travelAllowance: allowanceParts.travelAllowance,
    performanceBonus: allowanceParts.performanceBonus,
    overtime: allowanceParts.overtime,
    otherAllowances: allowanceParts.otherAllowances,
  };

  const grossEarnings = basicSalary + totalAllowances;
  const deductions = splitDeductions(basicSalary, grossEarnings, totalDeductions);
  const splitTotal = Object.values(deductions).reduce((sum, value) => sum + value, 0);
  if (splitTotal !== totalDeductions) {
    deductions.otherDeductions += totalDeductions - splitTotal;
  }

  const employerContributions = computeEmployerContributions(basicSalary, grossEarnings);

  return {
    earnings,
    deductions,
    grossEarnings,
    totalDeductions,
    netSalary,
    amountInWords: amountInWordsINR(netSalary),
    employerContributions,
    attendanceSummary,
  };
}
