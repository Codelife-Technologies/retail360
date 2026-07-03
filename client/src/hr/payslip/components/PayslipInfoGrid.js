import React from 'react';

function PayslipInfoGrid({ title, items = [] }) {
  return (
    <section className="payslip-card">
      {title && <h3 className="payslip-card-title">{title}</h3>}
      <div className="payslip-info-grid">
        {items.map((item) => (
          <div key={item.label} className="payslip-info-item">
            <span className="payslip-info-label">{item.label}</span>
            <span className="payslip-info-value">{item.value ?? '—'}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default PayslipInfoGrid;
