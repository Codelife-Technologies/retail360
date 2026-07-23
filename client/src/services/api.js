import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.dispatchEvent(new CustomEvent('auth-logout'));
    }
    return Promise.reject(error);
  }
);

// Products API
export const productsAPI = {
  getAll: (params) => api.get('/products', { params }),
  getCount: (params) => api.get('/products/count', { params }),
  getById: (id) => api.get(`/products/${id}`),
  create: (data) => api.post('/products', data),
  update: (id, data) => api.put(`/products/${id}`, data),
  updateSuppliers: (id, suppliers) => api.put(`/products/${id}/suppliers`, { suppliers }),
  delete: (id) => api.delete(`/products/${id}`),
  downloadTemplate: () => api.get('/products/template', { responseType: 'blob' }),
  exportExcel: (params) => api.get('/products/export', { params, responseType: 'blob' }),
  import: (formData) => api.post('/products/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  uploadImages: (id, formData) => {
    const uploadApi = axios.create({
      baseURL: API_BASE_URL,
    });
    return uploadApi.post(`/products/${id}/images`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// Suppliers API
export const suppliersAPI = {
  getAll: (params) => api.get('/suppliers', { params }),
  getById: (id) => api.get(`/suppliers/${id}`),
  getProducts: (id) => api.get(`/suppliers/${id}/products`),
  create: (data) => api.post('/suppliers', data),
  update: (id, data) => api.put(`/suppliers/${id}`, data),
  delete: (id) => api.delete(`/suppliers/${id}`),
  downloadTemplate: () => api.get('/suppliers/template', { responseType: 'blob' }),
  import: (formData) => api.post('/suppliers/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Company master (organisation profile)
export const companyProfileAPI = {
  get: () => api.get('/company-profile'),
  update: (data) => api.put('/company-profile', data),
};

// Purchase Orders API
export const purchaseOrdersAPI = {
  getAll: (params) => api.get('/purchase-orders', { params }),
  getById: (id) => api.get(`/purchase-orders/${id}`),
  create: (data) => api.post('/purchase-orders', data),
  update: (id, data) => api.put(`/purchase-orders/${id}`, data),
  assignVendor: (id, data) => api.post(`/purchase-orders/${id}/assign-vendor`, data),
  delete: (id) => api.delete(`/purchase-orders/${id}`),
};

// Goods Receipt Note (GRN) API
export const grnAPI = {
  getDashboard: () => api.get('/grn/dashboard/stats'),
  getAll: (params) => api.get('/grn', { params }),
  getById: (id) => api.get(`/grn/${id}`),
  createFromPO: (poId, data) => api.post(`/grn/from-po/${poId}`, data),
  create: (data) => api.post('/grn', data),
  update: (id, data) => api.put(`/grn/${id}`, data),
  delete: (id) => api.delete(`/grn/${id}`),
  submitInspection: (id, data) => api.post(`/grn/${id}/submit-inspection`, data),
  close: (id, data) => api.post(`/grn/${id}/close`, data),
  getAudit: (id) => api.get(`/grn/${id}/audit`),
  getPdf: (id) => api.get(`/grn/${id}/pdf`, { responseType: 'text' }),
  threeWayMatch: (id, data) => api.post(`/grn/${id}/three-way-match`, data),
  getReports: () => api.get('/grn/reports/summary'),
  uploadAttachment: (id, formData) =>
    api.post(`/grn/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

export const gisAPI = {
  getAll: (params) => api.get('/gis', { params }),
  getById: (id) => api.get(`/gis/${id}`),
};
export const purchaseRequisitesAPI = {
  getAll: (params) => api.get('/purchase-requisites', { params }),
  getById: (id) => api.get(`/purchase-requisites/${id}`),
  getPoDraft: (id) => api.get(`/purchase-requisites/${id}/po-draft`),
  create: (data) => api.post('/purchase-requisites', data),
  createFromReplenish: (data) => api.post('/purchase-requisites/from-replenish', data),
  addItems: (id, data) => api.post(`/purchase-requisites/${id}/add-items`, data),
  update: (id, data) => api.put(`/purchase-requisites/${id}`, data),
  linkPo: (id, data) => api.post(`/purchase-requisites/${id}/link-po`, data),
  approve: (id, data) => api.post(`/purchase-requisites/${id}/approve`, data),
  delete: (id) => api.delete(`/purchase-requisites/${id}`),
};

// Purchases API
export const purchasesAPI = {
  getAll: (params) => api.get('/purchases', { params }),
  getById: (id) => api.get(`/purchases/${id}`),
  create: (data) => api.post('/purchases', data),
  update: (id, data) => api.put(`/purchases/${id}`, data),
  delete: (id) => api.delete(`/purchases/${id}`),
  downloadTemplate: () => api.get('/purchases/template', { responseType: 'blob' }),
  import: (formData) => api.post('/purchases/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
};

// Locations API
export const locationsAPI = {
  getAll: (params) => api.get('/locations', { params }),
  getHomeBranch: () => api.get('/locations/home-branch'),
  getById: (id) => api.get(`/locations/${id}`),
  create: (data) => api.post('/locations', data),
  update: (id, data) => api.put(`/locations/${id}`, data),
  setHomeBranch: (id) => api.post(`/locations/${id}/home-branch`),
  delete: (id) => api.delete(`/locations/${id}`),
  downloadTemplate: () => api.get('/locations/template', { responseType: 'blob' }),
  import: (formData) => api.post('/locations/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Stock API
export const stockAPI = {
  getAll: (params) => api.get('/stock', { params }),
  getByProduct: (productId) => api.get(`/stock/product/${productId}`),
  getByLocation: (locationId) => api.get(`/stock/location/${locationId}`),
  getSpecific: (productId, locationId) => api.get(`/stock/${productId}/${locationId}`),
  getLowStock: () => api.get('/stock/alerts/low-stock'),
  create: (data) => api.post('/stock', data),
  update: (id, data) => api.put(`/stock/${id}`, data),
  delete: (id) => api.delete(`/stock/${id}`),
  deleteAll: (params) => api.delete('/stock/all', { params: { confirm: 'yes', ...params } }),
  downloadTemplate: () => api.get('/stock/template', { responseType: 'blob' }),
  exportReport: (params) => api.get('/stock/export', { params, responseType: 'blob' }),
  import: (formData) => api.post('/stock/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Prices API
export const pricesAPI = {
  getAll: (params) => api.get('/prices', { params }),
  getVendorCatalog: (params) => api.get('/prices/vendor-catalog', { params }),
  getByProduct: (productId) => api.get(`/prices/product/${productId}`),
  getHistory: (productId) => api.get(`/prices/product/${productId}/history`),
  getBulkCurrent: (productIds, currency) =>
    api.post('/prices/bulk-current', {
      productIds,
      ...(currency ? { currency } : {}),
    }),
  create: (data) => api.post('/prices', data),
  update: (id, data) => api.put(`/prices/${id}`, data),
  delete: (id) => api.delete(`/prices/${id}`),
  bulkUpdate: (prices) => api.post('/prices/bulk', { prices }),
  downloadTemplate: () => api.get('/prices/template', { responseType: 'blob' }),
  import: (formData) => api.post('/prices/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Sales Channels API
export const salesChannelsAPI = {
  getAll: (params) => api.get('/sales-channels', { params }),
  getById: (id) => api.get(`/sales-channels/${id}`),
  create: (data) => api.post('/sales-channels', data),
  update: (id, data) => api.put(`/sales-channels/${id}`, data),
  delete: (id) => api.delete(`/sales-channels/${id}`),
  downloadTemplate: () => api.get('/sales-channels/template', { responseType: 'blob' }),
  import: (formData) => api.post('/sales-channels/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Sales Locations API
export const salesLocationsAPI = {
  getAll: (params) => api.get('/sales-locations', { params }),
  getById: (id) => api.get(`/sales-locations/${id}`),
  getByChannel: (channelId) => api.get(`/sales-locations/channel/${channelId}`),
  create: (data) => api.post('/sales-locations', data),
  update: (id, data) => api.put(`/sales-locations/${id}`, data),
  delete: (id) => api.delete(`/sales-locations/${id}`),
};

// Sales API
export const salesAPI = {
  getAll: (params) => api.get('/sales', { params }),
  getById: (id) => api.get(`/sales/${id}`),
  create: (data) => api.post('/sales', data),
  update: (id, data) => api.put(`/sales/${id}`, data),
  delete: (id) => api.delete(`/sales/${id}`),
  deleteAll: () => api.delete('/sales/all', { params: { confirm: 'yes' } }),
  removeAmazonOrderDuplicates: () => api.post('/sales/remove-amazon-order-duplicates'),
  getSummary: (params) => api.get('/sales/summary/stats', { params }),
  downloadTemplate: () => api.get('/sales/template', { responseType: 'blob' }),
  import: (formData) =>
    api.post('/sales/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// Logs API
export const logsAPI = {
  logFrontend: (data) => api.post('/logs/frontend', data),
  getLogs: (params) => api.get('/logs', { params }),
  clearLogs: (type) => api.delete('/logs', { params: { type } }),
};

// Activity / audit logs API (User Management → Logs)
export const activityLogsAPI = {
  getAll: (params) => api.get('/activity-logs', { params }),
};

// Shipment Vendors API
export const shipmentVendorsAPI = {
  getAll: (params) => api.get('/shipment-vendors', { params }),
  getById: (id) => api.get(`/shipment-vendors/${id}`),
  create: (data) => api.post('/shipment-vendors', data),
  update: (id, data) => api.put(`/shipment-vendors/${id}`, data),
  delete: (id) => api.delete(`/shipment-vendors/${id}`),
  downloadTemplate: () => api.get('/shipment-vendors/template', { responseType: 'blob' }),
  import: (formData) => api.post('/shipment-vendors/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Shipping Charges API
export const shippingChargesAPI = {
  getAll: (params) => api.get('/shipping-charges', { params }),
  getById: (id) => api.get(`/shipping-charges/${id}`),
  getByVendor: (vendorId) => api.get(`/shipping-charges/vendor/${vendorId}`),
  create: (data) => api.post('/shipping-charges', data),
  update: (id, data) => api.put(`/shipping-charges/${id}`, data),
  delete: (id) => api.delete(`/shipping-charges/${id}`),
  calculate: (data) => api.post('/shipping-charges/calculate', data),
};

// Shipments API
export const shipmentsAPI = {
  getAll: (params) => api.get('/shipments', { params }),
  getById: (id) => api.get(`/shipments/${id}`),
  create: (data) => api.post('/shipments', data),
  update: (id, data) => api.put(`/shipments/${id}`, data),
  delete: (id) => api.delete(`/shipments/${id}`),
  calculateCharges: (data) => api.post('/shipments/calculate-charges', data),
  downloadTemplate: () => api.get('/shipments/template', { responseType: 'blob' }),
  import: (formData) => api.post('/shipments/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Categories API
export const categoriesAPI = {
  getAll: (params) => api.get('/categories', { params }),
  getById: (id) => api.get(`/categories/${id}`),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
  delete: (id) => api.delete(`/categories/${id}`),
  getSubcategories: (categoryId) => api.get(`/categories/${categoryId}/subcategories`),
};

// HSN Tax Master API
export const hsnMastersAPI = {
  getAll: (params) => api.get('/hsn-masters', { params }),
  getActive: () => api.get('/hsn-masters/active'),
  getById: (id) => api.get(`/hsn-masters/${id}`),
  getByCode: (code) => api.get(`/hsn-masters/by-code/${encodeURIComponent(code)}`),
  create: (data) => api.post('/hsn-masters', data),
  update: (id, data) => api.put(`/hsn-masters/${id}`, data),
  delete: (id) => api.delete(`/hsn-masters/${id}`),
};

// Subcategories API
export const subcategoriesAPI = {
  getAll: (params) => api.get('/subcategories', { params }),
  getById: (id) => api.get(`/subcategories/${id}`),
  create: (data) => api.post('/subcategories', data),
  update: (id, data) => api.put(`/subcategories/${id}`, data),
  delete: (id) => api.delete(`/subcategories/${id}`),
  getImagePrompts: (id) => api.get(`/subcategories/${id}/image-prompts`),
  updateImagePrompts: (id, data) => api.put(`/subcategories/${id}/image-prompts`, data),
  addImagePrompt: (id, data) => api.post(`/subcategories/${id}/image-prompts`, data),
  deleteImagePrompt: (id, promptId) => api.delete(`/subcategories/${id}/image-prompts/${promptId}`),
};

function createGeminiUploadClient() {
  const uploadApi = axios.create({
    baseURL: API_BASE_URL,
  });
  const token = localStorage.getItem('token');
  if (token) {
    uploadApi.defaults.headers.common.Authorization = `Bearer ${token}`;
  }
  return uploadApi;
}

// Gemini API
export const geminiAPI = {
  generateImages: (formData) => {
    return createGeminiUploadClient().post('/gemini/generate-images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 minutes timeout
    });
  },
  regenerateImage: (formData) => {
    return createGeminiUploadClient().post('/gemini/regenerate-image', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 300000, // 5 minutes timeout
    });
  },
  saveToProduct: (data) => api.post('/gemini/save-to-product', data),
};

// Reports API
export const reportsAPI = {
  // Sales Reports
  getSalesSummary: (params) => api.get('/reports/sales/summary', { params }),
  getSalesDashboard: (params) => api.get('/reports/sales/dashboard', { params }),
  getSalesDetailed: (params) => api.get('/reports/sales/detailed', { params }),
  getSalesStatistics: (params) => api.get('/reports/sales/statistics', { params }),
  getSalesBySku: (params) => api.get('/reports/sales/by-sku', { params }),
  getSalesBusinessReport: (params) => api.get('/reports/sales/business-report', { params }),
  exportSalesBySku: (params) =>
    api.get('/reports/sales/by-sku/export', { params, responseType: 'blob' }),
  exportSalesDetailed: (params) =>
    api.get('/reports/sales/detailed/export', { params, responseType: 'blob' }),
  exportSalesBusinessReport: (params) =>
    api.get('/reports/sales/business-report/export', { params, responseType: 'blob' }),
  exportSalesDashboard: (params) =>
    api.get('/reports/sales/dashboard/export', { params, responseType: 'blob' }),
  exportSales: (data) => api.post('/reports/sales/export', data),
  
  // Purchase Reports
  getPurchasesSummary: (params) => api.get('/reports/purchases/summary', { params }),
  getPurchasesDetailed: (params) => api.get('/reports/purchases/detailed', { params }),
  getPurchasesStatistics: (params) => api.get('/reports/purchases/statistics', { params }),
  exportPurchases: (params) =>
    api.get('/reports/purchases/export', { params, responseType: 'blob' }),
  
  // Replenishment Reports
  getReplenishReport: (params) => api.get('/reports/replenish', { params }),
  exportReplenishReport: (params) =>
    api.get('/reports/replenish/export', { params, responseType: 'blob' }),
};

// Health check
export const healthAPI = {
  check: () => api.get('/health'),
};

// Price Masters API
export const priceMastersAPI = {
  getAll: (params) => api.get('/price-masters', { params }),
  getById: (id) => api.get(`/price-masters/${id}`),
  getByLocation: (locationId) => api.get(`/price-masters/location/${locationId}`),
  lookup: (data) => api.post('/price-masters/lookup', data),
  create: (data) => api.post('/price-masters', data),
  update: (id, data) => api.put(`/price-masters/${id}`, data),
  delete: (id) => api.delete(`/price-masters/${id}`),
};

// Units API
export const unitsAPI = {
  getAll: (params) => api.get('/units', { params }),
  getById: (id) => api.get(`/units/${id}`),
  create: (data) => api.post('/units', data),
  update: (id, data) => api.put(`/units/${id}`, data),
  delete: (id) => api.delete(`/units/${id}`),
};

// Permissions API
export const permissionsAPI = {
  getAll: (params) => api.get('/permissions', { params }),
  getById: (id) => api.get(`/permissions/${id}`),
  create: (data) => api.post('/permissions', data),
  update: (id, data) => api.put(`/permissions/${id}`, data),
  delete: (id) => api.delete(`/permissions/${id}`),
};

// Roles API
export const rolesAPI = {
  getAll: (params) => api.get('/roles', { params }),
  getById: (id) => api.get(`/roles/${id}`),
  create: (data) => api.post('/roles', data),
  update: (id, data) => api.put(`/roles/${id}`, data),
  delete: (id) => api.delete(`/roles/${id}`),
};

// Groups API
export const groupsAPI = {
  getAll: (params) => api.get('/groups', { params }),
  getById: (id) => api.get(`/groups/${id}`),
  create: (data) => api.post('/groups', data),
  update: (id, data) => api.put(`/groups/${id}`, data),
  delete: (id) => api.delete(`/groups/${id}`),
};

// Users API
export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  seed: () => api.post('/auth/seed'),
};

export default api;

