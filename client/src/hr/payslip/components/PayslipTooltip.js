import React, { useState } from 'react';
import { formatCurrency } from '../../utils/hrUtils';

function PayslipTooltip({ breakdown }) {
  const [open, setOpen] = useState(false);

  if (!breakdown) return null;

  const tooltipItems = [
    { label: 'Basic Salary', value: breakdown.earnings.basicSalary },
    { label: 'Total Allowances', value: breakdown.grossEarnings - breakdown.earnings.basicSalary },
    { label: 'Gross Earnings', value: breakdown.grossEarnings },
    { label: 'Total Deductions', value: breakdown.totalDeductions },
    { label: 'Net Salary', value: breakdown.netSalary },
  ];

  return (
    <div className="payslip-tooltip-wrap">
      <button
        type="button"
        className="payslip-tooltip-trigger"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label="Salary breakdown details"
      >
        ℹ️ Salary Breakdown
      </button>
      {open && (
        <div className="payslip-tooltip-panel" role="tooltip">
          <strong>Salary Breakdown</strong>
          <ul>
            {tooltipItems.map((item) => (
              <li key={item.label}>
                <span>{item.label}</span>
                <span>{formatCurrency(item.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default PayslipTooltip;
