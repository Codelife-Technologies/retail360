export const FINANCE_TABS = [
  { id: 'finance-dashboard', label: 'Dashboard', icon: '📊', permission: 'finance.dashboard.view' },
  { id: 'income-report', label: 'Income Report', icon: '💰', permission: 'finance.income.view' },
  { id: 'expense-report', label: 'Expense Report', icon: '📉', permission: 'finance.expense.view' },
  { id: 'profit-loss', label: 'Profit & Loss', icon: '📈', permission: 'finance.pnl.view' },
  { id: 'sales-report', label: 'Sales Report', icon: '🛒', permission: 'finance.reports.view' },
  { id: 'purchase-report', label: 'Purchase Report', icon: '📦', permission: 'finance.reports.view' },
  { id: 'finance-reports', label: 'Records', icon: '🧾', permission: 'finance.reports.view' },
];

export const FINANCE_TAB_IDS = FINANCE_TABS.map((tab) => tab.id);

export function isFinanceTab(tabId) {
  return FINANCE_TAB_IDS.includes(tabId);
}

export function resolveFinanceSubTab(tabId) {
  if (tabId === 'finance') return 'finance-dashboard';
  if (tabId.startsWith('finance:')) return tabId.slice('finance:'.length);
  return isFinanceTab(tabId) ? tabId : 'finance-dashboard';
}

export function filterFinanceTabs(hasPermission, tabs = FINANCE_TABS) {
  if (hasPermission('admin.all') || hasPermission('finance.full')) {
    return tabs;
  }
  return tabs.filter((tab) => hasPermission(tab.permission));
}
