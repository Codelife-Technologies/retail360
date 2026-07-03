import { formatCurrency, formatDate } from '../../utils/hrUtils';

function esc(value) {
  if (value == null) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtCurrency(value) {
  return formatCurrency(value).replace('₹', 'Rs. ');
}

function infoRows(rows) {
  return rows
    .map(
      (row) => `
      <div class="ps-info-item">
        <span class="ps-info-label">${esc(row.label)}</span>
        <span class="ps-info-value">${esc(row.value)}</span>
      </div>`
    )
    .join('');
}

function lineRows(items) {
  return items
    .map(
      (item) => `
      <tr>
        <td>${esc(item.label)}</td>
        <td class="ps-amount">${esc(fmtCurrency(item.amount))}</td>
      </tr>`
    )
    .join('');
}

export function generatePayslipPrintHtml(payslipData) {
  const { company, employeeDetails, breakdown, payment, payrollMonth, payPeriod, generatedAt } =
    payslipData;
  const att = breakdown.attendanceSummary || payslipData.attendanceSummary || {};
  const generatedDate = formatDate(generatedAt);
  const generatedTime = generatedAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });

  const earnings = [
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

  const deductions = [
    { label: 'Provident Fund', amount: breakdown.deductions.providentFund },
    { label: 'Employee State Insurance', amount: breakdown.deductions.employeeStateInsurance },
    { label: 'Professional Tax', amount: breakdown.deductions.professionalTax },
    { label: 'Income Tax (TDS)', amount: breakdown.deductions.incomeTax },
    { label: 'Advance Recovery', amount: breakdown.deductions.advanceRecovery },
    { label: 'Loan Recovery', amount: breakdown.deductions.loanRecovery },
    { label: 'Leave Without Pay Deduction', amount: breakdown.deductions.leaveWithoutPayDeduction },
    { label: 'Other Deductions', amount: breakdown.deductions.otherDeductions },
  ];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Payslip — ${esc(employeeDetails.name)} — ${esc(payrollMonth)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "Segoe UI", Arial, sans-serif;
      color: #1f2937;
      background: #fff;
      font-size: 11px;
      line-height: 1.45;
    }
    .ps-page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 14mm 12mm;
    }
    .ps-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 12px;
      margin-bottom: 14px;
    }
    .ps-logo {
      width: 56px;
      height: 56px;
      border-radius: 12px;
      background: #2563eb;
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
    }
    .ps-company h1 { margin: 0 0 4px; font-size: 18px; color: #1e3a8a; }
    .ps-company p { margin: 2px 0; color: #4b5563; }
    .ps-title-block { text-align: right; }
    .ps-title-block h2 { margin: 0; color: #2563eb; font-size: 20px; letter-spacing: 0.04em; }
    .ps-title-block p { margin: 4px 0 0; color: #374151; font-weight: 600; }
    .ps-section {
      border: 1px solid #dbeafe;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 12px;
      background: #f8fbff;
    }
    .ps-section h3 {
      margin: 0 0 8px;
      font-size: 12px;
      color: #1e40af;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .ps-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px 12px;
    }
    .ps-info-item { display: flex; flex-direction: column; gap: 2px; }
    .ps-info-label { color: #6b7280; font-size: 10px; text-transform: uppercase; }
    .ps-info-value { color: #111827; font-weight: 600; }
    .ps-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #dbeafe; padding: 6px 8px; }
    th { background: #eff6ff; color: #1e40af; text-align: left; font-size: 10px; text-transform: uppercase; }
    .ps-amount { text-align: right; font-variant-numeric: tabular-nums; }
    .ps-total-row td { background: #eff6ff; font-weight: 700; }
    .ps-net-card {
      border: 2px solid #2563eb;
      border-radius: 10px;
      padding: 14px;
      background: #f0f9ff;
      margin: 14px 0;
    }
    .ps-net-row { display: flex; justify-content: space-between; margin: 4px 0; }
    .ps-net-final {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px dashed #93c5fd;
    }
    .ps-net-final strong { font-size: 22px; color: #15803d; }
    .ps-words { margin-top: 8px; font-style: italic; color: #374151; }
    .ps-employer {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: 12px;
    }
    .ps-employer-item {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 8px;
      background: #fff;
      text-align: center;
    }
    .ps-footer {
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      gap: 16px;
      color: #6b7280;
      font-size: 10px;
    }
    .ps-seal {
      width: 72px;
      height: 72px;
      border: 3px double #2563eb;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-size: 9px;
      color: #1e40af;
      font-weight: 700;
      padding: 8px;
    }
    @media print {
      body { background: #fff; }
      .ps-page { width: auto; min-height: auto; margin: 0; padding: 10mm; }
    }
  </style>
</head>
<body>
  <div class="ps-page">
    <div class="ps-header">
      <div style="display:flex;gap:12px;align-items:flex-start;">
        <div class="ps-logo">${esc(company.initials)}</div>
        <div class="ps-company">
          <h1>${esc(company.companyName)}</h1>
          <p>${esc(company.companyAddress)}</p>
          <p>GST: ${esc(company.gstNumber)} | CIN: ${esc(company.cin)}</p>
        </div>
      </div>
      <div class="ps-title-block">
        <h2>SALARY PAYSLIP</h2>
        <p>${esc(payrollMonth)}</p>
      </div>
    </div>

    <div class="ps-section">
      <h3>Employee Details</h3>
      <div class="ps-grid">
        ${infoRows([
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
          { label: 'Paid Days', value: att.paidDays ?? '—' },
          { label: 'LOP Days', value: att.lopDays ?? '—' },
        ])}
      </div>
    </div>

    <div class="ps-columns">
      <div class="ps-section">
        <h3>Earnings</h3>
        <table>
          <thead><tr><th>Component</th><th>Amount</th></tr></thead>
          <tbody>
            ${lineRows(earnings)}
            <tr class="ps-total-row"><td>Gross Earnings</td><td class="ps-amount">${esc(fmtCurrency(breakdown.grossEarnings))}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="ps-section">
        <h3>Deductions</h3>
        <table>
          <thead><tr><th>Component</th><th>Amount</th></tr></thead>
          <tbody>
            ${lineRows(deductions)}
            <tr class="ps-total-row"><td>Total Deductions</td><td class="ps-amount">${esc(fmtCurrency(breakdown.totalDeductions))}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="ps-net-card">
      <div class="ps-net-row"><span>Gross Earnings</span><strong>${esc(fmtCurrency(breakdown.grossEarnings))}</strong></div>
      <div class="ps-net-row"><span>Total Deductions</span><strong>${esc(fmtCurrency(breakdown.totalDeductions))}</strong></div>
      <div class="ps-net-final">
        <span>Net Salary</span>
        <strong>${esc(fmtCurrency(breakdown.netSalary))}</strong>
      </div>
      <div class="ps-words"><strong>Amount in Words:</strong> ${esc(breakdown.amountInWords)}</div>
    </div>

    <div class="ps-section">
      <h3>Employer Contributions (Informational)</h3>
      <div class="ps-employer">
        <div class="ps-employer-item"><div>Employer PF</div><strong>${esc(fmtCurrency(breakdown.employerContributions.employerPf))}</strong></div>
        <div class="ps-employer-item"><div>Employer ESI</div><strong>${esc(fmtCurrency(breakdown.employerContributions.employerEsi))}</strong></div>
        <div class="ps-employer-item"><div>Gratuity</div><strong>${esc(fmtCurrency(breakdown.employerContributions.gratuity))}</strong></div>
      </div>
    </div>

    <div class="ps-section">
      <h3>Payment Details</h3>
      <div class="ps-grid">
        ${infoRows([
          { label: 'Payment Date', value: payment.paymentDate ? formatDate(payment.paymentDate) : '—' },
          { label: 'Payment Mode', value: payment.paymentMode },
          { label: 'Bank Reference Number', value: payment.bankReferenceNumber },
          { label: 'Transaction ID', value: payment.transactionId },
          { label: 'Payment Status', value: payment.paymentStatus },
        ])}
      </div>
    </div>

    <div class="ps-footer">
      <div>
        <p>This is a computer-generated payslip and does not require a signature.</p>
        <p>Generated Date: ${esc(generatedDate)} | Generated Time: ${esc(generatedTime)}</p>
      </div>
      <div class="ps-seal">DIGITAL<br/>SEAL<br/>${esc(company.initials)}</div>
    </div>
  </div>
</body>
</html>`;
}

export function downloadPayslipHtml(html, fileName) {
  const safeName = String(fileName || 'payslip').replace(/[^\w.-]+/g, '_');
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${safeName}.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function openPayslipPrintWindow(html) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    alert('Please allow pop-ups to print or download the payslip.');
    return null;
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 400);
  return printWindow;
}

export function buildPayslipEmailBody(payslipData) {
  const { employeeDetails, breakdown, payrollMonth } = payslipData;
  return [
    `Dear ${employeeDetails.name},`,
    '',
    `Please find your salary payslip summary for ${payrollMonth}.`,
    '',
    `Gross Earnings: ${formatCurrency(breakdown.grossEarnings)}`,
    `Total Deductions: ${formatCurrency(breakdown.totalDeductions)}`,
    `Net Salary: ${formatCurrency(breakdown.netSalary)}`,
    '',
    `${breakdown.amountInWords}`,
    '',
    'Regards,',
    payslipData.company.companyName,
  ].join('\n');
}

export function buildPayslipFileName(payslipData) {
  return `payslip-${payslipData.employeeDetails.employeeId}-${payslipData.month}-${payslipData.year}`;
}
