import { companyProfileAPI } from '../../../services/api';
import { DEFAULT_BUYER } from '../../../config/buyerCompany';
import { companyProfileToPoDefaults } from '../../../utils/companyProfileUtils';
import {
  hrPayrollAPI,
  hrEmployeesAPI,
  hrAttendanceAPI,
  hrLeavesAPI,
  hrHolidaysAPI,
} from '../../services/hrApi';
import { extractList } from '../../utils/hrUtils';
import { buildPayslipBreakdown, computeAttendanceSummary, maskAccountNumber } from './payslipCalculator';

function monthLabel(month, year) {
  return new Date(year, month - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function payPeriod(month, year) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  const fmt = (d) =>
    d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}`;
}

function resolveCompany(profile) {
  const defaults = companyProfileToPoDefaults(profile) || companyProfileToPoDefaults({});
  const buyer = defaults?.buyer || DEFAULT_BUYER;
  return {
    companyName: buyer.companyName || DEFAULT_BUYER.companyName,
    companyAddress: buyer.registeredAddress || DEFAULT_BUYER.registeredAddress,
    gstNumber: buyer.gstin || DEFAULT_BUYER.gstin,
    cin: profile?.jurisdiction || buyer.pan || DEFAULT_BUYER.pan,
    email: buyer.email || DEFAULT_BUYER.email,
    phone: buyer.contactNumber || DEFAULT_BUYER.contactNumber,
    initials: (buyer.companyName || 'R')
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 3)
      .toUpperCase(),
  };
}

function resolveStatutoryField(employee, field) {
  const value = employee?.statutoryDetails?.[field] ?? employee?.[field];
  return value ? String(value).trim() : '—';
}

function resolvePaymentDetails(payrollRecord, employee) {
  const employeeId = employee?.employeeId || payrollRecord._id?.slice(-6)?.toUpperCase();
  const periodCode = `${payrollRecord.year}${String(payrollRecord.month).padStart(2, '0')}`;
  const hasBank = Boolean(employee?.bankDetails?.accountNumber);

  return {
    paymentDate: payrollRecord.paidAt || null,
    paymentMode: hasBank ? 'NEFT / Bank Transfer' : '—',
    bankReferenceNumber: hasBank ? `PAY-${periodCode}-${employeeId}` : '—',
    transactionId: payrollRecord._id ? `TXN${String(payrollRecord._id).slice(-10).toUpperCase()}` : '—',
    paymentStatus: payrollRecord.paymentStatus || 'Pending',
  };
}

export async function loadPayslipData(payrollRecord, month, year) {
  const payrollId = payrollRecord._id;
  const employeeRef = payrollRecord.employee?._id || payrollRecord.employee;

  const [
    payrollRes,
    employeeRes,
    attendanceRes,
    leavesRes,
    balancesRes,
    holidaysRes,
    companyRes,
  ] = await Promise.all([
    hrPayrollAPI.getById(payrollId),
    employeeRef ? hrEmployeesAPI.getById(employeeRef) : Promise.resolve({ data: payrollRecord.employee }),
    employeeRef
      ? hrAttendanceAPI.getAll({ employee: employeeRef, month, year, limit: 31 })
      : Promise.resolve({ data: [] }),
    employeeRef
      ? hrLeavesAPI.getAll({ employee: employeeRef, limit: 200 })
      : Promise.resolve({ data: [] }),
    employeeRef
      ? hrLeavesAPI.getBalances({ employee: employeeRef, year })
      : Promise.resolve({ data: { balances: [] } }),
    hrHolidaysAPI.getCalendar({ month, year }),
    companyProfileAPI.get(),
  ]);

  const payroll = payrollRes.data || payrollRecord;
  const employee = employeeRes.data || payroll.employee || {};
  const attendanceRecords = extractList(attendanceRes);
  const leaveRecords = extractList(leavesRes);
  const holidays = Array.isArray(holidaysRes.data)
    ? holidaysRes.data
    : holidaysRes.data?.holidays || extractList(holidaysRes);

  const attendanceSummary = computeAttendanceSummary({
    month,
    year,
    attendanceRecords,
    holidays,
    leaveRecords,
  });

  const breakdown = buildPayslipBreakdown(payroll, attendanceSummary);
  const company = resolveCompany(companyRes.data);
  const payment = resolvePaymentDetails(payroll, employee);
  const bank = employee.bankDetails || {};

  return {
    payroll,
    employee,
    company,
    month,
    year,
    payrollMonth: monthLabel(month, year),
    payPeriod: payPeriod(month, year),
    attendanceSummary,
    leaveBalances: balancesRes.data?.balances || [],
    breakdown,
    payment,
    employeeDetails: {
      name: `${employee.firstName || ''} ${employee.lastName || ''}`.trim() || '—',
      employeeId: employee.employeeId || '—',
      department: employee.department || '—',
      designation: employee.designation || '—',
      employmentType: employee.employmentType || '—',
      dateOfJoining: employee.joiningDate || null,
      panNumber: resolveStatutoryField(employee, 'pan'),
      uanNumber: resolveStatutoryField(employee, 'uan'),
      esicNumber: resolveStatutoryField(employee, 'esic'),
      bankName: bank.bankName || '—',
      accountNumber: maskAccountNumber(bank.accountNumber),
      ifscCode: bank.ifscCode || '—',
      email: employee.email || '—',
    },
    generatedAt: new Date(),
  };
}
