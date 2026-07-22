export function getUserRoleCodes(user) {
  const codes = new Set();
  (user?.roles || []).forEach((role) => {
    if (role?.code) codes.add(String(role.code).toLowerCase());
  });
  (user?.groups || []).forEach((group) => {
    (group.roles || []).forEach((role) => {
      if (role?.code) codes.add(String(role.code).toLowerCase());
    });
  });
  return codes;
}

export function hasRole(user, roleCode) {
  return getUserRoleCodes(user).has(String(roleCode).toLowerCase());
}

export function canViewMaster(hasPermission) {
  if (hasPermission('admin.all') || hasPermission('master.full')) {
    return true;
  }
  // Any single Master page .view unlocks the Master folder (tabs still filtered)
  const masterViewCodes = [
    'products.view',
    'stock.view',
    'categories.view',
    'subcategories.view',
    'prices.view',
    'suppliers.view',
    'companyProfile.view',
    'shipmentVendors.view',
    'locations.view',
    'salesChannels.view',
    'salesLocations.view',
  ];
  return masterViewCodes.some((code) => hasPermission(code));
}

export function canEditStockProduct(hasPermission, user) {
  if (hasPermission('admin.all')) return true;
  return hasRole(user, 'warehouse');
}

export function canViewTabWithRoles(hasPermission, user, tab) {
  if (hasPermission('admin.all')) return true;
  if (tab.roles?.length) {
    return tab.roles.some((role) => hasRole(user, role));
  }
  if (!tab.permission) return false;
  return hasPermission(tab.permission);
}

export function filterTabs(hasPermission, user, tabs) {
  return tabs.filter((tab) => canViewTabWithRoles(hasPermission, user, tab));
}

export function filterTabGroups(hasPermission, user, groups) {
  return groups
    .map((group) => ({
      ...group,
      tabs: filterTabs(hasPermission, user, group.tabs),
    }))
    .filter((group) => group.tabs.length > 0);
}
