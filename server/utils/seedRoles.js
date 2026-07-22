const Role = require('../models/Role');
const Permission = require('../models/Permission');

const ROLE_DEFINITIONS = [
  {
    name: 'Admin',
    code: 'admin',
    description: 'Full system administrator',
    permissionCodes: ['admin.all'],
  },
  {
    name: 'HR',
    code: 'hr',
    description: 'Human resources — employee and user management',
    permissionCodes: [
      'hr.access',
      'users.view', 'users.create', 'users.update', 'users.delete',
      'roles.view', 'roles.create', 'roles.update',
      'groups.view', 'groups.create', 'groups.update',
      'permissions.view',
      'compliance.access',
      'compliance.payroll.view', 'compliance.payroll.create', 'compliance.payroll.update', 'compliance.payroll.delete',
      'compliance.epf.view', 'compliance.epf.create', 'compliance.epf.update', 'compliance.epf.delete',
      'compliance.esic.view', 'compliance.esic.create', 'compliance.esic.update', 'compliance.esic.delete',
      'compliance.employees.view', 'compliance.employees.create', 'compliance.employees.update', 'compliance.employees.delete',
      'finance.access',
      'finance.dashboard.view',
      'finance.income.view',
      'finance.expense.view',
      'finance.pnl.view',
      'finance.reports.view',
      'documents.access',
      'documents.full',
    ],
  },
  {
    name: 'Accounts',
    code: 'accounts',
    description: 'Finance and purchasing — sales, purchases, pricing',
    permissionModules: ['purchases', 'purchaseOrders', 'prices', 'sales', 'reports', 'suppliers', 'finance'],
    permissionCodes: [
      'compliance.access',
      'compliance.gst.view', 'compliance.gst.create', 'compliance.gst.update', 'compliance.gst.delete',
      'compliance.tds.view', 'compliance.tds.create', 'compliance.tds.update', 'compliance.tds.delete',
      'compliance.reports.view',
      'finance.access',
      'finance.full',
    ],
  },
  {
    name: 'Warehouse',
    code: 'warehouse',
    description: 'Inventory — product and stock management',
    permissionModules: ['stock', 'products', 'locations', 'shipments', 'shippingCharges', 'shipmentVendors'],
  },
  {
    name: 'Employee',
    code: 'employee',
    description: 'Employee self-service — dashboard, attendance, tasks, leave, personal documents',
    permissionCodes: [
      'documents.access',
      'documents.view',
      'documents.create',
      'documents.upload',
      'documents.update',
      'documents.download',
      'documents.dashboard.view',
      'documents.ai.view',
      'documents.manual.view',
    ],
  },
  {
    name: 'Documents Employee',
    code: 'docs_employee',
    description: 'View/upload employee docs, create personal folders, move files',
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
    name: 'AI Images User',
    code: 'ai_images_user',
    description: 'Browse AI Generated Images, folders, upload from desktop, move images',
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
    name: 'AI Images Creator',
    code: 'ai_images_creator',
    description: 'Image Generator + save to Document Management AI folders',
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
    name: 'Documents Admin',
    code: 'docs_admin',
    description: 'Full Document Management access including settings',
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
    name: 'Master Admin',
    code: 'master_admin',
    description: 'Full access to every Master page',
    permissionCodes: ['master.full'],
  },
  {
    name: 'Master Catalog',
    code: 'master_catalog',
    description: 'Products, Stock, Categories, Subcategories, Vendor Prices',
    permissionCodes: [
      'products.view', 'products.create', 'products.update',
      'stock.view', 'stock.create', 'stock.update',
      'categories.view', 'categories.create', 'categories.update',
      'subcategories.view', 'subcategories.create', 'subcategories.update',
      'prices.view', 'prices.create', 'prices.update',
    ],
  },
  {
    name: 'Master Partners',
    code: 'master_partners',
    description: 'Suppliers, Company Master, Shipment Vendors',
    permissionCodes: [
      'suppliers.view', 'suppliers.create', 'suppliers.update',
      'companyProfile.view', 'companyProfile.update',
      'shipmentVendors.view', 'shipmentVendors.create', 'shipmentVendors.update',
    ],
  },
  {
    name: 'Master Locations',
    code: 'master_locations',
    description: 'Locations, Sales Channels, Sales Locations',
    permissionCodes: [
      'locations.view', 'locations.create', 'locations.update',
      'salesChannels.view', 'salesChannels.create', 'salesChannels.update',
      'salesLocations.view', 'salesLocations.create', 'salesLocations.update',
    ],
  },
  {
    name: 'Compliance Officer',
    code: 'compliance_officer',
    description: 'Full access to Compliance module',
    permissionCodes: ['compliance.access', 'compliance.full'],
    permissionModules: ['compliance'],
  },
  {
    name: 'Management',
    code: 'management',
    description: 'Read-only Compliance & Finance dashboard and reports',
    permissionCodes: [
      'compliance.access',
      'compliance.dashboard.view',
      'compliance.reports.view',
      'finance.access',
      'finance.dashboard.view',
      'finance.reports.view',
      'documents.access',
      'documents.view',
      'documents.download',
      'documents.department.view',
      'documents.dashboard.view',
      'documents.ai.view',
      'documents.manual.view',
      'documents.analytics.view',
    ],
  },
  {
    name: 'Sales Manager',
    code: 'sales_manager',
    description: 'Income reports only in Finance',
    permissionCodes: [
      'finance.access',
      'finance.income.view',
      'sales.view',
      'reports.view',
    ],
  },
];

async function resolvePermissionIds(def, allPermissions) {
  const ids = new Set();

  (def.permissionCodes || []).forEach((code) => {
    const perm = allPermissions.find((p) => p.code === code);
    if (perm) ids.add(String(perm._id));
  });

  (def.permissionModules || []).forEach((moduleName) => {
    allPermissions
      .filter((p) => p.module === moduleName)
      .forEach((p) => ids.add(String(p._id)));
  });

  return Array.from(ids);
}

async function seedRoles() {
  try {
    const allPermissions = await Permission.find().lean();
    let created = 0;
    let updated = 0;

    for (const def of ROLE_DEFINITIONS) {
      const permissionIds = await resolvePermissionIds(def, allPermissions);
      const existing = await Role.findOne({ code: def.code });

      if (!existing) {
        await Role.create({
          name: def.name,
          code: def.code,
          description: def.description,
          permissions: permissionIds,
        });
        created++;
        continue;
      }

      const needsUpdate =
        existing.name !== def.name ||
        existing.description !== def.description ||
        JSON.stringify(existing.permissions.map(String).sort()) !== JSON.stringify(permissionIds.sort());

      if (needsUpdate) {
        existing.name = def.name;
        existing.description = def.description;
        existing.permissions = permissionIds;
        await existing.save();
        updated++;
      }
    }

    return { created, updated, total: ROLE_DEFINITIONS.length };
  } catch (error) {
    console.error('seedRoles error:', error.message);
    throw error;
  }
}

module.exports = { seedRoles, ROLE_DEFINITIONS };
