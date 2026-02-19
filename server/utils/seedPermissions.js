const Permission = require('../models/Permission');

const PERMISSION_DEFINITIONS = [
  { code: 'admin.all', name: 'Full Admin', module: 'admin', description: 'Full system access' },
  { code: 'products.view', name: 'View Products', module: 'products', description: 'View products' },
  { code: 'products.create', name: 'Create Products', module: 'products', description: 'Create products' },
  { code: 'products.update', name: 'Update Products', module: 'products', description: 'Update products' },
  { code: 'products.delete', name: 'Delete Products', module: 'products', description: 'Delete products' },
  { code: 'categories.view', name: 'View Categories', module: 'categories', description: 'View categories' },
  { code: 'categories.create', name: 'Create Categories', module: 'categories', description: 'Create categories' },
  { code: 'categories.update', name: 'Update Categories', module: 'categories', description: 'Update categories' },
  { code: 'categories.delete', name: 'Delete Categories', module: 'categories', description: 'Delete categories' },
  { code: 'subcategories.view', name: 'View Subcategories', module: 'subcategories', description: 'View subcategories' },
  { code: 'subcategories.create', name: 'Create Subcategories', module: 'subcategories', description: 'Create subcategories' },
  { code: 'subcategories.update', name: 'Update Subcategories', module: 'subcategories', description: 'Update subcategories' },
  { code: 'subcategories.delete', name: 'Delete Subcategories', module: 'subcategories', description: 'Delete subcategories' },
  { code: 'stock.view', name: 'View Stock', module: 'stock', description: 'View stock' },
  { code: 'stock.create', name: 'Create Stock', module: 'stock', description: 'Create stock entries' },
  { code: 'stock.update', name: 'Update Stock', module: 'stock', description: 'Update stock' },
  { code: 'stock.delete', name: 'Delete Stock', module: 'stock', description: 'Delete stock' },
  { code: 'sales.view', name: 'View Sales', module: 'sales', description: 'View sales' },
  { code: 'sales.create', name: 'Create Sales', module: 'sales', description: 'Create sales' },
  { code: 'sales.update', name: 'Update Sales', module: 'sales', description: 'Update sales' },
  { code: 'sales.delete', name: 'Delete Sales', module: 'sales', description: 'Delete sales' },
  { code: 'purchases.view', name: 'View Purchases', module: 'purchases', description: 'View purchases' },
  { code: 'purchases.create', name: 'Create Purchases', module: 'purchases', description: 'Create purchases' },
  { code: 'purchases.update', name: 'Update Purchases', module: 'purchases', description: 'Update purchases' },
  { code: 'purchases.delete', name: 'Delete Purchases', module: 'purchases', description: 'Delete purchases' },
  { code: 'reports.view', name: 'View Reports', module: 'reports', description: 'View reports' },
  { code: 'reports.export', name: 'Export Reports', module: 'reports', description: 'Export reports' },
  { code: 'users.view', name: 'View Users', module: 'users', description: 'View users' },
  { code: 'users.create', name: 'Create Users', module: 'users', description: 'Create users' },
  { code: 'users.update', name: 'Update Users', module: 'users', description: 'Update users' },
  { code: 'users.delete', name: 'Delete Users', module: 'users', description: 'Delete users' },
  { code: 'roles.view', name: 'View Roles', module: 'roles', description: 'View roles' },
  { code: 'roles.create', name: 'Create Roles', module: 'roles', description: 'Create roles' },
  { code: 'roles.update', name: 'Update Roles', module: 'roles', description: 'Update roles' },
  { code: 'roles.delete', name: 'Delete Roles', module: 'roles', description: 'Delete roles' },
  { code: 'groups.view', name: 'View Groups', module: 'groups', description: 'View groups' },
  { code: 'groups.create', name: 'Create Groups', module: 'groups', description: 'Create groups' },
  { code: 'groups.update', name: 'Update Groups', module: 'groups', description: 'Update groups' },
  { code: 'groups.delete', name: 'Delete Groups', module: 'groups', description: 'Delete groups' },
  { code: 'permissions.view', name: 'View Permissions', module: 'permissions', description: 'View permissions' },
  { code: 'permissions.create', name: 'Create Permissions', module: 'permissions', description: 'Create permissions' },
  { code: 'permissions.update', name: 'Update Permissions', module: 'permissions', description: 'Update permissions' },
  { code: 'permissions.delete', name: 'Delete Permissions', module: 'permissions', description: 'Delete permissions' },
  // Additional modules from the ERP
  { code: 'suppliers.view', name: 'View Suppliers', module: 'suppliers', description: 'View suppliers' },
  { code: 'suppliers.create', name: 'Create Suppliers', module: 'suppliers', description: 'Create suppliers' },
  { code: 'suppliers.update', name: 'Update Suppliers', module: 'suppliers', description: 'Update suppliers' },
  { code: 'suppliers.delete', name: 'Delete Suppliers', module: 'suppliers', description: 'Delete suppliers' },
  { code: 'locations.view', name: 'View Locations', module: 'locations', description: 'View locations' },
  { code: 'locations.create', name: 'Create Locations', module: 'locations', description: 'Create locations' },
  { code: 'locations.update', name: 'Update Locations', module: 'locations', description: 'Update locations' },
  { code: 'locations.delete', name: 'Delete Locations', module: 'locations', description: 'Delete locations' },
  { code: 'prices.view', name: 'View Prices', module: 'prices', description: 'View prices' },
  { code: 'prices.create', name: 'Create Prices', module: 'prices', description: 'Create prices' },
  { code: 'prices.update', name: 'Update Prices', module: 'prices', description: 'Update prices' },
  { code: 'prices.delete', name: 'Delete Prices', module: 'prices', description: 'Delete prices' },
  { code: 'priceMasters.view', name: 'View Price Masters', module: 'priceMasters', description: 'View price masters' },
  { code: 'priceMasters.create', name: 'Create Price Masters', module: 'priceMasters', description: 'Create price masters' },
  { code: 'priceMasters.update', name: 'Update Price Masters', module: 'priceMasters', description: 'Update price masters' },
  { code: 'priceMasters.delete', name: 'Delete Price Masters', module: 'priceMasters', description: 'Delete price masters' },
  { code: 'units.view', name: 'View Units', module: 'units', description: 'View units' },
  { code: 'units.create', name: 'Create Units', module: 'units', description: 'Create units' },
  { code: 'units.update', name: 'Update Units', module: 'units', description: 'Update units' },
  { code: 'units.delete', name: 'Delete Units', module: 'units', description: 'Delete units' },
  { code: 'shipments.view', name: 'View Shipments', module: 'shipments', description: 'View shipments' },
  { code: 'shipments.create', name: 'Create Shipments', module: 'shipments', description: 'Create shipments' },
  { code: 'shipments.update', name: 'Update Shipments', module: 'shipments', description: 'Update shipments' },
  { code: 'shipments.delete', name: 'Delete Shipments', module: 'shipments', description: 'Delete shipments' },
  { code: 'gemini.view', name: 'View Image Generator', module: 'gemini', description: 'Access image generator' },
  { code: 'gemini.generate', name: 'Generate Images', module: 'gemini', description: 'Generate images' },
  { code: 'purchaseOrders.view', name: 'View Purchase Orders', module: 'purchaseOrders', description: 'View purchase orders' },
  { code: 'purchaseOrders.create', name: 'Create Purchase Orders', module: 'purchaseOrders', description: 'Create purchase orders' },
  { code: 'purchaseOrders.update', name: 'Update Purchase Orders', module: 'purchaseOrders', description: 'Update purchase orders' },
  { code: 'purchaseOrders.delete', name: 'Delete Purchase Orders', module: 'purchaseOrders', description: 'Delete purchase orders' },
  { code: 'salesChannels.view', name: 'View Sales Channels', module: 'salesChannels', description: 'View sales channels' },
  { code: 'salesChannels.create', name: 'Create Sales Channels', module: 'salesChannels', description: 'Create sales channels' },
  { code: 'salesChannels.update', name: 'Update Sales Channels', module: 'salesChannels', description: 'Update sales channels' },
  { code: 'salesChannels.delete', name: 'Delete Sales Channels', module: 'salesChannels', description: 'Delete sales channels' },
  { code: 'salesLocations.view', name: 'View Sales Locations', module: 'salesLocations', description: 'View sales locations' },
  { code: 'salesLocations.create', name: 'Create Sales Locations', module: 'salesLocations', description: 'Create sales locations' },
  { code: 'salesLocations.update', name: 'Update Sales Locations', module: 'salesLocations', description: 'Update sales locations' },
  { code: 'salesLocations.delete', name: 'Delete Sales Locations', module: 'salesLocations', description: 'Delete sales locations' },
  { code: 'shipmentVendors.view', name: 'View Shipment Vendors', module: 'shipmentVendors', description: 'View shipment vendors' },
  { code: 'shipmentVendors.create', name: 'Create Shipment Vendors', module: 'shipmentVendors', description: 'Create shipment vendors' },
  { code: 'shipmentVendors.update', name: 'Update Shipment Vendors', module: 'shipmentVendors', description: 'Update shipment vendors' },
  { code: 'shipmentVendors.delete', name: 'Delete Shipment Vendors', module: 'shipmentVendors', description: 'Delete shipment vendors' },
  { code: 'shippingCharges.view', name: 'View Shipping Charges', module: 'shippingCharges', description: 'View shipping charges' },
  { code: 'shippingCharges.create', name: 'Create Shipping Charges', module: 'shippingCharges', description: 'Create shipping charges' },
  { code: 'shippingCharges.update', name: 'Update Shipping Charges', module: 'shippingCharges', description: 'Update shipping charges' },
  { code: 'shippingCharges.delete', name: 'Delete Shipping Charges', module: 'shippingCharges', description: 'Delete shipping charges' },
  { code: 'logs.view', name: 'View Logs', module: 'logs', description: 'View logs' },
  { code: 'logs.create', name: 'Create Logs', module: 'logs', description: 'Create log entries (e.g. frontend logging)' },
  { code: 'logs.delete', name: 'Delete Logs', module: 'logs', description: 'Delete logs' },
];

async function seedPermissions() {
  try {
    let created = 0;
    for (const def of PERMISSION_DEFINITIONS) {
      const existing = await Permission.findOne({ code: def.code });
      if (!existing) {
        await Permission.create(def);
        created++;
      }
    }
    return { created, total: PERMISSION_DEFINITIONS.length };
  } catch (error) {
    console.error('seedPermissions error:', error.message);
    throw error;
  }
}

module.exports = { seedPermissions, PERMISSION_DEFINITIONS };
