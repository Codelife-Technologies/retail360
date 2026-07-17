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
      'roles.view', 'groups.view', 'permissions.view',
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
    description: 'Employee self-service — dashboard, attendance, tasks, leave',
    permissionCodes: [],
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
