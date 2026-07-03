import React from 'react';
import { formatDate } from '../../utils/hrUtils';

function PayslipMetaPanel({ downloadHistory = [], emailStatus }) {
  return (
    <aside className="payslip-meta-panel">
      <section className="payslip-meta-card">
        <h4>📥 Download History</h4>
        {downloadHistory.length === 0 ? (
          <p className="payslip-meta-empty">No downloads yet for this payslip.</p>
        ) : (
          <ul>
            {downloadHistory.slice(0, 5).map((entry) => (
              <li key={entry.id}>
                <span className="payslip-meta-action">{entry.action}</span>
                <span className="payslip-meta-time">
                  {formatDate(entry.timestamp)}{' '}
                  {new Date(entry.timestamp).toLocaleTimeString('en-IN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="payslip-meta-card">
        <h4>✉️ Email Status</h4>
        {emailStatus ? (
          <p>
            Last emailed on {formatDate(emailStatus.timestamp)} at{' '}
            {new Date(emailStatus.timestamp).toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        ) : (
          <p className="payslip-meta-empty">Not emailed yet.</p>
        )}
      </section>
    </aside>
  );
}

export default PayslipMetaPanel;
