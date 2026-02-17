const express = require('express');
const router = express.Router();
const multer = require('multer');
const Sale = require('../models/Sale');
const logger = require('../utils/logger');
const { paginate } = require('../utils/pagination');
const { requirePermission } = require('../middleware/auth');

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Helper function to generate sales number
const generateSalesNumber = async () => {
  const count = await Sale.countDocuments();
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `SAL-${year}${month}-${String(count + 1).padStart(5, '0')}`;
};

// GET all sales
router.get('/', requirePermission('sales.view'), async (req, res) => {
  try {
    const { salesChannel, salesLocation, paymentStatus, orderStatus, startDate, endDate, search, page, limit } = req.query;
    const query = {};
    
    if (salesChannel) {
      query.salesChannel = salesChannel;
    }
    
    if (salesLocation) {
      query.salesLocation = salesLocation;
    }
    
    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }
    
    if (orderStatus) {
      query.orderStatus = orderStatus;
    }
    
    if (startDate || endDate) {
      query.salesDate = {};
      if (startDate) {
        query.salesDate.$gte = new Date(startDate);
      }
      if (endDate) {
        query.salesDate.$lte = new Date(endDate);
      }
    }
    
    if (search) {
      query.$or = [
        { salesNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.email': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } }
      ];
    }
    
    // Build base query
    let salesQuery = Sale.find(query);
    
    // Apply populate
    salesQuery = salesQuery
      .populate('salesChannel', 'name code type')
      .populate('salesLocation', 'name code')
      .populate({
        path: 'items.product',
        select: 'name title sku'
      });
    
    // Apply sorting
    salesQuery = salesQuery.sort({ salesDate: -1 });
    
    if (page || limit) {
      // Paginated response
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 25;
      const skip = (pageNum - 1) * limitNum;
      
      const total = await Sale.countDocuments(query);
      const sales = await salesQuery.skip(skip).limit(limitNum);
      
      res.json({
        data: sales,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1
        }
      });
    } else {
      // Non-paginated response - return all sales
      const sales = await salesQuery;
      res.json(sales);
    }
  } catch (error) {
    logger.backend.error('Error fetching sales', { 
      error: error.message, 
      stack: error.stack,
      query: req.query 
    });
    console.error('Sales fetch error:', error);
    res.status(500).json({ error: error.message, details: process.env.NODE_ENV === 'development' ? error.stack : undefined });
  }
});

// GET single sale
router.get('/:id', requirePermission('sales.view'), async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate('salesChannel', 'name code type')
      .populate('salesLocation', 'name code')
      .populate('items.product', 'name title sku');
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    res.json(sale);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create sale
router.post('/', requirePermission('sales.create'), async (req, res) => {
  try {
    // Calculate item totals
    const items = req.body.items.map(item => ({
      ...item,
      total: item.quantity * item.unitPrice
    }));
    
    // Check stock availability before creating sale
    const SalesLocation = require('../models/SalesLocation');
    const Stock = require('../models/Stock');
    
    const salesLocation = await SalesLocation.findById(req.body.salesLocation).populate('location');
    if (!salesLocation || !salesLocation.location) {
      return res.status(400).json({ error: 'Invalid sales location' });
    }
    
    const warehouseLocation = salesLocation.location._id || salesLocation.location;
    
    // Check stock for each item
    for (const item of items) {
      const stock = await Stock.findOne({ product: item.product, location: warehouseLocation });
      if (!stock || stock.quantity < item.quantity) {
        return res.status(400).json({ 
          error: `Insufficient stock for product. Available: ${stock ? stock.quantity : 0}, Required: ${item.quantity}` 
        });
      }
    }
    
    const saleData = {
      ...req.body,
      items,
      salesNumber: await generateSalesNumber()
    };
    
    const sale = new Sale(saleData);
    await sale.save();
    
    const populatedSale = await Sale.findById(sale._id)
      .populate('salesChannel', 'name code type')
      .populate('salesLocation', 'name code')
      .populate('items.product', 'name title sku');
    
    res.status(201).json(populatedSale);
  } catch (error) {
    logger.backend.error('Error creating sale', {
      message: error.message,
      stack: error.stack,
      body: req.body,
      code: error.code
    });
    if (error.code === 11000) {
      res.status(400).json({ error: 'Sales number already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// PUT update sale
router.put('/:id', requirePermission('sales.update'), async (req, res) => {
  try {
    const existingSale = await Sale.findById(req.params.id);
    if (!existingSale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    
    // If items are being updated, handle stock adjustments
    if (req.body.items) {
      const SalesLocation = require('../models/SalesLocation');
      const Stock = require('../models/Stock');
      
      const salesLocation = await SalesLocation.findById(existingSale.salesLocation).populate('location');
      const warehouseLocation = salesLocation.location._id || salesLocation.location;
      
      // Reverse old stock deduction
      for (const item of existingSale.items) {
        await Stock.findOneAndUpdate(
          { product: item.product, location: warehouseLocation },
          { $inc: { quantity: item.quantity } },
          { upsert: false }
        );
      }
      
      // Calculate new item totals
      const newItems = req.body.items.map(item => ({
        ...item,
        total: item.quantity * item.unitPrice
      }));
      
      // Check stock availability for new items
      for (const item of newItems) {
        const stock = await Stock.findOne({ product: item.product, location: warehouseLocation });
        if (!stock || stock.quantity < item.quantity) {
          // Restore old items if new items fail
          for (const oldItem of existingSale.items) {
            await Stock.findOneAndUpdate(
              { product: oldItem.product, location: warehouseLocation },
              { $inc: { quantity: -oldItem.quantity } },
              { upsert: false }
            );
          }
          return res.status(400).json({ 
            error: `Insufficient stock for product. Available: ${stock ? stock.quantity : 0}, Required: ${item.quantity}` 
          });
        }
      }
      
      // Deduct new stock
      for (const item of newItems) {
        await Stock.findOneAndUpdate(
          { product: item.product, location: warehouseLocation },
          { $inc: { quantity: -item.quantity } },
          { upsert: false }
        );
      }
      
      req.body.items = newItems;
    }
    
    const sale = await Sale.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('salesChannel', 'name code type')
      .populate('salesLocation', 'name code')
      .populate('items.product', 'name title sku');
    
    res.json(sale);
  } catch (error) {
    console.error('Error updating sale:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      saleId: req.params.id,
      body: req.body
    });
    res.status(400).json({ error: error.message });
  }
});

// DELETE sale
router.delete('/:id', requirePermission('sales.delete'), async (req, res) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id);
    if (!sale) {
      return res.status(404).json({ error: 'Sale not found' });
    }
    res.json({ message: 'Sale deleted successfully' });
  } catch (error) {
    console.error('Error deleting sale:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      saleId: req.params.id
    });
    res.status(500).json({ error: error.message });
  }
});

// GET sales summary
router.get('/summary/stats', requirePermission('sales.view'), async (req, res) => {
  try {
    const { startDate, endDate, salesChannel } = req.query;
    const query = {};
    
    if (startDate || endDate) {
      query.salesDate = {};
      if (startDate) query.salesDate.$gte = new Date(startDate);
      if (endDate) query.salesDate.$lte = new Date(endDate);
    }
    
    if (salesChannel) {
      query.salesChannel = salesChannel;
    }
    
    const totalSales = await Sale.countDocuments(query);
    const totalRevenue = await Sale.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);
    
    const salesByChannel = await Sale.aggregate([
      { $match: query },
      { $group: { _id: '$salesChannel', count: { $sum: 1 }, revenue: { $sum: '$total' } } },
      { $lookup: { from: 'saleschannels', localField: '_id', foreignField: '_id', as: 'channel' } },
      { $unwind: '$channel' },
      { $project: { channelName: '$channel.name', count: 1, revenue: 1 } }
    ]);
    
    res.json({
      totalSales,
      totalRevenue: totalRevenue[0]?.total || 0,
      salesByChannel
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;

