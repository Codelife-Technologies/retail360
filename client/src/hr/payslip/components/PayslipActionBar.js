import React from 'react';

function PayslipActionBar({ onDownload, onPrint, onEmail, onShare, disabled }) {
  return (
    <div className="payslip-action-bar">
      <button type="button" className="hr-btn hr-btn-primary" onClick={onDownload} disabled={disabled}>
        ⬇️ Download PDF
      </button>
      <button type="button" className="hr-btn hr-btn-secondary" onClick={onPrint} disabled={disabled}>
        🖨️ Print Payslip
      </button>
      <button type="button" className="hr-btn hr-btn-secondary" onClick={onEmail} disabled={disabled}>
        ✉️ Email Payslip
      </button>
      <button type="button" className="hr-btn hr-btn-secondary" onClick={onShare} disabled={disabled}>
        🔗 Share Payslip
      </button>
    </div>
  );
}

export default PayslipActionBar;
