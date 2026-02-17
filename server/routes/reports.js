const express = require('express');
const router = express.Router();
const Sale = require('../models/Sale');
const Purchase = require('../models/Purchase');
const logger = require('../utils/logger');
const { requirePermission } = require('../middleware/auth');

// Helper function to build date query
function buildDateQuery(startDate, endDate) {
  const query = {};
  if (startDate || endDate) {
    query.$gte = startDate ? new Date(startDate) : new Date(0);
    query.$lte = endDate ? new Date(endDate + 'T23:59:59.999Z') : new Date();
  }
  return Object.keys(query).length > 0 ? query : null;
}

// Helper function to group data
function groupData(data, groupBy, dateField = 'salesDate', isSales = true) {
  const grouped = {};
  
  data.forEach(item => {
    let key;
    let displayName;
    const date = new Date(item[dateField]);
    
    switch (groupBy) {
      case 'date':
        key = date.toISOString().split('T')[0];
        displayName = key;
        break;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        key = weekStart.toISOString().split('T')[0];
        displayName = `Week of ${key}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        displayName = key;
        break;
      case 'product':
        item.items.forEach(itemLine => {
          const productId = itemLine.product?._id || itemLine.product;
          const productName = itemLine.product?.name || itemLine.product?.title || 'Unknown';
          if (!grouped[productId]) {
            grouped[productId] = {
              group: productName,
              count: 0,
              revenue: 0,
              itemsSold: 0,
              product: itemLine.product
            };
          }
          grouped[productId].count += 1;
          grouped[productId].revenue += itemLine.total || 0;
          grouped[productId].itemsSold += itemLine.quantity || 0;
        });
        return; // Skip the main grouping for product
      case 'channel':
        if (isSales) {
          key = item.salesChannel?._id || item.salesChannel || 'unknown';
          displayName = item.salesChannel?.name || 'Unknown Channel';
        } else {
          return; // Channel not applicable for purchases
        }
        break;
      case 'location':
        if (isSales) {
          key = item.salesLocation?._id || item.salesLocation || 'unknown';
          displayName = item.salesLocation?.name || 'Unknown Location';
        } else {
          key = item.location?._id || item.location || 'unknown';
          displayName = item.location?.name || 'Unknown Location';
        }
        break;
      case 'supplier':
        if (!isSales) {
          key = item.supplier?._id || item.supplier || 'unknown';
          displayName = item.supplier?.name || 'Unknown Supplier';
        } else {
          return; // Supplier not applicable for sales
        }
        break;
      default:
        key = 'all';
        displayName = 'All';
    }
    
    if (groupBy !== 'product' && (groupBy !== 'channel' || isSales) && (groupBy !== 'supplier' || !isSales)) {
      if (!grouped[key]) {
        grouped[key] = {
          group: displayName || key,
          count: 0,
          revenue: 0, // This will be expenditure for purchases, but keeping name for consistency
          itemsSold: 0
        };
      }
      grouped[key].count += 1;
      grouped[key].revenue += (item.total || 0);
      grouped[key].itemsSold += item.items.reduce((sum, i) => sum + (i.quantity || 0), 0);
    }
  });
  
  return Object.values(grouped);
}

// GET sales summary
router.get('/sales/summary', requirePermission('reports.view'), async (req, res) => {
  try {
    const { startDate, endDate, salesChannel, salesLocation, paymentStatus, orderStatus, groupBy } = req.query;
    const query = {};
    
    if (salesChannel) query.salesChannel = salesChannel;
    if (salesLocation) query.salesLocation = salesLocation;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (orderStatus) query.orderStatus = orderStatus;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.salesDate = dateQuery;
    
    const sales = await Sale.find(query)
      .populate('salesChannel', 'name code')
      .populate('salesLocation', 'name code')
      .populate('items.product', 'name title sku')
      .sort({ salesDate: -1 });
    
    const totalSales = sales.length;
    const totalRevenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
    const totalItemsSold = sales.reduce((sum, s) => 
      sum + s.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0
    );
    
    const groupedData = groupBy ? groupData(sales, groupBy, 'salesDate', true) : [];
    
    // Calculate statistics
    const productMap = {};
    const channelMap = {};
    const paymentStatusBreakdown = { pending: 0, paid: 0, partial: 0 };
    const orderStatusBreakdown = { pending: 0, confirmed: 0, shipped: 0, delivered: 0, cancelled: 0 };
    
    sales.forEach(sale => {
      // Product statistics
      sale.items.forEach(item => {
        const productId = item.product?._id || item.product;
        if (!productMap[productId]) {
          productMap[productId] = {
            product: item.product,
            quantity: 0,
            revenue: 0
          };
        }
        productMap[productId].quantity += item.quantity || 0;
        productMap[productId].revenue += item.total || 0;
      });
      
      // Channel statistics
      const channelId = sale.salesChannel?._id || sale.salesChannel;
      if (!channelMap[channelId]) {
        channelMap[channelId] = {
          channel: sale.salesChannel,
          count: 0,
          revenue: 0
        };
      }
      channelMap[channelId].count += 1;
      channelMap[channelId].revenue += sale.total || 0;
      
      // Status breakdowns
      paymentStatusBreakdown[sale.paymentStatus] = (paymentStatusBreakdown[sale.paymentStatus] || 0) + 1;
      orderStatusBreakdown[sale.orderStatus] = (orderStatusBreakdown[sale.orderStatus] || 0) + 1;
    });
    
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    
    const topChannels = Object.values(channelMap)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
    
    res.json({
      totalSales,
      totalRevenue,
      averageOrderValue,
      totalItemsSold,
      groupedData,
      statistics: {
        topProducts,
        topChannels,
        paymentStatusBreakdown,
        orderStatusBreakdown
      }
    });
  } catch (error) {
    logger.backend.error('Error fetching sales summary', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET sales detailed
router.get('/sales/detailed', requirePermission('reports.view'), async (req, res) => {
  try {
    const { startDate, endDate, salesChannel, salesLocation, paymentStatus, orderStatus } = req.query;
    const query = {};
    
    if (salesChannel) query.salesChannel = salesChannel;
    if (salesLocation) query.salesLocation = salesLocation;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    if (orderStatus) query.orderStatus = orderStatus;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.salesDate = dateQuery;
    
      const { page, limit } = req.query;
      
      if (page || limit) {
        const { paginate } = require('../utils/pagination');
        const result = await paginate(Sale, query, {
          page: page || 1,
          limit: limit || 25,
          sort: { salesDate: -1 },
          populate: [
            { path: 'salesChannel', select: 'name code' },
            { path: 'salesLocation', select: 'name code' },
            { path: 'items.product', select: 'name title sku' }
          ]
        });
        res.json(result);
      } else {
        const sales = await Sale.find(query)
          .populate('salesChannel', 'name code')
          .populate('salesLocation', 'name code')
          .populate('items.product', 'name title sku')
          .sort({ salesDate: -1 });
        res.json(sales);
      }
  } catch (error) {
    logger.backend.error('Error fetching sales detailed', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET sales statistics
router.get('/sales/statistics', requirePermission('reports.view'), async (req, res) => {
  try {
    const { startDate, endDate, salesChannel, salesLocation } = req.query;
    const query = {};
    
    if (salesChannel) query.salesChannel = salesChannel;
    if (salesLocation) query.salesLocation = salesLocation;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.salesDate = dateQuery;
    
    const sales = await Sale.find(query)
      .populate('salesChannel', 'name code')
      .populate('items.product', 'name title sku');
    
    const totalRevenue = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalSales = sales.length;
    const averageOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;
    
    res.json({
      totalRevenue,
      totalSales,
      averageOrderValue
    });
  } catch (error) {
    logger.backend.error('Error fetching sales statistics', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET purchases summary
router.get('/purchases/summary', requirePermission('reports.view'), async (req, res) => {
  try {
    const { startDate, endDate, supplier, location, paymentStatus, groupBy } = req.query;
    const query = {};
    
    if (supplier) query.supplier = supplier;
    if (location) query.location = location;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.purchaseDate = dateQuery;
    
    const purchases = await Purchase.find(query)
      .populate('supplier', 'name')
      .populate('location', 'name code')
      .populate('items.product', 'name sku')
      .sort({ purchaseDate: -1 });
    
    const totalPurchases = purchases.length;
    const totalExpenditure = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
    const averagePurchaseValue = totalPurchases > 0 ? totalExpenditure / totalPurchases : 0;
    const totalItemsPurchased = purchases.reduce((sum, p) => 
      sum + p.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0), 0
    );
    
    const groupedData = groupBy ? groupData(purchases, groupBy, 'purchaseDate', false) : [];
    
    // Calculate statistics
    const productMap = {};
    const supplierMap = {};
    const paymentStatusBreakdown = { pending: 0, paid: 0, partial: 0 };
    
    purchases.forEach(purchase => {
      // Product statistics
      purchase.items.forEach(item => {
        const productId = item.product?._id || item.product;
        if (!productMap[productId]) {
          productMap[productId] = {
            product: item.product,
            quantity: 0,
            expenditure: 0
          };
        }
        productMap[productId].quantity += item.quantity || 0;
        productMap[productId].expenditure += item.total || 0;
      });
      
      // Supplier statistics
      const supplierId = purchase.supplier?._id || purchase.supplier;
      if (!supplierMap[supplierId]) {
        supplierMap[supplierId] = {
          supplier: purchase.supplier,
          count: 0,
          expenditure: 0
        };
      }
      supplierMap[supplierId].count += 1;
      supplierMap[supplierId].expenditure += purchase.total || 0;
      
      // Status breakdown
      paymentStatusBreakdown[purchase.paymentStatus] = (paymentStatusBreakdown[purchase.paymentStatus] || 0) + 1;
    });
    
    const topProducts = Object.values(productMap)
      .sort((a, b) => b.expenditure - a.expenditure)
      .slice(0, 10);
    
    const topSuppliers = Object.values(supplierMap)
      .sort((a, b) => b.expenditure - a.expenditure)
      .slice(0, 10);
    
    res.json({
      totalPurchases,
      totalExpenditure,
      averagePurchaseValue,
      totalItemsPurchased,
      groupedData,
      statistics: {
        topProducts,
        topSuppliers,
        paymentStatusBreakdown
      }
    });
  } catch (error) {
    logger.backend.error('Error fetching purchases summary', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET purchases detailed
router.get('/purchases/detailed', requirePermission('reports.view'), async (req, res) => {
  try {
    const { startDate, endDate, supplier, location, paymentStatus } = req.query;
    const query = {};
    
    if (supplier) query.supplier = supplier;
    if (location) query.location = location;
    if (paymentStatus) query.paymentStatus = paymentStatus;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.purchaseDate = dateQuery;
    
    const purchases = await Purchase.find(query)
      .populate('supplier', 'name')
      .populate('location', 'name code')
      .populate('items.product', 'name sku')
      .sort({ purchaseDate: -1 });
    
    res.json(purchases);
  } catch (error) {
    logger.backend.error('Error fetching purchases detailed', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// GET purchases statistics
router.get('/purchases/statistics', requirePermission('reports.view'), async (req, res) => {
  try {
    const { startDate, endDate, supplier, location } = req.query;
    const query = {};
    
    if (supplier) query.supplier = supplier;
    if (location) query.location = location;
    
    const dateQuery = buildDateQuery(startDate, endDate);
    if (dateQuery) query.purchaseDate = dateQuery;
    
    const purchases = await Purchase.find(query)
      .populate('supplier', 'name');
    
    const totalExpenditure = purchases.reduce((sum, p) => sum + (p.total || 0), 0);
    const totalPurchases = purchases.length;
    const averagePurchaseValue = totalPurchases > 0 ? totalExpenditure / totalPurchases : 0;
    
    res.json({
      totalExpenditure,
      totalPurchases,
      averagePurchaseValue
    });
  } catch (error) {
    logger.backend.error('Error fetching purchases statistics', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST export sales report (placeholder - actual export implementation would require additional libraries)
router.post('/sales/export', requirePermission('reports.export'), async (req, res) => {
  try {
    const { format, filters, view } = req.body;
    // This is a placeholder - actual PDF/Excel export would be implemented here
    res.json({ message: 'Export functionality will be implemented', format, view });
  } catch (error) {
    logger.backend.error('Error exporting sales report', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

// POST export purchases report (placeholder - actual export implementation would require additional libraries)
router.post('/purchases/export', requirePermission('reports.export'), async (req, res) => {
  try {
    const { format, filters, view } = req.body;
    // This is a placeholder - actual PDF/Excel export would be implemented here
    res.json({ message: 'Export functionality will be implemented', format, view });
  } catch (error) {
    logger.backend.error('Error exporting purchases report', { error: error.message, stack: error.stack });
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

