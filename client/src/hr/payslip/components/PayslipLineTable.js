import React from 'react';
import { formatCurrency } from '../../utils/hrUtils';

function PayslipLineTable({ title, lines = [], totalLabel, totalAmount }) {
  return (
    <section className="payslip-card payslip-table-card">
      <h3 className="payslip-card-title">{title}</h3>
      <div className="payslip-table-wrap">
        <table className="payslip-table">
          <thead>
            <tr>
              <th>Component</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.label}>
                <td>{line.label}</td>
                <td className="payslip-amount">{formatCurrency(line.amount)}</td>
              </tr>
            ))}
            <tr className="payslip-total-row">
              <td>{totalLabel}</td>
              <td className="payslip-amount">{formatCurrency(totalAmount)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default PayslipLineTable;
