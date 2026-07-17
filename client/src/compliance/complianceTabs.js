export const COMPLIANCE_TABS = [
  { id: 'compliance-dashboard', label: 'Dashboard', icon: '📊', permission: 'compliance.dashboard.view' },
  { id: 'company-information', label: 'Company Information', icon: '🏢', permission: 'compliance.company.view' },
  { id: 'filing-master', label: 'Filing Master', icon: '📋', permission: 'compliance.filingMaster.view' },
  { id: 'filings', label: 'Filings', icon: '📝', permission: 'compliance.filings.view' },
  { id: 'compliance-calendar', label: 'Compliance Calendar', icon: '📅', permission: 'compliance.calendar.view' },
  { id: 'document-repository', label: 'Document Repository', icon: '📁', permission: 'compliance.documents.view' },
  { id: 'compliance-reports', label: 'Reports', icon: '📈', permission: 'compliance.reports.view' },
];

export const COMPLIANCE_TAB_IDS = COMPLIANCE_TABS.map((tab) => tab.id);

export function isComplianceTab(tabId) {
  return COMPLIANCE_TAB_IDS.includes(tabId);
}

export function resolveComplianceSubTab(tabId) {
  if (tabId === 'compliance') return 'compliance-dashboard';
  if (tabId.startsWith('compliance:')) return tabId.slice('compliance:'.length);
  return isComplianceTab(tabId) ? tabId : 'compliance-dashboard';
}

export function filterComplianceTabs(hasPermission, tabs = COMPLIANCE_TABS) {
  if (hasPermission('admin.all') || hasPermission('compliance.full')) {
    return tabs;
  }
  return tabs.filter((tab) => hasPermission(tab.permission));
}
