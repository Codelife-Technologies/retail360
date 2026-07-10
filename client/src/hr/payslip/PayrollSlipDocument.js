import React from 'react';
import { formatCurrency, formatDate } from '../utils/hrUtils';
import PayslipInfoGrid from './components/PayslipInfoGrid';
import PayslipLineTable from './components/PayslipLineTable';
import PayslipTooltip from './components/PayslipTooltip';
import PayslipDigitalSeal from './components/PayslipDigitalSeal';

function PayrollSlipDocument({ payslipData }) {
  const { company, employeeDetails, breakdown, payment, payrollMonth, payPeriod, generatedAt, attendanceSummary } =
    payslipData;
  const att = breakdown.attendanceSummary || attendanceSummary || {};

  const earningsLines = [
    { label: 'Basic Salary', amount: breakdown.earnings.basicSalary },
    { label: 'House Rent Allowance', amount: breakdown.earnings.houseRentAllowance },
    { label: 'Dearness Allowance', amount: breakdown.earnings.dearnessAllowance },
    { label: 'Special Allowance', amount: breakdown.earnings.specialAllowance },
    { label: 'Medical Allowance', amount: breakdown.earnings.medicalAllowance },
    { label: 'Travel Allowance', amount: breakdown.earnings.travelAllowance },
    { label: 'Performance Bonus', amount: breakdown.earnings.performanceBonus },
    { label: 'Overtime', amount: breakdown.earnings.overtime },
    { label: 'Other Allowances', amount: breakdown.earnings.otherAllowances },
  ];

  const deductionLines = [
    { label: 'Provident Fund', amount: breakdown.deductions.providentFund },
    { label: 'Employee State Insurance', amount: breakdown.deductions.employeeStateInsurance },
    { label: 'Professional Tax', amount: breakdown.deductions.professionalTax },
    { label: 'Income Tax (TDS)', amount: breakdown.deductions.incomeTax },
    { label: 'Advance Recovery', amount: breakdown.deductions.advanceRecovery },
    { label: 'Loan Recovery', amount: breakdown.deductions.loanRecovery },
    { label: 'Leave Without Pay Deduction', amount: breakdown.deductions.leaveWithoutPayDeduction },
    { label: 'Other Deductions', amount: breakdown.deductions.otherDeductions },
  ];

  return (
    <article className="payslip-document" id="payslip-print-root">
      <header className="payslip-header">
        <div className="payslip-company-block">
          <div className="payslip-logo">{company.initials}</div>
          <div>
            <h1>{company.companyName}</h1>
            <p>{company.companyAddress}</p>
            <p>
              GST: {company.gstNumber} | CIN: {company.cin}
            </p>
          </div>
        </div>
        <div className="payslip-title-block">
          <h2>Salary Payslip</h2>
          <p>{payrollMonth}</p>
          <PayslipTooltip breakdown={breakdown} />
        </div>
      </header>

      <PayslipInfoGrid
        title="Employee Details"
        items={[
          { label: 'Employee Name', value: employeeDetails.name },
          { label: 'Employee ID', value: employeeDetails.employeeId },
          { label: 'Department', value: employeeDetails.department },
          { label: 'Designation', value: employeeDetails.designation },
          { label: 'Employment Type', value: employeeDetails.employmentType },
          { label: 'Date of Joining', value: formatDate(employeeDetails.dateOfJoining) },
          { label: 'PAN Number', value: employeeDetails.panNumber },
          { label: 'UAN Number', value: employeeDetails.uanNumber },
          { label: 'ESIC Number', value: employeeDetails.esicNumber },
          { label: 'Bank Name', value: employeeDetails.bankName },
          { label: 'Account Number', value: employeeDetails.accountNumber },
          { label: 'IFSC Code', value: employeeDetails.ifscCode },
          { label: 'Pay Period', value: payPeriod },
          { label: 'Paid Days', value: att.paidDays },
          { label: 'LOP Days', value: att.lopDays },
        ]}
      />

      <div className="payslip-earnings-deductions">
        <PayslipLineTable
          title="Earnings"
          lines={earningsLines}
          totalLabel="Gross Earnings"
          totalAmount={breakdown.grossEarnings}
        />
        <PayslipLineTable
          title="Deductions"
          lines={deductionLines}
          totalLabel="Total Deductions"
          totalAmount={breakdown.totalDeductions}
        />
      </div>

      <section className="payslip-net-card">
        <div className="payslip-net-row">
          <span>Gross Earnings</span>
          <strong>{formatCurrency(breakdown.grossEarnings)}</strong>
        </div>
        <div className="payslip-net-row">
          <span>Total Deductions</span>
          <strong>{formatCurrency(breakdown.totalDeductions)}</strong>
        </div>
        <div className="payslip-net-final">
          <span>Net Salary</span>
          <strong className="payslip-net-amount">{formatCurrency(breakdown.netSalary)}</strong>
        </div>
        <p className="payslip-words">
          <strong>Amount in Words:</strong> {breakdown.amountInWords}
        </p>
      </section>

      <section className="payslip-card">
        <h3 className="payslip-card-title">Employer Contributions (Informational)</h3>
        <div className="payslip-employer-grid">
          <div>
            <span>Employer PF</span>
            <strong>{formatCurrency(breakdown.employerContributions.employerPf)}</strong>
          </div>
          <div>
            <span>Employer ESI</span>
            <strong>{formatCurrency(breakdown.employerContributions.employerEsi)}</strong>
          </div>
          <div>
            <span>Gratuity</span>
            <strong>{formatCurrency(breakdown.employerContributions.gratuity)}</strong>
          </div>
        </div>
      </section>

      <PayslipInfoGrid
        title="Payment Details"
        items={[
          { label: 'Payment Date', value: payment.paymentDate ? formatDate(payment.paymentDate) : '—' },
          { label: 'Payment Mode', value: payment.paymentMode },
          { label: 'Bank Reference Number', value: payment.bankReferenceNumber },
          { label: 'Transaction ID', value: payment.transactionId },
          { label: 'Payment Status', value: payment.paymentStatus },
        ]}
      />

      <footer className="payslip-footer">
        <div>
          <p>This is a computer-generated payslip and does not require a signature.</p>
          <p>
            Generated Date: {formatDate(generatedAt)} | Generated Time:{' '}
            {generatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </p>
        </div>
        <PayslipDigitalSeal companyName={company.companyName} initials={company.initials} />
      </footer>
    </article>
  );
}

export default PayrollSlipDocument;
