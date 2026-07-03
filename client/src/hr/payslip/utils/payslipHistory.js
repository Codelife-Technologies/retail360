const STORAGE_KEY = 'retail360_payslip_history';

function readHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, 50)));
}

export function recordPayslipAction({ payrollId, employeeId, action, status = 'completed', meta = {} }) {
  const entry = {
    id: `${payrollId}-${action}-${Date.now()}`,
    payrollId,
    employeeId,
    action,
    status,
    meta,
    timestamp: new Date().toISOString(),
  };
  const history = readHistory();
  writeHistory([entry, ...history]);
  return entry;
}

export function getPayslipHistory(payrollId) {
  return readHistory().filter((entry) => entry.payrollId === payrollId);
}

export function getLatestEmailStatus(payrollId) {
  const emailActions = getPayslipHistory(payrollId).filter((entry) => entry.action === 'email');
  return emailActions[0] || null;
}

export function getDownloadHistory(payrollId) {
  return getPayslipHistory(payrollId).filter((entry) =>
    ['download', 'print', 'share'].includes(entry.action)
  );
}
