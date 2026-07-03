import React from 'react';

function PayslipDigitalSeal({ companyName, initials }) {
  return (
    <div className="payslip-digital-seal" aria-label={`Digital seal for ${companyName}`}>
      <span className="payslip-seal-ring">
        <span className="payslip-seal-text">DIGITAL SEAL</span>
        <strong>{initials}</strong>
      </span>
    </div>
  );
}

export default PayslipDigitalSeal;
