export const PROCUREMENT_GROUPS = [
  {
    label: 'Procurement',
    tabs: [
      { id: 'replenish-report', label: 'Replenish Report', icon: '🔄' },
      { id: 'purchase-requisite', label: 'Purchase Requisition', icon: '📝', shortLabel: 'PR' },
      { id: 'purchase-orders', label: 'Purchase Orders', icon: '📋', shortLabel: 'PO' },
      { id: 'grn', label: 'Goods Receipt Note', icon: '📥', shortLabel: 'GRN' },
      { id: 'purchases', label: 'Purchases', icon: '💰' },
    ],
  },
];

export const PROCUREMENT_TABS = PROCUREMENT_GROUPS.flatMap((group) =>
  group.tabs.map((tab) => ({ ...tab, group: group.label }))
);

export const PROCUREMENT_TAB_IDS = PROCUREMENT_TABS.map((tab) => tab.id);

export function isProcurementTab(tabId) {
  return PROCUREMENT_TAB_IDS.includes(tabId);
}

export function resolveProcurementSubTab(tabId) {
  if (tabId === 'procurement') return 'purchase-requisite';
  if (tabId.startsWith('procurement:')) return tabId.slice('procurement:'.length);
  return isProcurementTab(tabId) ? tabId : 'purchase-requisite';
}
