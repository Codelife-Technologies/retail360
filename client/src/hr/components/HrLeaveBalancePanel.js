import React, { useState, useEffect } from 'react';
import { hrLeavesAPI } from '../services/hrApi';
import { formatLeaveRemaining } from '../utils/leavePolicies';

function HrLeaveBalancePanel({ employeeId, title = 'Total Leaves Left', compact = false }) {
  const currentYear = new Date().getFullYear();
  const [balances, setBalances] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!employeeId) {
      setBalances([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    hrLeavesAPI
      .getBalances({ employee: employeeId, year: currentYear })
      .then((res) => {
        if (!cancelled) setBalances(res.data?.balances || []);
      })
      .catch(() => {
        if (!cancelled) setBalances([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, currentYear]);

  if (!employeeId) return null;

  if (loading) {
    return (
      <div className={`hr-leave-balance-panel${compact ? ' compact' : ''}`}>
        <p className="hr-loading">Loading leaves left...</p>
      </div>
    );
  }

  if (balances.length === 0) {
    return (
      <div className={`hr-leave-balance-panel${compact ? ' compact' : ''}`}>
        <h3>{title}</h3>
        <p className="hr-empty">No leave balance data available.</p>
      </div>
    );
  }

  return (
    <div className={`hr-leave-balance-panel${compact ? ' compact' : ''}`}>
      <h3>{title} ({currentYear})</h3>
      <div className="hr-leave-balance-grid">
        {balances.map((bal) => (
          <div key={bal.leaveType} className="hr-leave-balance-card">
            <h4>{bal.label}</h4>
            {!bal.unlimited ? (
              <>
                <p>Used: {bal.used} days</p>
                <p>Pending: {bal.pending} days</p>
                <p className="hr-leave-balance-remaining">
                  <strong>Leaves left: {formatLeaveRemaining(bal)}</strong>
                </p>
              </>
            ) : (
              <p className="hr-leave-balance-remaining">Unlimited (with approval)</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default HrLeaveBalancePanel;
