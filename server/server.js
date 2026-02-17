const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Static file serving for uploaded images
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/inventory';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(async () => {
  logger.backend.info('Connected to MongoDB');
  console.log('Connected to MongoDB');
  const { seedPermissions } = require('./utils/seedPermissions');
  const permResult = await seedPermissions();
  if (permResult.created > 0) {
    console.log(`Seed: ${permResult.created} permissions created`);
  }
  const { seedSuperAdmin } = require('./utils/seedAdmin');
  const result = await seedSuperAdmin();
  if (result.skipped) {
    console.log('Seed: users already exist, skipping');
  } else {
    console.log(`Seed: Super admin created - username: ${result.username}, password: ${result.password}`);
  }
  const { seedAmazonMarketplaces } = require('./utils/seedAmazonMarketplaces');
  const mpResult = await seedAmazonMarketplaces();
  if (mpResult.created > 0) {
    console.log(`Seed: ${mpResult.created} Amazon marketplace channels created`);
  }
})
.catch((error) => {
  logger.backend.error('MongoDB connection error', { error: error.message, stack: error.stack });
  console.error('MongoDB connection error:', error);
});

// Import routes
try {
  logger.backend.info('Loading routes...');
  const productsRoutes = require('./routes/products');
  logger.backend.info('Products routes loaded');
  const suppliersRoutes = require('./routes/suppliers');
  logger.backend.info('Suppliers routes loaded');
  const purchaseOrdersRoutes = require('./routes/purchaseOrders');
  logger.backend.info('Purchase orders routes loaded');
  const purchasesRoutes = require('./routes/purchases');
  logger.backend.info('Purchases routes loaded');
  const locationsRoutes = require('./routes/locations');
  logger.backend.info('Locations routes loaded');
  const stockRoutes = require('./routes/stock');
  logger.backend.info('Stock routes loaded');
  const pricesRoutes = require('./routes/prices');
  logger.backend.info('Prices routes loaded');
  const salesChannelsRoutes = require('./routes/salesChannels');
  logger.backend.info('Sales channels routes loaded');
  const salesLocationsRoutes = require('./routes/salesLocations');
  logger.backend.info('Sales locations routes loaded');
  const salesRoutes = require('./routes/sales');
  logger.backend.info('Sales routes loaded');
  const logsRoutes = require('./routes/logs');
  logger.backend.info('Logs routes loaded');
  const shipmentVendorsRoutes = require('./routes/shipmentVendors');
  logger.backend.info('Shipment vendors routes loaded');
  const shippingChargesRoutes = require('./routes/shippingCharges');
  logger.backend.info('Shipping charges routes loaded');
  const shipmentsRoutes = require('./routes/shipments');
  logger.backend.info('Shipments routes loaded');
  const reportsRoutes = require('./routes/reports');
  logger.backend.info('Reports routes loaded');
  const categoriesRoutes = require('./routes/categories');
  logger.backend.info('Categories routes loaded');
  const subcategoriesRoutes = require('./routes/subcategories');
  logger.backend.info('Subcategories routes loaded');
  const geminiRoutes = require('./routes/gemini');
  logger.backend.info('Gemini routes loaded');
  const unitsRoutes = require('./routes/units');
  logger.backend.info('Units routes loaded');
  const permissionsRoutes = require('./routes/permissions');
  logger.backend.info('Permissions routes loaded');
  const rolesRoutes = require('./routes/roles');
  logger.backend.info('Roles routes loaded');
  const groupsRoutes = require('./routes/groups');
  logger.backend.info('Groups routes loaded');
  const usersRoutes = require('./routes/users');
  logger.backend.info('Users routes loaded');
  const authRoutes = require('./routes/auth');
  logger.backend.info('Auth routes loaded');
  const { authenticate } = require('./middleware/auth');

  // Auth routes first (login, seed - no auth required)
  app.use('/api/auth', authRoutes);
  // Protected API routes
  app.use('/api', authenticate);
  app.use('/api/products', productsRoutes);
  app.use('/api/suppliers', suppliersRoutes);
  app.use('/api/purchase-orders', purchaseOrdersRoutes);
  app.use('/api/purchases', purchasesRoutes);
  app.use('/api/locations', locationsRoutes);
  app.use('/api/stock', stockRoutes);
  app.use('/api/prices', pricesRoutes);
  app.use('/api/sales-channels', salesChannelsRoutes);
  app.use('/api/sales-locations', salesLocationsRoutes);
  app.use('/api/sales', salesRoutes);
  app.use('/api/logs', logsRoutes);
  app.use('/api/shipment-vendors', shipmentVendorsRoutes);
  app.use('/api/shipping-charges', shippingChargesRoutes);
  app.use('/api/shipments', shipmentsRoutes);
  app.use('/api/reports', reportsRoutes);
  app.use('/api/categories', categoriesRoutes);
  app.use('/api/subcategories', subcategoriesRoutes);
  app.use('/api/gemini', geminiRoutes);
  app.use('/api/units', unitsRoutes);
  app.use('/api/permissions', permissionsRoutes);
  app.use('/api/roles', rolesRoutes);
  app.use('/api/groups', groupsRoutes);
  app.use('/api/users', usersRoutes);
  
  logger.backend.info('All routes loaded successfully');
  console.log('All routes loaded successfully');
} catch (error) {
  logger.backend.error('Error loading routes', { 
    message: error.message, 
    stack: error.stack 
  });
  console.error('Error loading routes:', error);
  console.error('Error details:', {
    message: error.message,
    stack: error.stack
  });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected' });
});

// 404 handler for undefined routes
app.use((req, res) => {
  logger.backend.warn('Route not found', { method: req.method, url: req.url });
  console.error(`404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ error: 'Route not found', method: req.method, url: req.url });
});

// Global error handler
app.use((err, req, res, next) => {
  logger.backend.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
    body: req.body
  });
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  logger.backend.info('Server started', { port: PORT });
  console.log(`Server is running on port ${PORT}`);
  console.log(`API endpoints available at http://localhost:${PORT}/api`);
  console.log(`Log files location: ${require('path').join(__dirname, 'logs')}`);
});

