export const DOCUMENTS_TABS = [
  { id: 'documents-dashboard', label: 'Dashboard', icon: '📊', permission: 'documents.dashboard.view' },
  { id: 'ai-generated-images', label: 'AI Generated Images', icon: '🖼️', permission: 'documents.ai.view' },
  { id: 'employee-documents', label: 'Employee Documents', icon: '📁', permission: 'documents.manual.view' },
  { id: 'storage-analytics', label: 'Storage Analytics', icon: '📈', permission: 'documents.analytics.view' },
  { id: 'documents-trash', label: 'Trash', icon: '🗑️', permission: 'documents.trash.view' },
  { id: 'documents-settings', label: 'Settings', icon: '⚙️', permission: 'documents.settings.view' },
];

export const DOCUMENTS_TAB_IDS = DOCUMENTS_TABS.map((tab) => tab.id);

export function isDocumentsTab(tabId) {
  return DOCUMENTS_TAB_IDS.includes(tabId);
}

export function resolveDocumentsSubTab(tabId) {
  if (tabId === 'documents' || tabId === 'document-management') return 'documents-dashboard';
  if (tabId.startsWith('documents:')) return tabId.slice('documents:'.length);
  return isDocumentsTab(tabId) ? tabId : 'documents-dashboard';
}

export function filterDocumentsTabs(hasPermission, tabs = DOCUMENTS_TABS) {
  if (hasPermission('admin.all') || hasPermission('documents.full')) {
    return tabs;
  }
  return tabs.filter((tab) => hasPermission(tab.permission) || hasPermission('documents.view'));
}
