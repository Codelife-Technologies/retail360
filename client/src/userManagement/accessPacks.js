/**
 * Ready-made permission packs for common access needs.
 * Used by Role editor (apply codes) and User Manage Access (select matching roles).
 */

export const ACCESS_PACKS = [
  {
    id: 'employee_docs',
    label: 'Employee Documents',
    description: 'View/upload employee docs, create personal folders, move files',
    roleCode: 'docs_employee',
    roleName: 'Documents Employee',
    permissionCodes: [
      'documents.access',
      'documents.view',
      'documents.create',
      'documents.upload',
      'documents.update',
      'documents.download',
      'documents.dashboard.view',
      'documents.manual.view',
    ],
  },
  {
    id: 'ai_images_view',
    label: 'Product images (view & organize)',
    description: 'Browse Product images, folders, upload from desktop, move images',
    roleCode: 'ai_images_user',
    roleName: 'AI Images User',
    permissionCodes: [
      'documents.access',
      'documents.view',
      'documents.create',
      'documents.upload',
      'documents.update',
      'documents.download',
      'documents.dashboard.view',
      'documents.ai.view',
    ],
  },
  {
    id: 'ai_images_generate',
    label: 'AI Images (generate)',
    description: 'Image Generator + save to Document Management AI folders',
    roleCode: 'ai_images_creator',
    roleName: 'AI Images Creator',
    permissionCodes: [
      'documents.access',
      'documents.view',
      'documents.create',
      'documents.upload',
      'documents.update',
      'documents.download',
      'documents.dashboard.view',
      'documents.ai.view',
      'gemini.view',
      'gemini.generate',
    ],
  },
  {
    id: 'docs_full',
    label: 'Document Management (full)',
    description: 'Full Document Management access including settings',
    roleCode: 'docs_admin',
    roleName: 'Documents Admin',
    permissionCodes: [
      'documents.access',
      'documents.full',
      'documents.view',
      'documents.create',
      'documents.upload',
      'documents.update',
      'documents.delete',
      'documents.download',
      'documents.manage',
      'documents.dashboard.view',
      'documents.ai.view',
      'documents.manual.view',
      'documents.analytics.view',
      'documents.trash.view',
      'documents.settings.view',
      'documents.settings.update',
    ],
  },
  {
    id: 'master_full',
    label: 'Master (all pages)',
    description: 'Full access to every Master page (products, stock, partners, locations, etc.)',
    roleCode: 'master_admin',
    roleName: 'Master Admin',
    permissionCodes: ['master.full'],
  },
  {
    id: 'master_catalog',
    label: 'Master — Catalog only',
    description: 'Products, Stock, Categories, HSN Tax, Subcategories, Vendor Prices',
    roleCode: 'master_catalog',
    roleName: 'Master Catalog',
    permissionCodes: [
      'products.view', 'products.create', 'products.update',
      'stock.view', 'stock.create', 'stock.update',
      'categories.view', 'categories.create', 'categories.update',
      'hsnMasters.view', 'hsnMasters.create', 'hsnMasters.update',
      'subcategories.view', 'subcategories.create', 'subcategories.update',
      'prices.view', 'prices.create', 'prices.update',
    ],
  },
  {
    id: 'master_partners',
    label: 'Master — Partners only',
    description: 'Suppliers, Company Master, Shipment Vendors',
    roleCode: 'master_partners',
    roleName: 'Master Partners',
    permissionCodes: [
      'suppliers.view', 'suppliers.create', 'suppliers.update',
      'companyProfile.view', 'companyProfile.update',
      'shipmentVendors.view', 'shipmentVendors.create', 'shipmentVendors.update',
    ],
  },
  {
    id: 'master_locations_sales',
    label: 'Master — Locations & Sales',
    description: 'Locations, Sales Channels, Sales Locations',
    roleCode: 'master_locations',
    roleName: 'Master Locations',
    permissionCodes: [
      'locations.view', 'locations.create', 'locations.update',
      'salesChannels.view', 'salesChannels.create', 'salesChannels.update',
      'salesLocations.view', 'salesLocations.create', 'salesLocations.update',
    ],
  },
];

export const MODULE_LABELS = {
  admin: 'Admin',
  master: 'Master',
  users: 'Users',
  roles: 'Roles',
  groups: 'Groups',
  permissions: 'Permissions',
  logs: 'Activity Logs',
  products: 'Products (Master)',
  categories: 'Categories (Master)',
  subcategories: 'Subcategories (Master)',
  stock: 'Stock (Master)',
  sales: 'Sales',
  purchases: 'Purchases',
  purchaseOrders: 'Purchase Orders',
  prices: 'Vendor Prices (Master)',
  priceMasters: 'Price Masters',
  units: 'Units',
  reports: 'Reports',
  suppliers: 'Suppliers (Master)',
  companyProfile: 'Company Master',
  locations: 'Locations (Master)',
  salesChannels: 'Sales Channels (Master)',
  salesLocations: 'Sales Locations (Master)',
  shipments: 'Shipments',
  shippingCharges: 'Shipping Charges',
  shipmentVendors: 'Shipment Vendors (Master)',
  finance: 'Finance',
  compliance: 'Compliance',
  documents: 'Document Management',
  gemini: 'AI Image Generator',
  hr: 'HR',
};

export function groupPermissionsByModule(permissions = []) {
  const groups = new Map();
  permissions.forEach((perm) => {
    const moduleKey = perm.module || 'other';
    if (!groups.has(moduleKey)) groups.set(moduleKey, []);
    groups.get(moduleKey).push(perm);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => {
      const la = MODULE_LABELS[a] || a;
      const lb = MODULE_LABELS[b] || b;
      return la.localeCompare(lb);
    })
    .map(([moduleKey, items]) => ({
      moduleKey,
      label: MODULE_LABELS[moduleKey] || moduleKey,
      permissions: items.slice().sort((a, b) => String(a.name || a.code).localeCompare(String(b.name || b.code))),
    }));
}

export function permissionIdsForCodes(permissions = [], codes = []) {
  // Permission.code is stored lowercase in Mongo; packs/UI often use camelCase.
  const wanted = new Set((codes || []).map((c) => String(c || '').toLowerCase()));
  return permissions
    .filter((p) => wanted.has(String(p?.code || '').toLowerCase()))
    .map((p) => p._id || p.id)
    .filter(Boolean);
}

export default ACCESS_PACKS;
